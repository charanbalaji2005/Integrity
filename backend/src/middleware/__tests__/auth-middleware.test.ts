import type { NextFunction, Request, Response } from "express";
import { describe, expect, it } from "vitest";
import { AppError } from "@/utils/app-error";
import { getAuthUser, requireRole } from "../auth-middleware";

/** Runs a middleware and returns whatever it passed to next(). */
function runMiddleware(
	mw: (req: Request, res: Response, next: NextFunction) => void,
	user?: { id: string; role: string },
) {
	const req = { user } as unknown as Request;
	let passed: unknown = "not-called";
	mw(req, {} as Response, (err?: unknown) => {
		passed = err;
	});
	return passed;
}

describe("requireRole", () => {
	it("calls next() with no error when the user has an allowed role", () => {
		expect(
			runMiddleware(requireRole("faculty", "admin"), { id: "u1", role: "admin" }),
		).toBeUndefined();
	});

	it("rejects an authenticated user with the wrong role with 403", () => {
		const err = runMiddleware(requireRole("faculty", "admin"), { id: "u1", role: "user" });
		expect(err).toBeInstanceOf(AppError);
		expect((err as AppError).statusCode).toBe(403);
		expect((err as AppError).message).toContain("faculty or admin");
	});

	it("rejects a request with no authenticated user with 401", () => {
		const err = runMiddleware(requireRole("user"));
		expect(err).toBeInstanceOf(AppError);
		expect((err as AppError).statusCode).toBe(401);
	});

	it("is case-sensitive, so a forged 'Admin' role is not admin", () => {
		const err = runMiddleware(requireRole("admin"), { id: "u1", role: "Admin" });
		expect((err as AppError).statusCode).toBe(403);
	});
});

describe("getAuthUser", () => {
	it("returns the user attached by requireAuth", () => {
		const user = { id: "u1", role: "user" };
		expect(getAuthUser({ user } as unknown as Request)).toBe(user);
	});

	it("throws 401 when no user is attached", () => {
		expect(() => getAuthUser({} as Request)).toThrowError(AppError);
		try {
			getAuthUser({} as Request);
		} catch (e) {
			expect((e as AppError).statusCode).toBe(401);
		}
	});
});
