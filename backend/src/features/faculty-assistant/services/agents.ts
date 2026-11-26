import { GROQ_MODELS, groqChat, parseJsonReply } from "@/services/groq";

export type AgentId = "question" | "integrity" | "analytics" | "grading" | "document" | "academic";
export type DataNeed =
	| "overview"
	| "performance"
	| "integrity"
	| "student"
	| "live"
	| "similarity"
	| "course"
	| "list";

export interface AgentDef {
	id: AgentId;
	name: string;
	purpose: string;
	prompt: string;
	followUps: string[];
}

const QUESTION_BLOCK = [
	"When you create exam questions, ALSO append one fenced block at the very end, exactly:",
	"```vigil-questions",
	'[{"type":"multiple-choice|multiple-select|true-false|short-answer|descriptive|coding|fill-blank","text":"…","options":["…"],"correctAnswer":"… (array for multiple-select; for fill-blank use ___ in text and an array of accepted answers per blank)","points":2,"difficulty":"easy|medium|hard","bloom":"Remember|Understand|Apply|Analyze|Evaluate|Create","explanation":"…"}]',
	"```",
	"The block must be valid JSON (an array). Omit it when you are not producing new questions.",
].join("\n");

export const AGENTS: Record<AgentId, AgentDef> = {
	question: {
		id: "question",
		name: "Question Agent",
		purpose: "Questions, papers, blueprints and paper review",
		prompt: [
			"You are the Question Agent. You write high-quality exam questions (MCQ, multiple-select, true/false, fill-in-the-blank, short answer, descriptive, coding),",
			"exam blueprints and difficulty distributions, and you review question papers for clarity, ambiguity, difficulty balance, syllabus coverage and duplicates.",
			"Tag every question with a Bloom's taxonomy level and difficulty; give answer keys and brief explanations.",
			"MCQ distractors must be plausible; avoid 'all of the above' unless asked. Coding questions need sample input/output and edge cases.",
			"When reviewing a paper, give an Exam Quality Score out of 100 with sub-scores (coverage, clarity, difficulty balance, duplication) and concrete fixes.",
			"Base questions on supplied documents or course knowledge when present and say which part they come from.",
			QUESTION_BLOCK,
		].join(" \n"),
		followUps: [
			"Make these harder",
			"Add answer explanations",
			"Turn this into a full exam blueprint",
		],
	},
	integrity: {
		id: "integrity",
		name: "Integrity Agent",
		purpose: "Proctoring reports, alert explanations, incident reports",
		prompt: [
			"You are the Integrity Agent. You analyse proctoring evidence: integrity reports, alert explanations, chronological timeline reconstruction,",
			"multi-student comparison, false-positive analysis, evidence summaries, evidence-based risk assessment and faculty-ready incident reports.",
			"NON-NEGOTIABLE: never state or imply that a student cheated or is guilty. Automated alerts are indicators, not proof.",
			"For every concern give: the evidence (with timestamps from the timeline), your confidence (low/medium/high) and why, plausible innocent explanations",
			"(lighting, glasses, webcam quality, network drops, accessibility needs, nervous habits), and a recommendation for HUMAN review",
			"(e.g. watch recording at mm:ss, invite the student to explain). Use a risk band (Low/Moderate/Elevated) — never a verdict.",
			"Incident reports use sections: Summary, Session details, Timeline, Evidence assessment, Alternative explanations, Recommended next steps, Reviewer sign-off (blank).",
		].join(" \n"),
		followUps: [
			"Reconstruct the timeline",
			"What are possible innocent explanations?",
			"Draft an incident report for review",
		],
	},
	analytics: {
		id: "analytics",
		name: "Analytics Agent",
		purpose: "Performance analysis, difficult questions, weak outcomes",
		prompt: [
			"You are the Analytics Agent. You turn exam data into insight: score distribution, pass rate, difficult questions (low facility index),",
			"weak topics and learning outcomes, section comparisons, outliers and actionable teaching recommendations.",
			"Answer natural-language dashboard requests (e.g. 'students with more than three alerts', 'bottom 10 students') precisely as a markdown table from the data.",
			"Use only numbers present in the data; say when grading is still pending. Keep reports skimmable: headline, key findings, table(s), recommendations.",
		].join(" \n"),
		followUps: [
			"Which questions were hardest and why?",
			"Compare sections",
			"Generate a performance report",
		],
	},
	grading: {
		id: "grading",
		name: "Grading Agent",
		purpose: "Rubrics, model answers, marking and grading suggestions",
		prompt: [
			"You are the Grading Agent. You build rubrics (5, 10, 15 or 20 marks) with clear criteria, performance levels and automatic mark allocation,",
			"model answers and marking schemes, and you evaluate student answers against a faculty-approved rubric.",
			"When suggesting marks: give marks per criterion with a one-line justification each, the total, your confidence, and what would earn the missing marks.",
			"Suggested marks are advisory — the faculty member makes the final decision. Never invent a rubric silently: if none is given, propose one first and label it 'proposed'.",
		].join(" \n"),
		followUps: [
			"Make the rubric stricter",
			"Write a model answer",
			"Grade this answer against the rubric",
		],
	},
	document: {
		id: "document",
		name: "Document Agent",
		purpose: "PDFs, slides and papers: extraction, duplicates, question banks",
		prompt: [
			"You are the Document Agent. You read the attached documents (PDF, DOCX, PPTX, images via OCR): summarise them, extract existing questions verbatim,",
			"detect duplicate or near-duplicate questions, map content to syllabus units, and build question banks grouped by topic and difficulty.",
			"Quote or cite the slide/page/section you used. If text looks garbled from OCR, say so.",
			QUESTION_BLOCK,
		].join(" \n"),
		followUps: [
			"Extract all questions from the document",
			"Find duplicate questions",
			"Build a question bank by topic",
		],
	},
	academic: {
		id: "academic",
		name: "Academic Agent",
		purpose: "Syllabus, outcomes, exam readiness, announcements",
		prompt: [
			"You are the Academic Agent. You help with syllabus and learning outcomes, coverage analysis, exam readiness checks and simulations",
			"(walk through what a student will experience, flag configuration risks before publishing), and you draft examination announcements,",
			"instructions and messages to students that are clear, kind and specific (date, time, duration, allowed materials, proctoring rules, support contact).",
			"For readiness, list blockers first, then risks, then recommendations, referencing the actual configuration.",
		].join(" \n"),
		followUps: [
			"Is this exam ready to publish?",
			"Simulate the student experience",
			"Draft an exam announcement",
		],
	},
};

export interface RoutePlan {
	agent: AgentId;
	assessmentRef: string | null;
	studentRef: string | null;
	needs: DataNeed[];
	title: string | null;
	routedBy: "model" | "rules";
}

const RULES: { agent: AgentId; re: RegExp }[] = [
	{
		agent: "integrity",
		re: /\b(integrity|proctor|alert|suspicious|cheat|misconduct|violation|incident|timeline|gaze|tab[- ]?switch|false positive|evidence|risk)\b/i,
	},
	{
		agent: "analytics",
		re: /\b(performance|analy[sz]|average|mean|median|pass rate|distribution|weak|hardest|difficult questions|compare (class|section)|report on results|scores?|dashboard|show (me )?students|top \d+|bottom \d+)\b/i,
	},
	{
		agent: "grading",
		re: /\b(rubric|grade|grading|marking scheme|model answer|evaluate (this|the) answer|marks? for)\b/i,
	},
	{
		agent: "academic",
		re: /\b(syllabus|learning outcome|course outcome|readiness|ready to publish|simulat|announcement|instructions for students|notice)\b/i,
	},
	{
		agent: "question",
		re: /\b(question|mcq|quiz|paper|blueprint|bloom|distractor|coding problem|fill in the blank|true\/false)\b/i,
	},
];

function ruleNeeds(agent: AgentId, text: string): DataNeed[] {
	const t = text.toLowerCase();
	const needs = new Set<DataNeed>();
	if (agent === "analytics") needs.add("performance");
	if (agent === "integrity") needs.add("integrity");
	if (agent === "academic") needs.add("overview");
	if (/\b(live|right now|ongoing|currently|in progress)\b/.test(t)) needs.add("live");
	if (/\b(similar|plagiar|copied|collusion)\b/.test(t)) needs.add("similarity");
	if (/\b(review|quality|my (exam|paper|questions))\b/.test(t) && agent === "question")
		needs.add("overview");
	if (/\b(syllabus|course material|from (my|the) course)\b/.test(t)) needs.add("course");
	if (/\b(my (assessments|exams)|which exams|list)\b/.test(t)) needs.add("list");
	return [...needs];
}

/**
 * Orchestrator: decides which specialist handles the request and what data it needs.
 * Uses the fast model for intent understanding with a deterministic rule fallback.
 */
export async function planTurn(input: {
	message: string;
	history: { role: string; content: string }[];
	hasAttachments: boolean;
	pinnedAssessment: string | null;
	assessmentTitles: string[];
}): Promise<RoutePlan> {
	const reply = await groqChat({
		role: "fast",
		jsonMode: true,
		temperature: 0,
		maxTokens: 300,
		timeoutMs: 8000,
		messages: [
			{
				role: "system",
				content: [
					"You route requests for Vigil, a faculty examination copilot. Reply with JSON only:",
					'{"agent":"question|integrity|analytics|grading|document|academic","assessment":string|null,"student":string|null,',
					'"needs":["overview"|"performance"|"integrity"|"student"|"live"|"similarity"|"course"|"list"],"title":"3-6 word conversation title"}',
					"Agents: question=write/review questions, papers, blueprints, quality score; integrity=proctoring alerts, evidence, timelines, incident reports;",
					"analytics=results, performance, natural-language data queries about students/scores; grading=rubrics, model answers, grading answers;",
					"document=work on attached files (extract, summarise, duplicates, question banks); academic=syllabus, outcomes, readiness, simulation, announcements.",
					"needs: overview=exam configuration+questions; performance=scores; integrity=alerts per student; student=one student's attempt (set student);",
					"live=ongoing exam status; similarity=similar written answers; course=syllabus and course documents; list=list of the faculty's exams.",
					"assessment: the exam the user refers to, copied from the known titles when possible; null if none. student: a name or roll number if mentioned.",
				].join("\n"),
			},
			{
				role: "user",
				content: JSON.stringify({
					message: input.message.slice(0, 2000),
					recent: input.history.slice(-4).map((m) => `${m.role}: ${m.content.slice(0, 300)}`),
					attachments: input.hasAttachments,
					pinnedAssessment: input.pinnedAssessment,
					knownAssessments: input.assessmentTitles.slice(0, 40),
				}),
			},
		],
	});
	const parsed = parseJsonReply<{
		agent?: string;
		assessment?: string | null;
		student?: string | null;
		needs?: string[];
		title?: string;
	}>(reply);
	const validNeeds: DataNeed[] = [
		"overview",
		"performance",
		"integrity",
		"student",
		"live",
		"similarity",
		"course",
		"list",
	];
	if (parsed?.agent && parsed.agent in AGENTS) {
		const agent = parsed.agent as AgentId;
		const needs = new Set(
			(parsed.needs ?? []).filter((n): n is DataNeed => validNeeds.includes(n as DataNeed)),
		);
		for (const n of ruleNeeds(agent, input.message)) needs.add(n);
		if (parsed.student) needs.add("student");
		return {
			agent,
			assessmentRef: parsed.assessment?.trim() || null,
			studentRef: parsed.student?.trim() || null,
			needs: [...needs],
			title: parsed.title?.trim().slice(0, 60) || null,
			routedBy: "model",
		};
	}
	// Rule-based fallback (model unavailable or unparseable).
	const agent: AgentId = input.hasAttachments
		? "document"
		: (RULES.find((r) => r.re.test(input.message))?.agent ?? "question");
	return {
		agent,
		assessmentRef: null,
		studentRef: null,
		needs: ruleNeeds(agent, input.message),
		title: null,
		routedBy: "rules",
	};
}

export const ROUTER_MODEL = GROQ_MODELS.fast;
