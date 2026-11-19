import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

/* ───────────────────────── markdown ───────────────────────── */

/** Tiny, safe markdown → React (headings, lists, tables, bold, inline code, code blocks). Never injects HTML. */
export function renderMarkdown(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const blocks = text.split(/```/);
  blocks.forEach((block, bi) => {
    if (bi % 2 === 1) {
      const code = block.replace(/^[a-zA-Z0-9-]*\n/, "");
      out.push(
        <pre key={`c${bi}`} className="my-2 overflow-x-auto rounded-xl bg-[#14161f] p-3 text-[12px] leading-relaxed text-[#e6e8f2]">
          <code>{code.trimEnd()}</code>
        </pre>,
      );
      return;
    }
    let list: { ordered: boolean; items: string[] } | null = null;
    let table: string[][] | null = null;
    const flushTable = (key: string) => {
      if (!table) return;
      const rows = table.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c.trim())));
      const [head, ...body] = rows;
      out.push(
        <div key={key} className="my-2 overflow-x-auto rounded-xl border border-[#e6e6e6]">
          <table className="w-full border-collapse text-left text-[12.5px]">
            {head && (
              <thead className="bg-[#f4f5f8]">
                <tr>
                  {head.map((c, i) => (
                    <th key={i} className="border-b border-[#e6e6e6] px-3 py-2 font-semibold">
                      {cell(c)}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri} className="align-top odd:bg-white even:bg-[#fafafa]">
                  {r.map((c, ci) => (
                    <td key={ci} className="border-b border-[#f0f0f0] px-3 py-2">
                      {cell(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      table = null;
    };
    const flush = (key: string) => {
      flushTable(`t${key}`);
      if (!list) return;
      const Tag = list.ordered ? "ol" : "ul";
      out.push(
        <Tag key={key} className={`my-1.5 space-y-1 pl-5 ${list.ordered ? "list-decimal" : "list-disc"}`}>
          {list.items.map((it, i) => (
            <li key={i}>{inline(it)}</li>
          ))}
        </Tag>,
      );
      list = null;
    };
    block.split("\n").forEach((raw, li) => {
      const line = raw.trimEnd();
      const key = `${bi}-${li}`;
      if (/^\s*\|.*\|\s*$/.test(line)) {
        if (list) {
          const t = table;
          table = null;
          flush(`l${key}`);
          table = t;
        }
        table ??= [];
        table.push(line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
        return;
      }
      flushTable(`t${key}`);
      const ul = line.match(/^\s*[-*•]\s+(.*)/);
      const ol = line.match(/^\s*\d+[.)]\s+(.*)/);
      if (ul || ol) {
        const ordered = Boolean(ol);
        if (list && list.ordered !== ordered) flush(`l${key}`);
        list ??= { ordered, items: [] };
        list.items.push((ul ?? ol)![1]);
        return;
      }
      flush(`l${key}`);
      const quote = line.match(/^\s*>\s?(.*)/);
      if (quote) {
        const inner = quote[1].replace(/^[-*•]\s+/, "• ");
        if (inner.trim()) {
          out.push(
            <p key={key} className="my-0.5 border-l-2 border-[#c7cff5] bg-[#f7f8fd] py-0.5 pl-3 text-[#4a4f63]">
              {inline(inner)}
            </p>,
          );
        }
        return;
      }
      const h = line.match(/^(#{1,4})\s+(.*)/);
      if (h) {
        out.push(
          <p key={key} className="mb-1 mt-2.5 font-bold text-[#1a1917]">
            {inline(h[2])}
          </p>,
        );
      } else if (/^-{3,}$/.test(line.trim())) {
        out.push(<hr key={key} className="my-3 border-[#ececec]" />);
      } else if (line.trim()) {
        out.push(
          <p key={key} className="my-1">
            {inline(line)}
          </p>,
        );
      }
    });
    flush(`end${bi}`);
  });
  return out;
}

function cell(s: string): React.ReactNode[] {
  return s.split(/<br\s*\/?>/i).flatMap((part, i) => (i === 0 ? inline(part) : [<br key={`br${i}`} />, ...inline(part)]));
}

function inline(s: string): React.ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*|`[^`]+`|_[^_\s][^_]*_)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`"))
      return (
        <code key={i} className="rounded bg-[#eef0f6] px-1 py-0.5 text-[12px]">
          {part.slice(1, -1)}
        </code>
      );
    if (/^_[^_]+_$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>;
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

/* ───────────────────────── structured questions ───────────────────────── */

export interface GeneratedQuestion {
  type: string;
  text: string;
  options?: string[];
  correctAnswer?: string | string[] | string[][];
  points?: number;
  difficulty?: string;
  bloom?: string;
  explanation?: string;
}

const BLOCK_RE = /```vigil-questions\s*([\s\S]*?)(```|$)/;

/** Splits a reply into display text and the machine-readable question block (if any). */
export function splitQuestions(content: string, streaming = false): { text: string; questions: GeneratedQuestion[] | null } {
  const idx = content.indexOf("```vigil-questions");
  if (idx < 0) return { text: content, questions: null };
  const text = content.slice(0, idx).trimEnd();
  if (streaming) return { text, questions: null };
  const m = content.match(BLOCK_RE);
  try {
    const parsed = JSON.parse(m?.[1] ?? "");
    return { text, questions: Array.isArray(parsed) ? (parsed as GeneratedQuestion[]).filter((q) => q && typeof q.text === "string") : null };
  } catch {
    return { text, questions: null };
  }
}

const TYPES = new Set(["multiple-choice", "multiple-select", "true-false", "short-answer", "descriptive", "coding", "fill-blank"]);

/** Maps generated questions onto the assessment builder's question payload. */
export function toBuilderQuestions(questions: GeneratedQuestion[]) {
  return questions.map((q) => {
    const type = TYPES.has(q.type) ? q.type : "descriptive";
    const points = Number(q.points) > 0 ? Number(q.points) : type === "coding" ? 10 : type === "descriptive" ? 5 : 1;
    const difficulty = ["easy", "medium", "hard"].includes(String(q.difficulty).toLowerCase()) ? String(q.difficulty).toLowerCase() : "medium";
    const base = { type, text: q.text, points, difficulty, explanation: [q.bloom && `Bloom: ${q.bloom}`, q.explanation].filter(Boolean).join("\n") || null };
    if (type === "multiple-choice") return { ...base, options: q.options ?? [], correctAnswer: Array.isArray(q.correctAnswer) ? String(q.correctAnswer[0]) : (q.correctAnswer ?? null) };
    if (type === "multiple-select") return { ...base, options: q.options ?? [], correctAnswer: Array.isArray(q.correctAnswer) ? (q.correctAnswer as string[]).map(String) : q.correctAnswer ? [String(q.correctAnswer)] : [] };
    if (type === "true-false") {
      const v = String(Array.isArray(q.correctAnswer) ? q.correctAnswer[0] : q.correctAnswer ?? "").toLowerCase();
      return { ...base, correctAnswer: v.startsWith("t") ? "True" : v.startsWith("f") ? "False" : null };
    }
    if (type === "fill-blank") {
      const raw = Array.isArray(q.correctAnswer) ? q.correctAnswer : q.correctAnswer ? [q.correctAnswer] : [];
      const blanks = raw.map((b) => (Array.isArray(b) ? b.map(String) : String(b).split("|").map((s) => s.trim())));
      return { ...base, config: { blanks } };
    }
    return { ...base, correctAnswer: Array.isArray(q.correctAnswer) ? q.correctAnswer.join("\n") : (q.correctAnswer ?? null) };
  });
}

/* ───────────────────────── export ───────────────────────── */

const DOC_CSS = `body{font-family:Inter,Segoe UI,Arial,sans-serif;color:#1a1917;font-size:12pt;line-height:1.55;max-width:760px;margin:32px auto;padding:0 16px}
h1{font-size:18pt;margin:0 0 4px}.meta{color:#666;font-size:9.5pt;margin-bottom:18px}
table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f4f5f8}
pre{background:#f4f5f8;padding:10px;border-radius:6px;white-space:pre-wrap;font-size:10pt}code{font-family:Consolas,monospace}`;

function documentHtml(title: string, markdown: string, meta: string) {
  const body = renderToStaticMarkup(<div>{renderMarkdown(markdown)}</div>);
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${DOC_CSS}</style></head><body><h1>${esc(title)}</h1><div class="meta">${esc(meta)}</div>${body}</body></html>`;
}

/** Opens a print-ready page; the browser's "Save as PDF" produces the PDF. */
export function exportPdf(title: string, markdown: string, meta: string) {
  const win = window.open("", "_blank");
  if (!win) throw new Error("Allow pop-ups to export a PDF.");
  win.document.write(documentHtml(title, markdown, meta));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

/** Downloads a Word-compatible document (.doc, HTML-based; opens in Word, Pages and Google Docs). */
export function exportWord(title: string, markdown: string, meta: string) {
  const html = documentHtml(title, markdown, meta).replace("<html>", '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">');
  const blob = new Blob(["﻿", html], { type: "application/msword" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${title.replace(/[^\w\- ]+/g, "").trim().slice(0, 60) || "vigil-response"}.doc`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
