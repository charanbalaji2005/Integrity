import type { Request, Response } from "express";
import { HTTP_STATUS } from "@/constants/http-status";
import { prisma } from "@/database";
import { getAuthUser } from "@/middleware/auth-middleware";
import { AppError } from "@/utils/app-error";
import { sendSuccess } from "@/utils/response";
import {
	attemptsLeftMessage,
	attemptsRemaining,
	checkCode,
	issueCode,
	maskEmail,
} from "../services/two-factor-service";

const ipOf = (req: Request) =>
	(req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
	req.socket.remoteAddress ||
	null;

function parseCookies(header: string | undefined): Record<string, string> {
	const out: Record<string, string> = {};
	for (const part of (header ?? "").split(";")) {
		const i = part.indexOf("=");
		if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
	}
	return out;
}

/** Better Auth cookies are "token.signature" (URL-encoded); bearer tokens may be raw. */
function rawToken(v: string | undefined): string | null {
	if (!v) return null;
	const t = decodeURIComponent(v.replace(/^Bearer\s+/i, "")).trim();
	return t ? t.split(".")[0]! : null;
}

/**
 * Finds the caller's session row directly (Better Auth hides pending sessions
 * from get-session on purpose). Only sessions still waiting for 2FA qualify.
 */
async function pendingSession(req: Request) {
	const cookies = parseCookies(req.headers.cookie);
	const candidates = [
		rawToken(req.headers.authorization),
		rawToken(cookies["__Secure-better-auth.session_token"]),
		rawToken(cookies["better-auth.session_token"]),
	].filter((t): t is string => Boolean(t));
	for (const token of candidates) {
		const s = await prisma.session.findUnique({
			where: { token },
			include: { user: { select: { id: true, email: true, name: true, twoFactorEnabled: true } } },
		});
		if (s && s.expiresAt.getTime() > Date.now()) {
			if (!s.twoFactorPending)
				throw new AppError("This sign-in is already verified.", HTTP_STATUS.CONFLICT);
			return s;
		}
	}
	throw new AppError("Your sign-in expired. Please sign in again.", HTTP_STATUS.UNAUTHORIZED);
}

/** POST /api/authentication/2fa/send — (re)send the sign-in code. */
export async function sendLoginCodeHandler(req: Request, res: Response) {
	const s = await pendingSession(req);
	const sent = await issueCode({
		userId: s.userId,
		email: s.user.email,
		purpose: "login",
		sessionKey: s.id,
		ip: ipOf(req),
	});
	sendSuccess(res, sent, `Code sent to ${sent.maskedEmail}`);
}

/** POST /api/authentication/2fa/status — what the code screen needs after a reload or Google sign-in. */
export async function loginStatusHandler(req: Request, res: Response) {
	const s = await pendingSession(req);
	const hasCode = await prisma.twoFactorCode.findUnique({
		where: { userId_purpose_sessionKey: { userId: s.userId, purpose: "login", sessionKey: s.id } },
	});
	sendSuccess(
		res,
		{
			maskedEmail: maskEmail(s.user.email),
			codeSent: Boolean(hasCode && hasCode.expiresAt > new Date()),
		},
		"Two-step verification pending",
	);
}

/** POST /api/authentication/2fa/verify { code } — completes sign-in. */
export async function verifyLoginCodeHandler(req: Request, res: Response) {
	const s = await pendingSession(req);
	const result = await checkCode({
		userId: s.userId,
		purpose: "login",
		sessionKey: s.id,
		code: req.body?.code,
	});
	if (result === "locked_out") {
		await prisma.session.delete({ where: { id: s.id } }).catch(() => {});
		await prisma.userLog.create({
			data: {
				userId: s.userId,
				action: "login_2fa_failed_lockout",
				ipAddress: ipOf(req),
				userAgent: req.headers["user-agent"] ?? null,
			},
		});
		throw new AppError("Too many incorrect codes. Please sign in again.", HTTP_STATUS.UNAUTHORIZED);
	}
	if (result === "invalid") {
		throw new AppError(
			attemptsLeftMessage(await attemptsRemaining(s.userId, "login", s.id)),
			HTTP_STATUS.BAD_REQUEST,
		);
	}
	await prisma.session.update({ where: { id: s.id }, data: { twoFactorPending: false } });
	await prisma.userLog.create({
		data: {
			userId: s.userId,
			action: "login_2fa_verified",
			ipAddress: ipOf(req),
			userAgent: req.headers["user-agent"] ?? null,
		},
	});
	sendSuccess(res, { verified: true }, "Signed in");
}

/* ───────── turning 2FA on/off (signed-in user, confirmed by emailed code) ───────── */

/** POST /api/profile/2fa/request { enabled } — email a code to confirm the change. */
export async function requestToggleCodeHandler(req: Request, res: Response) {
	const auth = getAuthUser(req);
	const enabled = req.body?.enabled === true;
	const user = await prisma.user.findUnique({
		where: { id: auth.id },
		select: { id: true, email: true, twoFactorEnabled: true },
	});
	if (!user) throw new AppError("User not found", HTTP_STATUS.NOT_FOUND);
	if (user.twoFactorEnabled === enabled) {
		throw new AppError(
			enabled ? "Two-step verification is already on." : "Two-step verification is already off.",
			HTTP_STATUS.BAD_REQUEST,
		);
	}
	const sent = await issueCode({
		userId: user.id,
		email: user.email,
		purpose: enabled ? "enable" : "disable",
		ip: ipOf(req),
	});
	sendSuccess(res, sent, `Code sent to ${sent.maskedEmail}`);
}

/** Verifies the toggle code; throws a 400 with a helpful message otherwise. */
export async function assertToggleCode(userId: string, enabled: boolean, code: unknown) {
	if (code === undefined || code === null || String(code).trim() === "") {
		throw new AppError("Enter the verification code we emailed you.", HTTP_STATUS.BAD_REQUEST);
	}
	const purpose = enabled ? "enable" : "disable";
	const result = await checkCode({ userId, purpose, code });
	if (result === "locked_out")
		throw new AppError("Too many incorrect codes. Request a new code.", HTTP_STATUS.BAD_REQUEST);
	if (result === "invalid")
		throw new AppError(
			attemptsLeftMessage(await attemptsRemaining(userId, purpose)),
			HTTP_STATUS.BAD_REQUEST,
		);
}
