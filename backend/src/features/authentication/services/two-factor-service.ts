import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "../../../config/env";
import { HTTP_STATUS } from "../../../constants/http-status";
import { prisma } from "../../../database";
import { sendEmail } from "../../../services/mail";
import { AppError } from "../../../utils/app-error";

/**
 * Two-step verification by emailed 6-digit code.
 *
 * Sessions of accounts with 2FA on are created with `twoFactorPending = true`
 * (see providers/auth.ts), whatever the sign-in method (password, Google,
 * magic link). A pending session is treated as signed out everywhere except
 * the /api/authentication/2fa endpoints, until the correct code is entered.
 */

export type TwoFactorPurpose = "login" | "enable" | "disable";

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_MS = 45 * 1000;
export const SEND_WINDOW_MS = 15 * 60 * 1000;
export const MAX_SENDS_PER_WINDOW = 5;

export function hashCode(userId: string, purpose: string, code: string): string {
	return createHmac("sha256", env.BETTER_AUTH_SECRET)
		.update(`${userId}:${purpose}:${code}`)
		.digest("hex");
}

function sameHash(a: string, b: string) {
	const x = Buffer.from(a, "hex");
	const y = Buffer.from(b, "hex");
	return x.length === y.length && timingSafeEqual(x, y);
}

/** "charan@srmap.edu.in" → "ch••••@srmap.edu.in" */
export function maskEmail(email: string): string {
	const [local = "", domain = ""] = email.split("@");
	const shown = local.slice(0, Math.min(2, local.length));
	return `${shown}${"•".repeat(Math.max(2, local.length - shown.length))}@${domain}`;
}

const PURPOSE_TEXT: Record<TwoFactorPurpose, { subject: string; line: string }> = {
	login: { subject: "Your IntegrityOS sign-in code", line: "Use this code to finish signing in:" },
	enable: {
		subject: "Confirm turning on two-step verification",
		line: "Use this code to turn on two-step verification:",
	},
	disable: {
		subject: "Confirm turning off two-step verification",
		line: "Use this code to turn off two-step verification:",
	},
};

function emailHtml(code: string, purpose: TwoFactorPurpose, ip?: string | null) {
	return `
    <div style="font-family: sans-serif; padding: 32px; color: #1a1917; max-width: 480px; margin: 0 auto; border: 2px solid #ebdcc9; border-radius: 24px; background-color: #fafaf8; text-align: center;">
      <h2 style="margin-top: 0; font-size: 24px; font-weight: bold; letter-spacing: -1px;">IntegrityOS</h2>
      <p style="font-size: 14px; color: #6b6861; margin-bottom: 24px;">${PURPOSE_TEXT[purpose].line}</p>
      <div style="font-size: 32px; font-weight: 800; letter-spacing: 6px; background-color: #f0ece4; padding: 16px; border-radius: 12px; display: inline-block; margin-bottom: 24px; font-family: monospace;">${code}</div>
      <p style="font-size: 12px; color: #8e8a80; margin-bottom: 0;">The code expires in 10 minutes.${ip ? ` Requested from IP ${ip}.` : ""} If this wasn't you, change your password now — someone knows it.</p>
    </div>`;
}

/** Creates (or replaces) a code and emails it. Enforces a resend cooldown and a per-window cap. */
export async function issueCode(args: {
	userId: string;
	email: string;
	purpose: TwoFactorPurpose;
	sessionKey?: string;
	ip?: string | null;
}) {
	const sessionKey = args.sessionKey ?? "";
	const key = {
		userId_purpose_sessionKey: { userId: args.userId, purpose: args.purpose, sessionKey },
	};
	const existing = await prisma.twoFactorCode.findUnique({ where: key });
	const now = Date.now();
	if (existing) {
		const wait = existing.sentAt.getTime() + RESEND_COOLDOWN_MS - now;
		if (wait > 0)
			throw new AppError(
				`Please wait ${Math.ceil(wait / 1000)} s before requesting another code.`,
				HTTP_STATUS.TOO_MANY_REQUESTS,
			);
		const inWindow = now - existing.windowStart.getTime() < SEND_WINDOW_MS;
		if (inWindow && existing.sendCount >= MAX_SENDS_PER_WINDOW) {
			throw new AppError(
				"Too many codes requested. Try again in 15 minutes.",
				HTTP_STATUS.TOO_MANY_REQUESTS,
			);
		}
	}
	const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
	const codeHash = hashCode(args.userId, args.purpose, code);
	const expiresAt = new Date(now + CODE_TTL_MS);
	const resetWindow = !existing || now - existing.windowStart.getTime() >= SEND_WINDOW_MS;
	await prisma.twoFactorCode.upsert({
		where: key,
		create: { userId: args.userId, purpose: args.purpose, sessionKey, codeHash, expiresAt },
		update: {
			codeHash,
			expiresAt,
			attempts: 0,
			sentAt: new Date(now),
			...(resetWindow
				? { windowStart: new Date(now), sendCount: 1 }
				: { sendCount: { increment: 1 } }),
		},
	});
	await sendEmail({
		to: args.email,
		subject: PURPOSE_TEXT[args.purpose].subject,
		html: emailHtml(code, args.purpose, args.ip),
	});
	return {
		maskedEmail: maskEmail(args.email),
		expiresInSeconds: CODE_TTL_MS / 1000,
		resendInSeconds: RESEND_COOLDOWN_MS / 1000,
	};
}

export type VerifyResult = "ok" | "invalid" | "locked_out";

/** Checks a code. Wrong codes count attempts; the 5th wrong attempt burns the code. */
export async function checkCode(args: {
	userId: string;
	purpose: TwoFactorPurpose;
	sessionKey?: string;
	code: unknown;
}): Promise<VerifyResult> {
	const code = String(args.code ?? "").replace(/\s+/g, "");
	const key = {
		userId_purpose_sessionKey: {
			userId: args.userId,
			purpose: args.purpose,
			sessionKey: args.sessionKey ?? "",
		},
	};
	const row = await prisma.twoFactorCode.findUnique({ where: key });
	if (!row || row.expiresAt.getTime() <= Date.now()) {
		if (row) await prisma.twoFactorCode.delete({ where: { id: row.id } }).catch(() => {});
		throw new AppError("This code has expired. Request a new one.", HTTP_STATUS.BAD_REQUEST);
	}
	if (/^\d{6}$/.test(code) && sameHash(row.codeHash, hashCode(args.userId, args.purpose, code))) {
		await prisma.twoFactorCode.delete({ where: { id: row.id } });
		return "ok";
	}
	// Atomic increment so parallel guesses can't exceed the limit.
	const updated = await prisma.twoFactorCode.update({
		where: { id: row.id },
		data: { attempts: { increment: 1 } },
	});
	if (updated.attempts >= MAX_ATTEMPTS) {
		await prisma.twoFactorCode.delete({ where: { id: row.id } }).catch(() => {});
		return "locked_out";
	}
	return "invalid";
}

export function attemptsLeftMessage(remaining: number) {
	return `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} left.`;
}

export async function attemptsRemaining(
	userId: string,
	purpose: TwoFactorPurpose,
	sessionKey = "",
) {
	const row = await prisma.twoFactorCode.findUnique({
		where: { userId_purpose_sessionKey: { userId, purpose, sessionKey } },
	});
	return row ? Math.max(0, MAX_ATTEMPTS - row.attempts) : 0;
}

/** True when a Better Auth session result belongs to a sign-in that still needs its second step. */
export function isTwoFactorPending(data: { session?: unknown } | null | undefined): boolean {
	const s = data?.session as { twoFactorPending?: boolean } | undefined;
	return s?.twoFactorPending === true;
}
