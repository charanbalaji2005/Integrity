import React, { useEffect, useId, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  FileText,
  History,
  Loader2,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Type,
  Upload,
  X,
} from "lucide-react";
import { OptionsFields, card, focusRing, primaryBtn, secondaryBtn } from "./controls";
import {
  ALLOWED_EXTENSIONS,
  CheckInput,
  CheckOptions,
  MIN_TEXT_WORDS,
  ReportSummary,
  bandInfo,
  countWords,
  formatDate,
  formatPercent,
  validateFile,
} from "./types";

/* ------------------------------------------------------------------ */
/* Submit panel                                                        */
/* ------------------------------------------------------------------ */

interface SubmitPanelProps {
  options: CheckOptions;
  onOptionsChange: (o: CheckOptions) => void;
  onSubmit: (input: CheckInput) => void;
  error: string | null;
  onDismissError: () => void;
}

export function SubmitPanel({ options, onOptionsChange, onSubmit, error, onDismissError }: SubmitPanelProps) {
  const [tab, setTab] = useState<"file" | "text">("file");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const textId = useId();
  const optionsId = useId();

  const words = countWords(text);

  const pickFile = (f: File | undefined | null) => {
    if (!f) return;
    const err = validateFile(f);
    if (err) {
      setLocalError(err);
      return;
    }
    setLocalError(null);
    setFile(f);
  };

  const canSubmit =
    options.sources.length > 0 && (tab === "file" ? !!file : words >= MIN_TEXT_WORDS);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (options.sources.length === 0) {
      setLocalError("Select at least one source to compare against.");
      return;
    }
    if (tab === "file") {
      if (!file) return setLocalError("Choose a file to check.");
      const err = validateFile(file);
      if (err) return setLocalError(err);
      onSubmit({ kind: "file", file, title });
    } else {
      if (words < MIN_TEXT_WORDS) return setLocalError(`Paste at least ${MIN_TEXT_WORDS} words (currently ${words}).`);
      onSubmit({ kind: "text", text, title });
    }
    setLocalError(null);
  };

  const tabBtn = (key: "file" | "text", label: string, Icon: typeof Upload) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === key}
      aria-controls={`plag-tab-${key}`}
      onClick={() => {
        setTab(key);
        setLocalError(null);
      }}
      className={`flex-1 inline-flex items-center justify-center gap-2 min-h-11 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${focusRing} ${
        tab === key ? "bg-white text-[#1a1917] shadow-sm" : "text-[#676767] hover:text-[#1a1917]"
      }`}
    >
      <Icon className="size-4" aria-hidden="true" />
      {label}
    </button>
  );

  const shownError = localError || error;

  return (
    <form onSubmit={submit} className={`${card} p-5 sm:p-6 space-y-5`} noValidate>
      <div>
        <h3 className="text-base font-bold text-[#1a1917]">Submit a paper</h3>
        <p className="text-xs text-[#8a8a8a] mt-1">
          Your text is compared with student papers, internet sources and scholarly publications.
        </p>
      </div>

      <div role="tablist" aria-label="Submission method" className="flex gap-1 p-1 rounded-xl bg-[#f6f6f6] border border-[#dedede]/60">
        {tabBtn("file", "Upload file", Upload)}
        {tabBtn("text", "Paste text", Type)}
      </div>

      {tab === "file" ? (
        <div id="plag-tab-file" role="tabpanel">
          {file ? (
            <div className="flex items-center gap-3 p-4 rounded-xl border border-[#dedede] bg-[#f6f6f6]/60">
              <div className="size-10 rounded-lg bg-white border border-[#dedede] flex items-center justify-center shrink-0">
                <FileText className="size-5 text-[#676767]" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#1a1917] truncate">{file.name}</p>
                <p className="text-xs text-[#8a8a8a]">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
              </div>
              <button
                type="button"
                onClick={() => setFile(null)}
                aria-label={`Remove ${file.name}`}
                className={`size-11 inline-flex items-center justify-center rounded-xl text-[#8a8a8a] hover:text-rose-600 hover:bg-rose-50 cursor-pointer ${focusRing}`}
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <div
              onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                pickFile(e.dataTransfer.files?.[0]);
              }}
              className={`rounded-xl border-2 border-dashed transition-colors ${
                dragActive ? "border-[#1a1917] bg-[#f6f6f6]" : "border-[#dedede] hover:bg-[#fafafa]"
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                id="plag-file-input"
                className="sr-only"
                accept={ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",")}
                onChange={(e) => {
                  pickFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <label
                htmlFor="plag-file-input"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    inputRef.current?.click();
                  }
                }}
                className={`flex flex-col items-center gap-3 p-8 text-center cursor-pointer rounded-xl ${focusRing}`}
              >
                <span className="size-12 rounded-full bg-[#f6f6f6] border border-[#dedede] flex items-center justify-center">
                  <Upload className="size-5 text-[#676767]" aria-hidden="true" />
                </span>
                <span className="text-sm font-semibold text-[#1a1917]">
                  Drag & drop a file or <span className="underline underline-offset-2">browse</span>
                </span>
                <span className="text-xs text-[#8a8a8a]">PDF, DOCX, TXT, PNG, JPG, WEBP · max 10 MB</span>
              </label>
            </div>
          )}
        </div>
      ) : (
        <div id="plag-tab-text" role="tabpanel" className="space-y-1.5">
          <label htmlFor={textId} className="text-sm font-medium text-[#1a1917]">Paste your text</label>
          <textarea
            id={textId}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={9}
            placeholder="Paste the full text of your paper here…"
            className={`w-full rounded-xl border border-[#dedede] p-3 text-sm leading-relaxed text-[#1a1917] placeholder:text-[#b2b2b2] resize-y bg-white ${focusRing}`}
          />
          <p className={`text-xs ${words > 0 && words < MIN_TEXT_WORDS ? "text-amber-700" : "text-[#8a8a8a]"}`}>
            {words} word{words === 1 ? "" : "s"}
            {words < MIN_TEXT_WORDS ? ` · at least ${MIN_TEXT_WORDS} required` : ""}
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor={titleId} className="text-sm font-medium text-[#1a1917]">
          Title <span className="font-normal text-[#8a8a8a]">(optional)</span>
        </label>
        <input
          id={titleId}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          placeholder="e.g. Essay 2 – Climate policy"
          className={`w-full min-h-11 rounded-xl border border-[#dedede] px-3 text-sm text-[#1a1917] placeholder:text-[#b2b2b2] bg-white ${focusRing}`}
        />
      </div>

      <div className="rounded-xl border border-[#dedede]">
        <button
          type="button"
          aria-expanded={showOptions}
          aria-controls={optionsId}
          onClick={() => setShowOptions((v) => !v)}
          className={`w-full min-h-11 flex items-center justify-between gap-2 px-4 py-2 text-sm font-semibold text-[#1a1917] rounded-xl cursor-pointer ${focusRing}`}
        >
          <span className="inline-flex items-center gap-2">
            <SlidersHorizontal className="size-4 text-[#676767]" aria-hidden="true" />
            Options
          </span>
          <span className="inline-flex items-center gap-2 text-xs font-normal text-[#8a8a8a]">
            <span className="hidden sm:inline">
              {options.excludeQuotes ? "Quotes excluded" : "Quotes included"} · ≥{options.minMatchWords} words ·{" "}
              {options.sources.length}/3 sources
            </span>
            <ChevronDown className={`size-4 transition-transform ${showOptions ? "rotate-180" : ""}`} aria-hidden="true" />
          </span>
        </button>
        {showOptions && (
          <div id={optionsId} className="px-4 pb-4 pt-1">
            <OptionsFields value={options} onChange={onOptionsChange} />
          </div>
        )}
      </div>

      {shownError && (
        <div role="alert" className="flex items-start gap-2 p-3 rounded-xl border border-rose-200 bg-rose-50 text-sm text-rose-700">
          <AlertTriangle className="size-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span className="flex-1">{shownError}</span>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => {
              setLocalError(null);
              onDismissError();
            }}
            className={`-m-2 size-11 inline-flex items-center justify-center rounded-lg hover:bg-rose-100 cursor-pointer ${focusRing}`}
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      <button type="submit" disabled={!canSubmit} className={`${primaryBtn} w-full`}>
        <Search className="size-4" aria-hidden="true" />
        Check similarity
      </button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Report history                                                      */
/* ------------------------------------------------------------------ */

interface HistoryListProps {
  items: ReportSummary[];
  loading: boolean;
  error: string | null;
  openingId: string | null;
  activeId: string | null;
  onRefresh: () => void;
  onOpen: (id: string) => void;
}

export function HistoryList({ items, loading, error, openingId, activeId, onRefresh, onOpen }: HistoryListProps) {
  return (
    <section className={`${card} p-5`} aria-labelledby="plag-history-heading">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 id="plag-history-heading" className="text-sm font-bold text-[#1a1917] flex items-center gap-2">
          <History className="size-4 text-[#8a8a8a]" aria-hidden="true" />
          Your reports
        </h3>
        <button
          type="button"
          onClick={onRefresh}
          aria-label="Refresh report history"
          className={`size-11 -mr-2 inline-flex items-center justify-center rounded-xl text-[#676767] hover:bg-[#f6f6f6] cursor-pointer ${focusRing}`}
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error ? (
        <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-xs text-rose-700 space-y-2" role="alert">
          <p>{error}</p>
          <button type="button" onClick={onRefresh} className={`${secondaryBtn} w-full`}>Try again</button>
        </div>
      ) : loading && items.length === 0 ? (
        <ul className="space-y-2" aria-label="Loading reports">
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-14 rounded-xl bg-[#f6f6f6] animate-pulse" />
          ))}
        </ul>
      ) : items.length === 0 ? (
        <p className="py-8 px-4 text-center text-xs text-[#8a8a8a] border border-dashed border-[#dedede] rounded-xl">
          No reports yet. Your similarity reports will appear here.
        </p>
      ) : (
        <ul className="space-y-2 max-h-[28rem] overflow-y-auto -mx-1 px-1">
          {items.map((h) => {
            const info = bandInfo(h.band, h.similarity);
            const opening = openingId === h.id;
            return (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => onOpen(h.id)}
                  disabled={!!openingId}
                  aria-current={activeId === h.id ? "true" : undefined}
                  className={`w-full min-h-14 flex items-center gap-3 p-3 rounded-xl border text-left transition-colors cursor-pointer disabled:cursor-wait ${focusRing} ${
                    activeId === h.id ? "border-[#1a1917] bg-[#f6f6f6]" : "border-[#dedede]/70 hover:bg-[#f6f6f6]"
                  }`}
                >
                  <span
                    className="shrink-0 min-w-12 h-8 px-2 rounded-lg inline-flex items-center justify-center text-xs font-bold text-white"
                    style={{ backgroundColor: info.color }}
                    aria-label={`${formatPercent(h.similarity)} similarity, ${info.label}`}
                  >
                    {Math.round(h.similarity)}%
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-[#1a1917] truncate">{h.title || h.filename || "Untitled"}</span>
                    <span className="block text-xs text-[#8a8a8a] truncate">
                      {h.filename && h.title && h.filename !== h.title ? `${h.filename} · ` : ""}
                      {formatDate(h.createdAt)}
                    </span>
                  </span>
                  {opening && <Loader2 className="size-4 animate-spin text-[#8a8a8a] shrink-0" aria-label="Opening" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Staged progress                                                     */
/* ------------------------------------------------------------------ */

const STAGES = [
  { label: "Extracting text", at: 0 },
  { label: "Fingerprinting", at: 2 },
  { label: "Searching internet & publications", at: 5 },
  { label: "Comparing with repository", at: 18 },
  { label: "Building report", at: 26 },
];

export function ProgressCard({ title, onCancel }: { title: string; onCancel: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const t = window.setInterval(() => setElapsed((Date.now() - started) / 1000), 250);
    return () => window.clearInterval(t);
  }, []);

  let current = 0;
  STAGES.forEach((s, i) => {
    if (elapsed >= s.at) current = i;
  });
  // Asymptotic progress so the bar never "finishes" before the server does.
  const pct = Math.min(95, 100 * (1 - Math.exp(-elapsed / 14)));

  return (
    <div className={`${card} p-6 sm:p-8 max-w-xl mx-auto`} role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <Loader2 className="size-6 animate-spin text-[#1a1917]" aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="text-base font-bold text-[#1a1917]">Checking similarity…</h3>
          <p className="text-xs text-[#8a8a8a] truncate">{title}</p>
        </div>
      </div>

      <div className="mt-5 h-2 rounded-full bg-[#f0f0f0] overflow-hidden" aria-hidden="true">
        <div className="h-full bg-[#1a1917] rounded-full transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>

      <ol className="mt-5 space-y-2.5">
        {STAGES.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={s.label} className="flex items-center gap-3 text-sm">
              <span
                className={`size-6 rounded-full inline-flex items-center justify-center shrink-0 border ${
                  done ? "bg-[#1a1917] border-[#1a1917] text-white" : active ? "border-[#1a1917]" : "border-[#dedede]"
                }`}
                aria-hidden="true"
              >
                {done ? <Check className="size-3.5" /> : active ? <Loader2 className="size-3.5 animate-spin" /> : null}
              </span>
              <span className={done || active ? "text-[#1a1917] font-medium" : "text-[#8a8a8a]"}>
                {s.label}
                {active && <span className="sr-only"> (in progress)</span>}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-6 flex items-center justify-between gap-3">
        <span className="text-xs text-[#8a8a8a] tabular-nums">
          {Math.floor(elapsed)}s elapsed · usually 5–40 s
        </span>
        <button type="button" onClick={onCancel} className={secondaryBtn}>
          <X className="size-4" aria-hidden="true" />
          Cancel
        </button>
      </div>
    </div>
  );
}
