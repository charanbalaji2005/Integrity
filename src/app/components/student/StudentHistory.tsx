import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  History as HistoryIcon,
  Search,
  ChevronDown,
  Clock,
  CalendarDays,
  ShieldAlert,
  ShieldCheck,
  Loader2,
  FileText,
  RotateCcw,
  AlertTriangle,
  Award,
  X,
} from "lucide-react";
import {
  violationLabel,
  isConductViolation,
  hasAttempt,
  scorePercent,
  integrityOf,
  attemptDate,
  durationMinutes,
  formatDate,
  statusOf,
  isFlagged,
  useAttemptDetails,
  useProctoringReport,
  type StudentAttemptDetail,
} from "./studentData";

interface StudentHistoryProps {
  dbAssessments: any[];
  onNavigate: (tab: string) => void;
  onDownloadCertificate?: (assessment: any) => void;
}

type FilterKey = "all" | "completed" | "in_progress" | "flagged";
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "completed", label: "Completed" },
  { key: "in_progress", label: "In progress" },
  { key: "flagged", label: "Flagged" },
];

const card = "bg-white border border-[#dedede] rounded-2xl shadow-[0_4px_20px_rgba(128,128,128,0.04)]";
const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1917] focus-visible:ring-offset-2";

function integrityClass(n: number | null) {
  if (n === null) return "text-[#8a8a8a]";
  return n >= 90 ? "text-emerald-700" : n >= 75 ? "text-amber-700" : "text-red-700";
}

function severityClass(s: string) {
  const v = s.toLowerCase();
  return v === "high" || v === "critical"
    ? "bg-red-50 text-red-700 border-red-200"
    : v === "medium"
    ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-zinc-50 text-zinc-600 border-zinc-200";
}

function AttemptDetailPanel({ a, d, onDownloadCertificate }: { a: any; d?: StudentAttemptDetail; onDownloadCertificate?: (a: any) => void }) {
  const { report, loading, error } = useProctoringReport(a.attemptId);
  const violations = [...(d?.violations || [])].sort((x, y) => new Date(x.timestamp).getTime() - new Date(y.timestamp).getTime());
  const conduct = violations.filter(isConductViolation);
  const questions = d?.assessment?.questions?.length ?? a.questionsCount ?? null;
  const answered = d?.answers?.length ?? null;
  const facts: { label: string; value: string }[] = [
    { label: "Started", value: d?.startedAt ? formatDate(new Date(d.startedAt), true) : "—" },
    { label: "Submitted", value: d?.submittedAt || a.attemptSubmittedAt ? formatDate(new Date(d?.submittedAt || a.attemptSubmittedAt), true) : "Not yet" },
    { label: "Answered", value: answered !== null && questions ? `${answered} / ${questions}` : questions ? `${questions} questions` : "—" },
    { label: "Warnings issued", value: d ? String(d.warningCount ?? 0) : "—" },
    { label: "Resumed", value: d ? `${d.resumeCount ?? 0}×` : "—" },
    { label: "Proctoring state", value: d?.proctoringStatus ? d.proctoringStatus.replace(/_/g, " ").toLowerCase() : "—" },
  ];
  const timeline = report?.timeline || [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 sm:p-5 bg-[#fafafa] border-t border-[#dedede]/70">
      <div className="space-y-4">
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {facts.map((f) => (
            <div key={f.label} className="bg-white border border-[#dedede]/70 rounded-xl p-3">
              <dt className="text-[10.5px] font-bold uppercase tracking-wider text-[#8a8a8a]">{f.label}</dt>
              <dd className="mt-1 text-[13px] font-semibold text-[#1a1917] capitalize">{f.value}</dd>
            </div>
          ))}
        </dl>
        {(report?.summary || d?.evaluationSummary) && (
          <div className="bg-white border border-[#dedede]/70 rounded-xl p-3 space-y-2">
            {report?.summary && (
              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-[#8a8a8a]">Proctoring summary</p>
                <p className="mt-1 text-xs text-[#1a1917] leading-relaxed whitespace-pre-line">{report.summary}</p>
              </div>
            )}
            {d?.evaluationSummary && (
              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-[#8a8a8a]">Evaluation summary</p>
                <p className="mt-1 text-xs text-[#1a1917] leading-relaxed whitespace-pre-line">{d.evaluationSummary}</p>
              </div>
            )}
          </div>
        )}
        {onDownloadCertificate && a.attemptStatus !== "started" && (
          <button
            type="button"
            onClick={() => onDownloadCertificate(a)}
            className={`inline-flex items-center gap-2 min-h-11 px-4 rounded-xl border border-[#dedede] bg-white text-xs font-semibold text-[#1a1917] hover:bg-[#f6f6f6] transition cursor-pointer ${focusRing}`}
          >
            <Award className="size-4" aria-hidden /> Download certificate
          </button>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <h4 className="text-xs font-bold text-[#1a1917] flex items-center gap-1.5">
            <ShieldAlert className="size-3.5" aria-hidden /> Flagged events ({d ? conduct.length : "—"})
          </h4>
          {!d ? (
            <p className="mt-2 text-xs text-[#8a8a8a]">Event details unavailable for this attempt.</p>
          ) : conduct.length === 0 ? (
            <p className="mt-2 text-xs text-emerald-700 flex items-center gap-1.5">
              <ShieldCheck className="size-3.5" aria-hidden /> No proctoring flags were recorded.
            </p>
          ) : (
            <ol className="mt-2 space-y-2 max-h-64 overflow-y-auto pr-1">
              {conduct.map((v) => (
                <li key={v.id} className="bg-white border border-[#dedede]/70 rounded-xl p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#1a1917]">{violationLabel(v.type)}</span>
                    <span className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border capitalize ${severityClass(v.severity || "low")}`}>{v.severity || "low"}</span>
                      <time className="text-[10.5px] text-[#8a8a8a]" dateTime={v.timestamp}>
                        {new Date(v.timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </time>
                    </span>
                  </div>
                  {v.description && <p className="mt-1 text-[11.5px] text-[#676767] leading-relaxed">{v.description}</p>}
                </li>
              ))}
            </ol>
          )}
        </div>

        <div>
          <h4 className="text-xs font-bold text-[#1a1917] flex items-center gap-1.5">
            <Clock className="size-3.5" aria-hidden /> Proctoring timeline
          </h4>
          {loading && !report ? (
            <p className="mt-2 text-xs text-[#8a8a8a] flex items-center gap-1.5">
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> Loading timeline…
            </p>
          ) : error && !report ? (
            <p className="mt-2 text-xs text-[#8a8a8a]">Timeline couldn't be loaded.</p>
          ) : timeline.length === 0 ? (
            <p className="mt-2 text-xs text-[#8a8a8a]">No timeline events were recorded for this attempt.</p>
          ) : (
            <ol className="mt-2 relative border-l border-[#dedede] ml-1.5 space-y-3 max-h-64 overflow-y-auto pr-1">
              {timeline.map((t) => (
                <li key={t.id} className="pl-4 relative">
                  <span className="absolute -left-[5px] top-1.5 size-2.5 rounded-full bg-white border-2 border-[#1a1917]" aria-hidden />
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-xs font-semibold text-[#1a1917] capitalize">{t.event.toLowerCase()}</span>
                    <time className="text-[10.5px] text-[#8a8a8a]" dateTime={t.timestamp}>
                      {new Date(t.timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </time>
                  </div>
                  {t.details && <p className="text-[11.5px] text-[#676767] mt-0.5 leading-relaxed break-words">{t.details}</p>}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

export function StudentHistory({ dbAssessments, onNavigate, onDownloadCertificate }: StudentHistoryProps) {
  const { details, loading } = useAttemptDetails(dbAssessments);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      dbAssessments
        .filter(hasAttempt)
        .map((a) => {
          const d = details[a.attemptId] as StudentAttemptDetail | undefined;
          return { a, d, date: attemptDate(a, d), status: statusOf(a), flagged: isFlagged(a, d), duration: durationMinutes(d) };
        })
        .sort((x, y) => (y.date?.getTime() ?? 0) - (x.date?.getTime() ?? 0)),
    [dbAssessments, details],
  );

  const counts: Record<FilterKey, number> = {
    all: rows.length,
    completed: rows.filter((r) => r.status.key !== "in_progress").length,
    in_progress: rows.filter((r) => r.status.key === "in_progress").length,
    flagged: rows.filter((r) => r.flagged).length,
  };

  const q = query.trim().toLowerCase();
  const visible = rows.filter((r) => {
    if (filter === "completed" && r.status.key === "in_progress") return false;
    if (filter === "in_progress" && r.status.key !== "in_progress") return false;
    if (filter === "flagged" && !r.flagged) return false;
    if (q && !`${r.a.title} ${r.a.facultyName || ""}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const toggle = (id: string) => setExpanded((cur) => (cur === id ? null : id));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <HistoryIcon className="size-5" aria-hidden /> History
        </h2>
        <p className="text-xs text-[#8a8a8a] mt-1">Every assessment attempt you've made, with scores, integrity and recorded proctoring events.</p>
      </div>

      {rows.length === 0 ? (
        <div className={`${card} p-8 sm:p-12 text-center`}>
          <div className="mx-auto size-12 rounded-2xl bg-[#f6f6f6] flex items-center justify-center">
            <FileText className="size-5 text-[#676767]" aria-hidden />
          </div>
          <h3 className="mt-4 text-base font-bold text-[#1a1917]">No attempts yet</h3>
          <p className="mt-1.5 text-sm text-[#676767] max-w-md mx-auto">When you start or submit an assessment it will appear here with its score, integrity index and timeline.</p>
          <button
            type="button"
            onClick={() => onNavigate("Live Sessions")}
            className={`mt-5 min-h-11 px-5 rounded-xl bg-[#1a1917] text-white text-sm font-semibold hover:bg-black transition cursor-pointer ${focusRing}`}
          >
            View available exams
          </button>
        </div>
      ) : (
        <div className={card}>
          {/* Controls */}
          <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center gap-3 border-b border-[#dedede]/70">
            <div role="group" aria-label="Filter attempts" className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1 lg:pb-0">
              {FILTERS.map((f) => {
                const active = filter === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFilter(f.key)}
                    className={`shrink-0 min-h-11 sm:min-h-9 px-3.5 rounded-full border text-xs font-semibold transition cursor-pointer ${focusRing} ${
                      active ? "bg-[#1a1917] text-white border-[#1a1917]" : "bg-white text-[#676767] border-[#dedede] hover:bg-[#f6f6f6] hover:text-[#1a1917]"
                    }`}
                  >
                    {f.label}
                    <span className={`ml-1.5 ${active ? "text-white/70" : "text-[#a2a2a2]"}`}>{counts[f.key]}</span>
                  </button>
                );
              })}
            </div>
            <div className="relative lg:ml-auto lg:w-72">
              <label htmlFor="history-search" className="sr-only">Search attempts</label>
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-[#8a8a8a] pointer-events-none" aria-hidden />
              <input
                id="history-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title or faculty"
                className="w-full min-h-11 bg-[#f6f6f6] border border-[#dedede]/60 rounded-xl pl-10 pr-9 text-base sm:text-[13px] placeholder:text-[#a2a2a2] text-[#1a1917] focus:outline-none focus:border-[#b2b2b2] focus:ring-1 focus:ring-[#b2b2b2]"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className={`absolute right-1 top-1/2 -translate-y-1/2 size-9 flex items-center justify-center rounded-lg text-[#8a8a8a] hover:text-[#1a1917] cursor-pointer ${focusRing}`}>
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </div>
          </div>

          {loading && Object.keys(details).length === 0 && (
            <div className="px-5 py-2 text-[11.5px] text-[#8a8a8a] flex items-center gap-1.5 border-b border-[#dedede]/50">
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> Loading attempt details…
            </div>
          )}

          {visible.length === 0 ? (
            <div className="p-10 text-center text-sm text-[#8a8a8a]">
              No attempts match {q ? `"${query}"` : "this filter"}.
              <button type="button" onClick={() => { setFilter("all"); setQuery(""); }} className={`ml-1 font-semibold text-[#1a1917] underline cursor-pointer rounded ${focusRing}`}>
                Reset
              </button>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10.5px] font-bold uppercase tracking-wider text-[#8a8a8a] border-b border-[#dedede]/70">
                      <th scope="col" className="px-5 py-3">Assessment</th>
                      <th scope="col" className="px-3 py-3">Date</th>
                      <th scope="col" className="px-3 py-3">Status</th>
                      <th scope="col" className="px-3 py-3">Score</th>
                      <th scope="col" className="px-3 py-3">Integrity</th>
                      <th scope="col" className="px-3 py-3">Duration</th>
                      <th scope="col" className="px-5 py-3"><span className="sr-only">Details</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map(({ a, d, date, status, flagged, duration }) => {
                      const open = expanded === a.attemptId;
                      const pct = scorePercent(a);
                      const integ = integrityOf(a);
                      return (
                        <React.Fragment key={a.attemptId}>
                          <tr className={`border-b border-[#dedede]/50 transition-colors ${open ? "bg-[#fafafa]" : "hover:bg-[#fafafa]"}`}>
                            <td className="px-5 py-3.5">
                              <div className="text-sm font-semibold text-[#1a1917] flex items-center gap-2">
                                {a.title}
                                {flagged && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">
                                    <AlertTriangle className="size-3" aria-hidden /> Flagged
                                  </span>
                                )}
                              </div>
                              <div className="text-[11.5px] text-[#8a8a8a] mt-0.5">{a.facultyName ? `Faculty: ${a.facultyName}` : `${a.questionsCount} questions`}</div>
                            </td>
                            <td className="px-3 py-3.5 text-[13px] text-[#1a1917] whitespace-nowrap">{formatDate(date)}</td>
                            <td className="px-3 py-3.5">
                              <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${status.className}`}>{status.label}</span>
                            </td>
                            <td className="px-3 py-3.5 text-[13px] text-[#1a1917] whitespace-nowrap">
                              {pct !== null ? `${a.attemptScore}/${a.totalPoints}` : status.key === "in_progress" ? "—" : "Pending"}
                              {pct !== null && <span className="text-[#8a8a8a] text-[11.5px] ml-1">({pct}%)</span>}
                            </td>
                            <td className={`px-3 py-3.5 text-[13px] font-semibold ${integrityClass(integ)}`}>{integ ?? "—"}</td>
                            <td className="px-3 py-3.5 text-[13px] text-[#1a1917] whitespace-nowrap">{duration !== null ? `${duration} min` : "—"}</td>
                            <td className="px-5 py-3.5 text-right">
                              <button
                                type="button"
                                onClick={() => toggle(a.attemptId)}
                                aria-expanded={open}
                                aria-controls={`attempt-${a.attemptId}`}
                                className={`inline-flex items-center gap-1 min-h-9 px-3 rounded-lg border border-[#dedede] bg-white text-xs font-semibold text-[#1a1917] hover:bg-[#f6f6f6] cursor-pointer ${focusRing}`}
                              >
                                {open ? "Hide" : "Details"}
                                <ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
                              </button>
                            </td>
                          </tr>
                          {open && (
                            <tr id={`attempt-${a.attemptId}`}>
                              <td colSpan={7} className="p-0">
                                <AttemptDetailPanel a={a} d={d} onDownloadCertificate={onDownloadCertificate} />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <ul className="md:hidden divide-y divide-[#dedede]/60">
                {visible.map(({ a, d, date, status, flagged, duration }) => {
                  const open = expanded === a.attemptId;
                  const pct = scorePercent(a);
                  const integ = integrityOf(a);
                  return (
                    <li key={a.attemptId}>
                      <button
                        type="button"
                        onClick={() => toggle(a.attemptId)}
                        aria-expanded={open}
                        aria-controls={`attempt-m-${a.attemptId}`}
                        className={`w-full text-left p-4 cursor-pointer ${focusRing} focus-visible:ring-offset-0 focus-visible:ring-inset`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[#1a1917]">{a.title}</p>
                            <p className="mt-0.5 text-[11.5px] text-[#8a8a8a] flex items-center gap-1">
                              <CalendarDays className="size-3" aria-hidden /> {formatDate(date)}
                              {duration !== null && (
                                <>
                                  <span aria-hidden>·</span> <Clock className="size-3" aria-hidden /> {duration} min
                                </>
                              )}
                            </p>
                          </div>
                          <ChevronDown className={`size-4 mt-1 shrink-0 text-[#8a8a8a] transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full border ${status.className}`}>{status.label}</span>
                          {flagged && (
                            <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                              <AlertTriangle className="size-3" aria-hidden /> Flagged
                            </span>
                          )}
                          {d && (d.resumeCount ?? 0) > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-[#676767]">
                              <RotateCcw className="size-3" aria-hidden /> Resumed {d.resumeCount}×
                            </span>
                          )}
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <div className="rounded-xl bg-[#f6f6f6] px-3 py-2">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-[#8a8a8a]">Score</p>
                            <p className="text-sm font-semibold text-[#1a1917]">{pct !== null ? `${a.attemptScore}/${a.totalPoints} (${pct}%)` : status.key === "in_progress" ? "—" : "Pending"}</p>
                          </div>
                          <div className="rounded-xl bg-[#f6f6f6] px-3 py-2">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-[#8a8a8a]">Integrity</p>
                            <p className={`text-sm font-semibold ${integrityClass(integ)}`}>{integ ?? "—"}</p>
                          </div>
                        </div>
                      </button>
                      <AnimatePresence initial={false}>
                        {open && (
                          <motion.div
                            id={`attempt-m-${a.attemptId}`}
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <AttemptDetailPanel a={a} d={d} onDownloadCertificate={onDownloadCertificate} />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
