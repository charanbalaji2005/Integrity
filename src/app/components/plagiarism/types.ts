import { apiFetch } from "../../utils/api-client";

/* ------------------------------------------------------------------ */
/* Backend contract                                                    */
/* ------------------------------------------------------------------ */

export type Band = "none" | "low" | "medium" | "high" | "very_high";
export type SourceType = "internet" | "publication" | "student_paper";
export type SourceKey = "repository" | "internet" | "publications";

export interface ReportSource {
  id: string;
  rank: number;
  type: SourceType;
  title: string;
  url: string | null;
  detail: string | null;
  percent: number;
  matchedWords: number;
}

export interface ReportMatch {
  id: string;
  sourceId: string;
  start: number;
  end: number;
  words: number;
  kind: "exact" | "near";
  sourceExcerpt: string;
}

export interface ExcludedRange {
  start: number;
  end: number;
  reason: "quote" | "bibliography";
}

export interface PlagiarismReport {
  id: string;
  title: string;
  filename: string | null;
  createdAt: string;
  similarity: number;
  band: Band;
  breakdown: { internet: number; publications: number; studentPapers: number };
  stats: {
    totalWords: number;
    checkedWords: number;
    matchedWords: number;
    excludedWords: number;
    exactWords: number;
    nearWords: number;
    sourcesCompared: number;
    processingMs: number;
  };
  settings: {
    excludeQuotes: boolean;
    excludeBibliography: boolean;
    minMatchWords: number;
    sources: string[];
    saveToRepository: boolean;
  };
  text: string;
  excluded: ExcludedRange[];
  sources: ReportSource[];
  matches: ReportMatch[];
  coverage: { checked: string[]; skipped: Array<{ source: string; reason: string }> };
  savedToRepository: boolean;
}

export interface ReportSummary {
  id: string;
  title: string;
  filename: string | null;
  similarity: number;
  band: Band;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Client-side options / input                                         */
/* ------------------------------------------------------------------ */

export interface CheckOptions {
  excludeQuotes: boolean;
  excludeBibliography: boolean;
  minMatchWords: number;
  sources: SourceKey[];
  saveToRepository: boolean;
}

export const ALL_SOURCES: SourceKey[] = ["repository", "internet", "publications"];

export const DEFAULT_OPTIONS: CheckOptions = {
  excludeQuotes: true,
  excludeBibliography: true,
  minMatchWords: 8,
  sources: [...ALL_SOURCES],
  saveToRepository: true,
};

export const MIN_MATCH_WORDS = 3;
export const MAX_MATCH_WORDS = 40;
export const MIN_TEXT_WORDS = 20;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_EXTENSIONS = ["txt", "pdf", "docx", "png", "jpg", "jpeg", "webp"];

export type CheckInput =
  | { kind: "file"; file: File; title: string }
  | { kind: "text"; text: string; title: string };

export function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

export function validateFile(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return "Unsupported file type. Use TXT, PDF, DOCX, PNG, JPG or WEBP.";
  }
  if (file.size > MAX_FILE_BYTES) return "File is larger than the 10 MB limit.";
  if (file.size === 0) return "This file is empty.";
  return null;
}

export function clampMinWords(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_OPTIONS.minMatchWords;
  return Math.min(MAX_MATCH_WORDS, Math.max(MIN_MATCH_WORDS, Math.round(n)));
}

/** Map a report's stored settings back onto editable options. */
export function optionsFromSettings(s: PlagiarismReport["settings"] | undefined): CheckOptions {
  if (!s) return { ...DEFAULT_OPTIONS };
  const sources = (s.sources || []).filter((x): x is SourceKey =>
    (ALL_SOURCES as string[]).includes(x)
  );
  return {
    excludeQuotes: !!s.excludeQuotes,
    excludeBibliography: !!s.excludeBibliography,
    minMatchWords: clampMinWords(s.minMatchWords),
    sources: sources.length ? sources : [...ALL_SOURCES],
    saveToRepository: !!s.saveToRepository,
  };
}

export function sameOptions(a: CheckOptions, b: CheckOptions): boolean {
  return (
    a.excludeQuotes === b.excludeQuotes &&
    a.excludeBibliography === b.excludeBibliography &&
    a.minMatchWords === b.minMatchWords &&
    [...a.sources].sort().join(",") === [...b.sources].sort().join(",")
  );
}

/* ------------------------------------------------------------------ */
/* Presentation constants                                              */
/* ------------------------------------------------------------------ */

export const BAND_INFO: Record<Band, { label: string; range: string; color: string; soft: string; text: string }> = {
  none: { label: "No matches", range: "0%", color: "#2563eb", soft: "#eff6ff", text: "#1e40af" },
  low: { label: "Low", range: "1–24%", color: "#16a34a", soft: "#f0fdf4", text: "#166534" },
  medium: { label: "Moderate", range: "25–49%", color: "#ca8a04", soft: "#fefce8", text: "#854d0e" },
  high: { label: "High", range: "50–74%", color: "#ea580c", soft: "#fff7ed", text: "#9a3412" },
  very_high: { label: "Very high", range: "75–100%", color: "#dc2626", soft: "#fef2f2", text: "#991b1b" },
};

export function bandFor(similarity: number): Band {
  if (similarity <= 0) return "none";
  if (similarity < 25) return "low";
  if (similarity < 50) return "medium";
  if (similarity < 75) return "high";
  return "very_high";
}

export function bandInfo(band: Band | undefined, similarity: number) {
  return BAND_INFO[band && BAND_INFO[band] ? band : bandFor(similarity)];
}

/** 12 distinguishable colours for sources (assigned by rank order). */
export const SOURCE_PALETTE = [
  "#e11d48", "#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0891b2",
  "#db2777", "#65a30d", "#ea580c", "#4f46e5", "#0d9488", "#a16207",
];

export function paletteColor(index: number): string {
  return SOURCE_PALETTE[((index % SOURCE_PALETTE.length) + SOURCE_PALETTE.length) % SOURCE_PALETTE.length];
}

/** Hex colour + alpha byte, e.g. withAlpha("#e11d48", 0.2). */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}

export const TYPE_LABEL: Record<SourceType, string> = {
  internet: "Internet",
  publication: "Publication",
  student_paper: "Student paper",
};

export const SOURCE_KEY_LABEL: Record<SourceKey, string> = {
  repository: "Student papers",
  internet: "Internet",
  publications: "Publications",
};

export const CATEGORY_COLORS = {
  internet: "#0ea5e9",
  publications: "#8b5cf6",
  studentPapers: "#f59e0b",
};

export function formatPercent(n: number): string {
  if (!Number.isFinite(n)) return "0%";
  const r = Math.round(n * 10) / 10;
  return `${Number.isInteger(r) ? r : r.toFixed(1)}%`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

async function readEnvelope<T>(res: Response, fallback: string): Promise<T> {
  let body: { success?: boolean; message?: string; data?: T } | null = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok || !body || body.success === false) {
    throw new Error(body?.message || `${fallback} (HTTP ${res.status})`);
  }
  return body.data as T;
}

export async function postCheck(
  input: CheckInput,
  options: CheckOptions,
  signal?: AbortSignal
): Promise<PlagiarismReport> {
  const fd = new FormData();
  if (input.kind === "file") fd.append("document", input.file);
  else fd.append("text", input.text);
  if (input.title.trim()) fd.append("title", input.title.trim());
  fd.append("excludeQuotes", String(options.excludeQuotes));
  fd.append("excludeBibliography", String(options.excludeBibliography));
  fd.append("minMatchWords", String(clampMinWords(options.minMatchWords)));
  fd.append("sources", options.sources.join(","));
  fd.append("saveToRepository", String(options.saveToRepository));
  const res = await apiFetch("/api/plagiarism/check", { method: "POST", body: fd, signal });
  return readEnvelope<PlagiarismReport>(res, "Similarity check failed");
}

export async function fetchReports(signal?: AbortSignal): Promise<ReportSummary[]> {
  const res = await apiFetch("/api/plagiarism/reports", { signal });
  const data = await readEnvelope<ReportSummary[]>(res, "Could not load report history");
  return Array.isArray(data) ? data : [];
}

export async function fetchReport(id: string, signal?: AbortSignal): Promise<PlagiarismReport> {
  const res = await apiFetch(`/api/plagiarism/reports/${encodeURIComponent(id)}`, { signal });
  return readEnvelope<PlagiarismReport>(res, "Could not load report");
}

/** Fill defaults so the viewer never crashes on a partial payload. */
export function normalizeReport(r: PlagiarismReport): PlagiarismReport {
  const sources = [...(r.sources || [])].sort((a, b) => a.rank - b.rank);
  return {
    ...r,
    text: r.text || "",
    excluded: r.excluded || [],
    sources,
    matches: [...(r.matches || [])].sort((a, b) => a.start - b.start),
    breakdown: r.breakdown || { internet: 0, publications: 0, studentPapers: 0 },
    stats: (() => {
      const s: Partial<PlagiarismReport["stats"]> = r.stats || {};
      return {
        totalWords: s.totalWords ?? 0,
        checkedWords: s.checkedWords ?? 0,
        matchedWords: s.matchedWords ?? 0,
        excludedWords: s.excludedWords ?? 0,
        exactWords: s.exactWords ?? 0,
        nearWords: s.nearWords ?? 0,
        sourcesCompared: s.sourcesCompared ?? 0,
        processingMs: s.processingMs ?? 0,
      };
    })(),
    coverage: { checked: r.coverage?.checked || [], skipped: r.coverage?.skipped || [] },
  };
}

/* ------------------------------------------------------------------ */
/* Document segmentation                                               */
/* ------------------------------------------------------------------ */

export interface Segment {
  key: string;
  start: number;
  end: number;
  match: ReportMatch | null;
  /** true for the first rendered piece of a match (where the rank badge goes) */
  matchStart: boolean;
  excluded: ExcludedRange["reason"] | null;
  /** true for the first rendered piece of an excluded range */
  excludedStart: boolean;
}

interface Span<T> {
  start: number;
  end: number;
  item: T;
}

/** Clamp to text bounds, sort, and clip overlaps so the list is strictly non-overlapping. */
function normalizeSpans<T extends { start: number; end: number }>(items: T[], len: number): Span<T>[] {
  const spans = items
    .map((item) => ({
      start: Math.max(0, Math.min(len, Math.floor(item.start))),
      end: Math.max(0, Math.min(len, Math.floor(item.end))),
      item,
    }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Span<T>[] = [];
  let cursor = 0;
  for (const s of spans) {
    const start = Math.max(s.start, cursor);
    if (s.end <= start) continue;
    out.push({ start, end: s.end, item: s.item });
    cursor = s.end;
  }
  return out;
}

export function buildSegments(text: string, matches: ReportMatch[], excluded: ExcludedRange[]): Segment[] {
  const len = text.length;
  const m = normalizeSpans(matches, len);
  const x = normalizeSpans(excluded, len);

  const cuts = new Set<number>([0, len]);
  for (const s of m) { cuts.add(s.start); cuts.add(s.end); }
  for (const s of x) { cuts.add(s.start); cuts.add(s.end); }
  const points = [...cuts].sort((a, b) => a - b);

  const segments: Segment[] = [];
  let mi = 0;
  let xi = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (b <= a) continue;
    while (mi < m.length && m[mi].end <= a) mi++;
    while (xi < x.length && x[xi].end <= a) xi++;
    const mSpan = mi < m.length && m[mi].start <= a ? m[mi] : null;
    const xSpan = xi < x.length && x[xi].start <= a ? x[xi] : null;
    // Matches take precedence over exclusions if the backend ever overlaps them.
    segments.push({
      key: `${a}-${b}`,
      start: a,
      end: b,
      match: mSpan ? mSpan.item : null,
      matchStart: !!mSpan && mSpan.start === a,
      excluded: !mSpan && xSpan ? xSpan.item.reason : null,
      excludedStart: !mSpan && !!xSpan && (xSpan.start === a || segments[segments.length - 1]?.match != null),
    });
  }
  return segments;
}
