import type { Execution } from "../../code/coding-api";

/** Shapes returned by /api/coding/flags and /api/coding/submissions/:id/review. */

export type FlagStatus = "pending" | "in_review" | "reviewed";
export type FlagReason =
  | "low_confidence"
  | "contradictory_evidence"
  | "no_test_cases"
  | "suspected_hardcoding"
  | "ambiguous_question"
  | "infrastructure_error"
  | "ai_unavailable"
  | "second_review";

export interface CourseRef {
  id: string;
  code: string;
  name: string;
}

export interface FlagRow {
  id: string;
  status: FlagStatus;
  reason: string;
  detail: string | null;
  createdAt: string;
  assignedToMe: boolean;
  submission: {
    id: string;
    version: number;
    language: string;
    languageLabel: string;
    status: string;
    maxMarks: number;
    suggestedMarks: number | null;
    finalMarks: number | null;
    submittedAt: string;
    confidence: number | null;
    testsPassed: number | null;
    testsTotal: number | null;
  };
  question: { id: string; number: number; title: string };
  student: { id: string; name: string; email: string; registrationNumber: string | null; section: string | null };
  assessment: { id: string; title: string; course: CourseRef | null };
}

export interface FlagList {
  counts: { pending: number; inReview: number; reviewed: number };
  assessments: { id: string; title: string; course: CourseRef | null }[];
  flags: FlagRow[];
}

export interface TestResult {
  index: number;
  hidden: boolean;
  input: string;
  expectedOutput: string;
  actualOutput: string | null;
  stderr: string | null;
  passed: boolean;
  verdict: string;
  timeMs: number | null;
  memoryKb: number | null;
}

export interface BreakdownRow {
  criterion: string;
  awarded: number;
  max: number;
  source: "tests" | "ai";
  reason?: string | null;
}

export interface Evaluation {
  id: string;
  runNumber: number;
  trigger: string;
  status: string;
  compileStatus: string | null;
  compileOutput: string | null;
  testsPassed: number | null;
  testsTotal: number | null;
  testMarks: number | null;
  aiMarks: number | null;
  suggestedMarks: number | null;
  maxMarks: number;
  breakdown: BreakdownRow[];
  feedback: string | null;
  confidence: number | null;
  generatedBy: "llm" | "tests_only" | string | null;
  flagReasons: { code: string; detail?: string | null }[];
  error: string | null;
  createdAt: string;
  completedAt: string | null;
  testResults: TestResult[];
}

export interface SubmissionVersion {
  id: string;
  version: number;
  language: string;
  sourceCode: string;
  submittedAt: string;
  source: string;
  isLatest: boolean;
  status: string;
}

export interface ReviewData {
  submission: {
    id: string;
    version: number;
    language: string;
    languageLabel: string;
    monaco: string;
    sourceCode: string;
    status: string;
    source: string;
    maxMarks: number;
    suggestedMarks: number | null;
    finalMarks: number | null;
    finalizedBy: string | null;
    submittedAt: string;
    isLatest: boolean;
  };
  student: { id: string; name: string; email: string; registrationNumber: string | null; section: string | null; department: string | null };
  assessment: { id: string; title: string; course: CourseRef | null; attemptSubmittedAt: string | null };
  question: {
    id: string;
    number: number;
    text: string;
    maxMarks: number;
    referenceSolution: string | null;
    testCases: { index: number; input: string; output: string; hidden: boolean }[];
    rubric: { criterion: string; marks: number; description?: string | null }[];
    testWeightPercent: number;
    outputMatch: string;
    limits: { timeLimitMs: number; memoryLimitMb: number };
    confidenceThreshold: number;
  };
  versions: SubmissionVersion[];
  previousSubmissions: number;
  executions: Execution[];
  evaluations: Evaluation[];
  flags: {
    id: string;
    reason: string;
    detail: string | null;
    status: FlagStatus;
    assignedFacultyId: string | null;
    openedById: string | null;
    openedAt: string | null;
    resolvedById: string | null;
    resolvedAt: string | null;
    createdAt: string;
  }[];
  reviews: {
    id: string;
    action: string;
    facultyName: string;
    marks: number | null;
    previousMarks: number | null;
    remark: string | null;
    explanation: string | null;
    createdAt: string;
  }[];
  pendingJob: boolean;
  faculty: { id: string; name: string; department: string | null }[];
}

export type ReviewAction = "approve_ai" | "override" | "reevaluate" | "request_second_review" | "mark_reviewed" | "remark";

export const REASON_LABEL: Record<FlagReason, string> = {
  low_confidence: "AI confidence below threshold",
  contradictory_evidence: "Tests and AI assessment disagree",
  no_test_cases: "Question has no test cases",
  suspected_hardcoding: "Possible hard-coded outputs",
  ambiguous_question: "Question may be ambiguous",
  infrastructure_error: "Execution service problem",
  ai_unavailable: "AI evaluator unavailable",
  second_review: "Second review requested",
};

export const reasonLabel = (code: string) => REASON_LABEL[code as FlagReason] ?? code.replace(/_/g, " ");

export const FLAG_STATUS: Record<FlagStatus, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "border-amber-200 bg-amber-50 text-amber-700" },
  in_review: { label: "In review", cls: "border-sky-200 bg-sky-50 text-sky-700" },
  reviewed: { label: "Reviewed", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
};

export const SUBMISSION_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Awaiting evaluation", cls: "border-zinc-200 bg-zinc-50 text-zinc-600" },
  EVALUATING: { label: "Evaluating", cls: "border-violet-200 bg-violet-50 text-violet-700" },
  EVALUATED: { label: "Evaluated", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  FLAGGED: { label: "Flagged", cls: "border-rose-200 bg-rose-50 text-rose-700" },
  IN_REVIEW: { label: "In review", cls: "border-sky-200 bg-sky-50 text-sky-700" },
  REVIEWED: { label: "Reviewed", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  FAILED: { label: "Evaluation failed", cls: "border-rose-200 bg-rose-50 text-rose-700" },
};

export const ACTION_LABEL: Record<string, string> = {
  open: "Opened for review",
  approve_ai: "Approved AI marks",
  override: "Overrode marks",
  reevaluate: "Requested re-evaluation",
  bulk_reevaluate: "Bulk re-evaluation",
  request_second_review: "Requested second review",
  mark_reviewed: "Marked reviewed",
  remark: "Added private remark",
};

export const CODE_LANGUAGES: { key: string; label: string }[] = [
  { key: "c", label: "C" },
  { key: "cpp", label: "C++" },
  { key: "java", label: "Java" },
  { key: "python", label: "Python" },
];

export const SOURCE_LABEL: Record<string, string> = {
  student: "Submitted by student",
  exam_submit: "Frozen at exam submission",
};

export const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)}%`);
export const fmtMarks = (v: number | null | undefined) => (v == null ? "—" : String(Math.round(v * 100) / 100));
export const fmtDateTime = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
