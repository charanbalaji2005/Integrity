import type { Request, Response } from "express";
import { HTTP_STATUS } from "@/constants/http-status";
import { getAuthUser } from "@/middleware/auth-middleware";
import { AppError } from "@/utils/app-error";
import { sendSuccess } from "@/utils/response";
import { createAttachment } from "../services/attachments";
import {
	type CopilotUser,
	createConversation,
	createConversationSchema,
	deleteConversation,
	getConversation,
	listConversations,
	renameConversation,
	renameSchema,
	runTurn,
	sendMessageSchema,
	setConversationAssessment,
} from "../services/copilot-service";
import { listOwnAssessments } from "../services/data-tools";

const param = (req: Request, k: string) => String(Array.isArray(req.params[k]) ? req.params[k][0] : req.params[k] ?? "");
const user = (req: Request) => getAuthUser(req) as CopilotUser;

export async function listConversationsHandler(req: Request, res: Response) {
	sendSuccess(res, await listConversations(user(req).id, typeof req.query.q === "string" ? req.query.q : undefined));
}

export async function createConversationHandler(req: Request, res: Response) {
	const parsed = createConversationSchema.safeParse(req.body ?? {});
	if (!parsed.success) throw new AppError("Invalid request", HTTP_STATUS.BAD_REQUEST);
	sendSuccess(res, await createConversation(user(req).id, parsed.data.assessmentId), "Conversation created", HTTP_STATUS.CREATED);
}

export async function getConversationHandler(req: Request, res: Response) {
	sendSuccess(res, await getConversation(user(req).id, param(req, "id")));
}

export async function updateConversationHandler(req: Request, res: Response) {
	const u = user(req);
	const id = param(req, "id");
	if (req.body?.title !== undefined) {
		const parsed = renameSchema.safeParse(req.body);
		if (!parsed.success) throw new AppError("Title must be 1–80 characters.", HTTP_STATUS.BAD_REQUEST);
		await renameConversation(u.id, id, parsed.data.title);
	}
	if (req.body?.assessmentId !== undefined) {
		await setConversationAssessment(u.id, id, req.body.assessmentId ? String(req.body.assessmentId) : null);
	}
	sendSuccess(res, await getConversation(u.id, id), "Conversation updated");
}

export async function deleteConversationHandler(req: Request, res: Response) {
	await deleteConversation(user(req).id, param(req, "id"));
	sendSuccess(res, null, "Conversation deleted");
}

export async function listAssessmentsHandler(req: Request, res: Response) {
	sendSuccess(res, await listOwnAssessments(user(req)));
}

export async function uploadAttachmentHandler(req: Request, res: Response) {
	const file = (req as Request & { file?: { originalname: string; buffer: Buffer; size: number } }).file;
	const conversationId = typeof req.body?.conversationId === "string" && req.body.conversationId ? req.body.conversationId : null;
	sendSuccess(res, await createAttachment(user(req).id, file, conversationId), "Attachment processed", HTTP_STATUS.CREATED);
}

/**
 * Streams one assistant turn as server-sent events:
 *   status (execution step) · agent (chosen specialist) · delta (text chunk) · done · error
 */
async function streamTurn(req: Request, res: Response, regenerate: boolean) {
	const u = user(req);
	const conversationId = param(req, "id");
	const parsed = regenerate ? null : sendMessageSchema.safeParse(req.body ?? {});
	if (parsed && !parsed.success) {
		throw new AppError(parsed.error.issues[0]?.message ?? "Invalid message", HTTP_STATUS.BAD_REQUEST);
	}

	res.status(200);
	res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
	res.setHeader("Cache-Control", "no-cache, no-transform");
	res.setHeader("Connection", "keep-alive");
	res.setHeader("X-Accel-Buffering", "no");
	res.flushHeaders?.();

	const controller = new AbortController();
	res.on("close", () => {
		if (!res.writableEnded) controller.abort();
	});
	const send = (event: string, data: unknown) => {
		if (res.writableEnded) return;
		res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
	};
	const keepAlive = setInterval(() => !res.writableEnded && res.write(": ping\n\n"), 15000);

	try {
		const result = await runTurn(
			u,
			conversationId,
			{
				content: parsed?.data.content ?? "",
				attachmentIds: parsed?.data.attachmentIds ?? [],
				assessmentId: parsed?.data.assessmentId,
				regenerate,
			},
			{
				status: (s) => send("status", s),
				agent: (a) => send("agent", a),
				delta: (t) => send("delta", { text: t }),
			},
			controller.signal,
		);
		send("done", result);
	} catch (err) {
		send("error", { message: err instanceof AppError ? err.message : "Something went wrong. Please try again." });
		if (!(err instanceof AppError)) console.error("[Vigil] turn failed:", err);
	} finally {
		clearInterval(keepAlive);
		res.end();
	}
}

export const sendMessageHandler = (req: Request, res: Response) => streamTurn(req, res, false);
export const regenerateHandler = (req: Request, res: Response) => streamTurn(req, res, true);
