import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Columns2,
  FileCode2,
  History,
  Loader2,
  MessageSquarePlus,
  RefreshCw,
  ShieldCheck,
  UserRoundSearch,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { CodeEditor, errorLinesFrom } from "../../code/CodeEditor";
import { RichText } from "../../assessment/RichText";
import { codingRequest, formatMemory, formatTime, VERDICT_LABEL, type Verdict } from "../../code/coding-api";
import {
  ACTION_LABEL,
  fmtDateTime,
  fmtMarks,
  FLAG_STATUS,
  pct,
  reasonLabel,
  SOURCE_LABEL,
  SUBMISSION_STATUS,
  type Evaluation,
  type ReviewAction,
  type ReviewData,
  type TestResult,
} from "./review-types";

const card = "rounded-2xl border border-[#dedede] bg-white shadow-sm";
const btnPrimary =
  "inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-[#1a1917] px-3.5 text-xs font-bold text-white shadow-sm hover:bg-black disabled:cursor-not-allowed disabled:opacity-40";
const btnSecondary =
  "inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#dedede] bg-white px-3.5 text-xs font-bold text-[#1a1917] shadow-sm hover:bg-[#f6f6f6] disabled:cursor-not-allowed disabled:opacity-40";
const fieldCls =
  "w-full rounded-xl border border-[#dedede] bg-white px-3 py-2 text-xs text-[#1a1917] shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b2b2b2]";

const verdictText = (v: string | null | undefined) => (v ? VERDICT_LABEL[v as Verdict] ?? v.replace(/_/g, " ") : "—");

function Chip({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10.5px] font-bold ${cls}`}>{children}</span>;
}

function Pre({ children, tone = "zinc", className = "" }: { children: React.ReactNode; tone?: "zinc" | "rose"; className?: string }) {
  return (
    <pre
      className={`max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg border p-2 font-mono text-[11.5px] ${
        tone === "rose" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-[#ececec] bg-[#fafafa] text-[#1a1917]"
      } ${className}`}
    >
      {children}
    </pre>
  );
}

function SectionTitle({ icon: Icon, children, right }: { icon: React.ElementType; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#ececec] px-5 py-3">
      <h3 className="flex items-center gap-2 text-sm font-bold">
        <Icon className="size-4 text-[#676767]" /> {children}
      </h3>
      {right}
    </div>
  );
}

export function CodeReviewWorkspace({ submissionId, onBack }: { submissionId: string; onBack: () => void }) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ReviewAction | null>(null);
  const [evalId, setEvalId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string>("");

  // action inputs
  const [overrideMarks, setOverrideMarks] = useState<string>("");
  const [explanation, setExplanation] = useState("");
  const [remark, setRemark] = useState("");
  const [secondReviewer, setSecondReviewer] = useState("");
  const [secondNote, setSecondNote] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await codingRequest<ReviewData>(`/submissions/${submissionId}/review`);
      setData(d);
      setError(null);
      return d;
    } catch (err: any) {
      setError(err?.message || "Could not load this submission.");
      return null;
    }
  }, [submissionId]);

  useEffect(() => {
    void load();
  }, [load]);

  // While a re-evaluation is queued/running, poll every 5 s until it finishes.
  const wasPending = useRef(false);
  useEffect(() => {
    if (!data?.pendingJob) {
      if (wasPending.current && data) toast.success("Re-evaluation finished.");
      wasPending.current = false;
      return;
    }
    wasPending.current = true;
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [data?.pendingJob, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (action: ReviewAction, body: Record<string, unknown> = {}, success?: string) => {
    setBusy(action);
    try {
      const d = await codingRequest<ReviewData>(`/submissions/${submissionId}/actions`, { method: "POST", body: JSON.stringify({ action, ...body }) });
      setData(d);
      setEvalId(null);
      toast.success(success ?? ACTION_LABEL[action] ?? "Saved");
      return true;
    } catch (err: any) {
      toast.error(err?.message || "Action failed.");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const evaluation: Evaluation | null = useMemo(() => {
    if (!data?.evaluations.length) return null;
    return data.evaluations.find((e) => e.id === evalId) ?? data.evaluations[0];
  }, [data, evalId]);

  const errorLines = useMemo(() => errorLinesFrom(evaluation?.compileOutput), [evaluation]);

  if (error && !data) {
    return (
      <div className="space-y-4">
        <BackButton onBack={onBack} />
        <div className={`${card} p-10 text-center text-sm text-rose-600`}>{error}</div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-4">
        <BackButton onBack={onBack} />
        <div className={`${card} flex items-center justify-center gap-2 p-10 text-sm text-[#8a8a8a]`}>
          <Loader2 className="size-4 animate-spin" /> Loading submission…
        </div>
      </div>
    );
  }

  const { submission: sub, student, assessment, question } = data;
  const subStatus = SUBMISSION_STATUS[sub.status] ?? { label: sub.status, cls: "border-zinc-200 bg-zinc-50 text-zinc-600" };
  const openFlags = data.flags.filter((f) => f.status !== "reviewed");
  const compare = data.versions.find((v) => v.id === compareId && v.id !== sub.id) ?? null;
  const thisVersion = data.versions.find((v) => v.id === sub.id);
  const currentMarks = sub.finalMarks ?? sub.suggestedMarks;
  const threshold = question.confidenceThreshold;
  const overrideNum = overrideMarks === "" ? NaN : Number(overrideMarks);
  const overrideValid = Number.isFinite(overrideNum) && overrideNum >= 0 && overrideNum <= sub.maxMarks && explanation.trim().length >= 5;

  return (
    <div className="space-y-6">
      {/* Title bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <BackButton onBack={onBack} />
          <div>
            <h1 className="text-xl font-bold tracking-tight">Review code submission</h1>
            <p className="text-xs text-[#8a8a8a]">
              {assessment.course?.code ? `${assessment.course.code} · ` : ""}
              {assessment.title} · Q{question.number}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Chip cls={subStatus.cls}>{subStatus.label}</Chip>
          <button type="button" onClick={() => void load()} className={btnSecondary} aria-label="Reload submission">
            <RefreshCw className="size-3.5" /> Reload
          </button>
        </div>
      </div>

      {/* Header facts */}
      <div className={`${card} grid grid-cols-2 gap-x-6 gap-y-3 p-5 text-xs md:grid-cols-4`}>
        <Fact label="Student" value={student.name} sub={student.email} />
        <Fact label="Registration no." value={student.registrationNumber || "—"} sub={[student.section && `Section ${student.section}`, student.department].filter(Boolean).join(" · ") || undefined} />
        <Fact label="Assessment" value={assessment.title} sub={assessment.course ? `${assessment.course.code} · ${assessment.course.name}` : undefined} />
        <Fact label="Question" value={`Q${question.number} · ${fmtMarks(sub.maxMarks)} marks`} sub={`${sub.languageLabel}`} />
        <Fact label="Submitted" value={fmtDateTime(sub.submittedAt)} sub={assessment.attemptSubmittedAt ? `Exam submitted ${fmtDateTime(assessment.attemptSubmittedAt)}` : undefined} />
        <Fact
          label="Version"
          value={`v${sub.version}${sub.isLatest ? " (latest)" : ""}`}
          sub={data.previousSubmissions > 0 ? `${data.previousSubmissions} previous submission${data.previousSubmissions === 1 ? "" : "s"}` : "No previous submissions"}
        />
        <Fact label="Source" value={SOURCE_LABEL[sub.source] ?? sub.source} />
        <Fact
          label="Marks"
          value={`${fmtMarks(currentMarks)} / ${fmtMarks(sub.maxMarks)}`}
          sub={sub.finalizedBy === "faculty" ? "Set by faculty" : sub.finalizedBy === "ai" ? "Accepted from AI" : sub.suggestedMarks != null ? "AI suggestion (not final)" : "Not graded yet"}
        />
      </div>

      {data.pendingJob && (
        <div className="flex items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-xs font-semibold text-violet-700" role="status">
          <Loader2 className="size-4 animate-spin" /> Re-evaluation in progress… this page refreshes automatically.
        </div>
      )}

      {/* Why it was flagged */}
      {(openFlags.length > 0 || (evaluation?.flagReasons.length ?? 0) > 0) && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-5" role="note">
          <h3 className="flex items-center gap-2 text-sm font-bold text-rose-800">
            <AlertTriangle className="size-4" /> Why this was flagged
          </h3>
          <ul className="mt-2 space-y-1.5 text-xs text-rose-900">
            {openFlags.map((f) => (
              <li key={f.id}>
                <b>{reasonLabel(f.reason)}</b>
                {f.detail ? ` — ${f.detail}` : ""}
                <Chip cls={`ml-2 ${FLAG_STATUS[f.status]?.cls ?? ""}`}>{FLAG_STATUS[f.status]?.label ?? f.status}</Chip>
              </li>
            ))}
            {evaluation?.flagReasons
              .filter((r) => !openFlags.some((f) => f.reason === r.code && (f.detail ?? "") === (r.detail ?? "")))
              .map((r, i) => (
                <li key={`${r.code}-${i}`}>
                  <b>{reasonLabel(r.code)}</b>
                  {r.detail ? ` — ${r.detail}` : ""} <span className="text-rose-600/70">(evaluation run #{evaluation.runNumber})</span>
                </li>
              ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* LEFT: code, history, question */}
        <div className="min-w-0 space-y-6">
          <div className={card}>
            <SectionTitle
              icon={FileCode2}
              right={
                data.versions.length > 1 ? (
                  <label className="flex items-center gap-2 text-xs font-semibold text-[#676767]">
                    <Columns2 className="size-3.5" /> Compare with
                    <select value={compareId} onChange={(e) => setCompareId(e.target.value)} className="h-8 rounded-lg border border-[#dedede] bg-white px-2 text-xs">
                      <option value="">—</option>
                      {data.versions
                        .filter((v) => v.id !== sub.id)
                        .map((v) => (
                          <option key={v.id} value={v.id}>
                            v{v.version} · {v.language} · {SOURCE_LABEL[v.source] ?? v.source}
                          </option>
                        ))}
                    </select>
                  </label>
                ) : null
              }
            >
              Source code · v{sub.version}
            </SectionTitle>
            <div className={`grid gap-3 p-3 ${compare ? "grid-cols-1 2xl:grid-cols-2" : "grid-cols-1"}`}>
              <div className="min-w-0">
                <p className="mb-1.5 text-[11px] font-semibold text-[#8a8a8a]">
                  v{sub.version} · {sub.languageLabel} · {SOURCE_LABEL[thisVersion?.source ?? sub.source] ?? sub.source} · {fmtDateTime(sub.submittedAt)}
                  {errorLines.length > 0 && <span className="ml-1 text-rose-600">· compile errors highlighted</span>}
                </p>
                <div className="overflow-hidden rounded-lg">
                  <CodeEditor value={sub.sourceCode} language={sub.monaco} readOnly height={460} errorLines={errorLines} ariaLabel="Submitted source code" />
                </div>
              </div>
              {compare && (
                <div className="min-w-0">
                  <p className="mb-1.5 text-[11px] font-semibold text-[#8a8a8a]">
                    v{compare.version} · {compare.language} · {SOURCE_LABEL[compare.source] ?? compare.source} · {fmtDateTime(compare.submittedAt)}
                  </p>
                  <div className="overflow-hidden rounded-lg">
                    <CodeEditor value={compare.sourceCode} language={compare.language} readOnly height={460} ariaLabel={`Source code version ${compare.version}`} />
                  </div>
                </div>
              )}
            </div>
          </div>

          <details className={`${card} group`}>
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 text-sm font-bold">
              <span className="flex items-center gap-2">
                <History className="size-4 text-[#676767]" /> Student's compile / run history ({data.executions.length})
              </span>
              <ChevronDown className="size-4 transition group-open:rotate-180" />
            </summary>
            <div className="space-y-2 border-t border-[#ececec] p-4">
              {data.executions.length === 0 ? (
                <p className="text-xs text-[#8a8a8a]">The student never compiled or ran this question.</p>
              ) : (
                data.executions.map((e) => (
                  <details key={e.id} className="rounded-lg border border-[#ececec] p-2 text-xs">
                    <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                      <span className="font-semibold capitalize">{e.mode}</span>
                      <span className="text-[#676767]">{e.language}</span>
                      <span className={e.verdict === "accepted" ? "text-emerald-700" : e.verdict ? "text-rose-700" : "text-[#8a8a8a]"}>{e.verdict ? verdictText(e.verdict) : e.status}</span>
                      {e.sampleResults && (
                        <span className="text-[#676767]">
                          {e.sampleResults.filter((s) => s.passed).length}/{e.sampleResults.length} samples
                        </span>
                      )}
                      <span className="ml-auto text-[#8a8a8a]">{fmtDateTime(e.createdAt)}</span>
                    </summary>
                    <div className="mt-2 space-y-1.5">
                      {e.stdin ? <Labeled label="stdin"><Pre>{e.stdin}</Pre></Labeled> : null}
                      {e.compileOutput ? <Labeled label="Compiler"><Pre tone="rose">{e.compileOutput}</Pre></Labeled> : null}
                      {e.stdout ? <Labeled label="stdout"><Pre>{e.stdout}</Pre></Labeled> : null}
                      {e.stderr ? <Labeled label="stderr"><Pre tone="rose">{e.stderr}</Pre></Labeled> : null}
                      {e.infraError ? <p className="text-amber-700">Execution service problem (not the student's fault): {e.infraError}</p> : null}
                      <p className="text-[#8a8a8a]">
                        {formatTime(e.timeMs)} · {formatMemory(e.memoryKb)}
                      </p>
                    </div>
                  </details>
                ))
              )}
            </div>
          </details>

          <QuestionPanel q={question} />
        </div>

        {/* RIGHT: evaluation, actions, audit */}
        <div className="min-w-0 space-y-6">
          <div className={card}>
            <SectionTitle
              icon={ShieldCheck}
              right={
                data.evaluations.length > 1 ? (
                  <select
                    aria-label="Evaluation run"
                    value={evaluation?.id ?? ""}
                    onChange={(e) => setEvalId(e.target.value)}
                    className="h-8 rounded-lg border border-[#dedede] bg-white px-2 text-xs"
                  >
                    {data.evaluations.map((e, i) => (
                      <option key={e.id} value={e.id}>
                        Run #{e.runNumber} · {e.trigger}
                        {i === 0 ? " (latest)" : ""} · {fmtDateTime(e.createdAt)}
                      </option>
                    ))}
                  </select>
                ) : null
              }
            >
              Evaluation{evaluation ? ` · run #${evaluation.runNumber}` : ""}
            </SectionTitle>
            {evaluation ? <EvaluationView e={evaluation} threshold={threshold} /> : <p className="p-5 text-xs text-[#8a8a8a]">This submission has not been evaluated yet.</p>}
          </div>

          {/* Faculty actions */}
          <div className={card}>
            <SectionTitle icon={CheckCircle2}>Faculty decision</SectionTitle>
            <div className="space-y-5 p-5 text-xs">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={btnPrimary}
                  disabled={sub.suggestedMarks == null || busy !== null}
                  title={sub.suggestedMarks == null ? "No AI-suggested marks to approve" : undefined}
                  onClick={() => void act("approve_ai", {}, `Approved ${fmtMarks(sub.suggestedMarks)} / ${fmtMarks(sub.maxMarks)} marks.`)}
                >
                  {busy === "approve_ai" ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                  Approve AI marks{sub.suggestedMarks != null ? ` (${fmtMarks(sub.suggestedMarks)})` : ""}
                </button>
                <button type="button" className={btnSecondary} disabled={busy !== null || data.pendingJob} onClick={() => void act("reevaluate", {}, "Re-evaluation queued.")}>
                  {busy === "reevaluate" ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Re-evaluate
                </button>
                <button
                  type="button"
                  className={btnSecondary}
                  disabled={currentMarks == null || busy !== null}
                  title={currentMarks == null ? "Approve or override marks first" : undefined}
                  onClick={() => void act("mark_reviewed", {}, "Marked as reviewed.")}
                >
                  {busy === "mark_reviewed" ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />} Mark reviewed
                </button>
              </div>

              <fieldset className="space-y-2 rounded-xl border border-[#ececec] p-3">
                <legend className="px-1 text-xs font-bold">Override marks</legend>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={sub.maxMarks}
                    step={0.25}
                    value={overrideMarks}
                    onChange={(e) => setOverrideMarks(e.target.value)}
                    aria-label="Override marks"
                    placeholder={currentMarks != null ? fmtMarks(currentMarks) : "0"}
                    className={`${fieldCls} w-28`}
                  />
                  <span className="text-[#676767]">/ {fmtMarks(sub.maxMarks)}</span>
                  {overrideMarks !== "" && !(Number.isFinite(overrideNum) && overrideNum >= 0 && overrideNum <= sub.maxMarks) && (
                    <span className="text-rose-600">Enter a value between 0 and {fmtMarks(sub.maxMarks)}.</span>
                  )}
                </div>
                <textarea
                  rows={2}
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  placeholder="Explanation (required) — why these marks differ from the AI suggestion"
                  aria-label="Override explanation"
                  className={fieldCls}
                />
                <button
                  type="button"
                  className={btnPrimary}
                  disabled={!overrideValid || busy !== null}
                  onClick={async () => {
                    if (await act("override", { marks: overrideNum, explanation: explanation.trim() }, `Marks set to ${fmtMarks(overrideNum)} / ${fmtMarks(sub.maxMarks)}.`)) {
                      setOverrideMarks("");
                      setExplanation("");
                    }
                  }}
                >
                  {busy === "override" ? <Loader2 className="size-3.5 animate-spin" /> : null} Save override
                </button>
              </fieldset>

              <fieldset className="space-y-2 rounded-xl border border-[#ececec] p-3">
                <legend className="px-1 text-xs font-bold">Request second review</legend>
                <select value={secondReviewer} onChange={(e) => setSecondReviewer(e.target.value)} aria-label="Second reviewer" className={fieldCls}>
                  <option value="">Anyone — return to the review queue</option>
                  {data.faculty.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                      {f.department ? ` · ${f.department}` : ""}
                    </option>
                  ))}
                </select>
                <input value={secondNote} onChange={(e) => setSecondNote(e.target.value)} placeholder="Note for the reviewer (optional)" aria-label="Second review note" className={fieldCls} />
                <button
                  type="button"
                  className={btnSecondary}
                  disabled={busy !== null}
                  onClick={async () => {
                    if (
                      await act(
                        "request_second_review",
                        { assignToFacultyId: secondReviewer || undefined, remark: secondNote.trim() || undefined },
                        "Second review requested.",
                      )
                    ) {
                      setSecondReviewer("");
                      setSecondNote("");
                    }
                  }}
                >
                  {busy === "request_second_review" ? <Loader2 className="size-3.5 animate-spin" /> : <UserRoundSearch className="size-3.5" />} Request second review
                </button>
              </fieldset>

              <fieldset className="space-y-2 rounded-xl border border-[#ececec] p-3">
                <legend className="px-1 text-xs font-bold">Private remark</legend>
                <textarea rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Only faculty can see this." aria-label="Private remark" maxLength={2000} className={fieldCls} />
                <button
                  type="button"
                  className={btnSecondary}
                  disabled={!remark.trim() || busy !== null}
                  onClick={async () => {
                    if (await act("remark", { remark: remark.trim() }, "Remark added.")) setRemark("");
                  }}
                >
                  {busy === "remark" ? <Loader2 className="size-3.5 animate-spin" /> : <MessageSquarePlus className="size-3.5" />} Add remark
                </button>
              </fieldset>
            </div>
          </div>

          {/* Audit trail */}
          <div className={card}>
            <SectionTitle icon={History}>Audit trail</SectionTitle>
            {data.reviews.length === 0 ? (
              <p className="p-5 text-xs text-[#8a8a8a]">No review actions yet.</p>
            ) : (
              <ol className="divide-y divide-[#ececec]">
                {data.reviews.map((r) => (
                  <li key={r.id} className="space-y-0.5 px-5 py-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold">{ACTION_LABEL[r.action] ?? r.action.replace(/_/g, " ")}</span>
                      <span className="text-[#8a8a8a]">{fmtDateTime(r.createdAt)}</span>
                    </div>
                    <div className="text-[#676767]">
                      by {r.facultyName}
                      {r.marks != null && (
                        <>
                          {" · marks "}
                          {r.previousMarks != null ? `${fmtMarks(r.previousMarks)} → ` : ""}
                          <b>{fmtMarks(r.marks)}</b>
                        </>
                      )}
                    </div>
                    {r.explanation && <p className="text-[#1a1917]">{r.explanation}</p>}
                    {r.remark && <p className="italic text-[#676767]">“{r.remark}”</p>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" onClick={onBack} className={btnSecondary} aria-label="Back to flagged submissions">
      <ArrowLeft className="size-3.5" /> Back
    </button>
  );
}

function Fact({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] font-bold uppercase tracking-wide text-[#8a8a8a]">{label}</div>
      <div className="truncate font-semibold text-[#1a1917]" title={typeof value === "string" ? value : undefined}>
        {value}
      </div>
      {sub && <div className="truncate text-[#8a8a8a]" title={sub}>{sub}</div>}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-0.5 text-[10.5px] font-bold uppercase text-[#8a8a8a]">{label}</p>
      {children}
    </div>
  );
}

function EvaluationView({ e, threshold }: { e: Evaluation; threshold: number }) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const toggle = (i: number) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  const compileOk = e.compileStatus === "ok";
  const lowConfidence = e.confidence != null && e.confidence < threshold;

  return (
    <div className="space-y-5 p-5 text-xs">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Suggested" value={`${fmtMarks(e.suggestedMarks)} / ${fmtMarks(e.maxMarks)}`} />
        <Stat label="Tests passed" value={e.testsTotal ? `${e.testsPassed ?? 0} / ${e.testsTotal}` : "—"} />
        <Stat label="AI confidence" value={pct(e.confidence)} sub={`threshold ${pct(threshold)}`} warn={lowConfidence} />
        <Stat label="Generated by" value={e.generatedBy === "llm" ? "AI + tests" : e.generatedBy === "tests_only" ? "Tests only" : e.generatedBy ?? "—"} sub={`${e.trigger} · ${e.status}`} />
      </div>

      {e.error && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">Evaluation problem: {e.error}</p>}

      <div>
        <p className="mb-1 flex items-center gap-1.5 font-bold">
          {compileOk ? <CheckCircle2 className="size-3.5 text-emerald-600" /> : e.compileStatus ? <XCircle className="size-3.5 text-rose-600" /> : null}
          Compilation:{" "}
          <span className={compileOk ? "text-emerald-700" : "text-rose-700"}>
            {compileOk ? "succeeded" : e.compileStatus === "compilation_error" ? "failed" : e.compileStatus === "infra_error" ? "execution service problem (not the student's fault)" : e.compileStatus ?? "—"}
          </span>
        </p>
        {e.compileOutput ? <Pre tone={compileOk ? "zinc" : "rose"}>{e.compileOutput}</Pre> : null}
      </div>

      {e.testResults.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[#ececec] text-[10.5px] font-bold uppercase text-[#8a8a8a]">
                <th className="py-2 pr-2">#</th>
                <th className="py-2 pr-2">Type</th>
                <th className="py-2 pr-2">Verdict</th>
                <th className="py-2 pr-2">Time</th>
                <th className="py-2 pr-2">Memory</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {e.testResults.map((t) => (
                <TestRow key={t.index} t={t} open={open.has(t.index)} onToggle={() => toggle(t.index)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {e.breakdown.length > 0 && (
        <div className="overflow-x-auto">
          <p className="mb-1 font-bold">Marks breakdown</p>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[#ececec] text-[10.5px] font-bold uppercase text-[#8a8a8a]">
                <th className="py-2 pr-2">Criterion</th>
                <th className="py-2 pr-2">Marks</th>
                <th className="py-2 pr-2">Source</th>
                <th className="py-2">Reason</th>
              </tr>
            </thead>
            <tbody>
              {e.breakdown.map((b, i) => (
                <tr key={i} className="border-b border-[#f3f3f3] align-top">
                  <td className="py-2 pr-2 font-semibold">{b.criterion}</td>
                  <td className="whitespace-nowrap py-2 pr-2">
                    {fmtMarks(b.awarded)} / {fmtMarks(b.max)}
                  </td>
                  <td className="py-2 pr-2">
                    <Chip cls={b.source === "tests" ? "border-sky-200 bg-sky-50 text-sky-700" : "border-violet-200 bg-violet-50 text-violet-700"}>{b.source === "tests" ? "Tests" : "AI"}</Chip>
                  </td>
                  <td className="py-2 text-[#676767]">{b.reason || "—"}</td>
                </tr>
              ))}
              <tr className="font-bold">
                <td className="py-2 pr-2">Total</td>
                <td className="py-2 pr-2">
                  {fmtMarks(e.suggestedMarks)} / {fmtMarks(e.maxMarks)}
                </td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {e.feedback && (
        <div>
          <p className="mb-1 font-bold">AI feedback</p>
          <p className="whitespace-pre-wrap rounded-lg border border-[#ececec] bg-[#fafafa] p-3 leading-relaxed text-[#1a1917]">{e.feedback}</p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${warn ? "border-rose-200 bg-rose-50" : "border-[#ececec] bg-[#fafafa]"}`}>
      <div className="text-[10.5px] font-bold uppercase text-[#8a8a8a]">{label}</div>
      <div className={`text-base font-bold ${warn ? "text-rose-700" : "text-[#1a1917]"}`}>{value}</div>
      {sub && <div className="text-[#8a8a8a]">{sub}</div>}
    </div>
  );
}

function TestRow({ t, open, onToggle }: { t: TestResult; open: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="border-b border-[#f3f3f3]">
        <td className="py-2 pr-2 font-semibold">{t.index + 1}</td>
        <td className="py-2 pr-2">
          <Chip cls={t.hidden ? "border-zinc-300 bg-zinc-100 text-zinc-700" : "border-sky-200 bg-sky-50 text-sky-700"}>{t.hidden ? "Hidden" : "Public"}</Chip>
        </td>
        <td className={`py-2 pr-2 font-semibold ${t.passed ? "text-emerald-700" : "text-rose-700"}`}>
          {t.passed ? "Passed" : verdictText(t.verdict)}
        </td>
        <td className="py-2 pr-2">{formatTime(t.timeMs)}</td>
        <td className="py-2 pr-2">{formatMemory(t.memoryKb)}</td>
        <td className="py-2 text-right">
          <button type="button" onClick={onToggle} aria-expanded={open} className="inline-flex items-center gap-0.5 font-semibold text-[#676767] hover:text-[#1a1917]">
            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />} Details
          </button>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-[#f3f3f3]">
          <td colSpan={6} className="pb-3">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <Labeled label="Input">
                <Pre>{t.input || "∅"}</Pre>
              </Labeled>
              <Labeled label="Expected">
                <Pre>{t.expectedOutput || "∅"}</Pre>
              </Labeled>
              <Labeled label="Actual">
                <Pre tone={t.passed ? "zinc" : "rose"}>{t.actualOutput || "∅"}</Pre>
              </Labeled>
              {t.stderr ? (
                <div className="md:col-span-3">
                  <Labeled label="stderr">
                    <Pre tone="rose">{t.stderr}</Pre>
                  </Labeled>
                </div>
              ) : null}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

const OUTPUT_MATCH_LABEL: Record<string, string> = {
  trim: "Trim whitespace",
  exact: "Exact",
  tokens: "Tokens (whitespace-insensitive)",
};

function QuestionPanel({ q }: { q: ReviewData["question"] }) {
  return (
    <div className={card}>
      <SectionTitle icon={FileCode2}>Question {q.number}</SectionTitle>
      <div className="space-y-4 p-5 text-xs">
        <RichText text={q.text} className="space-y-2 text-[13px] leading-relaxed text-[#1a1917]" />
        <div className="flex flex-wrap gap-2 text-[#676767]">
          <Chip cls="border-[#dedede] bg-[#fafafa] text-[#676767]">{fmtMarks(q.maxMarks)} marks</Chip>
          <Chip cls="border-[#dedede] bg-[#fafafa] text-[#676767]">Tests {q.testWeightPercent}% · rubric {100 - q.testWeightPercent}%</Chip>
          <Chip cls="border-[#dedede] bg-[#fafafa] text-[#676767]">Output match: {OUTPUT_MATCH_LABEL[q.outputMatch] ?? q.outputMatch}</Chip>
          <Chip cls="border-[#dedede] bg-[#fafafa] text-[#676767]">
            {q.limits.timeLimitMs} ms · {q.limits.memoryLimitMb} MB
          </Chip>
          <Chip cls="border-[#dedede] bg-[#fafafa] text-[#676767]">Confidence threshold {pct(q.confidenceThreshold)}</Chip>
        </div>

        <details className="rounded-lg border border-[#ececec]">
          <summary className="cursor-pointer px-3 py-2 font-bold">Reference solution</summary>
          <div className="border-t border-[#ececec] p-2">{q.referenceSolution ? <Pre className="max-h-96">{q.referenceSolution}</Pre> : <p className="text-[#8a8a8a]">No reference solution provided.</p>}</div>
        </details>

        <details className="rounded-lg border border-[#ececec]" open>
          <summary className="cursor-pointer px-3 py-2 font-bold">Test cases ({q.testCases.length})</summary>
          <div className="space-y-2 border-t border-[#ececec] p-2">
            {q.testCases.length === 0 ? (
              <p className="text-[#8a8a8a]">This question has no test cases.</p>
            ) : (
              q.testCases.map((t) => (
                <div key={t.index} className="rounded-lg border border-[#f0f0f0] p-2">
                  <div className="mb-1 flex items-center gap-2 font-semibold">
                    Test {t.index + 1}
                    <Chip cls={t.hidden ? "border-zinc-300 bg-zinc-100 text-zinc-700" : "border-sky-200 bg-sky-50 text-sky-700"}>{t.hidden ? "Hidden" : "Public"}</Chip>
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <Labeled label="Input">
                      <Pre>{t.input || "∅"}</Pre>
                    </Labeled>
                    <Labeled label="Expected output">
                      <Pre>{t.output || "∅"}</Pre>
                    </Labeled>
                  </div>
                </div>
              ))
            )}
          </div>
        </details>

        <div>
          <p className="mb-1 font-bold">Rubric (rubric share {100 - q.testWeightPercent}%)</p>
          {q.rubric.length === 0 ? (
            <p className="text-[#8a8a8a]">No rubric — marks come from tests only.</p>
          ) : (
            <ul className="space-y-1">
              {q.rubric.map((r, i) => (
                <li key={i} className="flex gap-2">
                  <span className="font-semibold">{r.criterion}</span>
                  <span className="text-[#8a8a8a]">weight {r.marks}</span>
                  {r.description && <span className="text-[#676767]">— {r.description}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
