import type { CodeLanguage, Execution } from "./coding-api";

/** Shapes returned by GET /api/coding/attempts/:attemptId/questions/:questionId/workspace. */

export interface WorkspaceLanguage {
  key: CodeLanguage;
  label: string;
  monaco: string;
  fileName: string;
  starterCode: string;
}

export interface WorkspaceDraft {
  language: CodeLanguage;
  sourceCode: string;
  updatedAt: string;
  saveCount: number;
}

export interface WorkspaceSubmission {
  id: string;
  version: number;
  language: CodeLanguage;
  submittedAt: string;
  source: string;
  isLatest: boolean;
}

export interface CodingWorkspaceData {
  attemptId: string;
  questionId: string;
  editable: boolean;
  maxMarks: number;
  languages: WorkspaceLanguage[];
  activeLanguage: CodeLanguage | null;
  limits: { timeLimitMs: number; memoryLimitMb: number };
  sampleInput: string | null;
  sampleOutput: string | null;
  publicTests: { index: number; input: string; output: string }[];
  hiddenTestCount: number;
  drafts: WorkspaceDraft[];
  executions: Execution[];
  submissions: WorkspaceSubmission[];
}

export interface SubmitResult {
  id: string;
  version: number;
  language: CodeLanguage;
  submittedAt: string;
  created: boolean;
}

export const workspacePath = (attemptId: string, questionId: string) =>
  `/attempts/${encodeURIComponent(attemptId)}/questions/${encodeURIComponent(questionId)}`;

/* ---------- local mirror (survives a refresh before the server save lands) ---------- */

interface LocalDraft {
  code: string;
  /** epoch ms of the last local edit */
  updatedAt: number;
}

const localKey = (attemptId: string, questionId: string, lang: CodeLanguage) => `vigil-code:${attemptId}:${questionId}:${lang}`;

export function readLocalDraft(attemptId: string, questionId: string, lang: CodeLanguage): LocalDraft | null {
  try {
    const raw = localStorage.getItem(localKey(attemptId, questionId, lang));
    if (!raw) return null;
    const v = JSON.parse(raw) as LocalDraft;
    return typeof v?.code === "string" && typeof v?.updatedAt === "number" ? v : null;
  } catch {
    return null;
  }
}

export function writeLocalDraft(attemptId: string, questionId: string, lang: CodeLanguage, code: string): void {
  try {
    localStorage.setItem(localKey(attemptId, questionId, lang), JSON.stringify({ code, updatedAt: Date.now() } satisfies LocalDraft));
  } catch {
    /* storage full / blocked — the server draft still covers us */
  }
}

/* ---------- flush registry ---------- */

const flushers = new Set<() => Promise<void>>();

/** Registers a workspace's "save everything now" function; returns an unregister fn. */
export function registerCodingFlusher(fn: () => Promise<void>): () => void {
  flushers.add(fn);
  return () => flushers.delete(fn);
}

/**
 * Saves every mounted coding workspace's unsaved drafts to the server. The exam
 * view awaits this before the final submission so the newest code is what the
 * backend freezes. Never throws; bounded by `timeoutMs`.
 */
export async function flushCodingDrafts(timeoutMs = 4000): Promise<void> {
  if (flushers.size === 0) return;
  const all = Promise.allSettled([...flushers].map((f) => f()));
  await Promise.race([all, new Promise((r) => setTimeout(r, timeoutMs))]);
}
