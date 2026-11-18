import type { NextFunction, Request, Response } from "express";
import { HTTP_STATUS } from "@/constants/http-status";
import { getAuthUser } from "@/middleware/auth-middleware";
import { AppError } from "@/utils/app-error";
import { sendSuccess } from "@/utils/response";
import { chatSchema, chatWithAssistant, facultyEligibility } from "../services/faculty-assistant-service";

/** Blocks everyone except verified, active faculty members. */
export function requireVerifiedFaculty(req: Request, _res: Response, next: NextFunction): void {
	const { eligible, reason } = facultyEligibility(getAuthUser(req));
	if (!eligible) return next(new AppError(reason ?? "Forbidden", HTTP_STATUS.FORBIDDEN));
	next();
}

/** GET /api/faculty-assistant/status — lets the UI show a locked/unlocked state. */
export async function statusHandler(req: Request, res: Response): Promise<void> {
	sendSuccess(res, facultyEligibility(getAuthUser(req)));
}

/** POST /api/faculty-assistant/chat — { messages: [{ role, content }] } */
export async function chatHandler(req: Request, res: Response): Promise<void> {
	const parsed = chatSchema.safeParse(req.body);
	if (!parsed.success) {
		throw new AppError(parsed.error.issues[0]?.message ?? "Invalid chat request", HTTP_STATUS.BAD_REQUEST);
	}
	sendSuccess(res, await chatWithAssistant(getAuthUser(req), parsed.data));
}
