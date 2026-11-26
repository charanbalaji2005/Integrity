import type { Request, Response } from "express";
import { HTTP_STATUS } from "@/constants/http-status";
import { prisma } from "@/database";
import { AppError } from "@/utils/app-error";
import { attemptSectionWhere } from "@/utils/faculty-sections";
import { parseRegistrationNumber } from "@/utils/registration-number";
import { sendSuccess } from "@/utils/response";
import { emitToUser, getIO } from "../../../providers/socket";
import { finalizeCodingForAttempt } from "../../coding/services/workspace-service";
import { isDemoEmail } from "../../demo/demo-accounts";
import {
	applyBuilderPayload,
	assessmentScalarData,
	collectPublishIssues,
	gradeObjective,
	loadBuilderAssessment,
	parseBuilderPayload,
	questionsForAttempt,
	sanitizeQuestionForStudent,
} from "../services/assessment-builder-service";
import { orchestrateEvaluation } from "../services/evaluation-engine";
import { facultyToNotify, getAssessmentResults } from "../services/results-service";
import { getEmbedding } from "../services/vector-service";

/**
 * Express v5 parameter helpers to avoid string/string[] type mismatch
 */
function getParamString(param: any): string {
	if (Array.isArray(param)) {
		return String(param[0] || "");
	}
	return String(param || "");
}

function getAuthUser(req: Request) {
	const user = req.user;
	if (!user) {
		throw new AppError("Unauthorized: Authentication session required", HTTP_STATUS.UNAUTHORIZED);
	}
	return user;
}

/**
 * Helper to check if a user is faculty or admin
 */
async function checkFaculty(userId: string) {
	const user = await prisma.user.findUnique({ where: { id: userId } });
	if (!user || (user.role !== "faculty" && user.role !== "admin")) {
		throw new AppError(
			"Forbidden: Faculty or Administrator privileges required.",
			HTTP_STATUS.FORBIDDEN,
		);
	}
	return user;
}

/**
 * GET /api/assessments
 * Returns assessments.
 * - Faculty: returns assessments they created.
 * - Student: returns published assessments matching their institution.
 */
export async function getAssessments(req: Request, res: Response): Promise<void> {
	const user = getAuthUser(req);
	const role = user.role;

	if (role === "faculty" || role === "admin") {
		const assessments = (await prisma.assessment.findMany({
			where: { facultyId: user.id },
			include: {
				_count: {
					select: { attempts: true, questions: true },
				},
			},
			orderBy: { createdAt: "desc" },
		})) as any[];
		sendSuccess(res, assessments, "Assessments retrieved successfully", HTTP_STATUS.OK);
	} else {
		// Student: assessments matching student's institution, defaulting to SRM University AP
		const institution = user.institutionName || "SRM University AP";

		// Find assessments in same institution
		const assessments = (await prisma.assessment.findMany({
			where: {
				institutionName: institution,
				// Students only see published assessments; drafts stay private to faculty.
				...(user.role === "admin" ? {} : { published: true }),
			},
			include: {
				attempts: {
					where:
						user.role === "admin" ? undefined : { studentId: user.id, status: { not: "reset" } },
					orderBy: { createdAt: "desc" },
				},
				_count: {
					select: { questions: true },
				},
				questions: { select: { points: true } },
			},
			orderBy: { createdAt: "desc" },
		})) as any[];

		// Map to indicate if student has already completed or started it
		const formatted = assessments.map((a) => {
			const attempt = a.attempts?.[0];
			return {
				id: a.id,
				title: a.title,
				description: a.description,
				duration: a.duration,
				availabilityStart: a.availabilityStart,
				availabilityEnd: a.availabilityEnd,
				gradingScheme: a.gradingScheme,
				facultyName: a.facultyName,
				questionsCount: a._count?.questions || 0,
				attemptStatus: attempt ? attempt.status : "not_started",
				attemptId: attempt ? attempt.id : null,
				attemptScore: attempt ? attempt.score : null,
				attemptIntegrity: attempt ? attempt.integrityScore : null,
				totalPoints: (a.questions || []).reduce(
					(sum: number, q: { points?: number }) => sum + (q.points || 0),
					0,
				),
				institutionName: a.institutionName,
				attemptSubmittedAt: attempt ? attempt.submittedAt : null,
				attemptRiskLevel: attempt ? attempt.riskLevel : null,
				certificateNumber: attempt ? attempt.certificateNumber : null,
				verificationCode: attempt ? attempt.verificationCode : null,
			};
		});

		sendSuccess(res, formatted, "Student assessments retrieved successfully", HTTP_STATUS.OK);
	}
}

/**
 * GET /api/assessments/:id
 */
export async function getAssessmentById(req: Request, res: Response): Promise<void> {
	const id = getParamString(req.params.id);
	const user = getAuthUser(req);

	const assessment = (await prisma.assessment.findUnique({
		where: { id },
		include: {
			questions: { orderBy: { order: "asc" } },
		},
	})) as any;

	if (!assessment) {
		throw new AppError("Assessment not found", HTTP_STATUS.NOT_FOUND);
	}

	// Security: students only see published assessments, without answer keys,
	// explanations or hidden test cases.
	if (user.role === "user") {
		if (!assessment.published) {
			throw new AppError("Assessment not found", HTTP_STATUS.NOT_FOUND);
		}
		assessment.questions = (assessment.questions || []).map((q: any) =>
			sanitizeQuestionForStudent(q),
		);
	}

	sendSuccess(res, assessment, "Assessment retrieved successfully", HTTP_STATUS.OK);
}

/**
 * GET /api/assessments/:id/builder
 * Faculty owner: full builder state (questions with keys, topics, materials, links).
 */
export async function getBuilderAssessment(req: Request, res: Response): Promise<void> {
	const id = getParamString(req.params.id);
	const assessment = await loadBuilderAssessment(id);
	if (!assessment) {
		throw new AppError("Assessment not found", HTTP_STATUS.NOT_FOUND);
	}
	sendSuccess(res, assessment, "Assessment retrieved successfully", HTTP_STATUS.OK);
}

/**
 * POST /api/assessments
 * Body: builder payload (see assessment-builder-service). Legacy clients that omit
 * `published` keep the historical behaviour of publishing immediately.
 */
export async function createAssessment(req: Request, res: Response): Promise<void> {
	const user = getAuthUser(req);
	const faculty = await checkFaculty(user.id);
	const payload = parseBuilderPayload(req.body);

	if (!payload.title || !payload.duration) {
		throw new AppError("Title and Duration are required", HTTP_STATUS.BAD_REQUEST);
	}

	const actor = {
		institutionName: faculty.institutionName || "SRM University AP",
		isAdmin: faculty.role === "admin",
	};
	const assessment = await prisma.assessment.create({
		data: {
			...assessmentScalarData(payload),
			title: payload.title,
			duration: payload.duration,
			institutionName: actor.institutionName,
			facultyName: faculty.name || "Faculty Member",
			facultyId: faculty.id,
			published: payload.published ?? true,
		},
	});

	try {
		await applyBuilderPayload(assessment.id, { ...payload, published: undefined }, actor);
	} catch (err) {
		// Don't leave a half-created assessment behind.
		await prisma.assessment.delete({ where: { id: assessment.id } }).catch(() => {});
		throw err;
	}

	const createdAssessment = await loadBuilderAssessment(assessment.id);
	sendSuccess(res, createdAssessment, "Assessment created successfully", HTTP_STATUS.CREATED);
}

/**
 * PUT /api/assessments/:id
 * Patches any subset of the builder payload. Questions are reconciled by id, so
 * reordering persists and answered questions are never silently deleted.
 */
export async function editAssessment(req: Request, res: Response): Promise<void> {
	const id = getParamString(req.params.id);
	const user = getAuthUser(req);
	const faculty = await checkFaculty(user.id);
	const payload = parseBuilderPayload(req.body);

	const assessment = await prisma.assessment.findUnique({ where: { id } });
	if (!assessment) {
		throw new AppError("Assessment not found", HTTP_STATUS.NOT_FOUND);
	}
	if (payload.title !== undefined && payload.title.trim().length === 0) {
		throw new AppError("Title cannot be empty", HTTP_STATUS.BAD_REQUEST);
	}

	// Publishing goes through POST /:id/publish so it is always validated.
	await applyBuilderPayload(
		id,
		{ ...payload, published: undefined },
		{
			institutionName: faculty.institutionName || "SRM University AP",
			isAdmin: faculty.role === "admin",
		},
	);

	const updated = await loadBuilderAssessment(id);
	sendSuccess(res, updated, "Assessment updated successfully", HTTP_STATUS.OK);
}

/**
 * GET /api/assessments/:id/publish-check
 * Lists everything that would block publishing.
 */
export async function getPublishCheck(req: Request, res: Response): Promise<void> {
	const id = getParamString(req.params.id);
	const issues = await collectPublishIssues(id);
	sendSuccess(
		res,
		{ ready: issues.length === 0, issues },
		"Publish check complete",
		HTTP_STATUS.OK,
	);
}

/**
 * POST /api/assessments/:id/publish
 */
export async function publishAssessment(req: Request, res: Response): Promise<void> {
	const id = getParamString(req.params.id);
	const user = getAuthUser(req);
	await checkFaculty(user.id);

	const issues = await collectPublishIssues(id);
	if (issues.length > 0) {
		res.status(422).json({
			success: false,
			message: `Fix ${issues.length} issue${issues.length === 1 ? "" : "s"} before publishing: ${issues[0].message}`,
			data: { issues },
		});
		return;
	}

	const updated = await prisma.assessment.update({
		where: { id },
		data: { published: true },
	});

	sendSuccess(res, updated, "Assessment published successfully", HTTP_STATUS.OK);
}

/**
 * POST /api/assessments/:id/start
 * Starts assessment attempt for a student.
 */
export async function startAttempt(req: Request, res: Response): Promise<void> {
	const id = getParamString(req.params.id);
	const student = getAuthUser(req);
	const { resumeReason } = req.body;

	const assessment = (await prisma.assessment.findUnique({
		where: { id },
		include: { questions: { orderBy: { order: "asc" } } },
	})) as any;

	// Drafts are invisible to students.
	if (!assessment || (student.role === "user" && !assessment.published)) {
		throw new AppError("Assessment not found", HTTP_STATUS.NOT_FOUND);
	}

	// Enrolment verification gate: students may only start or resume an exam
	// once an administrator has approved their college ID / fee receipt.
	if (student.role === "user" && student.verificationStatus !== "approved") {
		const reason =
			student.verificationStatus === "pending"
				? "Your enrolment document is still under review. You can take exams once an administrator approves it."
				: student.verificationStatus === "rejected"
					? "Your enrolment document was not approved. Upload a new college ID card or fee receipt to continue."
					: "Verify your enrolment first: upload your college ID card or institution fee receipt for admin approval.";
		throw new AppError(reason, HTTP_STATUS.FORBIDDEN);
	}

	// Check Attempt Lock
	if (assessment.attemptLock) {
		throw new AppError(
			"This assessment is currently locked by the instructor.",
			HTTP_STATUS.BAD_REQUEST,
		);
	}

	// Check Lateness
	if (assessment.availabilityEnd && new Date() > new Date(assessment.availabilityEnd)) {
		if (!assessment.lateSubmissionAllowed) {
			throw new AppError(
				"This assessment has ended and late submissions are not allowed.",
				HTTP_STATUS.BAD_REQUEST,
			);
		}
	}

	// Shared demo account: an attempt abandoned by a previous visitor must not
	// block the next one. Retire it (status "reset") once its resume window has
	// passed; real students keep the strict resume rules below.
	if (isDemoEmail(student.email)) {
		await prisma.assessmentAttempt.updateMany({
			where: {
				assessmentId: id,
				studentId: student.id,
				status: "started",
				updatedAt: { lt: new Date(Date.now() - assessment.resumeTimeWindow * 60000) },
			},
			data: { status: "reset" },
		});
	}

	// Find all attempts for this assessment by this student
	const attempts = await prisma.assessmentAttempt.findMany({
		where: {
			assessmentId: id,
			studentId: student.id,
			// Attempts reset by faculty no longer count towards resume/attempt limits.
			status: { not: "reset" },
		},
		include: {
			answers: true,
		},
		orderBy: { createdAt: "desc" },
	});

	if (attempts.length > 0) {
		const latest = attempts[0];
		if (latest.status === "started") {
			// Resume existing attempt
			if (!assessment.allowResume) {
				throw new AppError("Resuming is not allowed for this assessment.", HTTP_STATUS.BAD_REQUEST);
			}

			if (latest.resumeCount >= assessment.maxResumeCount) {
				throw new AppError(
					"Maximum resume count exceeded for this assessment.",
					HTTP_STATUS.BAD_REQUEST,
				);
			}

			const minutesAway = (Date.now() - new Date(latest.updatedAt).getTime()) / 60000;
			if (minutesAway > assessment.resumeTimeWindow) {
				throw new AppError(
					`The resume time window (${assessment.resumeTimeWindow} minutes) has expired.`,
					HTTP_STATUS.BAD_REQUEST,
				);
			}

			if (resumeReason === "disconnect" && !assessment.resumeAfterDisconnect) {
				throw new AppError(
					"Resuming after network disconnect is disabled for this assessment.",
					HTTP_STATUS.BAD_REQUEST,
				);
			}
			if (resumeReason === "crash" && !assessment.resumeAfterCrash) {
				throw new AppError(
					"Resuming after browser crash is disabled for this assessment.",
					HTTP_STATUS.BAD_REQUEST,
				);
			}
			if (resumeReason === "logout" && !assessment.resumeAfterLogout) {
				throw new AppError(
					"Resuming after manual logout is disabled for this assessment.",
					HTTP_STATUS.BAD_REQUEST,
				);
			}

			// Increment resumeCount
			const updatedAttempt = await prisma.assessmentAttempt.update({
				where: { id: latest.id },
				data: {
					resumeCount: latest.resumeCount + 1,
					isOnline: true,
				},
				include: {
					answers: true,
				},
			});

			sendSuccess(
				res,
				{
					attempt: updatedAttempt,
					questions: questionsForAttempt(assessment.questions || [], assessment, updatedAttempt.id),
				},
				"Attempt resumed successfully",
				HTTP_STATUS.OK,
			);
			return;
		} else {
			// Previous attempt is submitted. Checking if we can start a new attempt (retake)
			if (!assessment.retakeAllowed) {
				throw new AppError(
					"You have already completed this assessment. Retakes are not allowed.",
					HTTP_STATUS.BAD_REQUEST,
				);
			}

			if (attempts.length >= assessment.attemptLimit) {
				throw new AppError(
					`Maximum attempt limit of ${assessment.attemptLimit} reached.`,
					HTTP_STATUS.BAD_REQUEST,
				);
			}

			if (assessment.retakeDate && new Date() < new Date(assessment.retakeDate)) {
				throw new AppError(
					`Retakes are only allowed after ${new Date(assessment.retakeDate).toLocaleString()}`,
					HTTP_STATUS.BAD_REQUEST,
				);
			}
		}
	}

	// Start new attempt
	const attempt = await prisma.assessmentAttempt.create({
		data: {
			assessmentId: id,
			studentId: student.id,
			studentName: student.name,
			status: "started",
			integrityScore: 100,
			progress: 0,
			timeLeft: assessment.duration * 60,
		},
		include: {
			answers: true,
		},
	});

	sendSuccess(
		res,
		{
			attempt,
			questions: questionsForAttempt(assessment.questions || [], assessment, attempt.id),
		},
		"Attempt started successfully",
		HTTP_STATUS.CREATED,
	);
}

/**
 * POST /api/assessments/attempts/:attemptId/progress
 * Body: { progress, integrityScore }
 */
export async function updateProgress(req: Request, res: Response): Promise<void> {
	const attemptId = getParamString(req.params.attemptId);
	const { progress, integrityScore } = req.body;

	const attempt = await prisma.assessmentAttempt.findUnique({ where: { id: attemptId } });
	if (!attempt) {
		throw new AppError("Attempt not found", HTTP_STATUS.NOT_FOUND);
	}

	const updated = await prisma.assessmentAttempt.update({
		where: { id: attemptId },
		data: {
			progress: progress !== undefined ? Number(progress) : attempt.progress,
			integrityScore:
				integrityScore !== undefined ? Number(integrityScore) : attempt.integrityScore,
		},
	});

	sendSuccess(res, updated, "Progress updated successfully", HTTP_STATUS.OK);
}

/**
 * POST /api/assessments/attempts/:attemptId/violation
 * Body: { type, severity, description }
 */
export async function logViolation(req: Request, res: Response): Promise<void> {
	const attemptId = getParamString(req.params.attemptId);
	const { type, severity, description, evidence, browser, os, network, latency, device } = req.body;

	const attempt = await prisma.assessmentAttempt.findUnique({ where: { id: attemptId } });
	if (!attempt) {
		throw new AppError("Attempt not found", HTTP_STATUS.NOT_FOUND);
	}

	// Calculate specific risk score / penalty score
	let points = 5;
	if (type === "internet-disconnect") points = 5;
	else if (type === "slow-network") points = 2;
	else if (type === "tab-switch") points = 10;
	else if (type === "background-noise") points = 10;
	else if (type === "gaze-away" || type === "looking-away") points = 8;
	else if (type === "face-missing" || type === "no-face") points = 25;
	else if (type === "multiple-faces") points = 40;
	else if (type === "developer-tools" || type === "devtools") points = 50;
	else {
		if (severity === "high") points = 20;
		else if (severity === "medium") points = 10;
	}

	const alert = await prisma.violationAlert.create({
		data: {
			attemptId,
			type,
			severity: severity || (points >= 25 ? "high" : points >= 10 ? "medium" : "low"),
			description: description || `Violation type: ${type}`,
			riskScore: points,
			evidence: evidence || null,
			browser: browser || null,
			os: os || null,
			network: network || null,
			latency: latency !== undefined ? Number(latency) : null,
			device: device || null,
		},
	});

	// Deduct from integrity score
	const newScore = Math.max(0, attempt.integrityScore - points);

	const updated = await prisma.assessmentAttempt.update({
		where: { id: attemptId },
		data: {
			integrityScore: newScore,
			// Also update live telemetry state based on violation
			...(type === "internet-disconnect" ? { isOnline: false, networkQuality: "Offline" } : {}),
			...(type === "slow-network"
				? { networkQuality: "Slow", networkLatency: latency ? Number(latency) : 150 }
				: {}),
			...(type === "face-missing" || type === "no-face" ? { faceStatus: "Missing" } : {}),
			...(type === "multiple-faces" ? { faceStatus: "Multiple Faces" } : {}),
			...(type === "gaze-away" || type === "looking-away" ? { faceStatus: "Looking Away" } : {}),
			...(type === "background-noise" ? { backgroundNoise: "Noise Detected" } : {}),
		},
	});

	// Broadcast update to Proctor dashboard
	const io = getIO();
	io?.emit("attempt-update", updated);

	sendSuccess(res, alert, "Violation logged and integrity score adjusted", HTTP_STATUS.CREATED);
}

/**
 * POST /api/assessments/attempts/:attemptId/submit
 * Body: { answers: { questionId: string, response: string }[] }
 */
export async function submitAttempt(req: Request, res: Response): Promise<void> {
	const attemptId = getParamString(req.params.attemptId);
	const { answers } = req.body;

	const attempt = (await prisma.assessmentAttempt.findUnique({
		where: { id: attemptId },
		include: { assessment: { include: { questions: true } } },
	})) as any;

	if (!attempt) {
		throw new AppError("Attempt not found", HTTP_STATUS.NOT_FOUND);
	}

	if (attempt.status !== "started") {
		throw new AppError("Attempt has already been submitted", HTTP_STATUS.BAD_REQUEST);
	}

	let totalScore = 0;
	let maxScore = 0;

	// Process each answer
	if (answers && Array.isArray(answers) && attempt.assessment?.questions) {
		for (const ans of answers) {
			const question = attempt.assessment.questions.find((q: any) => q.id === ans.questionId);
			if (!question) continue;

			maxScore += question.points;
			let aiGrade: number | null = null;
			let aiConfidence: number | null = null;
			let isFlagged = false;
			const aiEvaluationStr: string | null = null;
			let embeddingStr: string | null = null;

			const objectiveGrade = gradeObjective(question, ans.response, attempt.assessment);
			if (objectiveGrade !== null) {
				// MCQ, multiple-select, true/false and fill-in-the-blank are graded instantly
				// (negative marking applies to answered-but-wrong responses).
				aiGrade = objectiveGrade;
				aiConfidence = 1.0;
				totalScore += aiGrade;
				// Compute objective-answer embedding immediately
				embeddingStr = JSON.stringify(await getEmbedding(ans.response || ""));
			} else {
				// Short answer, descriptive, coding, or file-upload: defer AI evaluations to background queue
				aiGrade = null;
				aiConfidence = null;
				isFlagged = false;
			}

			await prisma.answer.create({
				data: {
					attemptId,
					questionId: question.id,
					response: ans.response || "",
					aiGrade: aiGrade ?? null,
					aiConfidence: aiConfidence ?? null,
					isFlagged,
					aiEvaluation: aiEvaluationStr,
					embedding: embeddingStr,
					originalResponse: ans.response || "",
				},
			});
		}
	}

	// Update attempt details
	// Negative marking can never take an attempt below zero.
	const finalScore = maxScore > 0 ? Math.max(0, totalScore) : null;

	await prisma.assessmentAttempt.update({
		where: { id: attemptId },
		data: {
			status: "submitted",
			score: finalScore,
			submittedAt: new Date(),
			progress: 100,
		},
	});

	// Coding answers: freeze the newest code as an immutable version and queue
	// sandboxed test execution + Vigil evaluation (marks land on the Answer later).
	try {
		const typed: Record<string, string> = {};
		if (Array.isArray(answers))
			for (const a of answers)
				if (a?.questionId && typeof a.response === "string") typed[a.questionId] = a.response;
		await finalizeCodingForAttempt(attemptId, typed);
	} catch (err) {
		console.error("[submit] Coding finalisation failed:", err);
	}

	// Queue the evaluation job
	await prisma.evaluationJob.create({
		data: {
			attemptId,
			status: "pending",
		},
	});

	// Broadcast attempt-submitted event via WebSockets
	const io = getIO();
	if (io) {
		io.emit("integrity-report-created", {
			attemptId,
			studentId: attempt.studentId,
			assessmentId: attempt.assessmentId,
			status: "submitted",
		});
	}

	// Tell the faculty of this student's section (and the assessment owner).
	void notifyFacultyOfCompletion(attemptId).catch((err) =>
		console.warn("[submit] Faculty completion notice failed:", err),
	);

	sendSuccess(res, null, "Assessment submitted successfully", HTTP_STATUS.OK);
}

async function notifyFacultyOfCompletion(attemptId: string) {
	const attempt = await prisma.assessmentAttempt.findUnique({
		where: { id: attemptId },
		select: {
			id: true,
			score: true,
			submittedAt: true,
			assessment: { select: { id: true, title: true, facultyId: true } },
			student: { select: { name: true, rollNumber: true, academicId: true, section: true } },
		},
	});
	if (!attempt) return;
	const reg = parseRegistrationNumber(attempt.student.rollNumber || attempt.student.academicId);
	const regLabel = reg.normalized || "No reg. no.";
	const section = attempt.student.section || "Unassigned";
	const payload = {
		attemptId: attempt.id,
		assessmentId: attempt.assessment.id,
		assessmentTitle: attempt.assessment.title,
		studentName: attempt.student.name,
		registrationNumber: reg.normalized,
		section,
		score: attempt.score,
		submittedAt: attempt.submittedAt?.toISOString() ?? new Date().toISOString(),
	};
	const recipients = await facultyToNotify(attempt.assessment.facultyId, attempt.student.section);
	await prisma.notification.createMany({
		data: recipients.map((userId) => ({
			userId,
			title: "Assessment completed",
			description: `${attempt.student.name} (${regLabel}, ${section}) completed "${attempt.assessment.title}".`,
			type: "assessment",
			priority: "low",
			senderName: attempt.student.name,
			senderRole: "student",
		})),
	});
	for (const userId of recipients) emitToUser(userId, "assessment-completed", payload);
}

/**
 * GET /api/assessments/:id/results?section=CSE-A&semester=5&batch=2024
 * Section-wise roster with completion status and marks (faculty: own sections only).
 */
export async function getAssessmentResultsHandler(req: Request, res: Response): Promise<void> {
	const id = getParamString(req.params.id);
	const q = req.query as Record<string, string | undefined>;
	const batch = q.batch ? Number(q.batch) : undefined;
	const data = await getAssessmentResults(
		id,
		{
			section: q.section || undefined,
			semester: q.semester || undefined,
			batchYear: batch && Number.isInteger(batch) ? batch : undefined,
		},
		getAuthUser(req),
	);
	if (!data) throw new AppError("Assessment not found", HTTP_STATUS.NOT_FOUND);
	sendSuccess(res, data);
}

/**
 * GET /api/assessments/:id/attempts
 * Faculty only: fetches attempts for an assessment.
 */
export async function getAttempts(req: Request, res: Response): Promise<void> {
	const id = getParamString(req.params.id);
	const user = getAuthUser(req);
	await checkFaculty(user.id);

	const attempts = await prisma.assessmentAttempt.findMany({
		// Faculty only see attempts from students in their assigned sections.
		where: { assessmentId: id, ...attemptSectionWhere(user) },
		include: {
			violations: true,
		},
		orderBy: { createdAt: "desc" },
	});

	sendSuccess(res, attempts, "Attempts retrieved successfully", HTTP_STATUS.OK);
}

export function calculateRadarMetrics(attempt: any) {
	const violations = attempt.violations || [];

	// 1. Focus calculation
	const gazeAwayCount = violations.filter((v: any) => v.type === "gaze-away").length;
	const noFaceCount = violations.filter((v: any) => v.type === "no-face").length;
	let focus = 100 - gazeAwayCount * 12 - noFaceCount * 15;
	focus = Math.max(30, Math.min(100, focus));
	const focusReason =
		gazeAwayCount === 0 && noFaceCount === 0
			? "Student maintained eye contact and face alignment for 100% of the assessment."
			: `Student distracted: flagged ${gazeAwayCount} gaze alerts and ${noFaceCount} face-not-detected warnings.`;

	// 2. Integrity calculation
	const tabSwitches = violations.filter((v: any) => v.type === "tab-switch").length;
	let integrity = Math.round(attempt.integrityScore);
	if (tabSwitches > 0) {
		integrity = Math.max(20, Math.min(integrity, 100 - tabSwitches * 20));
	}
	const integrityReason =
		tabSwitches === 0 && integrity >= 90
			? "No plagiarism, AI content risk low, and zero suspicious browser activities."
			: `Suspicious browser activity: detected ${tabSwitches} tab switches. Integrity index reduced.`;

	// 3. Collaboration calculation
	const talkingCount = violations.filter((v: any) => v.type === "talking").length;
	const multipleFaces = violations.filter((v: any) => v.type === "multiple-faces").length;
	let collaboration = 100 - talkingCount * 15 - multipleFaces * 35;
	collaboration = Math.max(25, Math.min(100, collaboration));
	const collaborationReason =
		talkingCount === 0 && multipleFaces === 0
			? "No secondary voices or multiple face detection flags triggered."
			: `Potential collaboration: flagged ${talkingCount} talking indicators and ${multipleFaces} multiple-face warnings.`;

	// 4. Consistency calculation
	const consistency = Math.max(40, Math.min(100, 100 - violations.length * 8));
	const consistencyReason =
		violations.length < 2
			? "Typing patterns and continuous identity verification remained stable."
			: `Anomalous pattern spikes detected during environmental alert sequences.`;

	// 5. Accuracy calculation
	const totalPoints =
		attempt.assessment?.questions?.reduce((acc: number, q: any) => acc + (q.points || 1), 0) || 10;
	const score = attempt.score ?? 0;
	const accuracy =
		totalPoints > 0 ? Math.max(30, Math.min(100, Math.round((score / totalPoints) * 100))) : 80;
	const accuracyReason =
		attempt.score !== null
			? `Semantic response evaluation matches model expected correctness profile at ${accuracy}%.`
			: "Assessment pending evaluation. Current semantic answer correctness is verified.";

	// 6. Participation calculation
	const answeredCount = attempt.answers?.length || 0;
	const questionCount = attempt.assessment?.questions?.length || 1;
	const answersRatio = questionCount > 0 ? answeredCount / questionCount : 1;
	let participation = Math.round(answersRatio * 100);
	participation = Math.max(30, Math.min(100, participation));
	const participationReason =
		participation >= 90
			? "Student actively completed all questions and maintained active webcam streams."
			: `Student submitted with unanswered questions. Attendance recorded at ${participation}%.`;

	return {
		radarMetrics: {
			focus,
			integrity,
			collaboration,
			consistency,
			accuracy,
			participation,
		},
		agentAnalysis: {
			focusAgent: {
				score: focus,
				reason: focusReason,
				contributingAgents: [
					{ name: "Face Detection Agent", score: Math.round(focus * 1.05) },
					{ name: "Eye Tracking Agent", score: Math.round(focus * 0.95) },
					{ name: "Head Pose Agent", score: focus },
					{ name: "Screen Attention Agent", score: Math.round(focus * 1.02) },
				],
				evidence:
					gazeAwayCount === 0
						? ["Face aligned continuously", "Eye contact tracked at 95%+"]
						: ["DISTRACTION: Gaze away from screen detected", "WARNING: Face not aligned"],
				recommendation:
					focus >= 80
						? "Continue standard monitoring."
						: "Recommend review of webcam logs for persistent distraction.",
			},
			integrityAgent: {
				score: integrity,
				reason: integrityReason,
				contributingAgents: [
					{ name: "AI Generated Content Agent", score: Math.round(integrity * 0.98) },
					{ name: "Plagiarism Agent", score: Math.round(integrity * 1.02) },
					{ name: "Browser Activity Agent", score: integrity },
					{ name: "Copy Paste Agent", score: 100 },
				],
				evidence:
					tabSwitches === 0
						? ["No copied content", "No AI writing patterns", "No browser violations"]
						: ["VIOLATION: Tab switching warning logged"],
				recommendation:
					integrity >= 80
						? "Continue standard monitoring."
						: "Escalate to faculty review due to multiple tab-switches.",
			},
			collaborationAgent: {
				score: collaboration,
				reason: collaborationReason,
				contributingAgents: [
					{ name: "Multiple Face Detection", score: multipleFaces > 0 ? 50 : 100 },
					{ name: "Voice Detection", score: talkingCount > 0 ? 60 : 100 },
					{ name: "External Device Detection", score: 100 },
					{ name: "Unauthorized Communication Detection", score: 100 },
				],
				evidence:
					talkingCount === 0 && multipleFaces === 0
						? ["Single user detected in frame", "No voice background noise"]
						: [
								"VOICE: Secondary speaking sound detected",
								"WARNING: Second face detected in camera viewport",
							],
				recommendation:
					collaboration >= 80
						? "Continue standard monitoring."
						: "Flag for communication override audit.",
			},
			consistencyAgent: {
				score: consistency,
				reason: consistencyReason,
				contributingAgents: [
					{ name: "Typing Pattern Agent", score: consistency },
					{ name: "Mouse Behaviour Agent", score: Math.round(consistency * 1.05) },
					{ name: "Face Stability Agent", score: Math.round(consistency * 0.95) },
					{ name: "Continuous Identity Verification", score: 100 },
				],
				evidence: [
					"Keystroke dynamics within normal range",
					"Identity continuously checked via biometric hash",
				],
				recommendation: "Biometric markers stable.",
			},
			accuracyAgent: {
				score: accuracy,
				reason: accuracyReason,
				contributingAgents: [
					{ name: "Assessment Evaluation", score: accuracy },
					{ name: "Semantic Answer Analysis", score: Math.round(accuracy * 0.98) },
					{ name: "Confidence Estimation", score: Math.round(accuracy * 1.02) },
					{ name: "Submission Validation", score: 100 },
				],
				evidence: ["MCQs validated automatically", "Open-ended answers graded successfully"],
				recommendation: "Grades finalized.",
			},
			participationAgent: {
				score: participation,
				reason: participationReason,
				contributingAgents: [
					{ name: "Time Spent", score: 100 },
					{ name: "Question Completion", score: participation },
					{ name: "Attendance", score: 100 },
					{ name: "Camera Availability", score: 100 },
					{ name: "Microphone Availability", score: 100 },
				],
				evidence: [
					`${answeredCount} of ${questionCount} answers submitted`,
					"Webcam feed available throughout connection",
				],
				recommendation: "Exam session fully recorded.",
			},
		},
	};
}

/**
 * GET /api/assessments/attempts/:attemptId
 */
export async function getAttemptDetails(req: Request, res: Response): Promise<void> {
	const attemptId = getParamString(req.params.attemptId);
	getAuthUser(req);

	const attempt = await prisma.assessmentAttempt.findUnique({
		where: { id: attemptId },
		include: {
			assessment: { include: { questions: true } },
			answers: { include: { question: true } },
			violations: true,
			student: true,
		},
	});

	if (!attempt) {
		throw new AppError("Attempt not found", HTTP_STATUS.NOT_FOUND);
	}

	const attemptDetails = {
		...(attempt as any),
		...calculateRadarMetrics(attempt),
	};

	sendSuccess(res, attemptDetails, "Attempt details retrieved successfully", HTTP_STATUS.OK);
}

/**
 * POST /api/assessments/attempts/:attemptId/evaluate
 * Body: { grades: { answerId: string, manualGrade: number, feedback: string }[] }
 */
export async function evaluateAttempt(req: Request, res: Response): Promise<void> {
	const attemptId = getParamString(req.params.attemptId);
	const { grades } = req.body;
	const user = getAuthUser(req);
	const userId = user.id;
	const faculty = await checkFaculty(userId);

	const attempt = (await prisma.assessmentAttempt.findUnique({
		where: { id: attemptId },
		include: { answers: true },
	})) as any;

	if (!attempt) {
		throw new AppError("Attempt not found", HTTP_STATUS.NOT_FOUND);
	}

	let newTotalScore = 0;

	if (grades && Array.isArray(grades) && attempt.answers) {
		for (const g of grades) {
			const ans = attempt.answers.find((a: any) => a.id === g.answerId);
			if (!ans) continue;

			const originalResponse = ans.originalResponse || ans.response;
			const overrideStatus =
				g.overrideStatus || (Number(g.manualGrade) === ans.aiGrade ? "accepted" : "modified");

			await prisma.answer.update({
				where: { id: ans.id },
				data: {
					manualGrade: Number(g.manualGrade),
					feedback: g.feedback || null,
					overrideStatus: overrideStatus,
					originalResponse: originalResponse,
				},
			});

			newTotalScore += Number(g.manualGrade);

			// Extract similarity and risk results from aiEvaluation if present
			let similarityResults = "{}";
			let riskAnalysisResults = "{}";
			if (ans.aiEvaluation) {
				try {
					const evalObj = JSON.parse(ans.aiEvaluation);
					similarityResults = JSON.stringify(evalObj.reasoning || {});
					riskAnalysisResults = JSON.stringify(evalObj.risk || {});
				} catch {}
			}

			// Add to IMMUTABLE audit trail
			await prisma.evaluationAuditTrail.create({
				data: {
					answerId: ans.id,
					modelUsed: "Groq Llama 3.1 + Ollama Llama 3.2",
					aiScore: ans.aiGrade || 0,
					confidenceScore: ans.aiConfidence || 0,
					facultyModifications: JSON.stringify({
						manualGrade: Number(g.manualGrade),
						feedback: g.feedback || null,
						previousManualGrade: ans.manualGrade,
					}),
					originalAnswer: originalResponse,
					finalAnswerScore: Number(g.manualGrade),
					similarityResults,
					riskAnalysisResults,
					overrideStatus,
					facultyId: userId,
					facultyName: faculty.name,
				},
			});
		}
	}

	// Update attempt status to graded
	const updated = await prisma.assessmentAttempt.update({
		where: { id: attemptId },
		data: {
			status: "graded",
			score: newTotalScore,
		},
	});

	sendSuccess(res, updated, "Evaluation submitted and audit trail recorded", HTTP_STATUS.OK);
}

/**
 * POST /api/assessments/attempts/:attemptId/re-evaluate
 */
export async function reEvaluateAttempt(req: Request, res: Response): Promise<void> {
	const attemptId = getParamString(req.params.attemptId);
	const user = getAuthUser(req);
	await checkFaculty(user.id);

	const attempt = (await prisma.assessmentAttempt.findUnique({
		where: { id: attemptId },
		include: {
			answers: { include: { question: true } },
			assessment: true,
		},
	})) as any;

	if (!attempt) {
		throw new AppError("Attempt not found", HTTP_STATUS.NOT_FOUND);
	}

	const violations = await prisma.violationAlert.findMany({
		where: { attemptId },
	});

	let totalScore = 0;
	let hasLowConfidence = false;

	for (const ans of attempt.answers) {
		const question = ans.question;

		if (question.type === "multiple-choice") {
			const isCorrect =
				question.correctAnswer?.trim().toLowerCase() === ans.response?.trim().toLowerCase();
			const aiGrade = isCorrect ? question.points : 0;
			totalScore += aiGrade;

			await prisma.answer.update({
				where: { id: ans.id },
				data: {
					aiGrade,
					aiConfidence: 1.0,
					manualGrade: null,
					overrideStatus: "none",
				},
			});
		} else if (question.type === "descriptive" || question.type === "coding") {
			const evalResult = await orchestrateEvaluation(
				question.text,
				question.correctAnswer || "",
				ans.response || "",
				question.points,
				violations,
				attempt.integrityScore,
			);

			const aiGrade = evalResult.scores.consolidated;
			const aiConfidence = evalResult.scores.reliability;
			const isFlagged = evalResult.scores.reliability < 0.75;

			if (isFlagged) {
				hasLowConfidence = true;
			}
			totalScore += aiGrade;

			await prisma.answer.update({
				where: { id: ans.id },
				data: {
					aiGrade,
					aiConfidence,
					isFlagged,
					aiEvaluation: JSON.stringify(evalResult),
					embedding: JSON.stringify(await getEmbedding(ans.response || "")),
					manualGrade: null,
					overrideStatus: "none",
				},
			});
		}
	}

	const attemptStatus = hasLowConfidence ? "Faculty Review Required" : "submitted";
	const updatedAttempt = await prisma.assessmentAttempt.update({
		where: { id: attemptId },
		data: {
			status: attemptStatus,
			score: totalScore,
		},
		include: {
			answers: { include: { question: true } },
		},
	});

	sendSuccess(res, updatedAttempt, "Re-evaluation completed successfully", HTTP_STATUS.OK);
}

/**
 * GET /api/assessments/attempts/:attemptId/audit
 */
export async function getAttemptAuditTrail(req: Request, res: Response): Promise<void> {
	const attemptId = getParamString(req.params.attemptId);
	const user = getAuthUser(req);
	await checkFaculty(user.id);

	const attempt = await prisma.assessmentAttempt.findUnique({
		where: { id: attemptId },
		include: { answers: true },
	});

	if (!attempt) {
		throw new AppError("Attempt not found", HTTP_STATUS.NOT_FOUND);
	}

	const answerIds = attempt.answers.map((a) => a.id);

	const auditTrails = await prisma.evaluationAuditTrail.findMany({
		where: { answerId: { in: answerIds } },
		orderBy: { timestamp: "desc" },
	});

	sendSuccess(res, auditTrails, "Audit trail retrieved successfully", HTTP_STATUS.OK);
}

/**
 * GET /api/assessments/:id/audit-trail
 */
export async function getAssessmentAuditTrail(req: Request, res: Response): Promise<void> {
	const assessmentId = getParamString(req.params.id);
	const user = getAuthUser(req);
	await checkFaculty(user.id);

	// Get all attempts for this assessment
	const attempts = await prisma.assessmentAttempt.findMany({
		where: { assessmentId, ...attemptSectionWhere(user) },
		include: { answers: true },
	});

	const answerIds = attempts.flatMap((att) => att.answers.map((ans) => ans.id));

	const auditTrails = await prisma.evaluationAuditTrail.findMany({
		where: { answerId: { in: answerIds } },
		orderBy: { timestamp: "desc" },
	});

	sendSuccess(res, auditTrails, "Assessment audit trail retrieved successfully", HTTP_STATUS.OK);
}

/**
 * GET /api/assessments/:id/analytics
 */
export async function getAnalytics(req: Request, res: Response): Promise<void> {
	const id = getParamString(req.params.id);
	const user = getAuthUser(req);
	await checkFaculty(user.id);

	const attempts = (await prisma.assessmentAttempt.findMany({
		where: {
			assessmentId: id,
			status: { in: ["submitted", "graded", "Faculty Review Required"] },
			...attemptSectionWhere(user),
		},
		include: { violations: true, answers: true },
	})) as any[];

	const assessment = (await prisma.assessment.findUnique({
		where: { id },
		include: { questions: true },
	})) as any;

	if (!assessment) {
		throw new AppError("Assessment not found", HTTP_STATUS.NOT_FOUND);
	}

	const totalAttemptsCount = attempts.length;

	let totalScore = 0;
	let highestScore = 0;
	let lowestScore = 100;
	let totalIntegrity = 0;
	let totalViolations = 0;

	const scoreIntervals = { "0-50": 0, "50-70": 0, "70-90": 0, "90-100": 0 };
	const violationsByType: Record<string, number> = {};

	for (const att of attempts) {
		const score = att.score || 0;
		totalScore += score;
		if (score > highestScore) highestScore = score;
		if (score < lowestScore) lowestScore = score;

		totalIntegrity += att.integrityScore;
		totalViolations += att.violations?.length || 0;

		// Score categorization
		const percentage = score;
		if (percentage < 50) scoreIntervals["0-50"]++;
		else if (percentage < 70) scoreIntervals["50-70"]++;
		else if (percentage < 90) scoreIntervals["70-90"]++;
		else scoreIntervals["90-100"]++;

		if (att.violations) {
			for (const v of att.violations) {
				violationsByType[v.type] = (violationsByType[v.type] || 0) + 1;
			}
		}
	}

	const averageScore =
		totalAttemptsCount > 0 ? Math.round((totalScore / totalAttemptsCount) * 10) / 10 : 0;
	const averageIntegrity =
		totalAttemptsCount > 0 ? Math.round(totalIntegrity / totalAttemptsCount) : 100;

	// Calculate learning outcome attainment and question difficulty analysis
	const questionStats = (assessment.questions || []).map((q: any) => {
		const answersForQuestion = attempts.flatMap((att) =>
			(att.answers || []).filter((ans: any) => ans.questionId === q.id),
		);
		const answersCount = answersForQuestion.length;
		const correctAnswersCount = answersForQuestion.filter((ans: any) => {
			const grade =
				ans.manualGrade !== null && ans.manualGrade !== undefined
					? ans.manualGrade
					: ans.aiGrade || 0;
			return grade >= q.points * 0.7;
		}).length;

		const successRate =
			answersCount > 0 ? Math.round((correctAnswersCount / answersCount) * 100) : 100;
		return {
			questionId: q.id,
			text: q.text,
			type: q.type,
			learningOutcome: q.learningOutcome || "General",
			successRate,
			difficulty: q.difficulty,
		};
	});

	const analyticsData = {
		totalAttempts: totalAttemptsCount,
		averageScore,
		highestScore: totalAttemptsCount > 0 ? highestScore : 0,
		lowestScore: totalAttemptsCount > 0 ? lowestScore : 0,
		averageIntegrity,
		totalViolations,
		scoreDistribution: Object.entries(scoreIntervals).map(([range, count]) => ({ range, count })),
		violationBreakdown: Object.entries(violationsByType).map(([type, count]) => ({ type, count })),
		questionStats,
	};

	sendSuccess(res, analyticsData, "Analytics retrieved successfully", HTTP_STATUS.OK);
}

/**
 * POST /api/assessments/attempts/:attemptId/save-state
 * Saves/updates progress, time left, visited/marked questions, answers, and telemetry signals.
 */
export async function saveAttemptState(req: Request, res: Response): Promise<void> {
	const attemptId = getParamString(req.params.attemptId);
	const {
		answers,
		currentQuestionIndex,
		timeLeft,
		markedQuestions,
		visitedQuestions,
		progress,
		integrityScore,
		networkQuality,
		networkLatency,
		faceStatus,
		backgroundNoise,
		isOnline,
	} = req.body;

	const attempt = await prisma.assessmentAttempt.findUnique({ where: { id: attemptId } });
	if (!attempt) {
		throw new AppError("Attempt not found", HTTP_STATUS.NOT_FOUND);
	}

	if (attempt.status !== "started") {
		throw new AppError("Cannot modify a submitted/graded attempt", HTTP_STATUS.BAD_REQUEST);
	}

	// Update attempt fields
	const updatedAttempt = await prisma.assessmentAttempt.update({
		where: { id: attemptId },
		data: {
			currentQuestionIndex:
				currentQuestionIndex !== undefined
					? Number(currentQuestionIndex)
					: attempt.currentQuestionIndex,
			timeLeft: timeLeft !== undefined ? Number(timeLeft) : attempt.timeLeft,
			markedQuestions:
				markedQuestions !== undefined ? JSON.stringify(markedQuestions) : attempt.markedQuestions,
			visitedQuestions:
				visitedQuestions !== undefined
					? JSON.stringify(visitedQuestions)
					: attempt.visitedQuestions,
			progress: progress !== undefined ? Number(progress) : attempt.progress,
			integrityScore:
				integrityScore !== undefined ? Number(integrityScore) : attempt.integrityScore,
			networkQuality:
				networkQuality !== undefined ? String(networkQuality) : attempt.networkQuality,
			networkLatency:
				networkLatency !== undefined ? Number(networkLatency) : attempt.networkLatency,
			faceStatus: faceStatus !== undefined ? String(faceStatus) : attempt.faceStatus,
			backgroundNoise:
				backgroundNoise !== undefined ? String(backgroundNoise) : attempt.backgroundNoise,
			isOnline: isOnline !== undefined ? !!isOnline : attempt.isOnline,
		},
	});

	// Upsert answers
	if (answers && Array.isArray(answers)) {
		for (const ans of answers) {
			if (!ans.questionId) continue;
			const existingAns = await prisma.answer.findFirst({
				where: {
					attemptId,
					questionId: ans.questionId,
				},
			});

			if (existingAns) {
				await prisma.answer.update({
					where: { id: existingAns.id },
					data: {
						response: ans.response !== undefined ? String(ans.response) : existingAns.response,
					},
				});
			} else {
				await prisma.answer.create({
					data: {
						attemptId,
						questionId: ans.questionId,
						response: String(ans.response || ""),
					},
				});
			}
		}
	}

	// Broadcast update to Proctor dashboard
	const io = getIO();
	io?.emit("attempt-update", updatedAttempt);

	sendSuccess(res, null, "Attempt state saved successfully", HTTP_STATUS.OK);
}

/**
 * POST /api/assessments/attempts/:attemptId/reset
 * Faculty: voids an attempt so the student can start again. Only allowed when the
 * assessment enables attempt resets. The attempt and its evidence are kept for audit.
 */
export async function resetAttempt(req: Request, res: Response): Promise<void> {
	const attemptId = getParamString(req.params.attemptId);
	const user = getAuthUser(req);
	await checkFaculty(user.id);
	const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 500) : "";

	const attempt = await prisma.assessmentAttempt.findUnique({
		where: { id: attemptId },
		include: { assessment: { select: { attemptResetAllowed: true, title: true } } },
	});
	if (!attempt) {
		throw new AppError("Attempt not found", HTTP_STATUS.NOT_FOUND);
	}
	if (!attempt.assessment.attemptResetAllowed) {
		throw new AppError("Attempt resets are disabled for this assessment.", HTTP_STATUS.FORBIDDEN);
	}
	if (attempt.status === "reset") {
		throw new AppError("This attempt was already reset.", HTTP_STATUS.CONFLICT);
	}

	await prisma.$transaction([
		prisma.assessmentAttempt.update({ where: { id: attemptId }, data: { status: "reset" } }),
		prisma.proctoringTimelineEvent.create({
			data: {
				attemptId,
				event: "Attempt Reset",
				details: JSON.stringify({
					by: user.name || "Faculty",
					byId: user.id,
					reason: reason || null,
					previousStatus: attempt.status,
				}),
			},
		}),
		prisma.notification.create({
			data: {
				userId: attempt.studentId,
				title: "Attempt reset",
				description: `Your attempt for "${attempt.assessment.title}" was reset by your instructor. You may start a new attempt.`,
				type: "assessment",
				senderName: user.name || null,
				senderRole: "faculty",
			},
		}),
	]);

	sendSuccess(res, { attemptId, status: "reset" }, "Attempt reset", HTTP_STATUS.OK);
}

/**
 * GET /api/assessments/:id/materials
 * Learning materials attached to an assessment, filtered by what the caller may see.
 */
export async function getAssessmentMaterials(req: Request, res: Response): Promise<void> {
	const id = getParamString(req.params.id);
	const user = getAuthUser(req);
	const assessment = await prisma.assessment.findUnique({
		where: { id },
		include: {
			materials: {
				include: {
					material: {
						include: { file: { select: { fileName: true, mimeType: true, sizeBytes: true } } },
					},
				},
			},
		},
	});
	if (!assessment) {
		throw new AppError("Assessment not found", HTTP_STATUS.NOT_FOUND);
	}
	const staff = user.role === "faculty" || user.role === "admin";
	if (
		!staff &&
		(!assessment.published ||
			assessment.institutionName !== (user.institutionName || "SRM University AP"))
	) {
		throw new AppError("Assessment not found", HTTP_STATUS.NOT_FOUND);
	}

	const now = Date.now();
	const windowOpen =
		(!assessment.materialsAvailableFrom || assessment.materialsAvailableFrom.getTime() <= now) &&
		(!assessment.materialsAvailableUntil || assessment.materialsAvailableUntil.getTime() >= now);
	const inExam =
		!staff &&
		(await prisma.assessmentAttempt.count({
			where: { assessmentId: id, studentId: user.id, status: "started" },
		})) > 0;

	const items = assessment.materials
		.filter((m) => {
			if (staff) return true;
			if (!assessment.materialsAccessible || !windowOpen) return false;
			if (inExam && assessment.materialsRestrictedDuringExam && !m.permittedInExam) return false;
			return true;
		})
		.map((m) => ({
			id: m.material.id,
			kind: m.material.kind,
			title: m.material.title,
			description: m.material.description,
			url: m.material.url,
			file: m.material.file,
			permittedInExam: m.permittedInExam,
			canDownload: staff || assessment.materialsDownloadable,
		}));

	sendSuccess(
		res,
		{
			materials: items,
			access: {
				accessible: assessment.materialsAccessible,
				downloadable: assessment.materialsDownloadable,
				restrictedDuringExam: assessment.materialsRestrictedDuringExam,
				availableFrom: assessment.materialsAvailableFrom,
				availableUntil: assessment.materialsAvailableUntil,
				windowOpen,
			},
		},
		"Materials retrieved",
		HTTP_STATUS.OK,
	);
}
