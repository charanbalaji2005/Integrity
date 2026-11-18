import type { Request, Response } from "express";
import { z } from "zod";
import { HTTP_STATUS } from "../../../constants/http-status";
import { getAuthUser } from "../../../middleware/auth-middleware";
import { AppError } from "../../../utils/app-error";
import { sendSuccess } from "../../../utils/response";
import { verifyFace } from "../services/proctoring-service";

const faceCheckSchema = z.object({
	selfie: z.string().min(1, "Selfie base64 image is required."),
	idPhoto: z.string().optional(),
});

export async function faceCheck(req: Request, res: Response): Promise<void> {
	const parsed = faceCheckSchema.safeParse(req.body);

	if (!parsed.success) {
		throw new AppError(
			parsed.error.issues[0]?.message ?? "Validation failed",
			HTTP_STATUS.BAD_REQUEST,
		);
	}

	const { selfie, idPhoto } = parsed.data;
	const user = getAuthUser(req);
	const userId = user.id;

	try {
		const result = await verifyFace(selfie, idPhoto, userId);
		sendSuccess(res, result, "Face check completed successfully.", HTTP_STATUS.OK);
	} catch (err: any) {
		throw new AppError(
			err.message || "Face detection engine error.",
			HTTP_STATUS.INTERNAL_SERVER_ERROR,
		);
	}
}
