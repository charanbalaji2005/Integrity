import type { Request, Response } from "express";
import { HTTP_STATUS } from "../../../constants/http-status";
import { prisma } from "../../../database";
import { emitToAssessmentMonitors, getIO } from "../../../providers/socket";
import { AppError } from "../../../utils/app-error";
import { sendSuccess } from "../../../utils/response";
import { compileEvidenceInvestigation } from "../agents/evidence-agent";
import { generateProctoringReport } from "../agents/report-agent";
import { isAttemptFinal, loadAuthorizedAttempt } from "../services/attempt-access";
import {
	normalizeBrowserTelemetry,
	proctorPipeline,
	proctorSessionRegistry,
} from "../workflows/proctoring-graph";

/** ~4 MB of base64 — far above a 640x480 JPEG, small enough to stop abuse. */
const MAX_FRAME_LENGTH = 4 * 1024 * 1024;

function readFrame(raw: unknown): string | undefined {
	if (raw == null || raw === "") return undefined;
	if (typeof raw !== "string") {
		throw new AppError("Frame must be a base64 JPEG string.", HTTP_STATUS.BAD_REQUEST);
	}
	if (raw.length > MAX_FRAME_LENGTH) {
		throw new AppError("Frame is too large.", HTTP_STATUS.BAD_REQUEST);
	}
	return raw;
}

function assertActive(attempt: { status: string; proctoringStatus: string }) {
	if (isAttemptFinal(attempt)) {
		throw new AppError(
			`This proctoring session has ended (${attempt.proctoringStatus}).`,
			HTTP_STATUS.CONFLICT,
		);
	}
}

// 1. POST /api/ai-proctoring/start-session  (candidate only)
export async function startSession(req: Request, res: Response): Promise<void> {
	const attempt = await loadAuthorizedAttempt(req.user, req.body?.attemptId, "candidate");
	assertActive(attempt);

	const isFirstStart = !attempt.proctoringState;

	// Rehydrate from durable state; never reset PAUSED/WARNING back to NORMAL.
	const session = proctorSessionRegistry.ensureSession(attempt);

	const updated = await prisma.assessmentAttempt.update({
		where: { id: attempt.id },
		data: {
			isOnline: true,
			lastHeartbeatAt: new Date(),
			...(isFirstStart ? { proctoringState: proctorSessionRegistry.serialize(session) } : {}),
		},
	});

	await prisma.proctoringTimelineEvent.create({
		data: {
			attemptId: attempt.id,
			event: isFirstStart ? "EXAM STARTED" : "SESSION RECONNECTED",
			details: isFirstStart
				? "The assessment attempt and multi-agent AI proctoring stream started."
				: `Candidate reconnected; agent state restored (status ${session.status}, ${session.warningCount} warnings).`,
		},
	});

	emitToAssessmentMonitors(attempt.assessmentId, attempt.student?.section, "student-online", {
		attemptId: attempt.id,
		studentName: attempt.studentName,
		status: session.status,
		isOnline: true,
		lastHeartbeatAt: updated.lastHeartbeatAt,
		reconnected: !isFirstStart,
	});

	sendSuccess(
		res,
		{
			attemptId: attempt.id,
			status: session.status,
			warningCount: session.warningCount,
			calibrated: Boolean(session.baseline),
			identityEnrolled: Boolean(session.referenceDescriptor),
			resumed: !isFirstStart,
		},
		"Proctoring session initialized successfully.",
		HTTP_STATUS.OK,
	);
}

// 2. POST /api/ai-proctoring/calibrate  (candidate only; fails loudly)
export async function calibrateSession(req: Request, res: Response): Promise<void> {
	const attempt = await loadAuthorizedAttempt(req.user, req.body?.attemptId, "candidate");
	assertActive(attempt);

	const frame = readFrame(req.body?.frame);
	if (!frame) {
		throw new AppError(
			"Calibration requires a live camera frame.",
			HTTP_STATUS.UNPROCESSABLE_ENTITY,
		);
	}

	const { detectFacePerception, computeFaceDescriptor } = await import(
		"../perception/face-detector"
	);
	const perception = await detectFacePerception(frame);

	if (perception.error) {
		throw new AppError(
			"Calibration failed: the face analysis service is unavailable. Please retry.",
			HTTP_STATUS.UNPROCESSABLE_ENTITY,
		);
	}
	if (!perception.detected || perception.faceCount === 0) {
		throw new AppError(
			"Calibration failed: no face detected. Sit facing the camera in good lighting.",
			HTTP_STATUS.UNPROCESSABLE_ENTITY,
		);
	}
	if (perception.faceCount > 1) {
		throw new AppError(
			"Calibration failed: more than one face is visible. Only the candidate may be in frame.",
			HTTP_STATUS.UNPROCESSABLE_ENTITY,
		);
	}
	if (!perception.pose) {
		throw new AppError(
			"Calibration failed: head pose could not be estimated. Please face the screen.",
			HTTP_STATUS.UNPROCESSABLE_ENTITY,
		);
	}

	const descriptor = await computeFaceDescriptor(frame);

	const session = proctorSessionRegistry.ensureSession(attempt);
	proctorSessionRegistry.setCalibration(
		attempt.id,
		{
			baselineYaw: perception.pose.yaw,
			baselinePitch: perception.pose.pitch,
			baselineRoll: perception.pose.roll,
			baselineFaceBox: perception.box,
			calibratedAt: Date.now(),
		},
		descriptor,
	);
	await proctorSessionRegistry.persist(session);

	await prisma.proctoringTimelineEvent.create({
		data: {
			attemptId: attempt.id,
			event: "CAMERA CALIBRATED",
			details: `Baseline head pose established (Yaw: ${perception.pose.yaw.toFixed(1)}°, Pitch: ${perception.pose.pitch.toFixed(1)}°, Roll: ${perception.pose.roll.toFixed(1)}°). Identity enrolment: ${descriptor ? "captured" : "not captured (identity continuity will be inconclusive)"}.`,
		},
	});

	sendSuccess(
		res,
		{
			attemptId: attempt.id,
			calibrated: true,
			identityEnrolled: Boolean(descriptor),
			baseline: {
				yaw: perception.pose.yaw,
				pitch: perception.pose.pitch,
				roll: perception.pose.roll,
			},
		},
		"Camera calibration baseline established successfully.",
		HTTP_STATUS.OK,
	);
}

// 3. POST /api/ai-proctoring/process-frame  (candidate only, single-flight per attempt)
export async function processFrame(req: Request, res: Response): Promise<void> {
	const attempt = await loadAuthorizedAttempt(req.user, req.body?.attemptId, "candidate");
	assertActive(attempt);

	const frame = readFrame(req.body?.frame);
	const browser = normalizeBrowserTelemetry(req.body?.browserEvent);

	if (!proctorSessionRegistry.tryAcquire(attempt.id)) {
		// A previous frame for this attempt is still being analysed. Dropping this
		// one keeps telemetry ordered and stops CPU pile-ups.
		sendSuccess(
			res,
			{ attemptId: attempt.id, skipped: true, reason: "previous-frame-in-flight" },
			"Frame skipped: previous frame still processing.",
			HTTP_STATUS.OK,
		);
		return;
	}

	try {
		proctorSessionRegistry.ensureSession(attempt);

		const pipelineResult = await proctorPipeline.invoke({
			attemptId: attempt.id,
			frame,
			browser,
			networkDetails: req.body?.networkDetails,
		});

		const session = proctorSessionRegistry.getSession(attempt.id);
		const metrics = pipelineResult.metrics;

		sendSuccess(
			res,
			{
				attemptId: attempt.id,
				skipped: false,
				integrityScore: metrics.compositeScore,
				metrics,
				quality: pipelineResult.qualityResult,
				pose: pipelineResult.faceResult?.pose,
				agentHealth: session.health,
				status: session.status,
				newEvents: pipelineResult.newEvents || [],
				action: pipelineResult.action || "none",
				message: pipelineResult.statusMessage,
				warningCount: session.warningCount,
			},
			"Frame processed successfully.",
			HTTP_STATUS.OK,
		);
	} catch (err: unknown) {
		console.error("[processFrame] Error in proctoring pipeline execution:", err);
		throw new AppError("Failed to process proctor frame.", HTTP_STATUS.INTERNAL_SERVER_ERROR);
	} finally {
		proctorSessionRegistry.release(attempt.id);
	}
}

// 4. POST /api/ai-proctoring/end-session  (candidate only, idempotent)
export async function endSession(req: Request, res: Response): Promise<void> {
	const attempt = await loadAuthorizedAttempt(req.user, req.body?.attemptId, "candidate");

	if (attempt.proctoringStatus === "SUBMITTED" || attempt.proctoringStatus === "TERMINATED") {
		sendSuccess(
			res,
			{ attemptId: attempt.id, status: attempt.proctoringStatus },
			"Proctoring session already closed.",
			HTTP_STATUS.OK,
		);
		return;
	}

	const session = proctorSessionRegistry.ensureSession(attempt);
	const metrics = session.fusion.computeMetrics();
	const investigation = compileEvidenceInvestigation(attempt.id, session.fusion.getRecentEvents());

	await prisma.proctoringTimelineEvent.create({
		data: {
			attemptId: attempt.id,
			event: "EXAM SUBMITTED",
			details: `Candidate submitted the attempt. Evidence confidence ${metrics.evidenceConfidence}%, identity ${metrics.identityVerification}, decision: ${metrics.decision}.`,
		},
	});

	const timeline = await prisma.proctoringTimelineEvent.findMany({
		where: { attemptId: attempt.id },
		orderBy: { timestamp: "asc" },
	});
	const timelineText = timeline
		.map((e) => `[${e.timestamp.toISOString()}] ${e.event}: ${e.details || ""}`)
		.join("\n");

	session.status = "SUBMITTED";
	await prisma.assessmentAttempt.update({
		where: { id: attempt.id },
		data: {
			proctoringStatus: "SUBMITTED",
			submittedAt: attempt.submittedAt ?? new Date(),
			integrityScore: metrics.compositeScore,
			isOnline: false,
			proctoringState: proctorSessionRegistry.serialize(session),
		},
	});

	generateProctoringReport({
		attemptId: attempt.id,
		studentName: attempt.studentName,
		metrics,
		warningCount: session.warningCount,
		timelineText,
		investigation,
	})
		.then(async (summary) => {
			await prisma.assessmentAttempt.update({
				where: { id: attempt.id },
				data: { proctoringSummary: summary },
			});
		})
		.catch((err) => {
			console.error("[endSession] Report generation error:", err);
		});

	proctorSessionRegistry.removeSession(attempt.id);

	emitToAssessmentMonitors(attempt.assessmentId, attempt.student?.section, "student-offline", {
		attemptId: attempt.id,
		studentName: attempt.studentName,
		status: "SUBMITTED",
		isOnline: false,
	});

	sendSuccess(
		res,
		{ attemptId: attempt.id, decision: metrics.decision },
		"Proctoring session ended and report finalized.",
		HTTP_STATUS.OK,
	);
}

function readParam(value: string | string[] | undefined): string {
	return Array.isArray(value) ? value[0] : String(value ?? "");
}

// 5. GET /api/ai-proctoring/session/:id  (candidate or supervising faculty)
export async function getSession(req: Request, res: Response): Promise<void> {
	const attempt = await loadAuthorizedAttempt(
		req.user,
		readParam(req.params.id),
		"candidate-or-monitor",
	);

	const [violations, timeline] = await Promise.all([
		prisma.violationAlert.findMany({
			where: { attemptId: attempt.id },
			orderBy: { timestamp: "desc" },
			take: 5,
		}),
		prisma.proctoringTimelineEvent.findMany({
			where: { attemptId: attempt.id },
			orderBy: { timestamp: "asc" },
		}),
	]);

	const session = proctorSessionRegistry.ensureSession(attempt);
	const metrics = session.fusion.computeMetrics();
	if (isAttemptFinal(attempt)) proctorSessionRegistry.removeSession(attempt.id);

	sendSuccess(
		res,
		{
			attemptId: attempt.id,
			studentId: attempt.studentId,
			studentName: attempt.studentName,
			assessmentId: attempt.assessmentId,
			integrityScore: metrics.compositeScore,
			metrics,
			agentHealth: session.health,
			warningCount: attempt.warningCount,
			proctoringStatus: attempt.proctoringStatus,
			isOnline: attempt.isOnline,
			lastFrameAt: attempt.lastFrameAt,
			lastHeartbeatAt: attempt.lastHeartbeatAt,
			currentViolations: violations.map((v) => v.description),
			timeline,
			proctoringSummary: attempt.proctoringSummary,
		},
		"Session details fetched successfully.",
		HTTP_STATUS.OK,
	);
}

// 6. GET /api/ai-proctoring/report/:attemptId  (candidate or supervising faculty)
export async function getReport(req: Request, res: Response): Promise<void> {
	const attempt = await loadAuthorizedAttempt(
		req.user,
		readParam(req.params.attemptId),
		"candidate-or-monitor",
	);

	const [timeline, violationsCount] = await Promise.all([
		prisma.proctoringTimelineEvent.findMany({
			where: { attemptId: attempt.id },
			orderBy: { timestamp: "asc" },
		}),
		prisma.violationAlert.count({ where: { attemptId: attempt.id } }),
	]);

	sendSuccess(
		res,
		{
			attemptId: attempt.id,
			studentName: attempt.studentName,
			integrityScore: attempt.integrityScore,
			warningCount: attempt.warningCount,
			status: attempt.proctoringStatus,
			timeline,
			summary: attempt.proctoringSummary,
			violationsCount,
		},
		"Proctoring report details fetched successfully.",
		HTTP_STATUS.OK,
	);
}

// --- Faculty controls (assessment owner or admin only) ---

async function applyFacultyStatus(
	attempt: Awaited<ReturnType<typeof loadAuthorizedAttempt>>,
	status: "NORMAL" | "PAUSED" | "TERMINATED" | "WARNING",
	extra: { warningIncrement?: boolean; attemptStatus?: string } = {},
) {
	const session = proctorSessionRegistry.ensureSession(attempt);
	session.status = status;
	if (extra.warningIncrement) session.warningCount += 1;

	const updated = await prisma.assessmentAttempt.update({
		where: { id: attempt.id },
		data: {
			proctoringStatus: status,
			warningCount: session.warningCount,
			...(extra.attemptStatus ? { status: extra.attemptStatus } : {}),
			proctoringState: proctorSessionRegistry.serialize(session),
		},
	});
	if (status === "TERMINATED") proctorSessionRegistry.removeSession(attempt.id);
	return { session, updated };
}

// 7. POST /api/ai-proctoring/faculty/resume
export async function facultyResume(req: Request, res: Response): Promise<void> {
	const attempt = await loadAuthorizedAttempt(req.user, req.body?.attemptId, "monitor");
	assertActive(attempt);

	const { session, updated } = await applyFacultyStatus(attempt, "NORMAL", {
		attemptStatus: "started",
	});

	await prisma.proctoringTimelineEvent.create({
		data: {
			attemptId: attempt.id,
			event: "FACULTY RESUMED EXAM",
			details: `Resumed by ${req.user.name || "faculty"} after reviewing telemetry.`,
		},
	});

	const io = getIO();
	io?.to(`student-proctoring-${attempt.id}`).emit("proctor-action", {
		action: "resume-exam",
		status: "NORMAL",
		message: "Your examination has been resumed by the faculty proctor.",
	});
	emitToAssessmentMonitors(attempt.assessmentId, attempt.student?.section, "proctor-telemetry", {
		attemptId: attempt.id,
		integrityScore: updated.integrityScore,
		warningCount: session.warningCount,
		proctoringStatus: "NORMAL",
		activeViolations: [],
	});

	sendSuccess(res, null, "Examination successfully resumed.", HTTP_STATUS.OK);
}

// 8. POST /api/ai-proctoring/faculty/terminate
export async function facultyTerminate(req: Request, res: Response): Promise<void> {
	const attempt = await loadAuthorizedAttempt(req.user, req.body?.attemptId, "monitor");
	assertActive(attempt);

	const { session, updated } = await applyFacultyStatus(attempt, "TERMINATED", {
		attemptStatus: "submitted",
	});

	await prisma.proctoringTimelineEvent.create({
		data: {
			attemptId: attempt.id,
			event: "FACULTY TERMINATED EXAM",
			details: `Terminated by ${req.user.name || "faculty"}.${req.body?.reason ? ` Reason: ${String(req.body.reason).slice(0, 500)}` : ""}`,
		},
	});

	const io = getIO();
	io?.to(`student-proctoring-${attempt.id}`).emit("proctor-action", {
		action: "terminate-exam",
		status: "TERMINATED",
		message: "Your examination has been terminated by the faculty proctor.",
	});
	emitToAssessmentMonitors(attempt.assessmentId, attempt.student?.section, "proctor-telemetry", {
		attemptId: attempt.id,
		integrityScore: updated.integrityScore,
		warningCount: session.warningCount,
		proctoringStatus: "TERMINATED",
		activeViolations: ["Manual termination by faculty"],
	});

	sendSuccess(res, null, "Examination terminated successfully.", HTTP_STATUS.OK);
}

// 9. POST /api/ai-proctoring/faculty/pause
export async function facultyPause(req: Request, res: Response): Promise<void> {
	const attempt = await loadAuthorizedAttempt(req.user, req.body?.attemptId, "monitor");
	assertActive(attempt);

	const { session, updated } = await applyFacultyStatus(attempt, "PAUSED");

	await prisma.proctoringTimelineEvent.create({
		data: {
			attemptId: attempt.id,
			event: "FACULTY PAUSED EXAM",
			details: `Paused by ${req.user.name || "faculty"} for inspection.`,
		},
	});

	const io = getIO();
	io?.to(`student-proctoring-${attempt.id}`).emit("proctor-action", {
		action: "pause-exam",
		status: "PAUSED",
		message: "Your examination has been paused by the faculty proctor for verification.",
	});
	emitToAssessmentMonitors(attempt.assessmentId, attempt.student?.section, "proctor-telemetry", {
		attemptId: attempt.id,
		integrityScore: updated.integrityScore,
		warningCount: session.warningCount,
		proctoringStatus: "PAUSED",
		activeViolations: ["Paused by faculty"],
	});

	sendSuccess(res, null, "Examination paused successfully.", HTTP_STATUS.OK);
}

// 10. POST /api/ai-proctoring/faculty/warning
export async function facultyWarning(req: Request, res: Response): Promise<void> {
	const attempt = await loadAuthorizedAttempt(req.user, req.body?.attemptId, "monitor");
	assertActive(attempt);

	// A warning must not silently un-pause a paused exam.
	const nextStatus = attempt.proctoringStatus === "PAUSED" ? "PAUSED" : "WARNING";
	const { session, updated } = await applyFacultyStatus(attempt, nextStatus, {
		warningIncrement: true,
	});

	const rawMessage = typeof req.body?.message === "string" ? req.body.message.trim() : "";
	const warningText =
		rawMessage.slice(0, 500) || "Faculty notice: please keep your eyes on the screen.";

	await prisma.proctoringTimelineEvent.create({
		data: { attemptId: attempt.id, event: "FACULTY WARNING", details: warningText },
	});

	const io = getIO();
	io?.to(`student-proctoring-${attempt.id}`).emit("proctor-action", {
		action: "warning",
		status: nextStatus,
		message: warningText,
	});
	emitToAssessmentMonitors(attempt.assessmentId, attempt.student?.section, "proctor-telemetry", {
		attemptId: attempt.id,
		integrityScore: updated.integrityScore,
		warningCount: session.warningCount,
		proctoringStatus: nextStatus,
		activeViolations: [warningText],
	});

	sendSuccess(res, null, "Warning dispatched successfully.", HTTP_STATUS.OK);
}
