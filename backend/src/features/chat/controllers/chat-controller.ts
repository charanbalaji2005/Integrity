import type { Request, Response } from "express";
import { HTTP_STATUS } from "../../../constants/http-status";
import { prisma } from "../../../database";
import { getIO } from "../../../providers/socket";
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
 * GET /api/chat/messages
 * Query params: type, recipientId, department, semester, section
 */
export async function getMessages(req: Request, res: Response): Promise<void> {
	const requester = getAuthUser(req);
	const userId = requester.id;
	const { type, recipientId, department, semester, section } = req.query;

	let whereClause: any = {};

	if (type === "college") {
		whereClause = { type: "college" };
	} else if (type === "class") {
		const reqSection = String(section || "")
			.trim()
			.toUpperCase();
		const reqDept = String(department || "")
			.trim()
			.toUpperCase();

		// Access control: Students can only access their own class section
		if (requester.role === "user") {
			const studentSection = (requester.section || "").trim().toUpperCase();
			const studentDept = (requester.department || "").trim().toUpperCase();
			if (reqSection !== studentSection || reqDept !== studentDept) {
				throw new AppError(
					"Forbidden: You can only participate in your own class section",
					HTTP_STATUS.FORBIDDEN,
				);
			}
		} else if (requester.role === "faculty") {
			// Faculty evaluates assigned sections
			const assigned = (requester.section || "").split(",").map((s) => s.trim().toUpperCase());
			if (!assigned.includes(reqSection)) {
				throw new AppError(
					"Forbidden: You are not assigned to this class section",
					HTTP_STATUS.FORBIDDEN,
				);
			}
		}

		whereClause = {
			type: "class",
			department: String(department || ""),
			semester: String(semester || ""),
			section: String(section || ""),
		};
	} else if (type === "private") {
		if (!recipientId) {
			throw new AppError("Recipient ID is required for private chat", HTTP_STATUS.BAD_REQUEST);
		}
		// Private chats are exchanged between the active user and recipient
		whereClause = {
			type: "private",
			OR: [
				{ senderId: userId, recipientId: String(recipientId) },
				{ senderId: String(recipientId), recipientId: userId },
			],
		};
	} else {
		throw new AppError("Invalid chat type", HTTP_STATUS.BAD_REQUEST);
	}

	const messages = await prisma.chatMessage.findMany({
		where: whereClause,
		orderBy: { createdAt: "asc" },
	});

	const parsedMessages = messages.map((msg) => ({
		...msg,
		attachments: msg.attachments ? JSON.parse(msg.attachments) : [],
		reactions: msg.reactions ? JSON.parse(msg.reactions) : [],
		readBy: msg.readBy ? JSON.parse(msg.readBy) : [],
	}));

	sendSuccess(res, parsedMessages, "Messages retrieved successfully", HTTP_STATUS.OK);
}

/**
 * GET /api/chat/faculty
 * List all faculty users related to student's department
 */
export async function getFacultyList(req: Request, res: Response): Promise<void> {
	const requester = getAuthUser(req);

	const faculty = await prisma.user.findMany({
		where: {
			role: "faculty",
		},
		select: {
			id: true,
			name: true,
			email: true,
			role: true,
			department: true,
			section: true,
		},
		orderBy: { name: "asc" },
	});

	// If requester is a student, only show faculty members related to their department
	if (requester && requester.role === "user") {
		const studentDept = (requester.department || "").trim().toLowerCase();
		const filteredFaculty = faculty.filter((f) => {
			return (f.department || "").trim().toLowerCase() === studentDept;
		});
		sendSuccess(res, filteredFaculty, "Faculty retrieved successfully", HTTP_STATUS.OK);
		return;
	}

	sendSuccess(res, faculty, "Faculty retrieved successfully", HTTP_STATUS.OK);
}

/**
 * GET /api/chat/contacts
 * Returns list of approved student-faculty direct message contacts
 */
export async function getContacts(req: Request, res: Response): Promise<void> {
	const user = getAuthUser(req);
	const userId = user.id;
	const userRole = user.role;

	let contacts: any[] = [];

	if (userRole === "faculty" || userRole === "admin") {
		// Return students whose requests are approved by this faculty
		const approvedRequests = await prisma.chatRequest.findMany({
			where: {
				facultyId: userId,
				status: "approved",
			},
			include: {
				student: {
					select: {
						id: true,
						name: true,
						email: true,
						role: true,
						department: true,
						rollNumber: true,
						section: true,
					},
				},
			},
		});
		contacts = approvedRequests.map((r) => r.student);
	} else {
		// Return faculty members whose requests are approved for this student
		const approvedRequests = await prisma.chatRequest.findMany({
			where: {
				studentId: userId,
				status: "approved",
			},
			include: {
				faculty: {
					select: {
						id: true,
						name: true,
						email: true,
						role: true,
						department: true,
					},
				},
			},
		});
		contacts = approvedRequests.map((r) => r.faculty);
	}

	// Remove duplicates in case of multiple requests
	const uniqueContactsMap = new Map();
	for (const contact of contacts) {
		if (contact) {
			uniqueContactsMap.set(contact.id, contact);
		}
	}

	sendSuccess(
		res,
		Array.from(uniqueContactsMap.values()),
		"Contacts retrieved successfully",
		HTTP_STATUS.OK,
	);
}

/**
 * GET /api/chat/requests
 * Fetch all incoming/outgoing requests
 */
export async function getChatRequests(req: Request, res: Response): Promise<void> {
	const user = getAuthUser(req);
	const userId = user.id;
	const userRole = user.role;

	let requests;

	if (userRole === "faculty" || userRole === "admin") {
		// Faculty sees incoming student requests
		requests = await prisma.chatRequest.findMany({
			where: { facultyId: userId },
			include: {
				student: {
					select: {
						id: true,
						name: true,
						email: true,
						rollNumber: true,
						department: true,
						semester: true,
						section: true,
					},
				},
			},
			orderBy: { createdAt: "desc" },
		});
	} else {
		// Student sees their outgoing faculty requests
		requests = await prisma.chatRequest.findMany({
			where: { studentId: userId },
			include: {
				faculty: {
					select: {
						id: true,
						name: true,
						email: true,
						department: true,
					},
				},
			},
			orderBy: { createdAt: "desc" },
		});
	}

	sendSuccess(res, requests, "Requests retrieved successfully", HTTP_STATUS.OK);
}

/**
 * POST /api/chat/requests
 * Create a new chat request
 */
export async function createChatRequest(req: Request, res: Response): Promise<void> {
	const sender = getAuthUser(req);
	const userId = sender.id;
	const { facultyId, subject, reason, attachment } = req.body;

	if (!facultyId || !subject || !reason) {
		throw new AppError("Faculty ID, subject, and reason are required", HTTP_STATUS.BAD_REQUEST);
	}

	// Create chat request
	const request = await prisma.chatRequest.create({
		data: {
			studentId: userId,
			facultyId,
			subject,
			reason,
			attachment: attachment || null,
			status: "pending",
		},
	});

	// Create notifications
	const studentUser = await prisma.user.findUnique({ where: { id: userId } });
	if (studentUser) {
		await prisma.notification.create({
			data: {
				userId: facultyId,
				title: "New Chat Request",
				description: `${studentUser.name} requested a private chat regarding: "${subject}"`,
				type: "system",
				priority: "medium",
				senderName: studentUser.name,
				senderRole: "student",
			},
		});
	}

	sendSuccess(res, request, "Chat request created successfully", HTTP_STATUS.CREATED);
}

/**
 * POST /api/chat/requests/:id/action
 * Approve, reject, archive, or close a request
 */
export async function handleChatRequestAction(req: Request, res: Response): Promise<void> {
	const user = getAuthUser(req);
	const userId = user.id;
	const id = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id);
	const { action } = req.body; // "approve" | "reject" | "close"

	const request = await prisma.chatRequest.findUnique({
		where: { id },
	});

	if (!request) {
		throw new AppError("Chat request not found", HTTP_STATUS.NOT_FOUND);
	}

	if (request.facultyId !== userId) {
		throw new AppError("Forbidden: You do not own this request", HTTP_STATUS.FORBIDDEN);
	}

	let status = request.status;
	let notifTitle = "";
	let notifDesc = "";

	if (action === "approve") {
		status = "approved";
		notifTitle = "Chat Request Approved";
		notifDesc = "Faculty approved your private chat request. You can now direct message.";
	} else if (action === "reject") {
		status = "rejected";
		notifTitle = "Chat Request Declined";
		notifDesc = "Faculty declined your private chat request.";
	} else if (action === "close") {
		status = "closed";
		notifTitle = "Chat Conversation Closed";
		notifDesc = "Faculty has closed the private chat conversation.";
	} else {
		throw new AppError("Invalid action", HTTP_STATUS.BAD_REQUEST);
	}

	const updatedRequest = await prisma.chatRequest.update({
		where: { id },
		data: { status, updatedAt: new Date() },
	});

	// Notify student
	const facultyUser = await prisma.user.findUnique({ where: { id: userId } });
	if (facultyUser) {
		await prisma.notification.create({
			data: {
				userId: request.studentId,
				title: notifTitle,
				description: notifDesc,
				type: "system",
				priority: "medium",
				senderName: facultyUser.name,
				senderRole: "faculty",
			},
		});
	}

	sendSuccess(res, updatedRequest, `Request ${action}d successfully`, HTTP_STATUS.OK);
}

export async function reactToMessage(req: Request, res: Response): Promise<void> {
	const user = getAuthUser(req);
	const userId = user.id;
	const messageId = req.params.id as string;
	const { emoji } = req.body;

	if (!messageId || !emoji) {
		throw new AppError("Invalid params", HTTP_STATUS.BAD_REQUEST);
	}

	const user = await prisma.user.findUnique({ where: { id: userId } });
	if (!user) {
		throw new AppError("User not found", HTTP_STATUS.NOT_FOUND);
	}

	const message = await prisma.chatMessage.findUnique({ where: { id: messageId } });
	if (!message) {
		throw new AppError("Message not found", HTTP_STATUS.NOT_FOUND);
	}

	let reactions: any[] = [];
	if (message.reactions) {
		try {
			reactions = JSON.parse(message.reactions);
		} catch {
			reactions = [];
		}
	}

	const existingIdx = reactions.findIndex((r) => r.userId === userId && r.emoji === emoji);
	if (existingIdx > -1) {
		reactions.splice(existingIdx, 1);
	} else {
		reactions.push({ emoji, userId, userName: user.name });
	}

	await prisma.chatMessage.update({
		where: { id: messageId },
		data: { reactions: JSON.stringify(reactions) },
	});

	const io = getIO();
	io?.emit("message-update", {
		id: messageId,
		reactions,
		action: "reaction_updated",
	});

	sendSuccess(res, reactions, "Reaction toggled successfully", HTTP_STATUS.OK);
}

export async function pinMessage(req: Request, res: Response): Promise<void> {
	const user = getAuthUser(req);
	const userId = user.id;
	const messageId = req.params.id as string;

	if (!messageId) {
		throw new AppError("Invalid params", HTTP_STATUS.BAD_REQUEST);
	}

	const message = await prisma.chatMessage.findUnique({ where: { id: messageId } });
	if (!message) {
		throw new AppError("Message not found", HTTP_STATUS.NOT_FOUND);
	}

	const updatedMsg = await prisma.chatMessage.update({
		where: { id: messageId },
		data: { isPinned: !message.isPinned },
	});

	const io = getIO();
	io?.emit("message-update", {
		id: messageId,
		isPinned: updatedMsg.isPinned,
		action: "pin_toggled",
	});

	sendSuccess(res, updatedMsg, "Message pin toggled successfully", HTTP_STATUS.OK);
}

export async function deleteMessage(req: Request, res: Response): Promise<void> {
	const user = getAuthUser(req);
	const userId = user.id;
	const messageId = req.params.id as string;
	const { deleteType } = req.body;

	if (!messageId) {
		throw new AppError("Invalid params", HTTP_STATUS.BAD_REQUEST);
	}

	const message = await prisma.chatMessage.findUnique({ where: { id: messageId } });
	if (!message) {
		throw new AppError("Message not found", HTTP_STATUS.NOT_FOUND);
	}

	if (message.senderId !== userId) {
		throw new AppError("Forbidden: You do not own this message", HTTP_STATUS.FORBIDDEN);
	}

	let readBy: string[] = [];
	if (message.readBy) {
		try {
			readBy = JSON.parse(message.readBy);
		} catch {
			readBy = [];
		}
	}

	const hasRecipientRead = readBy.some((id) => id !== userId);

	let updatedMsg;
	if (deleteType === "everyone" && !hasRecipientRead) {
		updatedMsg = await prisma.chatMessage.update({
			where: { id: messageId },
			data: {
				isDeleted: true,
				content: "This message was deleted.",
				attachments: null,
			},
		});
	} else {
		updatedMsg = await prisma.chatMessage.update({
			where: { id: messageId },
			data: {
				isDeleted: true,
				content: "This message was deleted.",
				attachments: null,
			},
		});
	}

	const io = getIO();
	io?.emit("message-update", {
		id: messageId,
		isDeleted: true,
		content: "This message was deleted.",
		action: "message_deleted",
	});

	sendSuccess(res, updatedMsg, "Message deleted successfully", HTTP_STATUS.OK);
}

export async function forwardMessage(req: Request, res: Response): Promise<void> {
	const sender = getAuthUser(req);
	const userId = sender.id;
	const messageId = req.params.id as string;
	const { targetType, targetRecipientId, targetDept, targetSem, targetSec } = req.body;

	if (!messageId) {
		throw new AppError("Invalid params", HTTP_STATUS.BAD_REQUEST);
	}

	const message = await prisma.chatMessage.findUnique({ where: { id: messageId } });
	if (!message) {
		throw new AppError("Message not found", HTTP_STATUS.NOT_FOUND);
	}

	const forwardedMsg = await prisma.chatMessage.create({
		data: {
			senderId: userId,
			senderName: sender.name,
			senderRole: sender.role,
			content: message.content,
			type: targetType,
			recipientId: targetRecipientId || null,
			department: targetDept || null,
			semester: targetSem || null,
			section: targetSec || null,
			attachments: message.attachments,
			forwardedFrom: message.senderName,
		},
	});

	const io = getIO();
	let roomId = "college";
	if (targetType === "class") {
		roomId = `${targetDept}-${targetSem}-${targetSec}`;
	} else if (targetType === "private") {
		roomId =
			userId < targetRecipientId
				? `${userId}-${targetRecipientId}`
				: `${targetRecipientId}-${userId}`;
	}

	io?.to(roomId).emit("new-message", {
		...forwardedMsg,
		roomId,
		attachments: forwardedMsg.attachments ? JSON.parse(forwardedMsg.attachments) : [],
	});

	sendSuccess(res, forwardedMsg, "Message forwarded successfully", HTTP_STATUS.CREATED);
}

export async function markMessagesAsRead(req: Request, res: Response): Promise<void> {
	const user = getAuthUser(req);
	const userId = user.id;
	const { type, recipientId, department, semester, section } = req.body;

	let whereClause: any = {};
	if (type === "college") {
		whereClause = { type: "college" };
	} else if (type === "class") {
		whereClause = {
			type: "class",
			department,
			semester,
			section,
		};
	} else if (type === "private") {
		whereClause = {
			type: "private",
			OR: [
				{ senderId: userId, recipientId },
				{ senderId: recipientId, recipientId: userId },
			],
		};
	}

	const messages = await prisma.chatMessage.findMany({
		where: whereClause,
	});

	let updatedCount = 0;
	for (const msg of messages) {
		let readBy: string[] = [];
		if (msg.readBy) {
			try {
				readBy = JSON.parse(msg.readBy);
			} catch {
				readBy = [];
			}
		}

		if (!readBy.includes(userId)) {
			readBy.push(userId);
			await prisma.chatMessage.update({
				where: { id: msg.id },
				data: { readBy: JSON.stringify(readBy) },
			});
			updatedCount++;

			const io = getIO();
			io?.emit("message-update", {
				id: msg.id,
				readBy,
				action: "read_receipt_updated",
			});
		}
	}

	sendSuccess(res, { updatedCount }, "Messages marked as read", HTTP_STATUS.OK);
}
