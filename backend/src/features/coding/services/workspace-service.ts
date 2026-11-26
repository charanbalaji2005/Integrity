import { createHash } from "node:crypto";
import { HTTP_STATUS } from "@/constants/http-status";
import { prisma } from "@/database";
import { AppError } from "@/utils/app-error";
import { type CodeLanguage, isCodeLanguage, LANGUAGE_SPECS, MAX_SOURCE_BYTES } from "../languages";
import { executionDto } from "./execution-service";
import { parseCodingConfig, starterFor } from "./question-config";

const MAX_VERSIONS = 30;

export const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/**
 * Loads attempt + question for a student and enforces: owns the attempt (404
 * otherwise, so IDs can't be probed), question belongs to it and is a coding
 * question, and — for writes — the attempt is still in progress.
 */
export async function loadStudentContext(
	userId: string,
	attemptId: string,
	questionId: string,
	opts: { write: boolean },
) {
	const attempt = await prisma.assessmentAttempt.findUnique({
		where: { id: attemptId },
		select: { id: true, studentId: true, status: true, proctoringStatus: true, assessmentId: true },
	});
	if (!attempt || attempt.studentId !== userId)
		throw new AppError("Attempt not found", HTTP_STATUS.NOT_FOUND);
	const question = await prisma.question.findUnique({ where: { id: questionId } });
	if (!question || question.assessmentId !== attempt.assessmentId || question.type !== "coding") {
		throw new AppError("Coding question not found", HTTP_STATUS.NOT_FOUND);
	}
	if (
		opts.write &&
		(attempt.status !== "started" || ["TERMINATED", "SUBMITTED"].includes(attempt.proctoringStatus))
	) {
		throw new AppError(
			"This attempt is no longer in progress; code can't be changed.",
			HTTP_STATUS.CONFLICT,
		);
	}
	return { attempt, question, config: parseCodingConfig(question.config) };
}

export function assertSource(sourceCode: unknown): string {
	if (typeof sourceCode !== "string")
		throw new AppError("sourceCode is required", HTTP_STATUS.BAD_REQUEST);
	if (Buffer.byteLength(sourceCode, "utf8") > MAX_SOURCE_BYTES)
		throw new AppError("Source code is larger than 64 KB.", HTTP_STATUS.BAD_REQUEST);
	return sourceCode;
}

export function assertLanguage(language: unknown, allowed: CodeLanguage[]): CodeLanguage {
	if (!isCodeLanguage(language) || !allowed.includes(language)) {
		throw new AppError(
			`Language not allowed for this question. Use one of: ${allowed.join(", ")}.`,
			HTTP_STATUS.BAD_REQUEST,
		);
	}
	return language;
}

/** Everything the student editor needs. Hidden tests, rubric and reference solution are never included. */
export async function getWorkspace(userId: string, attemptId: string, questionId: string) {
	const { attempt, question, config } = await loadStudentContext(userId, attemptId, questionId, {
		write: false,
	});
	const [drafts, executions, submissions] = await Promise.all([
		prisma.codeDraft.findMany({ where: { attemptId, questionId }, orderBy: { updatedAt: "desc" } }),
		prisma.codeExecution.findMany({
			where: { attemptId, questionId, userId },
			orderBy: { createdAt: "desc" },
			take: 10,
		}),
		prisma.codeSubmission.findMany({
			where: { attemptId, questionId },
			orderBy: { version: "desc" },
			select: {
				id: true,
				version: true,
				language: true,
				submittedAt: true,
				source: true,
				isLatest: true,
				sourceHash: true,
			},
		}),
	]);
	const activeLanguage =
		(drafts[0]?.language as CodeLanguage | undefined) ?? config.allowedLanguages[0]!;
	return {
		attemptId,
		questionId,
		editable: attempt.status === "started",
		maxMarks: question.points,
		languages: config.allowedLanguages.map((key) => ({
			key,
			label: LANGUAGE_SPECS[key].label,
			monaco: LANGUAGE_SPECS[key].monaco,
			fileName: LANGUAGE_SPECS[key].fileName,
			starterCode: starterFor(config, key),
		})),
		activeLanguage,
		limits: { timeLimitMs: config.timeLimitMs, memoryLimitMb: config.memoryLimitMb },
		sampleInput: config.sampleInput ?? "",
		sampleOutput: config.sampleOutput ?? "",
		publicTests: config.testCases
			.filter((t) => !t.hidden)
			.map((t, index) => ({ index, input: t.input, output: t.output })),
		hiddenTestCount: config.testCases.filter((t) => t.hidden).length,
		drafts: drafts.map((d) => ({
			language: d.language,
			sourceCode: d.sourceCode,
			updatedAt: d.updatedAt,
			saveCount: d.saveCount,
		})),
		executions: executions.map(executionDto),
		submissions: submissions.map(({ sourceHash, ...s }) => s),
	};
}

export async function saveDraft(
	userId: string,
	attemptId: string,
	questionId: string,
	body: { language?: unknown; sourceCode?: unknown },
) {
	const { config } = await loadStudentContext(userId, attemptId, questionId, { write: true });
	const language = assertLanguage(body.language, config.allowedLanguages);
	const sourceCode = assertSource(body.sourceCode);
	const draft = await prisma.codeDraft.upsert({
		where: { attemptId_questionId_language: { attemptId, questionId, language } },
		create: { attemptId, questionId, studentId: userId, language, sourceCode },
		update: { sourceCode, saveCount: { increment: 1 } },
	});
	return { language: draft.language, updatedAt: draft.updatedAt, saveCount: draft.saveCount };
}

/** Creates an immutable submitted version (no-op if identical to the latest one). */
export async function createSubmissionVersion(args: {
	attemptId: string;
	questionId: string;
	assessmentId: string;
	studentId: string;
	language: CodeLanguage;
	sourceCode: string;
	maxMarks: number;
	source: "student" | "exam_submit";
}) {
	const hash = sha256(`${args.language}\n${args.sourceCode}`);
	return prisma.$transaction(async (tx) => {
		const latest = await tx.codeSubmission.findFirst({
			where: { attemptId: args.attemptId, questionId: args.questionId },
			orderBy: { version: "desc" },
		});
		if (latest && latest.sourceHash === hash) return { submission: latest, created: false };
		if (latest && latest.version >= MAX_VERSIONS && args.source === "student") {
			throw new AppError(
				`You can submit at most ${MAX_VERSIONS} versions of one answer.`,
				HTTP_STATUS.CONFLICT,
			);
		}
		await tx.codeSubmission.updateMany({
			where: { attemptId: args.attemptId, questionId: args.questionId, isLatest: true },
			data: { isLatest: false },
		});
		const submission = await tx.codeSubmission.create({
			data: {
				attemptId: args.attemptId,
				questionId: args.questionId,
				assessmentId: args.assessmentId,
				studentId: args.studentId,
				version: (latest?.version ?? 0) + 1,
				language: args.language,
				sourceCode: args.sourceCode,
				sourceHash: hash,
				source: args.source,
				maxMarks: args.maxMarks,
			},
		});
		return { submission, created: true };
	});
}

export async function submitFromStudent(
	userId: string,
	attemptId: string,
	questionId: string,
	body: { language?: unknown; sourceCode?: unknown },
) {
	const { attempt, question, config } = await loadStudentContext(userId, attemptId, questionId, {
		write: true,
	});
	const language = assertLanguage(body.language, config.allowedLanguages);
	const sourceCode = assertSource(body.sourceCode);
	if (!sourceCode.trim())
		throw new AppError("Write some code before submitting.", HTTP_STATUS.BAD_REQUEST);
	// Keep the draft in step so a later refresh restores what was submitted.
	await prisma.codeDraft.upsert({
		where: { attemptId_questionId_language: { attemptId, questionId, language } },
		create: { attemptId, questionId, studentId: userId, language, sourceCode },
		update: { sourceCode, saveCount: { increment: 1 } },
	});
	const { submission, created } = await createSubmissionVersion({
		attemptId,
		questionId,
		assessmentId: attempt.assessmentId,
		studentId: userId,
		language,
		sourceCode,
		maxMarks: question.points,
		source: "student",
	});
	return {
		id: submission.id,
		version: submission.version,
		language: submission.language,
		submittedAt: submission.submittedAt,
		created,
	};
}

/**
 * Called when an attempt is finally submitted. For each coding question, the
 * newest work (a submitted version, or a later draft) becomes the evaluated
 * version; the Answer row gets the source; an evaluation job is queued.
 * `fallbackResponses` covers answers typed before the editor existed.
 */
export async function finalizeCodingForAttempt(
	attemptId: string,
	fallbackResponses: Record<string, string> = {},
) {
	const attempt = await prisma.assessmentAttempt.findUnique({
		where: { id: attemptId },
		select: {
			id: true,
			studentId: true,
			assessmentId: true,
			assessment: { select: { questions: { where: { type: "coding" } } } },
		},
	});
	if (!attempt) return [];
	const queued: string[] = [];

	for (const question of attempt.assessment.questions) {
		const config = parseCodingConfig(question.config);
		const [latestSub, latestDraft] = await Promise.all([
			prisma.codeSubmission.findFirst({
				where: { attemptId, questionId: question.id },
				orderBy: { version: "desc" },
			}),
			prisma.codeDraft.findFirst({
				where: { attemptId, questionId: question.id },
				orderBy: { updatedAt: "desc" },
			}),
		]);

		let chosen = latestSub;
		if (
			latestDraft?.sourceCode.trim() &&
			(!latestSub || latestDraft.updatedAt > latestSub.submittedAt) &&
			isCodeLanguage(latestDraft.language)
		) {
			chosen = (
				await createSubmissionVersion({
					attemptId,
					questionId: question.id,
					assessmentId: attempt.assessmentId,
					studentId: attempt.studentId,
					language: latestDraft.language,
					sourceCode: latestDraft.sourceCode,
					maxMarks: question.points,
					source: "exam_submit",
				})
			).submission;
		} else if (!latestSub && !latestDraft) {
			const typed = fallbackResponses[question.id]?.trim();
			const lang = config.allowedLanguages[0]!;
			if (typed && typed !== starterFor(config, lang).trim()) {
				chosen = (
					await createSubmissionVersion({
						attemptId,
						questionId: question.id,
						assessmentId: attempt.assessmentId,
						studentId: attempt.studentId,
						language: lang,
						sourceCode: fallbackResponses[question.id]!,
						maxMarks: question.points,
						source: "exam_submit",
					})
				).submission;
			}
		}
		if (!chosen) continue; // nothing written: the answer stays unanswered (0 marks)

		const answer = await prisma.answer.findFirst({
			where: { attemptId, questionId: question.id },
			select: { id: true },
		});
		if (answer)
			await prisma.answer.update({
				where: { id: answer.id },
				data: { response: chosen.sourceCode },
			});
		else
			await prisma.answer.create({
				data: {
					attemptId,
					questionId: question.id,
					response: chosen.sourceCode,
					originalResponse: chosen.sourceCode,
				},
			});
		const existingJob = await prisma.codeEvaluationJob.findFirst({
			where: { submissionId: chosen.id, status: { in: ["pending", "processing"] } },
		});
		if (!existingJob && chosen.status === "PENDING") {
			await prisma.codeEvaluationJob.create({ data: { submissionId: chosen.id, trigger: "auto" } });
			queued.push(chosen.id);
		}
	}
	return queued;
}
