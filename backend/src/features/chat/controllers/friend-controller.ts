import type { Request, Response } from "express";
import { z } from "zod";
import { HTTP_STATUS } from "@/constants/http-status";
import { getAuthUser } from "@/middleware/auth-middleware";
import { AppError } from "@/utils/app-error";
import { sendSuccess } from "@/utils/response";
import {
	listClassmates,
	listFriendRequests,
	removeFriend,
	respondToFriendRequest,
	sendFriendRequest,
} from "../services/relationships";

const param = (req: Request, k: string) => String(Array.isArray(req.params[k]) ? req.params[k][0] : (req.params[k] ?? ""));

/** GET /api/chat/classmates — students in my section with our friendship status. */
export async function getClassmates(req: Request, res: Response): Promise<void> {
	sendSuccess(res, await listClassmates(getAuthUser(req)), "Classmates retrieved");
}

/** GET /api/chat/friend-requests — pending requests I received and sent. */
export async function getFriendRequests(req: Request, res: Response): Promise<void> {
	sendSuccess(res, await listFriendRequests(getAuthUser(req)), "Friend requests retrieved");
}

const sendSchema = z.object({ receiverId: z.string().trim().min(1).max(40) });

/** POST /api/chat/friend-requests — { receiverId } */
export async function postFriendRequest(req: Request, res: Response): Promise<void> {
	const parsed = sendSchema.safeParse(req.body);
	if (!parsed.success) throw new AppError("Choose a classmate.", HTTP_STATUS.BAD_REQUEST);
	const result = await sendFriendRequest(getAuthUser(req), parsed.data.receiverId);
	sendSuccess(res, result, result.status === "friends" ? "You are now friends" : "Friend request sent", HTTP_STATUS.CREATED);
}

const actionSchema = z.object({ action: z.enum(["accept", "decline", "cancel"]) });

/** POST /api/chat/friend-requests/:id/action — { action: accept | decline | cancel } */
export async function friendRequestAction(req: Request, res: Response): Promise<void> {
	const parsed = actionSchema.safeParse(req.body);
	if (!parsed.success) throw new AppError("Invalid action.", HTTP_STATUS.BAD_REQUEST);
	const result = await respondToFriendRequest(getAuthUser(req), param(req, "id"), parsed.data.action);
	sendSuccess(res, result, `Request ${parsed.data.action === "accept" ? "accepted" : parsed.data.action === "decline" ? "declined" : "cancelled"}`);
}

/** DELETE /api/chat/friends/:userId */
export async function deleteFriend(req: Request, res: Response): Promise<void> {
	await removeFriend(getAuthUser(req), param(req, "userId"));
	sendSuccess(res, null, "Friend removed");
}
