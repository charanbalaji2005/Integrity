import { fromNodeHeaders } from "better-auth/node";
import { canDirectMessage } from "../features/chat/services/relationships";
import type { Server as HttpServer, IncomingHttpHeaders } from "http";
import { type Socket, Server as SocketServer } from "socket.io";
import { env } from "../config/env";
import { prisma } from "../database";
import { canSeeStudentSection, parseSections, sectionMonitorRoom } from "../utils/faculty-sections";
import { isMultiPortalEmail } from "../utils/multi-portal";
import { auth } from "./auth";
import { isTwoFactorPending } from "../features/authentication/services/two-factor-service";

/**
 * Identity attached to every socket. It is derived ONLY from a verified
 * server-side session — never from client-supplied handshake fields.
 */
interface SocketIdentity {
	userId: string;
	role: string;
	name: string;
	department: string | null;
	semester: string | null;
	section: string | null;
	email: string | null;
}

interface SocketData {
	identity: SocketIdentity;
	/** Attempt IDs this socket joined as the candidate (for disconnect tracking). */
	candidateAttempts: Set<string>;
}

type AuthedSocket = Socket & { data: SocketData };

let io: SocketServer | null = null;
const userSocketCounts = new Map<string, Set<string>>(); // userId -> socketIds

/* ───────────── Live video relay (faculty live monitoring) ─────────────
 * Students publish small JPEG frames over their authenticated socket; the
 * server relays them only to faculty in `assessment-live-<assessmentId>`.
 * Students send nothing unless someone is watching: the server pushes a
 * per-attempt frame rate via `live-config` whenever watchers change.
 */
const LIVE_GRID_FPS = 1;
const LIVE_FOCUS_FPS = 5;
const LIVE_MAX_FRAME_CHARS = 200_000; // ~150 KB JPEG
const LIVE_MIN_INTERVAL_MS = 150; // hard cap ≈ 6.6 fps per candidate socket
const liveRoom = (assessmentId: string) => `assessment-live-${assessmentId}`;
/** Active candidate attempts → their assessment (for routing frames). */
const liveAttempts = new Map<string, string>();
/** Faculty socket → attempt they have opened full-size (null = grid only). */
const liveFocus = new Map<string, string | null>();
const lastLiveFrameAt = new Map<string, number>(); // socketId:attemptId → ts

function liveFpsFor(attemptId: string, assessmentId: string): number {
	const watchers = io?.sockets.adapter.rooms.get(liveRoom(assessmentId));
	if (!watchers || watchers.size === 0) return 0;
	for (const sid of watchers) {
		if (liveFocus.get(sid) === attemptId) return LIVE_FOCUS_FPS;
	}
	return LIVE_GRID_FPS;
}

function pushLiveConfig(assessmentId: string) {
	for (const [attemptId, aid] of liveAttempts) {
		if (aid !== assessmentId) continue;
		io?.to(`student-proctoring-${attemptId}`).emit("live-config", {
			attemptId,
			fps: liveFpsFor(attemptId, aid),
		});
	}
}

function parseCookies(header: string | undefined): Record<string, string> {
	const out: Record<string, string> = {};
	if (!header) return out;
	for (const part of header.split(";")) {
		const idx = part.indexOf("=");
		if (idx === -1) continue;
		const key = part.slice(0, idx).trim();
		const value = decodeURIComponent(part.slice(idx + 1).trim());
		out[key] = value;
	}
	return out;
}

function cleanToken(raw: unknown): string | null {
	if (typeof raw !== "string") return null;
	const t = raw.replace(/^Bearer\s+/i, "").trim();
	if (!t || t === "null" || t === "undefined") return null;
	// Better Auth signed cookies are "<token>.<signature>"; the DB stores the token.
	return t.split(".")[0] || null;
}

/** Resolve the authenticated user for a socket handshake. */
async function resolveSocketIdentity(
	headers: IncomingHttpHeaders,
	handshakeToken: unknown,
): Promise<SocketIdentity | null> {
	let userId: string | null = null;

	// 1. Standard Better Auth session (signed cookie).
	try {
		const session = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
		// Sessions still waiting for their 2FA code may not open a socket.
		if (isTwoFactorPending(session)) return null;
		if (session?.user?.id) userId = session.user.id;
	} catch {
		// fall through to token lookup
	}

	// 2. Bearer / raw session token (the frontend stores one for cross-site use).
	if (!userId) {
		const cookies = parseCookies(headers.cookie);
		const candidates = [
			cleanToken(handshakeToken),
			cleanToken(headers.authorization),
			cleanToken(cookies["better-auth.session_token"]),
			cleanToken(cookies["__Secure-better-auth.session_token"]),
			cleanToken(cookies.session_token),
		].filter((t): t is string => Boolean(t));

		for (const token of candidates) {
			const session = await prisma.session.findUnique({ where: { token } });
			if (session && session.expiresAt.getTime() > Date.now()) {
				if (session.twoFactorPending) return null;
				userId = session.userId;
				break;
			}
		}
	}

	if (!userId) return null;

	const user = await prisma.user.findUnique({ where: { id: userId } });
	if (!user) return null;
	if (user.status === "suspended" || user.status === "locked") return null;
	if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) return null;

	return {
		userId: user.id,
		role: user.role,
		name: user.name,
		department: user.department ?? null,
		semester: user.semester ?? null,
		section: user.section ?? null,
		email: user.email ?? null,
	};
}

/**
 * Room authorization. Every room a client asks to join is checked here;
 * unknown room formats are rejected.
 */
/** Marks a support rep online/offline and tells other staff (used by the assignment engine). */
async function setSupportPresence(userId: string, online: boolean) {
	try {
		const staff = await prisma.supportStaff.findUnique({ where: { userId }, include: { user: { select: { name: true } } } });
		if (!staff) return;
		await prisma.supportStaff.update({ where: { userId }, data: { isOnline: online, lastSeenAt: new Date() } });
		io?.to("support-staff").emit(online ? "support:agent:online" : "support:agent:offline", {
			staff: { id: staff.id, userId, name: staff.user.name, isOnline: online, availability: staff.availability },
		});
	} catch (err) {
		console.warn("[Socket] support presence update failed:", err);
	}
}

async function canJoinRoom(identity: SocketIdentity, roomId: string): Promise<boolean> {
	const { userId, role } = identity;

	if (roomId === "college") return true;

	// Support Hub: staff room, and per-ticket rooms for the owning student or staff.
	if (roomId === "support-staff") return role === "support" || role === "admin";
	if (roomId.startsWith("support-ticket-")) {
		if (role === "support" || role === "admin") return true;
		const ticket = await prisma.supportTicket.findUnique({ where: { id: roomId.slice("support-ticket-".length) }, select: { studentId: true } });
		return ticket?.studentId === userId;
	}

	if (roomId.startsWith("class:")) {
		const [, dept, sem, sec] = roomId.split(":");
		if (role === "admin") return true;
		// Faculty may only join class rooms of their assigned sections.
		if (role === "faculty")
			return canSeeStudentSection({ role, section: identity.section, email: identity.email }, sec);
		return (
			dept === (identity.department ?? "") &&
			sem === (identity.semester ?? "") &&
			sec === (identity.section ?? "")
		);
	}

	if (roomId.startsWith("private:")) {
		const pair = roomId.slice("private:".length);
		return pair.startsWith(`${userId}-`) || pair.endsWith(`-${userId}`);
	}

	if (roomId.startsWith("assessment-proctoring-") || roomId.startsWith("assessment-live-")) {
		const assessmentId = roomId.slice(roomId.indexOf("-", "assessment-".length) + 1);
		if (role === "admin") return true;
		if (role !== "faculty") return false;
		const assessment = await prisma.assessment.findUnique({
			where: { id: assessmentId },
			select: { facultyId: true },
		});
		return assessment?.facultyId === userId;
	}

	if (roomId.startsWith("student-proctoring-")) {
		const attemptId = roomId.slice("student-proctoring-".length);
		const attempt = await prisma.assessmentAttempt.findUnique({
			where: { id: attemptId },
			select: {
				studentId: true,
				assessment: { select: { facultyId: true } },
				student: { select: { section: true } },
			},
		});
		if (!attempt) return false;
		if (attempt.studentId === userId) return true;
		if (role === "admin") return true;
		return (
			role === "faculty" &&
			attempt.assessment.facultyId === userId &&
			canSeeStudentSection(
				{ role, section: identity.section, email: identity.email },
				attempt.student?.section,
			)
		);
	}

	return false;
}

async function setAttemptPresence(attemptId: string, online: boolean) {
	try {
		const attempt = await prisma.assessmentAttempt.update({
			where: { id: attemptId },
			data: {
				isOnline: online,
				...(online ? { lastHeartbeatAt: new Date() } : {}),
			},
			select: {
				assessmentId: true,
				studentName: true,
				proctoringStatus: true,
				lastFrameAt: true,
				lastHeartbeatAt: true,
				student: { select: { section: true } },
			},
		});
		emitToAssessmentMonitors(
			attempt.assessmentId,
			attempt.student?.section,
			online ? "student-online" : "student-offline",
			{
				attemptId,
				studentName: attempt.studentName,
				status: attempt.proctoringStatus,
				isOnline: online,
				lastFrameAt: attempt.lastFrameAt,
				lastHeartbeatAt: attempt.lastHeartbeatAt,
			},
		);
	} catch (err) {
		console.warn(`[Socket] Failed to update presence for attempt ${attemptId}:`, err);
	}
}

/**
 * Sends a live-proctoring event about one student to everyone allowed to see
 * it: admins (whole-assessment room) and faculty assigned to the student's
 * section (per-section room). Socket.IO de-duplicates overlapping rooms.
 */
export function emitToAssessmentMonitors(
	assessmentId: string,
	studentSection: string | null | undefined,
	event: string,
	payload: unknown,
) {
	io?.to([
		`assessment-proctoring-${assessmentId}`,
		sectionMonitorRoom(assessmentId, studentSection),
	]).emit(event, payload);
}

export function initSocketServer(server: HttpServer) {
	const allowedOrigins = [
		env.FRONTEND_URL,
		env.FRONTEND_URL?.replace(/\/$/, ""),
		"http://localhost:5173",
		"http://localhost:5174",
		"http://localhost:5175",
	].filter(Boolean);

	io = new SocketServer(server, {
		cors: {
			origin: (origin, callback) => {
				if (!origin) return callback(null, true);
				if (
					allowedOrigins.includes(origin) ||
					origin.endsWith(".onrender.com") ||
					origin.endsWith(".vercel.app")
				) {
					return callback(null, true);
				}
				return callback(null, true);
			},
			methods: ["GET", "POST"],
			credentials: true,
		},
	});

	// Reject unauthenticated sockets before any event handler runs.
	io.use(async (socket, next) => {
		try {
			const identity = await resolveSocketIdentity(
				socket.request.headers,
				socket.handshake.auth?.token,
			);
			if (!identity) {
				return next(new Error("Unauthorized"));
			}
			(socket as AuthedSocket).data = { identity, candidateAttempts: new Set<string>() };
			next();
		} catch (err) {
			console.error("[Socket] Handshake authentication error:", err);
			next(new Error("Unauthorized"));
		}
	});

	io.on("connection", (rawSocket: Socket) => {
		const socket = rawSocket as AuthedSocket;
		const { identity } = socket.data;
		const uId = identity.userId;

		const sockets = userSocketCounts.get(uId) ?? new Set<string>();
		const firstConnection = sockets.size === 0;
		sockets.add(socket.id);
		userSocketCounts.set(uId, sockets);
		if (firstConnection) {
			io?.emit("user-status", { userId: uId, status: "online" });
		}
		// Private room for per-user notifications (e.g. support assignments).
		void socket.join(`user-${uId}`);
		// Support presence: a connected rep is online for the assignment engine.
		if (firstConnection && (identity.role === "support" || identity.role === "admin")) {
			void setSupportPresence(uId, true);
		}

		// Support Hub typing indicator (only within an authorised ticket room).
		socket.on("chat:typing", (data: { ticketId?: unknown; isTyping?: unknown }) => {
			const ticketId = typeof data?.ticketId === "string" ? data.ticketId : null;
			if (!ticketId || !socket.rooms.has(`support-ticket-${ticketId}`)) return;
			const staff = identity.role === "support" || identity.role === "admin";
			socket.to(`support-ticket-${ticketId}`).emit("chat:typing", {
				ticketId,
				name: identity.name,
				senderType: staff ? "agent" : "student",
				isTyping: Boolean(data.isTyping),
			});
		});

		socket.on("join-room", async (roomId: unknown, ack?: (res: { ok: boolean }) => void) => {
			if (typeof roomId !== "string" || roomId.length > 200) {
				ack?.({ ok: false });
				return;
			}
			const allowed = await canJoinRoom(identity, roomId).catch(() => false);
			if (!allowed) {
				console.warn(`[Socket] Denied ${uId} (${identity.role}) joining room ${roomId}`);
				socket.emit("room-denied", { roomId });
				ack?.({ ok: false });
				return;
			}
			// Faculty never join the whole-assessment monitor room: they are
			// subscribed only to the sub-rooms of their assigned sections, so live
			// telemetry for other sections' students is never delivered to them.
			if (
				roomId.startsWith("assessment-proctoring-") &&
				identity.role === "faculty" &&
				!isMultiPortalEmail(identity.email)
			) {
				const assessmentId = roomId.slice("assessment-proctoring-".length);
				for (const section of parseSections(identity.section)) {
					await socket.join(sectionMonitorRoom(assessmentId, section));
				}
			} else {
				await socket.join(roomId);
			}

			// Candidate presence tracking for live proctoring.
			if (roomId.startsWith("student-proctoring-")) {
				const attemptId = roomId.slice("student-proctoring-".length);
				const attempt = await prisma.assessmentAttempt.findUnique({
					where: { id: attemptId },
					select: { studentId: true, assessmentId: true },
				});
				if (attempt && attempt.studentId === uId) {
					socket.data.candidateAttempts.add(attemptId);
					await setAttemptPresence(attemptId, true);
					liveAttempts.set(attemptId, attempt.assessmentId);
					socket.emit("live-config", {
						attemptId,
						fps: liveFpsFor(attemptId, attempt.assessmentId),
					});
				}
			}
			if (roomId.startsWith("assessment-live-")) {
				liveFocus.set(socket.id, null);
				pushLiveConfig(roomId.slice("assessment-live-".length));
			}
			ack?.({ ok: true });
		});

		socket.on("leave-room", (roomId: unknown) => {
			if (typeof roomId === "string") {
				socket.leave(roomId);
				if (roomId.startsWith("assessment-live-")) {
					liveFocus.delete(socket.id);
					pushLiveConfig(roomId.slice("assessment-live-".length));
				}
			}
		});

		// Faculty opens (attemptId) or closes (null) the full-size view of one candidate.
		socket.on("live-focus", (data: { assessmentId?: unknown; attemptId?: unknown }) => {
			const assessmentId = typeof data?.assessmentId === "string" ? data.assessmentId : null;
			if (!assessmentId || !socket.rooms.has(liveRoom(assessmentId))) return;
			const attemptId = typeof data.attemptId === "string" ? data.attemptId : null;
			if (attemptId && liveAttempts.get(attemptId) !== assessmentId) return;
			liveFocus.set(socket.id, attemptId);
			pushLiveConfig(assessmentId);
		});

		// Candidate camera frame → faculty watching this assessment (dropped if they lag).
		socket.on("live-frame", (data: { attemptId?: unknown; frame?: unknown }) => {
			const attemptId = typeof data?.attemptId === "string" ? data.attemptId : null;
			const frame = typeof data?.frame === "string" ? data.frame : null;
			if (!attemptId || !frame || !socket.data.candidateAttempts.has(attemptId)) return;
			if (frame.length > LIVE_MAX_FRAME_CHARS || !frame.startsWith("data:image/jpeg;base64,"))
				return;
			const assessmentId = liveAttempts.get(attemptId);
			if (!assessmentId) return;

			const key = `${socket.id}:${attemptId}`;
			const now = Date.now();
			if (now - (lastLiveFrameAt.get(key) ?? 0) < LIVE_MIN_INTERVAL_MS) return;
			lastLiveFrameAt.set(key, now);

			io?.to(liveRoom(assessmentId)).volatile.emit("live-frame", { attemptId, frame, at: now });
		});

		// Lightweight liveness ping from the candidate while an exam is open.
		socket.on("proctor-heartbeat", async (data: { attemptId?: unknown }) => {
			const attemptId = typeof data?.attemptId === "string" ? data.attemptId : null;
			if (!attemptId || !socket.data.candidateAttempts.has(attemptId)) return;
			await prisma.assessmentAttempt
				.update({
					where: { id: attemptId },
					data: { lastHeartbeatAt: new Date(), isOnline: true },
				})
				.catch(() => undefined);
		});

		socket.on(
			"send-message",
			async (data: {
				content: string;
				type: "college" | "class" | "private";
				roomId: string;
				recipientId?: string;
				department?: string;
				semester?: string;
				section?: string;
				attachments?: string[];
			}) => {
				try {
					if (!data || typeof data.roomId !== "string" || typeof data.content !== "string") {
						return;
					}
					// Must be an authorized member of the target room.
					if (!socket.rooms.has(data.roomId)) {
						socket.emit("error", { message: "You are not a member of this conversation." });
						return;
					}
					// The college notice board is read-only for everyone except administrators.
					if (data.roomId === "college" || data.type === "college") {
						if (identity.role !== "admin") {
							socket.emit("error", { message: "Only administrators can post college announcements." });
							return;
						}
					}
					// Private chats: the room must be this exact pair, and the pair must be allowed to talk
					// (approved faculty chat, accepted friend request, or an administrator).
					if (data.type === "private" || data.roomId.startsWith("private:")) {
						const recipientId = typeof data.recipientId === "string" ? data.recipientId : "";
						const expectedRoom = `private:${[identity.userId, recipientId].sort().join("-")}`;
						if (
							!recipientId ||
							data.roomId !== expectedRoom ||
							!(await canDirectMessage({ id: identity.userId, role: identity.role }, recipientId))
						) {
							socket.emit("error", { message: "You can only message approved contacts and accepted friends." });
							return;
						}
					}
					// Class metadata is derived from the (authorized) room key, not the payload.
					const [, roomDept, roomSem, roomSec] = data.roomId.startsWith("class:")
						? data.roomId.split(":")
						: [];

					const savedMessage = await prisma.chatMessage.create({
						data: {
							// Sender identity comes from the verified session, not the payload.
							senderId: identity.userId,
							senderName: identity.name,
							senderRole: identity.role,
							content: data.content.slice(0, 5000),
							type: data.type,
							department: roomDept ?? null,
							semester: roomSem ?? null,
							section: roomSec ?? null,
							recipientId: data.recipientId || null,
							attachments: data.attachments ? JSON.stringify(data.attachments) : null,
						},
					});

					io?.to(data.roomId).emit("new-message", {
						...savedMessage,
						roomId: data.roomId,
						attachments: data.attachments || [],
					});

					if (data.type === "private" && data.recipientId) {
						for (const sid of userSocketCounts.get(data.recipientId) ?? []) {
							io?.to(sid).emit("dm-notification", {
								senderId: identity.userId,
								senderName: identity.name,
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

		socket.on("typing", (data: { roomId: string; isTyping: boolean }) => {
			if (!data || typeof data.roomId !== "string" || !socket.rooms.has(data.roomId)) return;
			socket.to(data.roomId).emit("user-typing", {
				roomId: data.roomId,
				userId: identity.userId,
				username: identity.name,
				isTyping: Boolean(data.isTyping),
			});
		});

		// Rooms are still readable here (they are already empty in "disconnect").
		let watchedAssessments: string[] = [];
		socket.on("disconnecting", () => {
			watchedAssessments = [...socket.rooms]
				.filter((r) => r.startsWith("assessment-live-"))
				.map((r) => r.slice("assessment-live-".length));
		});

		socket.on("disconnect", async () => {
			liveFocus.delete(socket.id);
			for (const aid of watchedAssessments) pushLiveConfig(aid);
			for (const key of lastLiveFrameAt.keys()) {
				if (key.startsWith(`${socket.id}:`)) lastLiveFrameAt.delete(key);
			}

			for (const attemptId of socket.data.candidateAttempts) {
				// Only mark offline if no other socket of this student still holds the room.
				const room = io?.sockets.adapter.rooms.get(`student-proctoring-${attemptId}`);
				let stillConnected = false;
				for (const sid of room ?? []) {
					const other = io?.sockets.sockets.get(sid) as AuthedSocket | undefined;
					if (other && other.data.identity?.userId === uId) {
						stillConnected = true;
						break;
					}
				}
				if (!stillConnected) {
					liveAttempts.delete(attemptId);
					await setAttemptPresence(attemptId, false);
				}
			}

			const set = userSocketCounts.get(uId);
			set?.delete(socket.id);
			if (!set || set.size === 0) {
				userSocketCounts.delete(uId);
				io?.emit("user-status", { userId: uId, status: "offline" });
				if (identity.role === "support" || identity.role === "admin") void setSupportPresence(uId, false);
			}
		});
	});

	return io;
}

export function getIO() {
	return io;
}

/** Sends an event to every open socket of one user (e.g. a faculty member's dashboard tabs). */
export function emitToUser(userId: string, event: string, payload: unknown): void {
	for (const sid of userSocketCounts.get(userId) ?? []) io?.to(sid).emit(event, payload);
}

export function isUserOnline(userId: string): boolean {
	return (userSocketCounts.get(userId)?.size ?? 0) > 0;
}
