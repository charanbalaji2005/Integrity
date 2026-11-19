import { apiFetch } from "../../utils/api-client";

/** Types + calls for /api/coding (see backend/src/features/coding). */

export type CodeLanguage = "c" | "cpp" | "java" | "python";
export type ExecMode = "compile" | "run" | "sample";
export type Verdict = "accepted" | "wrong_answer" | "compilation_error" | "runtime_error" | "time_limit" | "memory_limit" | "infra_error";

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

export interface Execution {
  id: string;
  mode: ExecMode;
  language: CodeLanguage;
  status: "queued" | "running" | "completed" | "failed";
  verdict: Verdict | null;
  stdin: string | null;
  stdout: string | null;
  stderr: string | null;
  compileOutput: string | null;
  exitCode: number | null;
  timeMs: number | null;
  memoryKb: number | null;
  sampleResults: SampleResult[] | null;
  infraError: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ExecutorHealth {
  configured: boolean;
  reachable: boolean;
  version: string | null;
  error: string | null;
  supported: { key: CodeLanguage; label: string; monaco: string; available: boolean }[];
}

export const isFinished = (e: Execution) => e.status === "completed" || e.status === "failed";

export const VERDICT_LABEL: Record<Verdict, string> = {
  accepted: "Success",
  wrong_answer: "Wrong answer",
  compilation_error: "Compilation error",
  runtime_error: "Runtime error",
  time_limit: "Time limit exceeded",
  memory_limit: "Memory limit exceeded",
  infra_error: "Execution service problem (not your code)",
};

export class CodingApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function codingRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(`/api/coding${path}`, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new CodingApiError(body?.message || `Request failed (${res.status})`, res.status);
  return body.data as T;
}

export const getHealth = () => codingRequest<ExecutorHealth>("/health");
export const getExecution = (id: string) => codingRequest<Execution>(`/executions/${id}`);

/** Polls an execution until it finishes (the socket `code:execution` event may arrive sooner). */
export async function waitForExecution(id: string, opts: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<Execution> {
  const deadline = Date.now() + (opts.timeoutMs ?? 150000);
  let delay = 500;
  for (;;) {
    if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const e = await getExecution(id);
    if (isFinished(e)) return e;
    if (Date.now() > deadline) throw new CodingApiError("The run is taking too long. Try again.", 504);
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(1500, delay + 200);
  }
}

export const formatMemory = (kb: number | null | undefined) => (kb == null ? "—" : kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`);
export const formatTime = (ms: number | null | undefined) => (ms == null ? "—" : `${ms} ms`);
