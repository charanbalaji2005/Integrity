import type { Request, Response } from "express";
import { HTTP_STATUS } from "@/constants/http-status";
import { getAuthUser } from "@/middleware/auth-middleware";
import { AppError } from "@/utils/app-error";
import { sendSuccess } from "@/utils/response";
import {
	listFeedback,
	submitFeedback,
	submitFeedbackSchema,
} from "../services/exam-feedback-service";

/** POST /api/exam-feedback — student submits post-exam feedback */
export async function submitFeedbackHandler(req: Request, res: Response): Promise<void> {
	const parsed = submitFeedbackSchema.safeParse(req.body);
	if (!parsed.success) {
		throw new AppError(
			parsed.error.issues[0]?.message ?? "Invalid feedback",
			HTTP_STATUS.BAD_REQUEST,
		);
	}
	const user = getAuthUser(req);
	const feedback = await submitFeedback(user, parsed.data);
	sendSuccess(res, { id: feedback.id }, "Thanks for your feedback", HTTP_STATUS.CREATED);
}

/** GET /api/exam-feedback/admin?assessmentId= — admin list + stats */
export async function listFeedbackHandler(req: Request, res: Response): Promise<void> {
	const assessmentId =
		typeof req.query.assessmentId === "string" ? req.query.assessmentId : undefined;
	sendSuccess(res, await listFeedback(assessmentId));
}
