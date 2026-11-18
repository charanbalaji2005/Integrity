import { prisma } from "../../../database";
import { runBehaviorAgent } from "../agents/behavior-agent";
import { runFaceAgent } from "../agents/face-agent";
import { orchestrateProctoringPolicy } from "../agents/proctor-orchestrator";
import { buildEvidenceEvent } from "../evidence/evidence-builder";
import type { MultiDimensionalIntegrityMetrics } from "../evidence/evidence-fusion";
import { initCocoSsd } from "../perception/object-detector";
import { initFaceApi } from "../services/proctoring-service";
import type { TemporalSummary } from "../temporal/signal-buffer";
import { getAgentConfig, getPersistenceError, RULE_META } from "./agent-config";
import { AGENTS, isAgentEffectivelyDisabled } from "./agent-registry";
import { snapshot, telemetrySince, withTelemetrySuppressed } from "./agent-telemetry";

export function getAgentOverview() {
	const config = getAgentConfig();
	return {
		since: telemetrySince(),
		configVersion: config.version,
		persistenceError: getPersistenceError(),
		agents: AGENTS.map((a) => ({
			...a,
			rules: RULE_META.filter((r) => r.agent === a.id).map((r) => r.id),
			telemetry: snapshot(a.id, isAgentEffectivelyDisabled(a.id)),
		})),
	};
}

export function getRulesView() {
	const config = getAgentConfig();
	return {
		version: config.version,
		updatedAt: config.updatedAt,
		updatedBy: config.updatedBy,
		persistenceError: getPersistenceError(),
		rules: RULE_META.map((m) => ({ ...m, config: config.rules[m.id] })),
	};
}

/** Live attempts currently being proctored — real DB rows, no samples. */
export async function getLiveSessionCount() {
	return prisma.assessmentAttempt
		.count({ where: { isOnline: true, status: "in_progress" } })
		.catch(() => null);
}

/* ───────────── diagnostics ───────────── */

interface CheckResult {
	id: string;
	label: string;
	ok: boolean;
	ms: number;
	detail: string;
}

async function timed(
	id: string,
	label: string,
	fn: () => Promise<string>,
	timeoutMs = 15000,
): Promise<CheckResult> {
	const t0 = performance.now();
	try {
		const detail = await Promise.race([
			fn(),
			new Promise<string>((_, rej) =>
				setTimeout(() => rej(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs),
			),
		]);
		return { id, label, ok: true, ms: Math.round(performance.now() - t0), detail };
	} catch (err) {
		return {
			id,
			label,
			ok: false,
			ms: Math.round(performance.now() - t0),
			detail: err instanceof Error ? err.message : String(err),
		};
	}
}

const idleTemporal = (): TemporalSummary => ({
	frameCount: 10,
	windowDurationMs: 10000,
	avgYaw: 0,
	avgPitch: 0,
	avgRoll: 0,
	avgQualityScore: 90,
	sustainedLookingAwayMs: 0,
	sustainedNoFaceMs: 0,
	sustainedMultipleFacesMs: 0,
	sustainedEyesClosedMs: 0,
	sustainedTalkingMs: 0,
	recentBlinkCount: 3,
	activeObjects: new Map(),
});

const cleanMetrics = {
	compositeScore: 100,
	identityScore: 100,
	cameraQualityScore: 100,
	environmentScore: 100,
	browserScore: 100,
	behaviorScore: 100,
	activeEventCount: 0,
	correlatedIncidents: [],
} as unknown as MultiDimensionalIntegrityMetrics;

/**
 * Runs health checks plus a SIMULATION of the reasoning agents on synthetic
 * inputs. Simulation calls pure functions only: no session, attempt,
 * violation or timeline row is created, and telemetry is suppressed.
 */
export async function runDiagnostics() {
	const checks: CheckResult[] = [];

	checks.push(
		await timed("database", "Database connectivity", async () => {
			await prisma.$queryRaw`SELECT 1`;
			return "PostgreSQL reachable";
		}),
	);
	checks.push(
		await timed("config-store", "Configuration store", async () => {
			await prisma.proctoringAgentConfig.count();
			return `Active config v${getAgentConfig().version}`;
		}),
	);
	checks.push(
		await timed(
			"face-models",
			"Face models (face-api.js)",
			async () => {
				await initFaceApi();
				return "TinyFaceDetector, Landmark68 and FaceRecognition loaded";
			},
			30000,
		),
	);
	checks.push(
		await timed(
			"object-model",
			"Object model (COCO-SSD)",
			async () => {
				await initCocoSsd();
				return "COCO-SSD loaded";
			},
			30000,
		),
	);

	const simulation = await withTelemetrySuppressed(async () => {
		const scenarios: { name: string; expected: string; actual: string; pass: boolean }[] = [];
		const now = Date.now();

		// 1. Absent candidate beyond the configured pause threshold → pause.
		const pauseMs = getAgentConfig().rules.ABSENT_CANDIDATE.pauseAfterMs ?? 8000;
		const absentEvent = buildEvidenceEvent({
			attemptId: "simulation",
			type: "ABSENT_CANDIDATE",
			startTime: now - (pauseMs + 1000),
			endTime: now,
			confidence: 0.95,
			cameraQuality: 90,
			signals: { simulated: true },
		});
		const faceAbsent = runFaceAgent(
			{ detected: false, faceCount: 0, confidence: 0 } as Parameters<typeof runFaceAgent>[0],
			{
				brightness: 0.5,
				blur: 0.1,
				faceVisibility: 0,
				occlusion: 0,
				lightingState: "optimal",
				usable: true,
				qualityScore: 90,
			},
			{ ...idleTemporal(), sustainedNoFaceMs: pauseMs + 1000 },
		);
		const behaviour = runBehaviorAgent(faceAbsent, [], idleTemporal());
		const d1 = orchestrateProctoringPolicy({
			faceAnalysis: faceAbsent,
			behaviorAnalysis: behaviour,
			newEvents: [absentEvent],
			metrics: cleanMetrics,
			currentStatus: "NORMAL",
			warningCount: 0,
		});
		scenarios.push({
			name: `Face absent ${(pauseMs + 1000) / 1000}s (pause threshold ${pauseMs / 1000}s)`,
			expected: "pause",
			actual: d1.action,
			pass: d1.action === "pause",
		});

		// 2. Camera unusable must never be treated as misconduct.
		const faceCam = runFaceAgent(
			{ detected: false, faceCount: 0, confidence: 0 } as Parameters<typeof runFaceAgent>[0],
			{
				brightness: 0.02,
				blur: 0.9,
				faceVisibility: 0,
				occlusion: 1,
				lightingState: "under-exposed",
				usable: false,
				qualityScore: 5,
			},
			idleTemporal(),
		);
		scenarios.push({
			name: "Camera unusable is not reported as an absent candidate",
			expected: "CAMERA_ISSUE, no alert",
			actual: `${faceCam.status}${faceCam.requiresAlert ? ", alert" : ", no alert"}`,
			pass: faceCam.status === "CAMERA_ISSUE" && !faceCam.requiresAlert,
		});

		// 3. Clean frame → no action.
		const faceOk = runFaceAgent(
			{ detected: true, faceCount: 1, confidence: 0.95 } as Parameters<typeof runFaceAgent>[0],
			{
				brightness: 0.5,
				blur: 0.1,
				faceVisibility: 0.9,
				occlusion: 0,
				lightingState: "optimal",
				usable: true,
				qualityScore: 90,
			},
			idleTemporal(),
		);
		const d3 = orchestrateProctoringPolicy({
			faceAnalysis: faceOk,
			behaviorAnalysis: runBehaviorAgent(faceOk, [], idleTemporal()),
			newEvents: [],
			metrics: cleanMetrics,
			currentStatus: "NORMAL",
			warningCount: 0,
		});
		scenarios.push({
			name: "Attentive candidate, no events",
			expected: "none",
			actual: d3.action,
			pass: d3.action === "none",
		});

		return scenarios;
	});

	return { ranAt: new Date().toISOString(), simulated: true, checks, simulation };
}
