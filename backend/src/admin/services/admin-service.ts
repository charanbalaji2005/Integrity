import { prisma } from "@/database";

export async function getAllUsers() {
	return prisma.user.findMany({
		include: {
			accounts: {
				select: {
					providerId: true,
				},
			},
		},
		orderBy: {
			createdAt: "desc",
		},
	});
}

export async function getUserLogs(userId: string) {
	return prisma.userLog.findMany({
		where: { userId },
		orderBy: {
			createdAt: "desc",
		},
	});
}

export async function suspendUser(userId: string) {
	await prisma.user.update({
		where: { id: userId },
		data: { status: "suspended" },
	});
	// Terminate active sessions
	await prisma.session.deleteMany({
		where: { userId },
	});
}

export async function unsuspendUser(userId: string) {
	await prisma.user.update({
		where: { id: userId },
		data: { status: "active", suspendedUntil: null },
	});
}

export async function tempSuspendUser(userId: string, durationHours: number) {
	const suspendedUntil = new Date(Date.now() + durationHours * 60 * 60 * 1000);
	await prisma.user.update({
		where: { id: userId },
		data: {
			status: "temporarily_suspended",
			suspendedUntil,
		},
	});
	// Terminate active sessions
	await prisma.session.deleteMany({
		where: { userId },
	});
}

export async function deleteUser(userId: string) {
	await prisma.user.delete({
		where: { id: userId },
	});
}

export async function logAdminAction(
	adminUserId: string,
	targetUserId: string,
	action: string,
	ipAddress?: string,
	userAgent?: string,
) {
	await prisma.userLog.create({
		data: {
			userId: targetUserId,
			action,
			ipAddress: ipAddress || null,
			userAgent: userAgent || null,
		},
	});
}

export async function updateUserRole(userId: string, role: string) {
	await prisma.user.update({
		where: { id: userId },
		data: { role },
	});
}
