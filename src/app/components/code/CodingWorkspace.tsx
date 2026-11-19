import React from "react";
import type { Socket } from "socket.io-client";
import { toast } from "sonner";
import {
  AlertTriangle,
  Clock,
  FileCode2,
  Hammer,
  History,
  Loader2,
  Maximize2,
  Minimize2,
  Play,
  RotateCcw,
  Save,
  Send,
  ServerCrash,
  TestTube2,
} from "lucide-react";
import { CodeEditor, errorLinesFrom } from "./CodeEditor";
import {
  CodingApiError,
  codingRequest,
  getHealth,
  isFinished,
  waitForExecution,
  type CodeLanguage,
  type ExecMode,
  type Execution,
  type ExecutorHealth,
} from "./coding-api";
import { CodingOutputPanel, type OutputTab } from "./CodingOutputPanel";
import {
  readLocalDraft,
  registerCodingFlusher,
  workspacePath,
  writeLocalDraft,
  type CodingWorkspaceData,
  type SubmitResult,
  type WorkspaceSubmission,
} from "./workspace-api";
import { createAuthedSocket } from "../../utils/socket-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";

/**
 * Full coding environment for one question during a live exam: Monaco editor,
 * per-language drafts with autosave (server + local mirror), compile / run /
 * sample tests through the sandbox, and versioned submissions.
 */

export interface CodingWorkspaceProps {
  attemptId: string;
  questionId: string;
  maxMarks?: number;
  timeLeftSeconds?: number;
  disabled?: boolean;
  onCodeChange?: (code: string) => void;
}

type SaveState = "saved" | "saving" | "dirty" | "error" | "failed";
type CodeMap = Partial<Record<CodeLanguage, string>>;

const AUTOSAVE_MS = 1500;
const RETRY_MS = 5000;

const fmtClock = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const fmtCountdown = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  return `${h > 0 ? `${h}:` : ""}${String(m).padStart(h > 0 ? 2 : 1, "0")}:${String(sec).padStart(2, "0")}`;
};
const errMessage = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
/** Network failures, 5xx, 408 and 429 are worth retrying; other 4xx are not. */
const retryable = (e: unknown) => !(e instanceof CodingApiError) || e.status >= 500 || e.status === 408 || e.status === 429;

const btn =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-40";
const btnGhost = `${btn} border-zinc-800 bg-zinc-900 text-zinc-200 hover:bg-zinc-800`;
const btnPrimary = `${btn} border-[#b2b2b2] bg-[#b2b2b2] text-zinc-950 hover:bg-zinc-200`;
const dialogCls = "bg-zinc-900 border-zinc-800 text-zinc-100";

export function CodingWorkspace({ attemptId, questionId, maxMarks, timeLeftSeconds, disabled = false, onCodeChange }: CodingWorkspaceProps) {
  const base = workspacePath(attemptId, questionId);

  const [ws, setWs] = React.useState<CodingWorkspaceData | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [health, setHealth] = React.useState<ExecutorHealth | null>(null);
  const [healthFailed, setHealthFailed] = React.useState(false);

  const [lang, setLangState] = React.useState<CodeLanguage | null>(null);
  const langRef = React.useRef<CodeLanguage | null>(null);
  const [codes, setCodes] = React.useState<CodeMap>({});
  const codesRef = React.useRef<CodeMap>({});
  /** Content the server currently holds (or the starter code when it holds nothing). */
  const savedRef = React.useRef<CodeMap>({});
  /** Languages to save even if unchanged (so the language on screen becomes the graded one). */
  const forceRef = React.useRef(new Set<CodeLanguage>());
  const [saveState, setSaveState] = React.useState<SaveState>("saved");
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const inflight = React.useRef<Promise<void> | null>(null);
  const debounceTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const editableRef = React.useRef(false);

  const [stdin, setStdin] = React.useState("");
  const [running, setRunning] = React.useState<ExecMode | null>(null);
  const runStartedAt = React.useRef(0);
  const [elapsedMs, setElapsedMs] = React.useState(0);
  const [execution, setExecution] = React.useState<Execution | null>(null);
  const [outputTab, setOutputTab] = React.useState<OutputTab>("output");
  const socketRef = React.useRef<Socket | null>(null);
  const socketResults = React.useRef(new Map<string, Execution>());
  const socketWaiters = React.useRef(new Map<string, (e: Execution) => void>());
  const runAbort = React.useRef<AbortController | null>(null);

  const [submissions, setSubmissions] = React.useState<WorkspaceSubmission[]>([]);
  const [submitOpen, setSubmitOpen] = React.useState(false);
  const [resetOpen, setResetOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [fullscreen, setFullscreen] = React.useState(false);

  const onCodeChangeRef = React.useRef(onCodeChange);
  onCodeChangeRef.current = onCodeChange;

  const readOnly = disabled || !ws?.editable;
  editableRef.current = !readOnly;

  /* ---------------- persistence ---------------- */

  const dirtyLangs = React.useCallback(
    () => (Object.keys(codesRef.current) as CodeLanguage[]).filter((l) => codesRef.current[l] !== savedRef.current[l] || forceRef.current.has(l)),
    [],
  );

  const scheduleSave = React.useRef<(ms: number) => void>(() => {});

  const saveNow = React.useCallback(async (): Promise<void> => {
    while (inflight.current) await inflight.current;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (retryTimer.current) clearTimeout(retryTimer.current);
    if (!editableRef.current) return;
    const targets = dirtyLangs();
    if (targets.length === 0) {
      setSaveState("saved");
      return;
    }
    // Save the language on screen last: the server treats the newest draft as the active one.
    const active = langRef.current;
    targets.sort((a, b) => (a === active ? 1 : 0) - (b === active ? 1 : 0));
    let failure: unknown = null;
    const job = (async () => {
      setSaveState("saving");
      for (const l of targets) {
        const code = codesRef.current[l] ?? "";
        try {
          const r = await codingRequest<{ updatedAt: string }>(`${base}/draft`, {
            method: "PUT",
            body: JSON.stringify({ language: l, sourceCode: code }),
          });
          savedRef.current[l] = code;
          forceRef.current.delete(l);
          setSavedAt(r?.updatedAt ? new Date(r.updatedAt) : new Date());
        } catch (e) {
          failure = e;
        }
      }
    })();
    inflight.current = job;
    try {
      await job;
    } finally {
      inflight.current = null;
    }
    if (failure) {
      if (retryable(failure)) {
        setSaveState("error");
        retryTimer.current = setTimeout(() => void saveNow(), RETRY_MS);
      } else {
        setSaveState("failed");
        toast.error(errMessage(failure, "Could not save your code."), { id: `code-save-${questionId}` });
      }
      return;
    }
    if (dirtyLangs().length > 0) {
      setSaveState("dirty");
      scheduleSave.current(AUTOSAVE_MS);
    } else setSaveState("saved");
  }, [base, dirtyLangs, questionId]);

  scheduleSave.current = (ms: number) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => void saveNow(), ms);
  };

  // Save on unmount (e.g. navigating to another question) and expose a flush for the final exam submit.
  React.useEffect(() => {
    const unregister = registerCodingFlusher(saveNow);
    return () => {
      unregister();
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (retryTimer.current) clearTimeout(retryTimer.current);
      if (editableRef.current && dirtyLangs().length > 0) void saveNow();
    };
  }, [saveNow, dirtyLangs]);

  // Warn before leaving with unsaved changes.
  const hasUnsaved = saveState !== "saved";
  React.useEffect(() => {
    if (!hasUnsaved || readOnly) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsaved, readOnly]);

  /* ---------------- load ---------------- */

  React.useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    codingRequest<CodingWorkspaceData>(`${base}/workspace`)
      .then((data) => {
        if (cancelled) return;
        const nextCodes: CodeMap = {};
        const saved: CodeMap = {};
        let newest = 0;
        for (const l of data.languages) {
          const draft = data.drafts.find((d) => d.language === l.key);
          const serverTime = draft ? Date.parse(draft.updatedAt) : 0;
          newest = Math.max(newest, serverTime);
          let code = draft?.sourceCode ?? l.starterCode ?? "";
          const local = data.editable ? readLocalDraft(attemptId, questionId, l.key) : null;
          if (local && local.code !== code && (!draft || local.updatedAt > serverTime)) code = local.code;
          nextCodes[l.key] = code;
          saved[l.key] = draft?.sourceCode ?? l.starterCode ?? "";
        }
        if (!data.editable) Object.assign(saved, nextCodes);
        const first =
          data.activeLanguage && data.languages.some((l) => l.key === data.activeLanguage) ? data.activeLanguage : data.languages[0]?.key ?? null;
        codesRef.current = nextCodes;
        savedRef.current = saved;
        forceRef.current.clear();
        langRef.current = first;
        editableRef.current = data.editable && !disabled;
        setCodes(nextCodes);
        setLangState(first);
        setWs(data);
        setStdin(data.sampleInput ?? "");
        setSubmissions(data.submissions ?? []);
        setSavedAt(newest ? new Date(newest) : null);
        const last = data.executions?.find(isFinished) ?? null;
        setExecution(last);
        if (editableRef.current && dirtyLangs().length > 0) {
          setSaveState("dirty");
          scheduleSave.current(300);
        } else setSaveState("saved");
      })
      .catch((e) => !cancelled && setLoadError(errMessage(e, "Could not load the coding workspace.")));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, reloadKey]);

  // Execution service health; re-check every minute while it's down.
  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = () =>
      getHealth()
        .then((h) => {
          if (cancelled) return;
          setHealth(h);
          setHealthFailed(false);
          if (!h.reachable) timer = setTimeout(check, 60000);
        })
        .catch(() => {
          if (cancelled) return;
          setHealthFailed(true);
          timer = setTimeout(check, 60000);
        });
    void check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Socket for execution results (lazy: created on the first run).
  React.useEffect(
    () => () => {
      runAbort.current?.abort();
      socketRef.current?.disconnect();
      socketRef.current = null;
    },
    [],
  );
  const ensureSocket = () => {
    if (socketRef.current) return;
    try {
      const s = createAuthedSocket();
      s.on("code:execution", (e: Execution) => {
        if (!e?.id) return;
        socketResults.current.set(e.id, e);
        if (socketResults.current.size > 30) socketResults.current.delete(socketResults.current.keys().next().value as string);
        if (isFinished(e)) socketWaiters.current.get(e.id)?.(e);
      });
      socketRef.current = s;
    } catch {
      /* polling covers it */
    }
  };
  const waitViaSocket = (id: string, signal: AbortSignal) =>
    new Promise<Execution>((resolve, reject) => {
      const early = socketResults.current.get(id);
      if (early && isFinished(early)) return resolve(early);
      socketWaiters.current.set(id, resolve);
      signal.addEventListener("abort", () => {
        socketWaiters.current.delete(id);
        reject(new DOMException("Aborted", "AbortError"));
      });
    });

  // Elapsed counter while running.
  React.useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsedMs(Date.now() - runStartedAt.current), 100);
    return () => clearInterval(t);
  }, [running]);

  // Full screen: Esc exits (unless a dialog is handling it).
  React.useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !submitOpen && !resetOpen) setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [fullscreen, submitOpen, resetOpen]);

  /* ---------------- actions ---------------- */

  const langMeta = ws?.languages.find((l) => l.key === lang) ?? null;
  const code = lang ? codes[lang] ?? "" : "";

  const setCode = (l: CodeLanguage, next: string, opts: { force?: boolean } = {}) => {
    codesRef.current = { ...codesRef.current, [l]: next };
    setCodes(codesRef.current);
    writeLocalDraft(attemptId, questionId, l, next);
    if (opts.force) forceRef.current.add(l);
    setSaveState((s) => (s === "saving" ? s : dirtyLangs().length > 0 ? "dirty" : "saved"));
    scheduleSave.current(AUTOSAVE_MS);
    onCodeChangeRef.current?.(next);
  };

  const onEdit = (next: string) => {
    if (!lang || readOnly || next === codesRef.current[lang]) return;
    setCode(lang, next);
  };

  const switchLanguage = (next: CodeLanguage) => {
    if (next === lang) return;
    langRef.current = next;
    setLangState(next);
    if (readOnly) return;
    // Saving the newly selected language makes it the one that is graded.
    forceRef.current.add(next);
    setSaveState("dirty");
    scheduleSave.current(300);
    onCodeChangeRef.current?.(codesRef.current[next] ?? "");
  };

  const doReset = () => {
    if (!lang || !langMeta) return;
    setCode(lang, langMeta.starterCode ?? "", { force: true });
    toast.success(`${langMeta.label} code reset to the starter template.`);
  };

  const serviceDown = healthFailed || (health !== null && !health.reachable);
  const langUnavailable = Boolean(health?.reachable && lang && health.supported.find((s) => s.key === lang)?.available === false);
  const canExecute = !readOnly && !serviceDown && !langUnavailable && !running && !!lang;

  const run = async (mode: ExecMode) => {
    if (!lang || running || !canExecute) return;
    ensureSocket();
    runAbort.current?.abort();
    const ac = new AbortController();
    runAbort.current = ac;
    runStartedAt.current = Date.now();
    setElapsedMs(0);
    setRunning(mode);
    try {
      const started = await codingRequest<Execution>(`${base}/run`, {
        method: "POST",
        body: JSON.stringify({ language: lang, sourceCode: codesRef.current[lang] ?? "", mode, ...(mode === "run" ? { stdin } : {}) }),
      });
      setExecution(started);
      const done = isFinished(started)
        ? started
        : await Promise.race([waitForExecution(started.id, { signal: ac.signal }), waitViaSocket(started.id, ac.signal)]);
      if (ac.signal.aborted && runAbort.current !== ac) return;
      setExecution(done);
      const hasErr = Boolean(done.compileOutput || done.stderr) && done.verdict !== "accepted";
      setOutputTab(done.mode === "sample" && done.sampleResults?.length ? "tests" : hasErr || done.verdict === "compilation_error" ? "errors" : "output");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (e instanceof CodingApiError && e.status === 429) toast.warning(e.message, { id: `code-run-429-${questionId}` });
      else toast.error(errMessage(e, "Could not run your code."));
    } finally {
      if (runAbort.current === ac) {
        ac.abort();
        runAbort.current = null;
      }
      socketWaiters.current.clear();
      setRunning(null);
    }
  };

  const submit = async () => {
    if (!lang || readOnly || submitting) return;
    setSubmitting(true);
    try {
      const source = codesRef.current[lang] ?? "";
      const r = await codingRequest<SubmitResult>(`${base}/submit`, {
        method: "POST",
        body: JSON.stringify({ language: lang, sourceCode: source }),
      });
      void saveNow();
      if (r.created) {
        setSubmissions((prev) => [
          { id: r.id, version: r.version, language: r.language, submittedAt: r.submittedAt, source: "student", isLatest: true },
          ...prev.map((s) => ({ ...s, isLatest: false })),
        ]);
        toast.success(`Version ${r.version} submitted.`);
      } else {
        toast.info(`No changes since version ${r.version} — no new version was created.`);
      }
      setSubmitOpen(false);
    } catch (e) {
      toast.error(errMessage(e, "Could not submit your code."));
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------------- render ---------------- */

  if (loadError) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-300 flex flex-wrap items-center justify-between gap-3" role="alert">
        <span className="inline-flex items-center gap-2"><AlertTriangle className="size-4 text-amber-400" /> {loadError}</span>
        <button type="button" className={btnGhost} onClick={() => setReloadKey((k) => k + 1)}>Retry</button>
      </div>
    );
  }
  if (!ws || !lang || !langMeta) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 h-64 flex items-center justify-center text-xs text-zinc-400 gap-2">
        {ws && ws.languages.length === 0 ? (
          "No programming language is enabled for this question. Ask your invigilator for help."
        ) : (
          <><Loader2 className="size-4 animate-spin" /> Loading coding workspace…</>
        )}
      </div>
    );
  }

  const errorLines =
    execution && execution.language === lang && (execution.verdict === "compilation_error" || execution.verdict === "runtime_error")
      ? errorLinesFrom([execution.compileOutput, execution.stderr].filter(Boolean).join("\n"))
      : [];
  const saveChip = (() => {
    switch (saveState) {
      case "saving":
        return { text: "Saving…", cls: "text-sky-300 border-sky-900/60" };
      case "dirty":
        return { text: "Unsaved changes", cls: "text-amber-300 border-amber-900/60" };
      case "error":
        return { text: "Save failed — retrying", cls: "text-rose-300 border-rose-900/60" };
      case "failed":
        return { text: "Save failed", cls: "text-rose-300 border-rose-900/60" };
      default:
        return { text: savedAt ? `Saved · ${fmtClock(savedAt)}` : "Saved", cls: "text-emerald-300 border-emerald-900/60" };
    }
  })();
  const marks = maxMarks ?? ws.maxMarks;
  const lowTime = timeLeftSeconds != null && timeLeftSeconds <= 300;

  return (
    <div
      className={
        fullscreen
          ? "@container fixed inset-0 z-40 flex flex-col gap-2 bg-[#141414] p-2 sm:p-3 overflow-auto"
          : "@container flex flex-col gap-2"
      }
      role={fullscreen ? "dialog" : undefined}
      aria-label={fullscreen ? "Coding workspace (full screen)" : undefined}
    >
      {serviceDown && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 flex items-start gap-2" role="status">
          <ServerCrash className="size-4 shrink-0 text-zinc-400 mt-0.5" />
          <span>Code execution service unavailable — your code is still saved and will be graded after the exam. Compile and Run are disabled until it is back.</span>
        </div>
      )}
      {langUnavailable && !serviceDown && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200" role="status">
          {langMeta.label} can't be run right now. Your code is still saved and will be graded after the exam.
        </div>
      )}

      {/* Header: file tab, language, timer, save status */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/70 px-2.5 py-2">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-xs text-zinc-100">
          <FileCode2 className="size-3.5 text-zinc-400" /> {langMeta.fileName}
        </span>
        <label className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400">
          <span className="sr-only @md:not-sr-only">Language</span>
          <select
            value={lang}
            disabled={readOnly || running !== null || ws.languages.length < 2}
            onChange={(e) => switchLanguage(e.target.value as CodeLanguage)}
            className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs font-semibold text-zinc-100 focus:outline-none focus:border-[#b2b2b2] disabled:opacity-70 cursor-pointer"
            aria-label="Programming language"
          >
            {ws.languages.map((l) => (
              <option key={l.key} value={l.key}>{l.label}</option>
            ))}
          </select>
        </label>
        <span className="hidden @lg:inline text-[11px] text-zinc-500">
          {ws.limits.timeLimitMs} ms · {ws.limits.memoryLimitMb} MB{marks ? ` · ${marks} marks` : ""}
        </span>
        <span className="flex-1" />
        {timeLeftSeconds != null && (
          <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-[11px] font-bold ${lowTime ? "border-rose-900/60 text-rose-300" : "border-zinc-800 text-zinc-300"}`} aria-label="Exam time remaining">
            <Clock className="size-3" /> {fmtCountdown(timeLeftSeconds)}
          </span>
        )}
        {readOnly ? (
          <span className="rounded-md border border-zinc-800 px-2 py-1 text-[11px] text-zinc-400">Read-only</span>
        ) : (
          <span className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${saveChip.cls}`} aria-live="polite">{saveChip.text}</span>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={btnGhost} disabled={!canExecute} onClick={() => void run("compile")} title="Check that the code builds">
          <Hammer className="size-3.5" /> Compile
        </button>
        <button type="button" className={btnGhost} disabled={!canExecute} onClick={() => void run("run")} title="Run with the custom input below">
          <Play className="size-3.5" /> Run
        </button>
        {ws.publicTests.length > 0 && (
          <button type="button" className={btnGhost} disabled={!canExecute} onClick={() => void run("sample")}>
            <TestTube2 className="size-3.5" /> Run sample tests
          </button>
        )}
        <span className="flex-1" />
        <button type="button" className={btnGhost} disabled={readOnly || saveState === "saved" || saveState === "saving"} onClick={() => void saveNow()}>
          <Save className="size-3.5" /> Save
        </button>
        <button type="button" className={btnGhost} disabled={readOnly || running !== null} onClick={() => setResetOpen(true)}>
          <RotateCcw className="size-3.5" /> Reset
        </button>
        <button
          type="button"
          className={btnGhost}
          onClick={() => setFullscreen((f) => !f)}
          aria-pressed={fullscreen}
          title={fullscreen ? "Exit full screen (Esc)" : "Full screen"}
        >
          {fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          <span className="hidden @md:inline">{fullscreen ? "Exit full screen" : "Full screen"}</span>
        </button>
        <button type="button" className={btnPrimary} disabled={readOnly || submitting} onClick={() => setSubmitOpen(true)}>
          <Send className="size-3.5" /> Submit
        </button>
      </div>

      {/* Editor + side panel */}
      <div className={`flex flex-col gap-2 ${fullscreen ? "flex-1 min-h-0 @4xl:flex-row" : ""}`}>
        <div
          className={`rounded-xl border border-zinc-800 overflow-hidden bg-[#1e1e1e] ${fullscreen ? "min-h-[50vh] @4xl:min-h-0 flex-1" : "h-[440px]"}`}
        >
          <CodeEditor
            key={lang}
            value={code}
            onChange={onEdit}
            language={langMeta.monaco || lang}
            readOnly={readOnly}
            errorLines={errorLines}
            ariaLabel={`Code editor, ${langMeta.label}`}
          />
        </div>

        <div className={`flex flex-col gap-2 min-h-0 ${fullscreen ? "@4xl:w-[40%] @4xl:overflow-auto" : ""}`}>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-zinc-400">Custom input (stdin for Run)</span>
            <textarea
              rows={4}
              value={stdin}
              onChange={(e) => setStdin(e.target.value)}
              disabled={readOnly}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              placeholder="Input passed to your program when you click Run"
              className="w-full resize-y bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-xs font-mono text-zinc-200 select-text focus:outline-none focus:border-[#b2b2b2] disabled:opacity-60"
            />
          </label>

          <CodingOutputPanel execution={execution} running={running} elapsedMs={elapsedMs} tab={outputTab} onTab={setOutputTab} />

          {ws.hiddenTestCount > 0 && (
            <p className="text-[11px] text-zinc-500">
              {ws.hiddenTestCount} hidden test{ws.hiddenTestCount === 1 ? "" : "s"} will also be used for grading after the exam.
            </p>
          )}

          <div className="rounded-xl border border-zinc-800 bg-zinc-950">
            <div className="flex items-center gap-1.5 border-b border-zinc-800 px-3 py-2 text-[11px] font-bold text-zinc-400">
              <History className="size-3.5" /> Submitted versions
            </div>
            {submissions.length === 0 ? (
              <p className="px-3 py-2.5 text-[11px] text-zinc-500">
                No versions submitted yet. Your latest saved code is graded automatically when you submit the exam.
              </p>
            ) : (
              <ul className="max-h-40 overflow-auto divide-y divide-zinc-800/70 text-[11px]">
                {submissions.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 px-3 py-1.5">
                    <span className="font-mono font-bold text-zinc-200">v{s.version}</span>
                    <span className="text-zinc-400">{ws.languages.find((l) => l.key === s.language)?.label ?? s.language}</span>
                    <span className="flex-1" />
                    {s.isLatest && <span className="rounded border border-emerald-900/60 px-1.5 text-emerald-300">latest</span>}
                    <span className="text-zinc-500">{fmtClock(new Date(s.submittedAt))}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Reset confirmation */}
      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent className={dialogCls}>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset {langMeta.label} code?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Your current {langMeta.label} code will be replaced with the starter template. This can't be undone (submitted versions are kept).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-zinc-800 border-zinc-700 text-zinc-100 hover:bg-zinc-700 hover:text-zinc-100">Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 text-white hover:bg-rose-500" onClick={doReset}>Reset code</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Submit confirmation */}
      <AlertDialog open={submitOpen} onOpenChange={(o) => !submitting && setSubmitOpen(o)}>
        <AlertDialogContent className={dialogCls}>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit this solution?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-zinc-400">
                <p>
                  Language: <span className="font-semibold text-zinc-200">{langMeta.label}</span>
                  <br />
                  This will be version <span className="font-semibold text-zinc-200">{(submissions[0]?.version ?? 0) + 1}</span>
                  {submissions.length > 0 ? ` (${submissions.length} submitted so far)` : ""}.
                </p>
                <p>
                  Only the latest version is graded. You can keep editing and submit again. When you submit the whole exam, your newest code
                  for this question is also frozen and graded automatically.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting} className="bg-zinc-800 border-zinc-700 text-zinc-100 hover:bg-zinc-700 hover:text-zinc-100">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting}
              className="bg-[#b2b2b2] text-zinc-950 hover:bg-zinc-200"
              onClick={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Submit version
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default CodingWorkspace;
