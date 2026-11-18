import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Database,
  ExternalLink,
  FilePlus2,
  Info,
  Layers,
  Printer,
  RotateCcw,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { OptionsFields, SourceTypeIcon, card, focusRing, primaryBtn, secondaryBtn } from "./controls";
import {
  CATEGORY_COLORS,
  CheckOptions,
  PlagiarismReport,
  ReportMatch,
  ReportSource,
  Segment,
  TYPE_LABEL,
  bandInfo,
  buildSegments,
  formatDate,
  formatPercent,
  optionsFromSettings,
  paletteColor,
  sameOptions,
  withAlpha,
} from "./types";

const UNKNOWN_COLOR = "#8a8a8a";

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  #plag-report-print, #plag-report-print * { visibility: visible !important; }
  #plag-report-print { position: absolute; left: 0; top: 0; width: 100%; padding: 0 8mm; }
  #plag-report-print * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  #plag-report-print .plag-doc-scroll { max-height: none !important; overflow: visible !important; }
  @page { margin: 12mm; }
}`;

export const DISCLAIMER =
  "A similarity score is not proof of plagiarism. Matches may be properly cited quotes, common phrases or your own earlier work — review every match in context.";

interface ReportViewProps {
  report: PlagiarismReport;
  canRerun: boolean;
  onRerun: (options: CheckOptions) => void;
  onNew: () => void;
}

export function ReportView({ report, canRerun, onRerun, onNew }: ReportViewProps) {
  const [focusedSourceId, setFocusedSourceId] = useState<string | null>(null);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [drawerMatchId, setDrawerMatchId] = useState<string | null>(null);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<CheckOptions>(() => optionsFromSettings(report.settings));

  // Reset view state whenever a different report is shown.
  useEffect(() => {
    setFocusedSourceId(null);
    setActiveMatchId(null);
    setDrawerMatchId(null);
    setFilters(optionsFromSettings(report.settings));
  }, [report]);

  const sourceById = useMemo(() => {
    const map = new Map<string, { source: ReportSource; color: string }>();
    report.sources.forEach((s, i) => map.set(s.id, { source: s, color: paletteColor(i) }));
    return map;
  }, [report.sources]);

  const matchNumber = useMemo(() => {
    const map = new Map<string, number>();
    report.matches.forEach((m, i) => map.set(m.id, i + 1));
    return map;
  }, [report.matches]);

  const segments = useMemo(
    () => buildSegments(report.text, report.matches, report.excluded),
    [report.text, report.matches, report.excluded]
  );

  const navList = useMemo(
    () => (focusedSourceId ? report.matches.filter((m) => m.sourceId === focusedSourceId) : report.matches),
    [report.matches, focusedSourceId]
  );
  const navIndex = activeMatchId ? navList.findIndex((m) => m.id === activeMatchId) : -1;

  const scrollToMatch = useCallback((id: string) => {
    const el = document.getElementById(`plag-m-${id}`);
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  }, []);

  const goTo = useCallback(
    (list: ReportMatch[], i: number) => {
      if (!list.length) return;
      const idx = ((i % list.length) + list.length) % list.length;
      const id = list[idx].id;
      setActiveMatchId(id);
      // wait a frame so focus-mode re-render has applied highlights
      requestAnimationFrame(() => scrollToMatch(id));
    },
    [scrollToMatch]
  );

  const focusSource = (id: string) => {
    if (focusedSourceId === id) {
      setFocusedSourceId(null);
      return;
    }
    setFocusedSourceId(id);
    const list = report.matches.filter((m) => m.sourceId === id);
    goTo(list, 0);
  };

  const openMatch = useCallback((id: string) => {
    setActiveMatchId(id);
    setDrawerMatchId(id);
  }, []);

  const drawerMatch = drawerMatchId ? report.matches.find((m) => m.id === drawerMatchId) ?? null : null;
  const drawerList = drawerMatch && focusedSourceId ? navList : report.matches;
  const drawerIdx = drawerMatch ? drawerList.findIndex((m) => m.id === drawerMatch.id) : -1;
  const stepDrawer = (delta: number) => {
    if (drawerIdx < 0 || !drawerList.length) return;
    const next = drawerList[(drawerIdx + delta + drawerList.length) % drawerList.length];
    setDrawerMatchId(next.id);
    setActiveMatchId(next.id);
    scrollToMatch(next.id);
  };

  const filtersChanged = !sameOptions(filters, optionsFromSettings(report.settings));
  const focused = focusedSourceId ? sourceById.get(focusedSourceId) : undefined;

  const nav = (
    <MatchNav
      index={navIndex}
      total={navList.length}
      onPrev={() => goTo(navList, navIndex < 0 ? navList.length - 1 : navIndex - 1)}
      onNext={() => goTo(navList, navIndex + 1)}
      label={focused ? `matches from source ${focused.source.rank}` : "matches"}
    />
  );

  return (
    <div id="plag-report-print" className="space-y-5">
      <style>{PRINT_CSS}</style>

      <ReportHeader report={report} onNew={onNew} />

      {/* Filters toolbar */}
      <section className={`${card} print:hidden`} aria-label="Report filters">
        <button
          type="button"
          aria-expanded={filtersOpen}
          aria-controls="plag-filters"
          onClick={() => setFiltersOpen((v) => !v)}
          className={`w-full min-h-12 flex items-center justify-between gap-3 px-5 py-2 rounded-2xl text-left cursor-pointer ${focusRing}`}
        >
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#1a1917]">
            <SlidersHorizontal className="size-4 text-[#676767]" aria-hidden="true" />
            Filters & exclusions
          </span>
          <span className="inline-flex items-center gap-2 text-xs text-[#8a8a8a]">
            <span className="hidden sm:inline">
              Quotes {report.settings?.excludeQuotes ? "excluded" : "included"} · Bibliography{" "}
              {report.settings?.excludeBibliography ? "excluded" : "included"} · ≥{report.settings?.minMatchWords ?? 8} words
            </span>
            <ChevronDown className={`size-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`} aria-hidden="true" />
          </span>
        </button>
        {filtersOpen && (
          <div id="plag-filters" className="px-5 pb-5 space-y-4 border-t border-[#f0f0f0] pt-4">
            <OptionsFields value={filters} onChange={setFilters} showSave={false} layout="toolbar" disabled={!canRerun} />
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
              <p className="text-xs text-[#8a8a8a]">
                {canRerun
                  ? "Re-runs the check on the same document. Re-runs are not saved to the repository again."
                  : "Re-running with new filters is available for papers submitted in this session. Submit the paper again to change filters."}
              </p>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  className={secondaryBtn}
                  disabled={!filtersChanged}
                  onClick={() => setFilters(optionsFromSettings(report.settings))}
                >
                  <RotateCcw className="size-4" aria-hidden="true" />
                  Reset
                </button>
                <button
                  type="button"
                  className={primaryBtn}
                  disabled={!canRerun || !filtersChanged || filters.sources.length === 0}
                  onClick={() => onRerun(filters)}
                >
                  Apply & re-check
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] gap-5 print:block">
        {/* Match overview (above the document on mobile) */}
        <aside className="lg:order-last space-y-4 print:mb-5" aria-label="Match overview">
          <div className={`${card} lg:sticky lg:top-4`}>
            <button
              type="button"
              aria-expanded={overviewOpen}
              aria-controls="plag-overview-body"
              onClick={() => setOverviewOpen((v) => !v)}
              className={`lg:hidden print:hidden w-full min-h-12 flex items-center justify-between gap-3 px-5 py-2 rounded-2xl cursor-pointer ${focusRing}`}
            >
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#1a1917]">
                <Layers className="size-4 text-[#676767]" aria-hidden="true" />
                Match overview · {report.sources.length} source{report.sources.length === 1 ? "" : "s"}
              </span>
              <ChevronDown className={`size-4 text-[#8a8a8a] transition-transform ${overviewOpen ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            <div id="plag-overview-body" className={`${overviewOpen ? "block" : "hidden"} lg:block print:block`}>
              <MatchOverview
                report={report}
                sourceById={sourceById}
                focusedSourceId={focusedSourceId}
                onFocus={focusSource}
                nav={nav}
              />
            </div>
          </div>
        </aside>

        {/* Document viewer */}
        <section className={`${card} min-w-0`} aria-label="Document">
          <div className="sticky top-0 z-10 bg-white rounded-t-2xl border-b border-[#f0f0f0] px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between print:static">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[#676767]" aria-label="Legend">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-5 h-3 rounded-sm" style={{ background: withAlpha("#1a1917", 0.18), borderBottom: "2px solid #1a1917" }} />
                Exact match
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-5 h-3 rounded-sm" style={{ background: withAlpha("#1a1917", 0.07), borderBottom: "2px dashed #1a1917" }} />
                Near match / light paraphrase
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block w-5 h-3 rounded-sm bg-[#efefef] border border-[#dedede]" />
                Excluded
              </span>
            </div>
            <div className="print:hidden">{nav}</div>
          </div>
          {focused && (
            <div className="px-4 sm:px-5 py-2 border-b border-[#f0f0f0] flex items-center gap-2 text-xs text-[#676767] print:hidden">
              <SourceChip rank={focused.source.rank} color={focused.color} />
              <span className="min-w-0 truncate">
                Showing matches from <span className="font-semibold text-[#1a1917]">{focused.source.title}</span> only
              </span>
              <button
                type="button"
                onClick={() => setFocusedSourceId(null)}
                className={`ml-auto shrink-0 min-h-11 px-3 rounded-lg font-semibold text-[#1a1917] hover:bg-[#f6f6f6] cursor-pointer ${focusRing}`}
              >
                Show all
              </button>
            </div>
          )}
          <div className="plag-doc-scroll lg:max-h-[75vh] lg:overflow-y-auto px-4 sm:px-8 py-6">
            {report.text.trim() ? (
              <DocumentText
                text={report.text}
                segments={segments}
                sourceById={sourceById}
                matchNumber={matchNumber}
                focusedSourceId={focusedSourceId}
                activeMatchId={activeMatchId}
                onOpen={openMatch}
              />
            ) : (
              <p className="text-sm text-[#8a8a8a] text-center py-12">No text could be extracted from this document.</p>
            )}
          </div>
        </section>
      </div>

      <p className="text-xs text-[#8a8a8a] flex items-start gap-2">
        <Info className="size-4 shrink-0 mt-px" aria-hidden="true" />
        {DISCLAIMER}
      </p>

      <AnimatePresence>
        {drawerMatch && (
          <ComparisonDrawer
            key="drawer"
            report={report}
            match={drawerMatch}
            info={sourceById.get(drawerMatch.sourceId)}
            number={matchNumber.get(drawerMatch.id) ?? 0}
            position={drawerIdx + 1}
            total={drawerList.length}
            onPrev={() => stepDrawer(-1)}
            onNext={() => stepDrawer(1)}
            onClose={() => setDrawerMatchId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

function ReportHeader({ report, onNew }: { report: PlagiarismReport; onNew: () => void }) {
  const info = bandInfo(report.band, report.similarity);
  const s = report.stats;
  const name = report.title || report.filename || "Untitled submission";
  const stat = (label: string, value: React.ReactNode) => (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-[#8a8a8a] font-semibold">{label}</dt>
      <dd className="text-sm font-bold text-[#1a1917] tabular-nums truncate">{value}</dd>
    </div>
  );

  return (
    <section className={`${card} overflow-hidden`} aria-label="Report summary">
      <div className="h-1.5" style={{ backgroundColor: info.color }} aria-hidden="true" />
      <div className="p-5 sm:p-6 flex flex-col md:flex-row gap-6">
        <div
          className="shrink-0 rounded-2xl px-6 py-5 flex flex-col items-center justify-center text-center md:w-48"
          style={{ backgroundColor: info.soft, color: info.text }}
        >
          <span className="text-[11px] font-bold uppercase tracking-wider">Similarity</span>
          <span className="text-5xl font-extrabold leading-none mt-2 tabular-nums" style={{ color: info.color }}>
            {formatPercent(report.similarity)}
          </span>
          <span
            className="mt-3 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold text-white"
            style={{ backgroundColor: info.color }}
          >
            {info.label} · {info.range}
          </span>
        </div>

        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:justify-between">
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-[#1a1917] break-words">{name}</h3>
              <p className="text-xs text-[#8a8a8a] mt-0.5">
                {report.filename && report.filename !== name ? `${report.filename} · ` : ""}
                Submitted {formatDate(report.createdAt)}
              </p>
            </div>
            <div className="flex gap-2 shrink-0 print:hidden">
              <button type="button" onClick={() => window.print()} className={secondaryBtn}>
                <Printer className="size-4" aria-hidden="true" />
                <span>Print report</span>
              </button>
              <button type="button" onClick={onNew} className={primaryBtn}>
                <FilePlus2 className="size-4" aria-hidden="true" />
                <span>New check</span>
              </button>
            </div>
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
            {stat("Words", s.totalWords.toLocaleString())}
            {stat("Matched words", `${s.matchedWords.toLocaleString()} / ${s.checkedWords.toLocaleString()}`)}
            {stat("Exact · near", `${s.exactWords.toLocaleString()} · ${s.nearWords.toLocaleString()}`)}
            {stat("Excluded words", s.excludedWords.toLocaleString())}
            {stat("Sources", `${report.sources.length} matched`)}
            {stat("Compared", `${s.sourcesCompared.toLocaleString()} sources`)}
            {stat(
              "Processing",
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5 text-[#8a8a8a]" aria-hidden="true" />
                {(s.processingMs / 1000).toFixed(1)} s
              </span>
            )}
            {stat(
              "Repository",
              <span className="inline-flex items-center gap-1">
                <Database className="size-3.5 text-[#8a8a8a]" aria-hidden="true" />
                {report.savedToRepository ? "Saved" : "Not saved"}
              </span>
            )}
          </dl>

          {report.coverage.skipped.length > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-800" role="note">
              <AlertTriangle className="size-4 shrink-0 mt-px" aria-hidden="true" />
              <div>
                <p className="font-semibold">Some sources could not be checked — the score may be lower than it would otherwise be.</p>
                <ul className="mt-1 space-y-0.5">
                  {report.coverage.skipped.map((sk, i) => (
                    <li key={`${sk.source}-${i}`}>
                      <span className="capitalize">{sk.source.replace(/_/g, " ")}</span>: {sk.reason}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <p className="text-xs text-[#676767] flex items-start gap-1.5">
            <Info className="size-3.5 shrink-0 mt-px" aria-hidden="true" />
            Similarity is not proof of plagiarism — review matches in context.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Match overview                                                      */
/* ------------------------------------------------------------------ */

function SourceChip({ rank, color, size = "sm" }: { rank: number | string; color: string; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden="true"
      className={`shrink-0 inline-flex items-center justify-center rounded-md font-bold text-white tabular-nums ${
        size === "md" ? "min-w-8 h-8 px-1.5 text-sm" : "min-w-5 h-5 px-1 text-[11px]"
      }`}
      style={{ backgroundColor: color }}
    >
      {rank}
    </span>
  );
}

interface MatchOverviewProps {
  report: PlagiarismReport;
  sourceById: Map<string, { source: ReportSource; color: string }>;
  focusedSourceId: string | null;
  onFocus: (id: string) => void;
  nav: React.ReactNode;
}

function MatchOverview({ report, sourceById, focusedSourceId, onFocus, nav }: MatchOverviewProps) {
  const info = bandInfo(report.band, report.similarity);
  const b = report.breakdown;
  const cats = [
    { key: "internet", label: "Internet", value: b.internet, color: CATEGORY_COLORS.internet },
    { key: "publications", label: "Publications", value: b.publications, color: CATEGORY_COLORS.publications },
    { key: "studentPapers", label: "Student papers", value: b.studentPapers, color: CATEGORY_COLORS.studentPapers },
  ];

  return (
    <div className="p-5 space-y-5">
      <div className="hidden lg:flex print:flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-[#1a1917]">Match overview</h3>
        <span className="text-2xl font-extrabold tabular-nums" style={{ color: info.color }}>
          {formatPercent(report.similarity)}
        </span>
      </div>

      <div>
        <div className="flex items-center justify-between text-xs text-[#676767] mb-2">
          <span className="font-semibold text-[#1a1917]">By category</span>
          <span>% of checked words</span>
        </div>
        <div
          className="h-3 rounded-full bg-[#f0f0f0] overflow-hidden flex"
          role="img"
          aria-label={cats.map((c) => `${c.label} ${formatPercent(c.value)}`).join(", ")}
        >
          {cats.map((c) =>
            c.value > 0 ? (
              <div key={c.key} style={{ width: `${Math.min(100, c.value)}%`, backgroundColor: c.color }} />
            ) : null
          )}
        </div>
        <ul className="mt-2.5 space-y-1">
          {cats.map((c) => (
            <li key={c.key} className="flex items-center gap-2 text-xs">
              <span className="size-2.5 rounded-sm shrink-0" style={{ backgroundColor: c.color }} aria-hidden="true" />
              <span className="text-[#676767] flex-1">{c.label}</span>
              <span className="font-semibold text-[#1a1917] tabular-nums">{formatPercent(c.value)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2 gap-2">
          <span className="text-xs font-semibold text-[#1a1917]">
            {report.sources.length} source{report.sources.length === 1 ? "" : "s"}
          </span>
          {focusedSourceId && <div className="print:hidden">{nav}</div>}
        </div>

        {report.sources.length === 0 ? (
          <p className="py-6 px-3 text-center text-xs text-[#8a8a8a] border border-dashed border-[#dedede] rounded-xl">
            No matching sources were found with the current settings.
          </p>
        ) : (
          <ol className="space-y-1.5 lg:max-h-[50vh] lg:overflow-y-auto print:max-h-none -mx-1 px-1">
            {report.sources.map((s) => {
              const color = sourceById.get(s.id)?.color ?? UNKNOWN_COLOR;
              const active = focusedSourceId === s.id;
              const dim = !!focusedSourceId && !active;
              return (
                <li
                  key={s.id}
                  className={`flex items-stretch rounded-xl border transition-colors ${
                    active ? "border-[#1a1917] bg-[#f6f6f6]" : "border-[#ececec] hover:bg-[#fafafa]"
                  } ${dim ? "opacity-60" : ""}`}
                  style={{ borderLeft: `4px solid ${color}` }}
                >
                  <button
                    type="button"
                    aria-pressed={active}
                    aria-label={`Source ${s.rank}: ${s.title}, ${TYPE_LABEL[s.type] ?? s.type}, ${formatPercent(s.percent)}. ${
                      active ? "Showing only this source; press to show all." : "Press to highlight only this source."
                    }`}
                    onClick={() => onFocus(s.id)}
                    className={`flex-1 min-w-0 min-h-14 flex items-start gap-2.5 p-2.5 text-left rounded-xl cursor-pointer ${focusRing}`}
                  >
                    <SourceChip rank={s.rank} color={color} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-[#1a1917] leading-snug line-clamp-2">{s.title}</span>
                      <span className="mt-0.5 flex items-center gap-1 text-[11px] text-[#676767]">
                        <SourceTypeIcon type={s.type} className="size-3" />
                        {TYPE_LABEL[s.type] ?? s.type}
                        {s.detail && <span className="truncate text-[#8a8a8a]">· {s.detail}</span>}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-extrabold text-[#1a1917] tabular-nums">{formatPercent(s.percent)}</span>
                      <span className="block text-[11px] text-[#8a8a8a] tabular-nums">{s.matchedWords} words</span>
                    </span>
                  </button>
                  {s.url && (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open source ${s.rank} in a new tab`}
                      className={`shrink-0 w-11 inline-flex items-center justify-center text-[#8a8a8a] hover:text-[#1a1917] rounded-r-xl print:hidden ${focusRing}`}
                    >
                      <ExternalLink className="size-4" />
                    </a>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

function MatchNav({
  index,
  total,
  onPrev,
  onNext,
  label,
}: {
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  label: string;
}) {
  const btn = `size-11 inline-flex items-center justify-center rounded-xl border border-[#dedede] bg-white text-[#1a1917] hover:bg-[#f6f6f6] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${focusRing}`;
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={`Navigate ${label}`}>
      <button type="button" className={btn} onClick={onPrev} disabled={total === 0} aria-label="Previous match">
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-20 text-center text-xs text-[#676767] tabular-nums" aria-live="polite">
        {total === 0 ? "No matches" : index >= 0 ? `Match ${index + 1} of ${total}` : `${total} match${total === 1 ? "" : "es"}`}
      </span>
      <button type="button" className={btn} onClick={onNext} disabled={total === 0} aria-label="Next match">
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Document text                                                       */
/* ------------------------------------------------------------------ */

interface DocumentTextProps {
  text: string;
  segments: Segment[];
  sourceById: Map<string, { source: ReportSource; color: string }>;
  matchNumber: Map<string, number>;
  focusedSourceId: string | null;
  activeMatchId: string | null;
  onOpen: (id: string) => void;
}

const DocumentText = memo(function DocumentText({
  text,
  segments,
  sourceById,
  matchNumber,
  focusedSourceId,
  activeMatchId,
  onOpen,
}: DocumentTextProps) {
  return (
    <div className="whitespace-pre-wrap break-words text-[15px] leading-[1.9] text-[#1a1917] font-serif max-w-[72ch] mx-auto">
      {segments.map((seg) => {
        const content = text.slice(seg.start, seg.end);
        if (seg.match) {
          const m = seg.match;
          if (focusedSourceId && m.sourceId !== focusedSourceId) {
            return <span key={seg.key}>{content}</span>;
          }
          const info = sourceById.get(m.sourceId);
          const color = info?.color ?? UNKNOWN_COLOR;
          const rank = info?.source.rank ?? "?";
          const near = m.kind === "near";
          const active = activeMatchId === m.id;
          const n = matchNumber.get(m.id) ?? 0;
          return (
            <mark
              key={seg.key}
              id={seg.matchStart ? `plag-m-${m.id}` : undefined}
              role="button"
              tabIndex={seg.matchStart ? 0 : -1}
              aria-label={`Match ${n} from ${info?.source.title ?? "unknown source"} (${near ? "near match" : "exact match"}, ${m.words} words)`}
              onClick={() => onOpen(m.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpen(m.id);
                }
              }}
              className={`cursor-pointer rounded-[3px] px-[1px] [box-decoration-break:clone] [-webkit-box-decoration-break:clone] text-inherit transition-shadow hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#1a1917] ${
                active ? "ring-2 ring-offset-1" : ""
              }`}
              style={{
                backgroundColor: withAlpha(color, near ? 0.09 : 0.2),
                borderBottom: `2px ${near ? "dashed" : "solid"} ${color}`,
                ...(active ? ({ "--tw-ring-color": color } as React.CSSProperties) : null),
              }}
            >
              {seg.matchStart && (
                <sup
                  aria-hidden="true"
                  className="font-sans not-italic inline-flex items-center justify-center min-w-[1.25em] h-[1.35em] px-[3px] mr-0.5 rounded text-[10px] font-bold text-white align-super leading-none select-none"
                  style={{ backgroundColor: color }}
                >
                  {rank}
                </sup>
              )}
              {content}
            </mark>
          );
        }
        if (seg.excluded) {
          return (
            <span
              key={seg.key}
              className="text-[#9a9a9a] bg-[#f3f3f3] rounded-[3px] [box-decoration-break:clone] [-webkit-box-decoration-break:clone]"
            >
              {seg.excludedStart && (
                <span className="font-sans inline-block align-middle mr-1 px-1.5 py-px rounded border border-[#dedede] bg-white text-[10px] font-semibold uppercase tracking-wide text-[#8a8a8a] leading-tight select-none">
                  Excluded · {seg.excluded === "quote" ? "quote" : "bibliography"}
                </span>
              )}
              {content}
            </span>
          );
        }
        return <span key={seg.key}>{content}</span>;
      })}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Comparison drawer                                                   */
/* ------------------------------------------------------------------ */

interface ComparisonDrawerProps {
  report: PlagiarismReport;
  match: ReportMatch;
  info: { source: ReportSource; color: string } | undefined;
  number: number;
  position: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

function ComparisonDrawer({ report, match, info, number, position, total, onPrev, onNext, onClose }: ComparisonDrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<Element | null>(null);

  useEffect(() => {
    returnFocus.current = document.activeElement;
    closeRef.current?.focus();
    return () => {
      const el = returnFocus.current as HTMLElement | null;
      if (el && typeof el.focus === "function" && document.contains(el)) el.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const color = info?.color ?? UNKNOWN_COLOR;
  const source = info?.source;
  const yours = report.text.slice(match.start, match.end);
  const near = match.kind === "near";

  return (
    <div className="fixed inset-0 z-50 print:hidden">
      <motion.div
        className="absolute inset-0 bg-black/30"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="plag-drawer-title"
        className="absolute bg-white shadow-2xl flex flex-col inset-x-0 bottom-0 max-h-[88vh] rounded-t-2xl sm:inset-y-0 sm:right-0 sm:left-auto sm:bottom-auto sm:h-full sm:max-h-none sm:w-[30rem] sm:rounded-none sm:rounded-l-2xl"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ duration: 0.18 }}
      >
        <div className="h-1.5 shrink-0 rounded-t-2xl sm:rounded-tr-none" style={{ backgroundColor: color }} aria-hidden="true" />
        <div className="flex items-start gap-3 p-5 border-b border-[#f0f0f0]">
          <SourceChip rank={source?.rank ?? "?"} color={color} size="md" />
          <div className="min-w-0 flex-1">
            <h3 id="plag-drawer-title" className="text-sm font-bold text-[#1a1917] leading-snug">
              Match {number} · {source?.title ?? "Unknown source"}
            </h3>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#676767]">
              {source && (
                <span className="inline-flex items-center gap-1">
                  <SourceTypeIcon type={source.type} className="size-3" />
                  {TYPE_LABEL[source.type] ?? source.type}
                </span>
              )}
              <span
                className="inline-flex items-center px-1.5 py-px rounded-full border text-[11px] font-semibold"
                style={{ borderColor: color, color, borderStyle: near ? "dashed" : "solid" }}
              >
                {near ? "Near match / light paraphrase" : "Exact match"}
              </span>
              <span>{match.words} words</span>
            </p>
            {source?.detail && <p className="mt-1 text-xs text-[#8a8a8a]">{source.detail}</p>}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close comparison"
            className={`size-11 -mr-2 -mt-2 shrink-0 inline-flex items-center justify-center rounded-xl text-[#676767] hover:bg-[#f6f6f6] cursor-pointer ${focusRing}`}
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wide text-[#8a8a8a] mb-1.5">Your text</h4>
            <blockquote
              className="p-3 rounded-xl text-sm leading-relaxed text-[#1a1917] whitespace-pre-wrap font-serif"
              style={{ backgroundColor: withAlpha(color, near ? 0.08 : 0.14), borderLeft: `3px ${near ? "dashed" : "solid"} ${color}` }}
            >
              {yours}
            </blockquote>
          </div>
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wide text-[#8a8a8a] mb-1.5">Source text</h4>
            <blockquote className="p-3 rounded-xl text-sm leading-relaxed text-[#1a1917] whitespace-pre-wrap font-serif bg-[#f6f6f6] border-l-[3px] border-[#dedede]">
              {match.sourceExcerpt || <span className="text-[#8a8a8a] font-sans">No excerpt available for this source.</span>}
            </blockquote>
          </div>
          {source?.url && (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`${secondaryBtn} w-full`}
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              Open source in new tab
            </a>
          )}
          <p className="text-xs text-[#8a8a8a]">{DISCLAIMER}</p>
        </div>

        <div className="shrink-0 flex items-center justify-between gap-2 p-4 border-t border-[#f0f0f0]">
          <button type="button" onClick={onPrev} disabled={total < 2} className={secondaryBtn}>
            <ChevronLeft className="size-4" aria-hidden="true" />
            Previous
          </button>
          <span className="text-xs text-[#676767] tabular-nums">
            {position > 0 ? `${position} / ${total}` : ""}
          </span>
          <button type="button" onClick={onNext} disabled={total < 2} className={secondaryBtn}>
            Next
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
