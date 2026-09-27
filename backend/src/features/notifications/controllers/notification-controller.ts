import type { Request, Response } from "express";
import { HTTP_STATUS } from "../../../constants/http-status";
import { prisma } from "../../../database";
import { AppError } from "../../../utils/app-error";
import { sendSuccess } from "../../../utils/response";

function getAuthUser(req: Request) {
	const user = req.user;
	if (!user) {
		throw new AppError("Unauthorized: Authentication session required", HTTP_STATUS.UNAUTHORIZED);
	}
	return user;
}

/**
 * GET /api/notifications
 */
export async function getNotifications(req: Request, res: Response): Promise<void> {
	const user = getAuthUser(req);
	const userId = user.id;

	const { read, type } = req.query;

	const whereClause: any = { userId };

	if (read !== undefined) {
		whereClause.read = read === "true";
	}

	if (type !== undefined) {
		whereClause.type = String(type);
	}

	const notifications = await prisma.notification.findMany({
		where: whereClause,
		orderBy: {
			createdAt: "desc",
		},
	});

	sendSuccess(res, notifications, "Notifications retrieved successfully", HTTP_STATUS.OK);
}

/**
 * POST /api/notifications
 */
export async function createNotification(req: Request, res: Response): Promise<void> {
	const sender = getAuthUser(req);
	const senderId = sender.id;

	const { title, description, type, priority, targetRole, targetUserId } = req.body;
	const senderName = req.body.senderName || sender.name;
	const senderRole = sender.role;

	if (!title || !description || !type) {
		throw new AppError("Title, description and type are required fields", HTTP_STATUS.BAD_REQUEST);
	}

	// Infer Notification type from Prisma
	const createdNotifications: Awaited<ReturnType<typeof prisma.notification.findMany>> = [];

	if (targetUserId) {
		const notif = await prisma.notification.create({
			data: {
				userId: targetUserId,
				title,
				description,
				type,
				priority: priority ?? "medium",
				senderName: senderName ?? "System",
				senderRole: senderRole ?? "system",
			},
		});

		createdNotifications.push(notif);
	} else if (targetRole) {
		let users: { id: string }[];

		if (targetRole === "all") {
			users = await prisma.user.findMany({
				select: {
					id: true,
				},
			});
		} else {
			users = await prisma.user.findMany({
				where: {
					role: targetRole,
				},
				select: {
					id: true,
				},
			});
		}

		for (const user of users) {
			const notif = await prisma.notification.create({
				data: {
					userId: user.id,
					title,
					description,
					type,
					priority: priority ?? "medium",
					senderName: senderName ?? "System",
					senderRole: senderRole ?? "system",
				},
			});

			createdNotifications.push(notif);
		}
	} else {
		if (!senderId) {
			throw new AppError("Target user or role is required", HTTP_STATUS.BAD_REQUEST);
		}

		const notif = await prisma.notification.create({
			data: {
				userId: senderId,
				title,
				description,
				type,
				priority: priority ?? "medium",
				senderName: senderName ?? "System",
				senderRole: senderRole ?? "system",
			},
		});

		createdNotifications.push(notif);
	}

	sendSuccess(
		res,
		createdNotifications,
		"Notification(s) created successfully",
		HTTP_STATUS.CREATED,
	);
}

/**
 * POST /api/notifications/mark-read
 */
export async function markAllRead(req: Request, res: Response): Promise<void> {
	const user = getAuthUser(req);
	const userId = user.id;

	await prisma.notification.updateMany({
		where: {
			userId,
			read: false,
		},
		data: {
			read: true,
		},
	});

	sendSuccess(res, null, "All notifications marked as read", HTTP_STATUS.OK);
}

/**
 * POST /api/notifications/:id/read
 */
export async function markRead(req: Request, res: Response): Promise<void> {
	const user = getAuthUser(req);
	const userId = user.id;
	const id = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id);

	const notification = await prisma.notification.findUnique({
		where: {
			id,
		},
	});

	if (!notification || notification.userId !== userId) {
		throw new AppError("Notification not found or unauthorized", HTTP_STATUS.NOT_FOUND);
	}

	const updated = await prisma.notification.update({
		where: {
			id,
		},
		data: {
			read: true,
		},
	});

	sendSuccess(res, updated, "Notification marked as read", HTTP_STATUS.OK);
}

/**
 * DELETE /api/notifications/:id
 */
export async function deleteNotification(req: Request, res: Response): Promise<void> {
	const user = getAuthUser(req);
	const userId = user.id;
	const id = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id);

	const notification = await prisma.notification.findUnique({
		where: {
			id,
		},
	});

	if (!notification || notification.userId !== userId) {
		throw new AppError("Notification not found or unauthorized", HTTP_STATUS.NOT_FOUND);
	}

	await prisma.notification.delete({
		where: {
			id,
		},
	});

	sendSuccess(res, null, "Notification deleted successfully", HTTP_STATUS.OK);
}
