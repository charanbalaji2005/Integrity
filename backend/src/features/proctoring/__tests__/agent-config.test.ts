import { describe, expect, it, vi } from "vitest";

const rows: { version: number }[] = [];
vi.mock("../../../database", () => {
	const tx = {
		proctoringAgentConfig: {
			findFirst: async () => rows.at(-1) ?? null,
			create: async ({ data }: { data: { version: number } }) => rows.push(data),
		},
		proctoringConfigAudit: { create: async () => ({}) },
	};
	return { prisma: { ...tx, $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) } };
});

import { getRule, updateAgentConfig, updateConfigSchema } from "../agent-control/agent-config";
import { orchestrateProctoringPolicy } from "../agents/proctor-orchestrator";
import { buildEvidenceEvent } from "../evidence/evidence-builder";

const absentFor = (ms: number) =>
	orchestrateProctoringPolicy({
		faceAnalysis: { status: "ABSENT" } as never,
		behaviorAnalysis: { pattern: "focused" } as never,
		newEvents: [
			buildEvidenceEvent({
				attemptId: "t",
				type: "ABSENT_CANDIDATE",
				startTime: 0,
				endTime: ms,
				confidence: 0.95,
				cameraQuality: 90,
				signals: {},
			}),
		],
		metrics: { compositeScore: 100, correlatedIncidents: [] } as never,
		currentStatus: "NORMAL",
		warningCount: 0,
	}).action;

describe("proctoring agent configuration", () => {
	it("a saved pause threshold changes the orchestrator's decision", async () => {
		expect(absentFor(9000)).toBe("pause"); // default threshold 8s
		await updateAgentConfig(
			updateConfigSchema.parse({ rules: { ABSENT_CANDIDATE: { pauseAfterMs: 15000 } } }),
			{ id: "admin" },
		);
		expect(getRule("ABSENT_CANDIDATE").pauseAfterMs).toBe(15000);
		expect(absentFor(9000)).toBe("warning");
		expect(rows.at(-1)?.version).toBe(1);
	});

	it("rejects invalid and unsupported settings", async () => {
		expect(
			updateConfigSchema.safeParse({ rules: { NOT_A_RULE: { enabled: false } } }).success,
		).toBe(false);
		await expect(
			updateAgentConfig(
				updateConfigSchema.parse({ rules: { BROWSER_UNFOCUSED: { detectionMs: 3000 } } }),
				{ id: "admin" },
			),
		).rejects.toThrow(/no detection window/);
		await expect(
			updateAgentConfig(
				updateConfigSchema.parse({
					expectedVersion: 0,
					rules: { SUSPECTED_SPEECH: { enabled: false } },
				}),
				{ id: "admin" },
			),
		).rejects.toThrow(/changed since you loaded it/);
	});
});
