import { API_BASE_URL, apiFetch } from "../../../utils/api-client";

export type AgentId = "question" | "integrity" | "analytics" | "grading" | "document" | "academic";

export interface Step {
  id: string;
  label: string;
  state: "running" | "done" | "error";
  detail?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  agent?: AgentId | null;
  steps?: Step[];
  sources?: string[];
  model?: string;
  attachments?: { id: string; fileName: string }[];
  streaming?: boolean;
  createdAt?: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  assessmentId: string | null;
  updatedAt: string;
  _count: { messages: number };
}

export interface AssessmentOption {
  id: string;
  title: string;
  status: string;
  course: string | null;
  attempts: number;
}

export interface Attachment {
  id: string;
  fileName: string;
  kind: string;
  sizeBytes: number;
  truncated: boolean;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(`/api/faculty-assistant${path}`, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message || `Request failed (${res.status})`);
  return body.data as T;
}

export const vigilApi = {
  status: () => req<{ eligible: boolean; reason?: string }>("/status"),
  assessments: () => req<AssessmentOption[]>("/assessments"),
  list: (q?: string) => req<ConversationSummary[]>(`/conversations${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  create: (assessmentId?: string | null) =>
    req<ConversationSummary>("/conversations", { method: "POST", body: JSON.stringify({ assessmentId: assessmentId ?? null }) }),
  get: (id: string) =>
    req<{
      id: string;
      title: string;
      assessmentId: string | null;
      messages: { id: string; role: "user" | "assistant"; content: string; agent: AgentId | null; meta: string | null; createdAt: string }[];
      attachments: Attachment[];
    }>(`/conversations/${id}`),
  update: (id: string, patch: { title?: string; assessmentId?: string | null }) =>
    req(`/conversations/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  remove: (id: string) => req(`/conversations/${id}`, { method: "DELETE" }),
};

/** Uploads one document (with progress) and returns its processed attachment record. */
export function uploadAttachment(file: File, conversationId: string | null, onProgress: (pct: number) => void) {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<Attachment>((resolve, reject) => {
    xhr.open("POST", `${API_BASE_URL}/api/faculty-assistant/attachments`);
    xhr.withCredentials = true;
    const token = localStorage.getItem("auth_token");
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 90));
    xhr.onload = () => {
      let body: any = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body.data);
      else reject(new Error(body?.message || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Network error while uploading."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    const fd = new FormData();
    fd.append("file", file);
    if (conversationId) fd.append("conversationId", conversationId);
    xhr.send(fd);
  });
  return { promise, abort: () => xhr.abort() };
}

export interface StreamHandlers {
  onStatus: (s: Step) => void;
  onAgent: (a: { id: AgentId; name: string; routedBy: string }) => void;
  onDelta: (text: string) => void;
  onDone: (d: { messageId: string; agent: AgentId | null; suggestions: string[]; title?: string }) => void;
  onError: (message: string) => void;
}

/** POSTs and reads the server-sent event stream of one assistant turn. */
export async function streamTurn(path: string, body: unknown, handlers: StreamHandlers, signal: AbortSignal) {
  const token = localStorage.getItem("auth_token");
  const res = await fetch(`${API_BASE_URL}/api/faculty-assistant${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
    signal,
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    handlers.onError(data?.message || `Request failed (${res.status})`);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const event = frame.match(/^event: (.+)$/m)?.[1];
      const data = frame.match(/^data: (.+)$/m)?.[1];
      if (!event || !data) continue;
      let payload: any;
      try {
        payload = JSON.parse(data);
      } catch {
        continue;
      }
      if (event === "status") handlers.onStatus(payload);
      else if (event === "agent") handlers.onAgent(payload);
      else if (event === "delta") handlers.onDelta(payload.text);
      else if (event === "done") handlers.onDone(payload);
      else if (event === "error") handlers.onError(payload.message);
    }
  }
}
