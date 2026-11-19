import {
  AlignLeft,
  Binary,
  CheckSquare,
  CircleDot,
  Code2,
  TextCursorInput,
  ToggleLeft,
  type LucideIcon,
} from "lucide-react";

export type QuestionType =
  | "multiple-choice"
  | "multiple-select"
  | "true-false"
  | "short-answer"
  | "descriptive"
  | "coding"
  | "fill-blank";

export const QUESTION_TYPES: {
  type: QuestionType;
  label: string;
  short: string;
  icon: LucideIcon;
  hint: string;
  objective: boolean;
  /** Rough minutes a student needs, used for the estimated completion time. */
  minutes: number;
}[] = [
  { type: "multiple-choice", label: "Multiple choice", short: "MCQ", icon: CircleDot, hint: "One correct option", objective: true, minutes: 1 },
  { type: "multiple-select", label: "Multiple select", short: "Multi", icon: CheckSquare, hint: "Several correct options", objective: true, minutes: 1.5 },
  { type: "true-false", label: "True / False", short: "T/F", icon: ToggleLeft, hint: "Binary statement", objective: true, minutes: 0.5 },
  { type: "fill-blank", label: "Fill in the blanks", short: "Blanks", icon: TextCursorInput, hint: "Use ___ for each blank", objective: true, minutes: 1.5 },
  { type: "short-answer", label: "Short answer", short: "Short", icon: AlignLeft, hint: "A sentence or two, AI-assisted grading", objective: false, minutes: 3 },
  { type: "descriptive", label: "Descriptive", short: "Essay", icon: AlignLeft, hint: "Long-form answer, AI-assisted grading", objective: false, minutes: 8 },
  { type: "coding", label: "Programming", short: "Code", icon: Code2, hint: "Code answer with test cases", objective: false, minutes: 15 },
];

export const QUESTION_TYPE_MAP = Object.fromEntries(QUESTION_TYPES.map((t) => [t.type, t])) as Record<
  QuestionType,
  (typeof QUESTION_TYPES)[number]
>;

export function typeMeta(type: string) {
  return (
    QUESTION_TYPE_MAP[type as QuestionType] ?? {
      type,
      label: type,
      short: type,
      icon: Binary,
      hint: "",
      objective: false,
      minutes: 3,
    }
  );
}

export const LANGUAGES = [
  { value: "python", label: "Python 3.8" },
  { value: "java", label: "Java (OpenJDK 13)" },
  { value: "cpp", label: "C++17 (G++ 9.2)" },
  { value: "c", label: "C (GCC 9.2)" },
  { value: "javascript", label: "JavaScript (Node)" },
  { value: "typescript", label: "TypeScript" },
  { value: "go", label: "Go" },
  { value: "sql", label: "SQL" },
];

export const BLANK_RE = /_{3,}/g;
export const countBlanks = (text: string) => (text.match(BLANK_RE) || []).length;

export function parseJson<T>(raw: unknown, fallback: T): T {
  if (raw == null || raw === "") return fallback;
  if (typeof raw !== "string") return raw as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export interface StudentQuestionConfig {
  imageIds?: string[];
  language?: string;
  starterCode?: string;
  sampleInput?: string;
  sampleOutput?: string;
  testCases?: { input: string; output: string; hidden?: boolean }[];
  timeLimitMs?: number;
  memoryLimitMb?: number;
}

/** True when a stored answer string actually contains an answer. */
export function isAnswered(value: string | undefined | null): boolean {
  if (value == null) return false;
  const v = value.trim();
  if (!v || v === "[]") return false;
  if (v.startsWith("[")) {
    const arr = parseJson<string[]>(v, []);
    return arr.some((x) => typeof x === "string" && x.trim().length > 0);
  }
  return true;
}
