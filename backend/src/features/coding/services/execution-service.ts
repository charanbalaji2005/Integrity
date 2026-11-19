import type { CodeExecution } from "@prisma/client";
import { HTTP_STATUS } from "@/constants/http-status";
import { prisma } from "@/database";
import { getIO } from "@/providers/socket";
import { AppError } from "@/utils/app-error";
import type { CodeLanguage } from "../languages";
import { outputsMatch, type OutputMatch } from "./grading";
import { ExecutorUnavailableError, fetchRuns, normalizeResult, type RunRequest, submitRuns } from "./judge0-client";
import type { TestCase } from "./question-config";

export type ExecMode = "compile" | "run" | "sample";

export interface SampleResult {
	index: number;
	input: string;
	expectedOutput: string;
	actualOutput: string;
	stderr: string;
	passed: boolean;
	verdict: string;
	timeMs: number | null;
	memoryKb: number | null;
}

interface CreateInput {
	userId: string;
	attemptId: string | null;
	questionId: string | null;
	language: CodeLanguage;
	sourceCode: string;
	stdin: string;
	mode: ExecMode;
	timeLimitMs: number;
	memoryLimitMb: number;
	/** Public tests for mode "sample". */
	samples?: TestCase[];
	outputMatch?: OutputMatch;
}

const MAX_PER_MINUTE = 20;
const STALE_MS = 2 * 60 * 1000;
const MAX_SAMPLES = 10;

/** Context kept in memory for sample comparisons (limits + expected outputs). */
const sampleCtx = new Map<string, { samples: TestCase[]; outputMatch: OutputMatch; memoryLimitMb: number }>();

export function executionDto(e: CodeExecution) {
	return {
		id: e.id,
		mode: e.mode,
		language: e.language,
		status: e.status,
		verdict: e.verdict,
		stdin: e.stdin,
		stdout: e.stdout,
		stderr: e.stderr,
		compileOutput: e.compileOutput,
		exitCode: e.exitCode,
		timeMs: e.timeMs,
		memoryKb: e.memoryKb,
		sampleResults: e.sampleResults ? (JSON.parse(e.sampleResults) as SampleResult[]) : null,
		infraError: e.infraError,
		createdAt: e.createdAt,
		completedAt: e.completedAt,
	};
}

function emit(e: CodeExecution) {
	getIO()?.to(`user-${e.userId}`).emit("code:execution", executionDto(e));
}

export async function createExecution(input: CreateInput) {
	const samples = input.mode === "sample" ? (input.samples ?? []).slice(0, MAX_SAMPLES) : [];
	if (input.mode === "sample" && samples.length === 0) throw new AppError("This question has no public test cases to run.", HTTP_STATUS.BAD_REQUEST);

	// One run at a time per user, and a per-minute cap, protect the shared sandbox.
	// The advisory lock makes check-then-insert atomic across parallel requests.
	const exec = await prisma.$transaction(async (tx) => {
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`code-run:${input.userId}`}))`;
		const [inFlight, recent] = await Promise.all([
			tx.codeExecution.count({ where: { userId: input.userId, status: { in: ["queued", "running"] }, createdAt: { gt: new Date(Date.now() - STALE_MS) } } }),
			tx.codeExecution.count({ where: { userId: input.userId, createdAt: { gt: new Date(Date.now() - 60000) } } }),
		]);
		if (inFlight > 0) throw new AppError("Your previous run is still in progress. Wait for it to finish.", HTTP_STATUS.TOO_MANY_REQUESTS);
		if (recent >= MAX_PER_MINUTE) throw new AppError("Too many runs in the last minute. Please wait a moment.", HTTP_STATUS.TOO_MANY_REQUESTS);
		return tx.codeExecution.create({
			data: {
				userId: input.userId,
				attemptId: input.attemptId,
				questionId: input.questionId,
				language: input.language,
				mode: input.mode,
				sourceCode: input.sourceCode,
				stdin: input.mode === "run" ? input.stdin : null,
				status: "queued",
			},
		});
	});

	const base = { language: input.language, sourceCode: input.sourceCode, timeLimitMs: input.timeLimitMs, memoryLimitMb: input.memoryLimitMb };
	const runs: RunRequest[] =
		input.mode === "sample" ? samples.map((t) => ({ ...base, stdin: t.input })) : [{ ...base, stdin: input.mode === "run" ? input.stdin : "" }];

	try {
		const tokens = await submitRuns(runs);
		if (input.mode === "sample") sampleCtx.set(exec.id, { samples, outputMatch: input.outputMatch ?? "trim", memoryLimitMb: input.memoryLimitMb });
		const updated = await prisma.codeExecution.update({ where: { id: exec.id }, data: { status: "running", judgeTokens: JSON.stringify(tokens) } });
		return executionDto(updated);
	} catch (err) {
		const msg = err instanceof ExecutorUnavailableError ? err.message : "Could not reach the code execution service.";
		const failed = await prisma.codeExecution.update({
			where: { id: exec.id },
			data: { status: "failed", verdict: "infra_error", infraError: msg, completedAt: new Date() },
		});
		return executionDto(failed);
	}
}

export async function getExecutionForUser(id: string, userId: string) {
	const e = await prisma.codeExecution.findUnique({ where: { id } });
	if (!e || e.userId !== userId) throw new AppError("Execution not found", HTTP_STATUS.NOT_FOUND);
	return executionDto(e);
}

/** Polls Judge0 for in-flight executions and stores results. */
async function pollOnce() {
	const pending = await prisma.codeExecution.findMany({ where: { status: "running" }, take: 40, orderBy: { createdAt: "asc" } });
	if (!pending.length) return;

	for (const e of pending) {
		if (Date.now() - e.createdAt.getTime() > STALE_MS) {
			const failed = await prisma.codeExecution.update({
				where: { id: e.id },
				data: { status: "failed", verdict: "infra_error", infraError: "The sandbox did not return a result in time.", completedAt: new Date() },
			});
			sampleCtx.delete(e.id);
			emit(failed);
		}
	}

	const live = pending.filter((e) => Date.now() - e.createdAt.getTime() <= STALE_MS && e.judgeTokens);
	const allTokens = live.flatMap((e) => JSON.parse(e.judgeTokens!) as string[]);
	if (!allTokens.length) return;

	let raw: Awaited<ReturnType<typeof fetchRuns>>;
	try {
		raw = await fetchRuns(allTokens);
	} catch {
		return; // executor briefly unreachable; STALE_MS handling will fail them eventually
	}
	const byToken = new Map(raw.map((r) => [r.token, r]));

	for (const e of live) {
		const tokens = JSON.parse(e.judgeTokens!) as string[];
		const lang = e.language as CodeLanguage;
		const ctx = sampleCtx.get(e.id);
		const memLimit = ctx?.memoryLimitMb ?? 256;
		const results = tokens.map((t) => normalizeResult(byToken.get(t) ?? { token: t, status: { id: 1, description: "In Queue" } }, lang, memLimit));
		if (!results.every((r) => r.done)) continue;

		let data: Parameters<typeof prisma.codeExecution.update>[0]["data"];
		if (e.mode === "sample") {
			const samples = ctx?.samples ?? [];
			const sampleResults: SampleResult[] = results.map((r, i) => {
				const expected = samples[i]?.output ?? "";
				const passed = r.verdict === "accepted" && outputsMatch(r.stdout, expected, ctx?.outputMatch ?? "trim");
				return {
					index: i,
					input: samples[i]?.input ?? "",
					expectedOutput: expected,
					actualOutput: r.stdout,
					stderr: r.stderr,
					passed,
					verdict: r.verdict === "accepted" ? (passed ? "accepted" : "wrong_answer") : (r.verdict as string),
					timeMs: r.timeMs,
					memoryKb: r.memoryKb,
				};
			});
			const compileErr = results.find((r) => r.verdict === "compilation_error");
			const infra = results.find((r) => r.verdict === "infra_error");
			data = {
				status: infra ? "failed" : "completed",
				verdict: infra ? "infra_error" : compileErr ? "compilation_error" : sampleResults.every((s) => s.passed) ? "accepted" : "wrong_answer",
				compileOutput: compileErr ? compileErr.compileOutput || compileErr.stderr : null,
				sampleResults: JSON.stringify(sampleResults),
				timeMs: Math.max(0, ...results.map((r) => r.timeMs ?? 0)),
				memoryKb: Math.max(0, ...results.map((r) => r.memoryKb ?? 0)),
				infraError: infra ? infra.message || infra.statusText : null,
				completedAt: new Date(),
			};
		} else {
			const r = results[0]!;
			data = {
				status: r.verdict === "infra_error" ? "failed" : "completed",
				verdict: r.verdict,
				// "Compile" only reports whether the program built; output is not shown.
				stdout: e.mode === "run" ? r.stdout : null,
				stderr: e.mode === "run" || r.verdict === "compilation_error" ? r.stderr : null,
				compileOutput: r.compileOutput || null,
				exitCode: r.exitCode,
				timeMs: r.timeMs,
				memoryKb: r.memoryKb,
				infraError: r.verdict === "infra_error" ? r.message || r.statusText : null,
				completedAt: new Date(),
			};
		}
		const updated = await prisma.codeExecution.update({ where: { id: e.id }, data });
		sampleCtx.delete(e.id);
		emit(updated);
	}
}

let timer: ReturnType<typeof setInterval> | null = null;
let busy = false;
export function startExecutionPoller(intervalMs = 800) {
	if (timer) return;
	// Runs that were in flight before a restart lose their sample context; finish them as failed.
	void prisma.codeExecution
		.updateMany({ where: { status: { in: ["queued", "running"] } }, data: { status: "failed", verdict: "infra_error", infraError: "Server restarted during the run. Please run again.", completedAt: new Date() } })
		.catch(() => {});
	timer = setInterval(async () => {
		if (busy) return;
		busy = true;
		try {
			await pollOnce();
		} catch (err) {
			console.error("[Coding] execution poller error:", err);
		} finally {
			busy = false;
		}
	}, intervalMs);
}

export function isExecutionPollerRunning() {
	return timer !== null;
}
