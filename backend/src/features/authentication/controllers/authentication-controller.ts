import type { Request, Response } from "express";

import { env } from "@/config/env";
import { HTTP_STATUS } from "@/constants/http-status";
import { AppError } from "@/utils/app-error";
import { sendSuccess } from "@/utils/response";

import {
	forgotPasswordSchema,
	loginSchema,
	magicLinkSchema,
	sendRegisterOtpSchema,
	verifyRegisterOtpSchema,
} from "../schemas/login-schema";

import {
	getGoogleOAuthURL,
	loginWithEmailPassword,
	logout,
	requestPasswordReset,
	sendMagicLink,
	sendRegisterOtp,
	updateUserCredentials,
	verifyPasswordResetOtp,
	verifyRegisterOtp,
} from "../services/authentication-service";

/**
 * POST /api/authentication/send-register-otp
 * Body: { email }
 */
export async function sendRegisterOtpHandler(req: Request, res: Response): Promise<void> {
	const parsed = sendRegisterOtpSchema.safeParse(req.body);

	if (!parsed.success) {
		throw new AppError(
			parsed.error.issues[0]?.message ?? "Invalid email address",
			HTTP_STATUS.BAD_REQUEST,
		);
	}

	await sendRegisterOtp(parsed.data.email);
	sendSuccess(res, null, "Verification code sent to your email", HTTP_STATUS.OK);
}

/**
 * POST /api/authentication/verify-register-otp
 * Body: { email, otp }
 */
export async function verifyRegisterOtpHandler(req: Request, res: Response): Promise<void> {
	const parsed = verifyRegisterOtpSchema.safeParse(req.body);

	if (!parsed.success) {
		throw new AppError(
			parsed.error.issues[0]?.message ?? "Invalid verification code",
			HTTP_STATUS.BAD_REQUEST,
		);
	}

	await verifyRegisterOtp(parsed.data.email, parsed.data.otp);
	sendSuccess(res, null, "Email verified successfully", HTTP_STATUS.OK);
}

/**
 * POST /api/authentication/login
 * Body: { email, password }
 */
export async function login(req: Request, res: Response): Promise<void> {
	const parsed = loginSchema.safeParse(req.body);

	if (!parsed.success) {
		throw new AppError(
			parsed.error.issues[0]?.message ?? "Validation failed",
			HTTP_STATUS.BAD_REQUEST,
		);
	}

	const ipAddress = (req.headers["x-forwarded-for"] as string) ?? req.socket.remoteAddress;
	const userAgent = req.headers["user-agent"];

	const result = await loginWithEmailPassword(parsed.data, ipAddress, userAgent);

	// Set session token cookies for web clients
	const cookieOptions = {
		httpOnly: true,
		secure: true,
		sameSite: "none" as const,
		expires: result.session.expiresAt,
		path: "/",
	};

	res.cookie("session_token", result.session.token, cookieOptions);
	res.cookie("better-auth.session_token", result.session.token, cookieOptions);

	sendSuccess(res, result, "Login successful", HTTP_STATUS.OK);
}

/**
 * POST /api/authentication/forgot-password
 * Body: { email }
 */
export async function forgotPassword(req: Request, res: Response): Promise<void> {
	const parsed = forgotPasswordSchema.safeParse(req.body);

	if (!parsed.success) {
		throw new AppError(
			parsed.error.issues[0]?.message ?? "Validation failed",
			HTTP_STATUS.BAD_REQUEST,
		);
	}

	let frontendOrigin = env.FRONTEND_URL;
	const referer = req.headers.referer || req.headers.origin;
	if (referer) {
		try {
			const parsedUrl = new URL(referer);
			const allowedOrigins = [
				env.FRONTEND_URL,
				"http://localhost:5173",
				"http://localhost:5174",
				"http://localhost:5175",
			];
			if (allowedOrigins.includes(parsedUrl.origin)) {
				frontendOrigin = parsedUrl.origin;
			}
		} catch {
			// ignore
		}
	}

	await requestPasswordReset(parsed.data, frontendOrigin);

	// Always return 200 to prevent email enumeration
	sendSuccess(res, null, "If that email exists, a reset link has been sent.", HTTP_STATUS.OK);
}

/**
 * POST /api/authentication/verify-otp
 * Body: { email, otp }
 */
export async function verifyOtp(req: Request, res: Response): Promise<void> {
	const { email, otp } = req.body;

	if (!email || !otp) {
		throw new AppError("Email and OTP are required.", HTTP_STATUS.BAD_REQUEST);
	}

	const betterAuthToken = await verifyPasswordResetOtp(email, otp);

	sendSuccess(res, { token: betterAuthToken }, "OTP verified successfully", HTTP_STATUS.OK);
}

/**
 * POST /api/authentication/magic-link
 * Body: { email }
 */
export async function magicLink(req: Request, res: Response): Promise<void> {
	const parsed = magicLinkSchema.safeParse(req.body);

	if (!parsed.success) {
		throw new AppError(
			parsed.error.issues[0]?.message ?? "Validation failed",
			HTTP_STATUS.BAD_REQUEST,
		);
	}

	await sendMagicLink(parsed.data);

	sendSuccess(res, null, "If that email exists, a magic link has been sent.", HTTP_STATUS.OK);
}

/**
 * GET /api/authentication/google
 * Redirects to Google OAuth
 */
export async function googleOAuth(req: Request, res: Response): Promise<void> {
	let callbackURL = "http://localhost:5174";
	const referer = req.headers.referer;
	if (referer) {
		try {
			callbackURL = new URL(referer).origin;
		} catch {
			// ignore
		}
	}
	const url = await getGoogleOAuthURL(callbackURL);
	res.redirect(url);
}

/**
 * POST /api/authentication/logout
 * Requires Authorization: Bearer <token> or session cookie
 */
export async function logoutUser(req: Request, res: Response): Promise<void> {
	const cookies: Record<string, string> = {};
	const cookieHeader = req.headers.cookie;
	if (cookieHeader) {
		for (const pair of cookieHeader.split(";")) {
			const [key, val] = pair.split("=");
			if (key && val) {
				cookies[key.trim()] = decodeURIComponent(val.trim());
			}
		}
	}

	const token =
		cookies.session_token ??
		cookies["better-auth.session_token"] ??
		cookies["better-auth.session-token"] ??
		req.headers.authorization?.replace("Bearer ", "");

	const clearOptions = {
		httpOnly: true,
		secure: true,
		sameSite: "none" as const,
		path: "/",
	};

	res.clearCookie("session_token", clearOptions);
	res.clearCookie("better-auth.session_token", clearOptions);
	res.clearCookie("better-auth.session-token", clearOptions);

	if (token) {
		try {
			await logout(token);
		} catch (err) {
			console.error("Error revoking session during logout:", err);
		}
	}

	sendSuccess(res, null, "Logged out successfully", HTTP_STATUS.OK);
}

/**
 * POST /api/authentication/link-credentials
 * Requires authentication. Updates credentials for the authenticated user only.
 * Body: { institutionName, department, academicId, name, semester, branch, section }
 */
export async function linkCredentials(req: Request, res: Response): Promise<void> {
	const user = req.user;
	if (!user) {
		throw new AppError("Unauthorized: Authentication session required", HTTP_STATUS.UNAUTHORIZED);
	}

	const { institutionName, department, academicId, name, semester, branch, section } = req.body;

	if (!institutionName || !department || !academicId) {
		throw new AppError(
			"Institution name, department, and academic ID are required.",
			HTTP_STATUS.BAD_REQUEST,
		);
	}

	await updateUserCredentials(
		user.id,
		institutionName.trim(),
		department.trim(),
		academicId.trim(),
		name ? name.trim() : undefined,
		semester ? semester.trim() : undefined,
		branch ? branch.trim() : undefined,
		section ? section.trim() : undefined,
	);

	sendSuccess(res, null, "Academic credentials linked successfully", HTTP_STATUS.OK);
}