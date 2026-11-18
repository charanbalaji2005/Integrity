import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../../../config/env";
import { HTTP_STATUS } from "../../../constants/http-status";
import { prisma } from "../../../database";
import { AppError } from "../../../utils/app-error";

export const RECORDING_MIME_TYPES = new Set(["video/webm", "video/mp4"]);
const MAX_SEQUENCE = 100_000;
const MAX_SEGMENT_DURATION_MS = 10 * 60 * 1000;

const recordingsRoot = () => path.resolve(env.RECORDINGS_DIR);

/** Strips codec parameters: "video/webm;codecs=vp8,opus" → "video/webm". */
export function baseMimeType(mime: string): string {
	return mime.split(";")[0].trim().toLowerCase();
}

/**
 * Verifies the bytes really are a WebM/Matroska (EBML header) or MP4 (ftyp box)
 * container, so arbitrary files can't be stored under a video content type.
 */
export function detectVideoContainer(buf: Buffer): "video/webm" | "video/mp4" | null {
	if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
		return "video/webm";
	}
	if (buf.length >= 8 && buf.toString("ascii", 4, 8) === "ftyp") return "video/mp4";
	return null;
}

export interface SegmentMeta {
	sequence: number;
	startedAt: Date;
	durationMs: number;
	hasAudio: boolean;
}

export function parseSegmentMeta(body: Record<string, unknown>): SegmentMeta {
	const sequence = Number(body.sequence);
	const startedAtMs = Number(body.startedAt);
	const durationMs = Number(body.durationMs);
	if (!Number.isInteger(sequence) || sequence < 0 || sequence > MAX_SEQUENCE) {
		throw new AppError("Invalid segment sequence.", HTTP_STATUS.BAD_REQUEST);
	}
	if (!Number.isFinite(startedAtMs) || startedAtMs <= 0) {
		throw new AppError("Invalid segment start time.", HTTP_STATUS.BAD_REQUEST);
	}
	if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > MAX_SEGMENT_DURATION_MS) {
		throw new AppError("Invalid segment duration.", HTTP_STATUS.BAD_REQUEST);
	}
	return {
		sequence,
		startedAt: new Date(startedAtMs),
		durationMs: Math.round(durationMs),
		hasAudio: body.hasAudio === "true" || body.hasAudio === true,
	};
}

/** Students may keep uploading buffered segments for a short grace period after submit. */
export function assertUploadWindowOpen(attempt: {
	submittedAt: Date | null;
	proctoringStatus: string;
}) {
	if (!attempt.submittedAt) return;
	const graceMs = env.RECORDING_UPLOAD_GRACE_MINUTES * 60 * 1000;
	if (Date.now() - attempt.submittedAt.getTime() > graceMs) {
		throw new AppError(
			"The recording upload window for this attempt has closed.",
			HTTP_STATUS.CONFLICT,
		);
	}
}

/**
 * Persists one segment. Write-once: a sequence that already exists is never
 * overwritten (client retries are acknowledged idempotently), so stored
 * evidence can't be replaced after the fact.
 */
export async function saveSegment(params: {
	attemptId: string;
	meta: SegmentMeta;
	mimeType: string;
	data: Buffer;
}) {
	const { attemptId, meta, data } = params;

	const container = detectVideoContainer(data);
	if (!container) {
		throw new AppError("Segment is not a WebM or MP4 video.", HTTP_STATUS.BAD_REQUEST);
	}

	const existing = await prisma.examRecordingSegment.findUnique({
		where: { attemptId_sequence: { attemptId, sequence: meta.sequence } },
	});
	if (existing) return { segment: existing, duplicate: true };

	const sha256 = createHash("sha256").update(data).digest("hex");
	const ext = container === "video/webm" ? "webm" : "mp4";
	const storageKey = `${attemptId}/${String(meta.sequence).padStart(6, "0")}.${ext}`;
	const filePath = path.join(recordingsRoot(), storageKey);

	await mkdir(path.dirname(filePath), { recursive: true });
	const tmpPath = `${filePath}.${process.pid}.tmp`;
	await writeFile(tmpPath, data);
	await rename(tmpPath, filePath);

	try {
		const segment = await prisma.examRecordingSegment.create({
			data: {
				attemptId,
				sequence: meta.sequence,
				storageKey,
				mimeType: params.mimeType || container,
				sizeBytes: data.length,
				sha256,
				hasAudio: meta.hasAudio,
				startedAt: meta.startedAt,
				durationMs: meta.durationMs,
			},
		});
		return { segment, duplicate: false };
	} catch (err) {
		// Lost a race with a concurrent retry of the same sequence: keep the first one.
		const winner = await prisma.examRecordingSegment.findUnique({
			where: { attemptId_sequence: { attemptId, sequence: meta.sequence } },
		});
		if (winner) {
			if (winner.storageKey !== storageKey) await unlink(filePath).catch(() => {});
			return { segment: winner, duplicate: true };
		}
		await unlink(filePath).catch(() => {});
		throw err;
	}
}

export async function getRecordingStatus(attemptId: string) {
	const agg = await prisma.examRecordingSegment.aggregate({
		where: { attemptId },
		_max: { sequence: true },
		_count: { _all: true },
		_sum: { durationMs: true, sizeBytes: true },
	});
	return {
		nextSequence: (agg._max.sequence ?? -1) + 1,
		segmentCount: agg._count._all,
		totalDurationMs: agg._sum.durationMs ?? 0,
		totalBytes: agg._sum.sizeBytes ?? 0,
	};
}

export async function listSegments(attemptId: string) {
	return prisma.examRecordingSegment.findMany({
		where: { attemptId },
		orderBy: [{ startedAt: "asc" }, { sequence: "asc" }],
		select: {
			id: true,
			sequence: true,
			mimeType: true,
			sizeBytes: true,
			sha256: true,
			hasAudio: true,
			startedAt: true,
			durationMs: true,
		},
	});
}

/** Opens a stored segment for streaming, guarding against path traversal. */
export async function openSegment(attemptId: string, sequence: number) {
	const segment = await prisma.examRecordingSegment.findUnique({
		where: { attemptId_sequence: { attemptId, sequence } },
	});
	if (!segment) throw new AppError("Recording segment not found.", HTTP_STATUS.NOT_FOUND);

	const root = recordingsRoot();
	const filePath = path.resolve(root, segment.storageKey);
	if (!filePath.startsWith(root + path.sep)) {
		throw new AppError("Recording segment not found.", HTTP_STATUS.NOT_FOUND);
	}
	const info = await stat(filePath).catch(() => null);
	if (!info) throw new AppError("Recording file is missing from storage.", HTTP_STATUS.NOT_FOUND);

	return { segment, size: info.size, stream: createReadStream(filePath) };
}
