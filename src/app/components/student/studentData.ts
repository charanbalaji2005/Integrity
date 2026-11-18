import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../utils/api-client";

/**
 * Shared data helpers for the student dashboard tabs (AI Insights, History).
 * Everything here is derived from real API data:
 *  - GET /api/assessments                      (list + attempt summary, passed in as `dbAssessments`)
 *  - GET /api/assessments/attempts/:attemptId  (per-attempt details incl. violations)
 *  - GET /api/ai-proctoring/report/:attemptId  (proctoring timeline + summary)
 */

export interface StudentViolation {
  id: string;
  type: string;
  severity: string;
  description: string;
  riskScore?: number;
  timestamp: string;
}

export interface StudentAttemptDetail {
  id: string;
  status: string;
  score: number | null;
  integrityScore: number;
  riskLevel?: string | null;
  startedAt: string;
  submittedAt: string | null;
  warningCount?: number;
  proctoringStatus?: string;
  resumeCount?: number;
  evaluationSummary?: string | null;
  violations?: StudentViolation[];
  answers?: unknown[];
  assessment?: { questions?: unknown[] };
}

export interface ProctoringReport {
  attemptId: string;
  integrityScore: number;
  warningCount: number;
  status: string;
  summary: string | null;
  violationsCount: number;
  timeline: { id: string; event: string; timestamp: string; details: string | null }[];
}

/** Friendly labels + advice for every violation type the app records (AI proctor IDs and client-reported types). */
export const VIOLATION_INFO: Record<string, { label: string; tip: string }> = {
  BROWSER_UNFOCUSED: { label: "Tab switch / minimise", tip: "Keep the exam tab open and in front for the whole exam; close other apps before you start." },
  "tab-switch": { label: "Tab switch / minimise", tip: "Keep the exam tab open and in front for the whole exam; close other apps before you start." },
  WINDOW_BLUR: { label: "Window focus lost", tip: "Turn off pop-up notifications and avoid clicking outside the exam window." },
  "window-blur": { label: "Window focus lost", tip: "Turn off pop-up notifications and avoid clicking outside the exam window." },
  FULLSCREEN_EXITED: { label: "Full-screen exit", tip: "Stay in full screen until you submit. Avoid the Esc key and OS shortcuts that leave full screen." },
  "fullscreen-exit": { label: "Full-screen exit", tip: "Stay in full screen until you submit. Avoid the Esc key and OS shortcuts that leave full screen." },
  DEVTOOLS_OPENED: { label: "Developer tools opened", tip: "Don't open browser developer tools (F12 / Ctrl+Shift+I) during an exam." },
  "developer-tools": { label: "Developer tools opened", tip: "Don't open browser developer tools (F12 / Ctrl+Shift+I) during an exam." },
  devtools: { label: "Developer tools opened", tip: "Don't open browser developer tools (F12 / Ctrl+Shift+I) during an exam." },
  CLIPBOARD_ATTEMPT: { label: "Copy / paste / right-click", tip: "Copy, paste and right-click are blocked in exams; type your answers directly." },
  "clipboard-attempt": { label: "Copy / paste / right-click", tip: "Copy, paste and right-click are blocked in exams; type your answers directly." },
  SUSTAINED_HEAD_DEVIATION: { label: "Looking away", tip: "Keep your face towards the screen. Short glances at your keyboard or scratch paper are fine." },
  "gaze-away": { label: "Looking away", tip: "Keep your face towards the screen. Short glances at your keyboard or scratch paper are fine." },
  "looking-away": { label: "Looking away", tip: "Keep your face towards the screen. Short glances at your keyboard or scratch paper are fine." },
  ABSENT_CANDIDATE: { label: "Face not visible", tip: "Sit centred in the camera frame with your face well lit, and don't leave your seat." },
  "no-face": { label: "Face not visible", tip: "Sit centred in the camera frame with your face well lit, and don't leave your seat." },
  "face-missing": { label: "Face not visible", tip: "Sit centred in the camera frame with your face well lit, and don't leave your seat." },
  MULTIPLE_INDIVIDUALS: { label: "Multiple faces", tip: "Take the exam alone in a private room; make sure nobody walks behind you." },
  "multiple-faces": { label: "Multiple faces", tip: "Take the exam alone in a private room; make sure nobody walks behind you." },
  SUSPECTED_SPEECH: { label: "Possible speech", tip: "Avoid talking or reading questions aloud during the exam." },
  talking: { label: "Possible speech", tip: "Avoid talking or reading questions aloud during the exam." },
  PROLONGED_EYE_CLOSURE: { label: "Prolonged eye closure", tip: "Keep your eyes on the screen; take a short break before the exam if you're tired." },
  PROHIBITED_OBJECT: { label: "Prohibited object", tip: "Clear your desk: no phones, books, earphones or second screens within camera view." },
  LIVENESS_FAILURE: { label: "Liveness check failed", tip: "Use your real camera (no virtual cameras or photos) and keep good lighting on your face." },
  IDENTITY_MISMATCH: { label: "Identity mismatch", tip: "Only the enrolled student may take the exam. Re-calibrate in good light if your appearance changed." },
  CAMERA_DEGRADATION: { label: "Camera unusable", tip: "Clean your lens, improve lighting and make sure nothing covers the camera." },
  "camera-disconnected": { label: "Camera disconnected", tip: "Use a stable camera connection and close other apps that might grab the camera." },
  "camera-interrupted": { label: "Camera interrupted", tip: "Use a stable camera connection and close other apps that might grab the camera." },
  "microphone-disconnected": { label: "Microphone disconnected", tip: "Check your microphone connection and browser permission before starting." },
  "background-noise": { label: "Background noise", tip: "Choose a quiet room and silence your phone and other devices." },
  "internet-disconnect": { label: "Internet disconnected", tip: "Use a stable connection (wired or close to the router) and avoid heavy downloads during exams." },
  "slow-network": { label: "Slow network", tip: "Pause other downloads/streams on your network before you start the exam." },
};

export function violationLabel(type: string): string {
  return VIOLATION_INFO[type]?.label ?? type.replace(/[_-]+/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

/** Types that are connection / device events rather than conduct (reported for transparency, not misconduct). */
const NON_CONDUCT = new Set(["internet-reconnect"]);
export function isConductViolation(v: StudentViolation) {
  return !NON_CONDUCT.has(v.type);
}

// ───────────── per-assessment helpers ─────────────

export function hasAttempt(a: any) {
  return Boolean(a?.attemptId) && a.attemptStatus && a.attemptStatus !== "not_started";
}

export function isFinished(a: any) {
  return hasAttempt(a) && a.attemptStatus !== "started";
}

export function scorePercent(a: any): number | null {
  if (typeof a?.attemptScore !== "number" || !(a.totalPoints > 0)) return null;
  return Math.round(Math.min(100, (a.attemptScore / a.totalPoints) * 100));
}

export function integrityOf(a: any): number | null {
  return typeof a?.attemptIntegrity === "number" ? Math.round(a.attemptIntegrity) : null;
}

/** Best date we have for an attempt: submittedAt, else detail.startedAt. */
export function attemptDate(a: any, d?: StudentAttemptDetail): Date | null {
  const raw = a?.attemptSubmittedAt || d?.submittedAt || d?.startedAt;
  if (!raw) return null;
  const dt = new Date(raw);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function durationMinutes(d?: StudentAttemptDetail): number | null {
  if (!d?.startedAt || !d?.submittedAt) return null;
  const ms = new Date(d.submittedAt).getTime() - new Date(d.startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.max(1, Math.round(ms / 60000));
}

export function formatDate(dt: Date | null, withTime = false) {
  if (!dt) return "—";
  return dt.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export type StatusKey = "in_progress" | "submitted" | "review" | "graded";

export function statusOf(a: any): { key: StatusKey; label: string; className: string } {
  const s = String(a?.attemptStatus || "");
  if (s === "started") return { key: "in_progress", label: "In progress", className: "bg-amber-50 text-amber-700 border-amber-200" };
  if (s === "graded") return { key: "graded", label: "Graded", className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (s.toLowerCase().includes("review")) return { key: "review", label: "Under review", className: "bg-violet-50 text-violet-700 border-violet-200" };
  return { key: "submitted", label: "Submitted", className: "bg-zinc-50 text-zinc-700 border-zinc-200" };
}

/** Flagged = real proctoring signals: violations/warnings recorded, a non-normal proctoring state, high risk, or integrity below 75. */
export function isFlagged(a: any, d?: StudentAttemptDetail) {
  const integrity = integrityOf(a);
  if (integrity !== null && integrity < 75) return true;
  if (["high", "critical"].includes(String(a?.attemptRiskLevel || d?.riskLevel || "").toLowerCase())) return true;
  if (d) {
    if ((d.violations || []).some(isConductViolation)) return true;
    if ((d.warningCount ?? 0) > 0) return true;
    if (["PAUSED", "TERMINATED", "UNDER_REVIEW"].includes(String(d.proctoringStatus || ""))) return true;
  }
  return false;
}

// ───────────── data hooks ─────────────

const detailCache = new Map<string, StudentAttemptDetail>();
const MAX_DETAILS = 30;

/** Loads per-attempt details (violations, timing) for the given assessments' attempts. Cached across tab switches. */
export function useAttemptDetails(assessments: any[]) {
  const ids = useMemo(
    () => assessments.filter(hasAttempt).map((a) => String(a.attemptId)).slice(0, MAX_DETAILS),
    [assessments],
  );
  const key = ids.join(",");
  const [details, setDetails] = useState<Record<string, StudentAttemptDetail>>(() => {
    const init: Record<string, StudentAttemptDetail> = {};
    ids.forEach((id) => {
      const c = detailCache.get(id);
      if (c) init[id] = c;
    });
    return init;
  });
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (ids.length === 0) {
      setDetails({});
      return;
    }
    setLoading(true);
    Promise.all(
      ids.map(async (id) => {
        try {
          const res = await apiFetch(`/api/assessments/attempts/${id}`);
          if (!res.ok) return [id, null] as const;
          const json = await res.json();
          const d = json?.data as StudentAttemptDetail | undefined;
          if (d) detailCache.set(id, d);
          return [id, d ?? null] as const;
        } catch {
          return [id, null] as const;
        }
      }),
    ).then((rows) => {
      if (cancelled) return;
      const next: Record<string, StudentAttemptDetail> = {};
      let miss = 0;
      rows.forEach(([id, d]) => {
        if (d) next[id] = d;
        else {
          const c = detailCache.get(id);
          if (c) next[id] = c;
          else miss += 1;
        }
      });
      setDetails(next);
      setFailed(miss);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { details, loading, failed };
}

const reportCache = new Map<string, ProctoringReport>();

/** Lazily loads the AI-proctoring report (timeline + summary) for one attempt. */
export function useProctoringReport(attemptId: string | null) {
  const [report, setReport] = useState<ProctoringReport | null>(attemptId ? reportCache.get(attemptId) ?? null : null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!attemptId) {
      setReport(null);
      return;
    }
    let cancelled = false;
    setReport(reportCache.get(attemptId) ?? null);
    setError(false);
    setLoading(true);
    apiFetch(`/api/ai-proctoring/report/${attemptId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        if (cancelled) return;
        if (json?.data) {
          reportCache.set(attemptId, json.data);
          setReport(json.data);
        }
      })
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  return { report, loading, error };
}
