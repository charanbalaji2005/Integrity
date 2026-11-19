import React from "react";
import Editor, { loader, type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
// Basic syntax highlighting for the four exam languages (tokenizers only, no language workers needed).
import "monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution";
import "monaco-editor/esm/vs/basic-languages/java/java.contribution";
import "monaco-editor/esm/vs/basic-languages/python/python.contribution";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";

/**
 * Monaco bundled locally (the page CSP blocks CDN scripts, which is where
 * @monaco-editor/react loads Monaco from by default). Workers are emitted by
 * Vite as same-origin files.
 */
(self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};
loader.config({ monaco });

export type { OnMount };

export interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  /** Monaco language id: c | cpp | java | python | plaintext */
  language: string;
  readOnly?: boolean;
  height?: string | number;
  onMount?: OnMount;
  /** Line numbers to highlight as errors (1-based), e.g. parsed from compiler output. */
  errorLines?: number[];
  className?: string;
  ariaLabel?: string;
}

/** Dark Monaco editor used by the student exam workspace and the faculty review screen. */
export function CodeEditor({ value, onChange, language, readOnly, height = "100%", onMount, errorLines, className, ariaLabel }: CodeEditorProps) {
  const editorRef = React.useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const decorations = React.useRef<monaco.editor.IEditorDecorationsCollection | null>(null);

  React.useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    const lines = (errorLines ?? []).filter((n) => n > 0);
    decorations.current?.clear();
    decorations.current = ed.createDecorationsCollection(
      lines.map((line) => ({
        range: new monaco.Range(line, 1, line, 1),
        options: { isWholeLine: true, className: "vigil-error-line", glyphMarginClassName: "vigil-error-glyph" },
      })),
    );
  }, [errorLines, value]);

  return (
    <div className={className} style={{ height }}>
      <Editor
        value={value}
        language={language === "c" ? "cpp" : language}
        theme="vs-dark"
        onChange={(v) => onChange?.(v ?? "")}
        onMount={(ed, m) => {
          editorRef.current = ed;
          onMount?.(ed, m);
        }}
        loading={<div className="h-full w-full flex items-center justify-center text-xs text-zinc-400 bg-[#1e1e1e]">Loading editor…</div>}
        options={{
          readOnly,
          ariaLabel: ariaLabel ?? "Code editor",
          fontSize: 14,
          fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 4,
          insertSpaces: true,
          autoIndent: "full",
          formatOnPaste: true,
          formatOnType: true,
          glyphMargin: true,
          lineNumbers: "on",
          renderWhitespace: "selection",
          wordWrap: "off",
          bracketPairColorization: { enabled: true },
          // Exam integrity: no cloud suggestions; Monaco only offers words from the file.
          quickSuggestions: true,
          contextmenu: true,
          padding: { top: 10, bottom: 10 },
        }}
      />
      <style>{`.vigil-error-line{background:rgba(244,63,94,.18)}.vigil-error-glyph{background:#f43f5e;width:4px!important;margin-left:4px;border-radius:2px}`}</style>
    </div>
  );
}

/** Extracts 1-based line numbers from GCC/G++/javac/Python error output for highlighting. */
export function errorLinesFrom(output: string | null | undefined): number[] {
  if (!output) return [];
  const set = new Set<number>();
  const patterns = [/(?:main\.c(?:pp)?|Main\.java):(\d+)(?::\d+)?/g, /File "[^"]*", line (\d+)/g];
  for (const re of patterns) for (const m of output.matchAll(re)) set.add(Number(m[1]));
  return [...set].slice(0, 50);
}
