import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "../app";

/**
 * HTTP integration tests against the real Express app (real routers, middleware,
 * Better Auth and error handler) on an ephemeral port. They verify that protected
 * endpoints cannot be reached without a valid session — including with forged
 * identity headers — and that errors use the standard JSON envelope.
 */
/** Standard response envelope from sendSuccess/sendError and the health route. */
interface ApiBody {
	success: boolean;
	message?: string;
	[key: string]: unknown;
}

let server: Server;
let base = "";

beforeAll(async () => {
	server = app.listen(0);
	await new Promise<void>((resolve) => server.once("listening", () => resolve()));
	base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
	await new Promise<void>((resolve) => server.close(() => resolve()));
});

const req = (path: string, init: RequestInit = {}) =>
	fetch(`${base}${path}`, {
		...init,
		headers: { "Content-Type": "application/json", ...(init.headers as Record<string, string>) },
	});

const PROTECTED: Array<[method: string, path: string, body?: unknown]> = [
	["GET", "/api/coding/health"],
	["GET", "/api/coding/languages"],
	[
		"POST",
		"/api/coding/playground/run",
		{ language: "python", sourceCode: "print(1)", stdin: "", mode: "run" },
	],
	["GET", "/api/notifications"],
	["GET", "/api/chat/classmates"],
	["GET", "/api/study-materials"],
	["GET", "/api/admin/users"],
];

describe("public endpoints", () => {
	it("GET /api/health reports status without requiring a session", async () => {
		const res = await req("/api/health");
		expect(res.status).toBe(200);
		const body = (await res.json()) as ApiBody;
		expect(body.success).toBe(true);
		expect(body).toHaveProperty("status");
		expect(body).toHaveProperty("services");
	});

	it("unknown API routes return 404 in the standard error envelope", async () => {
		const res = await req("/api/definitely-not-a-route");
		expect(res.status).toBe(404);
		const body = (await res.json()) as ApiBody;
		expect(body.success).toBe(false);
		expect(typeof body.message).toBe("string");
	});
});

describe("authentication is enforced on protected endpoints", () => {
	it.each(PROTECTED)("%s %s without a session → 401", async (method, path, body) => {
		const res = await req(path, { method, body: body ? JSON.stringify(body) : undefined });
		expect(res.status).toBe(401);
		const json = (await res.json()) as ApiBody;
		expect(json.success).toBe(false);
	});

	it("ignores forged identity headers (identity comes only from the session)", async () => {
		const res = await req("/api/coding/languages", {
			headers: { "x-user-id": "admin", "x-user-role": "admin", "x-role": "admin" },
		});
		expect(res.status).toBe(401);
	});

	it("rejects an invalid bearer token", async () => {
		const res = await req("/api/coding/languages", {
			headers: { Authorization: "Bearer not-a-real-session-token" },
		});
		expect(res.status).toBe(401);
	});

	it("rejects a forged session cookie", async () => {
		const res = await req("/api/notifications", {
			headers: { Cookie: "better-auth.session_token=forged.value" },
		});
		expect(res.status).toBe(401);
	});

	it("does not leak stack traces in error responses", async () => {
		const res = await req("/api/coding/playground/run", { method: "POST", body: "{not json" });
		expect(res.status).toBeGreaterThanOrEqual(400);
		const text = await res.text();
		expect(text).not.toMatch(/at\s+\S+\s+\(.*\.ts:\d+/);
	});
});
