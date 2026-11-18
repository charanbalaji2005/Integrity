import React from "react";
import { Check } from "lucide-react";
import { RichText } from "./RichText";
import { AuthedImage } from "./protected-files";
import { countBlanks, LANGUAGES, parseJson, type StudentQuestionConfig } from "./question-meta";

/**
 * Student-facing question rendering, shared by the live exam and the faculty
 * preview so both look identical. Dark exam theme.
 */

export interface ExamQuestion {
  id: string;
  type: string;
  text: string;
  options?: string | string[] | null;
  points: number;
  difficulty?: string;
  config?: string | StudentQuestionConfig | null;
}

const optionList = (q: ExamQuestion): string[] =>
  q.type === "true-false" ? ["True", "False"] : Array.isArray(q.options) ? q.options : parseJson<string[]>(q.options, []);

export function QuestionPrompt({ question }: { question: ExamQuestion }) {
  const config = parseJson<StudentQuestionConfig>(question.config, {});
  const language = LANGUAGES.find((l) => l.value === config.language)?.label ?? config.language;
  const visibleCases = (config.testCases ?? []).filter((t) => !t.hidden);
  return (
    <div className="space-y-4">
      <RichText
        text={question.text}
        className="space-y-2 text-[15px] sm:text-base leading-relaxed font-semibold break-words"
        blankClassName={question.type === "fill-blank" ? undefined : undefined}
      />
      {(config.imageIds?.length ?? 0) > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {config.imageIds!.map((id, i) => (
            <AuthedImage
              key={id}
              fileId={id}
              alt={`Figure ${i + 1} for this question`}
              className="w-full max-h-72 object-contain rounded-xl border border-zinc-800 bg-zinc-950 min-h-24"
            />
          ))}
        </div>
      )}
      {question.type === "coding" && (
        <div className="space-y-3 text-xs">
          <div className="flex flex-wrap gap-2">
            {language && <span className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-0.5 font-semibold text-zinc-200">{language}</span>}
            {config.timeLimitMs ? <span className="rounded-md border border-zinc-800 px-2 py-0.5 text-zinc-400">Time limit {config.timeLimitMs} ms</span> : null}
            {config.memoryLimitMb ? <span className="rounded-md border border-zinc-800 px-2 py-0.5 text-zinc-400">Memory {config.memoryLimitMb} MB</span> : null}
          </div>
          {(config.sampleInput || config.sampleOutput) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <div className="mb-1 font-bold text-zinc-400">Sample input</div>
                <pre className="rounded-lg bg-zinc-950 border border-zinc-800 p-2.5 font-mono text-zinc-200 whitespace-pre-wrap">{config.sampleInput || "—"}</pre>
              </div>
              <div>
                <div className="mb-1 font-bold text-zinc-400">Sample output</div>
                <pre className="rounded-lg bg-zinc-950 border border-zinc-800 p-2.5 font-mono text-zinc-200 whitespace-pre-wrap">{config.sampleOutput || "—"}</pre>
              </div>
            </div>
          )}
          {visibleCases.length > 0 && (
            <div className="space-y-1.5">
              <div className="font-bold text-zinc-400">Example test cases</div>
              {visibleCases.map((t, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 font-mono">
                  <pre className="rounded bg-zinc-950 border border-zinc-800 p-2 text-zinc-300 whitespace-pre-wrap">{t.input || "(empty)"}</pre>
                  <pre className="rounded bg-zinc-950 border border-zinc-800 p-2 text-zinc-300 whitespace-pre-wrap">{t.output || "(empty)"}</pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function QuestionAnswerInput({
  question,
  value,
  onChange,
  disabled = false,
}: {
  question: ExamQuestion;
  value: string | undefined;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const q = question;

  if (q.type === "multiple-choice" || q.type === "true-false") {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2.5" role="radiogroup">
        {optionList(q).map((opt, optIdx) => {
          const isSelected = value === opt;
          return (
            <button
              key={optIdx}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={disabled}
              onClick={() => onChange(opt)}
              className={`w-full min-h-12 text-left p-3.5 sm:p-4 rounded-xl border text-sm font-medium transition cursor-pointer flex items-center justify-between gap-3 disabled:cursor-not-allowed disabled:opacity-60 ${
                isSelected
                  ? "border-[#b2b2b2] bg-[#b2b2b2]/10 text-[#fcfcfc]"
                  : "border-zinc-800 bg-[#222222]/45 hover:bg-zinc-800/50 active:bg-zinc-800"
              }`}
            >
              <span className="flex items-start gap-2.5 min-w-0">
                <span className={`shrink-0 size-6 rounded-md text-[11px] font-extrabold flex items-center justify-center ${isSelected ? "bg-[#b2b2b2] text-zinc-950" : "bg-zinc-800 text-zinc-300"}`}>
                  {q.type === "true-false" ? opt.charAt(0) : String.fromCharCode(65 + optIdx)}
                </span>
                <span className="break-words pt-0.5">{opt}</span>
              </span>
              <span className={`size-4 rounded-full border flex items-center justify-center shrink-0 ${isSelected ? "border-[#b2b2b2] bg-[#b2b2b2]" : "border-zinc-700"}`}>
                {isSelected && <span className="size-1.5 rounded-full bg-zinc-950" />}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  if (q.type === "multiple-select") {
    const selected = parseJson<string[]>(value, []);
    const toggle = (opt: string) =>
      onChange(JSON.stringify(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt]));
    return (
      <div className="space-y-2">
        <p className="text-[11px] font-semibold text-zinc-400">Select all that apply.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2.5" role="group">
          {optionList(q).map((opt, optIdx) => {
            const isSelected = selected.includes(opt);
            return (
              <button
                key={optIdx}
                type="button"
                role="checkbox"
                aria-checked={isSelected}
                disabled={disabled}
                onClick={() => toggle(opt)}
                className={`w-full min-h-12 text-left p-3.5 sm:p-4 rounded-xl border text-sm font-medium transition cursor-pointer flex items-center justify-between gap-3 disabled:cursor-not-allowed disabled:opacity-60 ${
                  isSelected
                    ? "border-[#b2b2b2] bg-[#b2b2b2]/10 text-[#fcfcfc]"
                    : "border-zinc-800 bg-[#222222]/45 hover:bg-zinc-800/50 active:bg-zinc-800"
                }`}
              >
                <span className="flex items-start gap-2.5 min-w-0">
                  <span className={`shrink-0 size-6 rounded-md text-[11px] font-extrabold flex items-center justify-center ${isSelected ? "bg-[#b2b2b2] text-zinc-950" : "bg-zinc-800 text-zinc-300"}`}>
                    {String.fromCharCode(65 + optIdx)}
                  </span>
                  <span className="break-words pt-0.5">{opt}</span>
                </span>
                <span className={`size-4 rounded border flex items-center justify-center shrink-0 ${isSelected ? "border-[#b2b2b2] bg-[#b2b2b2]" : "border-zinc-700"}`}>
                  {isSelected && <Check className="size-3 text-zinc-950" strokeWidth={3} />}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (q.type === "fill-blank") {
    const n = Math.max(1, countBlanks(q.text));
    const vals = parseJson<string[]>(value, []);
    const set = (i: number, v: string) => {
      const next = Array.from({ length: n }, (_, k) => vals[k] ?? "");
      next[i] = v;
      onChange(JSON.stringify(next));
    };
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {Array.from({ length: n }, (_, i) => (
          <label key={i} className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-zinc-400">Blank ({i + 1})</span>
            <input
              type="text"
              value={vals[i] ?? ""}
              disabled={disabled}
              onChange={(e) => set(i, e.target.value)}
              autoComplete="off"
              className="w-full bg-[#222222]/50 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-base sm:text-sm select-text focus:outline-none focus:border-[#b2b2b2] focus:ring-1 focus:ring-[#b2b2b2] disabled:opacity-60"
            />
          </label>
        ))}
      </div>
    );
  }

  if (q.type === "short-answer") {
    return (
      <textarea
        rows={3}
        value={value || ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Write a brief answer..."
        className="w-full bg-[#222222]/50 border border-zinc-800 rounded-xl p-3.5 sm:p-4 text-base sm:text-sm font-normal select-text focus:outline-none focus:border-[#b2b2b2] focus:ring-1 focus:ring-[#b2b2b2] disabled:opacity-60"
      />
    );
  }

  if (q.type === "coding") {
    const config = parseJson<StudentQuestionConfig>(q.config, {});
    const current = value ?? config.starterCode ?? "";
    return (
      <textarea
        rows={14}
        value={current}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Tab" || disabled) return;
          e.preventDefault();
          const el = e.currentTarget;
          const { selectionStart: s, selectionEnd: end } = el;
          const next = `${current.slice(0, s)}    ${current.slice(end)}`;
          onChange(next);
          requestAnimationFrame(() => el.setSelectionRange(s + 4, s + 4));
        }}
        placeholder="// Write your code solution here..."
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-label="Code answer"
        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3.5 sm:p-4 text-base sm:text-xs font-mono select-text focus:outline-none focus:border-[#b2b2b2] focus:ring-1 focus:ring-[#b2b2b2] caret-white disabled:opacity-60"
      />
    );
  }

  // descriptive and any legacy free-text type
  return (
    <textarea
      rows={7}
      value={value || ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Write your explanation answer here..."
      className="w-full bg-[#222222]/50 border border-zinc-800 rounded-xl p-3.5 sm:p-4 text-base sm:text-sm font-normal select-text focus:outline-none focus:border-[#b2b2b2] focus:ring-1 focus:ring-[#b2b2b2] disabled:opacity-60"
    />
  );
}
