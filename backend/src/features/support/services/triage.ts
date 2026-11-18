import { prisma } from "../../../database";
import { categoryDepartment, categoryLabel, moduleLabel, type Priority } from "../support-constants";
import { type KbArticle, searchKnowledgeBase } from "./knowledge-base";
import { callLLM, parseJsonLoose } from "./llm";

/**
 * AI support agent: triage (priority, severity, routing) and student-facing
 * replies grounded in the knowledge base.
 *
 * Priority is decided by transparent rules (so it can be explained and
 * audited); an LLM, when available, may refine the summary/subcategory but
 * never invents diagnostics or claims to have checked systems.
 */

interface TriageInput {
	ticketId: string;
	studentId: string;
	category: string;
	affectedModule: string;
	urgency: string;
	title: string;
	description: string;
	examAttemptId: string | null;
}

export interface TriageResult {
	priority: Priority;
	priorityReason: string;
	severity: "critical" | "major" | "moderate" | "minor";
	blocksExam: boolean;
	recurring: boolean;
	subcategory: string | null;
	issueSummary: string;
	department: string;
	requiredExpertise: string[];
	confidence: number;
	generatedBy: "llm" | "rules";
	activeAttemptId: string | null;
}

const has = (text: string, words: string[]) => words.some((w) => text.includes(w));

const EXAM_BLOCK_WORDS = ["can't start", "cannot start", "can not start", "won't start", "wont start", "not starting", "unable to start", "kicked out", "logged out during", "exam paused", "exam stopped", "exam froze", "frozen", "stuck", "can't continue", "cannot continue", "timer", "lost my exam", "submit", "can't submit", "cannot submit"];
const OUTAGE_WORDS = ["everyone", "all students", "whole class", "entire class", "nobody can", "no one can", "server down", "site down", "outage", "not loading for anyone", "all of us", "every student"];
const QUESTION_WORDS = ["how do i", "how to", "where can i", "where do i", "is it possible", "can i ", "what is", "question"];
const SUBCATEGORY_RULES: Array<[string[], string]> = [
	[["permission", "blocked", "not allowed", "denied"], "Permission blocked"],
	[["not detected", "no camera", "black screen", "not found"], "Device not detected"],
	[["password", "forgot", "reset"], "Password reset"],
	[["otp", "code", "verification code"], "Verification code"],
	[["google", "oauth"], "Google sign-in"],
	[["paused", "warning", "flag", "suspended"], "Proctoring intervention"],
	[["disconnect", "offline", "internet", "wifi", "network"], "Connection loss"],
	[["calibrat"], "Calibration failure"],
	[["upload"], "Upload failure"],
	[["download", "open the file", "pdf"], "File access"],
	[["grade", "marks", "score", "result"], "Score query"],
];

export async function triageTicket(input: TriageInput): Promise<TriageResult> {
	const text = `${input.title} ${input.description}`.toLowerCase();
	const reasons: string[] = [];

	// Is the student in an exam right now? (system records, not the student's claim)
	const activeAttempt = await prisma.assessmentAttempt.findFirst({
		where: {
			studentId: input.studentId,
			status: "started",
			...(input.examAttemptId ? { id: input.examAttemptId } : {}),
			startedAt: { gte: new Date(Date.now() - 12 * 3600_000) },
		},
		orderBy: { startedAt: "desc" },
		select: { id: true },
	});
	const examRelated = ["examination", "assessment_quiz", "camera_microphone", "ai_proctoring", "face_verification", "network", "browser_compat"].includes(input.category) || ["examination_portal", "live_proctoring"].includes(input.affectedModule);
	const blocksExam = Boolean(examRelated && (has(text, EXAM_BLOCK_WORDS) || input.urgency === "critical") && (activeAttempt || has(text, ["exam", "test", "quiz", "assessment"])));
	const outage = has(text, OUTAGE_WORDS);

	let priority: Priority;
	if (outage && (examRelated || input.category === "login_auth")) {
		priority = "P1";
		reasons.push("the description indicates many students are affected at once (possible outage)");
	} else if (blocksExam && input.urgency === "critical" && activeAttempt) {
		priority = "P1";
		reasons.push("an active exam attempt is in progress and the student reports they cannot continue");
	} else if (blocksExam || (examRelated && activeAttempt) || (["camera_microphone", "face_verification", "login_auth"].includes(input.category) && ["high", "critical"].includes(input.urgency))) {
		priority = "P2";
		if (blocksExam) reasons.push("the issue appears to block exam participation");
		if (activeAttempt) reasons.push("the student has an exam attempt in progress right now (system record)");
		if (!blocksExam && !activeAttempt) reasons.push(`${categoryLabel(input.category).toLowerCase()} marked ${input.urgency} urgency`);
	} else if (["syllabus_materials", "course_management", "results_grading", "technical", "network", "browser_compat", "account_profile", "student_dashboard"].includes(input.category) || input.urgency === "high" || input.urgency === "medium") {
		priority = "P3";
		reasons.push(`${categoryLabel(input.category)} issue without an active exam impact`);
	} else {
		priority = "P4";
		reasons.push(has(text, QUESTION_WORDS) ? "it reads as a general question or guidance request" : "low urgency with no exam impact");
	}
	if (input.urgency === "low" && priority === "P3" && has(text, QUESTION_WORDS)) {
		priority = "P4";
		reasons.push("downgraded: phrased as a question with low urgency");
	}

	const recentSame = await prisma.supportTicket.count({
		where: { studentId: input.studentId, category: input.category, id: { not: input.ticketId }, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
	});
	const recurring = recentSame > 0;
	if (recurring) reasons.push(`the student raised ${recentSame} similar ticket(s) in the last 30 days`);

	const severity = priority === "P1" ? "critical" : priority === "P2" ? "major" : priority === "P3" ? "moderate" : "minor";
	const subcategory = SUBCATEGORY_RULES.find(([words]) => has(text, words))?.[1] ?? null;
	let issueSummary = `${categoryLabel(input.category)} in ${moduleLabel(input.affectedModule)}: ${input.title}.${blocksExam ? " Student reports it blocks an exam." : ""}`;
	let generatedBy: "llm" | "rules" = "rules";
	let finalSub = subcategory;
	let confidence = 0.7;

	// Optional LLM refinement of summary/subcategory (priority stays rule-based and explainable).
	const llm = parseJsonLoose<{ summary?: string; subcategory?: string; confidence?: number }>(
		await callLLM(
			[
				{
					role: "system",
					content:
						"You summarise student support tickets for a university exam platform. Return JSON {\"summary\": string (max 45 words, factual, only from the ticket text), \"subcategory\": string (2-4 words), \"confidence\": number 0-1}. Never add facts not present in the ticket.",
				},
				{ role: "user", content: `Category: ${categoryLabel(input.category)}\nModule: ${moduleLabel(input.affectedModule)}\nUrgency: ${input.urgency}\nTitle: ${input.title}\nDescription: ${input.description}` },
			],
			{ json: true, timeoutMs: 10000 },
		),
	);
	if (llm?.summary) {
		issueSummary = llm.summary.slice(0, 400);
		finalSub = llm.subcategory?.slice(0, 60) || subcategory;
		confidence = Math.max(0.5, Math.min(0.95, Number(llm.confidence) || 0.8));
		generatedBy = "llm";
	}

	return {
		priority,
		priorityReason: `${priority} because ${reasons.join("; ")}.`,
		severity,
		blocksExam,
		recurring,
		subcategory: finalSub,
		issueSummary,
		department: categoryDepartment(input.category),
		requiredExpertise: [input.category],
		confidence,
		generatedBy,
		activeAttemptId: activeAttempt?.id ?? null,
	};
}

// ------------------------------------------------------------- student-facing AI replies
const FOLLOW_UPS: Record<string, string[]> = {
	camera_microphone: ["Which browser and device are you using?", "Does the browser show the camera as blocked in the address bar?"],
	ai_proctoring: ["Which exam was it, and roughly what time did the warning or pause happen?"],
	examination: ["Which exam is it, and what exactly happens when you try (any error message)?"],
	assessment_quiz: ["Which assessment and question is affected?"],
	login_auth: ["Which sign-in method are you using (email/password or Google), and what message do you see?"],
	face_verification: ["Is it the face check or the calibration step that fails, and what message appears?"],
	network: ["Are you on Wi-Fi or mobile data, and did the page show an offline banner?"],
	browser_compat: ["Which browser and version are you using?"],
	results_grading: ["Which assessment's result are you asking about?"],
	syllabus_materials: ["Which course and which material is affected?"],
};

const AI_RULES =
	"You are the IntegrityOS AI Support Assistant for a university online-exam platform. Rules: (1) Base troubleshooting ONLY on the provided knowledge-base articles; if they don't cover it, say a support representative will help. (2) Never claim you checked logs, systems, accounts or exam data — you cannot access them. (3) Never promise grade changes, extensions, unpausing or resolution — faculty and staff decide. (4) Never ask for passwords or codes. (5) Be concise and kind: max ~130 words, numbered steps where useful, end with one follow-up question if information is missing. (6) Plain text, no markdown headings.";

function kbContext(articles: KbArticle[]): string {
	return articles.map((a, i) => `[${i + 1}] ${a.title}\n${a.body}`).join("\n\n");
}

function fallbackReply(params: { firstName: string; category: string; articles: KbArticle[]; priority: Priority; queueNote: string }): string {
	const top = params.articles[0];
	const steps = top ? top.body.split("\n").filter(Boolean).slice(0, 5).join("\n") : "";
	const ask = FOLLOW_UPS[params.category]?.[0];
	return [
		`Hi ${params.firstName}, thanks for contacting IntegrityOS support. I'm the AI support assistant and I've logged your ticket (${params.priority}).`,
		top ? `Here is the approved guidance for this kind of issue ("${top.title}"):\n${steps}` : "A support representative will review your issue.",
		ask ? `To help us faster: ${ask}` : "",
		params.queueNote,
	]
		.filter(Boolean)
		.join("\n\n");
}

export async function generateFirstResponse(params: { studentName: string; category: string; title: string; description: string; priority: Priority; queueNote: string }): Promise<{ text: string; articles: KbArticle[] }> {
	const articles = await searchKnowledgeBase({ q: `${params.title} ${params.description}`, category: params.category, includeInternal: false, limit: 3 });
	const firstName = params.studentName.split(" ")[0] || "there";
	const llm = await callLLM([
		{ role: "system", content: AI_RULES },
		{
			role: "user",
			content: `Knowledge base:\n${kbContext(articles) || "(no matching article)"}\n\nNew ticket from ${firstName} (category: ${categoryLabel(params.category)}, priority ${params.priority}).\nTitle: ${params.title}\nDescription: ${params.description}\n\nWrite the first reply: acknowledge, give the relevant documented steps, ask one follow-up question if needed. Then add this sentence verbatim at the end: "${params.queueNote}"`,
		},
	]);
	return { text: llm ?? fallbackReply({ firstName, category: params.category, articles, priority: params.priority, queueNote: params.queueNote }), articles };
}

export async function generateFollowUpReply(params: {
	category: string;
	history: Array<{ role: "student" | "ai" | "agent" | "system"; content: string }>;
	studentMessage: string;
}): Promise<string> {
	const articles = await searchKnowledgeBase({ q: params.studentMessage, category: params.category, includeInternal: false, limit: 3 });
	const transcript = params.history.slice(-10).map((m) => `${m.role === "student" ? "Student" : m.role === "ai" ? "Assistant" : m.role === "agent" ? "Support agent" : "System"}: ${m.content}`).join("\n");
	const llm = await callLLM([
		{ role: "system", content: `${AI_RULES} (7) If the student says the issue is fixed, thank them and tell them they can press "My issue is solved"; never mark it solved yourself. (8) If they are still stuck after the documented steps, tell them a support representative will take over shortly.` },
		{ role: "user", content: `Knowledge base:\n${kbContext(articles) || "(no matching article)"}\n\nConversation so far:\n${transcript}\n\nStudent's new message: ${params.studentMessage}\n\nReply as the assistant.` },
	]);
	if (llm) return llm;
	const solved = /\b(fixed|solved|works now|working now|resolved|thank you|thanks)\b/i.test(params.studentMessage);
	if (solved) return "Glad to hear that! If everything is working, you can press \"My issue is solved\" to close this ticket. If anything comes up again, just reply here.";
	const top = articles[0];
	return top
		? `Thanks for the details. Based on "${top.title}":\n${top.body.split("\n").filter(Boolean).slice(0, 4).join("\n")}\n\nIf this doesn't help, a support representative will take over shortly — your conversation so far will be passed on, so you won't need to repeat anything.`
		: "Thanks for the details — I've added them to your ticket. A support representative will take over shortly and will see everything you've written, so you won't need to repeat anything.";
}
