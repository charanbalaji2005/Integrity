import type { Request, Response } from "express";
import { HTTP_STATUS } from "../../../constants/http-status";
import { prisma } from "../../../database";
import { getIO } from "../../../providers/socket";
import { AppError } from "../../../utils/app-error";
import { sendSuccess } from "../../../utils/response";
import { generateProctoringReport } from "../agents/report-agent";
import { proctorPipeline, proctorSessionRegistry } from "../workflows/proctoring-graph";

// 1. POST /api/ai-proctoring/start-session
export async function startSession(req: Request, res: Response): Promise<void> {
	const { attemptId } = req.body;
	if (!attemptId) {
		throw new AppError("Attempt ID is required.", HTTP_STATUS.BAD_REQUEST);
	}

	const attempt = await prisma.assessmentAttempt.findUnique({
		where: { id: attemptId },
	});

	if (!attempt) {
		throw new AppError("Assessment attempt not found.", HTTP_STATUS.NOT_FOUND);
	}

	// Initialize session registry context
	const session = proctorSessionRegistry.getSession(attemptId);
	session.status = "NORMAL";
	session.warningCount = attempt.warningCount || 0;

	// Update DB proctoring status
	await prisma.assessmentAttempt.update({
		where: { id: attemptId },
		data: {
			proctoringStatus: "NORMAL",
		},
	});

	// Log start event
	await prisma.proctoringTimelineEvent.create({
		data: {
			attemptId,
			event: "EXAM STARTED",
			details:
				"The assessment attempt and multi-agent AI proctoring stream have successfully started.",
		},
	});

	// Emit online status via sockets
	const io = getIO();
	io?.to(`assessment-proctoring-${attempt.assessmentId}`).emit("student-online", {
		attemptId,
		studentName: attempt.studentName,
	});

	sendSuccess(res, { attemptId }, "Proctoring session initialized successfully.", HTTP_STATUS.OK);
}

// 2. POST /api/ai-proctoring/calibrate
export async function calibrateSession(req: Request, res: Response): Promise<void> {
	const { attemptId, frame, baselineYaw, baselinePitch, baselineRoll, baselineFaceBox } = req.body;
	if (!attemptId) {
		throw new AppError("Attempt ID is required.", HTTP_STATUS.BAD_REQUEST);
	}

	let finalYaw = Number(baselineYaw || 0);
	let finalPitch = Number(baselinePitch || 0);
	let finalRoll = Number(baselineRoll || 0);
	let finalBox = baselineFaceBox;

	if (frame && !baselineYaw && !baselinePitch) {
		try {
			const { detectFacePerception } = await import("../perception/face-detector");
			const perception = await detectFacePerception(frame);
			if (perception.detected && perception.pose) {
				finalYaw = perception.pose.yaw;
				finalPitch = perception.pose.pitch;
				finalRoll = perception.pose.roll;
				finalBox = perception.box;
			}
		} catch (err) {
			console.warn("[calibrateSession] Face perception fallback:", err);
		}
	}

	proctorSessionRegistry.setCalibration(attemptId, {
		baselineYaw: finalYaw,
		baselinePitch: finalPitch,
		baselineRoll: finalRoll,
		baselineFaceBox: finalBox,
		calibratedAt: Date.now(),
	});

	// Log calibration event
	await prisma.proctoringTimelineEvent.create({
		data: {
			attemptId,
			event: "CAMERA CALIBRATED",
			details: `Baseline head pose established (Yaw: ${finalYaw.toFixed(1)}°, Pitch: ${finalPitch.toFixed(1)}°, Roll: ${finalRoll.toFixed(1)}°).`,
		},
	});

	sendSuccess(
		res,
		{
			attemptId,
			calibrated: true,
			baseline: { yaw: finalYaw, pitch: finalPitch, roll: finalRoll },
		},
		"Camera calibration baseline established successfully.",
		HTTP_STATUS.OK,
	);
}

// 3. POST /api/ai-proctoring/process-frame
export async function processFrame(req: Request, res: Response): Promise<void> {
	const { attemptId, frame, browserEvent, networkDetails } = req.body;
	if (!attemptId) {
		throw new AppError("Attempt ID is required.", HTTP_STATUS.BAD_REQUEST);
	}

	try {
		const pipelineResult = await proctorPipeline.invoke({
			attemptId,
			frame,
			browserEvent,
			networkDetails,
		});

		const session = proctorSessionRegistry.getSession(attemptId);
		const metrics = session.fusion.computeMetrics(pipelineResult.qualityResult?.qualityScore || 85);

		sendSuccess(
			res,
			{
				attemptId,
				integrityScore: metrics.compositeScore,
				metrics,
				quality: pipelineResult.qualityResult,
				pose: pipelineResult.faceResult?.pose,
				status: session.status,
				newEvents: pipelineResult.newEvents || [],
				action: pipelineResult.action || "none",
				warningCount: session.warningCount,
			},
			"Frame processed successfully.",
			HTTP_STATUS.OK,
		);
	} catch (err: any) {
		console.error("[processFrame] Error in proctoring pipeline execution:", err);
		throw new AppError("Failed to process proctor frame.", HTTP_STATUS.INTERNAL_SERVER_ERROR);
	}
}

// 4. POST /api/ai-proctoring/end-session
export async function endSession(req: Request, res: Response): Promise<void> {
	const { attemptId } = req.body;
	if (!attemptId) {
		throw new AppError("Attempt ID is required.", HTTP_STATUS.BAD_REQUEST);
	}

	const attempt = await prisma.assessmentAttempt.findUnique({
		where: { id: attemptId },
		include: {
			proctoringTimeline: {
				orderBy: { timestamp: "asc" },
			},
		},
	});

	if (!attempt) {
		throw new AppError("Assessment attempt not found.", HTTP_STATUS.NOT_FOUND);
	}

	// Log submit event
	await prisma.proctoringTimelineEvent.create({
		data: {
			attemptId,
			event: "EXAM SUBMITTED",
			details: "Candidate finished and submitted the assessment attempt.",
		},
	});

	const session = proctorSessionRegistry.getSession(attemptId);
	const metrics = session.fusion.computeMetrics();

	const timelineText = attempt.proctoringTimeline
		.map((e) => `[${e.timestamp.toISOString()}] ${e.event}: ${e.details || ""}`)
		.join("\n");

	// Update DB state immediately
	await prisma.assessmentAttempt.update({
		where: { id: attemptId },
		data: {
			proctoringStatus: "SUBMITTED",
			submittedAt: new Date(),
			integrityScore: metrics.compositeScore,
		},
	});

	// Trigger asynchronous report generation
	generateProctoringReport({
		attemptId,
		studentName: attempt.studentName,
		metrics,
		warningCount: session.warningCount,
		timelineText,
	})
		.then(async (summary) => {
			await prisma.assessmentAttempt.update({
				where: { id: attemptId },
				data: { proctoringSummary: summary },
			});
		})
		.catch((err) => {
			console.error("[endSession] Report generation error:", err);
		});

	// Cleanup session
	proctorSessionRegistry.removeSession(attemptId);

	// Emit offline event to faculty
	const io = getIO();
	io?.to(`assessment-proctoring-${attempt.assessmentId}`).emit("student-offline", {
		attemptId,
		status: "SUBMITTED",
	});

	sendSuccess(res, { attemptId }, "Proctoring session ended and report finalized.", HTTP_STATUS.OK);
}

// 5. GET /api/ai-proctoring/session/:id
export async function getSession(req: Request, res: Response): Promise<void> {
	const id = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id);
	if (!id || typeof id !== "string") {
		throw new AppError("Attempt/Session ID is required.", HTTP_STATUS.BAD_REQUEST);
	}

	const attempt = await prisma.assessmentAttempt.findUnique({
		where: { id },
		include: {
			violations: true,
			proctoringTimeline: {
				orderBy: { timestamp: "asc" },
			},
		},
	});

	if (!attempt) {
		throw new AppError("Session attempt not found.", HTTP_STATUS.NOT_FOUND);
	}

	const session = proctorSessionRegistry.getSession(id);
	const metrics = session.fusion.computeMetrics();

	sendSuccess(
		res,
		{
			attemptId: attempt.id,
			studentId: attempt.studentId,
			studentName: attempt.studentName,
			assessmentId: attempt.assessmentId,
			integrityScore: metrics.compositeScore,
			metrics,
			warningCount: attempt.warningCount,
			proctoringStatus: attempt.proctoringStatus,
			currentViolations: attempt.violations.slice(-5).map((v) => v.description),
			timeline: attempt.proctoringTimeline,
			proctoringSummary: attempt.proctoringSummary,
		},
		"Session details fetched successfully.",
		HTTP_STATUS.OK,
	);
}

// 6. GET /api/ai-proctoring/report/:attemptId
export async function getReport(req: Request, res: Response): Promise<void> {
	const attemptId = req.params.attemptId;
	if (!attemptId || typeof attemptId !== "string") {
		throw new AppError("Attempt ID is required.", HTTP_STATUS.BAD_REQUEST);
	}

	const attempt = await prisma.assessmentAttempt.findUnique({
		where: { id: attemptId },
		include: {
			proctoringTimeline: {
				orderBy: { timestamp: "asc" },
			},
			violations: true,
		},
	});

	if (!attempt) {
		throw new AppError("Attempt report not found.", HTTP_STATUS.NOT_FOUND);
	}

	sendSuccess(
		res,
		{
			attemptId: attempt.id,
			studentName: attempt.studentName,
			integrityScore: attempt.integrityScore,
			warningCount: attempt.warningCount,
			status: attempt.proctoringStatus,
			timeline: attempt.proctoringTimeline,
			summary: attempt.proctoringSummary,
			violationsCount: attempt.violations.length,
		},
		"Proctoring report details fetched successfully.",
		HTTP_STATUS.OK,
	);
}

// 7. POST /api/ai-proctoring/faculty/resume
export async function facultyResume(req: Request, res: Response): Promise<void> {
	const { attemptId } = req.body;
	if (!attemptId) {
		throw new AppError("Attempt ID is required.", HTTP_STATUS.BAD_REQUEST);
	}

	const attempt = await prisma.assessmentAttempt.findUnique({
		where: { id: attemptId },
	});

	if (!attempt) {
		throw new AppError("Assessment attempt not found.", HTTP_STATUS.NOT_FOUND);
	}

	if (attempt.status === "submitted" || attempt.status === "graded") {
		throw new AppError("Cannot resume a completed assessment attempt.", HTTP_STATUS.BAD_REQUEST);
	}

	const session = proctorSessionRegistry.getSession(attemptId);
	session.status = "NORMAL";

	await prisma.assessmentAttempt.update({
		where: { id: attemptId },
		data: {
			proctoringStatus: "NORMAL",
			status: "started",
		},
	});

	await prisma.proctoringTimelineEvent.create({
		data: {
			attemptId,
			event: "FACULTY RESUMED EXAM",
			details: "Faculty administrator manually reviewed telemetry and resumed the examination.",
		},
	});

	const io = getIO();
	io?.to(`student-proctoring-${attemptId}`).emit("proctor-action", {
		action: "resume-exam",
		status: "NORMAL",
		message: "Your examination has been manually resumed by the faculty advisor.",
	});

	io?.to(`assessment-proctoring-${attempt.assessmentId}`).emit("proctor-telemetry", {
		attemptId,
		integrityScore: attempt.integrityScore,
		warningCount: session.warningCount,
		proctoringStatus: "NORMAL",
		currentViolations: [],
	});

	sendSuccess(res, null, "Examination successfully resumed.", HTTP_STATUS.OK);
}

// 8. POST /api/ai-proctoring/faculty/terminate
export async function facultyTerminate(req: Request, res: Response): Promise<void> {
	const { attemptId } = req.body;
	if (!attemptId) {
		throw new AppError("Attempt ID is required.", HTTP_STATUS.BAD_REQUEST);
	}

	const attempt = await prisma.assessmentAttempt.findUnique({
		where: { id: attemptId },
	});

	if (!attempt) {
		throw new AppError("Assessment attempt not found.", HTTP_STATUS.NOT_FOUND);
	}

	if (attempt.status === "submitted" || attempt.status === "graded") {
		throw new AppError("Cannot terminate a completed assessment attempt.", HTTP_STATUS.BAD_REQUEST);
	}

	const session = proctorSessionRegistry.getSession(attemptId);
	session.status = "TERMINATED";

	await prisma.assessmentAttempt.update({
		where: { id: attemptId },
		data: {
			proctoringStatus: "TERMINATED",
			status: "submitted",
		},
	});

	await prisma.proctoringTimelineEvent.create({
		data: {
			attemptId,
			event: "FACULTY TERMINATED EXAM",
			details:
				"Faculty administrator manually terminated the exam due to severe integrity violations.",
		},
	});

	const io = getIO();
	io?.to(`student-proctoring-${attemptId}`).emit("proctor-action", {
		action: "terminate-exam",
		status: "TERMINATED",
		message: "Your examination has been terminated by the faculty administrator.",
	});

	io?.to(`assessment-proctoring-${attempt.assessmentId}`).emit("proctor-telemetry", {
		attemptId,
		integrityScore: attempt.integrityScore,
		warningCount: session.warningCount,
		proctoringStatus: "TERMINATED",
		currentViolations: ["Manual termination by Faculty Admin"],
	});

	sendSuccess(res, null, "Examination terminated successfully.", HTTP_STATUS.OK);
}

// 9. POST /api/ai-proctoring/faculty/pause
export async function facultyPause(req: Request, res: Response): Promise<void> {
	const { attemptId } = req.body;
	if (!attemptId) {
		throw new AppError("Attempt ID is required.", HTTP_STATUS.BAD_REQUEST);
	}

	const attempt = await prisma.assessmentAttempt.findUnique({
		where: { id: attemptId },
	});

	if (!attempt) {
		throw new AppError("Assessment attempt not found.", HTTP_STATUS.NOT_FOUND);
	}

	const session = proctorSessionRegistry.getSession(attemptId);
	session.status = "PAUSED";

	await prisma.assessmentAttempt.update({
		where: { id: attemptId },
		data: {
			proctoringStatus: "PAUSED",
		},
	});

	await prisma.proctoringTimelineEvent.create({
		data: {
			attemptId,
			event: "FACULTY PAUSED EXAM",
			details: "Faculty administrator manually paused the examination for inspection.",
		},
	});

	const io = getIO();
	io?.to(`student-proctoring-${attemptId}`).emit("proctor-action", {
		action: "pause-exam",
		status: "PAUSED",
		message: "Your examination has been paused by the faculty proctor for verification.",
	});

	sendSuccess(res, null, "Examination paused successfully.", HTTP_STATUS.OK);
}

// 10. POST /api/ai-proctoring/faculty/warning
export async function facultyWarning(req: Request, res: Response): Promise<void> {
	const { attemptId, message } = req.body;
	if (!attemptId) {
		throw new AppError("Attempt ID is required.", HTTP_STATUS.BAD_REQUEST);
	}

	const attempt = await prisma.assessmentAttempt.findUnique({
		where: { id: attemptId },
	});

	if (!attempt) {
		throw new AppError("Assessment attempt not found.", HTTP_STATUS.NOT_FOUND);
	}

	const session = proctorSessionRegistry.getSession(attemptId);
	session.warningCount += 1;
	session.status = "WARNING";

	await prisma.assessmentAttempt.update({
		where: { id: attemptId },
		data: {
			warningCount: { increment: 1 },
			proctoringStatus: "WARNING",
		},
	});

	const warningText = message || "Faculty Invigilator Notice: Please keep eyes centered on screen.";
	await prisma.proctoringTimelineEvent.create({
		data: {
			attemptId,
			event: "FACULTY WARNING",
			details: warningText,
		},
	});

	const io = getIO();
	io?.to(`student-proctoring-${attemptId}`).emit("proctor-action", {
		action: "warning",
		status: "WARNING",
		message: warningText,
	});

	io?.to(`assessment-proctoring-${attempt.assessmentId}`).emit("proctor-telemetry", {
		attemptId,
		integrityScore: attempt.integrityScore,
		warningCount: session.warningCount,
		proctoringStatus: "WARNING",
		activeViolations: [warningText],
	});

	sendSuccess(res, null, "Warning dispatched successfully.", HTTP_STATUS.OK);
}
