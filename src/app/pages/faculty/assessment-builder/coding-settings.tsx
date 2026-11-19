import React, { useRef, useState } from "react";
import { CheckCircle2, Loader2, Play, Plus, Trash2, XCircle } from "lucide-react";
import { Checkbox } from "../../../components/ui/checkbox";
import { cn } from "../../../components/ui/utils";
import { codingRequest, formatMemory, formatTime, VERDICT_LABEL, waitForExecution, type Execution, type Verdict } from "../../../components/code/coding-api";
import { CODING_LANGUAGE_KEYS, type CodingLanguageKey, type OutputMatchMode, type QuestionForm } from "./builder-model";
import { btn, Field, inputCls, NumberInput, Pill } from "./ui-kit";

type SetFn = <K extends keyof QuestionForm>(key: K, value: QuestionForm[K]) => void;

const OUTPUT_MATCH: { value: OutputMatchMode; label: string; hint: string }[] = [
  { value: "trim", label: "Trim whitespace", hint: "Ignores trailing spaces and blank lines at the end. Recommended." },
  { value: "exact", label: "Exact", hint: "Output must match character for character." },
  { value: "tokens", label: "Tokens", hint: "Compares whitespace-separated words; spacing and line breaks don't matter." },
];

/** Allowed languages, grading weights, output matching, rubric and confidence threshold. */
export function CodingGradingSettings({ q, set, pid, labelFor }: { q: QuestionForm; set: SetFn; pid: string; labelFor: (k: string) => string }) {
  const toggleLang = (k: CodingLanguageKey, on: boolean) => {
    const next = on ? [...q.allowedLanguages, k] : q.allowedLanguages.filter((x) => x !== k);
    set("allowedLanguages", CODING_LANGUAGE_KEYS.filter((x) => next.includes(x)));
  };
  const rubricTotal = q.rubric.reduce((s, r) => s + (Number(r.marks) || 0), 0);
  const updateRubric = (i: number, patch: Partial<QuestionForm["rubric"][number]>) =>
    set("rubric", q.rubric.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/50 p-3">
      <p className="text-[12.5px] font-semibold text-zinc-800">Grading</p>

      <fieldset className="space-y-1.5">
        <legend className="text-[12.5px] font-semibold text-zinc-700">Allowed languages</legend>
        <div className="flex flex-wrap gap-3">
          {CODING_LANGUAGE_KEYS.map((k) => (
            <label key={k} className="flex items-center gap-1.5 text-[12.5px] text-zinc-700">
              <Checkbox checked={q.allowedLanguages.includes(k)} onCheckedChange={(v) => toggleLang(k, v === true)} aria-label={`Allow ${labelFor(k)}`} />
              {labelFor(k)}
            </label>
          ))}
        </div>
        <p className="text-[11.5px] text-zinc-500">
          {q.allowedLanguages.length === 0 ? "None selected — students may use any of the four languages." : "Students can switch between the selected languages."}
        </p>
      </fieldset>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Test case weight" htmlFor={`${pid}-tw`} hint={`${q.testWeightPercent}% from tests · ${100 - q.testWeightPercent}% from the rubric (AI-assessed).`}>
          <NumberInput id={`${pid}-tw`} value={q.testWeightPercent} onChange={(v) => set("testWeightPercent", Math.min(100, Math.max(0, v ?? 0)))} min={0} max={100} step={5} suffix="%" />
        </Field>
        <Field label="AI confidence threshold" htmlFor={`${pid}-ct`} hint="Evaluations below this confidence are flagged for review. Leave empty for the default (70%).">
          <NumberInput
            id={`${pid}-ct`}
            value={q.confidenceThreshold}
            onChange={(v) => set("confidenceThreshold", v == null ? null : Math.min(100, Math.max(0, Math.round(v))))}
            min={0}
            max={100}
            step={5}
            suffix="%"
            placeholder="70"
          />
        </Field>
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-[12.5px] font-semibold text-zinc-700">Output matching</legend>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {OUTPUT_MATCH.map((m) => (
            <label
              key={m.value}
              className={cn(
                "flex cursor-pointer items-start gap-2 rounded-lg border bg-white p-2",
                q.outputMatch === m.value ? "border-zinc-900" : "border-zinc-200 hover:border-zinc-300",
              )}
            >
              <input type="radio" name={`${pid}-om`} checked={q.outputMatch === m.value} onChange={() => set("outputMatch", m.value)} className="mt-0.5 size-4 accent-zinc-900" />
              <span>
                <span className="block text-[12.5px] font-semibold text-zinc-800">{m.label}</span>
                <span className="block text-[11.5px] text-zinc-500">{m.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[12.5px] font-semibold text-zinc-700">
            Rubric <span className="font-normal text-zinc-500">· relative weights within the {100 - q.testWeightPercent}% rubric share</span>
          </span>
          <button type="button" className={btn.ghost} disabled={q.rubric.length >= 10} onClick={() => set("rubric", [...q.rubric, { criterion: "", marks: 1, description: "" }])}>
            <Plus className="size-3.5" /> Add criterion
          </button>
        </div>
        {q.rubric.length === 0 && <p className="text-[12px] text-zinc-500">No rubric criteria — marks come from test cases only.</p>}
        {q.rubric.map((r, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 rounded-lg border border-zinc-200 bg-white p-2 md:grid-cols-[1.2fr_90px_2fr_auto]">
            <input value={r.criterion} onChange={(e) => updateRubric(i, { criterion: e.target.value })} placeholder="Criterion" aria-label={`Rubric ${i + 1} criterion`} className={inputCls} />
            <NumberInput value={r.marks} onChange={(v) => updateRubric(i, { marks: Math.max(0, v ?? 0) })} min={0} step={0.5} aria-label={`Rubric ${i + 1} weight`} />
            <input value={r.description} onChange={(e) => updateRubric(i, { description: e.target.value })} placeholder="What the evaluator should look for (optional)" aria-label={`Rubric ${i + 1} description`} className={inputCls} />
            <button type="button" className={btn.danger} onClick={() => set("rubric", q.rubric.filter((_, j) => j !== i))} aria-label={`Remove rubric criterion ${i + 1}`}>
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
        {q.rubric.length > 0 && <p className="text-[11.5px] text-zinc-500">Total weight {rubricTotal}; each criterion's share is its weight ÷ {rubricTotal || 1}.</p>}
      </div>
    </div>
  );
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Runs the reference solution against every test case (hidden included) in the sandbox. */
export function ReferenceSolutionTester({ q }: { q: QuestionForm }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Execution | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  React.useEffect(() => () => abortRef.current?.abort(), []);

  const canRun = !!q.modelAnswer.trim() && q.testCases.length > 0 && CODING_LANGUAGE_KEYS.includes(q.language as CodingLanguageKey);
  const why = !q.modelAnswer.trim()
    ? "Write a reference solution first."
    : q.testCases.length === 0
      ? "Add at least one test case."
      : !CODING_LANGUAGE_KEYS.includes(q.language as CodingLanguageKey)
        ? "Choose C, C++, Java or Python."
        : null;

  const run = async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const exec = await codingRequest<Execution>("/faculty/run", {
        method: "POST",
        body: JSON.stringify({
          language: q.language,
          sourceCode: q.modelAnswer,
          mode: "sample",
          questionId: q.id || undefined,
          timeLimitMs: clamp(Math.round(Number(q.timeLimitMs) || 2000), 500, 10000),
          memoryLimitMb: clamp(Math.round(Number(q.memoryLimitMb) || 256), 32, 512),
          testCases: q.testCases.slice(0, 50).map((t) => ({ input: t.input, output: t.output, hidden: t.hidden })),
        }),
      });
      const done = await waitForExecution(exec.id, { signal: ac.signal });
      if (!ac.signal.aborted) setResult(done);
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setError(
        err?.status === 503 || err?.status === 502
          ? "The code execution service is unavailable right now. Your question is still saved — try again later."
          : err?.message || "Could not run the reference solution.",
      );
    } finally {
      if (abortRef.current === ac) setBusy(false);
    }
  };

  const samples = result?.sampleResults ?? [];
  const passed = samples.filter((s) => s.passed).length;
  const infra = result?.verdict === "infra_error";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn.secondary} onClick={() => void run()} disabled={busy || !canRun} title={why ?? undefined}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
          {busy ? "Running…" : "Test reference solution"}
        </button>
        {why && !busy && <span className="text-[11.5px] text-zinc-500">{why}</span>}
        {result && !infra && samples.length > 0 && (
          <Pill tone={passed === samples.length ? "emerald" : "rose"}>
            {passed}/{samples.length} tests passed
          </Pill>
        )}
      </div>
      {q.testCases.length > 50 && <p className="text-[11.5px] text-amber-700">Only the first 50 test cases are run.</p>}

      {error && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">{error}</p>}

      {result && infra && (
        <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          The execution service had a problem running this (not a fault in the solution). {result.infraError ?? ""}
        </p>
      )}

      {result && !infra && result.verdict === "compilation_error" && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-2">
          <p className="text-[12px] font-semibold text-rose-700">The reference solution does not compile.</p>
          {result.compileOutput && <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11.5px] text-rose-800">{result.compileOutput}</pre>}
        </div>
      )}

      {result && !infra && samples.length > 0 && (
        <ul className="space-y-1.5">
          {samples.map((s) => (
            <li key={s.index} className={cn("rounded-lg border p-2 text-[12px]", s.passed ? "border-emerald-200 bg-emerald-50/50" : "border-rose-200 bg-rose-50/50")}>
              <div className="flex flex-wrap items-center gap-2">
                {s.passed ? <CheckCircle2 className="size-3.5 text-emerald-600" /> : <XCircle className="size-3.5 text-rose-600" />}
                <span className="font-semibold text-zinc-800">Test {s.index + 1}</span>
                {q.testCases[s.index]?.hidden && <Pill>Hidden</Pill>}
                <span className={s.passed ? "text-emerald-700" : "text-rose-700"}>{VERDICT_LABEL[s.verdict as Verdict] ?? s.verdict}</span>
                <span className="ml-auto text-[11px] text-zinc-500">
                  {formatTime(s.timeMs)} · {formatMemory(s.memoryKb)}
                </span>
              </div>
              {!s.passed && (
                <div className="mt-1.5 grid grid-cols-1 gap-2 md:grid-cols-2">
                  <div>
                    <p className="text-[10.5px] font-semibold uppercase text-zinc-500">Expected</p>
                    <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-white p-1.5 font-mono text-[11.5px]">{s.expectedOutput || "∅"}</pre>
                  </div>
                  <div>
                    <p className="text-[10.5px] font-semibold uppercase text-zinc-500">Actual</p>
                    <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-white p-1.5 font-mono text-[11.5px]">{s.actualOutput || "∅"}</pre>
                  </div>
                  {s.stderr && <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-white p-1.5 font-mono text-[11.5px] text-rose-700 md:col-span-2">{s.stderr}</pre>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {result && !infra && samples.length === 0 && result.verdict !== "compilation_error" && (
        <p className="text-[12px] text-zinc-600">Run finished: {result.verdict ? VERDICT_LABEL[result.verdict] : result.status}.</p>
      )}
    </div>
  );
}
