import type { Request, Response } from "express";
import { HTTP_STATUS } from "../../../constants/http-status";
import { AppError } from "../../../utils/app-error";
import { sendSuccess } from "../../../utils/response";
import { loadAuthorizedAttempt } from "../services/attempt-access";
import {
	assertUploadWindowOpen,
	baseMimeType,
	getRecordingStatus,
	listSegments,
	openSegment,
	parseSegmentMeta,
	RECORDING_MIME_TYPES,
	saveSegment,
} from "../services/recording-service";

const paramOf = (req: Request, key: string) => {
	const raw = req.params[key];
	return Array.isArray(raw) ? raw[0] : raw;
};

/** POST /:attemptId/segments — the candidate uploads one recorded segment. */
export async function uploadSegment(req: Request, res: Response) {
	const attempt = await loadAuthorizedAttempt(req.user, paramOf(req, "attemptId"), "candidate");
	assertUploadWindowOpen(attempt);

	const file = req.file;
	if (!file?.buffer?.length) {
		throw new AppError("No recording segment was uploaded.", HTTP_STATUS.BAD_REQUEST);
	}
	const meta = parseSegmentMeta(req.body ?? {});
	const { segment, duplicate } = await saveSegment({
		attemptId: attempt.id,
		meta,
		mimeType: baseMimeType(file.mimetype),
		data: file.buffer,
	});

	return sendSuccess(
		res,
		{ sequence: segment.sequence, sha256: segment.sha256, duplicate },
		duplicate ? "Segment already stored" : "Segment stored",
		duplicate ? HTTP_STATUS.OK : HTTP_STATUS.CREATED,
	);
}

/** GET /:attemptId/status — next sequence number (for resume) and totals. */
export async function recordingStatus(req: Request, res: Response) {
	const attempt = await loadAuthorizedAttempt(
		req.user,
		paramOf(req, "attemptId"),
		"candidate-or-monitor",
	);
	return sendSuccess(res, await getRecordingStatus(attempt.id));
}

/** GET /:attemptId/segments — faculty/admin: ordered list of segments. */
export async function listRecording(req: Request, res: Response) {
	const attempt = await loadAuthorizedAttempt(req.user, paramOf(req, "attemptId"), "monitor");
	const segments = await listSegments(attempt.id);
	return sendSuccess(res, {
		attemptId: attempt.id,
		studentName: attempt.studentName,
		segments,
		totalDurationMs: segments.reduce((sum, s) => sum + s.durationMs, 0),
	});
}

/** GET /:attemptId/segments/:sequence — faculty/admin: stream one segment. */
export async function streamSegment(req: Request, res: Response) {
	const attempt = await loadAuthorizedAttempt(req.user, paramOf(req, "attemptId"), "monitor");
	const sequence = Number(paramOf(req, "sequence"));
	if (!Number.isInteger(sequence) || sequence < 0) {
		throw new AppError("Invalid segment sequence.", HTTP_STATUS.BAD_REQUEST);
	}
	const { segment, size, stream } = await openSegment(attempt.id, sequence);
	const contentType = RECORDING_MIME_TYPES.has(segment.mimeType)
		? segment.mimeType
		: "application/octet-stream";

	res.setHeader("Content-Type", contentType);
	res.setHeader("Content-Length", String(size));
	res.setHeader("Cache-Control", "private, no-store");
	res.setHeader("X-Content-SHA256", segment.sha256);
	res.setHeader("X-Content-Type-Options", "nosniff");
	stream.on("error", () => res.destroy());
	stream.pipe(res);
}
