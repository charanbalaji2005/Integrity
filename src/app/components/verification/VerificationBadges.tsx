import React from "react";
import { BadgeCheck, Clock3, Landmark } from "lucide-react";

/** Blue "Verified" check shown next to an approved student's name. */
export function VerifiedBadge({ size = "sm", className = "" }: { size?: "sm" | "md"; className?: string }) {
  const icon = size === "md" ? "size-4" : "size-3.5";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-[#1d9bf0]/10 px-2 py-0.5 text-[11px] font-bold text-[#1478c2] ring-1 ring-[#1d9bf0]/25 ${className}`}
      title="Enrolment verified by an administrator"
    >
      <BadgeCheck className={`${icon} fill-[#1d9bf0] text-white`} aria-hidden="true" />
      Verified
    </span>
  );
}

export function PendingBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 ring-1 ring-amber-200 ${className}`}
    >
      <Clock3 className="size-3.5" aria-hidden="true" />
      Under review
    </span>
  );
}

/** Initials for the institution monogram, e.g. "SRM University AP" -> "SRM". */
function monogram(name: string): string {
  const acronym = name.match(/\b[A-Z]{2,}\b/)?.[0];
  if (acronym) return acronym.slice(0, 4);
  return name
    .split(/\s+/)
    .filter((w) => w.length > 2 && !/^(of|the|and|for)$/i.test(w))
    .slice(0, 3)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** College icon + name, shown once a student is verified for that institution. */
export function InstitutionBadge({
  name,
  compact = false,
  className = "",
}: {
  name: string;
  compact?: boolean;
  className?: string;
}) {
  const mark = monogram(name) || "";
  return (
    <span
      className={`inline-flex min-w-0 items-center gap-2 rounded-xl border border-[#ebdcc9] bg-white px-2 py-1 ${className}`}
      title={name}
    >
      <span
        className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#1a1917] to-[#3d3934] text-[9px] font-extrabold tracking-tight text-[#f5e9d3]"
        aria-hidden="true"
      >
        {mark ? mark : <Landmark className="size-3.5" />}
      </span>
      {!compact && <span className="truncate text-[12px] font-semibold text-[#1a1917]">{name}</span>}
      {compact && <span className="sr-only">{name}</span>}
    </span>
  );
}
