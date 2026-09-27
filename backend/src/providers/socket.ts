import type { Server as HttpServer } from "http";
import { type Socket, Server as SocketServer } from "socket.io";
import { prisma } from "../database";

let io: SocketServer | null = null;
const userSockets = new Map<string, string>(); // userId -> socketId
const socketUsers = new Map<string, string>(); // socketId -> userId

export function initSocketServer(server: HttpServer) {
	io = new SocketServer(server, {
		cors: {
			origin: ["http://localhost:5173", "http://localhost:5174", "http://localhost:5175"],
			methods: ["GET", "POST"],
			credentials: true,
		},
	});

	io.on("connection", (socket: Socket) => {
		const userId = socket.handshake.auth?.userId || socket.handshake.query?.userId;
		const userRole = socket.handshake.auth?.userRole || socket.handshake.query?.userRole;

		if (userId) {
			const uId = String(userId);
			userSockets.set(uId, socket.id);
			socketUsers.set(socket.id, uId);
			console.log(`[Socket] User connected: ${uId} (${userRole}) with socket ID: ${socket.id}`);

			// Broadcast user online status
			io?.emit("user-status", { userId: uId, status: "online" });
		}

		// Join Room (College, Class, or Private)
		socket.on("join-room", (roomId: string) => {
			socket.join(roomId);
			console.log(`[Socket] Socket ${socket.id} joined room: ${roomId}`);
		});

		// Leave Room
		socket.on("leave-room", (roomId: string) => {
			socket.leave(roomId);
			console.log(`[Socket] Socket ${socket.id} left room: ${roomId}`);
		});

		// Send Message
		socket.on(
			"send-message",
			async (data: {
				senderId: string;
				senderName: string;
				senderRole: string;
				content: string;
				type: "college" | "class" | "private";
				roomId: string; // "college", or class string, or studentId-facultyId
				recipientId?: string;
				department?: string;
				semester?: string;
				section?: string;
				attachments?: string[];
			}) => {
				try {
					// Save to Database
					const savedMessage = await prisma.chatMessage.create({
						data: {
							senderId: data.senderId,
							senderName: data.senderName,
							senderRole: data.senderRole,
							content: data.content,
							type: data.type,
							department: data.department || null,
							semester: data.semester || null,
							section: data.section || null,
							recipientId: data.recipientId || null,
							attachments: data.attachments ? JSON.stringify(data.attachments) : null,
						},
					});

					// Broadcast to targeted room
					io?.to(data.roomId).emit("new-message", {
						...savedMessage,
						roomId: data.roomId,
						attachments: data.attachments || [],
					});

					// Also trigger real-time notifications for direct messages if recipient is not in the room
					if (data.type === "private" && data.recipientId) {
						const recipientSocketId = userSockets.get(data.recipientId);
						if (recipientSocketId) {
							// Emitting general direct message ping/notification
							io?.to(recipientSocketId).emit("dm-notification", {
								senderId: data.senderId,
								senderName: data.senderName,
								content: data.content,
							});
						}
					}
				} catch (err) {
					console.error("[Socket] Failed to process send-message:", err);
					socket.emit("error", { message: "Failed to send message" });
				}
			},
		);

		// Typing Status
		socket.on(
			"typing",
			(data: { roomId: string; userId: string; username: string; isTyping: boolean }) => {
				socket.to(data.roomId).emit("user-typing", data);
			},
		);

		// Disconnect
		socket.on("disconnect", () => {
			const uId = socketUsers.get(socket.id);
			if (uId) {
				userSockets.delete(uId);
				socketUsers.delete(socket.id);
				console.log(`[Socket] User disconnected: ${uId}`);
				io?.emit("user-status", { userId: uId, status: "offline" });
			}
		});
	});

	return io;
}

export function getIO() {
	return io;
}

export function isUserOnline(userId: string): boolean {
	return userSockets.has(userId);
}
