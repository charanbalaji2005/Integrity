import type { Request, Response } from "express";
import { z } from "zod";
import { HTTP_STATUS } from "../../../constants/http-status";
import { AppError } from "../../../utils/app-error";
import { sendSuccess } from "../../../utils/response";
import { extractText, recursiveChunkText } from "../services/text-extraction-service";

const extractSchema = z.object({
	file: z.string().min(1, "Base64 file data is required."),
	fileType: z.string().min(1, "File extension or mimetype is required."),
});

const extractAndChunkSchema = extractSchema.extend({
	chunkSize: z.coerce.number().optional().default(500),
	chunkOverlap: z.coerce.number().optional().default(50),
});

export async function extract(req: Request, res: Response): Promise<void> {
	const parsed = extractSchema.safeParse(req.body);
	if (!parsed.success) {
		throw new AppError(
			parsed.error.issues[0]?.message ?? "Validation failed",
			HTTP_STATUS.BAD_REQUEST,
		);
	}

	const { file, fileType } = parsed.data;

	try {
		const text = await extractText(file, fileType);
		sendSuccess(res, { text }, "Text extracted successfully.", HTTP_STATUS.OK);
	} catch (err: any) {
		throw new AppError(err.message || "Failed to extract text.", HTTP_STATUS.INTERNAL_SERVER_ERROR);
	}
}

export async function extractAndChunk(req: Request, res: Response): Promise<void> {
	const parsed = extractAndChunkSchema.safeParse(req.body);
	if (!parsed.success) {
		throw new AppError(
			parsed.error.issues[0]?.message ?? "Validation failed",
			HTTP_STATUS.BAD_REQUEST,
		);
	}

	const { file, fileType, chunkSize, chunkOverlap } = parsed.data;

	try {
		const text = await extractText(file, fileType);
		const chunks = recursiveChunkText(text, chunkSize, chunkOverlap);
		sendSuccess(res, { text, chunks }, "Text extracted and chunked successfully.", HTTP_STATUS.OK);
	} catch (err: any) {
		throw new AppError(
			err.message || "Failed to extract and chunk text.",
			HTTP_STATUS.INTERNAL_SERVER_ERROR,
		);
	}
}
