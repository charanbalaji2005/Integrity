import React, { useRef, useState } from "react";
import { Bold, Code, Eye, Italic, List, ListOrdered, Pencil, SquareCode, TextCursorInput } from "lucide-react";
import { RichText } from "../../../components/assessment/RichText";
import { cn } from "../../../components/ui/utils";

/**
 * Lightweight rich text editing: a Markdown-subset textarea with a formatting
 * toolbar and a live preview. The same subset is rendered by RichText for
 * students, so what faculty preview is exactly what candidates see.
 */
export function RichTextEditor({
  id,
  value,
  onChange,
  placeholder,
  rows = 4,
  invalid,
  allowBlank,
  ariaLabel,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  invalid?: boolean;
  allowBlank?: boolean;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);

  const wrap = (before: string, after = before, fallback = "text") => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const selected = value.slice(s, e) || fallback;
    const next = `${value.slice(0, s)}${before}${selected}${after}${value.slice(e)}`;
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + selected.length);
    });
  };
  const prefixLines = (make: (i: number) => string) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const lineStart = value.lastIndexOf("\n", s - 1) + 1;
    const block = value.slice(lineStart, e) || "item";
    const next = block
      .split("\n")
      .map((l, i) => `${make(i)}${l}`)
      .join("\n");
    onChange(`${value.slice(0, lineStart)}${next}${value.slice(e)}`);
    requestAnimationFrame(() => el.focus());
  };
  const insert = (text: string) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    onChange(`${value.slice(0, s)}${text}${value.slice(e)}`);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + text.length, s + text.length);
    });
  };

  const tools: { label: string; icon: React.ComponentType<{ className?: string }>; run: () => void; show?: boolean }[] = [
    { label: "Bold (Ctrl+B)", icon: Bold, run: () => wrap("**") },
    { label: "Italic (Ctrl+I)", icon: Italic, run: () => wrap("*") },
    { label: "Inline code", icon: Code, run: () => wrap("`", "`", "code") },
    { label: "Bulleted list", icon: List, run: () => prefixLines(() => "- ") },
    { label: "Numbered list", icon: ListOrdered, run: () => prefixLines((i) => `${i + 1}. `) },
    { label: "Code block", icon: SquareCode, run: () => wrap("\n```\n", "\n```\n", "code") },
    { label: "Insert blank (___)", icon: TextCursorInput, run: () => insert(" ____ "), show: allowBlank },
  ];

  return (
    <div className={cn("overflow-hidden rounded-lg border bg-white transition focus-within:border-zinc-400 focus-within:ring-4 focus-within:ring-zinc-900/5", invalid ? "border-rose-400" : "border-zinc-200")}>
      <div className="flex items-center justify-between gap-1 border-b border-zinc-100 bg-zinc-50/70 px-1.5 py-1" role="toolbar" aria-label="Formatting">
        <div className="flex flex-wrap items-center gap-0.5">
          {tools
            .filter((t) => t.show !== false)
            .map((t) => (
              <button
                key={t.label}
                type="button"
                title={t.label}
                aria-label={t.label}
                disabled={preview}
                onClick={t.run}
                className="rounded-md p-1.5 text-zinc-500 transition hover:bg-white hover:text-zinc-900 disabled:opacity-40"
              >
                <t.icon className="size-3.5" />
              </button>
            ))}
        </div>
        <button
          type="button"
          onClick={() => setPreview((p) => !p)}
          aria-pressed={preview}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-semibold text-zinc-600 hover:bg-white hover:text-zinc-900"
        >
          {preview ? <Pencil className="size-3" /> : <Eye className="size-3" />} {preview ? "Edit" : "Preview"}
        </button>
      </div>
      {preview ? (
        <div className="min-h-24 px-3 py-2.5 text-[13.5px] text-zinc-900">
          {value.trim() ? (
            <RichText text={value} codeClassName="overflow-x-auto rounded-md bg-zinc-900 p-3 font-mono text-xs text-zinc-100" />
          ) : (
            <span className="text-zinc-400">Nothing to preview.</span>
          )}
        </div>
      ) : (
        <textarea
          ref={ref}
          id={id}
          rows={rows}
          value={value}
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            if (e.key.toLowerCase() === "b") {
              e.preventDefault();
              wrap("**");
            } else if (e.key.toLowerCase() === "i") {
              e.preventDefault();
              wrap("*");
            }
          }}
          className="block w-full resize-y border-0 px-3 py-2 text-[13.5px] leading-relaxed text-zinc-900 outline-none placeholder:text-zinc-400"
        />
      )}
    </div>
  );
}

/** Monospace editor with line numbers and Tab indentation. */
export function CodeEditor({
  id,
  value,
  onChange,
  rows = 10,
  placeholder,
  ariaLabel,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const lines = Math.max(rows, value.split("\n").length);
  return (
    <div className="flex overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 focus-within:ring-4 focus-within:ring-zinc-900/15">
      <div ref={gutterRef} aria-hidden="true" className="select-none overflow-hidden border-r border-zinc-800 bg-zinc-900/60 py-2 pl-2 pr-2 text-right font-mono text-[11.5px] leading-[1.6] text-zinc-500" style={{ height: `${rows * 1.6 + 1}em` }}>
        {Array.from({ length: lines }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <textarea
        ref={ref}
        id={id}
        rows={rows}
        value={value}
        aria-label={ariaLabel}
        placeholder={placeholder}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        onScroll={(e) => {
          if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
        }}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Tab") return;
          e.preventDefault();
          const el = e.currentTarget;
          const { selectionStart: s, selectionEnd: end } = el;
          onChange(`${value.slice(0, s)}    ${value.slice(end)}`);
          requestAnimationFrame(() => el.setSelectionRange(s + 4, s + 4));
        }}
        className="block w-full resize-y bg-transparent px-3 py-2 font-mono text-[12px] leading-[1.6] text-zinc-100 caret-white outline-none placeholder:text-zinc-600"
        style={{ minHeight: `${rows * 1.6 + 1}em` }}
      />
    </div>
  );
}
