import React, { useState } from "react";
import { X } from "lucide-react";

/**
 * Picks the sections a faculty member teaches (max 3 by default).
 * Section codes match the student profile format: DEPT-LETTER (e.g. CSE-A).
 * The backend enforces the same rules; this only guides input.
 */

export const MAX_FACULTY_SECTIONS = 3;

export const DEPARTMENT_PREFIXES: { prefix: string; name: string }[] = [
  { prefix: "CSE", name: "Computer Science & Engineering" },
  { prefix: "ECE", name: "Electronics & Communications" },
  { prefix: "EEE", name: "Electrical & Electronics Engineering" },
  { prefix: "MEC", name: "Mechanical Engineering" },
];

export const prefixForDepartment = (dept?: string | null) =>
  DEPARTMENT_PREFIXES.find((d) => d.name === dept)?.prefix ?? "CSE";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/** "CSE-A, cse-b" → ["CSE-A", "CSE-B"] */
export const parseSectionList = (raw?: string | null) =>
  Array.from(
    new Set(
      String(raw ?? "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    ),
  );

interface SectionPickerProps {
  value: string[];
  onChange: (next: string[]) => void;
  department?: string | null;
  max?: number;
  /** Visually flag the field (e.g. after a failed submit). */
  invalid?: boolean;
  id?: string;
}

export function SectionPicker({ value, onChange, department, max = MAX_FACULTY_SECTIONS, invalid, id }: SectionPickerProps) {
  const [prefix, setPrefix] = useState(prefixForDepartment(department));
  const full = value.length >= max;

  const toggle = (code: string) => {
    if (value.includes(code)) onChange(value.filter((v) => v !== code));
    else if (!full) onChange([...value, code]);
  };

  return (
    <div id={id} className="space-y-2.5">
      {/* Selected chips */}
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-xl border border-[#dedede] bg-white px-2 py-1.5" aria-live="polite">
        {value.length === 0 ? (
          <span className={`px-1 text-[11px] ${invalid ? "font-semibold text-rose-600" : "text-zinc-400"}`}>
            No sections selected — choose 1 to {max}.
          </span>
        ) : (
          value.map((code) => (
            <span key={code} className="inline-flex items-center gap-1 rounded-lg bg-zinc-950 py-1 pl-2.5 pr-1 text-[11px] font-bold text-white">
              {code}
              <button
                type="button"
                onClick={() => toggle(code)}
                aria-label={`Remove section ${code}`}
                className="flex size-4 items-center justify-center rounded text-white/70 hover:bg-white/15 hover:text-white"
              >
                <X className="size-3" />
              </button>
            </span>
          ))
        )}
        <span className="ml-auto pr-1 text-[10px] font-semibold tabular-nums text-zinc-500">
          {value.length}/{max}
        </span>
      </div>

      {/* Department prefix */}
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Department">
        {DEPARTMENT_PREFIXES.map((d) => (
          <button
            key={d.prefix}
            type="button"
            role="radio"
            aria-checked={prefix === d.prefix}
            title={d.name}
            onClick={() => setPrefix(d.prefix)}
            className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold transition ${
              prefix === d.prefix ? "border-zinc-950 bg-zinc-950 text-white" : "border-[#dedede] bg-white text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            {d.prefix}
          </button>
        ))}
      </div>

      {/* Section letters */}
      <div className="grid grid-cols-9 gap-1 sm:grid-cols-13" role="group" aria-label={`${prefix} sections`}>
        {LETTERS.map((l) => {
          const code = `${prefix}-${l}`;
          const selected = value.includes(code);
          const disabled = !selected && full;
          return (
            <button
              key={code}
              type="button"
              aria-pressed={selected}
              aria-label={`Section ${code}`}
              disabled={disabled}
              onClick={() => toggle(code)}
              className={`h-8 rounded-lg border text-[11px] font-bold transition ${
                selected
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : "border-[#dedede] bg-white text-zinc-700 hover:border-zinc-400 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-[#dedede]"
              }`}
            >
              {l}
            </button>
          );
        })}
      </div>
      <p className="text-[10.5px] leading-snug text-zinc-500">
        {full
          ? `Maximum of ${max} sections reached. Remove one to pick another.`
          : `You'll only see students from the selected sections.`}
      </p>
    </div>
  );
}
