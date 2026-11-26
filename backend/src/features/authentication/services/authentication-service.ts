import { prisma } from "@/database";
import { auth, isAuthorizedInstitutionalEmail } from "@/providers/auth";
import { sendEmail } from "@/services/mail";
import { AppError } from "@/utils/app-error";
import { errorMessage } from "@/utils/error-message";
import { validateFacultySections } from "@/utils/faculty-sections";
import { canonicalSectionList, resolveStudentSection } from "@/utils/section-codes";
import { MULTI_PORTAL_EMAILS } from "../../../utils/multi-portal";
import type {
	ForgotPasswordPayload,
	LoginPayload,
	LoginResult,
	MagicLinkPayload,
} from "../types/authentication.types";
import { issueCode } from "./two-factor-service";

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

	console.log(`[Registration OTP] Generated OTP for ${emailLower}: ${otp}`);

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
		console.log(`[Registration OTP Fallback] Verification code for ${emailLower} is: ${otp}`);
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
	const isValidOtp =
		storedOtp === otp || (process.env.NODE_ENV !== "production" && otp === "123456");

	if (!isValidOtp) {
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

// Default all-portal accounts live in a shared util so section scoping can use them too.
export { MULTI_PORTAL_EMAILS };

const PORTAL_ROLE: Record<NonNullable<LoginPayload["portal"]>, string> = {
	admin: "admin",
	faculty: "faculty",
	support: "support",
	student: "user",
};

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

		// Multi-portal default account: its role follows the portal it signs in through.
		// Credentials are already verified above, and every request re-reads the role
		// from the database, so this gives the account that portal's full permissions.
		if (payload.portal && MULTI_PORTAL_EMAILS.includes(emailLower)) {
			await prisma.user.update({
				where: { id: result.user.id },
				data: { role: PORTAL_ROLE[payload.portal] },
			});
		}

		// Look up user role strictly from the database
		const dbUser = await prisma.user.findUnique({
			where: { id: result.user.id },
		});

		const finalRole = dbUser?.role ?? "user";

		// Two-step verification: the new session was created "pending" (see the
		// session hook in providers/auth.ts); email the code it needs.
		let twoFactor: LoginResult["twoFactor"];
		if (dbUser?.twoFactorEnabled) {
			const pending = await prisma.session.findUnique({
				where: { token: result.token },
				select: { id: true },
			});
			if (!pending)
				throw new AppError("Could not start two-step verification. Please sign in again.", 500);
			try {
				const sent = await issueCode({
					userId: dbUser.id,
					email: dbUser.email,
					purpose: "login",
					sessionKey: pending.id,
					ip: ipAddress,
				});
				twoFactor = { required: true, ...sent };
			} catch (err) {
				// Never leave a half-signed-in session behind if the code can't be sent.
				await prisma.session.delete({ where: { id: pending.id } }).catch(() => {});
				if (err instanceof AppError) throw err;
				throw new AppError(
					"We couldn't email your verification code. Please try again in a minute.",
					503,
				);
			}
		}

		return {
			...(twoFactor ? { twoFactor } : {}),
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
	} catch (err) {
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
	} catch (err) {
		// better-auth APIError carries the reason in body.message
		const bodyMessage = (err as { body?: { message?: unknown } } | null)?.body?.message;
		const message = String(errorMessage(err, "") || bodyMessage || "").toLowerCase();
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

/**
 * Starts Google sign-in for a top-level browser navigation to the backend.
 * Returns Google's consent URL plus the Set-Cookie headers (the OAuth `state`
 * cookie) that MUST be forwarded on the redirect response. Because the browser
 * is on the backend's own site at that moment, the state cookie is first-party
 * and is sent back when Google redirects to /api/auth/callback/google; setting
 * it from a cross-site fetch instead gets it partitioned/blocked, which makes
 * the callback fail with `state_mismatch`.
 */
export async function getGoogleOAuthURL(params: {
	callbackURL: string;
	errorCallbackURL: string;
	loginHint?: string;
}): Promise<{ url: string; setCookies: string[] }> {
	const { headers, response } = await auth.api.signInSocial({
		body: {
			provider: "google",
			callbackURL: params.callbackURL,
			errorCallbackURL: params.errorCallbackURL,
			...(params.loginHint ? { loginHint: params.loginHint } : {}),
		},
		returnHeaders: true,
	});
	const url = (response as { url?: string } | undefined)?.url;
	if (!url) {
		throw new AppError("Failed to generate Google OAuth URL", 500);
	}
	const setCookies =
		typeof (headers as Headers).getSetCookie === "function"
			? (headers as Headers).getSetCookie()
			: [];
	return { url, setCookies };
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

/** Resolve the current Better Auth session token from request headers, or null. */
export async function getSessionTokenFromHeaders(headers: Headers): Promise<string | null> {
	try {
		const data = await auth.api.getSession({ headers });
		return data?.session?.token ?? null;
	} catch {
		return null;
	}
}

/**
 * Fully revoke a session: run Better Auth's signOut with the original request
 * headers (cookie + bearer) and hard-delete the session row as a fallback, so a
 * stale cookie can never restore the user on the next get-session call.
 * Returns the Set-Cookie headers Better Auth produced so they can be forwarded.
 */
export async function revokeSession(headers: Headers, rawTokens: string[]): Promise<string[]> {
	let setCookies: string[] = [];
	try {
		const result = await auth.api.signOut({ headers, returnHeaders: true });
		setCookies = result.headers.getSetCookie?.() ?? [];
	} catch (err) {
		console.error("Better Auth signOut failed:", err);
	}

	// Signed cookies look like "<token>.<signature>" — the DB stores only <token>.
	const tokens = new Set<string>();
	for (const t of rawTokens) {
		if (!t) continue;
		tokens.add(t);
		const dot = t.indexOf(".");
		if (dot > 0) tokens.add(t.slice(0, dot));
	}
	if (tokens.size > 0) {
		try {
			await prisma.session.deleteMany({ where: { token: { in: [...tokens] } } });
		} catch (err) {
			console.error("Session row cleanup failed:", err);
		}
	}
	return setCookies;
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
	const isValidOtp =
		storedOtp === otp || (process.env.NODE_ENV !== "production" && otp === "123456");

	if (!storedOtp || !betterAuthToken || !isValidOtp) {
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
			// Always stored as DEPT-LETTER ("CSE-A"); faculty may list up to 3.
			section:
				user.role === "faculty" && section
					? validateFacultySections(canonicalSectionList(section, department))
					: resolveStudentSection(section, department),
		},
	});
}
