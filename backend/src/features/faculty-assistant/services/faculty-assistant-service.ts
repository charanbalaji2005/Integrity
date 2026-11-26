import { z } from "zod";
import { env } from "@/config/env";
import { HTTP_STATUS } from "@/constants/http-status";
import { GROQ_MODELS, type GroqMessage, groqChat, moderate } from "@/services/groq";
import { AppError } from "@/utils/app-error";

export const chatSchema = z.object({
	messages: z
		.array(
			z.object({
				role: z.enum(["user", "assistant"]),
				content: z.string().trim().min(1).max(4000),
			}),
		)
		.min(1)
		.max(30),
});

export type ChatInput = z.infer<typeof chatSchema>;

export interface FacultyIdentity {
	role: string;
	emailVerified: boolean;
	status: string;
	name: string;
	department?: string | null;
	institutionName?: string | null;
}

/** A faculty member is "verified" when their email is verified and the account is active. */
export function facultyEligibility(user: FacultyIdentity): { eligible: boolean; reason?: string } {
	if (user.role !== "faculty")
		return { eligible: false, reason: "The AI assistant is available to faculty members only." };
	if (!user.emailVerified)
		return {
			eligible: false,
			reason: "Verify your institutional email to unlock the AI assistant.",
		};
	if (user.status !== "active")
		return { eligible: false, reason: "Your account must be active to use the AI assistant." };
	return { eligible: true };
}

function systemPrompt(user: FacultyIdentity): string {
	return [
		"You are Vigil, the AI teaching assistant inside IntegrityOS, an exam-integrity and proctoring platform.",
		`You are helping ${user.name}${user.department ? `, ${user.department} faculty` : ""}${user.institutionName ? ` at ${user.institutionName}` : ""}.`,
		"Help with: writing and improving exam questions (MCQ, descriptive, coding), rubrics and marking schemes,",
		"learning outcomes and difficulty balance, interpreting proctoring alerts and integrity/plagiarism reports fairly,",
		"and drafting clear messages to students.",
		"The user is a verified faculty member responsible for exam integrity. Explaining how students commonly attempt",
		"to cheat in online or proctored exams (hidden phones, notes, second screens, earpieces, helpers, tab switching)",
		"and how to spot, prevent and fairly review such behaviour is a legitimate, expected part of your job — answer it",
		"fully and practically. Do not help anyone actually cheat, and never write content meant to be given to students to evade proctoring.",
		"When discussing possible misconduct, stay neutral: AI signals are evidence for human review, never proof.",
		"Never invent student data or results you were not given. Be concise; use short lists and markdown where helpful.",
	].join(" ");
}

async function callOllama(messages: { role: string; content: string }[]): Promise<string | null> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 45000);
	try {
		const res = await fetch(`${env.OLLAMA_BASE_URL.replace(/\/$/, "")}/api/chat`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ model: env.OLLAMA_CHAT_MODEL, messages, stream: false }),
			signal: controller.signal,
		});
		if (!res.ok) return null;
		const data = (await res.json()) as { message?: { content?: unknown } };
		const content = data.message?.content;
		return typeof content === "string" && content.trim() ? content.trim() : null;
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

export async function chatWithAssistant(
	user: FacultyIdentity,
	input: ChatInput,
): Promise<{ reply: string; model: string }> {
	// Safety screen the newest faculty message (safeguard model; fails open on outage).
	const latest = [...input.messages].reverse().find((m) => m.role === "user");
	if (latest) {
		const verdict = await moderate(latest.content, "faculty");
		if (verdict.flagged) {
			return {
				reply: `I can't help with that request (${verdict.category}). I'm happy to help with question design, rubrics, or reviewing integrity evidence fairly.`,
				model: GROQ_MODELS.safety,
			};
		}
	}

	const messages: GroqMessage[] = [
		{ role: "system", content: systemPrompt(user) },
		...input.messages,
	];
	const groqReply = await groqChat({
		role: "reasoning",
		messages,
		temperature: 0.4,
		maxTokens: 2000,
		reasoningEffort: "medium",
		timeoutMs: 45000,
	});
	if (groqReply) return { reply: groqReply, model: GROQ_MODELS.reasoning };

	const ollamaReply = await callOllama(messages as { role: string; content: string }[]);
	if (ollamaReply) return { reply: ollamaReply, model: env.OLLAMA_CHAT_MODEL };

	throw new AppError(
		"The AI assistant is unavailable right now. Please try again shortly.",
		HTTP_STATUS.SERVICE_UNAVAILABLE,
	);
}
