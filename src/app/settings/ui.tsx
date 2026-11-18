import React, { useId } from "react";

/** Shared building blocks for the Settings page, matching the dashboard style. */

export function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-lg font-extrabold tracking-tight text-[#1a1917]">{title}</h2>
      {description && <p className="mt-1 text-[13px] text-[#6b6b6b] max-w-2xl">{description}</p>}
    </div>
  );
}

export function Card({
  title,
  description,
  action,
  children,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[#dedede] bg-white p-4 sm:p-5 mb-4">
      {(title || action) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h3 className="text-[14px] font-bold text-[#1a1917]">{title}</h3>}
            {description && <p className="mt-0.5 text-[12px] text-[#8a8a8a]">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Row({
  label,
  description,
  htmlFor,
  children,
}: {
  label: string;
  description?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-[#efefef] py-3 first:border-t-0 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="block text-[13px] font-semibold text-[#1a1917]">
          {label}
        </label>
        {description && <p className="mt-0.5 text-[11.5px] leading-snug text-[#8a8a8a]">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b2b2b2] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-[#1a1917]" : "bg-[#d4d4d4]"
      }`}
    >
      <span
        className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`}
      />
    </button>
  );
}

export function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Row label={label} description={description}>
      <Toggle checked={checked} onChange={onChange} label={label} disabled={disabled} />
    </Row>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-xl border border-[#dedede] bg-[#f6f6f6] p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`min-h-8 rounded-[10px] px-3 text-[12px] font-bold transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b2b2b2] ${
              active ? "bg-white text-[#1a1917] shadow-sm" : "text-[#6b6b6b] hover:text-[#1a1917]"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Select({
  value,
  onChange,
  options,
  id,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  id?: string;
  disabled?: boolean;
}) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="min-h-9 w-full sm:w-64 rounded-xl border border-[#dedede] bg-white px-3 text-[13px] text-[#1a1917] focus:outline-none focus:border-[#b2b2b2] focus:ring-1 focus:ring-[#b2b2b2] disabled:opacity-50 cursor-pointer"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function TextField({
  label,
  value,
  onChange,
  type = "text",
  disabled,
  placeholder,
  multiline,
  hint,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  type?: string;
  disabled?: boolean;
  placeholder?: string;
  multiline?: boolean;
  hint?: string;
}) {
  const id = useId();
  const cls =
    "w-full rounded-xl border border-[#dedede] bg-white px-3 py-2 text-[13px] text-[#1a1917] placeholder:text-[#a2a2a2] focus:outline-none focus:border-[#b2b2b2] focus:ring-1 focus:ring-[#b2b2b2] disabled:bg-[#f6f6f6] disabled:text-[#8a8a8a]";
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[11.5px] font-bold uppercase tracking-wider text-[#8a8a8a]">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          rows={3}
          onChange={(e) => onChange?.(e.target.value)}
          className={`${cls} resize-y`}
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => onChange?.(e.target.value)}
          className={`${cls} min-h-9`}
        />
      )}
      {hint && <p className="mt-1 text-[11px] text-[#8a8a8a]">{hint}</p>}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const styles = {
    primary: "bg-[#1a1917] text-white hover:bg-[#333]",
    secondary: "border border-[#dedede] bg-white text-[#1a1917] hover:bg-[#f6f6f6]",
    danger: "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-xl px-4 text-[12.5px] font-bold transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b2b2b2] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${styles}`}
    >
      {children}
    </button>
  );
}

export function StatusPill({ tone, children }: { tone: "ok" | "warn" | "bad" | "neutral"; children: React.ReactNode }) {
  const styles = {
    ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warn: "bg-amber-50 text-amber-800 border-amber-200",
    bad: "bg-red-50 text-red-700 border-red-200",
    neutral: "bg-[#f6f6f6] text-[#555] border-[#dedede]",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-bold ${styles}`}>
      {children}
    </span>
  );
}

export function SavedLocallyNote() {
  return (
    <p className="mt-2 text-[11px] text-[#8a8a8a]">
      Saved automatically on this device.
    </p>
  );
}
