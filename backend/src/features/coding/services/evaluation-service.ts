import type { CodeEvaluationJob } from "@prisma/client";
import { prisma } from "@/database";
import { getIO } from "@/providers/socket";
import { callLLM, parseJsonLoose } from "@/features/support/services/llm";
import { type CodeLanguage, isCodeLanguage, LANGUAGE_SPECS } from "../languages";
import { type AiAnalysis, type FlagReason, grade, outputsMatch } from "./grading";
import { ExecutorUnavailableError, type RunResult, runAndWait } from "./judge0-client";
import { type CodingConfig, parseCodingConfig } from "./question-config";

/** Backoff for sandbox outages (minutes). After the last one the submission is flagged. */
const INFRA_RETRY_MINUTES = [1, 2, 5, 10, 20];
/** Backoff while Vigil AI is unavailable. After the last one: tests-only marks + flag. */
const AI_RETRY_MINUTES = [2, 5, 10];

const clip = (s: string | null | undefined, n: number) => (s ? (s.length > n ? `${s.slice(0, n)}…` : s) : "");

export interface TestOutcome {
	index: number;
	hidden: boolean;
	input: string;
	expected: string;
	result: RunResult;
	passed: boolean;
	verdict: string;
}

async function runTests(language: CodeLanguage, sourceCode: string, config: CodingConfig) {
	const tests = config.testCases;
	const base = { language, sourceCode, timeLimitMs: config.timeLimitMs, memoryLimitMb: config.memoryLimitMb };
	// No tests: still build/run once so compile status is known.
	const runs = tests.length ? tests.map((t) => ({ ...base, stdin: t.input })) : [{ ...base, stdin: "" }];
	const results = await runAndWait(runs);
	const infra = results.find((r) => r.verdict === "infra_error");
	if (infra) throw new ExecutorUnavailableError(`Sandbox internal error: ${infra.message || infra.statusText}`);
	const compileError = results.find((r) => r.verdict === "compilation_error");
	const outcomes: TestOutcome[] = tests.map((t, i) => {
		const r = results[i]!;
		const passed = r.verdict === "accepted" && outputsMatch(r.stdout, t.output, config.outputMatch);
		return { index: i, hidden: t.hidden, input: t.input, expected: t.output, result: r, passed, verdict: r.verdict === "accepted" ? (passed ? "accepted" : "wrong_answer") : (r.verdict as string) };
	});
	return {
		compileStatus: compileError ? ("compilation_error" as const) : ("ok" as const),
		compileOutput: compileError ? compileError.compileOutput || compileError.stderr : null,
		outcomes,
	};
}

/** Asks Vigil AI to score the non-test rubric criteria. Returns null if no model is reachable. */
async function analyseWithAi(args: {
	questionText: string;
	language: CodeLanguage;
	sourceCode: string;
	config: CodingConfig;
	compileStatus: "ok" | "compilation_error";
	compileOutput: string | null;
	outcomes: TestOutcome[];
}): Promise<{ analysis: AiAnalysis; raw: string } | null> {
	const criteria = args.config.rubric.map((r) => ({ criterion: r.criterion, max: r.marks, description: r.description ?? "" }));
	const testLines = args.outcomes.length
		? args.outcomes
				.map((o) =>
					o.passed
						? `#${o.index + 1}${o.hidden ? " (hidden)" : ""}: PASSED`
						: `#${o.index + 1}${o.hidden ? " (hidden)" : ""}: ${o.verdict.toUpperCase()} | input=${JSON.stringify(clip(o.input, 200))} expected=${JSON.stringify(clip(o.expected, 200))} got=${JSON.stringify(clip(o.result.stdout, 200))}${o.result.stderr ? ` stderr=${JSON.stringify(clip(o.result.stderr, 200))}` : ""}`,
				)
				.join("\n")
		: "(the question has no test cases)";

	const system = [
		"You are Vigil, assisting faculty by grading a student's program in a university exam.",
		"The program was already compiled and run in a sandbox against the faculty's test cases. Those results are FACTS: never contradict, re-imagine or invent test results.",
		"Correctness marks come from those tests and are NOT your job. Score ONLY the rubric criteria listed, each from 0 to its max, judging the code itself.",
		"Also report: logicCorrect (is the algorithm correct in principle, true/false), suspectedHardcoding (does it print expected outputs instead of computing them), ambiguity (a short note ONLY if the question/rubric is genuinely too unclear to grade fairly, else null).",
		"feedback: 2-4 sentences addressed to the student, specific and constructive. confidence: 0-1, how sure you are of your rubric scores.",
		'Return ONLY JSON: {"criteria":[{"criterion":string,"awarded":number,"max":number,"reason":string}],"logicCorrect":boolean,"suspectedHardcoding":boolean,"ambiguity":string|null,"feedback":string,"confidence":number}',
	].join("\n");
	const user = [
		`Question:\n${clip(args.questionText, 4000)}`,
		`Language: ${LANGUAGE_SPECS[args.language].label}`,
		`Rubric criteria (score each 0..max):\n${criteria.map((c) => `- ${c.criterion} (max ${c.max})${c.description ? `: ${c.description}` : ""}`).join("\n")}`,
		`Compilation: ${args.compileStatus === "ok" ? "succeeded" : `FAILED\n${clip(args.compileOutput, 1500)}`}`,
		`Test results:\n${testLines}`,
		`Student code:\n\`\`\`\n${clip(args.sourceCode, 20000)}\n\`\`\``,
	].join("\n\n");

	const raw = await callLLM([{ role: "system", content: system }, { role: "user", content: user }], { json: true, timeoutMs: 60000 });
	const parsed = parseJsonLoose<Partial<AiAnalysis> & { criteria?: Array<Partial<AiAnalysis["criteria"][number]>> }>(raw);
	if (!raw || !parsed || !Array.isArray(parsed.criteria)) return null;
	const analysis: AiAnalysis = {
		criteria: parsed.criteria
			.filter((c) => typeof c.criterion === "string")
			.map((c) => ({ criterion: String(c.criterion), awarded: Number(c.awarded) || 0, max: Number(c.max) || 0, reason: c.reason ? String(c.reason).slice(0, 400) : undefined })),
		logicCorrect: typeof parsed.logicCorrect === "boolean" ? parsed.logicCorrect : null,
		suspectedHardcoding: parsed.suspectedHardcoding === true,
		ambiguity: typeof parsed.ambiguity === "string" && parsed.ambiguity.trim() ? parsed.ambiguity : null,
		feedback: typeof parsed.feedback === "string" ? parsed.feedback.slice(0, 2000) : "",
		confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0)),
	};
	return { analysis, raw };
}

/** Sum of awarded marks across the attempt (faculty marks win over AI marks). */
export async function recomputeAttemptScore(attemptId: string) {
	const attempt = await prisma.assessmentAttempt.findUnique({ where: { id: attemptId }, select: { status: true, answers: { select: { aiGrade: true, manualGrade: true } } } });
	if (!attempt || attempt.status === "started") return;
	const total = attempt.answers.reduce((s, a) => s + (a.manualGrade ?? a.aiGrade ?? 0), 0);
	await prisma.assessmentAttempt.update({ where: { id: attemptId }, data: { score: Math.max(0, Math.round(total * 100) / 100) } });
}

type FlagInput = { code: FlagReason["code"] | "infrastructure_error"; detail: string };

async function notifyFaculty(submissionId: string, reasons: FlagInput[]) {
	const sub = await prisma.codeSubmission.findUnique({
		where: { id: submissionId },
		select: { id: true, attempt: { select: { studentName: true, assessment: { select: { title: true, facultyId: true } } } } },
	});
	if (!sub) return;
	const n = await prisma.notification.create({
		data: {
			userId: sub.attempt.assessment.facultyId,
			title: "Coding answer needs your review",
			description: `${sub.attempt.studentName} · ${sub.attempt.assessment.title}: ${reasons.map((r) => r.detail).join(" ")}`.slice(0, 500),
			type: "system",
			priority: "medium",
		},
	});
	getIO()?.to(`user-${sub.attempt.assessment.facultyId}`).emit("notification:new", n);
	getIO()?.to(`user-${sub.attempt.assessment.facultyId}`).emit("code:flagged", { submissionId });
}

async function openOrUpdateFlag(submissionId: string, evaluationId: string | null, reasons: FlagInput[]) {
	const primary = reasons[0]!;
	const detail = reasons.map((r) => r.detail).join(" ");
	const open = await prisma.codeFlag.findFirst({ where: { submissionId, status: { in: ["pending", "in_review"] } }, orderBy: { createdAt: "desc" } });
	if (open) await prisma.codeFlag.update({ where: { id: open.id }, data: { reason: primary.code, detail, evaluationId } });
	else await prisma.codeFlag.create({ data: { submissionId, evaluationId, reason: primary.code, detail } });
}

type JobOutcome = { done: true } | { done: false; retryInMinutes: number; error: string };

export async function evaluateSubmission(job: CodeEvaluationJob): Promise<JobOutcome> {
	const sub = await prisma.codeSubmission.findUnique({ where: { id: job.submissionId }, include: { question: true } });
	if (!sub) return { done: true };
	const config = parseCodingConfig(sub.question.config);
	const facultyFinal = sub.finalizedBy === "faculty";
	const runNumber = (await prisma.codeEvaluation.count({ where: { submissionId: sub.id } })) + 1;
	const evaluation = await prisma.codeEvaluation.create({
		data: { submissionId: sub.id, runNumber, trigger: job.trigger, triggeredById: job.triggeredById, maxMarks: sub.maxMarks },
	});
	if (!facultyFinal) await prisma.codeSubmission.update({ where: { id: sub.id }, data: { status: "EVALUATING" } });

	if (!isCodeLanguage(sub.language)) {
		await prisma.codeEvaluation.update({ where: { id: evaluation.id }, data: { status: "failed", error: `Unsupported language ${sub.language}`, completedAt: new Date() } });
		await openOrUpdateFlag(sub.id, evaluation.id, [{ code: "ambiguous_question", detail: `Submitted in unsupported language "${sub.language}"; grade manually.` }]);
		if (!facultyFinal) await prisma.codeSubmission.update({ where: { id: sub.id }, data: { status: "FLAGGED" } });
		return { done: true };
	}
	const language = sub.language;

	// 1–3. Compile + run every test case in the sandbox.
	let tests: Awaited<ReturnType<typeof runTests>>;
	try {
		tests = await runTests(language, sub.sourceCode, config);
	} catch (err) {
		const message = (err as Error).message;
		const lastTry = job.attempts + 1 >= INFRA_RETRY_MINUTES.length;
		await prisma.codeEvaluation.update({ where: { id: evaluation.id }, data: { status: lastTry ? "failed" : "infra_error", compileStatus: "infra_error", error: message, completedAt: new Date() } });
		if (lastTry) {
			// Infrastructure failure, not the student's fault: hand to faculty.
			const reasons: FlagInput[] = [
				{ code: "infrastructure_error", detail: `The code execution service failed repeatedly (${clip(message, 200)}). Re-evaluate once it is back, or grade manually.` },
			];
			await openOrUpdateFlag(sub.id, evaluation.id, reasons);
			if (!facultyFinal) await prisma.codeSubmission.update({ where: { id: sub.id }, data: { status: "FLAGGED" } });
			await notifyFaculty(sub.id, reasons);
			return { done: true };
		}
		if (!facultyFinal) await prisma.codeSubmission.update({ where: { id: sub.id }, data: { status: "PENDING" } });
		return { done: false, retryInMinutes: INFRA_RETRY_MINUTES[job.attempts] ?? 20, error: message };
	}

	await prisma.codeTestResult.createMany({
		data: tests.outcomes.map((o) => ({
			submissionId: sub.id,
			evaluationId: evaluation.id,
			index: o.index,
			hidden: o.hidden,
			input: o.input,
			expectedOutput: o.expected,
			actualOutput: o.result.stdout,
			stderr: o.result.stderr || null,
			passed: o.passed,
			verdict: o.verdict,
			timeMs: o.result.timeMs,
			memoryKb: o.result.memoryKb,
		})),
	});
	const testsPassed = tests.outcomes.filter((o) => o.passed).length;

	// 4. AI rubric analysis (retry while the model is unavailable).
	const ai = await analyseWithAi({
		questionText: sub.question.text,
		language,
		sourceCode: sub.sourceCode,
		config,
		compileStatus: tests.compileStatus,
		compileOutput: tests.compileOutput,
		outcomes: tests.outcomes,
	});
	const aiShare = 100 - config.testWeightPercent;
	if (!ai && aiShare > 0 && job.attempts < AI_RETRY_MINUTES.length) {
		await prisma.codeEvaluation.update({
			where: { id: evaluation.id },
			data: {
				status: "pending_ai",
				compileStatus: tests.compileStatus,
				compileOutput: tests.compileOutput,
				testsPassed,
				testsTotal: tests.outcomes.length,
				error: "Vigil AI unavailable; will retry.",
				completedAt: new Date(),
			},
		});
		if (!facultyFinal) await prisma.codeSubmission.update({ where: { id: sub.id }, data: { status: "PENDING" } });
		return { done: false, retryInMinutes: AI_RETRY_MINUTES[job.attempts] ?? 10, error: "Vigil AI unavailable" };
	}

	// 5–6. Marks + confidence from evidence.
	const result = grade({
		maxMarks: sub.maxMarks,
		testWeightPercent: config.testWeightPercent,
		rubric: config.rubric,
		compileStatus: tests.compileStatus,
		testsPassed,
		testsTotal: tests.outcomes.length,
		hiddenTests: config.testCases.filter((t) => t.hidden).length,
		ai: ai?.analysis ?? null,
		threshold: config.confidenceThreshold,
	});
	const feedback =
		ai?.analysis.feedback ||
		(tests.compileStatus === "compilation_error"
			? "Your program did not compile, so no test case could pass. Check the compiler errors."
			: `${testsPassed} of ${tests.outcomes.length} test cases passed.`);

	// 7. Persist.
	await prisma.codeEvaluation.update({
		where: { id: evaluation.id },
		data: {
			status: "completed",
			compileStatus: tests.compileStatus,
			compileOutput: tests.compileOutput,
			testsPassed,
			testsTotal: tests.outcomes.length,
			testMarks: result.testMarks,
			aiMarks: result.aiMarks,
			suggestedMarks: result.suggestedMarks,
			breakdown: JSON.stringify(result.breakdown),
			feedback,
			confidence: result.confidence,
			generatedBy: ai ? "llm" : "tests_only",
			flagReasons: JSON.stringify(result.flagReasons),
			aiRaw: ai?.raw ? clip(ai.raw, 20000) : null,
			completedAt: new Date(),
		},
	});

	const flagged = result.flagReasons.length > 0;
	if (!facultyFinal) {
		await prisma.codeSubmission.update({
			where: { id: sub.id },
			data: flagged
				? { status: "FLAGGED", suggestedMarks: result.suggestedMarks, finalMarks: null, finalizedBy: null }
				: { status: "EVALUATED", suggestedMarks: result.suggestedMarks, finalMarks: result.suggestedMarks, finalizedBy: "ai" },
		});
		if (flagged) {
			await openOrUpdateFlag(sub.id, evaluation.id, result.flagReasons);
			await notifyFaculty(sub.id, result.flagReasons);
		} else {
			// A confident re-evaluation clears flags that were still open.
			await prisma.codeFlag.updateMany({
				where: { submissionId: sub.id, status: { in: ["pending", "in_review"] } },
				data: { status: "reviewed", resolvedAt: new Date(), detail: "Cleared automatically: re-evaluation was confident." },
			});
		}
		if (sub.isLatest) {
			await prisma.answer.updateMany({
				where: { attemptId: sub.attemptId, questionId: sub.questionId },
				data: {
					aiGrade: result.suggestedMarks,
					aiConfidence: result.confidence,
					isFlagged: flagged,
					feedback,
					aiEvaluation: JSON.stringify({ source: "vigil-code", submissionId: sub.id, evaluationId: evaluation.id, testsPassed, testsTotal: tests.outcomes.length, breakdown: result.breakdown }),
				},
			});
			await recomputeAttemptScore(sub.attemptId);
		}
	} else {
		await prisma.codeSubmission.update({ where: { id: sub.id }, data: { suggestedMarks: result.suggestedMarks } });
	}
	getIO()?.to(`user-${sub.studentId}`).emit("code:evaluated", { submissionId: sub.id });
	return { done: true };
}

/* ───────────── durable job loop ───────────── */

let timer: ReturnType<typeof setInterval> | null = null;
let active = 0;
const CONCURRENCY = 2;

async function claimAndRun() {
	while (active < CONCURRENCY) {
		const job = await prisma.codeEvaluationJob.findFirst({ where: { status: "pending", nextRunAt: { lte: new Date() } }, orderBy: { nextRunAt: "asc" } });
		if (!job) return;
		const claimed = await prisma.codeEvaluationJob.updateMany({ where: { id: job.id, status: "pending" }, data: { status: "processing" } });
		if (claimed.count === 0) continue; // another tick took it
		active++;
		void (async () => {
			try {
				const out = await evaluateSubmission(job);
				await prisma.codeEvaluationJob.update({
					where: { id: job.id },
					data: out.done
						? { status: "done", attempts: { increment: 1 } }
						: { status: "pending", attempts: { increment: 1 }, lastError: out.error, nextRunAt: new Date(Date.now() + out.retryInMinutes * 60000) },
				});
			} catch (err) {
				console.error("[Coding] evaluation job failed:", err);
				await prisma.codeEvaluationJob
					.update({ where: { id: job.id }, data: job.attempts >= 4 ? { status: "failed", lastError: String(err) } : { status: "pending", attempts: { increment: 1 }, lastError: String(err), nextRunAt: new Date(Date.now() + 120000) } })
					.catch(() => {});
				if (job.attempts >= 4) await prisma.codeSubmission.update({ where: { id: job.submissionId }, data: { status: "FAILED" } }).catch(() => {});
			} finally {
				active--;
			}
		})();
	}
}

export function startEvaluationWorker(intervalMs = 3000) {
	if (timer) return;
	void prisma.codeEvaluationJob.updateMany({ where: { status: "processing" }, data: { status: "pending" } }).catch(() => {});
	timer = setInterval(() => {
		claimAndRun().catch((err) => console.error("[Coding] job loop error:", err));
	}, intervalMs);
}

export function isEvaluationWorkerRunning() {
	return timer !== null;
}

export async function enqueueEvaluation(submissionId: string, trigger: "auto" | "faculty" | "bulk", triggeredById?: string) {
	const existing = await prisma.codeEvaluationJob.findFirst({ where: { submissionId, status: { in: ["pending", "processing"] } } });
	if (existing) return existing;
	return prisma.codeEvaluationJob.create({ data: { submissionId, trigger, triggeredById } });
}
