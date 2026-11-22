import { env } from "../../../config/env";
import { LANGUAGE_SPECS, type CodeLanguage } from "../languages";
import { fetchLocalRuns, localLanguagesAvailable, localToolchain, submitLocalRuns } from "./local-runner";

/**
 * Thin client for a self-hosted Judge0 CE instance. Judge0 runs every program
 * inside an `isolate` sandbox (no network, cgroup CPU/memory/process limits,
 * private /tmp, box destroyed after the run). This backend only sends source
 * text and reads results; it never compiles or executes student code itself.
 */

export class ExecutorUnavailableError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ExecutorUnavailableError";
	}
}

export interface RunRequest {
	language: CodeLanguage;
	sourceCode: string;
	stdin: string;
	timeLimitMs: number;
	memoryLimitMb: number;
}

export type Verdict =
	| "accepted"
	| "compilation_error"
	| "runtime_error"
	| "time_limit"
	| "memory_limit"
	| "infra_error";

export interface RunResult {
	token: string;
	done: boolean;
	verdict: Verdict | null;
	statusId: number;
	statusText: string;
	stdout: string;
	stderr: string;
	compileOutput: string;
	exitCode: number | null;
	timeMs: number | null;
	memoryKb: number | null;
	message: string;
}

const MAX_OUTPUT = 64 * 1024;
const FIELDS = "token,status,stdout,stderr,compile_output,message,exit_code,time,memory";

const isLocal = () => env.CODE_EXECUTOR === "local";

export function executorConfigured(): boolean {
	return isLocal() || Boolean(env.JUDGE0_URL);
}

function baseUrl(): string {
	if (!env.JUDGE0_URL) throw new ExecutorUnavailableError("Code execution service is not configured (JUDGE0_URL).");
	return env.JUDGE0_URL.replace(/\/$/, "");
}

function headers(): Record<string, string> {
	const h: Record<string, string> = { "Content-Type": "application/json" };
	if (env.JUDGE0_AUTH_TOKEN) h["X-Auth-Token"] = env.JUDGE0_AUTH_TOKEN;
	return h;
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const unb64 = (s: string | null | undefined) => (s ? Buffer.from(s, "base64").toString("utf8") : "");
const clip = (s: string) => (s.length > MAX_OUTPUT ? `${s.slice(0, MAX_OUTPUT)}\n…[output truncated]` : s);

async function call<T>(path: string, init: RequestInit = {}, timeoutMs = 15000): Promise<T> {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), timeoutMs);
	let res: Response;
	try {
		res = await fetch(`${baseUrl()}${path}`, { ...init, headers: { ...headers(), ...(init.headers as Record<string, string>) }, signal: ctrl.signal });
	} catch (err) {
		throw new ExecutorUnavailableError(`Code execution service unreachable: ${(err as Error).message}`);
	} finally {
		clearTimeout(timer);
	}
	if (res.status === 401 || res.status === 403) throw new ExecutorUnavailableError("Code execution service rejected the auth token.");
	if (res.status >= 500 || res.status === 503) throw new ExecutorUnavailableError(`Code execution service error (HTTP ${res.status}).`);
	const body = (await res.json().catch(() => ({}))) as T;
	if (!res.ok) throw new ExecutorUnavailableError(`Code execution service refused the request (HTTP ${res.status}): ${JSON.stringify(body).slice(0, 200)}`);
	return body;
}

function toSubmission(r: RunRequest) {
	const spec = LANGUAGE_SPECS[r.language];
	const memoryMb = Math.max(spec.minMemoryMb, r.memoryLimitMb);
	const cpu = Math.min(10, Math.max(0.5, r.timeLimitMs / 1000));
	return {
		language_id: spec.judge0Id,
		source_code: b64(r.sourceCode),
		stdin: b64(r.stdin),
		...(spec.compilerOptions ? { compiler_options: spec.compilerOptions } : {}),
		cpu_time_limit: cpu,
		wall_time_limit: Math.min(20, cpu * 2 + 1),
		memory_limit: Math.min(512, memoryMb) * 1024,
		// Fork-bomb protection; the JVM needs a few dozen threads.
		max_processes_and_or_threads: r.language === "java" ? 64 : 16,
		max_file_size: 1024,
		enable_network: false,
		redirect_stderr_to_stdout: false,
	};
}

/** Submits programs (batch) and returns their tokens in order. */
export async function submitRuns(runs: RunRequest[]): Promise<string[]> {
	if (!runs.length) return [];
	if (isLocal()) return submitLocalRuns(runs);
	if (runs.length === 1) {
		const r = await call<{ token?: string }>("/submissions?base64_encoded=true&wait=false", {
			method: "POST",
			body: JSON.stringify(toSubmission(runs[0]!)),
		});
		if (!r.token) throw new ExecutorUnavailableError("Code execution service did not return a token.");
		return [r.token];
	}
	const r = await call<Array<{ token?: string; error?: unknown }>>("/submissions/batch?base64_encoded=true", {
		method: "POST",
		body: JSON.stringify({ submissions: runs.map(toSubmission) }),
	});
	const tokens = r.map((x) => x.token);
	if (tokens.some((t) => !t)) throw new ExecutorUnavailableError("Code execution service rejected part of the batch.");
	return tokens as string[];
}

interface RawResult {
	token: string;
	status?: { id: number; description: string };
	stdout?: string | null;
	stderr?: string | null;
	compile_output?: string | null;
	message?: string | null;
	exit_code?: number | null;
	time?: string | null;
	memory?: number | null;
}

/** Maps Judge0 status IDs to our verdicts. Python syntax errors count as compile errors. */
export function classify(statusId: number, stderr: string, memoryKb: number | null, memoryLimitKb: number, language: CodeLanguage): Verdict | null {
	if (statusId === 1 || statusId === 2) return null;
	if (statusId === 3 || statusId === 4) return "accepted";
	if (statusId === 5) return "time_limit";
	if (statusId === 6) return "compilation_error";
	if (statusId === 13 || statusId === 14) return "infra_error";
	if (statusId >= 7 && statusId <= 12) {
		if (language === "python" && /\b(SyntaxError|IndentationError|TabError)\b/.test(stderr)) return "compilation_error";
		if (memoryKb != null && memoryKb >= memoryLimitKb * 0.95) return "memory_limit";
		if (/OutOfMemoryError|MemoryError|std::bad_alloc/.test(stderr)) return "memory_limit";
		return "runtime_error";
	}
	return "infra_error";
}

export function normalizeResult(raw: RawResult, language: CodeLanguage, memoryLimitMb: number): RunResult {
	const statusId = raw.status?.id ?? 13;
	const stderr = clip(unb64(raw.stderr));
	const memoryKb = raw.memory ?? null;
	const memLimitKb = Math.min(512, Math.max(LANGUAGE_SPECS[language].minMemoryMb, memoryLimitMb)) * 1024;
	const verdict = classify(statusId, stderr, memoryKb, memLimitKb, language);
	return {
		token: raw.token,
		done: verdict !== null,
		verdict,
		statusId,
		statusText: raw.status?.description ?? "Unknown",
		stdout: clip(unb64(raw.stdout)),
		stderr,
		compileOutput: clip(unb64(raw.compile_output)),
		exitCode: raw.exit_code ?? null,
		timeMs: raw.time != null ? Math.round(Number.parseFloat(raw.time) * 1000) : null,
		memoryKb,
		message: unb64(raw.message),
	};
}

export async function fetchRuns(tokens: string[]): Promise<RawResult[]> {
	if (!tokens.length) return [];
	if (isLocal()) return fetchLocalRuns(tokens);
	const r = await call<{ submissions?: RawResult[] }>(
		`/submissions/batch?tokens=${tokens.map(encodeURIComponent).join(",")}&base64_encoded=true&fields=${FIELDS}`,
	);
	return r.submissions ?? [];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Submits and waits for completion (used by the evaluation worker, not request handlers). */
export async function runAndWait(runs: RunRequest[], maxWaitMs = 90000): Promise<RunResult[]> {
	const tokens = await submitRuns(runs);
	const deadline = Date.now() + maxWaitMs;
	let delay = 400;
	while (Date.now() < deadline) {
		await sleep(delay);
		delay = Math.min(2000, Math.round(delay * 1.4));
		const raw = await fetchRuns(tokens);
		const byToken = new Map(raw.map((x) => [x.token, x]));
		const results = tokens.map((t, i) => normalizeResult(byToken.get(t) ?? { token: t, status: { id: 1, description: "In Queue" } }, runs[i]!.language, runs[i]!.memoryLimitMb));
		if (results.every((r) => r.done)) return results;
	}
	throw new ExecutorUnavailableError("Code execution timed out waiting for the sandbox queue.");
}

export interface ExecutorHealth {
	configured: boolean;
	reachable: boolean;
	version: string | null;
	languages: Record<CodeLanguage, boolean>;
	error: string | null;
}

let healthCache: { at: number; value: ExecutorHealth } | null = null;

/** Checks that Judge0 is reachable and offers our four language IDs (cached 30s). */
export async function executorHealth(force = false): Promise<ExecutorHealth> {
	if (!force && healthCache && Date.now() - healthCache.at < 30000) return healthCache.value;
	const none = { c: false, cpp: false, java: false, python: false };
	let value: ExecutorHealth;
	if (isLocal()) {
		const languages = localLanguagesAvailable();
		const missing = (Object.keys(languages) as CodeLanguage[]).filter((k) => !languages[k]);
		const t = localToolchain();
		value = {
			configured: true,
			reachable: missing.length < 4,
			version: `local (${[t.versions.cpp, t.versions.java, t.versions.python].filter(Boolean).join(", ")})`,
			languages,
			error: missing.length ? `Not installed on this machine: ${missing.join(", ")}` : null,
		};
	} else if (!executorConfigured()) {
		value = { configured: false, reachable: false, version: null, languages: none, error: "JUDGE0_URL is not set." };
	} else {
		try {
			const [about, langs] = await Promise.all([
				call<{ version?: string }>("/about", {}, 5000),
				call<Array<{ id: number }>>("/languages", {}, 5000),
			]);
			const ids = new Set(langs.map((l) => l.id));
			value = {
				configured: true,
				reachable: true,
				version: about.version ?? null,
				languages: {
					c: ids.has(LANGUAGE_SPECS.c.judge0Id),
					cpp: ids.has(LANGUAGE_SPECS.cpp.judge0Id),
					java: ids.has(LANGUAGE_SPECS.java.judge0Id),
					python: ids.has(LANGUAGE_SPECS.python.judge0Id),
				},
				error: null,
			};
		} catch (err) {
			value = { configured: true, reachable: false, version: null, languages: none, error: (err as Error).message };
		}
	}
	healthCache = { at: Date.now(), value };
	return value;
}
