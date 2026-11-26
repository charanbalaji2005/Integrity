import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Clock,
  Copy,
  Cpu,
  Download,
  FilePlus2,
  FileCode2,
  Hammer,
  History,
  Keyboard,
  Loader2,
  MemoryStick,
  Minus,
  Moon,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Sun,
  Trash2,
  Upload,
  WifiOff,
  WrapText,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import type * as Monaco from "monaco-editor/esm/vs/editor/editor.api";
import { CodeEditor, errorLinesFrom } from "./CodeEditor";
import { CodingOutputPanel, type OutputTab } from "./CodingOutputPanel";
import {
  type CodeLanguage,
  CodingApiError,
  codingRequest,
  type Execution,
  type ExecutorHealth,
  formatMemory,
  formatTime,
  getHealth,
  VERDICT_LABEL,
  waitForExecution,
} from "./coding-api";

/* ───────────────────────── languages ───────────────────────── */

interface LanguageInfo {
  key: CodeLanguage;
  label: string;
  monaco: string;
  fileName: string;
  template: string;
}

const EXT: Record<CodeLanguage, string> = { c: "c", cpp: "cpp", java: "java", python: "py" };
const LANG_ORDER: CodeLanguage[] = ["c", "cpp", "python", "java"];
const SHORT: Record<CodeLanguage, string> = { c: "C", cpp: "C++", python: "Python", java: "Java" };
const ACCENT: Record<CodeLanguage, string> = { c: "#5b8def", cpp: "#9b6bff", python: "#f2c94c", java: "#f2994a" };

/** Used until /api/coding/languages answers (and if it can't be reached). */
const FALLBACK: Record<CodeLanguage, LanguageInfo> = {
  c: { key: "c", label: "C (GCC 9.2)", monaco: "c", fileName: "main.c", template: '#include <stdio.h>\n\nint main(void) {\n    printf("Hello, World!\\n");\n    return 0;\n}\n' },
  cpp: { key: "cpp", label: "C++17 (G++ 9.2)", monaco: "cpp", fileName: "main.cpp", template: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    cout << "Hello, World!" << endl;\n    return 0;\n}\n' },
  java: { key: "java", label: "Java (OpenJDK 13)", monaco: "java", fileName: "Main.java", template: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}\n' },
  python: { key: "python", label: "Python 3.8", monaco: "python", fileName: "main.py", template: 'print("Hello, World!")\n' },
};

/* ───────────────────────── local workspace ───────────────────────── */

interface StudioFile {
  id: string;
  name: string;
  language: CodeLanguage;
  code: string;
  stdin: string;
  updatedAt: number;
}
interface StudioState {
  files: StudioFile[];
  activeId: string;
}
interface HistoryItem {
  id: string;
  fileName: string;
  language: CodeLanguage;
  mode: "run" | "compile";
  at: number;
  execution: Execution;
}

const uid = () => Math.random().toString(36).slice(2, 10);
const storageKey = (userId: string) => `compiler-studio:v1:${userId}`;

function initialState(langs: Record<CodeLanguage, LanguageInfo>): StudioState {
  const files = LANG_ORDER.map((l) => ({ id: uid(), name: langs[l].fileName, language: l, code: langs[l].template, stdin: "", updatedAt: Date.now() }));
  return { files, activeId: files[0].id };
}

function loadState(userId: string): StudioState | null {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const s = JSON.parse(raw) as StudioState;
    if (!Array.isArray(s.files) || s.files.length === 0) return null;
    return { files: s.files.filter((f) => LANG_ORDER.includes(f.language)), activeId: s.activeId };
  } catch {
    return null;
  }
}

const languageFromName = (name: string): CodeLanguage | null => {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "c") return "c";
  if (ext === "cpp" || ext === "cc" || ext === "cxx" || ext === "hpp") return "cpp";
  if (ext === "py") return "python";
  if (ext === "java") return "java";
  return null;
};

/* ───────────────────────── component ───────────────────────── */

export function CompilerStudio({ userId }: { userId: string }) {
  const [langs, setLangs] = useState<Record<CodeLanguage, LanguageInfo>>(FALLBACK);
  const [state, setState] = useState<StudioState>(() => loadState(userId) ?? initialState(FALLBACK));
  const [health, setHealth] = useState<ExecutorHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [running, setRunning] = useState<"run" | "compile" | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [execution, setExecution] = useState<Execution | null>(null);
  const [outputTab, setOutputTab] = useState<OutputTab>("output");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [fontSize, setFontSize] = useState(14);
  const [wrap, setWrap] = useState(false);
  // Light (white) by default; the choice is remembered in this browser.
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      return localStorage.getItem("compiler-studio:theme") === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("compiler-studio:theme", theme);
    } catch {
      /* storage unavailable */
    }
  }, [theme]);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const active = state.files.find((f) => f.id === state.activeId) ?? state.files[0];

  /* persistence */
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(storageKey(userId), JSON.stringify(state));
      } catch {
        /* storage full or blocked — keep working in memory */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [state, userId]);

  /* languages + service health */
  const refreshHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      setHealth(await getHealth());
    } catch {
      setHealth({ configured: false, reachable: false, version: null, error: "Could not reach the server.", supported: [] });
    } finally {
      setHealthLoading(false);
    }
  }, []);
  useEffect(() => {
    void refreshHealth();
    codingRequest<LanguageInfo[]>("/languages")
      .then((list) => setLangs((prev) => ({ ...prev, ...Object.fromEntries(list.map((l) => [l.key, l])) })))
      .catch(() => {});
  }, [refreshHealth]);

  /* run timer */
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed(Date.now() - startedAt), 100);
    return () => clearInterval(t);
  }, [running, startedAt]);

  /* editor options follow the toolbar */
  useEffect(() => {
    editorRef.current?.updateOptions({ fontSize, wordWrap: wrap ? "on" : "off" });
  }, [fontSize, wrap]);

  const patchActive = (patch: Partial<StudioFile>) =>
    setState((s) => ({ ...s, files: s.files.map((f) => (f.id === s.activeId ? { ...f, ...patch, updatedAt: Date.now() } : f)) }));

  const online = Boolean(health?.reachable);
  const langAvailable = (l: CodeLanguage) => !health?.reachable || health.supported.find((s) => s.key === l)?.available !== false;

  const run = useCallback(
    async (mode: "run" | "compile") => {
      if (!active || running) return;
      if (!active.code.trim()) return toast.error("Write some code first.");
      if (mode === "compile" && active.language === "python") mode = "run";
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setRunning(mode);
      setStartedAt(Date.now());
      setElapsed(0);
      setOutputTab("output");
      try {
        const queued = await codingRequest<Execution>("/playground/run", {
          method: "POST",
          body: JSON.stringify({ language: active.language, sourceCode: active.code, stdin: active.stdin, mode }),
        });
        const done = queued.status === "completed" || queued.status === "failed" ? queued : await waitForExecution(queued.id, { signal: ctrl.signal });
        setExecution(done);
        if (done.verdict && done.verdict !== "accepted") setOutputTab(done.compileOutput || done.stderr ? "errors" : "output");
        setHistory((h) => [{ id: done.id, fileName: active.name, language: active.language, mode, at: Date.now(), execution: done }, ...h].slice(0, 15));
        if (done.verdict === "infra_error") void refreshHealth();
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        toast.error(e instanceof CodingApiError ? e.message : "Could not run the code.");
      } finally {
        setRunning(null);
      }
    },
    [active, running, refreshHealth],
  );

  /* keyboard shortcuts */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "Enter") {
        e.preventDefault();
        void run(e.shiftKey ? "compile" : "run");
      } else if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        toast.success("Saved in this browser");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run]);

  /* file actions */
  const newFile = (language: CodeLanguage) => {
    const base = langs[language].fileName.replace(/\.[^.]+$/, "");
    const taken = new Set(state.files.map((f) => f.name));
    let name = `${base}.${EXT[language]}`;
    for (let i = 2; taken.has(name); i++) name = language === "java" ? `Main${i}.java` : `${base}${i}.${EXT[language]}`;
    const file: StudioFile = { id: uid(), name, language, code: langs[language].template, stdin: "", updatedAt: Date.now() };
    setState((s) => ({ files: [...s.files, file], activeId: file.id }));
  };
  const switchLanguage = (language: CodeLanguage) => {
    const existing = state.files.find((f) => f.language === language);
    if (existing) setState((s) => ({ ...s, activeId: existing.id }));
    else newFile(language);
  };
  const deleteFile = (id: string) => {
    const f = state.files.find((x) => x.id === id);
    if (!f || !window.confirm(`Delete ${f.name}? This cannot be undone.`)) return;
    setState((s) => {
      const files = s.files.filter((x) => x.id !== id);
      if (files.length === 0) return initialState(langs);
      return { files, activeId: s.activeId === id ? files[0].id : s.activeId };
    });
  };
  const duplicateFile = (id: string) => {
    const f = state.files.find((x) => x.id === id);
    if (!f) return;
    const copy = { ...f, id: uid(), name: f.name.replace(/(\.[^.]+)$/, "-copy$1"), updatedAt: Date.now() };
    setState((s) => ({ files: [...s.files, copy], activeId: copy.id }));
  };
  const saveRename = () => {
    if (!renaming) return;
    const name = renaming.name.trim();
    setRenaming(null);
    if (!name) return;
    const lang = languageFromName(name);
    setState((s) => ({ ...s, files: s.files.map((f) => (f.id === renaming.id ? { ...f, name, language: lang ?? f.language } : f)) }));
  };
  const resetTemplate = () => {
    if (!active || !window.confirm(`Replace ${active.name} with the ${SHORT[active.language]} starter template?`)) return;
    patchActive({ code: langs[active.language].template });
  };
  const download = () => {
    if (!active) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([active.code], { type: "text/plain" }));
    a.download = active.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    const language = languageFromName(file.name);
    if (!language) return toast.error("Upload a .c, .cpp, .py or .java file.");
    if (file.size > 64 * 1024) return toast.error("Files must be 64 KB or smaller.");
    const code = await file.text();
    const f: StudioFile = { id: uid(), name: file.name, language, code, stdin: "", updatedAt: Date.now() };
    setState((s) => ({ files: [...s.files, f], activeId: f.id }));
    if (uploadRef.current) uploadRef.current.value = "";
  };

  const errorLines = useMemo(() => errorLinesFrom([execution?.compileOutput, execution?.stderr].filter(Boolean).join("\n")), [execution]);
  const lineCount = active?.code.split("\n").length ?? 0;

  if (!active) return null;
  const accent = ACCENT[active.language];
  const toggleTheme = () => setTheme((t) => (t === "light" ? "dark" : "light"));

  return (
    <div className={`compiler-studio ${theme === "light" ? "cs-light" : ""} flex h-full min-h-0 flex-col bg-[var(--cs-bg)] text-zinc-100`}>
      {/* ── Top bar ── */}
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-zinc-800 px-4 py-2.5">
        <div className="flex items-center gap-2 pr-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-zinc-800">
            <Cpu className="size-4" />
          </span>
          <div className="leading-tight">
            <div className="text-[14px] font-bold">Compiler Studio</div>
            <div className="text-[11px] text-zinc-400">C · C++ · Python · Java</div>
          </div>
        </div>

        <div role="tablist" aria-label="Language" className="flex rounded-xl bg-zinc-900 p-1">
          {LANG_ORDER.map((l) => {
            const on = active.language === l;
            return (
              <button
                key={l}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => switchLanguage(l)}
                title={langs[l].label}
                className={`relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition ${on ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:text-zinc-100"}`}
              >
                <span className="size-2 rounded-full" style={{ background: ACCENT[l] }} aria-hidden="true" />
                {SHORT[l]}
                {!langAvailable(l) && <span className="text-[10px] text-rose-400">(n/a)</span>}
              </button>
            );
          })}
        </div>

        <span className="hidden text-[11.5px] text-zinc-500 lg:inline">{langs[active.language].label}</span>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
            aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
            className="inline-flex size-9 items-center justify-center rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
          </button>
          <button
            type="button"
            onClick={() => void refreshHealth()}
            title={health?.error ?? (online ? `Compiler engine: ${health?.version ?? "ready"}` : "Compiler service offline")}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
              healthLoading ? "border-zinc-700 text-zinc-400" : online ? "border-emerald-700/60 bg-emerald-500/10 text-emerald-300" : "border-rose-700/60 bg-rose-500/10 text-rose-300"
            }`}
          >
            {healthLoading ? <Loader2 className="size-3 animate-spin" /> : online ? <span className="size-1.5 rounded-full bg-emerald-400" /> : <WifiOff className="size-3" />}
            {healthLoading ? "Checking…" : online ? "Compilers online" : "Compilers offline"}
          </button>
          {active.language !== "python" && (
            <button
              type="button"
              onClick={() => void run("compile")}
              disabled={!!running}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-700 px-3 text-[12.5px] font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
              title="Compile only (Ctrl+Shift+Enter)"
            >
              {running === "compile" ? <Loader2 className="size-4 animate-spin" /> : <Hammer className="size-4" />} Compile
            </button>
          )}
          <button
            type="button"
            onClick={() => void run("run")}
            disabled={!!running}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-[12.5px] font-bold text-zinc-950 shadow-sm transition hover:brightness-110 disabled:opacity-60"
            style={{ background: "#34d399", color: "#052e16" }}
            title="Run (Ctrl+Enter)"
          >
            {running === "run" ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4 fill-current" />}
            {running ? `Running ${(elapsed / 1000).toFixed(1)}s` : "Run"}
          </button>
        </div>
      </header>

      {!healthLoading && !online && (
        <div role="status" className="flex shrink-0 flex-wrap items-start gap-2 border-b border-amber-900/50 bg-amber-950/40 px-4 py-2 text-[12px] text-amber-200">
          <WifiOff className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">
            The compiler service isn’t reachable{health?.error ? ` — ${health.error}` : ""}. You can keep writing; your files are saved in this browser.
            Administrators: set <code className="rounded bg-zinc-950/40 px-1">CODE_EXECUTOR=local</code> in <code className="rounded bg-zinc-950/40 px-1">backend/.env</code> to use this machine’s compilers, then restart the backend.
          </span>
          <button type="button" onClick={() => void refreshHealth()} className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline">
            <RefreshCw className="size-3" /> Retry
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* ── Files ── */}
        <aside className="hidden w-60 shrink-0 flex-col border-r border-zinc-800 bg-[var(--cs-deep)] md:flex" aria-label="Files">
          <div className="flex items-center justify-between px-3 pb-1 pt-3">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-zinc-500">Files</span>
            <div className="flex">
              <button type="button" onClick={() => newFile(active.language)} title="New file" aria-label="New file" className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
                <FilePlus2 className="size-4" />
              </button>
              <button type="button" onClick={() => uploadRef.current?.click()} title="Upload file" aria-label="Upload file" className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
                <Upload className="size-4" />
              </button>
              <input ref={uploadRef} type="file" accept=".c,.cpp,.cc,.cxx,.py,.java" className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} />
            </div>
          </div>
          <ul className="scrollbar-visible min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {state.files.map((f) => (
              <li key={f.id} className={`group flex items-center gap-1 rounded-md ${f.id === active.id ? "bg-zinc-800" : "hover:bg-zinc-900"}`}>
                {renaming?.id === f.id ? (
                  <input
                    autoFocus
                    value={renaming.name}
                    onChange={(e) => setRenaming({ id: f.id, name: e.target.value.slice(0, 60) })}
                    onBlur={saveRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveRename();
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    aria-label="File name"
                    className="m-1 h-7 w-full rounded bg-zinc-950 px-2 text-[12.5px] text-zinc-100 outline-none ring-1 ring-zinc-600"
                  />
                ) : (
                  <>
                    <button type="button" onClick={() => setState((s) => ({ ...s, activeId: f.id }))} onDoubleClick={() => setRenaming({ id: f.id, name: f.name })} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left">
                      <FileCode2 className="size-3.5 shrink-0" style={{ color: ACCENT[f.language] }} />
                      <span className="truncate text-[12.5px] text-zinc-200">{f.name}</span>
                    </button>
                    <div className="flex shrink-0 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                      <button type="button" onClick={() => setRenaming({ id: f.id, name: f.name })} aria-label={`Rename ${f.name}`} className="rounded p-1 text-zinc-500 hover:text-zinc-100">
                        <Pencil className="size-3" />
                      </button>
                      <button type="button" onClick={() => duplicateFile(f.id)} aria-label={`Duplicate ${f.name}`} className="rounded p-1 text-zinc-500 hover:text-zinc-100">
                        <Copy className="size-3" />
                      </button>
                      <button type="button" onClick={() => deleteFile(f.id)} aria-label={`Delete ${f.name}`} className="rounded p-1 text-zinc-500 hover:text-rose-400">
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>

          <div className="border-t border-zinc-800 px-3 py-2">
            <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-zinc-500">
              <History className="size-3" /> Recent runs
            </div>
            {history.length === 0 ? (
              <p className="py-1 text-[11.5px] text-zinc-600">No runs yet.</p>
            ) : (
              <ul className="scrollbar-visible max-h-44 space-y-0.5 overflow-y-auto">
                {history.map((h) => {
                  const ok = h.execution.verdict === "accepted";
                  return (
                    <li key={h.id}>
                      <button type="button" onClick={() => setExecution(h.execution)} className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-zinc-900">
                        {ok ? <CheckCircle2 className="size-3 shrink-0 text-emerald-400" /> : <XCircle className="size-3 shrink-0 text-rose-400" />}
                        <span className="min-w-0 flex-1 truncate text-[11.5px] text-zinc-300">{h.fileName}</span>
                        <span className="shrink-0 text-[10.5px] tabular-nums text-zinc-500">{formatTime(h.execution.timeMs)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* ── Editor + IO ── */}
        <div className="flex min-w-0 flex-1 flex-col lg:flex-row">
          <section className="flex min-h-[320px] min-w-0 flex-1 flex-col" aria-label="Editor">
            <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 bg-[var(--cs-panel)] px-3 py-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800 px-2 py-0.5 text-[12px] font-medium">
                <span className="size-2 rounded-full" style={{ background: accent }} /> {active.name}
              </span>
              <span className="text-[11px] text-zinc-500">{lineCount} lines</span>
              <div className="ml-auto flex items-center gap-0.5">
                <button type="button" onClick={() => setFontSize((s) => Math.max(11, s - 1))} aria-label="Smaller font" title="Smaller font" className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
                  <Minus className="size-3.5" />
                </button>
                <span className="w-7 text-center text-[11px] tabular-nums text-zinc-400">{fontSize}</span>
                <button type="button" onClick={() => setFontSize((s) => Math.min(22, s + 1))} aria-label="Larger font" title="Larger font" className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
                  <Plus className="size-3.5" />
                </button>
                <button type="button" onClick={() => setWrap((w) => !w)} aria-pressed={wrap} title="Word wrap" className={`rounded p-1.5 hover:bg-zinc-800 ${wrap ? "text-zinc-100" : "text-zinc-400"}`}>
                  <WrapText className="size-3.5" />
                </button>
                <button aria-label="Reset to starter template" type="button" onClick={resetTemplate} title="Reset to starter template" className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
                  <RotateCcw className="size-3.5" />
                </button>
                <button type="button" onClick={() => void navigator.clipboard?.writeText(active.code).then(() => toast.success("Code copied"))} title="Copy code" className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
                  <Copy className="size-3.5" />
                </button>
                <button aria-label={`Download ${active.name}`} type="button" onClick={download} title={`Download ${active.name}`} className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
                  <Download className="size-3.5" />
                </button>
                <button type="button" onClick={() => setShowShortcuts((v) => !v)} aria-pressed={showShortcuts} title="Keyboard shortcuts" className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100">
                  <Keyboard className="size-3.5" />
                </button>
              </div>
            </div>
            {showShortcuts && (
              <div className="shrink-0 border-b border-zinc-800 bg-[var(--cs-panel)] px-3 py-2 text-[11.5px] text-zinc-400">
                <b className="text-zinc-200">Ctrl+Enter</b> run · <b className="text-zinc-200">Ctrl+Shift+Enter</b> compile only · <b className="text-zinc-200">Ctrl+S</b> save · <b className="text-zinc-200">Ctrl+F</b> find · <b className="text-zinc-200">Ctrl+/</b> comment · <b className="text-zinc-200">Alt+↑/↓</b> move line · double-click a file to rename
              </div>
            )}
            <div className="min-h-0 flex-1">
              <CodeEditor
                theme={theme}
                key={active.id}
                value={active.code}
                onChange={(code) => patchActive({ code })}
                language={langs[active.language].monaco}
                errorLines={errorLines}
                ariaLabel={`${SHORT[active.language]} code editor for ${active.name}`}
                onMount={(ed) => {
                  editorRef.current = ed;
                  ed.updateOptions({ fontSize, wordWrap: wrap ? "on" : "off" });
                }}
              />
            </div>
          </section>

          <aside className="flex min-h-0 w-full shrink-0 flex-col gap-3 border-t border-zinc-800 bg-[var(--cs-deep)] p-3 lg:w-[400px] lg:border-l lg:border-t-0 xl:w-[460px]" aria-label="Input and output">
            <div className="flex shrink-0 flex-col gap-1.5">
              <label htmlFor="studio-stdin" className="text-[10.5px] font-bold uppercase tracking-wider text-zinc-500">
                Input (stdin)
              </label>
              <textarea
                id="studio-stdin"
                value={active.stdin}
                onChange={(e) => patchActive({ stdin: e.target.value.slice(0, 64 * 1024) })}
                rows={5}
                spellCheck={false}
                placeholder="Values your program reads from standard input…"
                className="scrollbar-visible w-full resize-y rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 font-mono text-[12.5px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-zinc-600"
              />
            </div>

            {execution && (
              <div className="flex shrink-0 flex-wrap items-center gap-2 text-[11.5px]">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold ${
                    execution.verdict === "accepted" ? "bg-emerald-500/15 text-emerald-300" : execution.verdict === "infra_error" ? "bg-amber-500/15 text-amber-300" : "bg-rose-500/15 text-rose-300"
                  }`}
                >
                  {execution.verdict === "accepted" ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
                  {execution.verdict ? VERDICT_LABEL[execution.verdict] : execution.status}
                </span>
                <span className="inline-flex items-center gap-1 text-zinc-400" title="CPU time">
                  <Clock className="size-3" /> {formatTime(execution.timeMs)}
                </span>
                <span className="inline-flex items-center gap-1 text-zinc-400" title="Peak memory">
                  <MemoryStick className="size-3" /> {formatMemory(execution.memoryKb)}
                </span>
                {execution.exitCode != null && <span className="text-zinc-500">exit {execution.exitCode}</span>}
              </div>
            )}

            <div className="min-h-[200px] flex-1">
              <CodingOutputPanel execution={execution} running={running} elapsedMs={elapsed} tab={outputTab} onTab={setOutputTab} />
            </div>
            <p className="shrink-0 text-[10.5px] leading-snug text-zinc-600">
              Compiled and run with GCC, the JDK and Python on the server · 5 s time limit · files are saved only in this browser.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}

export default CompilerStudio;
