import React from "react";

/**
 * Safe renderer for the small Markdown subset the question editor produces:
 * **bold**, *italic*, `inline code`, ``` fenced code ```, "- " bullets,
 * "1. " numbered lists and paragraphs. Text is never injected as HTML.
 * Fill-in-the-blank markers (___) render as visible blanks.
 */

const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|_{3,})/g;

function renderInline(text: string, keyPrefix: string, blankClass?: string): React.ReactNode[] {
  const parts = text.split(INLINE).filter((p) => p !== "");
  let blank = 0;
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (/^\*[^*]+\*$/.test(part)) return <em key={key}>{part.slice(1, -1)}</em>;
    if (/^`[^`]+`$/.test(part))
      return (
        <code key={key} className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      );
    if (/^_{3,}$/.test(part)) {
      blank += 1;
      return (
        <span
          key={key}
          className={blankClass ?? "mx-1 inline-block min-w-16 border-b-2 border-current align-baseline text-center text-[0.75em] opacity-70"}
          aria-label={`blank ${blank}`}
        >
          {blankClass ? null : `(${blank})`}
        </span>
      );
    }
    return <React.Fragment key={key}>{part}</React.Fragment>;
  });
}

export function RichText({
  text,
  className,
  codeClassName,
  blankClassName,
}: {
  text: string;
  className?: string;
  codeClassName?: string;
  blankClassName?: string;
}) {
  const blocks: React.ReactNode[] = [];
  const lines = (text || "").replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) code.push(lines[i++]);
      i++; // closing fence
      blocks.push(
        <pre
          key={key++}
          className={codeClassName ?? "overflow-x-auto rounded-lg bg-zinc-950 p-3 font-mono text-xs text-zinc-100"}
        >
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ""));
      blocks.push(
        <ul key={key++} className="list-disc space-y-1 pl-5">
          {items.map((it, j) => (
            <li key={j}>{renderInline(it, `ul${key}-${j}`, blankClassName)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ""));
      blocks.push(
        <ol key={key++} className="list-decimal space-y-1 pl-5">
          {items.map((it, j) => (
            <li key={j}>{renderInline(it, `ol${key}-${j}`, blankClassName)}</li>
          ))}
        </ol>,
      );
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith("```") &&
      !/^\s*([-*]|\d+[.)])\s+/.test(lines[i])
    )
      para.push(lines[i++]);
    blocks.push(
      <p key={key++} className="whitespace-pre-wrap break-words">
        {renderInline(para.join("\n"), `p${key}`, blankClassName)}
      </p>,
    );
  }
  return <div className={className ?? "space-y-2"}>{blocks}</div>;
}
