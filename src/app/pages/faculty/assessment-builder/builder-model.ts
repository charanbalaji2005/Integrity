import { z } from "zod";
import type { ExamDefaults } from "../../../settings/preferences";
import { countBlanks, parseJson, typeMeta, type QuestionType } from "../../../components/assessment/question-meta";

/* ───────────────────────── integrity configuration ───────────────────────── */

export interface IntegrityConfig {
  webcam: { facePresence: boolean; multipleFaces: boolean; faceDisappearanceAlerts: boolean; cameraDisconnect: boolean };
  faceVerification: { preExam: boolean; referenceComparison: boolean; onFailure: "block" | "flag" | "allow" };
  gaze: { gazeDirection: boolean; headPose: boolean; offScreenSeconds: number };
  objects: { enabled: boolean; phone: boolean; unauthorizedObjects: boolean; multiplePersons: boolean };
  microphone: { voiceActivity: boolean; backgroundSpeech: boolean; micDisconnect: boolean };
  browser: { tabSwitch: boolean; fullscreenExit: boolean; copyPaste: boolean; contextMenu: boolean; windowFocus: boolean };
  behavior: { combineSignals: boolean; sensitivity: "low" | "medium" | "high"; alertThreshold: number; dedupeWindowSeconds: number };
}

export const DEFAULT_INTEGRITY_CONFIG: IntegrityConfig = {
  webcam: { facePresence: true, multipleFaces: true, faceDisappearanceAlerts: true, cameraDisconnect: true },
  faceVerification: { preExam: true, referenceComparison: true, onFailure: "flag" },
  gaze: { gazeDirection: true, headPose: true, offScreenSeconds: 5 },
  objects: { enabled: true, phone: true, unauthorizedObjects: true, multiplePersons: true },
  microphone: { voiceActivity: true, backgroundSpeech: true, micDisconnect: true },
  browser: { tabSwitch: true, fullscreenExit: true, copyPaste: true, contextMenu: true, windowFocus: true },
  behavior: { combineSignals: true, sensitivity: "medium", alertThreshold: 3, dedupeWindowSeconds: 30 },
};

function mergeIntegrity(raw: unknown): IntegrityConfig {
  const v = parseJson<Partial<IntegrityConfig>>(raw, {});
  const d = DEFAULT_INTEGRITY_CONFIG;
  return {
    webcam: { ...d.webcam, ...(v.webcam ?? {}) },
    faceVerification: { ...d.faceVerification, ...(v.faceVerification ?? {}) },
    gaze: { ...d.gaze, ...(v.gaze ?? {}) },
    objects: { ...d.objects, ...(v.objects ?? {}) },
    microphone: { ...d.microphone, ...(v.microphone ?? {}) },
    browser: { ...d.browser, ...(v.browser ?? {}) },
    behavior: { ...d.behavior, ...(v.behavior ?? {}) },
  };
}

/* ───────────────────────── form model ───────────────────────── */

export interface TestCase {
  input: string;
  output: string;
  hidden: boolean;
}

export interface QuestionForm {
  /** Stable client key for lists and drag-and-drop. */
  key: string;
  /** Server id once saved. */
  id?: string;
  type: QuestionType;
  text: string;
  options: string[];
  /** Correct option(s): one entry for MCQ / true-false, several for multiple-select. */
  correct: string[];
  /** Model answer (short/descriptive) or reference solution (coding). */
  modelAnswer: string;
  points: number;
  negativeMarks: number;
  difficulty: "easy" | "medium" | "hard";
  explanation: string;
  topicId: string | null;
  imageIds: string[];
  // coding
  language: string;
  starterCode: string;
  sampleInput: string;
  sampleOutput: string;
  testCases: TestCase[];
  timeLimitMs: number;
  memoryLimitMb: number;
  // fill in the blanks — accepted answers per blank, alternatives separated by "|"
  blanks: string[];
  caseSensitive: boolean;
}

export interface MaterialLink {
  materialId: string;
  permittedInExam: boolean;
}

const emptyToNull = (v: unknown) => (v === "" || v === null || v === undefined || (typeof v === "number" && Number.isNaN(v)) ? null : v);

export const builderFormSchema = z
  .object({
    title: z.string().trim().min(3, "Give the assessment a title (at least 3 characters).").max(200),
    description: z.string().max(20000),
    assessmentType: z.enum(["quiz", "midterm", "final", "practice"]),
    subjectFilter: z.string(),
    courseId: z.string().nullable(),
    syllabusId: z.string().nullable(),
    duration: z.coerce
      .number({ invalid_type_error: "Enter the duration in minutes." })
      .int("Use whole minutes.")
      .min(1, "Duration must be at least 1 minute.")
      .max(1440, "Duration cannot exceed 24 hours."),
    totalMarks: z.preprocess(emptyToNull, z.coerce.number().min(0, "Cannot be negative.").max(100000).nullable()),
    passingMarks: z.preprocess(emptyToNull, z.coerce.number().min(0, "Cannot be negative.").max(100000).nullable()),
    gradingScheme: z.enum(["points", "percentage", "letter", "pass-fail"]),
    attemptLimit: z.coerce.number().int("Use a whole number.").min(1, "Allow at least one attempt.").max(50),
    availabilityStart: z.string(),
    availabilityEnd: z.string(),
    randomizeQuestions: z.boolean(),
    randomizeOptions: z.boolean(),
    negativeMarking: z.boolean(),
    negativeMarkValue: z.coerce.number().min(0, "Cannot be negative.").max(1000),
    lateSubmissionAllowed: z.boolean(),
    attemptLock: z.boolean(),
    retakeAllowed: z.boolean(),
    retakeDate: z.string(),
    topicIds: z.array(z.string()),
    materials: z.array(z.object({ materialId: z.string(), permittedInExam: z.boolean() })),
    materialsAccessible: z.boolean(),
    materialsDownloadable: z.boolean(),
    materialsRestrictedDuringExam: z.boolean(),
    materialsAvailableFrom: z.string(),
    materialsAvailableUntil: z.string(),
    webcamMonitoring: z.boolean(),
    faceVerification: z.boolean(),
    gazeTracking: z.boolean(),
    microphoneAnalysis: z.boolean(),
    browserLockdown: z.boolean(),
    tabSwitchDetection: z.boolean(),
    behavioralAnalysis: z.boolean(),
    integrityConfig: z.custom<IntegrityConfig>(),
    allowResume: z.boolean(),
    maxResumeCount: z.coerce.number().int().min(0, "Cannot be negative.").max(20, "At most 20 resumes."),
    resumeTimeWindow: z.coerce.number().int().min(0, "Cannot be negative.").max(240, "At most 240 minutes."),
    resumeAfterDisconnect: z.boolean(),
    resumeAfterCrash: z.boolean(),
    resumeAfterLogout: z.boolean(),
    autoSubmitOnExpiry: z.boolean(),
    attemptResetAllowed: z.boolean(),
    questions: z.array(z.custom<QuestionForm>()),
  })
  .superRefine((v, ctx) => {
    if (v.availabilityStart && v.availabilityEnd && new Date(v.availabilityEnd) <= new Date(v.availabilityStart)) {
      ctx.addIssue({ code: "custom", path: ["availabilityEnd"], message: "End must be after the start." });
    }
    if (v.passingMarks != null && v.totalMarks != null && v.passingMarks > v.totalMarks) {
      ctx.addIssue({ code: "custom", path: ["passingMarks"], message: "Passing marks cannot exceed total marks." });
    }
    if (v.materialsAvailableFrom && v.materialsAvailableUntil && new Date(v.materialsAvailableUntil) <= new Date(v.materialsAvailableFrom)) {
      ctx.addIssue({ code: "custom", path: ["materialsAvailableUntil"], message: "Must be after the start." });
    }
    if (v.retakeAllowed && v.attemptLimit < 2) {
      ctx.addIssue({ code: "custom", path: ["attemptLimit"], message: "Retakes need at least 2 attempts allowed." });
    }
  });

export type BuilderForm = z.infer<typeof builderFormSchema>;

let keySeq = 0;
export const newKey = () => `q_${Date.now().toString(36)}_${(keySeq++).toString(36)}`;

export function newQuestion(type: QuestionType, defaults?: { negativeMarks?: number }): QuestionForm {
  const base: QuestionForm = {
    key: newKey(),
    type,
    text: "",
    options: [],
    correct: [],
    modelAnswer: "",
    points: type === "coding" ? 10 : type === "descriptive" ? 5 : type === "short-answer" ? 3 : 1,
    negativeMarks: defaults?.negativeMarks ?? 0,
    difficulty: "medium",
    explanation: "",
    topicId: null,
    imageIds: [],
    language: "python",
    starterCode: "",
    sampleInput: "",
    sampleOutput: "",
    testCases: [],
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    blanks: [],
    caseSensitive: false,
  };
  if (type === "multiple-choice" || type === "multiple-select") base.options = ["", "", "", ""];
  if (type === "true-false") base.options = ["True", "False"];
  if (type === "fill-blank") base.text = "";
  return base;
}

/** Fresh form, seeded from the faculty member's exam defaults in Settings. */
export function emptyForm(d: ExamDefaults): BuilderForm {
  return {
    title: "",
    description: "",
    assessmentType: "quiz",
    subjectFilter: "",
    courseId: null,
    syllabusId: null,
    duration: 60,
    totalMarks: null,
    passingMarks: null,
    gradingScheme: "points",
    attemptLimit: 1,
    availabilityStart: "",
    availabilityEnd: "",
    randomizeQuestions: false,
    randomizeOptions: false,
    negativeMarking: false,
    negativeMarkValue: 0.25,
    lateSubmissionAllowed: !!d.lateSubmission,
    attemptLock: !!d.attemptLock,
    retakeAllowed: false,
    retakeDate: "",
    topicIds: [],
    materials: [],
    materialsAccessible: false,
    materialsDownloadable: false,
    materialsRestrictedDuringExam: true,
    materialsAvailableFrom: "",
    materialsAvailableUntil: "",
    webcamMonitoring: !!d.webcam,
    faceVerification: !!d.face,
    gazeTracking: !!d.gaze,
    microphoneAnalysis: !!d.mic,
    browserLockdown: !!d.lockdown,
    tabSwitchDetection: !!d.tab,
    behavioralAnalysis: !!d.behavior,
    integrityConfig: structuredClone(DEFAULT_INTEGRITY_CONFIG),
    allowResume: !!d.allowResume,
    maxResumeCount: Number(d.maxResumeCount) || 3,
    resumeTimeWindow: Number(d.resumeTimeWindow) || 15,
    resumeAfterDisconnect: !!d.resumeAfterDisconnect,
    resumeAfterCrash: !!d.resumeAfterCrash,
    resumeAfterLogout: !!d.resumeAfterLogout,
    autoSubmitOnExpiry: true,
    attemptResetAllowed: false,
    questions: [],
  };
}

/* ───────────────────────── date helpers ───────────────────────── */

/** ISO → value for <input type="datetime-local"> in the browser's timezone. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const toIso = (local: string) => (local ? new Date(local).toISOString() : null);

/* ───────────────────────── server ↔ form ───────────────────────── */

export interface ServerQuestion {
  id: string;
  type: string;
  text: string;
  options: string | null;
  correctAnswer: string | null;
  points: number;
  negativeMarks?: number;
  difficulty: string;
  explanation?: string | null;
  topicId?: string | null;
  config?: string | null;
}

export interface ServerAssessment {
  id: string;
  title: string;
  description: string | null;
  duration: number;
  published: boolean;
  updatedAt: string;
  [key: string]: any;
  questions: ServerQuestion[];
  topics?: { topicId: string }[];
  materials?: { materialId: string; permittedInExam: boolean; material: any }[];
  course?: { id: string; code: string; name: string; subject: string | null } | null;
  _count?: { attempts: number };
}

function questionFromServer(q: ServerQuestion): QuestionForm {
  const type = (typeMeta(q.type).type as QuestionType) || "descriptive";
  const base = newQuestion(type);
  const cfg = parseJson<Record<string, any>>(q.config, {});
  const options = parseJson<string[]>(q.options, []);
  let correct: string[] = [];
  let modelAnswer = "";
  if (type === "multiple-select") correct = parseJson<string[]>(q.correctAnswer, []);
  else if (type === "multiple-choice" || type === "true-false") correct = q.correctAnswer ? [q.correctAnswer] : [];
  else if (type !== "fill-blank") modelAnswer = q.correctAnswer ?? "";
  return {
    ...base,
    key: q.id,
    id: q.id,
    text: q.text,
    options: type === "true-false" ? ["True", "False"] : options,
    correct,
    modelAnswer,
    points: q.points,
    negativeMarks: q.negativeMarks ?? 0,
    difficulty: (["easy", "medium", "hard"].includes(q.difficulty) ? q.difficulty : "medium") as QuestionForm["difficulty"],
    explanation: q.explanation ?? "",
    topicId: q.topicId ?? null,
    imageIds: cfg.imageIds ?? [],
    language: cfg.language ?? base.language,
    starterCode: cfg.starterCode ?? "",
    sampleInput: cfg.sampleInput ?? "",
    sampleOutput: cfg.sampleOutput ?? "",
    testCases: (cfg.testCases ?? []).map((t: TestCase) => ({ input: t.input ?? "", output: t.output ?? "", hidden: t.hidden !== false })),
    timeLimitMs: cfg.timeLimitMs ?? base.timeLimitMs,
    memoryLimitMb: cfg.memoryLimitMb ?? base.memoryLimitMb,
    blanks: ((cfg.blanks as string[][] | undefined) ?? []).map((alts) => alts.join(" | ")),
    caseSensitive: !!cfg.caseSensitive,
  };
}

export function formFromServer(a: ServerAssessment, d: ExamDefaults): BuilderForm {
  const f = emptyForm(d);
  const bool = (k: string, fallback: boolean) => (typeof a[k] === "boolean" ? (a[k] as boolean) : fallback);
  return {
    ...f,
    title: a.title ?? "",
    description: a.description ?? "",
    assessmentType: a.assessmentType ?? "quiz",
    subjectFilter: a.course?.subject ?? "",
    courseId: a.courseId ?? null,
    syllabusId: a.syllabusId ?? null,
    duration: a.duration,
    totalMarks: a.totalMarks ?? null,
    passingMarks: a.passingMarks ?? null,
    gradingScheme: a.gradingScheme ?? "points",
    attemptLimit: a.attemptLimit ?? 1,
    availabilityStart: toLocalInput(a.availabilityStart),
    availabilityEnd: toLocalInput(a.availabilityEnd),
    randomizeQuestions: bool("randomizeQuestions", false),
    randomizeOptions: bool("randomizeOptions", false),
    negativeMarking: bool("negativeMarking", false),
    negativeMarkValue: a.negativeMarkValue ?? f.negativeMarkValue,
    lateSubmissionAllowed: bool("lateSubmissionAllowed", f.lateSubmissionAllowed),
    attemptLock: bool("attemptLock", f.attemptLock),
    retakeAllowed: bool("retakeAllowed", false),
    retakeDate: toLocalInput(a.retakeDate),
    topicIds: (a.topics ?? []).map((t) => t.topicId),
    materials: (a.materials ?? []).map((m) => ({ materialId: m.materialId, permittedInExam: m.permittedInExam })),
    materialsAccessible: bool("materialsAccessible", false),
    materialsDownloadable: bool("materialsDownloadable", false),
    materialsRestrictedDuringExam: bool("materialsRestrictedDuringExam", true),
    materialsAvailableFrom: toLocalInput(a.materialsAvailableFrom),
    materialsAvailableUntil: toLocalInput(a.materialsAvailableUntil),
    webcamMonitoring: bool("webcamMonitoring", f.webcamMonitoring),
    faceVerification: bool("faceVerification", f.faceVerification),
    gazeTracking: bool("gazeTracking", f.gazeTracking),
    microphoneAnalysis: bool("microphoneAnalysis", f.microphoneAnalysis),
    browserLockdown: bool("browserLockdown", f.browserLockdown),
    tabSwitchDetection: bool("tabSwitchDetection", f.tabSwitchDetection),
    behavioralAnalysis: bool("behavioralAnalysis", f.behavioralAnalysis),
    integrityConfig: mergeIntegrity(a.integrityConfig),
    allowResume: bool("allowResume", f.allowResume),
    maxResumeCount: a.maxResumeCount ?? f.maxResumeCount,
    resumeTimeWindow: a.resumeTimeWindow ?? f.resumeTimeWindow,
    resumeAfterDisconnect: bool("resumeAfterDisconnect", f.resumeAfterDisconnect),
    resumeAfterCrash: bool("resumeAfterCrash", f.resumeAfterCrash),
    resumeAfterLogout: bool("resumeAfterLogout", f.resumeAfterLogout),
    autoSubmitOnExpiry: bool("autoSubmitOnExpiry", true),
    attemptResetAllowed: bool("attemptResetAllowed", false),
    questions: (a.questions ?? []).map(questionFromServer),
  };
}

const splitAlternatives = (s: string) =>
  s
    .split("|")
    .map((x) => x.trim())
    .filter(Boolean);

export function questionToPayload(q: QuestionForm) {
  const isChoice = q.type === "multiple-choice" || q.type === "multiple-select" || q.type === "true-false";
  const options = q.type === "true-false" ? ["True", "False"] : isChoice ? q.options.map((o) => o.trim()) : null;
  let correctAnswer: string | string[] | null = null;
  if (q.type === "multiple-select") correctAnswer = q.correct.filter((c) => options?.includes(c));
  else if (q.type === "multiple-choice" || q.type === "true-false") correctAnswer = q.correct[0] ?? null;
  else if (q.type !== "fill-blank") correctAnswer = q.modelAnswer || null;

  const config: Record<string, unknown> = {};
  if (q.imageIds.length) config.imageIds = q.imageIds;
  if (q.type === "coding") {
    Object.assign(config, {
      language: q.language,
      starterCode: q.starterCode || undefined,
      sampleInput: q.sampleInput || undefined,
      sampleOutput: q.sampleOutput || undefined,
      testCases: q.testCases,
      timeLimitMs: Number(q.timeLimitMs) || undefined,
      memoryLimitMb: Number(q.memoryLimitMb) || undefined,
    });
  }
  if (q.type === "fill-blank") {
    config.blanks = q.blanks.map(splitAlternatives);
    config.caseSensitive = q.caseSensitive;
  }
  return {
    id: q.id,
    type: q.type,
    text: q.text,
    options,
    correctAnswer,
    points: Number(q.points) || 0,
    negativeMarks: Number(q.negativeMarks) || 0,
    difficulty: q.difficulty,
    explanation: q.explanation || null,
    topicId: q.topicId,
    config,
  };
}

export function toPayload(v: BuilderForm) {
  return {
    title: v.title.trim(),
    description: v.description || null,
    assessmentType: v.assessmentType,
    courseId: v.courseId,
    syllabusId: v.syllabusId,
    duration: Number(v.duration),
    totalMarks: v.totalMarks,
    passingMarks: v.passingMarks,
    gradingScheme: v.gradingScheme,
    attemptLimit: Number(v.attemptLimit),
    availabilityStart: toIso(v.availabilityStart),
    availabilityEnd: toIso(v.availabilityEnd),
    randomizeQuestions: v.randomizeQuestions,
    randomizeOptions: v.randomizeOptions,
    negativeMarking: v.negativeMarking,
    negativeMarkValue: Number(v.negativeMarkValue) || 0,
    lateSubmissionAllowed: v.lateSubmissionAllowed,
    attemptLock: v.attemptLock,
    retakeAllowed: v.retakeAllowed,
    retakeDate: toIso(v.retakeDate),
    topicIds: v.topicIds,
    materials: v.materials,
    materialsAccessible: v.materialsAccessible,
    materialsDownloadable: v.materialsDownloadable,
    materialsRestrictedDuringExam: v.materialsRestrictedDuringExam,
    materialsAvailableFrom: toIso(v.materialsAvailableFrom),
    materialsAvailableUntil: toIso(v.materialsAvailableUntil),
    webcamMonitoring: v.webcamMonitoring,
    faceVerification: v.faceVerification,
    gazeTracking: v.gazeTracking,
    microphoneAnalysis: v.microphoneAnalysis,
    browserLockdown: v.browserLockdown,
    tabSwitchDetection: v.tabSwitchDetection,
    behavioralAnalysis: v.behavioralAnalysis,
    integrityConfig: v.integrityConfig,
    allowResume: v.allowResume,
    maxResumeCount: Number(v.maxResumeCount),
    resumeTimeWindow: Number(v.resumeTimeWindow),
    resumeAfterDisconnect: v.resumeAfterDisconnect,
    resumeAfterCrash: v.resumeAfterCrash,
    resumeAfterLogout: v.resumeAfterLogout,
    autoSubmitOnExpiry: v.autoSubmitOnExpiry,
    attemptResetAllowed: v.attemptResetAllowed,
    questions: v.questions.map(questionToPayload),
  };
}

/* ───────────────────────── checks & summary ───────────────────────── */

/** Mirrors the server's publish validation so problems show before publishing. */
export function questionIssues(q: QuestionForm): string[] {
  const out: string[] = [];
  const plain = q.text.replace(/[*_`#>-]/g, "").trim();
  if (plain.length < 5) out.push("Question text is too short.");
  if (!(Number(q.points) > 0)) out.push("Marks must be greater than 0.");
  const opts = q.options.map((o) => o.trim());
  switch (q.type) {
    case "multiple-choice":
    case "multiple-select":
      if (opts.length < 2) out.push("Add at least two options.");
      if (opts.some((o) => !o)) out.push("Options cannot be empty.");
      if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) out.push("Options must be unique.");
      if (q.correct.filter((c) => opts.includes(c.trim())).length === 0) out.push("Mark the correct option.");
      break;
    case "true-false":
      if (q.correct[0] !== "True" && q.correct[0] !== "False") out.push("Choose True or False.");
      break;
    case "fill-blank": {
      const n = countBlanks(q.text);
      if (n === 0) out.push("Add a blank with ___ (three underscores).");
      else if (q.blanks.length < n || q.blanks.slice(0, n).some((b) => splitAlternatives(b).length === 0))
        out.push(`Provide an accepted answer for each of the ${n} blank(s).`);
      break;
    }
    case "short-answer":
    case "descriptive":
      if (!q.modelAnswer.trim()) out.push("Add a model answer or rubric for grading.");
      break;
    case "coding":
      if (!q.language) out.push("Select a programming language.");
      if (!q.modelAnswer.trim() && q.testCases.length === 0) out.push("Add a reference solution or a test case.");
      break;
  }
  return out;
}

export interface Summary {
  totalQuestions: number;
  totalMarks: number;
  estimatedMinutes: number;
  byType: { type: string; label: string; count: number }[];
  byDifficulty: Record<"easy" | "medium" | "hard", number>;
}

export function summarize(questions: QuestionForm[]): Summary {
  const byType = new Map<string, number>();
  const byDifficulty = { easy: 0, medium: 0, hard: 0 };
  let marks = 0;
  let minutes = 0;
  for (const q of questions) {
    byType.set(q.type, (byType.get(q.type) ?? 0) + 1);
    byDifficulty[q.difficulty] += 1;
    marks += Number(q.points) || 0;
    const factor = q.difficulty === "hard" ? 1.5 : q.difficulty === "easy" ? 0.75 : 1;
    minutes += typeMeta(q.type).minutes * factor;
  }
  return {
    totalQuestions: questions.length,
    totalMarks: Math.round(marks * 100) / 100,
    estimatedMinutes: Math.ceil(minutes),
    byType: [...byType.entries()].map(([type, count]) => ({ type, label: typeMeta(type).label, count })),
    byDifficulty,
  };
}

export interface CheckItem {
  id: string;
  label: string;
  ok: boolean;
  required: boolean;
  detail?: string;
  /** DOM id of the section to scroll to. */
  target: string;
}

export function buildChecklist(v: BuilderForm): CheckItem[] {
  const s = summarize(v.questions);
  const badQuestions = v.questions
    .map((q, i) => ({ i, issues: questionIssues(q) }))
    .filter((x) => x.issues.length > 0);
  const scheduleOk = !(v.availabilityStart && v.availabilityEnd && new Date(v.availabilityEnd) <= new Date(v.availabilityStart));
  const notExpired = !(v.availabilityEnd && new Date(v.availabilityEnd).getTime() < Date.now());
  const marksOk = v.totalMarks == null || v.questions.length === 0 || Math.abs(s.totalMarks - Number(v.totalMarks)) < 0.001;
  const total = v.totalMarks ?? s.totalMarks;
  const passOk = v.passingMarks == null || Number(v.passingMarks) <= total;
  const highStakes = v.assessmentType === "midterm" || v.assessmentType === "final";
  return [
    { id: "basics", label: "Title and duration", ok: v.title.trim().length >= 3 && Number(v.duration) > 0, required: true, target: "section-info" },
    {
      id: "schedule",
      label: "Valid availability window",
      ok: scheduleOk && notExpired,
      required: true,
      detail: !scheduleOk ? "End must be after start." : !notExpired ? "The window has already ended." : undefined,
      target: "section-info",
    },
    { id: "course", label: "Linked to a course and syllabus", ok: !!v.courseId && !!v.syllabusId, required: false, target: "section-syllabus" },
    { id: "topics", label: "Syllabus topics selected", ok: v.topicIds.length > 0, required: false, target: "section-syllabus" },
    { id: "questions", label: "At least one question", ok: v.questions.length > 0, required: true, target: "section-questions" },
    {
      id: "complete",
      label: "All questions complete",
      ok: v.questions.length > 0 && badQuestions.length === 0,
      required: true,
      detail: badQuestions.length ? `Q${badQuestions.map((b) => b.i + 1).slice(0, 6).join(", Q")} need attention.` : undefined,
      target: "section-questions",
    },
    {
      id: "marks",
      label: "Marks match the total",
      ok: marksOk,
      required: true,
      detail: marksOk ? undefined : `Questions add up to ${s.totalMarks}; total is ${v.totalMarks}.`,
      target: "section-info",
    },
    { id: "passing", label: "Passing marks within total", ok: passOk, required: true, target: "section-info" },
    {
      id: "integrity",
      label: highStakes ? "Webcam monitoring for high-stakes exam" : "Integrity controls reviewed",
      ok: highStakes ? v.webcamMonitoring : true,
      required: false,
      target: "section-integrity",
    },
  ];
}
