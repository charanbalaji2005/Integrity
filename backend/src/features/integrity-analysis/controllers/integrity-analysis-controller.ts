import type { Request, Response } from "express";
import { AppError } from "../../../utils/app-error";
import { sendSuccess } from "../../../utils/response";
import { analyzeSubmissionSchema } from "../schemas/integrity-analysis-schema";
import { analyzeSubmissionText } from "../services/integrity-analysis-service";

/**
 * Handles the HTTP request for submission text integrity analysis.
 */
export async function analyzeSubmission(req: Request, res: Response): Promise<void> {
	const result = analyzeSubmissionSchema.safeParse({ body: req.body });
	if (!result.success) {
		const errors = result.error.flatten().fieldErrors.body?.join(", ") || "Invalid request body";
		throw new AppError(errors, 400);
	}

	const { text } = result.data.body;

	const analysis = await analyzeSubmissionText(text);

	sendSuccess(res, analysis, "Submission analyzed successfully");
}
