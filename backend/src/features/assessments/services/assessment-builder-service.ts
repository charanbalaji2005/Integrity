import { createHash } from "node:crypto";
import { z } from "zod";
import { HTTP_STATUS } from "@/constants/http-status";
import { prisma } from "@/database";
import { AppError } from "@/utils/app-error";

/* ───────────────────────── question model ───────────────────────── */

export const QUESTION_TYPES = [
	"multiple-choice",
	"multiple-select",
	"true-false",
	"short-answer",
	"descriptive",
	"coding",
	"fill-blank",
	"file-upload", // legacy, kept so older assessments still validate
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** Types graded instantly on submit; everything else goes to the AI evaluation queue. */
export const OBJECTIVE_TYPES = new Set<string>([
	"multiple-choice",
	"multiple-select",
	"true-false",
	"fill-blank",
]);

/** Matches a blank in fill-in-the-blank text: three or more underscores. */
export const BLANK_PATTERN = /_{3,}/g;

const testCaseSchema = z.object({
	input: z.string().max(5000).default(""),
	output: z.string().max(5000).default(""),
	hidden: z.boolean().default(true),
});

export const questionConfigSchema = z
	.object({
		imageIds: z.array(z.string().max(40)).max(6).default([]),
		// coding
		language: z.string().max(30).optional(),
		starterCode: z.string().max(20000).optional(),
		sampleInput: z.string().max(5000).optional(),
		sampleOutput: z.string().max(5000).optional(),
		testCases: z.array(testCaseSchema).max(50).optional(),
		timeLimitMs: z.number().int().min(100).max(60000).optional(),
		memoryLimitMb: z.number().int().min(16).max(4096).optional(),
		/** Languages students may choose (c | cpp | java | python). Empty → all four. */
		allowedLanguages: z
			.array(z.enum(["c", "cpp", "java", "python"]))
			.max(4)
			.optional(),
		/** Share of the marks decided by test cases (rest: AI-scored rubric). */
		testWeightPercent: z.number().min(0).max(100).optional(),
		rubric: z
			.array(
				z.object({
					criterion: z.string().min(1).max(80),
					marks: z.number().min(0).max(1000),
					description: z.string().max(500).optional(),
				}),
			)
			.max(10)
			.optional(),
		/** How program output is compared with expected output. */
		outputMatch: z.enum(["trim", "exact", "tokens"]).optional(),
		/** Per-question override of the auto-grading confidence threshold (0–1). */
		confidenceThreshold: z.number().min(0).max(1).optional(),
		// fill in the blanks: accepted answers per blank
		blanks: z
			.array(z.array(z.string().max(300)).max(10))
			.max(20)
			.optional(),
		caseSensitive: z.boolean().optional(),
	})
	.partial()
	.default({});
export type QuestionConfig = z.infer<typeof questionConfigSchema>;

export const builderQuestionSchema = z.object({
	id: z.string().max(40).optional(),
	type: z.enum(QUESTION_TYPES),
	text: z.string().max(20000).default(""),
	options: z.array(z.string().max(1000)).max(12).nullable().optional(),
	/** string for single answers; array for multiple-select */
	correctAnswer: z
		.union([z.string().max(20000), z.array(z.string().max(1000))])
		.nullable()
		.optional(),
	points: z.coerce.number().min(0).max(1000).default(1),
	negativeMarks: z.coerce.number().min(0).max(1000).default(0),
	difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
	explanation: z.string().max(20000).nullable().optional(),
	learningOutcome: z.string().max(200).nullable().optional(),
	topicId: z.string().max(40).nullable().optional(),
	config: questionConfigSchema.optional(),
});
export type BuilderQuestion = z.infer<typeof builderQuestionSchema>;

/* ───────────────────────── integrity config ───────────────────────── */

export const integrityConfigSchema = z
	.object({
		webcam: z
			.object({
				facePresence: z.boolean().default(true),
				multipleFaces: z.boolean().default(true),
				faceDisappearanceAlerts: z.boolean().default(true),
				cameraDisconnect: z.boolean().default(true),
			})
			.default({
				facePresence: true,
				multipleFaces: true,
				faceDisappearanceAlerts: true,
				cameraDisconnect: true,
			}),
		faceVerification: z
			.object({
				preExam: z.boolean().default(true),
				referenceComparison: z.boolean().default(true),
				onFailure: z.enum(["block", "flag", "allow"]).default("flag"),
			})
			.default({ preExam: true, referenceComparison: true, onFailure: "flag" }),
		gaze: z
			.object({
				gazeDirection: z.boolean().default(true),
				headPose: z.boolean().default(true),
				offScreenSeconds: z.number().int().min(2).max(60).default(5),
			})
			.default({ gazeDirection: true, headPose: true, offScreenSeconds: 5 }),
		objects: z
			.object({
				enabled: z.boolean().default(true),
				phone: z.boolean().default(true),
				unauthorizedObjects: z.boolean().default(true),
				multiplePersons: z.boolean().default(true),
			})
			.default({ enabled: true, phone: true, unauthorizedObjects: true, multiplePersons: true }),
		microphone: z
			.object({
				voiceActivity: z.boolean().default(true),
				backgroundSpeech: z.boolean().default(true),
				micDisconnect: z.boolean().default(true),
			})
			.default({ voiceActivity: true, backgroundSpeech: true, micDisconnect: true }),
		browser: z
			.object({
				tabSwitch: z.boolean().default(true),
				fullscreenExit: z.boolean().default(true),
				copyPaste: z.boolean().default(true),
				contextMenu: z.boolean().default(true),
				windowFocus: z.boolean().default(true),
			})
			.default({
				tabSwitch: true,
				fullscreenExit: true,
				copyPaste: true,
				contextMenu: true,
				windowFocus: true,
			}),
		behavior: z
			.object({
				combineSignals: z.boolean().default(true),
				sensitivity: z.enum(["low", "medium", "high"]).default("medium"),
				alertThreshold: z.number().int().min(1).max(20).default(3),
				dedupeWindowSeconds: z.number().int().min(0).max(600).default(30),
			})
			.default({
				combineSignals: true,
				sensitivity: "medium",
				alertThreshold: 3,
				dedupeWindowSeconds: 30,
			}),
	})
	.default({} as never);
export type IntegrityConfig = z.infer<typeof integrityConfigSchema>;

export function parseIntegrityConfig(raw: string | null | undefined): IntegrityConfig {
	let value: unknown = {};
	try {
		value = raw ? JSON.parse(raw) : {};
	} catch {
		value = {};
	}
	const parsed = integrityConfigSchema.safeParse(value);
	return parsed.success ? parsed.data : integrityConfigSchema.parse({});
}

/* ───────────────────────── assessment payload ───────────────────────── */

const optionalDate = z
	.union([z.string(), z.null()])
	.optional()
	.transform((v, ctx) => {
		if (v === undefined) return undefined;
		if (v === null || v === "") return null;
		const d = new Date(v);
		if (Number.isNaN(d.getTime())) {
			ctx.addIssue({ code: "custom", message: `Invalid date: ${v}` });
			return z.NEVER;
		}
		return d;
	});

/** Every field optional so PUT can patch; POST additionally requires title + duration. */
export const builderPayloadSchema = z.object({
	title: z.string().trim().max(200).optional(),
	description: z.string().max(20000).nullable().optional(),
	duration: z.coerce.number().int().min(1).max(1440).optional(),
	availabilityStart: optionalDate,
	availabilityEnd: optionalDate,
	attemptLimit: z.coerce.number().int().min(1).max(50).optional(),
	gradingScheme: z.enum(["points", "percentage", "letter", "pass-fail"]).optional(),
	assessmentType: z.enum(["quiz", "midterm", "final", "practice"]).optional(),
	totalMarks: z.coerce.number().min(0).max(100000).nullable().optional(),
	passingMarks: z.coerce.number().min(0).max(100000).nullable().optional(),
	randomizeQuestions: z.boolean().optional(),
	randomizeOptions: z.boolean().optional(),
	negativeMarking: z.boolean().optional(),
	negativeMarkValue: z.coerce.number().min(0).max(1000).optional(),
	// integrity master toggles (drive the live proctoring agents)
	webcamMonitoring: z.boolean().optional(),
	microphoneAnalysis: z.boolean().optional(),
	browserLockdown: z.boolean().optional(),
	faceVerification: z.boolean().optional(),
	gazeTracking: z.boolean().optional(),
	tabSwitchDetection: z.boolean().optional(),
	behavioralAnalysis: z.boolean().optional(),
	integrityConfig: integrityConfigSchema.optional(),
	// resume & attempts
	allowResume: z.boolean().optional(),
	maxResumeCount: z.coerce.number().int().min(0).max(20).optional(),
	resumeTimeWindow: z.coerce.number().int().min(0).max(240).optional(),
	resumeAfterDisconnect: z.boolean().optional(),
	resumeAfterCrash: z.boolean().optional(),
	resumeAfterLogout: z.boolean().optional(),
	retakeAllowed: z.boolean().optional(),
	retakeDate: optionalDate,
	attemptLock: z.boolean().optional(),
	lateSubmissionAllowed: z.boolean().optional(),
	autoSubmitOnExpiry: z.boolean().optional(),
	attemptResetAllowed: z.boolean().optional(),
	// syllabus & materials
	courseId: z.string().max(40).nullable().optional(),
	syllabusId: z.string().max(40).nullable().optional(),
	topicIds: z.array(z.string().max(40)).max(500).optional(),
	materials: z
		.array(
			z.object({ materialId: z.string().max(40), permittedInExam: z.boolean().default(false) }),
		)
		.max(200)
		.optional(),
	materialsAccessible: z.boolean().optional(),
	materialsDownloadable: z.boolean().optional(),
	materialsRestrictedDuringExam: z.boolean().optional(),
	materialsAvailableFrom: optionalDate,
	materialsAvailableUntil: optionalDate,
	questions: z.array(builderQuestionSchema).max(300).optional(),
	published: z.boolean().optional(),
});
export type BuilderPayload = z.infer<typeof builderPayloadSchema>;

export function parseBuilderPayload(body: unknown): BuilderPayload {
	const result = builderPayloadSchema.safeParse(body ?? {});
	if (!result.success) {
		const issue = result.error.issues[0];
		const where = issue?.path?.length ? `${issue.path.join(".")}: ` : "";
		throw new AppError(
			`${where}${issue?.message ?? "Invalid assessment data"}`,
			HTTP_STATUS.BAD_REQUEST,
		);
	}
	return result.data;
}

/* ───────────────────────── persistence ───────────────────────── */

function serializeCorrectAnswer(q: BuilderQuestion): string | null {
	if (q.type === "multiple-select") {
		const list = Array.isArray(q.correctAnswer)
			? q.correctAnswer
			: typeof q.correctAnswer === "string" && q.correctAnswer.trim().startsWith("[")
				? (JSON.parse(q.correctAnswer) as string[])
				: q.correctAnswer
					? [q.correctAnswer]
					: [];
		return JSON.stringify(list);
	}
	if (q.type === "fill-blank") {
		return JSON.stringify(q.config?.blanks ?? []);
	}
	if (Array.isArray(q.correctAnswer)) return q.correctAnswer.join("\n");
	return q.correctAnswer?.toString() || null;
}

function questionData(q: BuilderQuestion, order: number) {
	const options =
		q.type === "true-false"
			? ["True", "False"]
			: q.options && q.options.length > 0
				? q.options
				: null;
	return {
		type: q.type,
		text: q.text,
		options: options ? JSON.stringify(options) : null,
		correctAnswer: serializeCorrectAnswer(q),
		points: q.points,
		negativeMarks: q.negativeMarks,
		difficulty: q.difficulty,
		explanation: q.explanation || null,
		learningOutcome: q.learningOutcome || null,
		topicId: q.topicId || null,
		config: q.config && Object.keys(q.config).length > 0 ? JSON.stringify(q.config) : null,
		order,
	};
}

/**
 * Reconciles the submitted question list with the stored one. Questions keep their ids
 * (so answers, analytics and reorders stay attached); new ones are created; omitted ones
 * are deleted — refused when a student has already answered them.
 */
export async function syncQuestions(assessmentId: string, questions: BuilderQuestion[]) {
	const existing = await prisma.question.findMany({
		where: { assessmentId },
		select: { id: true, _count: { select: { answers: true } } },
	});
	const existingIds = new Set(existing.map((q) => q.id));
	const keep = new Set(
		questions.map((q) => q.id).filter((id): id is string => !!id && existingIds.has(id)),
	);
	const toDelete = existing.filter((q) => !keep.has(q.id));
	const answered = toDelete.filter((q) => q._count.answers > 0);
	if (answered.length > 0) {
		throw new AppError(
			`${answered.length} question(s) already have student answers and cannot be removed.`,
			HTTP_STATUS.CONFLICT,
		);
	}

	// Validate topic ids belong to a real topic (silently drop stale ids).
	const topicIds = [...new Set(questions.map((q) => q.topicId).filter((t): t is string => !!t))];
	const validTopics = new Set(
		topicIds.length
			? (
					await prisma.courseTopic.findMany({
						where: { id: { in: topicIds } },
						select: { id: true },
					})
				).map((t) => t.id)
			: [],
	);

	await prisma.$transaction(async (tx) => {
		if (toDelete.length) {
			await tx.question.deleteMany({ where: { id: { in: toDelete.map((q) => q.id) } } });
		}
		for (const [i, q] of questions.entries()) {
			const data = questionData(
				{ ...q, topicId: q.topicId && validTopics.has(q.topicId) ? q.topicId : null },
				i,
			);
			if (q.id && keep.has(q.id)) {
				await tx.question.update({ where: { id: q.id }, data });
			} else {
				await tx.question.create({ data: { ...data, assessmentId } });
			}
		}
	});
}

/** Checks the course/syllabus/topic/material references are visible to this faculty member. */
async function resolveLinks(
	payload: BuilderPayload,
	institutionName: string,
	isAdmin: boolean,
): Promise<{ courseId?: string | null; syllabusId?: string | null }> {
	const out: { courseId?: string | null; syllabusId?: string | null } = {};
	if (payload.courseId !== undefined) {
		if (payload.courseId) {
			const course = await prisma.course.findUnique({ where: { id: payload.courseId } });
			if (!course || (!isAdmin && course.institutionName !== institutionName)) {
				throw new AppError("Selected course was not found.", HTTP_STATUS.BAD_REQUEST);
			}
		}
		out.courseId = payload.courseId;
	}
	if (payload.syllabusId !== undefined) {
		if (payload.syllabusId) {
			const syllabus = await prisma.syllabus.findUnique({ where: { id: payload.syllabusId } });
			if (!syllabus || (payload.courseId && syllabus.courseId !== payload.courseId)) {
				throw new AppError(
					"Selected syllabus does not belong to the selected course.",
					HTTP_STATUS.BAD_REQUEST,
				);
			}
		}
		out.syllabusId = payload.syllabusId;
	}
	return out;
}

export function assessmentScalarData(p: BuilderPayload) {
	const pick = <K extends keyof BuilderPayload>(k: K) => (p[k] === undefined ? {} : { [k]: p[k] });
	return {
		...pick("title"),
		...pick("description"),
		...pick("duration"),
		...pick("availabilityStart"),
		...pick("availabilityEnd"),
		...pick("attemptLimit"),
		...pick("gradingScheme"),
		...pick("assessmentType"),
		...pick("totalMarks"),
		...pick("passingMarks"),
		...pick("randomizeQuestions"),
		...pick("randomizeOptions"),
		...pick("negativeMarking"),
		...pick("negativeMarkValue"),
		...pick("webcamMonitoring"),
		...pick("microphoneAnalysis"),
		...pick("browserLockdown"),
		...pick("faceVerification"),
		...pick("gazeTracking"),
		...pick("tabSwitchDetection"),
		...pick("behavioralAnalysis"),
		...(p.integrityConfig ? { integrityConfig: JSON.stringify(p.integrityConfig) } : {}),
		...pick("allowResume"),
		...pick("maxResumeCount"),
		...pick("resumeTimeWindow"),
		...pick("resumeAfterDisconnect"),
		...pick("resumeAfterCrash"),
		...pick("resumeAfterLogout"),
		...pick("retakeAllowed"),
		...pick("retakeDate"),
		...pick("attemptLock"),
		...pick("lateSubmissionAllowed"),
		...pick("autoSubmitOnExpiry"),
		...pick("attemptResetAllowed"),
		...pick("materialsAccessible"),
		...pick("materialsDownloadable"),
		...pick("materialsRestrictedDuringExam"),
		...pick("materialsAvailableFrom"),
		...pick("materialsAvailableUntil"),
	};
}

/** Applies a builder payload to an existing assessment (scalars, links, topics, materials, questions). */
export async function applyBuilderPayload(
	assessmentId: string,
	payload: BuilderPayload,
	actor: { institutionName: string; isAdmin: boolean },
) {
	const links = await resolveLinks(payload, actor.institutionName, actor.isAdmin);
	await prisma.assessment.update({
		where: { id: assessmentId },
		data: { ...assessmentScalarData(payload), ...links },
	});

	if (payload.topicIds !== undefined) {
		const valid = payload.topicIds.length
			? await prisma.courseTopic.findMany({
					where: { id: { in: payload.topicIds } },
					select: { id: true },
				})
			: [];
		await prisma.$transaction([
			prisma.assessmentTopic.deleteMany({ where: { assessmentId } }),
			prisma.assessmentTopic.createMany({
				data: valid.map((t) => ({ assessmentId, topicId: t.id })),
			}),
		]);
	}

	if (payload.materials !== undefined) {
		const ids = payload.materials.map((m) => m.materialId);
		const valid = ids.length
			? await prisma.courseMaterial.findMany({
					where: {
						id: { in: ids },
						...(actor.isAdmin ? {} : { course: { institutionName: actor.institutionName } }),
					},
					select: { id: true },
				})
			: [];
		const validIds = new Set(valid.map((m) => m.id));
		await prisma.$transaction([
			prisma.assessmentMaterial.deleteMany({ where: { assessmentId } }),
			prisma.assessmentMaterial.createMany({
				data: payload.materials
					.filter((m) => validIds.has(m.materialId))
					.map((m) => ({
						assessmentId,
						materialId: m.materialId,
						permittedInExam: m.permittedInExam,
					})),
				skipDuplicates: true,
			}),
		]);
	}

	if (payload.questions !== undefined) {
		await syncQuestions(assessmentId, payload.questions);
	}
}

/** Full builder view of one assessment (faculty only). */
export function loadBuilderAssessment(id: string) {
	return prisma.assessment.findUnique({
		where: { id },
		include: {
			questions: {
				orderBy: { order: "asc" },
				include: { topic: { select: { id: true, title: true, unitId: true } } },
			},
			topics: { select: { topicId: true } },
			materials: {
				include: {
					material: {
						include: {
							file: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true } },
						},
					},
				},
			},
			course: { select: { id: true, code: true, name: true, subject: true } },
			syllabus: { select: { id: true, title: true } },
			_count: { select: { attempts: true } },
		},
	});
}

/* ───────────────────────── publish validation ───────────────────────── */

export interface PublishIssue {
	field: string;
	message: string;
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
	if (!raw) return fallback;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

type StoredQuestion = {
	id: string;
	type: string;
	text: string;
	options: string | null;
	correctAnswer: string | null;
	points: number;
	negativeMarks?: number;
	config?: string | null;
};

export function validateQuestion(q: StoredQuestion, index: number): PublishIssue[] {
	const issues: PublishIssue[] = [];
	const label = `Question ${index + 1}`;
	const field = `questions.${index}`;
	const plain = q.text.replace(/[*_`#>-]/g, "").trim();
	if (plain.length < 5) issues.push({ field, message: `${label}: question text is too short.` });
	if (!(q.points > 0)) issues.push({ field, message: `${label}: marks must be greater than 0.` });
	const options = parseJson<string[]>(q.options, []);
	const config = parseJson<QuestionConfig>(q.config ?? null, {});

	switch (q.type) {
		case "multiple-choice": {
			if (options.length < 2)
				issues.push({ field, message: `${label}: add at least two options.` });
			if (options.some((o) => !o.trim()))
				issues.push({ field, message: `${label}: options cannot be empty.` });
			if (new Set(options.map((o) => o.trim().toLowerCase())).size !== options.length)
				issues.push({ field, message: `${label}: options must be unique.` });
			if (!q.correctAnswer || !options.includes(q.correctAnswer))
				issues.push({ field, message: `${label}: mark the correct option.` });
			break;
		}
		case "multiple-select": {
			const correct = parseJson<string[]>(q.correctAnswer, []);
			if (options.length < 2)
				issues.push({ field, message: `${label}: add at least two options.` });
			if (options.some((o) => !o.trim()))
				issues.push({ field, message: `${label}: options cannot be empty.` });
			if (correct.length === 0 || correct.some((c) => !options.includes(c)))
				issues.push({ field, message: `${label}: mark at least one correct option.` });
			break;
		}
		case "true-false":
			if (q.correctAnswer !== "True" && q.correctAnswer !== "False")
				issues.push({ field, message: `${label}: choose True or False as the answer.` });
			break;
		case "fill-blank": {
			const blanks = (q.text.match(BLANK_PATTERN) || []).length;
			const answers = config.blanks ?? [];
			if (blanks === 0)
				issues.push({ field, message: `${label}: add a blank using ___ (three underscores).` });
			else if (
				answers.length !== blanks ||
				answers.some((a) => a.filter((x) => x.trim()).length === 0)
			)
				issues.push({
					field,
					message: `${label}: provide an accepted answer for each of the ${blanks} blank(s).`,
				});
			break;
		}
		case "short-answer":
		case "descriptive":
			if (!q.correctAnswer?.trim())
				issues.push({
					field,
					message: `${label}: add a model answer or rubric for AI-assisted grading.`,
				});
			break;
		case "coding":
			if (!config.language)
				issues.push({ field, message: `${label}: select a programming language.` });
			else if (!["c", "cpp", "java", "python"].includes(config.language))
				issues.push({
					field,
					message: `${label}: coding questions run in C, C++, Java or Python — pick one of these.`,
				});
			if (!q.correctAnswer?.trim() && !config.testCases?.length)
				issues.push({
					field,
					message: `${label}: add a reference solution or at least one test case.`,
				});
			break;
		default:
			break;
	}
	return issues;
}

export async function collectPublishIssues(assessmentId: string): Promise<PublishIssue[]> {
	const a = await prisma.assessment.findUnique({
		where: { id: assessmentId },
		include: { questions: { orderBy: { order: "asc" } } },
	});
	if (!a) throw new AppError("Assessment not found", HTTP_STATUS.NOT_FOUND);
	const issues: PublishIssue[] = [];
	if (!a.title || a.title.trim().length < 3)
		issues.push({ field: "title", message: "Add an assessment title." });
	if (!(a.duration > 0)) issues.push({ field: "duration", message: "Set a duration." });
	if (a.availabilityStart && a.availabilityEnd && a.availabilityEnd <= a.availabilityStart)
		issues.push({ field: "availabilityEnd", message: "Availability must end after it starts." });
	if (a.availabilityEnd && a.availabilityEnd.getTime() < Date.now())
		issues.push({
			field: "availabilityEnd",
			message: "The availability window has already ended.",
		});
	if (a.questions.length === 0)
		issues.push({ field: "questions", message: "Add at least one question." });
	a.questions.forEach((q, i) => {
		issues.push(...validateQuestion(q, i));
	});
	const sum = a.questions.reduce((s, q) => s + q.points, 0);
	if (a.totalMarks != null && a.questions.length > 0 && Math.abs(sum - a.totalMarks) > 0.001)
		issues.push({
			field: "totalMarks",
			message: `Question marks add up to ${sum}, but total marks is set to ${a.totalMarks}.`,
		});
	const total = a.totalMarks ?? sum;
	if (a.passingMarks != null && a.passingMarks > total)
		issues.push({ field: "passingMarks", message: "Passing marks cannot exceed total marks." });
	if (
		a.materialsAvailableFrom &&
		a.materialsAvailableUntil &&
		a.materialsAvailableUntil <= a.materialsAvailableFrom
	)
		issues.push({
			field: "materialsAvailableUntil",
			message: "Material availability must end after it starts.",
		});
	return issues;
}

/* ───────────────────────── student-facing views ───────────────────────── */

/** Removes answer keys, explanations and hidden test cases before questions reach a student. */
export function sanitizeQuestionForStudent<Q extends StoredQuestion & Record<string, unknown>>(
	q: Q,
) {
	const config = parseJson<QuestionConfig>(q.config ?? null, {});
	const safeConfig: QuestionConfig = {
		imageIds: config.imageIds ?? [],
		...(q.type === "coding"
			? {
					language: config.language,
					starterCode: config.starterCode,
					sampleInput: config.sampleInput,
					sampleOutput: config.sampleOutput,
					testCases: (config.testCases ?? []).filter((t) => !t.hidden),
					timeLimitMs: config.timeLimitMs,
					memoryLimitMb: config.memoryLimitMb,
					allowedLanguages: config.allowedLanguages,
				}
			: {}),
	};
	return {
		...q,
		correctAnswer: null,
		explanation: null,
		config: JSON.stringify(safeConfig),
	};
}

/** Deterministic PRNG seeded per attempt so a resumed attempt sees the same order. */
function seededRandom(seed: string) {
	let h = createHash("sha256").update(seed).digest().readUInt32LE(0) || 1;
	return () => {
		h ^= h << 13;
		h ^= h >>> 17;
		h ^= h << 5;
		return ((h >>> 0) % 1_000_000) / 1_000_000;
	};
}

function shuffle<T>(list: T[], rand: () => number): T[] {
	const out = [...list];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

/** Orders (and optionally shuffles) questions and options for a specific attempt, answer keys stripped. */
export function questionsForAttempt<
	Q extends StoredQuestion & { order?: number } & Record<string, unknown>,
>(
	questions: Q[],
	assessment: { randomizeQuestions?: boolean; randomizeOptions?: boolean },
	attemptId: string,
) {
	const rand = seededRandom(attemptId);
	const ordered = [...questions].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
	const list = assessment.randomizeQuestions ? shuffle(ordered, rand) : ordered;
	return list.map((q) => {
		const safe = sanitizeQuestionForStudent(q);
		if (
			assessment.randomizeOptions &&
			(q.type === "multiple-choice" || q.type === "multiple-select") &&
			q.options
		) {
			return {
				...safe,
				options: JSON.stringify(shuffle(parseJson<string[]>(q.options, []), rand)),
			};
		}
		return safe;
	});
}

/* ───────────────────────── grading ───────────────────────── */

const norm = (s: string, caseSensitive = false) => {
	const t = s.trim().replace(/\s+/g, " ");
	return caseSensitive ? t : t.toLowerCase();
};

/**
 * Grades objective question types. Returns null for types that need AI/manual review.
 * Negative marks apply only to answered-but-wrong responses (blank answers score 0).
 */
export function gradeObjective(
	q: StoredQuestion,
	response: string | null | undefined,
	assessment: { negativeMarking?: boolean; negativeMarkValue?: number },
): number | null {
	if (!OBJECTIVE_TYPES.has(q.type)) return null;
	const raw = (response ?? "").trim();
	if (!raw || raw === "[]") return 0;
	const penalty = assessment.negativeMarking
		? -(q.negativeMarks || assessment.negativeMarkValue || 0)
		: 0;

	switch (q.type) {
		case "multiple-choice":
		case "true-false":
			return norm(q.correctAnswer ?? "") === norm(raw) ? q.points : penalty;
		case "multiple-select": {
			const correct = new Set(parseJson<string[]>(q.correctAnswer, []).map((s) => norm(s)));
			const given = new Set(parseJson<string[]>(raw, []).map((s) => norm(s)));
			const exact = correct.size === given.size && [...correct].every((c) => given.has(c));
			return exact ? q.points : penalty;
		}
		case "fill-blank": {
			const config = parseJson<QuestionConfig>(q.config ?? null, {});
			const blanks = config.blanks ?? parseJson<string[][]>(q.correctAnswer, []);
			if (blanks.length === 0) return 0;
			const given = parseJson<string[]>(raw, [raw]);
			const cs = !!config.caseSensitive;
			const right = blanks.filter((accepted, i) =>
				accepted.some((a) => a.trim() && norm(a, cs) === norm(given[i] ?? "", cs)),
			).length;
			if (right === 0) return penalty;
			return Math.round(((q.points * right) / blanks.length) * 100) / 100;
		}
		default:
			return null;
	}
}

/** Rubric handed to the AI evaluator; coding questions include their test cases. */
export function rubricFor(q: StoredQuestion): string {
	const base = q.correctAnswer || "";
	if (q.type !== "coding") return base;
	const config = parseJson<QuestionConfig>(q.config ?? null, {});
	const cases = (config.testCases ?? [])
		.map(
			(t, i) =>
				`Test ${i + 1}: input=${JSON.stringify(t.input)} expected=${JSON.stringify(t.output)}`,
		)
		.join("\n");
	return [
		config.language ? `Language: ${config.language}` : "",
		base ? `Reference solution:\n${base}` : "",
		cases ? `Expected behaviour:\n${cases}` : "",
	]
		.filter(Boolean)
		.join("\n\n");
}
