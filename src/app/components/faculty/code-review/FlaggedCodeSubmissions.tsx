import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Clock, FileCode2, Loader2, RefreshCw, Search, ShieldCheck, Eye } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../ui/alert-dialog";
import { codingRequest } from "../../code/coding-api";
import { createAuthedSocket } from "../../../utils/socket-client";
import { CodeReviewWorkspace } from "./CodeReviewWorkspace";
import { CODE_LANGUAGES, FLAG_STATUS, fmtMarks, pct, REASON_LABEL, reasonLabel, type FlagList, type FlagStatus } from "./review-types";

const selectCls =
  "h-9 rounded-xl border border-[#dedede] bg-white px-3 text-xs font-semibold text-[#1a1917] shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b2b2b2]";

/**
 * Live count of pending flagged code submissions for the sidebar badge.
 * Refreshes on `code:flagged` and every 60 s.
 */
export function usePendingCodeFlagCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () =>
      codingRequest<FlagList>("/flags?status=pending")
        .then((d) => alive && setCount(d.counts.pending))
        .catch(() => {});
    void load();
    const t = setInterval(load, 60000);
    const socket = createAuthedSocket();
    socket.on("code:flagged", load);
    window.addEventListener("code-flags-changed", load);
    return () => {
      alive = false;
      clearInterval(t);
      socket.disconnect();
      window.removeEventListener("code-flags-changed", load);
    };
  }, []);
  return count;
}

/** Tell listeners (e.g. the sidebar badge) that flag state changed. */
export const notifyFlagsChanged = () => window.dispatchEvent(new Event("code-flags-changed"));

type StatusFilter = FlagStatus | "all";

export function FlaggedCodeSubmissions() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [assessmentId, setAssessmentId] = useState("");
  const [language, setLanguage] = useState("");
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [data, setData] = useState<FlagList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  // Debounce the free-text search.
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const query = useMemo(() => {
    const p = new URLSearchParams({ status });
    if (assessmentId) p.set("assessmentId", assessmentId);
    if (language) p.set("language", language);
    if (reason) p.set("reason", reason);
    if (q) p.set("q", q);
    return p.toString();
  }, [status, assessmentId, language, reason, q]);

  const reqSeq = useRef(0);
  const load = useCallback(
    async (quiet = false) => {
      const seq = ++reqSeq.current;
      if (!quiet) setLoading(true);
      try {
        const d = await codingRequest<FlagList>(`/flags?${query}`);
        if (seq !== reqSeq.current) return;
        setData(d);
        setError(null);
      } catch (err: any) {
        if (seq === reqSeq.current) setError(err?.message || "Could not load flagged submissions.");
      } finally {
        if (seq === reqSeq.current) setLoading(false);
      }
    },
    [query],
  );

  useEffect(() => {
    if (openId) return;
    void load();
    const t = setInterval(() => void load(true), 30000);
    const socket = createAuthedSocket();
    socket.on("code:flagged", () => void load(true));
    return () => {
      clearInterval(t);
      socket.disconnect();
    };
  }, [load, openId]);

  const runBulk = async () => {
    if (!assessmentId) return;
    setBulkBusy(true);
    try {
      const r = await codingRequest<{ queued: number }>(`/assessments/${assessmentId}/reevaluate-flagged`, { method: "POST", body: JSON.stringify({}) });
      toast.success(r.queued === 0 ? "No flagged submissions to re-evaluate." : `Queued ${r.queued} submission${r.queued === 1 ? "" : "s"} for re-evaluation.`);
      setConfirmBulk(false);
      void load(true);
      notifyFlagsChanged();
    } catch (err: any) {
      toast.error(err?.message || "Could not queue re-evaluation.");
    } finally {
      setBulkBusy(false);
    }
  };

  if (openId) {
    return (
      <CodeReviewWorkspace
        submissionId={openId}
        onBack={() => {
          setOpenId(null);
          notifyFlagsChanged();
        }}
      />
    );
  }

  const counts = data?.counts ?? { pending: 0, inReview: 0, reviewed: 0 };
  const selectedAssessment = data?.assessments.find((a) => a.id === assessmentId);
  const stats: { key: FlagStatus; label: string; value: number; icon: React.ElementType; tone: string }[] = [
    { key: "pending", label: "Pending", value: counts.pending, icon: Clock, tone: "text-amber-600 bg-amber-50" },
    { key: "in_review", label: "In review", value: counts.inReview, icon: Eye, tone: "text-sky-600 bg-sky-50" },
    { key: "reviewed", label: "Reviewed", value: counts.reviewed, icon: ShieldCheck, tone: "text-emerald-600 bg-emerald-50" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Flagged Code Submissions</h1>
          <p className="text-xs text-[#8a8a8a]">Coding answers Vigil could not grade confidently. Review the evidence, then approve or override the marks.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#dedede] bg-white px-3 text-xs font-bold shadow-sm hover:bg-[#f6f6f6]"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button
            type="button"
            disabled={!assessmentId}
            title={assessmentId ? undefined : "Select an assessment first"}
            onClick={() => setConfirmBulk(true)}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#1a1917] px-3 text-xs font-bold text-white shadow-sm hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RefreshCw className="size-3.5" /> Re-evaluate all flagged
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setStatus(s.key)}
            aria-pressed={status === s.key}
            className={`flex items-center gap-4 rounded-2xl border bg-white p-5 text-left shadow-sm transition ${status === s.key ? "border-[#1a1917]" : "border-[#dedede] hover:border-[#b2b2b2]"}`}
          >
            <div className={`rounded-xl p-2.5 ${s.tone}`}>
              <s.icon className="size-5" />
            </div>
            <div>
              <div className="text-2xl font-bold leading-none">{data ? s.value : "—"}</div>
              <div className="mt-1 text-xs font-semibold text-[#8a8a8a]">{s.label}</div>
            </div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#dedede] bg-white p-3 shadow-sm">
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className={selectCls}>
          <option value="pending">Pending</option>
          <option value="in_review">In review</option>
          <option value="reviewed">Reviewed</option>
          <option value="all">All statuses</option>
        </select>
        <select aria-label="Assessment" value={assessmentId} onChange={(e) => setAssessmentId(e.target.value)} className={`${selectCls} max-w-[260px]`}>
          <option value="">All assessments</option>
          {(data?.assessments ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.course?.code ? `${a.course.code} · ` : ""}
              {a.title}
            </option>
          ))}
        </select>
        <select aria-label="Language" value={language} onChange={(e) => setLanguage(e.target.value)} className={selectCls}>
          <option value="">All languages</option>
          {CODE_LANGUAGES.map((l) => (
            <option key={l.key} value={l.key}>
              {l.label}
            </option>
          ))}
        </select>
        <select aria-label="Flag reason" value={reason} onChange={(e) => setReason(e.target.value)} className={selectCls}>
          <option value="">All reasons</option>
          {Object.entries(REASON_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#8a8a8a]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search student name, email or reg. no."
            aria-label="Search students"
            className="h-9 w-full rounded-xl border border-[#dedede] bg-white pl-8 pr-3 text-xs font-medium shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b2b2b2]"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-[#dedede] bg-white shadow-sm">
        {error ? (
          <div className="p-10 text-center text-sm text-rose-600">{error}</div>
        ) : loading && !data ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-[#8a8a8a]">
            <Loader2 className="size-4 animate-spin" /> Loading flagged submissions…
          </div>
        ) : !data || data.flags.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-12 text-center">
            <ShieldCheck className="size-8 text-emerald-500" />
            <p className="text-sm font-semibold text-[#1a1917]">No flagged submissions — Vigil graded everything confidently.</p>
            {(status !== "pending" || assessmentId || language || reason || q) && <p className="text-xs text-[#8a8a8a]">Try clearing the filters.</p>}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-[#dedede]/60 text-[11px] font-bold uppercase text-[#8a8a8a]">
                    <th className="px-5 py-3">Student</th>
                    <th className="px-3 py-3">Assessment / question</th>
                    <th className="px-3 py-3">Why flagged</th>
                    <th className="px-3 py-3">AI confidence</th>
                    <th className="px-3 py-3">Suggested</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-5 py-3 text-right" />
                  </tr>
                </thead>
                <tbody>
                  {data.flags.map((f) => (
                    <tr key={f.id} className="border-b border-[#dedede]/40 align-top text-xs last:border-0 hover:bg-[#fafafa]">
                      <td className="px-5 py-3">
                        <div className="font-bold text-[#1a1917]">{f.student.name}</div>
                        <div className="text-[#8a8a8a]">
                          {f.student.registrationNumber || f.student.email}
                          {f.student.section ? ` · ${f.student.section}` : ""}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-semibold text-[#1a1917]">
                          {f.assessment.course?.code ? <span className="text-[#8a8a8a]">{f.assessment.course.code} · </span> : null}
                          {f.assessment.title}
                        </div>
                        <div className="text-[#676767]">
                          Q{f.question.number} – {f.question.title} · {f.submission.languageLabel}
                        </div>
                      </td>
                      <td className="max-w-[280px] px-3 py-3">
                        <div className="font-semibold text-rose-700">
                          {reasonLabel(f.reason)}
                          {f.assignedToMe && <span className="ml-1.5 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] text-violet-700">Assigned to you</span>}
                        </div>
                        {f.detail && <div className="line-clamp-2 text-[#8a8a8a]">{f.detail}</div>}
                      </td>
                      <td className="px-3 py-3 font-semibold">{pct(f.submission.confidence)}</td>
                      <td className="px-3 py-3 font-semibold">
                        {fmtMarks(f.submission.finalMarks ?? f.submission.suggestedMarks)} / {fmtMarks(f.submission.maxMarks)}
                        {f.submission.testsTotal ? (
                          <div className="font-normal text-[#8a8a8a]">
                            {f.submission.testsPassed ?? 0}/{f.submission.testsTotal} tests
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <StatusChip status={f.status} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button type="button" onClick={() => setOpenId(f.submission.id)} className="inline-flex items-center gap-1 whitespace-nowrap font-bold text-[#1a1917] hover:underline">
                          View submission <ChevronRight className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile / tablet cards */}
            <ul className="divide-y divide-[#dedede]/60 lg:hidden">
              {data.flags.map((f) => (
                <li key={f.id} className="space-y-1.5 p-4 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-[#1a1917]">{f.student.name}</div>
                      <div className="text-[#8a8a8a]">{f.student.registrationNumber || f.student.email}</div>
                    </div>
                    <StatusChip status={f.status} />
                  </div>
                  <div className="text-[#676767]">
                    {f.assessment.course?.code ? `${f.assessment.course.code} · ` : ""}
                    {f.assessment.title} — Q{f.question.number} – {f.question.title} · {f.submission.languageLabel}
                  </div>
                  <div className="font-semibold text-rose-700">{reasonLabel(f.reason)}</div>
                  {f.detail && <div className="text-[#8a8a8a]">{f.detail}</div>}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <span className="text-[#676767]">
                      Confidence <b>{pct(f.submission.confidence)}</b> · Suggested{" "}
                      <b>
                        {fmtMarks(f.submission.finalMarks ?? f.submission.suggestedMarks)} / {fmtMarks(f.submission.maxMarks)}
                      </b>
                    </span>
                    <button type="button" onClick={() => setOpenId(f.submission.id)} className="inline-flex items-center gap-1 font-bold text-[#1a1917]">
                      View submission <ChevronRight className="size-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <AlertDialog open={confirmBulk} onOpenChange={(o) => !bulkBusy && setConfirmBulk(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <FileCode2 className="size-4" /> Re-evaluate all flagged submissions?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Every open flagged coding submission in{" "}
              <b>
                {selectedAssessment?.course?.code ? `${selectedAssessment.course.code} · ` : ""}
                {selectedAssessment?.title ?? "this assessment"}
              </b>{" "}
              will be compiled, tested and assessed again. Previous evaluations and the full review history are kept. Submissions already marked as reviewed are not included.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkBusy}
              onClick={(e) => {
                e.preventDefault();
                void runBulk();
              }}
            >
              {bulkBusy ? <Loader2 className="size-4 animate-spin" /> : null} Re-evaluate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatusChip({ status }: { status: FlagStatus }) {
  const s = FLAG_STATUS[status] ?? { label: status, cls: "border-zinc-200 bg-zinc-50 text-zinc-600" };
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${s.cls}`}>{s.label}</span>;
}
