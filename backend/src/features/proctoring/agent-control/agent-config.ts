import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../../database";

/**
 * Proctoring rule configuration.
 *
 * Every rule maps 1:1 to an evidence type the live pipeline
 * (workflows/proctoring-graph.ts → eventBuilderNode) actually emits.
 * Defaults equal the values that were previously hard-coded, so an
 * un-configured install behaves exactly as before.
 *
 * Rollout policy: `detectionMs` is baked into each session's state machines
 * when the session is created, so it applies to NEW sessions only (active
 * exams keep the version they started with). `enabled`, `minConfidence` and
 * `pauseAfterMs` are read per frame and apply immediately.
 */
export type RuleId =
	| "CAMERA_DEGRADATION"
	| "SUSTAINED_HEAD_DEVIATION"
	| "ABSENT_CANDIDATE"
	| "MULTIPLE_INDIVIDUALS"
	| "SUSPECTED_SPEECH"
	| "PROLONGED_EYE_CLOSURE"
	| "PROHIBITED_OBJECT"
	| "LIVENESS_FAILURE"
	| "IDENTITY_MISMATCH"
	| "BROWSER_UNFOCUSED"
	| "DEVTOOLS_OPENED"
	| "FULLSCREEN_EXITED"
	| "CLIPBOARD_ATTEMPT"
	| "WINDOW_BLUR";

export interface RuleConfig {
	enabled: boolean;
	/** Signals below this confidence are ignored (0–1). */
	minConfidence: number;
	/** Continuous presence required before an event is confirmed (state-machine rules only). */
	detectionMs: number | null;
	/** Orchestrator auto-pause threshold (only ABSENT_CANDIDATE / MULTIPLE_INDIVIDUALS). */
	pauseAfterMs: number | null;
}

export interface AgentConfig {
	version: number;
	updatedAt: string;
	updatedBy: string | null;
	rules: Record<RuleId, RuleConfig>;
}

export interface RuleMeta {
	id: RuleId;
	name: string;
	description: string;
	agent: AgentId;
	severity: "low" | "medium" | "high";
	appliesTo: "new_sessions" | "immediate";
}

export type AgentId =
	| "camera-quality"
	| "face-perception"
	| "object-detection"
	| "browser-telemetry"
	| "face-agent"
	| "behavior-agent"
	| "evidence-agent"
	| "orchestrator";

const r = (
	detectionMs: number | null,
	pauseAfterMs: number | null = null,
	minConfidence = 0,
): RuleConfig => ({
	enabled: true,
	minConfidence,
	detectionMs,
	pauseAfterMs,
});

export const DEFAULT_RULES: Record<RuleId, RuleConfig> = {
	CAMERA_DEGRADATION: r(6000),
	SUSTAINED_HEAD_DEVIATION: r(3500),
	ABSENT_CANDIDATE: r(3500, 8000),
	MULTIPLE_INDIVIDUALS: r(2500, 5000),
	SUSPECTED_SPEECH: r(3500),
	PROLONGED_EYE_CLOSURE: r(4000),
	PROHIBITED_OBJECT: r(2500),
	LIVENESS_FAILURE: r(7000),
	IDENTITY_MISMATCH: r(9000),
	BROWSER_UNFOCUSED: r(null),
	DEVTOOLS_OPENED: r(null),
	FULLSCREEN_EXITED: r(null),
	CLIPBOARD_ATTEMPT: r(null),
	WINDOW_BLUR: r(null),
};

export const RULE_META: RuleMeta[] = [
	{
		id: "CAMERA_DEGRADATION",
		name: "Camera unusable",
		description:
			"Camera feed missing, dark, blurred or occluded — logged as a monitoring gap, never as misconduct.",
		agent: "camera-quality",
		severity: "low",
		appliesTo: "new_sessions",
	},
	{
		id: "SUSTAINED_HEAD_DEVIATION",
		name: "Sustained looking away",
		description: "Head pose turned away from the screen for longer than the detection window.",
		agent: "face-perception",
		severity: "low",
		appliesTo: "new_sessions",
	},
	{
		id: "ABSENT_CANDIDATE",
		name: "Face not visible",
		description: "No face detected on a usable frame.",
		agent: "face-perception",
		severity: "medium",
		appliesTo: "new_sessions",
	},
	{
		id: "MULTIPLE_INDIVIDUALS",
		name: "Multiple faces",
		description: "More than one face in the camera frame.",
		agent: "face-perception",
		severity: "high",
		appliesTo: "new_sessions",
	},
	{
		id: "SUSPECTED_SPEECH",
		name: "Possible speech",
		description: "Sustained mouth movement (mouth-aspect ratio).",
		agent: "face-perception",
		severity: "medium",
		appliesTo: "new_sessions",
	},
	{
		id: "PROLONGED_EYE_CLOSURE",
		name: "Prolonged eye closure",
		description: "Eyes closed (eye-aspect ratio) for longer than the window.",
		agent: "face-perception",
		severity: "low",
		appliesTo: "new_sessions",
	},
	{
		id: "PROHIBITED_OBJECT",
		name: "Prohibited object",
		description: "Phone, secondary screen, book or earphones detected by COCO-SSD.",
		agent: "object-detection",
		severity: "high",
		appliesTo: "new_sessions",
	},
	{
		id: "LIVENESS_FAILURE",
		name: "Liveness failure",
		description: "Lack of natural micro-movement suggesting a photo or replay.",
		agent: "face-perception",
		severity: "high",
		appliesTo: "new_sessions",
	},
	{
		id: "IDENTITY_MISMATCH",
		name: "Identity mismatch",
		description: "Periodic face-descriptor check no longer matches the enrolled candidate.",
		agent: "face-perception",
		severity: "high",
		appliesTo: "new_sessions",
	},
	{
		id: "BROWSER_UNFOCUSED",
		name: "Tab switch / minimise",
		description: "Candidate left the assessment tab or minimised the window.",
		agent: "browser-telemetry",
		severity: "medium",
		appliesTo: "immediate",
	},
	{
		id: "DEVTOOLS_OPENED",
		name: "DevTools opened",
		description: "Browser developer tools were opened during the exam.",
		agent: "browser-telemetry",
		severity: "medium",
		appliesTo: "immediate",
	},
	{
		id: "FULLSCREEN_EXITED",
		name: "Full-screen exit",
		description: "Candidate left the mandatory full-screen exam mode.",
		agent: "browser-telemetry",
		severity: "medium",
		appliesTo: "immediate",
	},
	{
		id: "CLIPBOARD_ATTEMPT",
		name: "Copy / paste / right-click",
		description: "Candidate tried to copy, cut, paste or open the context menu (blocked).",
		agent: "browser-telemetry",
		severity: "low",
		appliesTo: "immediate",
	},
	{
		id: "WINDOW_BLUR",
		name: "Window focus lost",
		description:
			"Exam window lost focus to another application or window without the tab being hidden.",
		agent: "browser-telemetry",
		severity: "low",
		appliesTo: "immediate",
	},
];

const RULE_IDS = Object.keys(DEFAULT_RULES) as RuleId[];

let current: AgentConfig = {
	version: 0,
	updatedAt: new Date(0).toISOString(),
	updatedBy: null,
	rules: structuredClone(DEFAULT_RULES),
};
let loaded = false;

/** Synchronous accessor used on the hot path of every frame. */
export function getAgentConfig(): AgentConfig {
	return current;
}

export function getRule(id: RuleId): RuleConfig {
	return current.rules[id] ?? DEFAULT_RULES[id];
}

/* ───────────── validation (Zod) ───────────── */

export class ConfigValidationError extends Error {
	constructor(public readonly issues: string[]) {
		super(`Invalid configuration: ${issues.join("; ")}`);
	}
}

const rulePatchSchema = z
	.object({
		enabled: z.boolean().optional(),
		minConfidence: z.number().min(0).max(0.99).optional(),
		detectionMs: z.number().int().min(500).max(60000).optional(),
		pauseAfterMs: z.number().int().min(1000).max(120000).optional(),
	})
	.strict();

export const updateConfigSchema = z
	.object({
		expectedVersion: z.number().int().min(0).optional(),
		rules: z.partialRecord(z.enum(RULE_IDS as [RuleId, ...RuleId[]]), rulePatchSchema),
	})
	.strict();

/** Applies a validated patch on top of the current rules, enforcing per-rule capabilities. */
export function applyRulePatch(
	patch: z.infer<typeof updateConfigSchema>["rules"],
): Record<RuleId, RuleConfig> {
	const issues: string[] = [];
	const out = structuredClone(current.rules);
	for (const [key, change] of Object.entries(patch)) {
		if (!change) continue;
		const id = key as RuleId;
		const base = DEFAULT_RULES[id];
		const next = { ...out[id] };
		if (change.enabled !== undefined) next.enabled = change.enabled;
		if (change.minConfidence !== undefined)
			next.minConfidence = Math.round(change.minConfidence * 100) / 100;
		if (change.detectionMs !== undefined) {
			if (base.detectionMs === null) issues.push(`${id} has no detection window`);
			else next.detectionMs = change.detectionMs;
		}
		if (change.pauseAfterMs !== undefined) {
			if (base.pauseAfterMs === null) issues.push(`${id} has no auto-pause threshold`);
			else next.pauseAfterMs = change.pauseAfterMs;
		}
		if (
			next.pauseAfterMs !== null &&
			next.detectionMs !== null &&
			next.pauseAfterMs < next.detectionMs
		) {
			issues.push(`${id}: auto-pause threshold must be ≥ detection window`);
		}
		out[id] = next;
	}
	if (issues.length) throw new ConfigValidationError(issues);
	return out;
}

/* ───────────── persistence (versioned, audited, Prisma) ───────────── */

let persistenceError: string | null = null;
export function getPersistenceError() {
	return persistenceError;
}

/** Loads the latest persisted version at startup (restart recovery). Falls back to defaults if the table is missing. */
export async function loadAgentConfig(): Promise<void> {
	try {
		const row = await prisma.proctoringAgentConfig.findFirst({ orderBy: { version: "desc" } });
		if (row) {
			current = {
				version: row.version,
				updatedAt: row.updatedAt.toISOString(),
				updatedBy: row.updatedBy,
				// Merge onto defaults so rules added in later releases still get a value.
				rules: {
					...structuredClone(DEFAULT_RULES),
					...(row.rules as Partial<Record<RuleId, RuleConfig>>),
				},
			};
		}
		persistenceError = null;
		console.log(`[AgentConfig] Loaded proctoring config v${current.version}`);
	} catch (err) {
		persistenceError =
			"Configuration tables are not available — run `pnpm prisma:deploy`. Using built-in defaults.";
		console.error("[AgentConfig]", persistenceError, err);
	}
	loaded = true;
}

export function isConfigLoaded() {
	return loaded;
}

export async function updateAgentConfig(
	input: z.infer<typeof updateConfigSchema>,
	actor: { id: string; email?: string | null },
): Promise<AgentConfig> {
	const nextRules = applyRulePatch(input.rules);
	const changes: Record<string, { from: RuleConfig; to: RuleConfig }> = {};
	for (const id of RULE_IDS) {
		if (JSON.stringify(nextRules[id]) !== JSON.stringify(current.rules[id])) {
			changes[id] = { from: current.rules[id], to: nextRules[id] };
		}
	}
	if (!Object.keys(changes).length) return current;

	const version = await prisma.$transaction(async (tx) => {
		const latest =
			(await tx.proctoringAgentConfig.findFirst({ orderBy: { version: "desc" } }))?.version ?? 0;
		if (input.expectedVersion !== undefined && input.expectedVersion !== latest) {
			throw new ConfigValidationError([
				`configuration changed since you loaded it (you had v${input.expectedVersion}, latest is v${latest}); reload and retry`,
			]);
		}
		const next = latest + 1;
		// Primary key on version makes concurrent writers fail instead of silently overwriting.
		await tx.proctoringAgentConfig.create({
			data: {
				version: next,
				rules: nextRules as unknown as Prisma.InputJsonValue,
				updatedBy: actor.id,
			},
		});
		await tx.proctoringConfigAudit.create({
			data: {
				version: next,
				actorId: actor.id,
				actorEmail: actor.email ?? null,
				action: "UPDATE_RULES",
				changes: changes as unknown as Prisma.InputJsonValue,
			},
		});
		return next;
	});

	current = { version, updatedAt: new Date().toISOString(), updatedBy: actor.id, rules: nextRules };
	persistenceError = null;
	return current;
}

export async function getConfigAudit(limit = 50) {
	return prisma.proctoringConfigAudit.findMany({
		orderBy: { id: "desc" },
		take: Math.min(Math.max(limit, 1), 200),
	});
}
