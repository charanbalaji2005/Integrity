import type { Request, Response } from "express";
import { z } from "zod";
import { HTTP_STATUS } from "../../../constants/http-status";
import { AppError } from "../../../utils/app-error";
import { sendSuccess } from "../../../utils/response";
import { analyzeSimilarity } from "../services/answer-similarity-service";

const similaritySchema = z.object({
	studentAnswer: z.string().min(1, "Student answer is required."),
	correctAnswer: z.string().min(1, "Correct answer / rubric is required."),
});

export async function analyze(req: Request, res: Response): Promise<void> {
	const parsed = similaritySchema.safeParse(req.body);
	if (!parsed.success) {
		throw new AppError(
			parsed.error.issues[0]?.message ?? "Validation failed",
			HTTP_STATUS.BAD_REQUEST,
		);
	}

	const { studentAnswer, correctAnswer } = parsed.data;

	try {
		const result = await analyzeSimilarity(studentAnswer, correctAnswer);
		sendSuccess(res, result, "Similarity analysis completed successfully.", HTTP_STATUS.OK);
	} catch (err: any) {
		throw new AppError(
			err.message || "Failed to analyze similarity.",
			HTTP_STATUS.INTERNAL_SERVER_ERROR,
		);
	}
}
