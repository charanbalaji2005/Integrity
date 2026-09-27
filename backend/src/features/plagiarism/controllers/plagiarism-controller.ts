import type { Request, Response } from "express";
import { HTTP_STATUS } from "../../../constants/http-status";
import { getAuthUser } from "../../../middleware/auth-middleware";
import { AppError } from "../../../utils/app-error";
import { sendSuccess } from "../../../utils/response";
import { analyzeDocumentPlagiarism } from "../services/plagiarism-service";

const SUPPORTED_MIMETYPES = [
	"text/plain",
	"application/pdf",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"image/png",
	"image/jpeg",
	"image/jpg",
	"image/webp",
];

export async function analyzeDocument(req: Request, res: Response): Promise<void> {
	const user = getAuthUser(req);
	const userId = user.id;

	const file = req.file;
	if (!file) {
		throw new AppError("A document file is required in 'document' field.", HTTP_STATUS.BAD_REQUEST);
	}

	// Size limit validation (10MB)
	const maxBytes = 10 * 1024 * 1024; // 10MB
	if (file.size > maxBytes) {
		throw new AppError("File size exceeds the maximum limit of 10MB.", HTTP_STATUS.BAD_REQUEST);
	}

	// MIME type validation
	const ext = file.originalname.split(".").pop()?.toLowerCase();
	let mimetype = file.mimetype;
	if (ext === "txt" && mimetype !== "text/plain") {
		mimetype = "text/plain";
	}

	const isSupported =
		SUPPORTED_MIMETYPES.includes(mimetype) ||
		["txt", "pdf", "docx", "png", "jpg", "jpeg", "webp"].includes(ext || "");
	if (!isSupported) {
		throw new AppError(
			`Unsupported file format: ${mimetype}. Supported formats are TXT, PDF, DOCX, and common images (PNG, JPG, WEBP).`,
			HTTP_STATUS.BAD_REQUEST,
		);
	}

	try {
		const result = await analyzeDocumentPlagiarism(file.buffer, file.originalname, mimetype);

		sendSuccess(res, result, "Plagiarism analysis completed successfully.", HTTP_STATUS.OK);
	} catch (err: any) {
		throw new AppError(
			err.message || "Failed to analyze document plagiarism.",
			HTTP_STATUS.INTERNAL_SERVER_ERROR,
		);
	}
}
