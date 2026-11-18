import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, X } from "lucide-react";
import { toast } from "sonner";
import { HistoryList, ProgressCard, SubmitPanel } from "./plagiarism/SubmitPanel";
import { ReportView, DISCLAIMER } from "./plagiarism/ReportView";
import { card, focusRing } from "./plagiarism/controls";
import {
  BAND_INFO,
  Band,
  CheckInput,
  CheckOptions,
  DEFAULT_OPTIONS,
  PlagiarismReport,
  ReportSummary,
  fetchReport,
  fetchReports,
  normalizeReport,
  postCheck,
} from "./plagiarism/types";

interface PlagiarismAnalysisProps {
  user: any;
}

function inputLabel(input: CheckInput): string {
  if (input.title.trim()) return input.title.trim();
  return input.kind === "file" ? input.file.name : "Pasted text";
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException ? err.name === "AbortError" : (err as { name?: string })?.name === "AbortError";
}

export function PlagiarismAnalysis(_props: PlagiarismAnalysisProps) {
  const [mode, setMode] = useState<"submit" | "report">("submit");
  const [options, setOptions] = useState<CheckOptions>(DEFAULT_OPTIONS);
  const [report, setReport] = useState<PlagiarismReport | null>(null);
  const [busyTitle, setBusyTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Original input kept in memory so filters can re-run the same document.
  const [lastInput, setLastInput] = useState<CheckInput | null>(null);
  const [inputReportIds, setInputReportIds] = useState<string[]>([]);

  const [history, setHistory] = useState<ReportSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      setHistory(await fetchReports());
    } catch (err) {
      setHistoryError(errorMessage(err, "Could not load report history."));
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
    return () => abortRef.current?.abort();
  }, [loadHistory]);

  const scrollTop = () =>
    requestAnimationFrame(() => rootRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));

  const runCheck = async (input: CheckInput, opts: CheckOptions, isRerun: boolean) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setBusyTitle(inputLabel(input));
    try {
      const result = normalizeReport(await postCheck(input, opts, controller.signal));
      setReport(result);
      setLastInput(input);
      setInputReportIds((prev) => (isRerun ? [...prev, result.id] : [result.id]));
      setMode("report");
      scrollTop();
      toast.success(isRerun ? "Report updated with new filters." : "Similarity report ready.");
      loadHistory();
    } catch (err) {
      if (isAbort(err) || controller.signal.aborted) {
        toast("Similarity check cancelled.");
      } else {
        setError(errorMessage(err, "The similarity check failed. Please try again."));
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setBusyTitle(null);
      }
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusyTitle(null);
  };

  const openReport = async (id: string) => {
    setOpeningId(id);
    setError(null);
    try {
      const r = normalizeReport(await fetchReport(id));
      setReport(r);
      setMode("report");
      scrollTop();
    } catch (err) {
      toast.error(errorMessage(err, "Could not open that report."));
    } finally {
      setOpeningId(null);
    }
  };

  const canRerun = !!report && !!lastInput && inputReportIds.includes(report.id);

  return (
    <div ref={rootRef} className="space-y-6 scroll-mt-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 print:hidden">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold tracking-tight text-[#1a1917]">Similarity Report</h2>
          <p className="text-xs text-[#8a8a8a]">
            Check your paper against student papers, internet sources and publications before you submit.
          </p>
        </div>
        {mode === "report" && !busyTitle && (
          <button
            type="button"
            onClick={() => {
              setMode("submit");
              setError(null);
            }}
            className={`self-start sm:self-auto inline-flex items-center gap-2 min-h-11 px-3 rounded-xl text-sm font-semibold text-[#676767] hover:text-[#1a1917] hover:bg-[#f6f6f6] cursor-pointer ${focusRing}`}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Submissions & history
          </button>
        )}
      </div>

      {busyTitle ? (
        <ProgressCard title={busyTitle} onCancel={cancel} />
      ) : mode === "report" && report ? (
        <div className="space-y-4">
          {error && (
            <div role="alert" className="flex items-start gap-2 p-3 rounded-xl border border-rose-200 bg-rose-50 text-sm text-rose-700 print:hidden">
              <AlertTriangle className="size-4 mt-0.5 shrink-0" aria-hidden="true" />
              <span className="flex-1">{error}</span>
              <button
                type="button"
                aria-label="Dismiss error"
                onClick={() => setError(null)}
                className={`-m-2 size-11 inline-flex items-center justify-center rounded-lg hover:bg-rose-100 cursor-pointer ${focusRing}`}
              >
                <X className="size-4" />
              </button>
            </div>
          )}
          <ReportView
            report={report}
            canRerun={canRerun}
            onRerun={(filters) => lastInput && runCheck(lastInput, { ...filters, saveToRepository: false }, true)}
            onNew={() => {
              setMode("submit");
              setError(null);
              scrollTop();
            }}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <SubmitPanel
              options={options}
              onOptionsChange={setOptions}
              onSubmit={(input) => runCheck(input, options, false)}
              error={error}
              onDismissError={() => setError(null)}
            />
            <p className="text-xs text-[#8a8a8a] px-1">{DISCLAIMER}</p>
          </div>
          <div className="space-y-6">
            <HistoryList
              items={history}
              loading={historyLoading}
              error={historyError}
              openingId={openingId}
              activeId={report?.id ?? null}
              onRefresh={loadHistory}
              onOpen={openReport}
            />
            <section className={`${card} p-5`} aria-labelledby="plag-bands-heading">
              <h3 id="plag-bands-heading" className="text-sm font-bold text-[#1a1917] mb-3">Reading the score</h3>
              <ul className="space-y-2">
                {(Object.keys(BAND_INFO) as Band[]).map((b) => (
                  <li key={b} className="flex items-center gap-2.5 text-xs">
                    <span className="size-3 rounded-full shrink-0" style={{ backgroundColor: BAND_INFO[b].color }} aria-hidden="true" />
                    <span className="font-semibold text-[#1a1917] w-20">{BAND_INFO[b].range}</span>
                    <span className="text-[#676767]">{BAND_INFO[b].label}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-[#8a8a8a] leading-relaxed">
                The percentage is the share of your checked words that match another source. Quoted and cited material
                can still match — what matters is whether it is attributed.
              </p>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
