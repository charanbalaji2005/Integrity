import { apiFetch } from "../../../utils/api-client";

/* ---------------------------------------------------------------- constants */

export const SUPPORT_CATEGORIES = [
  { key: "login_auth", label: "Login and Authentication" },
  { key: "examination", label: "Examination Issues" },
  { key: "assessment_quiz", label: "Assessment and Quiz Issues" },
  { key: "camera_microphone", label: "Camera and Microphone Problems" },
  { key: "ai_proctoring", label: "AI Proctoring Issues" },
  { key: "face_verification", label: "Face Verification" },
  { key: "browser_compat", label: "Browser Compatibility" },
  { key: "network", label: "Network and Connectivity" },
  { key: "syllabus_materials", label: "Syllabus and Learning Materials" },
  { key: "course_management", label: "Course Management" },
  { key: "results_grading", label: "Results and Grading" },
  { key: "account_profile", label: "Account and Profile" },
  { key: "technical", label: "Technical Issues" },
  { key: "other", label: "Other" },
] as const;

export const SUPPORT_MODULES = [
  { key: "student_dashboard", label: "Student Dashboard" },
  { key: "examination_portal", label: "Examination Portal" },
  { key: "assessment_builder", label: "Assessment Builder" },
  { key: "live_proctoring", label: "Live Proctoring" },
  { key: "materials_syllabus", label: "Materials and Syllabus" },
  { key: "results", label: "Results" },
  { key: "profile_account", label: "Profile and Account" },
  { key: "other", label: "Other" },
] as const;

export type Urgency = "low" | "medium" | "high" | "critical";
export type Priority = "P1" | "P2" | "P3" | "P4";
export type TicketStatus = "unassigned" | "pending_acceptance" | "in_progress" | "waiting_student" | "escalated" | "resolved";
export type Ownership = "AI" | "HUMAN";

export const URGENCY_OPTIONS: Array<{ key: Urgency; label: string; hint: string }> = [
  { key: "low", label: "Low", hint: "A question or minor issue — no deadline affected" },
  { key: "medium", label: "Medium", hint: "Something isn't working but I have a workaround" },
  { key: "high", label: "High", hint: "Blocking my work or an upcoming exam soon" },
  { key: "critical", label: "Critical", hint: "I can't start or continue an exam right now" },
];

export const LIMITS = {
  titleMin: 5,
  titleMax: 150,
  descMin: 10,
  descMax: 5000,
  ticketFiles: 5,
  messageFiles: 3,
  maxFileBytes: 10 * 1024 * 1024,
};

export const ACCEPTED_MIME = ["image/png", "image/jpeg", "image/webp", "application/pdf", "text/plain"];
export const ACCEPTED_EXT = ".png,.jpg,.jpeg,.webp,.pdf,.txt";

export const DEFAULT_SOURCE_PATH = "Student Portal › Support Center";

/* -------------------------------------------------------------------- shapes */

export interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
}

export interface SupportMessage {
  id: string;
  senderType: "student" | "ai" | "agent" | "system";
  senderName: string;
  content: string;
  messageType: "text" | "system" | "handoff";
  createdAt: string;
  attachments: Attachment[];
}

export interface TicketSummary {
  id: string;
  referenceNumber: string;
  title: string;
  category: string;
  categoryLabel: string;
  affectedModule: string;
  moduleLabel: string;
  priority: Priority;
  status: TicketStatus;
  ownershipType: Ownership;
  studentId: string;
  studentName: string;
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  waitingSince: string | null;
  blocksExam: boolean;
  rating: number | null;
}

export interface TicketDetail extends TicketSummary {
  description: string;
  subcategory: string | null;
  severity: string | null;
  urgency: Urgency;
  department: string;
  resolution: string | null;
  resolvedAt: string | null;
  reopenCount: number;
  canReopen: boolean;
  messages: SupportMessage[];
  attachments: Attachment[];
  ratingComment: string | null;
}

export interface KbArticle {
  id: string;
  title: string;
  category: string;
  summary: string;
  body: string;
  visibility: "public" | "internal";
  tags: string[];
  updatedAt: string;
}

/* ------------------------------------------------------------------- helpers */

export const STATUS_LABELS: Record<TicketStatus, string> = {
  unassigned: "Waiting for a support agent",
  pending_acceptance: "Agent assigned — joining shortly",
  in_progress: "With support agent",
  waiting_student: "Waiting for your reply",
  escalated: "Escalated to specialist team",
  resolved: "Resolved",
};

/** Friendly status label; AI-owned open tickets read as "AI assistant is helping". */
export function friendlyStatus(t: Pick<TicketSummary, "status" | "ownershipType">): string {
  if (t.status === "resolved") return STATUS_LABELS.resolved;
  if (t.ownershipType === "AI" && t.status !== "waiting_student" && t.status !== "escalated") return "AI assistant is helping";
  return STATUS_LABELS[t.status] ?? String(t.status || "").replace(/_/g, " ");
}

export function statusTone(t: Pick<TicketSummary, "status" | "ownershipType">): string {
  if (t.status === "resolved") return "bg-zinc-50 border-zinc-200 text-zinc-600";
  if (t.status === "waiting_student") return "bg-amber-50 border-amber-200 text-amber-800";
  if (t.status === "escalated") return "bg-violet-50 border-violet-200 text-violet-700";
  if (t.ownershipType === "AI") return "bg-sky-50 border-sky-200 text-sky-800";
  if (t.status === "in_progress") return "bg-emerald-50 border-emerald-200 text-emerald-700";
  return "bg-orange-50 border-orange-200 text-orange-800";
}

export const PRIORITY_LABELS: Record<Priority, string> = { P1: "Critical", P2: "High", P3: "Medium", P4: "Low" };

export function priorityTone(p: Priority): string {
  return p === "P1"
    ? "text-red-700 bg-red-50 border-red-200"
    : p === "P2"
    ? "text-orange-700 bg-orange-50 border-orange-200"
    : p === "P3"
    ? "text-[#676767] bg-white border-[#dedede]"
    : "text-zinc-500 bg-zinc-50 border-zinc-200";
}

export function categoryLabel(key: string): string {
  return SUPPORT_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

export function timeAgo(raw?: string | null): string {
  if (!raw) return "";
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return "";
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(raw).toLocaleDateString();
}

export function formatTime(raw?: string | null): string {
  if (!raw) return "";
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n)) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Validates a file against the contract; returns an error message or null. */
export function validateFile(f: File): string | null {
  const okType = ACCEPTED_MIME.includes(f.type) || /\.(png|jpe?g|webp|pdf|txt)$/i.test(f.name);
  if (!okType) return `${f.name}: only PNG, JPG, WEBP, PDF or TXT files are allowed.`;
  if (f.size > LIMITS.maxFileBytes) return `${f.name}: files must be 10 MB or smaller.`;
  return null;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Calls the support API and unwraps `{ success, message, data }`. Throws ApiError with the server message. */
export async function supportApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await apiFetch(endpoint, options);
  } catch {
    throw new ApiError("Can't reach the support service. Check your connection and try again.", 0);
  }
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok || (body && body.success === false)) {
    throw new ApiError(body?.message || `Request failed (${res.status})`, res.status);
  }
  return (body && "data" in body ? body.data : body) as T;
}

export function errMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/* --------------------------------------------------------------- class names */

export const card = "bg-white border border-[#dedede] rounded-2xl shadow-[0_4px_20px_rgba(128,128,128,0.04)]";
export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1917] focus-visible:ring-offset-2";
export const fieldCls =
  "w-full bg-[#f6f6f6] border border-[#dedede] rounded-xl px-3 text-base sm:text-[13px] text-[#1a1917] placeholder:text-[#a2a2a2] focus:outline-none focus:border-[#b2b2b2] focus:ring-1 focus:ring-[#b2b2b2]";
export const primaryBtn = `inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl bg-[#1a1917] text-white text-[13px] font-semibold hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${focusRing}`;
export const secondaryBtn = `inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl border border-[#dedede] bg-white text-[#1a1917] text-[13px] font-semibold hover:bg-[#f6f6f6] disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${focusRing}`;
export const labelCls = "block text-[12px] font-semibold text-[#1a1917] mb-1.5";
