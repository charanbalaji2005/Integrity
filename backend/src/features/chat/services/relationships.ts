import { HTTP_STATUS } from "../../../constants/http-status";
import { prisma } from "../../../database";
import { emitToUser } from "../../../providers/socket";
import { AppError } from "../../../utils/app-error";

/**
 * Who may talk to whom in private chats.
 *
 *  - Admins may message anyone.
 *  - A student and a faculty member: only after the faculty member approved the
 *    student's chat request.
 *  - Two students: only after one accepted the other's friend request. Friend
 *    requests are limited to classmates (same section and institution).
 */

export interface ChatUser {
	id: string;
	role: string;
	name?: string | null;
	section?: string | null;
	institutionName?: string | null;
}

const norm = (s: string | null | undefined) =>
	String(s ?? "")
		.trim()
		.toUpperCase();
const DEFAULT_INSTITUTION = "SRM University AP";
const institutionOf = (u: { institutionName?: string | null }) =>
	u.institutionName || DEFAULT_INSTITUTION;

export async function canDirectMessage(a: ChatUser, bId: string): Promise<boolean> {
	if (!bId || a.id === bId) return false;
	const b = await prisma.user.findUnique({ where: { id: bId }, select: { id: true, role: true } });
	if (!b) return false;
	if (a.role === "admin" || b.role === "admin") return true;

	const approvedChat = await prisma.chatRequest.count({
		where: {
			status: "approved",
			OR: [
				{ studentId: a.id, facultyId: b.id },
				{ studentId: b.id, facultyId: a.id },
			],
		},
	});
	if (approvedChat > 0) return true;

	const friends = await prisma.friendRequest.count({
		where: {
			status: "accepted",
			OR: [
				{ senderId: a.id, receiverId: b.id },
				{ senderId: b.id, receiverId: a.id },
			],
		},
	});
	return friends > 0;
}

function requireStudent(user: ChatUser) {
	if (user.role !== "user") {
		throw new AppError(
			"Friend requests are for students and their classmates.",
			HTTP_STATUS.FORBIDDEN,
		);
	}
}

/** Classmates of a student: other students in the same section and institution. */
async function classmateWhere(user: ChatUser) {
	const section = norm(user.section);
	if (!section) return null;
	return {
		role: "user",
		id: { not: user.id },
		section: { equals: section, mode: "insensitive" as const },
		institutionName: institutionOf(user),
	};
}

export type FriendStatus = "none" | "outgoing" | "incoming" | "friends";

export async function listClassmates(user: ChatUser) {
	requireStudent(user);
	const where = await classmateWhere(user);
	if (!where) return { section: null, classmates: [] };
	const [students, requests] = await Promise.all([
		prisma.user.findMany({
			where,
			select: {
				id: true,
				name: true,
				email: true,
				rollNumber: true,
				section: true,
				department: true,
				image: true,
			},
			orderBy: { name: "asc" },
			take: 300,
		}),
		prisma.friendRequest.findMany({
			where: {
				status: { in: ["pending", "accepted"] },
				OR: [{ senderId: user.id }, { receiverId: user.id }],
			},
			select: { id: true, senderId: true, receiverId: true, status: true },
		}),
	]);
	const byOther = new Map<string, { id: string; status: FriendStatus }>();
	for (const r of requests) {
		const other = r.senderId === user.id ? r.receiverId : r.senderId;
		const status: FriendStatus =
			r.status === "accepted" ? "friends" : r.senderId === user.id ? "outgoing" : "incoming";
		const prev = byOther.get(other);
		if (!prev || status === "friends") byOther.set(other, { id: r.id, status });
	}
	return {
		section: norm(user.section),
		classmates: students.map((s) => ({
			...s,
			friendStatus: byOther.get(s.id)?.status ?? ("none" as FriendStatus),
			requestId: byOther.get(s.id)?.id ?? null,
		})),
	};
}

export async function listFriendRequests(user: ChatUser) {
	requireStudent(user);
	const select = {
		id: true,
		name: true,
		email: true,
		rollNumber: true,
		section: true,
		department: true,
	};
	const [incoming, outgoing] = await Promise.all([
		prisma.friendRequest.findMany({
			where: { receiverId: user.id, status: "pending" },
			include: { sender: { select } },
			orderBy: { createdAt: "desc" },
		}),
		prisma.friendRequest.findMany({
			where: { senderId: user.id, status: "pending" },
			include: { receiver: { select } },
			orderBy: { createdAt: "desc" },
		}),
	]);
	return { incoming, outgoing };
}

/** Accepted friends, shaped like chat contacts. */
export async function listFriends(userId: string) {
	const rows = await prisma.friendRequest.findMany({
		where: { status: "accepted", OR: [{ senderId: userId }, { receiverId: userId }] },
		include: {
			sender: {
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
			receiver: {
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
	return rows.map((r) => ({
		...(r.senderId === userId ? r.receiver : r.sender),
		relation: "friend" as const,
	}));
}

function notifyRealtime(userId: string, event: string, payload: unknown) {
	emitToUser(userId, event, payload);
}

export async function sendFriendRequest(user: ChatUser, receiverId: string) {
	requireStudent(user);
	if (!receiverId || receiverId === user.id) {
		throw new AppError("Choose a classmate to send the request to.", HTTP_STATUS.BAD_REQUEST);
	}
	const where = await classmateWhere(user);
	if (!where) {
		throw new AppError(
			"Add your section to your profile to find classmates.",
			HTTP_STATUS.BAD_REQUEST,
		);
	}
	const classmate = await prisma.user.findFirst({
		where: { ...where, id: receiverId },
		select: { id: true, name: true },
	});
	if (!classmate) {
		throw new AppError(
			"You can only send friend requests to classmates in your section.",
			HTTP_STATUS.FORBIDDEN,
		);
	}

	const existing = await prisma.friendRequest.findMany({
		where: {
			OR: [
				{ senderId: user.id, receiverId },
				{ senderId: receiverId, receiverId: user.id },
			],
		},
	});
	if (existing.some((r) => r.status === "accepted")) {
		throw new AppError(`You and ${classmate.name} are already friends.`, HTTP_STATUS.CONFLICT);
	}
	// They already asked you: sending back simply accepts their request.
	const reverse = existing.find((r) => r.senderId === receiverId && r.status === "pending");
	if (reverse) {
		return respondToFriendRequest(user, reverse.id, "accept");
	}
	const mine = existing.find((r) => r.senderId === user.id);
	if (mine?.status === "pending") {
		throw new AppError("Your request is already pending.", HTTP_STATUS.CONFLICT);
	}

	const request = mine
		? await prisma.friendRequest.update({ where: { id: mine.id }, data: { status: "pending" } })
		: await prisma.friendRequest.create({ data: { senderId: user.id, receiverId } });

	await prisma.notification.create({
		data: {
			userId: receiverId,
			title: "New friend request",
			description: `${user.name ?? "A classmate"} sent you a friend request. Accept it to chat privately.`,
			type: "message",
			priority: "low",
			senderName: user.name ?? null,
			senderRole: "student",
		},
	});
	notifyRealtime(receiverId, "friend-request", {
		type: "received",
		requestId: request.id,
		from: { id: user.id, name: user.name },
	});
	return { request, status: "outgoing" as FriendStatus };
}

export async function respondToFriendRequest(
	user: ChatUser,
	requestId: string,
	action: "accept" | "decline" | "cancel",
) {
	requireStudent(user);
	const request = await prisma.friendRequest.findUnique({ where: { id: requestId } });
	if (!request || (request.receiverId !== user.id && request.senderId !== user.id)) {
		throw new AppError("Friend request not found.", HTTP_STATUS.NOT_FOUND);
	}
	if (request.status !== "pending") {
		throw new AppError("This request is no longer pending.", HTTP_STATUS.CONFLICT);
	}
	if (action === "cancel" && request.senderId !== user.id) {
		throw new AppError("Only the sender can cancel a request.", HTTP_STATUS.FORBIDDEN);
	}
	if ((action === "accept" || action === "decline") && request.receiverId !== user.id) {
		throw new AppError("Only the recipient can accept or decline.", HTTP_STATUS.FORBIDDEN);
	}

	const status = action === "accept" ? "accepted" : action === "decline" ? "declined" : "cancelled";
	const updated = await prisma.friendRequest.update({ where: { id: requestId }, data: { status } });

	if (action === "accept") {
		await prisma.notification.create({
			data: {
				userId: request.senderId,
				title: "Friend request accepted",
				description: `${user.name ?? "Your classmate"} accepted your friend request. You can now chat privately.`,
				type: "message",
				priority: "low",
				senderName: user.name ?? null,
				senderRole: "student",
			},
		});
	}
	const other = request.senderId === user.id ? request.receiverId : request.senderId;
	notifyRealtime(other, "friend-request", { type: status, requestId });
	return { request: updated, status: (action === "accept" ? "friends" : "none") as FriendStatus };
}

export async function removeFriend(user: ChatUser, otherId: string) {
	requireStudent(user);
	const result = await prisma.friendRequest.updateMany({
		where: {
			status: "accepted",
			OR: [
				{ senderId: user.id, receiverId: otherId },
				{ senderId: otherId, receiverId: user.id },
			],
		},
		data: { status: "cancelled" },
	});
	if (result.count === 0)
		throw new AppError("You are not friends with this student.", HTTP_STATUS.NOT_FOUND);
	notifyRealtime(otherId, "friend-request", { type: "removed" });
}
