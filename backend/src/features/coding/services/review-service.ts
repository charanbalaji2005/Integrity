import type { Prisma } from "@prisma/client";
import { HTTP_STATUS } from "@/constants/http-status";
import { prisma } from "@/database";
import { AppError } from "@/utils/app-error";
import { canSeeStudentSection, facultySectionsOf } from "@/utils/faculty-sections";
import { isCodeLanguage, LANGUAGE_SPECS } from "../languages";
import { enqueueEvaluation, recomputeAttemptScore } from "./evaluation-service";
import { executionDto } from "./execution-service";
import { parseCodingConfig } from "./question-config";

export interface Reviewer {
	id: string;
	name: string;
	role: string;
	section?: string | null;
}

const isAdmin = (u: Reviewer) => u.role === "admin";

/** Submissions a reviewer may see: own assessments (students in their sections), or flags assigned to them. Admin: all. */
function scopeWhere(u: Reviewer): Prisma.CodeSubmissionWhereInput {
	if (isAdmin(u)) return {};
	const sections = facultySectionsOf(u);
	const own: Prisma.CodeSubmissionWhereInput = {
		attempt: {
			assessment: { facultyId: u.id },
			...(sections ? { student: { section: { in: sections } } } : {}),
		},
	};
	return { OR: [own, { flags: { some: { assignedFacultyId: u.id } } }] };
}

async function loadInScope(u: Reviewer, submissionId: string) {
	const sub = await prisma.codeSubmission.findFirst({
		where: { id: submissionId, ...scopeWhere(u) },
	});
	if (!sub) throw new AppError("Submission not found", HTTP_STATUS.NOT_FOUND);
	return sub;
}

export interface FlagFilters {
	status?: string;
	assessmentId?: string;
	courseId?: string;
	language?: string;
	reason?: string;
	q?: string;
}

export async function listFlags(u: Reviewer, f: FlagFilters) {
	const subScope = scopeWhere(u);
	const base: Prisma.CodeFlagWhereInput = { submission: subScope };
	const where: Prisma.CodeFlagWhereInput = {
		...base,
		...(f.status && f.status !== "all" ? { status: f.status } : {}),
		...(f.reason ? { reason: f.reason } : {}),
		submission: {
			...subScope,
			...(f.assessmentId ? { assessmentId: f.assessmentId } : {}),
			...(f.language ? { language: f.language } : {}),
			...(f.courseId ? { attempt: { assessment: { courseId: f.courseId } } } : {}),
			...(f.q
				? {
						AND: [
							{
								attempt: {
									OR: [
										{ studentName: { contains: f.q, mode: "insensitive" } },
										{ student: { email: { contains: f.q, mode: "insensitive" } } },
										{ student: { rollNumber: { contains: f.q, mode: "insensitive" } } },
									],
								},
							},
						],
					}
				: {}),
		},
	};

	const [flags, pending, inReview, reviewed] = await Promise.all([
		prisma.codeFlag.findMany({
			where,
			orderBy: [{ status: "asc" }, { createdAt: "desc" }],
			take: 200,
			include: {
				submission: {
					select: {
						id: true,
						version: true,
						language: true,
						status: true,
						maxMarks: true,
						suggestedMarks: true,
						finalMarks: true,
						submittedAt: true,
						assessmentId: true,
						question: { select: { id: true, text: true, order: true } },
						attempt: {
							select: {
								studentName: true,
								student: {
									select: {
										id: true,
										email: true,
										rollNumber: true,
										academicId: true,
										section: true,
									},
								},
								assessment: {
									select: {
										id: true,
										title: true,
										course: { select: { id: true, code: true, name: true } },
									},
								},
							},
						},
						evaluations: {
							orderBy: { runNumber: "desc" },
							take: 1,
							select: { confidence: true, testsPassed: true, testsTotal: true },
						},
					},
				},
			},
		}),
		prisma.codeFlag.count({ where: { ...base, status: "pending" } }),
		prisma.codeFlag.count({ where: { ...base, status: "in_review" } }),
		prisma.codeFlag.count({ where: { ...base, status: "reviewed" } }),
	]);

	// Facets for the filter bar, from what this reviewer can see.
	const assessments = await prisma.assessment.findMany({
		where: isAdmin(u)
			? { questions: { some: { type: "coding" } } }
			: { facultyId: u.id, questions: { some: { type: "coding" } } },
		select: { id: true, title: true, course: { select: { id: true, code: true, name: true } } },
		orderBy: { createdAt: "desc" },
		take: 100,
	});

	return {
		counts: { pending, inReview, reviewed },
		assessments,
		flags: flags.map((fl) => {
			const s = fl.submission;
			const ev = s.evaluations[0];
			return {
				id: fl.id,
				status: fl.status,
				reason: fl.reason,
				detail: fl.detail,
				createdAt: fl.createdAt,
				assignedToMe: fl.assignedFacultyId === u.id,
				submission: {
					id: s.id,
					version: s.version,
					language: s.language,
					languageLabel: isCodeLanguage(s.language) ? LANGUAGE_SPECS[s.language].label : s.language,
					status: s.status,
					maxMarks: s.maxMarks,
					suggestedMarks: s.suggestedMarks,
					finalMarks: s.finalMarks,
					submittedAt: s.submittedAt,
					confidence: ev?.confidence ?? null,
					testsPassed: ev?.testsPassed ?? null,
					testsTotal: ev?.testsTotal ?? null,
				},
				question: {
					id: s.question.id,
					number: s.question.order + 1,
					title: s.question.text.split("\n")[0]!.slice(0, 120),
				},
				student: {
					id: s.attempt.student.id,
					name: s.attempt.studentName,
					email: s.attempt.student.email,
					registrationNumber: s.attempt.student.rollNumber || s.attempt.student.academicId,
					section: s.attempt.student.section,
				},
				assessment: {
					id: s.attempt.assessment.id,
					title: s.attempt.assessment.title,
					course: s.attempt.assessment.course,
				},
			};
		}),
	};
}

/**
 * Full review workspace. Opening a pending flag moves it to "in review" — but
 * only for its assignee (or anyone when unassigned), and not when the view is
 * just the response to an action (e.g. handing it off for a second review).
 */
export async function getReview(
	u: Reviewer,
	submissionId: string,
	opts: { claim?: boolean } = { claim: true },
) {
	await loadInScope(u, submissionId);
	const sub = await prisma.codeSubmission.findUniqueOrThrow({
		where: { id: submissionId },
		include: {
			question: true,
			attempt: {
				select: {
					id: true,
					studentName: true,
					submittedAt: true,
					startedAt: true,
					student: {
						select: {
							id: true,
							name: true,
							email: true,
							rollNumber: true,
							academicId: true,
							section: true,
							department: true,
						},
					},
					assessment: {
						select: {
							id: true,
							title: true,
							facultyId: true,
							course: { select: { id: true, code: true, name: true } },
						},
					},
				},
			},
			evaluations: {
				orderBy: { runNumber: "desc" },
				include: { testResults: { orderBy: { index: "asc" } } },
			},
			flags: { orderBy: { createdAt: "desc" } },
			reviews: { orderBy: { createdAt: "desc" } },
		},
	});

	const open = opts.claim
		? sub.flags.find(
				(f) => f.status === "pending" && (!f.assignedFacultyId || f.assignedFacultyId === u.id),
			)
		: undefined;
	if (open) {
		await prisma.codeFlag.update({
			where: { id: open.id },
			data: { status: "in_review", openedById: u.id, openedAt: new Date() },
		});
		await prisma.codeReview.create({
			data: { submissionId, flagId: open.id, facultyId: u.id, facultyName: u.name, action: "open" },
		});
		if (sub.finalizedBy !== "faculty")
			await prisma.codeSubmission.update({
				where: { id: submissionId },
				data: { status: "IN_REVIEW" },
			});
		open.status = "in_review";
		sub.status = sub.finalizedBy !== "faculty" ? "IN_REVIEW" : sub.status;
	}

	const [versions, executions, otherFaculty] = await Promise.all([
		prisma.codeSubmission.findMany({
			where: { attemptId: sub.attemptId, questionId: sub.questionId },
			orderBy: { version: "desc" },
			select: {
				id: true,
				version: true,
				language: true,
				sourceCode: true,
				submittedAt: true,
				source: true,
				isLatest: true,
				status: true,
			},
		}),
		prisma.codeExecution.findMany({
			where: { attemptId: sub.attemptId, questionId: sub.questionId },
			orderBy: { createdAt: "desc" },
			take: 25,
		}),
		prisma.user.findMany({
			where: { role: "faculty", id: { not: u.id }, status: "active" },
			select: { id: true, name: true, department: true },
			orderBy: { name: "asc" },
			take: 200,
		}),
	]);
	const config = parseCodingConfig(sub.question.config);
	const parse = <T>(s: string | null, d: T): T => {
		try {
			return s ? (JSON.parse(s) as T) : d;
		} catch {
			return d;
		}
	};

	return {
		submission: {
			id: sub.id,
			version: sub.version,
			language: sub.language,
			languageLabel: isCodeLanguage(sub.language)
				? LANGUAGE_SPECS[sub.language].label
				: sub.language,
			monaco: isCodeLanguage(sub.language) ? LANGUAGE_SPECS[sub.language].monaco : "plaintext",
			sourceCode: sub.sourceCode,
			status: sub.status,
			source: sub.source,
			maxMarks: sub.maxMarks,
			suggestedMarks: sub.suggestedMarks,
			finalMarks: sub.finalMarks,
			finalizedBy: sub.finalizedBy,
			submittedAt: sub.submittedAt,
			isLatest: sub.isLatest,
		},
		student: {
			id: sub.attempt.student.id,
			name: sub.attempt.student.name,
			email: sub.attempt.student.email,
			registrationNumber: sub.attempt.student.rollNumber || sub.attempt.student.academicId,
			section: sub.attempt.student.section,
			department: sub.attempt.student.department,
		},
		assessment: {
			id: sub.attempt.assessment.id,
			title: sub.attempt.assessment.title,
			course: sub.attempt.assessment.course,
			attemptSubmittedAt: sub.attempt.submittedAt,
		},
		question: {
			id: sub.question.id,
			number: sub.question.order + 1,
			text: sub.question.text,
			maxMarks: sub.question.points,
			referenceSolution: sub.question.correctAnswer,
			testCases: config.testCases.map((t, i) => ({ index: i, ...t })),
			rubric: config.rubric,
			testWeightPercent: config.testWeightPercent,
			outputMatch: config.outputMatch,
			limits: { timeLimitMs: config.timeLimitMs, memoryLimitMb: config.memoryLimitMb },
			confidenceThreshold: config.confidenceThreshold,
		},
		versions,
		previousSubmissions: versions.length - 1,
		executions: executions.map(executionDto),
		evaluations: sub.evaluations.map((e) => ({
			id: e.id,
			runNumber: e.runNumber,
			trigger: e.trigger,
			status: e.status,
			compileStatus: e.compileStatus,
			compileOutput: e.compileOutput,
			testsPassed: e.testsPassed,
			testsTotal: e.testsTotal,
			testMarks: e.testMarks,
			aiMarks: e.aiMarks,
			suggestedMarks: e.suggestedMarks,
			maxMarks: e.maxMarks,
			breakdown: parse(e.breakdown, [] as unknown[]),
			feedback: e.feedback,
			confidence: e.confidence,
			generatedBy: e.generatedBy,
			flagReasons: parse(e.flagReasons, [] as unknown[]),
			error: e.error,
			createdAt: e.createdAt,
			completedAt: e.completedAt,
			testResults: e.testResults.map((t) => ({
				index: t.index,
				hidden: t.hidden,
				input: t.input,
				expectedOutput: t.expectedOutput,
				actualOutput: t.actualOutput,
				stderr: t.stderr,
				passed: t.passed,
				verdict: t.verdict,
				timeMs: t.timeMs,
				memoryKb: t.memoryKb,
			})),
		})),
		flags: sub.flags,
		reviews: sub.reviews,
		pendingJob: Boolean(
			await prisma.codeEvaluationJob.findFirst({
				where: { submissionId, status: { in: ["pending", "processing"] } },
			}),
		),
		faculty: otherFaculty,
	};
}

export type ReviewAction =
	| "approve_ai"
	| "override"
	| "reevaluate"
	| "request_second_review"
	| "mark_reviewed"
	| "remark";

export interface ActionInput {
	action: ReviewAction;
	marks?: number;
	remark?: string;
	explanation?: string;
	assignToFacultyId?: string;
}

async function setFinalMarks(
	subId: string,
	attemptId: string,
	questionId: string,
	isLatest: boolean,
	marks: number,
) {
	await prisma.codeSubmission.update({
		where: { id: subId },
		data: { finalMarks: marks, finalizedBy: "faculty", status: "REVIEWED" },
	});
	if (isLatest) {
		await prisma.answer.updateMany({
			where: { attemptId, questionId },
			data: { manualGrade: marks, isFlagged: false, overrideStatus: "modified" },
		});
		await recomputeAttemptScore(attemptId);
	}
}

async function closeOpenFlags(subId: string, u: Reviewer) {
	await prisma.codeFlag.updateMany({
		where: { submissionId: subId, status: { in: ["pending", "in_review"] } },
		data: { status: "reviewed", resolvedById: u.id, resolvedAt: new Date() },
	});
}

export async function applyAction(u: Reviewer, submissionId: string, input: ActionInput) {
	const sub = await loadInScope(u, submissionId);
	const openFlag = await prisma.codeFlag.findFirst({
		where: { submissionId, status: { in: ["pending", "in_review"] } },
		orderBy: { createdAt: "desc" },
	});
	const log = (data: Partial<Prisma.CodeReviewUncheckedCreateInput>) =>
		prisma.codeReview.create({
			data: {
				submissionId,
				flagId: openFlag?.id ?? null,
				facultyId: u.id,
				facultyName: u.name,
				action: input.action,
				...data,
			},
		});
	const remark = input.remark?.trim().slice(0, 2000) || null;

	switch (input.action) {
		case "approve_ai": {
			if (sub.suggestedMarks == null)
				throw new AppError(
					"There are no AI-suggested marks to approve. Override with your own marks.",
					HTTP_STATUS.BAD_REQUEST,
				);
			await setFinalMarks(sub.id, sub.attemptId, sub.questionId, sub.isLatest, sub.suggestedMarks);
			await closeOpenFlags(sub.id, u);
			await log({ marks: sub.suggestedMarks, previousMarks: sub.finalMarks, remark });
			break;
		}
		case "override": {
			const marks = Number(input.marks);
			if (!Number.isFinite(marks) || marks < 0 || marks > sub.maxMarks)
				throw new AppError(`Marks must be between 0 and ${sub.maxMarks}.`, HTTP_STATUS.BAD_REQUEST);
			const explanation = input.explanation?.trim();
			if (!explanation || explanation.length < 5)
				throw new AppError("Explain why you are overriding the AI marks.", HTTP_STATUS.BAD_REQUEST);
			const rounded = Math.round(marks * 100) / 100;
			await setFinalMarks(sub.id, sub.attemptId, sub.questionId, sub.isLatest, rounded);
			await closeOpenFlags(sub.id, u);
			await log({
				marks: rounded,
				previousMarks: sub.finalMarks ?? sub.suggestedMarks,
				remark,
				explanation: explanation.slice(0, 2000),
			});
			break;
		}
		case "reevaluate": {
			await enqueueEvaluation(sub.id, "faculty", u.id);
			await log({ remark });
			break;
		}
		case "request_second_review": {
			const target = input.assignToFacultyId
				? await prisma.user.findFirst({
						where: { id: input.assignToFacultyId, role: "faculty", status: "active" },
						select: { id: true, name: true },
					})
				: null;
			if (input.assignToFacultyId && !target)
				throw new AppError(
					"Choose an active faculty member for the second review.",
					HTTP_STATUS.BAD_REQUEST,
				);
			if (target?.id === u.id)
				throw new AppError(
					"Pick a different faculty member for the second review.",
					HTTP_STATUS.BAD_REQUEST,
				);
			await closeOpenFlags(sub.id, u);
			await prisma.codeFlag.create({
				data: {
					submissionId: sub.id,
					reason: "second_review",
					detail: `Second review requested by ${u.name}${remark ? `: ${remark}` : "."}`,
					assignedFacultyId: target?.id ?? null,
				},
			});
			if (sub.finalizedBy !== "faculty")
				await prisma.codeSubmission.update({ where: { id: sub.id }, data: { status: "FLAGGED" } });
			if (target) {
				await prisma.notification.create({
					data: {
						userId: target.id,
						title: "Second review requested",
						description: `${u.name} asked you to review a coding submission.`,
						type: "system",
						priority: "medium",
					},
				});
			}
			await log({
				remark,
				explanation: target ? `Assigned to ${target.name}` : "Returned to the review queue",
			});
			break;
		}
		case "mark_reviewed": {
			const marks = sub.finalMarks ?? sub.suggestedMarks;
			if (marks == null)
				throw new AppError(
					"Set marks (approve or override) before closing the review.",
					HTTP_STATUS.BAD_REQUEST,
				);
			if (sub.finalizedBy !== "faculty")
				await setFinalMarks(sub.id, sub.attemptId, sub.questionId, sub.isLatest, marks);
			await closeOpenFlags(sub.id, u);
			await log({ marks, remark });
			break;
		}
		case "remark": {
			if (!remark) throw new AppError("Write a remark.", HTTP_STATUS.BAD_REQUEST);
			await log({ remark });
			break;
		}
		default:
			throw new AppError("Unknown action", HTTP_STATUS.BAD_REQUEST);
	}
	return getReview(u, submissionId, { claim: false });
}

/** Re-runs every flagged / in-review latest submission of an assessment (optionally one question). History is kept. */
export async function reevaluateFlagged(u: Reviewer, assessmentId: string, questionId?: string) {
	const assessment = await prisma.assessment.findUnique({
		where: { id: assessmentId },
		select: { facultyId: true },
	});
	if (!assessment || (!isAdmin(u) && assessment.facultyId !== u.id))
		throw new AppError("Assessment not found", HTTP_STATUS.NOT_FOUND);
	const subs = await prisma.codeSubmission.findMany({
		where: {
			assessmentId,
			isLatest: true,
			status: { in: ["FLAGGED", "IN_REVIEW", "FAILED"] },
			...(questionId ? { questionId } : {}),
			...scopeWhere(u),
		},
		select: { id: true },
	});
	for (const s of subs) {
		await enqueueEvaluation(s.id, "bulk", u.id);
		await prisma.codeReview.create({
			data: { submissionId: s.id, facultyId: u.id, facultyName: u.name, action: "bulk_reevaluate" },
		});
	}
	return { queued: subs.length };
}

/** Faculty may only see a student's code if the student is in their sections. */
export function canReviewStudent(u: Reviewer, section: string | null | undefined) {
	return isAdmin(u) || canSeeStudentSection(u, section);
}
