import React from "react";
import { DEPARTMENT_PREFIXES } from "../SectionPicker";

/**
 * Picks a class: section + semester. Department is derived from the section
 * prefix, matching how student class rooms are keyed:
 *   class:<department>:<"Semester N">:<section>
 *
 * allowedSections = null → any section (admins); otherwise only those listed
 * (a faculty member's own sections).
 */

export const SEMESTERS = Array.from({ length: 8 }, (_, i) => `Semester ${i + 1}`);
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export const departmentForSection = (section: string) =>
  DEPARTMENT_PREFIXES.find((d) => d.prefix === section.split("-")[0]?.toUpperCase())?.name ?? "";

interface Props {
  allowedSections: string[] | null;
  section: string;
  semester: string;
  onChange: (next: { section: string; semester: string; department: string }) => void;
  size?: "sm" | "md";
  className?: string;
}

export function ClassTargetPicker({ allowedSections, section, semester, onChange, size = "sm", className = "" }: Props) {
  const field = `${size === "sm" ? "h-8 text-[11px]" : "h-10 text-sm"} rounded-lg border border-[#dedede] bg-white px-2 font-semibold text-[#1a1917] outline-none focus:border-[#1a1917]`;
  const emit = (sec: string, sem: string) => onChange({ section: sec, semester: sem, department: departmentForSection(sec) });
  const [prefix = "CSE", letter = "A"] = section.split("-");

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {allowedSections ? (
        allowedSections.length ? (
          <select aria-label="Section" value={section} onChange={(e) => emit(e.target.value, semester)} className={field}>
            {allowedSections.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-[11px] font-semibold text-rose-600">No sections assigned to you yet.</span>
        )
      ) : (
        <>
          <select aria-label="Department" value={prefix} onChange={(e) => emit(`${e.target.value}-${letter}`, semester)} className={field}>
            {DEPARTMENT_PREFIXES.map((d) => (
              <option key={d.prefix} value={d.prefix}>
                {d.prefix}
              </option>
            ))}
          </select>
          <select aria-label="Section letter" value={letter} onChange={(e) => emit(`${prefix}-${e.target.value}`, semester)} className={field}>
            {LETTERS.map((l) => (
              <option key={l} value={l}>
                Section {l}
              </option>
            ))}
          </select>
        </>
      )}
      <select aria-label="Semester" value={semester} onChange={(e) => emit(section, e.target.value)} className={field}>
        {SEMESTERS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  );
}
