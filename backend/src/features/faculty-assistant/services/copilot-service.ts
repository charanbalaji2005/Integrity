import { z } from "zod";
import { env } from "@/config/env";
import { HTTP_STATUS } from "@/constants/http-status";
import { prisma } from "@/database";
import { GROQ_MODELS, type GroqMessage, groqChat, groqStream, moderate } from "@/services/groq";
import { AppError } from "@/utils/app-error";
import { AGENTS, type AgentId, type DataNeed, planTurn } from "./agents";
import { loadAttachments } from "./attachments";
import {
	answerSimilarity,
	attemptInvestigation,
	findMentionedStudent,
	courseKnowledge,
	examOverview,
	integrityOverview,
	listOwnAssessments,
	liveStatus,
	performance,
	resolveAssessment,
	type ToolUser,
} from "./data-tools";
import type { FacultyIdentity } from "./faculty-assistant-service";

export const sendMessageSchema = z.object({
	content: z.string().trim().min(1, "Type a message").max(8000),
	attachmentIds: z.array(z.string().max(40)).max(5).default([]),
	assessmentId: z.string().max(40).nullable().optional(),
});
export const renameSchema = z.object({ title: z.string().trim().min(1).max(80) });
export const createConversationSchema = z.object({ assessmentId: z.string().max(40).nullable().optional() });

export type CopilotUser = FacultyIdentity & ToolUser;

export interface TurnEvents {
	status: (step: { id: string; label: string; state: "running" | "done" | "error"; detail?: string }) => void;
	agent: (info: { id: AgentId; name: string; routedBy: string }) => void;
	delta: (text: string) => void;
}

/* ───────────────────────── conversations ───────────────────────── */

async function ownConversation(userId: string, id: string) {
	const c = await prisma.assistantConversation.findFirst({ where: { id, userId } });
	if (!c) throw new AppError("Conversation not found.", HTTP_STATUS.NOT_FOUND);
	return c;
}

export async function listConversations(userId: string, q?: string) {
	const search = q?.trim();
	return prisma.assistantConversation.findMany({
		where: {
			userId,
			...(search
				? { OR: [{ title: { contains: search, mode: "insensitive" } }, { messages: { some: { content: { contains: search, mode: "insensitive" } } } }] }
				: {}),
		},
		orderBy: { updatedAt: "desc" },
		take: 100,
		select: { id: true, title: true, assessmentId: true, updatedAt: true, _count: { select: { messages: true } } },
	});
}

export async function createConversation(userId: string, assessmentId?: string | null) {
	if (assessmentId) {
		const owned = await prisma.assessment.count({ where: { id: assessmentId, facultyId: userId } });
		if (!owned) throw new AppError("Assessment not found.", HTTP_STATUS.NOT_FOUND);
	}
	return prisma.assistantConversation.create({ data: { userId, assessmentId: assessmentId || null } });
}

export async function getConversation(userId: string, id: string) {
	await ownConversation(userId, id);
	return prisma.assistantConversation.findUnique({
		where: { id },
		include: {
			messages: { orderBy: { createdAt: "asc" } },
			attachments: { select: { id: true, fileName: true, kind: true, sizeBytes: true, truncated: true } },
		},
	});
}

export async function renameConversation(userId: string, id: string, title: string) {
	await ownConversation(userId, id);
	return prisma.assistantConversation.update({ where: { id }, data: { title } });
}

export async function setConversationAssessment(userId: string, id: string, assessmentId: string | null) {
	await ownConversation(userId, id);
	if (assessmentId) {
		const owned = await prisma.assessment.count({ where: { id: assessmentId, facultyId: userId } });
		if (!owned) throw new AppError("Assessment not found.", HTTP_STATUS.NOT_FOUND);
	}
	return prisma.assistantConversation.update({ where: { id }, data: { assessmentId } });
}

export async function deleteConversation(userId: string, id: string) {
	await ownConversation(userId, id);
	await prisma.assistantConversation.delete({ where: { id } });
}

/* ───────────────────────── a turn ───────────────────────── */

function basePrompt(user: CopilotUser) {
	return [
		"You are Vigil, the faculty examination copilot inside AssessmentOS / IntegrityOS (exam creation, proctoring, grading).",
		`You are helping ${user.name}${user.department ? `, ${user.department} faculty` : ""}${user.institutionName ? ` at ${user.institutionName}` : ""}.`,
		"The user is a verified faculty member. Explaining how students attempt to cheat in proctored exams and how to detect and fairly review it is legitimate;",
		"never help anyone cheat or evade proctoring.",
		"Ground answers in the DATA and DOCUMENTS sections when present; never invent students, scores, alerts or dates. If data is missing, say what is missing.",
		"Use markdown: short headings, bullet lists and tables. Be concise and practical.",
	].join(" ");
}

const MAX_CONTEXT = 28_000;
const cap = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}\n…[truncated]` : s);

export async function runTurn(
	user: CopilotUser,
	conversationId: string,
	input: { content: string; attachmentIds: string[]; assessmentId?: string | null; regenerate?: boolean },
	events: TurnEvents,
	signal: AbortSignal,
) {
	const convo = await ownConversation(user.id, conversationId);
	const pinnedId = input.assessmentId !== undefined ? input.assessmentId : convo.assessmentId;
	if (input.assessmentId !== undefined && input.assessmentId !== convo.assessmentId) {
		await setConversationAssessment(user.id, conversationId, input.assessmentId);
	}

	// History (before this turn).
	const history = await prisma.assistantMessage.findMany({
		where: { conversationId },
		orderBy: { createdAt: "asc" },
		select: { id: true, role: true, content: true, meta: true },
	});

	let userText = input.content;
	let attachmentIds = input.attachmentIds;
	if (input.regenerate) {
		// Drop the last assistant reply and answer the last user message again.
		const lastUser = [...history].reverse().find((m) => m.role === "user");
		if (!lastUser) throw new AppError("Nothing to regenerate.", HTTP_STATUS.BAD_REQUEST);
		const lastAssistant = history.at(-1)?.role === "assistant" ? history.at(-1) : null;
		if (lastAssistant) await prisma.assistantMessage.delete({ where: { id: lastAssistant.id } });
		userText = lastUser.content;
		attachmentIds = (JSON.parse(lastUser.meta || "{}").attachmentIds as string[] | undefined) ?? [];
		history.splice(history.indexOf(lastUser));
	} else {
		await prisma.assistantMessage.create({
			data: { conversationId, role: "user", content: userText, meta: JSON.stringify({ attachmentIds }) },
		});
		if (attachmentIds.length) {
			await prisma.assistantAttachment.updateMany({ where: { id: { in: attachmentIds }, userId: user.id }, data: { conversationId } });
		}
	}

	const steps: { id: string; label: string; state: string; detail?: string }[] = [];
	const step = (s: { id: string; label: string; state: "running" | "done" | "error"; detail?: string }) => {
		const i = steps.findIndex((x) => x.id === s.id);
		if (i >= 0) steps[i] = s;
		else steps.push(s);
		events.status(s);
	};

	// 1. Safety screen
	step({ id: "safety", label: "Safety check", state: "running" });
	const verdict = await moderate(userText, "faculty");
	if (verdict.flagged) {
		step({ id: "safety", label: "Safety check", state: "error", detail: verdict.category });
		const reply = `I can't help with that request (${verdict.category}). I'm happy to help with questions, rubrics, analytics or reviewing integrity evidence fairly.`;
		events.delta(reply);
		const saved = await prisma.assistantMessage.create({
			data: { conversationId, role: "assistant", content: reply, agent: null, meta: JSON.stringify({ steps, model: GROQ_MODELS.safety }) },
		});
		await prisma.assistantConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
		return { messageId: saved.id, agent: null, suggestions: [] as string[] };
	}
	step({ id: "safety", label: "Safety check", state: "done" });

	// 2. Orchestrate
	step({ id: "route", label: "Vigil Orchestrator", state: "running", detail: "Understanding your request" });
	const attachments = await loadAttachments(user.id, attachmentIds);
	const assessments = await listOwnAssessments(user);
	const pinned = pinnedId ? assessments.find((a) => a.id === pinnedId) : null;
	const plan = await planTurn({
		message: userText,
		history: history.map((m) => ({ role: m.role, content: m.content })),
		hasAttachments: attachments.length > 0,
		pinnedAssessment: pinned?.title ?? null,
		assessmentTitles: assessments.map((a) => a.title),
	});
	const agent = AGENTS[plan.agent];
	step({ id: "route", label: "Vigil Orchestrator", state: "done", detail: `Delegated to ${agent.name}` });
	events.agent({ id: agent.id, name: agent.name, routedBy: plan.routedBy });

	// 3. Authorized data
	const data: Record<string, unknown> = {};
	const sources: string[] = [];
	const needsExam: DataNeed[] = ["overview", "performance", "integrity", "student", "live", "similarity", "course"];
	const wantsExam = plan.needs.some((n) => needsExam.includes(n));
	const target = wantsExam ? await resolveAssessment(user, plan.assessmentRef, pinnedId ?? null, true) : null;
	const run = async (id: DataNeed, label: string, fn: () => Promise<unknown>, describe: (v: any) => string) => {
		step({ id: `data-${id}`, label, state: "running" });
		try {
			const v = await fn();
			if (v == null) {
				step({ id: `data-${id}`, label, state: "error", detail: "No data available" });
				return;
			}
			data[id] = v;
			sources.push(label);
			step({ id: `data-${id}`, label, state: "done", detail: describe(v) });
		} catch (err) {
			console.warn(`[Vigil] tool ${id} failed:`, err);
			step({ id: `data-${id}`, label, state: "error", detail: "Could not load" });
		}
	};
	if (plan.needs.includes("list") || (wantsExam && !target)) {
		data.myAssessments = assessments;
		sources.push("Your assessments");
	}
	if (target && !plan.studentRef && ["integrity", "grading", "analytics"].includes(plan.agent)) {
		// Router missed a named student — look for one of this exam's students in the message.
		const named = await findMentionedStudent(user, target.id, userText);
		if (named) {
			plan.studentRef = named;
			if (!plan.needs.includes("student")) plan.needs.push("student");
		}
	}
	if (target) {
		data.assessment = { id: target.id, title: target.title };
		for (const need of plan.needs) {
			if (need === "overview") await run(need, "Exam configuration", () => examOverview(target.id), (v) => `${v.questions.length} questions · ${v.publishBlockers.length} blockers`);
			if (need === "performance") await run(need, "Analytics Agent · results", () => performance(user, target.id), (v) => `${v.submissions} submissions analysed`);
			if (need === "integrity") await run(need, "Integrity Agent · alerts", () => integrityOverview(user, target.id), (v) => `${v.attempts} sessions · ${Object.values(v.alertsByType as Record<string, number>).reduce((s, n) => s + n, 0)} alerts`);
			if (need === "student" && plan.studentRef) await run(need, "Session investigation", () => attemptInvestigation(user, target.id, plan.studentRef as string), (v) => (v.found ? `${v.timeline.length} timeline events for ${v.student}` : "Student not found"));
			if (need === "live") await run(need, "Live exam status", () => liveStatus(user, target.id), (v) => `${v.inProgress} in progress · ${v.online} online`);
			if (need === "similarity") await run(need, "Answer similarity scan", () => answerSimilarity(user, target.id), (v) => `${v.similarPairs.length} similar pairs`);
			if (need === "course") await run(need, "Course knowledge base", () => courseKnowledge(target.id), (v) => `${v.syllabus.length} units · ${v.documentExcerpts.length} documents`);
		}
	}
	if (attachments.length) {
		step({ id: "docs", label: "Document Agent · reading files", state: "done", detail: attachments.map((a) => a.fileName).join(", ") });
		sources.push(...attachments.map((a) => a.fileName));
	}

	// 4. Generate (streamed)
	step({ id: "generate", label: `${agent.name} is responding`, state: "running" });
	const docBudget = Math.max(6000, Math.floor((MAX_CONTEXT - JSON.stringify(data).length) / Math.max(1, attachments.length)));
	const system = [
		basePrompt(user),
		agent.prompt,
		`Today is ${new Date().toISOString().slice(0, 10)}.`,
		Object.keys(data).length ? `DATA (authorized, from AssessmentOS; scoped to this faculty member's exams and sections):\n${cap(JSON.stringify(data), MAX_CONTEXT)}` : "DATA: none loaded for this request.",
		...attachments.map((a) => `DOCUMENT "${a.fileName}" (${a.kind}${a.truncated ? ", truncated" : ""}):\n${cap(a.extractedText, docBudget)}`),
	].join("\n\n");
	const messages: GroqMessage[] = [
		{ role: "system", content: system },
		...history.slice(-12).map((m) => ({ role: m.role as "user" | "assistant", content: cap(m.content, 6000) })),
		{ role: "user", content: userText },
	];

	let model = GROQ_MODELS.reasoning;
	let reply = await groqStream({ role: "reasoning", messages, temperature: 0.35, maxTokens: 4000, reasoningEffort: "medium", signal }, events.delta);
	if (!reply && !signal.aborted) {
		reply = await groqChat({ role: "fast", messages, temperature: 0.35, maxTokens: 3000, timeoutMs: 60000 });
		model = GROQ_MODELS.fast;
		if (reply) events.delta(reply);
	}
	if (!reply && !signal.aborted) {
		reply = await callOllama(messages);
		model = env.OLLAMA_CHAT_MODEL;
		if (reply) events.delta(reply);
	}
	if (!reply) {
		step({ id: "generate", label: `${agent.name} is responding`, state: "error" });
		throw new AppError(signal.aborted ? "Generation stopped." : "The AI assistant is unavailable right now. Please try again shortly.", HTTP_STATUS.SERVICE_UNAVAILABLE);
	}
	if (signal.aborted) reply = `${reply}\n\n_(stopped)_`;
	step({ id: "generate", label: `${agent.name} is responding`, state: "done" });

	const saved = await prisma.assistantMessage.create({
		data: {
			conversationId,
			role: "assistant",
			content: reply,
			agent: agent.id,
			meta: JSON.stringify({ steps, model, sources, routedBy: plan.routedBy, assessment: target?.title ?? null }),
		},
	});
	const needsTitle = convo.title === "New conversation";
	await prisma.assistantConversation.update({
		where: { id: conversationId },
		data: {
			updatedAt: new Date(),
			...(needsTitle ? { title: plan.title || userText.replace(/\s+/g, " ").slice(0, 60) } : {}),
		},
	});
	return { messageId: saved.id, agent: agent.id, suggestions: agent.followUps, title: needsTitle ? plan.title || userText.slice(0, 60) : undefined };
}

async function callOllama(messages: GroqMessage[]): Promise<string | null> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 60000);
	try {
		const res = await fetch(`${env.OLLAMA_BASE_URL.replace(/\/$/, "")}/api/chat`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ model: env.OLLAMA_CHAT_MODEL, messages, stream: false }),
			signal: controller.signal,
		});
		if (!res.ok) return null;
		const data = (await res.json()) as { message?: { content?: unknown } };
		const c = data.message?.content;
		return typeof c === "string" && c.trim() ? c.trim() : null;
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}
