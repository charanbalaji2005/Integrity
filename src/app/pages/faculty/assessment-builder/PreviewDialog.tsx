import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BookOpen, CheckCircle, ChevronLeft, ChevronRight, Clock, Eye, Play, ShieldCheck, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../../components/ui/dialog";
import { QuestionAnswerInput, QuestionPrompt, type ExamQuestion } from "../../../components/assessment/QuestionAnswerInput";
import { MaterialsList, type PermittedMaterial } from "../../../components/assessment/ExamMaterialsPanel";
import { isAnswered } from "../../../components/assessment/question-meta";
import type { BuilderForm } from "./builder-model";
import { summarize } from "./builder-model";
import type { CourseDetail } from "./builder-api";

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/**
 * Faculty preview of the student examination, built from the current (possibly
 * unsaved) builder state. Mirrors the live exam layout and question rendering;
 * nothing is recorded and no proctoring runs.
 */
export function PreviewDialog({ open, onOpenChange, form, course }: { open: boolean; onOpenChange: (o: boolean) => void; form: BuilderForm; course: CourseDetail | null }) {
  const [stage, setStage] = useState<"intro" | "exam" | "done">("intro");
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [marked, setMarked] = useState<string[]>([]);
  const [timeLeft, setTimeLeft] = useState(form.duration * 60);
  const [confirm, setConfirm] = useState(false);
  const [showMaterials, setShowMaterials] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStage("intro");
    setIdx(0);
    setAnswers({});
    setMarked([]);
    setConfirm(false);
    setTimeLeft(Number(form.duration) * 60);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (stage !== "exam" || timeLeft <= 0) return;
    const t = setInterval(() => setTimeLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [stage, timeLeft]);

  const questions: ExamQuestion[] = useMemo(
    () =>
      form.questions.map((q) => ({
        id: q.key,
        type: q.type,
        text: q.text,
        options: q.type === "true-false" ? ["True", "False"] : q.options,
        points: Number(q.points) || 0,
        difficulty: q.difficulty,
        config: JSON.stringify({
          imageIds: q.imageIds,
          ...(q.type === "coding"
            ? {
                language: q.language,
                starterCode: q.starterCode,
                sampleInput: q.sampleInput,
                sampleOutput: q.sampleOutput,
                testCases: q.testCases.filter((t) => !t.hidden),
                timeLimitMs: q.timeLimitMs,
                memoryLimitMb: q.memoryLimitMb,
              }
            : {}),
        }),
      })),
    [form.questions],
  );

  const materials: PermittedMaterial[] = useMemo(() => {
    if (!form.materialsAccessible || !course) return [];
    return form.materials
      .filter((l) => !form.materialsRestrictedDuringExam || l.permittedInExam)
      .map((l) => course.materials.find((m) => m.id === l.materialId))
      .filter((m): m is NonNullable<typeof m> => !!m)
      .map((m) => ({ ...m, canDownload: form.materialsDownloadable }));
  }, [form, course]);

  const summary = summarize(form.questions);
  const total = form.totalMarks ?? summary.totalMarks;
  const answered = questions.filter((q) => isAnswered(answers[q.id])).length;
  const current = questions[idx];
  const timeUp = stage === "exam" && timeLeft <= 0 && !form.autoSubmitOnExpiry;

  useEffect(() => {
    if (stage === "exam" && timeLeft <= 0 && form.autoSubmitOnExpiry) setStage("done");
  }, [stage, timeLeft, form.autoSubmitOnExpiry]);

  const rules = [
    form.webcamMonitoring && "Your webcam stays on and is recorded for faculty review.",
    form.faceVerification && "Your identity is verified against your profile photo before you begin.",
    form.microphoneAnalysis && "Your microphone is monitored for voices and background speech.",
    form.tabSwitchDetection && "Switching tabs or windows is logged.",
    form.integrityConfig.browser.fullscreenExit && "The exam runs in full screen; leaving it is logged.",
    form.browserLockdown && form.integrityConfig.browser.copyPaste && "Copy, cut and paste are disabled.",
    form.negativeMarking && `Wrong objective answers may lose marks (default −${form.negativeMarkValue}). Blank answers are never penalised.`,
    form.allowResume ? `If you are disconnected you can resume within ${form.resumeTimeWindow} minutes (up to ${form.maxResumeCount} times).` : "Interrupted attempts cannot be resumed.",
    form.autoSubmitOnExpiry ? "Your answers are submitted automatically when time runs out." : "When time runs out your answers lock and you must submit.",
  ].filter(Boolean) as string[];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 bg-[#1a1917] p-0 text-[#fcfcfc] sm:max-w-none [&>button]:hidden">
        <DialogTitle className="sr-only">Assessment preview</DialogTitle>
        <DialogDescription className="sr-only">Student view of the configured assessment. Nothing is recorded.</DialogDescription>

        <div className="flex shrink-0 items-center justify-between gap-2 bg-amber-500 px-4 py-1.5 text-[12px] font-semibold text-zinc-950">
          <span className="flex items-center gap-1.5"><Eye className="size-3.5" /> Preview mode — this is what students will see. No proctoring runs and nothing is saved.</span>
          <button type="button" onClick={() => onOpenChange(false)} className="inline-flex items-center gap-1 rounded-md bg-zinc-950/10 px-2 py-0.5 text-[12px] font-semibold hover:bg-zinc-950/20">
            <X className="size-3.5" /> Exit preview
          </button>
        </div>

        {stage === "intro" && (
          <div className="flex-1 overflow-y-auto px-4 py-8">
            <div className="mx-auto max-w-2xl space-y-5">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">{form.assessmentType === "final" ? "Final examination" : form.assessmentType}</div>
                <h1 className="mt-1 text-2xl font-bold">{form.title || "Untitled assessment"}</h1>
                {course && <p className="mt-1 text-sm text-zinc-400">{course.code} — {course.name}</p>}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ["Duration", `${form.duration} min`],
                  ["Questions", summary.totalQuestions],
                  ["Total marks", total],
                  ["Pass mark", form.passingMarks ?? "—"],
                ].map(([k, v]) => (
                  <div key={String(k)} className="rounded-xl border border-zinc-800 bg-[#222222] px-3 py-2.5">
                    <div className="text-[10.5px] font-bold uppercase text-zinc-500">{k}</div>
                    <div className="text-lg font-bold">{v}</div>
                  </div>
                ))}
              </div>
              {form.description && (
                <div className="rounded-xl border border-zinc-800 bg-[#222222] p-4">
                  <div className="mb-1.5 text-xs font-bold text-zinc-400">Instructions</div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">{form.description}</p>
                </div>
              )}
              <div className="rounded-xl border border-zinc-800 bg-[#222222] p-4">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-zinc-400"><ShieldCheck className="size-4" /> Examination rules</div>
                <ul className="space-y-1.5 text-sm text-zinc-300">
                  {rules.map((r) => (
                    <li key={r} className="flex gap-2"><CheckCircle className="mt-0.5 size-3.5 shrink-0 text-emerald-400" /> {r}</li>
                  ))}
                </ul>
              </div>
              {form.materialsAccessible && (
                <div className="rounded-xl border border-zinc-800 bg-[#222222] p-4">
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-zinc-400"><BookOpen className="size-4" /> Permitted materials during the exam</div>
                  <MaterialsList materials={materials} />
                </div>
              )}
              {form.randomizeQuestions && <p className="text-xs text-zinc-500">Question order is randomized for each student; the preview shows the authored order.</p>}
              <button
                type="button"
                disabled={questions.length === 0}
                onClick={() => setStage("exam")}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#fcfcfc] px-5 text-sm font-bold text-zinc-950 hover:bg-white disabled:opacity-40"
              >
                <Play className="size-4" /> {questions.length ? "Start examination" : "Add questions to preview the exam"}
              </button>
            </div>
          </div>
        )}

        {stage === "exam" && current && (
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <div className="flex min-h-0 flex-1 flex-col">
              <header className="flex shrink-0 items-center gap-3 border-b border-zinc-800 px-4 py-3 sm:px-6">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-bold">{form.title || "Untitled assessment"}</h2>
                  <span className="text-[11px] text-zinc-400">Candidate: Preview student</span>
                </div>
                {form.materialsAccessible && (
                  <button type="button" onClick={() => setShowMaterials(true)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-zinc-700 bg-[#222222] px-2.5 text-xs font-bold text-zinc-200 hover:bg-zinc-800">
                    <BookOpen className="size-4" /> <span className="hidden md:inline">Materials</span>
                  </button>
                )}
                <div className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 ${timeLeft <= 300 ? "border-red-500/60 bg-red-950/40" : "border-zinc-800 bg-[#222222]"}`}>
                  <Clock className="size-4 text-[#b2b2b2]" />
                  <span className="font-mono text-sm font-extrabold tracking-wider text-[#b2b2b2]">{fmt(timeLeft)}</span>
                </div>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
                <div className="mx-auto max-w-3xl space-y-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-400">Question {idx + 1} of {questions.length}</span>
                    <span className="rounded border border-zinc-700 bg-zinc-800 px-2.5 py-0.5 text-[11px] uppercase text-white">
                      {current.difficulty} • {current.points} pts
                    </span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div className="h-full bg-[#b2b2b2] transition-all" style={{ width: `${(answered / questions.length) * 100}%` }} />
                  </div>
                  <div className="space-y-4 rounded-2xl border border-zinc-800 bg-[#222222] p-5">
                    <QuestionPrompt question={current} />
                    <div className="flex items-center justify-between border-t border-zinc-800/80 pt-3 text-xs">
                      <span className="text-zinc-400">Flag this question to review it later</span>
                      <button
                        type="button"
                        onClick={() => setMarked((m) => (m.includes(current.id) ? m.filter((x) => x !== current.id) : [...m, current.id]))}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${marked.includes(current.id) ? "border-amber-500 bg-amber-600 text-white" : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"}`}
                      >
                        {marked.includes(current.id) ? "★ Marked for Review" : "☆ Mark for Review"}
                      </button>
                    </div>
                  </div>
                  {timeUp && (
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-600/50 bg-amber-950/40 p-3 text-xs text-amber-200">
                      Time is up. Answers are locked — submit the examination.
                      <button type="button" onClick={() => setConfirm(true)} className="rounded-lg bg-amber-500 px-3 py-1.5 font-bold text-zinc-950">Submit now</button>
                    </div>
                  )}
                  <QuestionAnswerInput question={current} value={answers[current.id]} onChange={(v) => setAnswers((a) => ({ ...a, [current.id]: v }))} disabled={timeUp} />
                </div>
              </div>
              <nav className="flex shrink-0 items-center gap-2 border-t border-zinc-800 px-4 py-3 sm:px-6">
                <button type="button" disabled={idx === 0} onClick={() => setIdx(idx - 1)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-zinc-800 px-4 text-xs font-bold text-zinc-300 hover:bg-zinc-800 disabled:opacity-30">
                  <ChevronLeft className="size-4" /> Previous
                </button>
                <div className="flex-1" />
                {idx < questions.length - 1 ? (
                  <button type="button" onClick={() => setIdx(idx + 1)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[#fcfcfc] px-4 text-xs font-bold text-zinc-950">
                    Next <ChevronRight className="size-4" />
                  </button>
                ) : (
                  <button type="button" onClick={() => setConfirm(true)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white hover:bg-emerald-700">
                    Submit examination
                  </button>
                )}
              </nav>
            </div>
            <aside className="hidden w-72 shrink-0 border-l border-zinc-800 p-4 lg:block" aria-label="Question navigation">
              <div className="mb-2 text-xs font-bold text-zinc-400">Questions · {answered}/{questions.length} answered</div>
              <div className="grid grid-cols-5 gap-2">
                {questions.map((q, i) => {
                  const done = isAnswered(answers[q.id]);
                  const flag = marked.includes(q.id);
                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setIdx(i)}
                      aria-current={i === idx}
                      aria-label={`Question ${i + 1}${done ? ", answered" : ""}${flag ? ", marked for review" : ""}`}
                      className={`h-10 rounded-lg border text-xs font-bold ${i === idx ? "border-[#fcfcfc] ring-1 ring-[#fcfcfc]" : "border-zinc-800"} ${flag ? "bg-amber-600 text-white" : done ? "bg-[#b2b2b2] text-zinc-950" : "bg-[#222222] text-zinc-300"}`}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 space-y-1 text-[11px] text-zinc-400">
                {questions.map((q, i) => (
                  <div key={q.id} className="flex justify-between"><span>Q{i + 1}</span><span>{q.points} marks</span></div>
                ))}
                <div className="flex justify-between border-t border-zinc-800 pt-1 font-bold text-zinc-200"><span>Total</span><span>{total} marks</span></div>
              </div>
            </aside>
          </div>
        )}

        {stage === "done" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <CheckCircle className="size-10 text-emerald-400" />
            <h2 className="text-xl font-bold">Examination submitted</h2>
            <p className="max-w-md text-sm text-zinc-400">
              Students see this confirmation after submitting. {answered} of {questions.length} questions were answered in this preview. Objective questions are graded instantly; written and coding answers go to AI-assisted review.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setStage("intro"); setAnswers({}); setMarked([]); setIdx(0); setTimeLeft(Number(form.duration) * 60); }} className="rounded-xl border border-zinc-700 px-4 py-2 text-xs font-bold hover:bg-zinc-800">Restart preview</button>
              <button type="button" onClick={() => onOpenChange(false)} className="rounded-xl bg-[#fcfcfc] px-4 py-2 text-xs font-bold text-zinc-950">Back to builder</button>
            </div>
          </div>
        )}

        {confirm && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4" role="alertdialog" aria-modal="true" aria-labelledby="pv-confirm-title">
            <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-[#222222] p-5">
              <h3 id="pv-confirm-title" className="text-base font-bold">Submit examination?</h3>
              <p className="mt-1 text-sm text-zinc-400">
                {answered} of {questions.length} answered{marked.length ? `, ${marked.length} marked for review` : ""}. You cannot change answers after submitting.
              </p>
              {answered < questions.length && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-300"><AlertTriangle className="size-3.5" /> {questions.length - answered} question(s) unanswered.</p>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setConfirm(false)} className="rounded-xl border border-zinc-700 px-4 py-2 text-xs font-bold hover:bg-zinc-800">Keep working</button>
                <button type="button" onClick={() => { setConfirm(false); setStage("done"); }} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700">Submit</button>
              </div>
            </div>
          </div>
        )}

        {showMaterials && (
          <div className="fixed inset-0 z-[65] flex justify-end bg-black/60" role="dialog" aria-modal="true" aria-label="Permitted materials">
            <div className="h-full w-full max-w-md overflow-y-auto border-l border-zinc-800 bg-[#1a1917] p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-bold">Permitted reference materials</h2>
                <button type="button" onClick={() => setShowMaterials(false)} aria-label="Close materials" className="rounded-lg p-1.5 hover:bg-zinc-800"><X className="size-4" /></button>
              </div>
              <MaterialsList materials={materials} />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
