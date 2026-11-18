import { z } from "zod";
import { HTTP_STATUS } from "@/constants/http-status";
import { prisma } from "@/database";
import { AppError } from "@/utils/app-error";

export const TECH_ISSUES = ["none", "camera", "microphone", "network", "browser", "timer", "other"] as const;

export const submitFeedbackSchema = z.object({
	attemptId: z.string().min(1),
	overallRating: z.number().int().min(1).max(5),
	difficulty: z.enum(["easy", "just-right", "hard"]),
	proctoringRating: z.number().int().min(1).max(5),
	technicalIssues: z.array(z.enum(TECH_ISSUES)).max(TECH_ISSUES.length).default([]),
	comments: z.string().trim().max(2000).optional(),
});

export type SubmitFeedbackInput = z.infer<typeof submitFeedbackSchema>;

interface FeedbackUser {
	id: string;
	name: string;
	email: string;
}

const NEGATIVE_WORDS = /\b(bad|worst|terrible|unfair|crash|lag|slow|stuck|broken|annoying|hate|issue|problem|bug|failed)\b/i;
const POSITIVE_WORDS = /\b(good|great|smooth|easy|nice|excellent|fair|love|helpful|clear|fine|awesome)\b/i;

/** Lightweight sentiment from ratings + comment keywords (no external model needed). */
function deriveSentiment(input: SubmitFeedbackInput): "positive" | "neutral" | "negative" {
	let score = (input.overallRating - 3) + (input.proctoringRating - 3) * 0.5;
	const issues = input.technicalIssues.filter((i) => i !== "none");
	score -= issues.length * 0.5;
	if (input.comments) {
		if (NEGATIVE_WORDS.test(input.comments)) score -= 1;
		if (POSITIVE_WORDS.test(input.comments)) score += 1;
	}
	if (score >= 1) return "positive";
	if (score <= -1) return "negative";
	return "neutral";
}

export async function submitFeedback(user: FeedbackUser, input: SubmitFeedbackInput) {
	const attempt = await prisma.assessmentAttempt.findUnique({
		where: { id: input.attemptId },
		include: { assessment: { select: { id: true, title: true } }, examFeedback: { select: { id: true } } },
	});

	if (!attempt || attempt.studentId !== user.id) {
		throw new AppError("Attempt not found", HTTP_STATUS.NOT_FOUND);
	}
	if (attempt.status === "started") {
		throw new AppError("Submit the exam before giving feedback", HTTP_STATUS.BAD_REQUEST);
	}
	if (attempt.examFeedback) {
		throw new AppError("Feedback already submitted for this exam", HTTP_STATUS.CONFLICT);
	}

	const issues = input.technicalIssues.includes("none") ? [] : input.technicalIssues;

	return prisma.examFeedback.create({
		data: {
			attemptId: attempt.id,
			assessmentId: attempt.assessment.id,
			assessmentTitle: attempt.assessment.title,
			studentId: user.id,
			studentName: attempt.studentName || user.name,
			studentEmail: user.email,
			overallRating: input.overallRating,
			difficulty: input.difficulty,
			proctoringRating: input.proctoringRating,
			technicalIssues: JSON.stringify(issues),
			comments: input.comments || null,
			sentiment: deriveSentiment({ ...input, technicalIssues: issues }),
		},
	});
}

/** Admin view: every feedback entry (newest first) plus aggregate stats. */
export async function listFeedback(assessmentId?: string) {
	const rows = await prisma.examFeedback.findMany({
		where: assessmentId ? { assessmentId } : undefined,
		orderBy: { createdAt: "desc" },
		take: 500,
	});

	const items = rows.map((r) => ({
		...r,
		technicalIssues: safeParseArray(r.technicalIssues),
	}));

	const n = items.length;
	const avg = (k: "overallRating" | "proctoringRating") =>
		n ? Math.round((items.reduce((s, r) => s + r[k], 0) / n) * 10) / 10 : 0;
	const count = <T extends string>(vals: T[]) =>
		vals.reduce<Record<string, number>>((acc, v) => {
			acc[v] = (acc[v] ?? 0) + 1;
			return acc;
		}, {});

	return {
		items,
		stats: {
			total: n,
			avgOverall: avg("overallRating"),
			avgProctoring: avg("proctoringRating"),
			difficulty: count(items.map((r) => r.difficulty)),
			sentiment: count(items.map((r) => r.sentiment)),
			issues: count(items.flatMap((r) => r.technicalIssues)),
		},
	};
}

function safeParseArray(json: string): string[] {
	try {
		const v = JSON.parse(json);
		return Array.isArray(v) ? v.map(String) : [];
	} catch {
		return [];
	}
}
