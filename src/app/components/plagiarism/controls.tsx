import React, { useId } from "react";
import { BookOpen, Globe, GraduationCap } from "lucide-react";
import {
  ALL_SOURCES,
  CheckOptions,
  MAX_MATCH_WORDS,
  MIN_MATCH_WORDS,
  SOURCE_KEY_LABEL,
  SourceKey,
  SourceType,
  clampMinWords,
} from "./types";

export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1917] focus-visible:ring-offset-2";

export const primaryBtn =
  `inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-xl bg-[#1a1917] text-white text-sm font-semibold hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer ${focusRing}`;

export const secondaryBtn =
  `inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-xl border border-[#dedede] bg-white text-[#1a1917] text-sm font-semibold hover:bg-[#f6f6f6] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer ${focusRing}`;

export const card = "bg-white border border-[#dedede] rounded-2xl shadow-[0_4px_20px_rgba(128,128,128,0.04)]";

export function SourceTypeIcon({ type, className = "size-3.5" }: { type: SourceType; className?: string }) {
  if (type === "internet") return <Globe className={className} aria-hidden="true" />;
  if (type === "publication") return <BookOpen className={className} aria-hidden="true" />;
  return <GraduationCap className={className} aria-hidden="true" />;
}

const SOURCE_KEY_ICON: Record<SourceKey, SourceType> = {
  repository: "student_paper",
  internet: "internet",
  publications: "publication",
};

interface ToggleProps {
  label: string;
  description?: string;
  pressed: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

export function Toggle({ label, description, pressed, onChange, disabled }: ToggleProps) {
  const descId = useId();
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-describedby={description ? descId : undefined}
      disabled={disabled}
      onClick={() => onChange(!pressed)}
      className={`w-full min-h-11 flex items-center justify-between gap-3 py-2 text-left rounded-xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${focusRing}`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-[#1a1917]">{label}</span>
        {description && (
          <span id={descId} className="block text-xs text-[#8a8a8a] mt-0.5 leading-snug">
            {description}
          </span>
        )}
      </span>
      <span
        aria-hidden="true"
        className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          pressed ? "bg-[#1a1917]" : "bg-[#dedede]"
        }`}
      >
        <span
          className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${
            pressed ? "translate-x-5.5" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

interface OptionsFieldsProps {
  value: CheckOptions;
  onChange: (v: CheckOptions) => void;
  /** Hide the repository toggle (used by the re-run filters toolbar). */
  showSave?: boolean;
  disabled?: boolean;
  layout?: "stack" | "toolbar";
}

export function OptionsFields({ value, onChange, showSave = true, disabled, layout = "stack" }: OptionsFieldsProps) {
  const minId = useId();
  const set = (patch: Partial<CheckOptions>) => onChange({ ...value, ...patch });
  const toggleSource = (key: SourceKey) => {
    const has = value.sources.includes(key);
    const next = has ? value.sources.filter((s) => s !== key) : [...value.sources, key];
    set({ sources: ALL_SOURCES.filter((s) => next.includes(s)) });
  };

  const exclusions = (
    <div className={layout === "toolbar" ? "space-y-1" : "space-y-1 divide-y divide-[#f0f0f0]"}>
      <Toggle
        label="Exclude quotes"
        description="Ignore text inside quotation marks."
        pressed={value.excludeQuotes}
        onChange={(v) => set({ excludeQuotes: v })}
        disabled={disabled}
      />
      <Toggle
        label="Exclude bibliography"
        description="Ignore the references / works cited section."
        pressed={value.excludeBibliography}
        onChange={(v) => set({ excludeBibliography: v })}
        disabled={disabled}
      />
    </div>
  );

  const minWords = (
    <div className="space-y-2">
      <label htmlFor={minId} className="block text-sm font-medium text-[#1a1917]">
        Exclude matches smaller than
      </label>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={MIN_MATCH_WORDS}
          max={MAX_MATCH_WORDS}
          value={value.minMatchWords}
          disabled={disabled}
          aria-label="Minimum match length in words"
          onChange={(e) => set({ minMatchWords: clampMinWords(Number(e.target.value)) })}
          className="flex-1 h-11 accent-[#1a1917] cursor-pointer"
        />
        <div className="flex items-center gap-1.5">
          <input
            id={minId}
            type="number"
            inputMode="numeric"
            min={MIN_MATCH_WORDS}
            max={MAX_MATCH_WORDS}
            value={value.minMatchWords}
            disabled={disabled}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (e.target.value !== "" && Number.isFinite(n)) set({ minMatchWords: Math.min(MAX_MATCH_WORDS, Math.max(0, n)) });
            }}
            onBlur={(e) => set({ minMatchWords: clampMinWords(Number(e.target.value)) })}
            className={`w-16 min-h-11 rounded-xl border border-[#dedede] px-2 text-center text-sm text-[#1a1917] bg-white ${focusRing}`}
          />
          <span className="text-xs text-[#676767]">words</span>
        </div>
      </div>
    </div>
  );

  const sources = (
    <fieldset className="space-y-1">
      <legend className="text-sm font-medium text-[#1a1917] mb-1">Compare against</legend>
      <div className={layout === "toolbar" ? "flex flex-wrap gap-2" : "grid grid-cols-1 sm:grid-cols-3 gap-2"}>
        {ALL_SOURCES.map((key) => {
          const checked = value.sources.includes(key);
          return (
            <label
              key={key}
              className={`flex items-center gap-2 min-h-11 px-3 rounded-xl border text-sm cursor-pointer transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#1a1917] ${
                checked ? "border-[#1a1917] bg-[#f6f6f6] text-[#1a1917]" : "border-[#dedede] text-[#676767]"
              } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <input
                type="checkbox"
                className="size-4 accent-[#1a1917]"
                checked={checked}
                disabled={disabled}
                onChange={() => toggleSource(key)}
              />
              <SourceTypeIcon type={SOURCE_KEY_ICON[key]} />
              <span>{SOURCE_KEY_LABEL[key]}</span>
            </label>
          );
        })}
      </div>
      {value.sources.length === 0 && (
        <p className="text-xs text-rose-600" role="alert">Select at least one source.</p>
      )}
    </fieldset>
  );

  if (layout === "toolbar") {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        {exclusions}
        {minWords}
        {sources}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {exclusions}
      {minWords}
      {sources}
      {showSave && (
        <div className="pt-1 border-t border-[#f0f0f0]">
          <Toggle
            label="Save to institutional repository"
            description="Stores this paper so future submissions (including other students') are compared against it."
            pressed={value.saveToRepository}
            onChange={(v) => set({ saveToRepository: v })}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}
