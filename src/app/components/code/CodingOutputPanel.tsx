import { CheckCircle2, Clock, Cpu, Loader2, ServerCrash, XCircle } from "lucide-react";
import { formatMemory, formatTime, VERDICT_LABEL, type Execution, type ExecMode, type Verdict } from "./coding-api";

export type OutputTab = "output" | "errors" | "tests";

const MODE_LABEL: Record<ExecMode, string> = { compile: "Compile", run: "Run", sample: "Sample tests" };

const isInfra = (e: Execution) => e.verdict === "infra_error" || (e.status === "failed" && !e.verdict);

/** "Success" for a clean compile instead of the generic accepted label. */
function verdictText(e: Execution): string {
  if (isInfra(e)) return VERDICT_LABEL.infra_error;
  if (!e.verdict) return e.status === "queued" ? "Queued" : "Running";
  if (e.mode === "compile" && e.verdict === "accepted") return "Compiled successfully";
  if (e.mode === "sample" && e.sampleResults) {
    const passed = e.sampleResults.filter((r) => r.passed).length;
    return `${passed}/${e.sampleResults.length} sample tests passed`;
  }
  return VERDICT_LABEL[e.verdict as Verdict] ?? e.verdict;
}

function Pre({ text, empty, tone = "default" }: { text: string | null | undefined; empty: string; tone?: "default" | "error" }) {
  if (!text) return <p className="px-3 py-3 text-xs text-zinc-500 italic">{empty}</p>;
  return (
    <pre
      className={`px-3 py-2.5 text-xs font-mono whitespace-pre-wrap break-words select-text ${tone === "error" ? "text-rose-200" : "text-zinc-200"}`}
    >
      {text}
    </pre>
  );
}

export function CodingOutputPanel({
  execution,
  running,
  elapsedMs,
  tab,
  onTab,
}: {
  execution: Execution | null;
  running: ExecMode | null;
  elapsedMs: number;
  tab: OutputTab;
  onTab: (t: OutputTab) => void;
}) {
  const e = execution;
  const infra = e ? isInfra(e) : false;
  const errorText = e ? [e.compileOutput, e.stderr].filter(Boolean).join("\n") : "";
  const hasTests = Boolean(e?.sampleResults?.length);
  const good = e && !infra && e.verdict === "accepted" && (!e.sampleResults || e.sampleResults.every((r) => r.passed));

  const tabs: { key: OutputTab; label: string; badge?: string }[] = [
    { key: "output", label: "Output" },
    { key: "errors", label: "Errors", badge: errorText ? "!" : undefined },
  ];
  if (hasTests) tabs.push({ key: "tests", label: "Sample tests" });
  const activeTab = tab === "tests" && !hasTests ? "output" : tab;

  return (
    <section className="flex flex-col min-h-0 rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden" aria-label="Execution output">
      {/* Status line */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-zinc-800 bg-zinc-900/70 px-3 py-2 text-[11px]" aria-live="polite">
        {running ? (
          <span className="inline-flex items-center gap-1.5 font-semibold text-sky-300">
            <Loader2 className="size-3.5 animate-spin" />
            {MODE_LABEL[running]} in progress… {(elapsedMs / 1000).toFixed(1)}s
          </span>
        ) : e ? (
          <>
            <span
              className={`inline-flex items-center gap-1.5 font-bold ${
                infra ? "text-zinc-300" : good ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {infra ? <ServerCrash className="size-3.5" /> : good ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
              {verdictText(e)}
            </span>
            <span className="text-zinc-500">{MODE_LABEL[e.mode]}</span>
            {!infra && e.mode !== "compile" && (
              <>
                <span className="inline-flex items-center gap-1 text-zinc-400"><Clock className="size-3" />{formatTime(e.timeMs)}</span>
                <span className="inline-flex items-center gap-1 text-zinc-400"><Cpu className="size-3" />{formatMemory(e.memoryKb)}</span>
              </>
            )}
            {e.exitCode != null && e.exitCode !== 0 && !infra && <span className="text-zinc-500">exit code {e.exitCode}</span>}
          </>
        ) : (
          <span className="text-zinc-500">Compile or run your code to see output here.</span>
        )}
      </div>

      {e && infra && !running && (
        <div className="border-b border-zinc-800 bg-zinc-900 px-3 py-2 text-[11px] text-zinc-300" role="status">
          The code execution service had a problem running this request. This is not caused by your code — your work is saved.
          Try again in a moment.{e.infraError ? <span className="block mt-0.5 text-zinc-500">Details: {e.infraError}</span> : null}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-zinc-800 text-[11px] font-bold" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={activeTab === t.key}
            onClick={() => onTab(t.key)}
            className={`px-3 py-2 cursor-pointer border-b-2 -mb-px transition ${
              activeTab === t.key ? "border-[#b2b2b2] text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t.label}
            {t.badge && <span className="ml-1.5 inline-block size-1.5 rounded-full bg-rose-500 align-middle" aria-label="has errors" />}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-28 max-h-[22rem] overflow-auto" role="tabpanel">
        {activeTab === "output" && (
          <Pre
            text={e?.stdout}
            empty={!e ? "No output yet." : e.mode === "compile" ? "Compile checks only build errors; use Run to see program output." : e.mode === "sample" ? "See the Sample tests tab." : "The program printed nothing to stdout."}
          />
        )}
        {activeTab === "errors" && <Pre text={errorText} empty="No compiler or runtime errors." tone="error" />}
        {activeTab === "tests" && e?.sampleResults && (
          <ul className="divide-y divide-zinc-800">
            {e.sampleResults.map((r) => (
              <li key={r.index} className="px-3 py-2.5 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className={`inline-flex items-center gap-1 font-bold ${r.passed ? "text-emerald-400" : "text-rose-400"}`}>
                    {r.passed ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
                    Test {r.index + 1}: {r.passed ? "Passed" : "Failed"}
                  </span>
                  {!r.passed && r.verdict && <span className="text-zinc-400">{VERDICT_LABEL[r.verdict as Verdict] ?? r.verdict}</span>}
                  <span className="text-zinc-500">{formatTime(r.timeMs)} · {formatMemory(r.memoryKb)}</span>
                </div>
                <div className="grid grid-cols-1 @lg:grid-cols-3 gap-1.5 text-[11px]">
                  {[
                    ["Input", r.input],
                    ["Expected", r.expectedOutput],
                    ["Your output", r.actualOutput],
                  ].map(([label, text]) => (
                    <div key={label} className="min-w-0">
                      <div className="mb-0.5 font-semibold text-zinc-500">{label}</div>
                      <pre className="rounded bg-zinc-900 border border-zinc-800 p-1.5 font-mono text-zinc-200 whitespace-pre-wrap break-words max-h-32 overflow-auto">
                        {text || "(empty)"}
                      </pre>
                    </div>
                  ))}
                </div>
                {r.stderr && <pre className="rounded bg-rose-950/30 border border-rose-900/50 p-1.5 font-mono text-[11px] text-rose-200 whitespace-pre-wrap break-words max-h-32 overflow-auto">{r.stderr}</pre>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
