import { hashPassword, verifyPassword } from "better-auth/crypto";
import type { Request, Response } from "express";
import { HTTP_STATUS } from "../../../constants/http-status";
import { prisma } from "../../../database";
import { AppError } from "../../../utils/app-error";
import { sendSuccess } from "../../../utils/response";

import { verifyFace } from "../../proctoring/services/proctoring-service";

function getAuthUser(req: Request) {
	const user = req.user;
	if (!user) {
		throw new AppError("Unauthorized: Authentication session required", HTTP_STATUS.UNAUTHORIZED);
	}
	return user;
}

/**
 * GET /api/profile
 */
export async function getProfile(req: Request, res: Response): Promise<void> {
	const user = getAuthUser(req);
	const userId = user.id;

	const user = await prisma.user.findUnique({
		where: { id: userId },
		include: {
			accounts: {
				select: {
					id: true,
					providerId: true,
					scope: true,
					createdAt: true,
				},
			},
		},
	});

	if (!user) {
		throw new AppError("User not found", HTTP_STATUS.NOT_FOUND);
	}

	sendSuccess(res, user, "Profile retrieved successfully", HTTP_STATUS.OK);
}

/**
 * PUT /api/profile
 */
export async function updateProfile(req: Request, res: Response): Promise<void> {
	const userAuth = getAuthUser(req);
	const userId = userAuth.id;

	const {
		name,
		email,
		phoneNumber,
		bio,
		designation,
		institutionName,
		department,
		academicId,
		rollNumber,
		semester,
		branch,
		section,
		subjects,
		accessLevel,
		managedDepartments,
		image,
	} = req.body;

	// Find if user exists
	const user = await prisma.user.findUnique({
		where: { id: userId },
	});

	if (!user) {
		throw new AppError("User not found", HTTP_STATUS.NOT_FOUND);
	}

	// Enforce face verification on image update
	if (
		image !== undefined &&
		image !== null &&
		image !== user.image &&
		!req.body.bypassFaceVerification
	) {
		try {
			if (user.image) {
				// User has a registered face: compare the new face with the previously registered face
				const faceResult = await verifyFace(image, user.image);
				if (!faceResult.faceDetected) {
					throw new AppError(
						"Face verification failed: No face detected in the captured image.",
						HTTP_STATUS.BAD_REQUEST,
					);
				}
				if (!faceResult.match) {
					throw new AppError(
						"Face verification failed: Captured face does not match the previously registered face.",
						HTTP_STATUS.BAD_REQUEST,
					);
				}
			} else {
				// User doesn't have a registered face yet: ensure a face is present
				const faceResult = await verifyFace(image);
				if (!faceResult.faceDetected) {
					throw new AppError(
						"Face verification failed: No face detected in the captured image.",
						HTTP_STATUS.BAD_REQUEST,
					);
				}
			}
		} catch (err: any) {
			if (err instanceof AppError) throw err;
			throw new AppError(
				err.message || "Face verification engine failed.",
				HTTP_STATUS.BAD_REQUEST,
			);
		}
	}

	// Update user database record
	const updated = await prisma.user.update({
		where: { id: userId },
		data: {
			name: name !== undefined ? name : user.name,
			email: email !== undefined ? email : user.email,
			phoneNumber: phoneNumber !== undefined ? phoneNumber : user.phoneNumber,
			bio: bio !== undefined ? bio : user.bio,
			designation: designation !== undefined ? designation : user.designation,
			institutionName: institutionName !== undefined ? institutionName : user.institutionName,
			department: department !== undefined ? department : user.department,
			academicId: academicId !== undefined ? academicId : user.academicId,
			rollNumber: rollNumber !== undefined ? rollNumber : user.rollNumber,
			semester: semester !== undefined ? semester : user.semester,
			branch: branch !== undefined ? branch : user.branch,
			section: section !== undefined ? section : user.section,
			subjects: subjects !== undefined ? subjects : user.subjects,
			accessLevel: accessLevel !== undefined ? accessLevel : user.accessLevel,
			managedDepartments:
				managedDepartments !== undefined ? managedDepartments : user.managedDepartments,
			image: image !== undefined ? image : user.image,
		},
	});

	// Create audit log for profile update
	const ip = getHeaderString(req.headers["x-forwarded-for"]) || req.socket.remoteAddress || "";
	const ua = getHeaderString(req.headers["user-agent"]) || "";
	await prisma.userLog.create({
		data: {
			userId,
			action: "update_profile",
			ipAddress: ip,
			userAgent: ua,
		},
	});

	// Generate notification
	await prisma.notification.create({
		data: {
			userId,
			title: "Account Details Updated",
			description: "Your profile information has been successfully synchronized and updated.",
			type: "system",
			priority: "low",
			senderName: "Security Control",
			senderRole: "system",
		},
	});

	sendSuccess(res, updated, "Profile updated successfully", HTTP_STATUS.OK);
}

import { validatePasswordStrength } from "@/utils/password-validator";

/**
 * PUT /api/profile/password
 */
export async function changePassword(req: Request, res: Response): Promise<void> {
	const userAuth = getAuthUser(req);
	const userId = userAuth.id;

	const { currentPassword, newPassword } = req.body;
	if (!currentPassword || !newPassword) {
		throw new AppError("Current password and new password are required", HTTP_STATUS.BAD_REQUEST);
	}

	const user = await prisma.user.findUnique({
		where: { id: userId },
	});
	if (!user) {
		throw new AppError("User not found", HTTP_STATUS.NOT_FOUND);
	}

	// 1. Password Strength Validation
	const validation = validatePasswordStrength(newPassword, {
		name: user.name,
		email: user.email,
		rollNumber: user.rollNumber,
		academicId: user.academicId,
	});

	if (!validation.isValid) {
		throw new AppError(
			`Password does not meet requirements: ${validation.suggestions.join(" ")}`,
			HTTP_STATUS.BAD_REQUEST,
		);
	}

	const account = await prisma.account.findFirst({
		where: { userId, providerId: "credential" },
	});

	if (!account || !account.password) {
		throw new AppError("Credentials account not found for this user", HTTP_STATUS.NOT_FOUND);
	}

	// 2. Current Password Verification
	const isCorrect = await verifyPassword({
		password: currentPassword,
		hash: account.password,
	});

	if (!isCorrect) {
		throw new AppError("Incorrect current password", HTTP_STATUS.BAD_REQUEST);
	}

	// 3. New password cannot be the same as the current password
	const isSameAsCurrent = await verifyPassword({
		password: newPassword,
		hash: account.password,
	});
	if (isSameAsCurrent) {
		throw new AppError(
			"New password must be different from current password.",
			HTTP_STATUS.BAD_REQUEST,
		);
	}

	// 4. Validate Reuse against Password History (last 10)
	const histories = await prisma.passwordHistory.findMany({
		where: { userId },
		orderBy: { createdAt: "desc" },
		take: 10,
	});

	for (const history of histories) {
		const isMatch = await verifyPassword({
			password: newPassword,
			hash: history.hash,
		});
		if (isMatch) {
			throw new AppError(
				"❌ You cannot reuse any of your last 10 passwords. Please choose a different password.",
				HTTP_STATUS.BAD_REQUEST,
			);
		}
	}

	// 5. Store current password hash in history
	await prisma.passwordHistory.create({
		data: {
			userId,
			hash: account.password,
		},
	});

	// Prune history to last 10 entries
	const allHistories = await prisma.passwordHistory.findMany({
		where: { userId },
		orderBy: { createdAt: "desc" },
	});
	if (allHistories.length > 10) {
		const idsToDelete = allHistories.slice(10).map((h) => h.id);
		await prisma.passwordHistory.deleteMany({
			where: { id: { in: idsToDelete } },
		});
	}

	// 6. Save new password hash
	const hashedPassword = await hashPassword(newPassword);

	await prisma.account.update({
		where: { id: account.id },
		data: { password: hashedPassword },
	});

	// 7. Revoke all active sessions (force logout)
	await prisma.session.deleteMany({
		where: { userId },
	});

	// Audit log
	const ip = getHeaderString(req.headers["x-forwarded-for"]) || req.socket.remoteAddress || "";
	const ua = getHeaderString(req.headers["user-agent"]) || "";
	await prisma.userLog.create({
		data: {
			userId,
			ipAddress: ip,
			userAgent: ua,
			action: "change_password",
		},
	});

	// Notifications (Email mock + In-app notification)
	console.log(`[Security Alert] Sending password change confirmation email to ${user.email}`);

	await prisma.notification.create({
		data: {
			userId,
			title: "Security Password Changed",
			description:
				"Your password has been changed successfully. If you did not perform this action, please contact the administrator immediately.",
			type: "system",
			priority: "high",
			senderName: "Security Control",
			senderRole: "system",
		},
	});

	sendSuccess(res, null, "Password changed successfully. Please log in again.", HTTP_STATUS.OK);
}

/**
 * POST /api/profile/2fa
 */
export async function toggle2FA(req: Request, res: Response): Promise<void> {
	const userAuth = getAuthUser(req);
	const userId = userAuth.id;

	const { enabled } = req.body;

	const user = await prisma.user.findUnique({ where: { id: userId } });
	if (!user) {
		throw new AppError("User not found", HTTP_STATUS.NOT_FOUND);
	}

	const updated = await prisma.user.update({
		where: { id: userId },
		data: { twoFactorEnabled: !!enabled },
	});

	// Audit log
	const ip = getHeaderString(req.headers["x-forwarded-for"]) || req.socket.remoteAddress || "";
	const ua = getHeaderString(req.headers["user-agent"]) || "";
	await prisma.userLog.create({
		data: {
			userId,
			action: enabled ? "enable_2fa" : "disable_2fa",
			ipAddress: ip,
			userAgent: ua,
		},
	});

	// Notification
	await prisma.notification.create({
		data: {
			userId,
			title: enabled ? "Two-Factor Authentication Enabled" : "Two-Factor Authentication Disabled",
			description: enabled
				? "Two-Factor Authentication (2FA) is now active on your account."
				: "Two-Factor Authentication (2FA) has been deactivated. Your account is less secure.",
			type: "system",
			priority: enabled ? "medium" : "high",
			senderName: "Security Control",
			senderRole: "system",
		},
	});

	sendSuccess(res, updated, "2FA status updated successfully", HTTP_STATUS.OK);
}

/**
 * GET /api/profile/history
 */
export async function getActivityHistory(req: Request, res: Response): Promise<void> {
	const userAuth = getAuthUser(req);
	const userId = userAuth.id;

	const logs = await prisma.userLog.findMany({
		where: { userId },
		orderBy: { createdAt: "desc" },
		take: 50,
	});

	sendSuccess(res, logs, "Activity history retrieved successfully", HTTP_STATUS.OK);
}

/**
 * GET /api/profile/sessions
 */
export async function getSessions(req: Request, res: Response): Promise<void> {
	const userAuth = getAuthUser(req);
	const userId = userAuth.id;

	const sessions = await prisma.session.findMany({
		where: { userId },
		orderBy: { createdAt: "desc" },
	});

	sendSuccess(res, sessions, "Active sessions retrieved successfully", HTTP_STATUS.OK);
}

/**
 * DELETE /api/profile/sessions/:id
 */
export async function revokeSession(req: Request, res: Response): Promise<void> {
	const userAuth = getAuthUser(req);
	const userId = userAuth.id;
	const id = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id);

	const session = await prisma.session.findUnique({
		where: { id },
	});

	if (!session || session.userId !== userId) {
		throw new AppError("Session not found or unauthorized", HTTP_STATUS.NOT_FOUND);
	}

	await prisma.session.delete({
		where: { id },
	});

	sendSuccess(res, null, "Session revoked successfully", HTTP_STATUS.OK);
}
