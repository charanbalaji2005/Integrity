import type { Request, Response } from "express";
import { z } from "zod";
import { logAdminAction } from "../../../admin/services/admin-service";
import { HTTP_STATUS } from "../../../constants/http-status";
import { getAuthUser } from "../../../middleware/auth-middleware";
import { AppError } from "../../../utils/app-error";
import { sendSuccess } from "../../../utils/response";
import {
	DOCUMENT_TYPES,
	getDocument,
	getMyVerification,
	listRequests,
	reviewRequest,
	submitDocument,
} from "../services/verification-service";

const submitSchema = z.object({
	documentType: z.enum(Object.keys(DOCUMENT_TYPES) as [keyof typeof DOCUMENT_TYPES]),
	rollNumber: z.string().max(40).optional(),
	institutionName: z.string().max(160).optional(),
});

const reviewSchema = z.object({
	note: z.string().max(500).optional(),
	institutionName: z.string().max(160).optional(),
});

function param(v: string | string[] | undefined): string {
	return Array.isArray(v) ? v[0] : String(v ?? "");
}

// GET /api/verification/me
export async function getMyVerificationHandler(req: Request, res: Response): Promise<void> {
	const user = getAuthUser(req);
	sendSuccess(res, await getMyVerification(user.id), "Verification status", HTTP_STATUS.OK);
}

// POST /api/verification/documents  (multipart: document, documentType, rollNumber?, institutionName?)
export async function submitDocumentHandler(req: Request, res: Response): Promise<void> {
	const user = getAuthUser(req);
	const parsed = submitSchema.safeParse(req.body);
	if (!parsed.success) {
		throw new AppError("Choose College ID Card or Institution Fee Receipt.", HTTP_STATUS.BAD_REQUEST);
	}
	const file = req.file;
	if (!file) throw new AppError("Attach your document.", HTTP_STATUS.BAD_REQUEST);

	const record = await submitDocument({
		userId: user.id,
		documentType: parsed.data.documentType,
		file,
		rollNumber: parsed.data.rollNumber,
		institutionName: parsed.data.institutionName,
	});
	sendSuccess(res, record, "Document submitted for review", HTTP_STATUS.CREATED);
}

// GET /api/verification/admin/requests?status=pending|approved|rejected|all
export async function listRequestsHandler(req: Request, res: Response): Promise<void> {
	const status = typeof req.query.status === "string" ? req.query.status : "pending";
	sendSuccess(res, await listRequests(status), "Verification requests", HTTP_STATUS.OK);
}

// GET /api/verification/admin/requests/:id/document
export async function getDocumentHandler(req: Request, res: Response): Promise<void> {
	const doc = await getDocument(param(req.params.id));
	res.setHeader("Content-Type", doc.mimeType);
	res.setHeader("Content-Disposition", `inline; filename="${doc.fileName.replace(/"/g, "")}"`);
	res.setHeader("Cache-Control", "private, no-store");
	res.setHeader("X-Content-Type-Options", "nosniff");
	res.send(Buffer.from(doc.fileData));
}

async function review(req: Request, res: Response, decision: "approved" | "rejected") {
	const admin = getAuthUser(req);
	const body = reviewSchema.safeParse(req.body ?? {});
	if (!body.success) throw new AppError("Invalid review details.", HTTP_STATUS.BAD_REQUEST);

	const result = await reviewRequest({
		id: param(req.params.id),
		reviewer: { id: admin.id, name: admin.name },
		decision,
		note: body.data.note,
		institutionName: body.data.institutionName,
	});

	await logAdminAction(
		admin.id,
		result.userId,
		`${decision} student enrolment verification ${result.id}${body.data.note ? `: ${body.data.note}` : ""}`,
		(req.headers["x-forwarded-for"] as string) ?? req.socket.remoteAddress,
		req.headers["user-agent"],
	).catch(() => undefined);

	sendSuccess(res, result, `Verification ${decision}`, HTTP_STATUS.OK);
}

export const approveRequestHandler = (req: Request, res: Response) => review(req, res, "approved");
export const rejectRequestHandler = (req: Request, res: Response) => review(req, res, "rejected");
