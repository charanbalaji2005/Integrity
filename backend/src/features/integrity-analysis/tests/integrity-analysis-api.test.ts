import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

describe("Integrity Analysis API Controller", () => {
	it("should analyze valid text submission and return structured results", async () => {
		// Set env variables before dynamic import
		process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/db";
		process.env.BETTER_AUTH_SECRET = "dummy-secret-for-tests";
		process.env.BETTER_AUTH_URL = "http://localhost:3000";

		const { analyzeSubmission } = await import("../controllers/integrity-analysis-controller");

		const req = {
			body: {
				text: "This is a valid human-written text that exceeds fifty characters. It should trigger normal human scores and low indicators.",
			},
		} as unknown as Request;

		const jsonMock = vi.fn();
		const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
		const res = {
			status: statusMock,
		} as unknown as Response;

		await analyzeSubmission(req, res);

		expect(statusMock).toHaveBeenCalledWith(200);
		expect(jsonMock).toHaveBeenCalled();
		const responseBody = jsonMock.mock.calls[0][0];

		expect(responseBody.success).toBe(true);
		expect(responseBody.message).toBe("Submission analyzed successfully");
		expect(responseBody.data.scores).toBeDefined();
		expect(responseBody.data.scores.integratedAiScore).toBeDefined();
		expect(responseBody.data.evidence).toBeDefined();
		expect(responseBody.data.risk).toBeDefined();
		expect(responseBody.data.overallIntegrity).toBeDefined();
		expect(responseBody.data.recommendation).toBeDefined();
	});

	it("should throw AppError for too short submission texts", async () => {
		// Set env variables before dynamic import
		process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/db";
		process.env.BETTER_AUTH_SECRET = "dummy-secret-for-tests";
		process.env.BETTER_AUTH_URL = "http://localhost:3000";

		const { analyzeSubmission } = await import("../controllers/integrity-analysis-controller");

		const req = {
			body: {
				text: "Too short.",
			},
		} as unknown as Request;

		const res = {} as unknown as Response;

		await expect(analyzeSubmission(req, res)).rejects.toThrow(
			"Text must be at least 50 characters",
		);
	});
});
