import { fromNodeHeaders } from "better-auth/node";
import type { NextFunction, Request, Response } from "express";
import { HTTP_STATUS } from "@/constants/http-status";
import { prisma } from "@/database";
import { auth } from "@/providers/auth";
import { AppError } from "@/utils/app-error";

// Extend Express Request interface
declare global {
	namespace Express {
		interface Request {
			user?: any;
			session?: any;
		}
	}
}

/**
 * Authentication Middleware
 * Validates the Better Auth session from cookies or Authorization header.
 * Derives user identity strictly from the session and database, NEVER from client headers.
 */
export async function requireAuth(
	req: Request,
	_res: Response,
	next: NextFunction,
): Promise<void> {
	try {
		const sessionData = await auth.api.getSession({
			headers: fromNodeHeaders(req.headers),
		});

		if (!sessionData?.user) {
			throw new AppError("Unauthorized: Authentication session required", HTTP_STATUS.UNAUTHORIZED);
		}

		const dbUser = await prisma.user.findUnique({
			where: { id: sessionData.user.id },
		});

		if (!dbUser) {
			throw new AppError("Unauthorized: User account not found", HTTP_STATUS.UNAUTHORIZED);
		}

		if (dbUser.status === "suspended") {
			throw new AppError("Forbidden: Your account is suspended", HTTP_STATUS.FORBIDDEN);
		}

		if (
			dbUser.status === "locked" ||
			(dbUser.lockedUntil && new Date(dbUser.lockedUntil).getTime() > Date.now())
		) {
			const lockedTime = dbUser.lockedUntil ? new Date(dbUser.lockedUntil).getTime() : 0;
			const minsLeft = lockedTime > Date.now() ? Math.ceil((lockedTime - Date.now()) / 60000) : 0;
			const msg =
				minsLeft > 0
					? `Account is temporarily locked. Please try again after ${minsLeft} minutes.`
					: "Account is locked. Please contact administrator for assistance.";
			throw new AppError(msg, HTTP_STATUS.FORBIDDEN);
		}

		if (dbUser.status === "temporarily_suspended" && dbUser.suspendedUntil) {
			if (new Date(dbUser.suspendedUntil).getTime() > Date.now()) {
				throw new AppError(
					`Account is temporarily suspended until ${new Date(dbUser.suspendedUntil).toLocaleString()}`,
					HTTP_STATUS.FORBIDDEN,
				);
			}
			// Auto-unsuspend
			await prisma.user.update({
				where: { id: dbUser.id },
				data: { status: "active", suspendedUntil: null },
			});
			dbUser.status = "active";
			dbUser.suspendedUntil = null;
		}

		req.user = dbUser;
		req.session = sessionData.session;
		next();
	} catch (err: any) {
		if (err instanceof AppError) {
			return next(err);
		}
		return next(new AppError("Unauthorized: Invalid session", HTTP_STATUS.UNAUTHORIZED));
	}
}

/**
 * Role-based Authorization Middleware
 * Enforces that req.user.role matches one of the allowed roles.
 */
export function requireRole(...roles: string[]) {
	return (req: Request, _res: Response, next: NextFunction): void => {
		const user = req.user;
		if (!user) {
			return next(new AppError("Unauthorized: Authentication required", HTTP_STATUS.UNAUTHORIZED));
		}

		if (!roles.includes(user.role)) {
			return next(
				new AppError(
					`Forbidden: Insufficient privileges. Required role: ${roles.join(" or ")}`,
					HTTP_STATUS.FORBIDDEN,
				),
			);
		}

		next();
	};
}

/**
 * In-memory Rate Limiter Middleware
 * Protects endpoints against automated brute-force attacks and abuse.
 */
interface RateLimitOptions {
	windowMs: number;
	maxRequests: number;
	message?: string;
}

export function rateLimiter(options: RateLimitOptions) {
	const ipRequests = new Map<string, { count: number; resetTime: number }>();

	// Cleanup old entries every 5 minutes
	setInterval(() => {
		const now = Date.now();
		for (const [ip, record] of ipRequests.entries()) {
			if (now > record.resetTime) {
				ipRequests.delete(ip);
			}
		}
	}, 5 * 60 * 1000);

	return (req: Request, _res: Response, next: NextFunction): void => {
		const ip =
			(req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
			req.socket.remoteAddress ||
			"unknown-ip";

		const now = Date.now();
		const record = ipRequests.get(ip);

		if (!record || now > record.resetTime) {
			ipRequests.set(ip, {
				count: 1,
				resetTime: now + options.windowMs,
			});
			return next();
		}

		record.count += 1;
		if (record.count > options.maxRequests) {
			const remainingSecs = Math.ceil((record.resetTime - now) / 1000);
			return next(
				new AppError(
					options.message ||
						`Too many requests from this IP. Please try again in ${remainingSecs} seconds.`,
					HTTP_STATUS.TOO_MANY_REQUESTS,
				),
			);
		}

		next();
	};
}
