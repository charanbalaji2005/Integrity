import { fromNodeHeaders } from "better-auth/node";
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
	getSessionTokenFromHeaders,
	loginWithEmailPassword,
	requestPasswordReset,
	revokeSession,
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
/** Frontend origins the OAuth flow may return to. */
function allowedFrontendOrigins(): Set<string> {
	return new Set(
		[env.FRONTEND_URL, "http://localhost:5173", "http://localhost:5174", "http://localhost:5175"]
			.filter(Boolean)
			.map((u) => {
				try {
					return new URL(u as string).origin;
				} catch {
					return "";
				}
			})
			.filter(Boolean),
	);
}

/** Resolve a safe frontend return URL; defaults to the student login page. */
function resolveReturnUrl(raw: unknown, fallbackReferer?: string): URL {
	const allowed = allowedFrontendOrigins();
	for (const candidate of [raw, fallbackReferer]) {
		if (typeof candidate !== "string" || !candidate) continue;
		try {
			const url = new URL(candidate);
			if (allowed.has(url.origin)) {
				// A bare origin (e.g. the landing page) returns to the login screen,
				// which then routes the signed-in user to their dashboard.
				if (url.pathname === "/" || url.pathname === "") url.pathname = "/login";
				url.hash = "";
				return url;
			}
		} catch {
			// try next
		}
	}
	return new URL("/login", env.FRONTEND_URL || "http://localhost:5173");
}

/**
 * GET /api/authentication/google?redirect=<frontend login url>&login_hint=<email>
 * Must be opened as a top-level navigation (window.location), not fetch():
 * the OAuth state cookie is then first-party on the backend and survives the
 * round-trip through Google. Google returns to Better Auth's callback, which
 * redirects to oauth-complete to hand the session token to the frontend.
 */
export async function googleOAuth(req: Request, res: Response): Promise<void> {
	const returnTo = resolveReturnUrl(req.query.redirect, req.headers.referer);
	const loginHint =
		typeof req.query.login_hint === "string" && /^[^\s@]+@[^\s@]+$/.test(req.query.login_hint)
			? req.query.login_hint.trim().toLowerCase()
			: undefined;

	const callbackURL = `${env.BETTER_AUTH_URL.replace(/\/$/, "")}/api/authentication/oauth-complete?redirect=${encodeURIComponent(returnTo.toString())}`;

	try {
		const { url, setCookies } = await getGoogleOAuthURL({
			callbackURL,
			errorCallbackURL: returnTo.toString(),
			loginHint,
		});
		if (setCookies.length > 0) res.setHeader("Set-Cookie", setCookies);
		res.setHeader("Cache-Control", "no-store");
		res.redirect(url);
	} catch (err) {
		console.error("[googleOAuth] Failed to start Google sign-in:", err);
		returnTo.searchParams.set("error", "google_unavailable");
		res.redirect(returnTo.toString());
	}
}

/**
 * GET /api/authentication/oauth-complete?redirect=<frontend url>
 * Google OAuth lands here (first-party on the backend, so the freshly set
 * session cookie IS readable). We hand the session token to the frontend in the
 * URL fragment so it works even when the frontend is on a different site and
 * the browser won't send the partitioned cookie cross-site.
 */
export async function oauthComplete(req: Request, res: Response): Promise<void> {
	const target = resolveReturnUrl(req.query.redirect);

	const token = await getSessionTokenFromHeaders(fromNodeHeaders(req.headers));
	res.setHeader("Cache-Control", "no-store");
	if (!token) {
		target.searchParams.set("error", "oauth_session_missing");
		res.redirect(target.toString());
		return;
	}
	target.hash = `auth_token=${encodeURIComponent(token)}`;
	res.redirect(target.toString());
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
			const idx = pair.indexOf("=");
			if (idx <= 0) continue;
			const key = pair.slice(0, idx).trim();
			const val = pair.slice(idx + 1).trim();
			if (key && val) {
				try {
					cookies[key] = decodeURIComponent(val);
				} catch {
					cookies[key] = val;
				}
			}
		}
	}

	const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "");
	const tokens = [
		cookies.session_token,
		cookies["better-auth.session_token"],
		cookies["better-auth.session-token"],
		cookies["__Secure-better-auth.session_token"],
		bearer,
	].filter((t): t is string => !!t);

	// 1) Revoke server-side (Better Auth signOut + DB row delete)
	const betterAuthCookies = await revokeSession(fromNodeHeaders(req.headers), tokens);

	// 2) Expire every auth cookie variant. Better Auth sets them Partitioned +
	//    Secure (with the __Secure- prefix), so a plain clearCookie can't remove them.
	const names = [
		"session_token",
		"better-auth.session_token",
		"better-auth.session-token",
		"better-auth.session_data",
		"better-auth.dont_remember",
		"__Secure-better-auth.session_token",
		"__Secure-better-auth.session_data",
		"__Secure-better-auth.dont_remember",
	];
	const expired = names.flatMap((n) => [
		`${n}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; Secure; SameSite=None; Partitioned`,
		`${n}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; Secure; SameSite=None`,
	]);
	res.setHeader("Set-Cookie", [...betterAuthCookies, ...expired]);
	res.setHeader("Cache-Control", "no-store");

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
