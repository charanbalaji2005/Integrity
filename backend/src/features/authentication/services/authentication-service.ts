import { prisma } from "@/database";
import { auth, isAuthorizedInstitutionalEmail } from "@/providers/auth";
import { sendEmail } from "@/services/mail";
import { AppError } from "@/utils/app-error";
import type {
	ForgotPasswordPayload,
	LoginPayload,
	LoginResult,
	MagicLinkPayload,
} from "../types/authentication.types";

/**
 * Send 6-digit registration OTP to student/user university email
 */
export async function sendRegisterOtp(email: string): Promise<void> {
	const emailLower = email.toLowerCase().trim();

	if (!isAuthorizedInstitutionalEmail(emailLower)) {
		throw new AppError("Only authorized institutional email domains are allowed.", 400);
	}

	const existingUser = await prisma.user.findUnique({
		where: { email: emailLower },
	});

	if (existingUser) {
		throw new AppError("An account with this email address already exists. Please log in.", 400);
	}

	// Generate 6-digit OTP
	const otp = Math.floor(100000 + Math.random() * 900000).toString();

	// Delete existing OTPs for this email
	await prisma.verification.deleteMany({
		where: { identifier: `register-otp:${emailLower}` },
	});

	// Value format: "otp:failedAttempts"
	await prisma.verification.create({
		data: {
			identifier: `register-otp:${emailLower}`,
			value: `${otp}:0`,
			expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
		},
	});

	try {
		await sendEmail({
			to: emailLower,
			subject: "Student Registration Verification Code - IntegrityOS",
			html: `
        <div style="font-family: sans-serif; padding: 32px; color: #1a1917; max-width: 480px; margin: 0 auto; border: 2px solid #ebdcc9; border-radius: 24px; background-color: #fafaf8; text-align: center;">
          <h2 style="margin-top: 0; font-size: 24px; font-weight: bold; letter-spacing: -1px; color: #1a1917;">IntegrityOS</h2>
          <p style="font-size: 14px; color: #6b6861; margin-bottom: 24px;">Your verification code to complete student registration is:</p>
          <div style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #1a1917; background-color: #f0ece4; padding: 16px; border-radius: 12px; display: inline-block; margin-bottom: 24px; font-family: monospace;">
            ${otp}
          </div>
          <p style="font-size: 12px; color: #8e8a80; margin-bottom: 0;">This code is valid for 10 minutes. If you did not request this, please ignore this email.</p>
        </div>
      `,
		});
		console.log(`[Registration OTP] Sent OTP to ${emailLower}`);
	} catch (err) {
		console.error("Failed to send registration OTP email:", err);
		throw new AppError("Failed to send verification email. Please try again.", 500);
	}
}

/**
 * Verify student registration OTP and issue temporary registration authorization token
 */
export async function verifyRegisterOtp(email: string, otp: string): Promise<void> {
	const emailLower = email.toLowerCase().trim();

	const record = await prisma.verification.findFirst({
		where: { identifier: `register-otp:${emailLower}` },
	});

	if (!record) {
		throw new AppError("Invalid or expired verification code.", 400);
	}

	if (record.expiresAt.getTime() <= Date.now()) {
		await prisma.verification.delete({ where: { id: record.id } });
		throw new AppError("Verification code has expired. Please request a new code.", 400);
	}

	const [storedOtp, attemptsStr] = record.value.split(":");
	const attempts = parseInt(attemptsStr || "0", 10);

	if (storedOtp !== otp) {
		const newAttempts = attempts + 1;
		if (newAttempts >= 5) {
			await prisma.verification.delete({ where: { id: record.id } });
			throw new AppError(
				"Too many failed attempts. Verification code invalidated. Please request a new code.",
				400,
			);
		}
		await prisma.verification.update({
			where: { id: record.id },
			data: { value: `${storedOtp}:${newAttempts}` },
		});
		throw new AppError(`Invalid verification code. ${5 - newAttempts} attempts remaining.`, 400);
	}

	// Delete used OTP
	await prisma.verification.delete({ where: { id: record.id } });

	// Invalidate any existing verified-register-email tokens for this email
	await prisma.verification.deleteMany({
		where: { identifier: `verified-register-email:${emailLower}` },
	});

	// Create short-lived token to authorize user creation in Better Auth database hook
	await prisma.verification.create({
		data: {
			identifier: `verified-register-email:${emailLower}`,
			value: "verified",
			expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
		},
	});
}

/**
 * Email + Password Login
 * Authenticates credentials via Better Auth and derives user role strictly from database.
 * NEVER accepts role from client.
 */
export async function loginWithEmailPassword(
	payload: LoginPayload,
	ipAddress?: string,
	userAgent?: string,
): Promise<LoginResult> {
	const emailLower = payload.email.toLowerCase().trim();

	// Check if user is locked out
	const existingUser = await prisma.user.findUnique({
		where: { email: emailLower },
	});

	if (existingUser) {
		const isLocked =
			existingUser.status === "locked" ||
			(existingUser.lockedUntil && new Date(existingUser.lockedUntil).getTime() > Date.now());
		if (isLocked) {
			const lockedTime = existingUser.lockedUntil
				? new Date(existingUser.lockedUntil).getTime()
				: 0;
			const minsLeft = lockedTime > Date.now() ? Math.ceil((lockedTime - Date.now()) / 60000) : 0;
			if (minsLeft > 0) {
				throw new AppError(
					`Account is temporarily locked. Please try again after ${minsLeft} minutes.`,
					403,
				);
			} else {
				throw new AppError("Account is locked. Please contact administrator for assistance.", 403);
			}
		}
	}

	try {
		const result = await auth.api.signInEmail({
			body: {
				email: payload.email,
				password: payload.password,
			},
			headers: {
				"x-forwarded-for": ipAddress ?? "",
				"user-agent": userAgent ?? "",
			},
		});

		if (!result?.user || !result.token) {
			throw new AppError("Invalid email or password", 401);
		}

		// Reset failed attempts on success
		if (existingUser && (existingUser.failedLoginAttempts > 0 || existingUser.lockedUntil)) {
			await prisma.user.update({
				where: { id: existingUser.id },
				data: {
					failedLoginAttempts: 0,
					lockedUntil: null,
				},
			});
		}

		// Look up user role strictly from the database
		const dbUser = await prisma.user.findUnique({
			where: { id: result.user.id },
		});

		const finalRole = dbUser?.role ?? "user";

		return {
			user: {
				id: result.user.id,
				name: result.user.name,
				email: result.user.email,
				emailVerified: result.user.emailVerified,
				image: result.user.image ?? null,
				role: finalRole,
				status: (result.user as any).status,
				suspendedUntil: (result.user as any).suspendedUntil,
				institutionName: dbUser?.institutionName ?? (result.user as any).institutionName ?? null,
				department: dbUser?.department ?? (result.user as any).department ?? null,
				academicId: dbUser?.academicId ?? (result.user as any).academicId ?? null,
				createdAt: result.user.createdAt,
				updatedAt: result.user.updatedAt,
			},
			session: {
				token: result.token,
				expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days fallback
			},
		};
	} catch (err: any) {
		if (existingUser) {
			const attempts = existingUser.failedLoginAttempts + 1;
			const shouldLock = attempts >= 5;
			const lockUntil = shouldLock ? new Date(Date.now() + 15 * 60000) : null;

			await prisma.user.update({
				where: { id: existingUser.id },
				data: {
					failedLoginAttempts: attempts >= 5 ? 5 : attempts,
					lockedUntil: lockUntil || undefined,
				},
			});

			if (shouldLock) {
				console.log(
					`[Security Alert] Account locked due to 5 consecutive failed attempts: ${payload.email}`,
				);
				throw new AppError(
					"Account has been temporarily locked for 15 minutes due to 5 consecutive failed login attempts.",
					403,
				);
			}
		}
		throw err;
	}
}

/**
 * Forgot Password
 * Always returns without leaking whether the email exists.
 */
export async function requestPasswordReset(
	payload: ForgotPasswordPayload,
	frontendOrigin?: string,
): Promise<void> {
	const origin = frontendOrigin || "http://localhost:5173";
	try {
		await auth.api.requestPasswordReset({
			body: {
				email: payload.email,
				redirectTo: `${origin}`,
			},
		});
	} catch (err: any) {
		const message = String(err?.message || err?.body?.message || "").toLowerCase();
		const isUserNotFound = message.includes("user not found") || message.includes("no user");

		if (isUserNotFound) {
			return;
		}

		console.error("[Auth Service] requestPasswordReset failed:", err);
	}
}

/**
 * Magic Link (Email me a magic link)
 */
export async function sendMagicLink(payload: MagicLinkPayload): Promise<void> {
	try {
		// @ts-expect-error — magicLink is optional
		await auth.api.signInMagicLink({
			body: {
				email: payload.email,
				callbackURL: `${process.env.BETTER_AUTH_URL}/dashboard`,
			},
		});
	} catch {
		// Swallow errors — never reveal if email exists
	}
}

export async function getGoogleOAuthURL(callbackURL?: string): Promise<string> {
	const cb = callbackURL || "http://localhost:5174";
	const result = await auth.api.signInSocial({
		body: {
			provider: "google",
			callbackURL: cb,
		},
	});
	if (!result?.url) {
		throw new AppError("Failed to generate Google OAuth URL", 500);
	}
	return result.url;
}

/**
 * Logout
 * Revokes the current session token in the `sessions` table.
 */
export async function logout(sessionToken: string): Promise<void> {
	await auth.api.signOut({
		headers: {
			authorization: `Bearer ${sessionToken}`,
		},
	});
}

/**
 * Verify Password Reset OTP with Brute Force Lockout
 */
export async function verifyPasswordResetOtp(email: string, otp: string): Promise<string> {
	const emailLower = email.toLowerCase().trim();

	const record = await prisma.verification.findFirst({
		where: {
			identifier: `otp:${emailLower}`,
		},
	});

	if (!record) {
		throw new AppError("Invalid or expired OTP code.", 400);
	}

	if (record.expiresAt.getTime() <= Date.now()) {
		await prisma.verification.delete({ where: { id: record.id } });
		throw new AppError("Invalid or expired OTP code.", 400);
	}

	// Format: "storedOtp:betterAuthToken" or "storedOtp:betterAuthToken:attempts"
	const parts = record.value.split(":");
	const storedOtp = parts[0];
	const betterAuthToken = parts[1];
	const attempts = parseInt(parts[2] || "0", 10);

	if (!storedOtp || !betterAuthToken || storedOtp !== otp) {
		const newAttempts = attempts + 1;
		if (newAttempts >= 5) {
			await prisma.verification.delete({ where: { id: record.id } });
			throw new AppError(
				"Too many failed attempts. Verification code has expired. Please request a new one.",
				400,
			);
		}
		await prisma.verification.update({
			where: { id: record.id },
			data: { value: `${storedOtp}:${betterAuthToken}:${newAttempts}` },
		});
		throw new AppError(`Invalid OTP code. ${5 - newAttempts} attempts remaining.`, 400);
	}

	// Clean up verification record after single successful use
	await prisma.verification.delete({
		where: { id: record.id },
	});

	return betterAuthToken;
}

/**
 * Update academic credentials for an authenticated user
 * Uses the authenticated user's ID.
 * NEVER accepts role or email from the client.
 */
export async function updateUserCredentials(
	userId: string,
	institutionName: string,
	department: string,
	academicId: string,
	name?: string,
	semester?: string,
	branch?: string,
	section?: string,
): Promise<void> {
	const user = await prisma.user.findUnique({
		where: { id: userId },
	});

	if (!user) {
		throw new AppError("User not found.", 404);
	}

	await prisma.user.update({
		where: { id: userId },
		data: {
			institutionName,
			department,
			academicId,
			name: name || user.name,
			semester: semester || null,
			branch: branch || null,
			section: section || null,
		},
	});
}
