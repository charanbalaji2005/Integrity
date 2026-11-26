import { prisma } from "@/database";
import { GROQ_MODELS, type GroqMessage, groqChat, moderate } from "@/services/groq";

/**
 * AI Support Agent for tickets (fast model: openai/gpt-oss-20b).
 *  - triage reply when a ticket is opened
 *  - auto-replies to students while no human agent has joined
 *  - drafts suggested replies for support staff
 * Student messages are screened by the safety model first.
 */

export const AI_SENDER = {
	senderId: "ai-bot",
	senderName: "AI Support Agent",
	senderRole: "ai",
} as const;

const KNOWLEDGE = `IntegrityOS facts you may rely on:
- Supported browsers: latest Google Chrome or Microsoft Edge on a laptop/desktop. Phones and tablets cannot take exams.
- Camera and microphone permission must be allowed for the site; close other apps using the camera (Zoom, Teams).
- Exams run in fullscreen. Leaving fullscreen, switching tabs, copy/paste and devtools are logged as browser events.
- Answers auto-save. After a disconnect or crash, students can use "Resume Exam" on the dashboard within the resume window set by faculty (default 15 minutes, max 3 resumes).
- Students must complete enrolment verification (college ID / fee receipt reviewed by an admin) before taking exams.
- Password reset: "Forgot password" on the login page sends an OTP to the institutional email.
- Proctoring alerts are evidence for human review, never automatic proof of misconduct. Appeals go to faculty/evaluators through support.
- Support cannot change grades, reveal answers, or disclose other students' data.`;

const CANNED: Record<string, string> = {
	technical:
		"Hi! I'm the IntegrityOS AI Support Agent. Please check: 1) latest Chrome or Edge, 2) camera & microphone allowed for this site, 3) no other app is using the camera. If it still fails, reply here with the exact error — I've queued your ticket for a technical agent.",
	assessment:
		"Hi! I'm the IntegrityOS AI Support Agent. Your answers are auto-saved. If you were disconnected, use 'Resume Exam' on your dashboard within the resume window. I've queued this for a support agent to review your session logs.",
	"account-recovery":
		"Hi! I'm the IntegrityOS AI Support Agent. You can reset your password with 'Forgot password' on the login page. If that doesn't work, confirm your institutional email here and an administrator will verify your identity.",
	"integrity-clarifications":
		"Hi! I'm the IntegrityOS AI Support Agent. Proctoring alerts are reviewed by people, not decided automatically. Tell me which alert you'd like to clarify and when it happened, and I'll pass it to an evaluator.",
};
const CANNED_DEFAULT =
	"Hi! I'm the IntegrityOS AI Support Agent. I've received your ticket and added you to the queue. Could you share any error messages and which page you were on while you wait for a live agent?";

interface TicketContext {
	referenceNumber: string;
	category: string;
	priority: string;
	description: string;
	studentName: string;
	status: string;
}

interface HistoryMsg {
	senderId: string;
	senderRole: string;
	senderName: string;
	content: string;
}

function systemPrompt(ticket: TicketContext, mode: "student" | "draft"): string {
	const who =
		mode === "student"
			? "You are the IntegrityOS AI Support Agent replying directly to a student in a support ticket chat."
			: "You are drafting a reply that a human IntegrityOS support agent will review, edit and send to a student.";
	return `${who}
Ticket ${ticket.referenceNumber} · category: ${ticket.category} · priority: ${ticket.priority} · student: ${ticket.studentName}.
${KNOWLEDGE}
Rules: be warm, concise (max ~120 words), use short numbered steps for troubleshooting.
Never promise grade changes, refunds or outcomes. Never reveal exam content or other students' data.
If the issue needs a human (account changes, appeals, anything you can't verify), say a support agent will follow up.
Plain text only, no markdown headings.`;
}

/** Ticket description + recent chat, as Groq messages (system notices dropped). */
function toGroqHistory(description: string, history: HistoryMsg[]): GroqMessage[] {
	const chat = history
		.filter((m) => m.senderId !== "system")
		.slice(-12)
		.map((m) => ({
			role: m.senderRole === "user" ? ("user" as const) : ("assistant" as const),
			content: m.senderRole === "user" ? m.content : `[${m.senderName}] ${m.content}`,
		}));
	return [{ role: "user", content: `Ticket description: ${description.slice(0, 4000)}` }, ...chat];
}

/** First reply when a ticket is opened. Falls back to canned text if Groq is down. */
export async function generateTriageReply(ticket: TicketContext): Promise<string> {
	const reply = await groqChat({
		role: "fast",
		messages: [
			{ role: "system", content: systemPrompt(ticket, "student") },
			{ role: "user", content: ticket.description.slice(0, 4000) },
		],
		temperature: 0.3,
		maxTokens: 600,
		reasoningEffort: "low",
		timeoutMs: 15000,
	});
	return reply ?? CANNED[ticket.category] ?? CANNED_DEFAULT;
}

/**
 * Called after a student posts a message. Replies only while no human agent is
 * handling the ticket. Returns the created AI message, or null if it stayed quiet.
 */
export async function autoReplyToStudent(ticketId: string) {
	const ticket = await prisma.supportTicket.findUnique({
		where: { id: ticketId },
		include: { messages: { orderBy: { createdAt: "asc" } } },
	});
	if (
		!ticket ||
		ticket.status === "active" ||
		ticket.status === "resolved" ||
		ticket.assignedAgentId
	)
		return null;

	const last = ticket.messages[ticket.messages.length - 1];
	if (last?.senderRole !== "user") return null;

	const verdict = await moderate(last.content, "student");
	if (verdict.flagged) {
		await prisma.supportTicket.update({ where: { id: ticketId }, data: { priority: "high" } });
		return prisma.ticketMessage.create({
			data: {
				ticketId,
				...AI_SENDER,
				content:
					"I can't help with that request. I've passed your ticket to a human support agent, who will follow up here.",
			},
		});
	}

	const reply = await groqChat({
		role: "fast",
		messages: [
			{ role: "system", content: systemPrompt(ticket, "student") },
			...toGroqHistory(ticket.description, ticket.messages),
		],
		temperature: 0.3,
		maxTokens: 600,
		reasoningEffort: "low",
		timeoutMs: 15000,
	});
	if (!reply) return null;

	return prisma.ticketMessage.create({ data: { ticketId, ...AI_SENDER, content: reply } });
}

/** Draft for support staff (not sent). */
export async function suggestAgentReply(
	ticketId: string,
): Promise<{ draft: string; model: string } | null> {
	const ticket = await prisma.supportTicket.findUnique({
		where: { id: ticketId },
		include: { messages: { orderBy: { createdAt: "asc" } } },
	});
	if (!ticket) return null;
	const draft = await groqChat({
		role: "fast",
		messages: [
			{ role: "system", content: systemPrompt(ticket, "draft") },
			...toGroqHistory(ticket.description, ticket.messages),
			{ role: "user", content: "Write the next reply the support agent should send." },
		],
		temperature: 0.4,
		maxTokens: 700,
		reasoningEffort: "low",
		timeoutMs: 15000,
	});
	return draft ? { draft, model: GROQ_MODELS.fast } : null;
}
