import { env } from "../../../config/env";
import { prisma } from "../../../database";
import { emitToAssessmentMonitors } from "../../../providers/socket";
import { GROQ_MODELS, groqConfigured, groqVisionJson } from "../../../services/groq";

/**
 * Vision Review Agent (qwen/qwen3.8-27b on Groq).
 *
 * When the local detectors raise a *visual* proctoring event, this agent takes
 * the frame that triggered it and asks the vision model for an independent
 * second opinion. The verdict is stored on the proctoring timeline and pushed
 * to live monitors as evidence for the faculty reviewer. It never changes the
 * integrity score or the exam status by itself — humans decide.
 */

const VISUAL_EVENTS = new Set([
	"MULTIPLE_INDIVIDUALS",
	"PROHIBITED_OBJECT",
	"ABSENT_CANDIDATE",
	"IDENTITY_MISMATCH",
	"LIVENESS_FAILURE",
]);

/** Minimum gap between reviews for the same attempt (cost + rate-limit guard). */
const COOLDOWN_MS = 30_000;
const lastReviewAt = new Map<string, number>();
const inFlight = new Set<string>();

interface VisionVerdict {
	people_count: number;
	candidate_present: boolean;
	prohibited_items: string[];
	looking_away: boolean;
	confirms_alert: "yes" | "no" | "unclear";
	summary: string;
}

const PROMPT = (events: string[]) => `You are an impartial exam-proctoring evidence reviewer looking at ONE webcam frame from an online exam.
The automated detectors raised: ${events.join(", ")}.
Describe only what is actually visible. Do not guess identity, ethnicity, age or emotions.
Prohibited items: phone, second screen/laptop/tablet, books or notes, earphones/headphones, smartwatch, another person.
Answer ONLY with JSON:
{"people_count": number, "candidate_present": boolean, "prohibited_items": string[], "looking_away": boolean,
 "confirms_alert": "yes" | "no" | "unclear", "summary": "<one neutral sentence, max 30 words>"}`;

export function shouldReviewFrame(attemptId: string, eventTypes: string[], hasFrame: boolean): boolean {
	if (!hasFrame || !env.GROQ_VISION_PROCTORING || !groqConfigured()) return false;
	if (!eventTypes.some((t) => VISUAL_EVENTS.has(t))) return false;
	if (inFlight.has(attemptId)) return false;
	return Date.now() - (lastReviewAt.get(attemptId) ?? 0) >= COOLDOWN_MS;
}

/**
 * Fire-and-forget: call without awaiting. Never throws.
 */
export async function reviewFlaggedFrame(params: {
	attemptId: string;
	assessmentId: string;
	section?: string | null;
	frame: string;
	eventTypes: string[];
}): Promise<void> {
	const { attemptId, frame } = params;
	const events = params.eventTypes.filter((t) => VISUAL_EVENTS.has(t));
	inFlight.add(attemptId);
	lastReviewAt.set(attemptId, Date.now());
	try {
		const verdict = await groqVisionJson<VisionVerdict>(PROMPT(events), frame);
		if (!verdict) return;

		const items = Array.isArray(verdict.prohibited_items) ? verdict.prohibited_items.slice(0, 6) : [];
		const confirms = ["yes", "no", "unclear"].includes(verdict.confirms_alert) ? verdict.confirms_alert : "unclear";
		const details = `${String(verdict.summary ?? "").slice(0, 300)} [model: ${GROQ_MODELS.vision}; alert ${
			confirms === "yes" ? "confirmed" : confirms === "no" ? "NOT confirmed — possible false positive" : "unclear"
		}; people: ${Number(verdict.people_count) || 0}${items.length ? `; items: ${items.join(", ")}` : ""}; triggered by ${events.join(", ")}]`;

		await prisma.proctoringTimelineEvent.create({
			data: { attemptId, event: "AI VISION REVIEW", details },
		});

		emitToAssessmentMonitors(params.assessmentId, params.section ?? undefined, "proctor-vision-review", {
			attemptId,
			events,
			confirms,
			peopleCount: Number(verdict.people_count) || 0,
			prohibitedItems: items,
			candidatePresent: Boolean(verdict.candidate_present),
			summary: verdict.summary,
			model: GROQ_MODELS.vision,
			at: new Date().toISOString(),
		});
	} catch (err) {
		console.warn("[VisionReview] failed:", err instanceof Error ? err.message : err);
	} finally {
		inFlight.delete(attemptId);
		if (lastReviewAt.size > 5000) lastReviewAt.clear();
	}
}
