import type { AgentId } from "./agent-config";

/**
 * In-process execution telemetry for the proctoring agents.
 * Every number here comes from a real invocation inside the frame pipeline;
 * nothing is synthesised. Counters reset on process restart (reported as
 * `since` so the UI can say so).
 */
export type AgentStatus = "ACTIVE" | "IDLE" | "PROCESSING" | "DEGRADED" | "ERROR" | "DISABLED";

interface Counter {
	executions: number;
	successes: number;
	failures: number;
	totalMs: number;
	inFlight: number;
	lastRunAt: number | null;
	lastSuccessAt: number | null;
	lastErrorAt: number | null;
	lastError: string | null;
	detections: number;
	recentFailures: number[]; // timestamps, last 10 min
}

const startedAt = Date.now();
const counters = new Map<AgentId, Counter>();

function counter(id: AgentId): Counter {
	let c = counters.get(id);
	if (!c) {
		c = {
			executions: 0,
			successes: 0,
			failures: 0,
			totalMs: 0,
			inFlight: 0,
			lastRunAt: null,
			lastSuccessAt: null,
			lastErrorAt: null,
			lastError: null,
			detections: 0,
			recentFailures: [],
		};
		counters.set(id, c);
	}
	return c;
}

/** Simulation runs (diagnostics) must never pollute production metrics. */
let suppressed = 0;
export async function withTelemetrySuppressed<T>(fn: () => Promise<T>): Promise<T> {
	suppressed++;
	try {
		return await fn();
	} finally {
		suppressed--;
	}
}

/**
 * Times an agent invocation. A thrown error is recorded AND re-thrown —
 * failures are never converted into a "clean" result here.
 * `isFailure` lets callers flag soft failures (e.g. detector returned ok:false).
 */
export async function track<T>(
	id: AgentId,
	fn: () => T | Promise<T>,
	opts: { isFailure?: (r: T) => string | null; detections?: (r: T) => number } = {},
): Promise<T> {
	if (suppressed > 0) return fn();
	const c = counter(id);
	const t0 = performance.now();
	c.inFlight++;
	c.executions++;
	c.lastRunAt = Date.now();
	try {
		const result = await fn();
		const soft = opts.isFailure?.(result) ?? null;
		if (soft) recordFailure(c, soft);
		else {
			c.successes++;
			c.lastSuccessAt = Date.now();
		}
		c.detections += opts.detections?.(result) ?? 0;
		return result;
	} catch (err) {
		recordFailure(c, err instanceof Error ? err.message : String(err));
		throw err;
	} finally {
		c.inFlight--;
		c.totalMs += performance.now() - t0;
	}
}

function recordFailure(c: Counter, message: string) {
	const now = Date.now();
	c.failures++;
	c.lastErrorAt = now;
	c.lastError = message.slice(0, 300);
	c.recentFailures.push(now);
	c.recentFailures = c.recentFailures.filter((t) => now - t < 10 * 60_000);
}

export function recordDetections(id: AgentId, n: number) {
	if (suppressed > 0 || n <= 0) return;
	counter(id).detections += n;
}

export interface AgentSnapshot {
	status: AgentStatus;
	executions: number;
	successes: number;
	failures: number;
	avgMs: number | null;
	detections: number;
	availability: number | null;
	lastRunAt: string | null;
	lastSuccessAt: string | null;
	lastErrorAt: string | null;
	lastError: string | null;
	failuresLast10m: number;
}

const iso = (t: number | null) => (t ? new Date(t).toISOString() : null);

export function snapshot(id: AgentId, disabled = false): AgentSnapshot {
	const c = counter(id);
	const now = Date.now();
	const recent = c.recentFailures.filter((t) => now - t < 10 * 60_000).length;
	let status: AgentStatus;
	if (disabled) status = "DISABLED";
	else if (c.inFlight > 0) status = "PROCESSING";
	else if (
		c.lastErrorAt &&
		(!c.lastSuccessAt || c.lastErrorAt > c.lastSuccessAt) &&
		now - c.lastErrorAt < 60_000
	)
		status = "ERROR";
	else if (recent > 0) status = "DEGRADED";
	else if (c.lastRunAt && now - c.lastRunAt < 30_000) status = "ACTIVE";
	else status = "IDLE";

	return {
		status,
		executions: c.executions,
		successes: c.successes,
		failures: c.failures,
		avgMs: c.executions ? Math.round((c.totalMs / c.executions) * 10) / 10 : null,
		detections: c.detections,
		availability: c.executions ? Math.round((c.successes / c.executions) * 1000) / 10 : null,
		lastRunAt: iso(c.lastRunAt),
		lastSuccessAt: iso(c.lastSuccessAt),
		lastErrorAt: iso(c.lastErrorAt),
		lastError: c.lastError,
		failuresLast10m: recent,
	};
}

export function telemetrySince() {
	return new Date(startedAt).toISOString();
}
