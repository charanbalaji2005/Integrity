import type { Request, Response } from "express";
import { z } from "zod";
import { HTTP_STATUS } from "@/constants/http-status";
import { prisma } from "@/database";
import { getAuthUser } from "@/middleware/auth-middleware";
import { AppError } from "@/utils/app-error";
import { sendSuccess } from "@/utils/response";
import { CODE_LANGUAGES, isCodeLanguage, LANGUAGE_SPECS, MAX_STDIN_BYTES } from "../languages";
import { createExecution, getExecutionForUser } from "../services/execution-service";
import { executorHealth } from "../services/judge0-client";
import { parseCodingConfig } from "../services/question-config";
import { applyAction, getReview, listFlags, reevaluateFlagged, type Reviewer } from "../services/review-service";
import { assertLanguage, assertSource, getWorkspace, loadStudentContext, saveDraft, submitFromStudent } from "../services/workspace-service";

const p = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
	const r = schema.safeParse(body);
	if (!r.success) throw new AppError(r.error.issues.map((i) => i.message).join("; "), HTTP_STATUS.BAD_REQUEST);
	return r.data;
}

async function reviewer(req: Request): Promise<Reviewer> {
	const u = getAuthUser(req);
	const db = await prisma.user.findUnique({ where: { id: u.id }, select: { id: true, name: true, role: true, section: true } });
	if (!db || (db.role !== "faculty" && db.role !== "admin")) throw new AppError("Faculty access required", HTTP_STATUS.FORBIDDEN);
	return db;
}

/* ───────── shared ───────── */

export async function healthHandler(_req: Request, res: Response) {
	const h = await executorHealth();
	sendSuccess(res, {
		...h,
		supported: CODE_LANGUAGES.map((k) => ({ key: k, label: LANGUAGE_SPECS[k].label, monaco: LANGUAGE_SPECS[k].monaco, available: h.languages[k] })),
	}, "Execution service status");
}

/* ───────── student ───────── */

export async function workspaceHandler(req: Request, res: Response) {
	const u = getAuthUser(req);
	sendSuccess(res, await getWorkspace(u.id, p(req.params.attemptId), p(req.params.questionId)), "Workspace");
}

export async function saveDraftHandler(req: Request, res: Response) {
	const u = getAuthUser(req);
	sendSuccess(res, await saveDraft(u.id, p(req.params.attemptId), p(req.params.questionId), req.body ?? {}), "Draft saved");
}

const runSchema = z.object({
	language: z.string(),
	sourceCode: z.string(),
	stdin: z.string().max(MAX_STDIN_BYTES, "Input is larger than 64 KB.").default(""),
	mode: z.enum(["compile", "run", "sample"]).default("run"),
});

export async function runHandler(req: Request, res: Response) {
	const u = getAuthUser(req);
	const body = parse(runSchema, req.body);
	const { attempt, question, config } = await loadStudentContext(u.id, p(req.params.attemptId), p(req.params.questionId), { write: true });
	const language = assertLanguage(body.language, config.allowedLanguages);
	const sourceCode = assertSource(body.sourceCode);
	const exec = await createExecution({
		userId: u.id,
		attemptId: attempt.id,
		questionId: question.id,
		language,
		sourceCode,
		stdin: body.stdin,
		mode: body.mode,
		timeLimitMs: config.timeLimitMs,
		memoryLimitMb: config.memoryLimitMb,
		samples: config.testCases.filter((t) => !t.hidden),
		outputMatch: config.outputMatch,
	});
	sendSuccess(res, exec, "Execution queued", 202);
}

export async function getExecutionHandler(req: Request, res: Response) {
	const u = getAuthUser(req);
	sendSuccess(res, await getExecutionForUser(p(req.params.id), u.id), "Execution");
}

export async function submitHandler(req: Request, res: Response) {
	const u = getAuthUser(req);
	sendSuccess(res, await submitFromStudent(u.id, p(req.params.attemptId), p(req.params.questionId), req.body ?? {}), "Answer submitted", HTTP_STATUS.CREATED);
}

/* ───────── faculty ───────── */

/** Faculty sandbox: try a reference solution or a test case from the builder. */
const facultyRunSchema = z.object({
	language: z.string(),
	sourceCode: z.string(),
	stdin: z.string().max(MAX_STDIN_BYTES).default(""),
	mode: z.enum(["compile", "run", "sample"]).default("run"),
	questionId: z.string().optional(),
	timeLimitMs: z.number().int().min(500).max(10000).optional(),
	memoryLimitMb: z.number().int().min(32).max(512).optional(),
	testCases: z.array(z.object({ input: z.string().max(5000), output: z.string().max(5000), hidden: z.boolean().optional() })).max(50).optional(),
});

export async function facultyRunHandler(req: Request, res: Response) {
	const r = await reviewer(req);
	const body = parse(facultyRunSchema, req.body);
	if (!isCodeLanguage(body.language)) throw new AppError("Use c, cpp, java or python.", HTTP_STATUS.BAD_REQUEST);
	let config = parseCodingConfig(null);
	if (body.questionId) {
		const q = await prisma.question.findUnique({ where: { id: body.questionId }, include: { assessment: { select: { facultyId: true } } } });
		if (!q || (r.role !== "admin" && q.assessment.facultyId !== r.id)) throw new AppError("Question not found", HTTP_STATUS.NOT_FOUND);
		config = parseCodingConfig(q.config);
	}
	// Faculty may run against all tests (including hidden) from the builder.
	const tests = body.testCases?.map((t) => ({ input: t.input, output: t.output, hidden: t.hidden !== false })) ?? config.testCases;
	const exec = await createExecution({
		userId: r.id,
		attemptId: null,
		questionId: body.questionId ?? null,
		language: body.language,
		sourceCode: assertSource(body.sourceCode),
		stdin: body.stdin,
		mode: body.mode,
		timeLimitMs: body.timeLimitMs ?? config.timeLimitMs,
		memoryLimitMb: body.memoryLimitMb ?? config.memoryLimitMb,
		samples: tests,
		outputMatch: config.outputMatch,
	});
	sendSuccess(res, exec, "Execution queued", 202);
}

export async function listFlagsHandler(req: Request, res: Response) {
	const r = await reviewer(req);
	const q = req.query as Record<string, string | undefined>;
	sendSuccess(res, await listFlags(r, { status: q.status, assessmentId: q.assessmentId, courseId: q.courseId, language: q.language, reason: q.reason, q: q.q?.slice(0, 100) }), "Flagged submissions");
}

export async function reviewHandler(req: Request, res: Response) {
	const r = await reviewer(req);
	sendSuccess(res, await getReview(r, p(req.params.submissionId)), "Submission review");
}

const actionSchema = z.object({
	action: z.enum(["approve_ai", "override", "reevaluate", "request_second_review", "mark_reviewed", "remark"]),
	marks: z.number().optional(),
	remark: z.string().max(2000).optional(),
	explanation: z.string().max(2000).optional(),
	assignToFacultyId: z.string().max(40).optional(),
});

export async function actionHandler(req: Request, res: Response) {
	const r = await reviewer(req);
	const body = parse(actionSchema, req.body);
	sendSuccess(res, await applyAction(r, p(req.params.submissionId), body), "Review updated");
}

export async function reevaluateFlaggedHandler(req: Request, res: Response) {
	const r = await reviewer(req);
	const body = parse(z.object({ questionId: z.string().max(40).optional() }), req.body ?? {});
	sendSuccess(res, await reevaluateFlagged(r, p(req.params.assessmentId), body.questionId), "Re-evaluation queued");
}

/* ───────────────────────── Compiler playground (student portal) ───────────────────────── */

/** GET /api/coding/languages — compilers available in the sandbox, with starter templates. */
export async function languagesHandler(_req: Request, res: Response) {
	sendSuccess(
		res,
		CODE_LANGUAGES.map((k) => ({
			key: k,
			label: LANGUAGE_SPECS[k].label,
			monaco: LANGUAGE_SPECS[k].monaco,
			fileName: LANGUAGE_SPECS[k].fileName,
			template: LANGUAGE_SPECS[k].template,
		})),
	);
}

const playgroundSchema = z.object({
	language: z.string(),
	sourceCode: z.string(),
	stdin: z.string().max(MAX_STDIN_BYTES, "Input is larger than 64 KB.").default(""),
	mode: z.enum(["compile", "run"]).default("run"),
});

/**
 * POST /api/coding/playground/run — free practice runs, not tied to any exam.
 * Same isolate sandbox, per-user concurrency and per-minute limits as exam runs.
 */
export async function playgroundRunHandler(req: Request, res: Response) {
	const u = getAuthUser(req);
	const body = parse(playgroundSchema, req.body);
	if (!isCodeLanguage(body.language)) throw new AppError("Choose C, C++, Java or Python.", HTTP_STATUS.BAD_REQUEST);
	const exec = await createExecution({
		userId: u.id,
		attemptId: null,
		questionId: null,
		language: body.language,
		sourceCode: assertSource(body.sourceCode),
		stdin: body.stdin,
		mode: body.mode,
		timeLimitMs: 5000,
		memoryLimitMb: Math.max(256, LANGUAGE_SPECS[body.language].minMemoryMb),
		samples: [],
		outputMatch: "trim",
	});
	sendSuccess(res, exec, "Execution queued", 202);
}
