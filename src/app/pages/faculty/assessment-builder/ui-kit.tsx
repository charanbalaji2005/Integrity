import React from "react";
import { ChevronDown, Info } from "lucide-react";
import { Switch } from "../../../components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../../components/ui/tooltip";
import { cn } from "../../../components/ui/utils";

export const inputCls =
  "h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-[13.5px] text-zinc-900 placeholder:text-zinc-400 outline-none transition focus:border-zinc-400 focus:ring-4 focus:ring-zinc-900/5 disabled:bg-zinc-50 disabled:text-zinc-400 aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:ring-rose-500/10";

export const textareaCls =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13.5px] leading-relaxed text-zinc-900 placeholder:text-zinc-400 outline-none transition focus:border-zinc-400 focus:ring-4 focus:ring-zinc-900/5 aria-[invalid=true]:border-rose-400";

export const btn = {
  primary:
    "inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-3.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-black focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-zinc-900/15 disabled:cursor-not-allowed disabled:opacity-50",
  secondary:
    "inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3.5 text-[13px] font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-zinc-900/10 disabled:cursor-not-allowed disabled:opacity-50",
  ghost:
    "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-zinc-900/10 disabled:cursor-not-allowed disabled:opacity-50",
  danger:
    "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold text-rose-600 transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-rose-500/15 disabled:opacity-50",
  success:
    "inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-600/20 disabled:cursor-not-allowed disabled:opacity-50",
};

export function InfoTip({ children, label = "More information" }: { children: React.ReactNode; label?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label={label} className="inline-flex text-zinc-400 transition hover:text-zinc-700 focus-visible:outline-none focus-visible:text-zinc-900">
          <Info className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-64 bg-zinc-900 text-[11.5px] leading-snug text-white">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

export function SectionCard({
  id,
  step,
  icon: Icon,
  title,
  description,
  actions,
  children,
  className,
}: {
  id?: string;
  step?: number;
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-title` : undefined}
      className={cn("scroll-mt-24 rounded-2xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]", className)}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          {Icon && (
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700">
              <Icon className="size-4" />
            </span>
          )}
          <div className="min-w-0">
            <h2 id={id ? `${id}-title` : undefined} className="text-[15px] font-semibold tracking-tight text-zinc-900">
              {step != null && <span className="mr-1.5 text-zinc-400">{step}.</span>}
              {title}
            </h2>
            {description && <p className="mt-0.5 text-[12.5px] text-zinc-500">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  tip,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  tip?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div className="flex items-center gap-1.5">
        <label htmlFor={htmlFor} className="text-[12.5px] font-semibold text-zinc-700">
          {label}
          {required && <span className="ml-0.5 text-rose-500" aria-hidden="true">*</span>}
        </label>
        {tip && <InfoTip label={`About ${label}`}>{tip}</InfoTip>}
      </div>
      {children}
      {error ? (
        <p role="alert" className="text-[11.5px] font-medium text-rose-600">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[11.5px] text-zinc-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
  tip,
  compact,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  tip?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3", compact ? "py-1.5" : "py-2.5")}>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <label htmlFor={id} className={cn("cursor-pointer font-medium text-zinc-800", compact ? "text-[12.5px]" : "text-[13px]", disabled && "text-zinc-400")}>
            {label}
          </label>
          {tip && <InfoTip label={`About ${label}`}>{tip}</InfoTip>}
        </div>
        {description && <p className="mt-0.5 text-[11.5px] leading-snug text-zinc-500">{description}</p>}
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className="mt-0.5 data-[state=checked]:bg-zinc-900"
      />
    </div>
  );
}

/** Expandable settings card used in the sidebar. */
export function SettingsGroup({
  icon: Icon,
  title,
  summary,
  enabled,
  onToggle,
  toggleId,
  defaultOpen,
  children,
  badge,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  summary: string;
  enabled?: boolean;
  onToggle?: (v: boolean) => void;
  toggleId?: string;
  defaultOpen?: boolean;
  children?: React.ReactNode;
  badge?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(!!defaultOpen);
  const panelId = React.useId();
  return (
    <div className={cn("rounded-xl border transition", enabled === false ? "border-zinc-200 bg-zinc-50/60" : "border-zinc-200 bg-white")}>
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", enabled === false ? "bg-zinc-100 text-zinc-400" : "bg-zinc-900 text-white")}>
          <Icon className="size-3.5" />
        </span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={panelId}
          className="min-w-0 flex-1 text-left focus-visible:outline-none"
        >
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-semibold text-zinc-900">{title}</span>
            {badge}
          </div>
          <div className="truncate text-[11.5px] text-zinc-500">{summary}</div>
        </button>
        {onToggle && toggleId && (
          <Switch id={toggleId} aria-label={`Enable ${title}`} checked={!!enabled} onCheckedChange={onToggle} className="data-[state=checked]:bg-zinc-900" />
        )}
        {children && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
            className="rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
          >
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
          </button>
        )}
      </div>
      {children && open && (
        <div id={panelId} className="border-t border-zinc-100 px-3 pb-2 pt-1">
          {children}
        </div>
      )}
    </div>
  );
}

export function Pill({ children, tone = "zinc" }: { children: React.ReactNode; tone?: "zinc" | "emerald" | "amber" | "rose" | "sky" | "violet" }) {
  const tones = {
    zinc: "border-zinc-200 bg-zinc-50 text-zinc-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
    sky: "border-sky-200 bg-sky-50 text-sky-700",
    violet: "border-violet-200 bg-violet-50 text-violet-700",
  } as const;
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold", tones[tone])}>{children}</span>;
}

export function NumberInput({
  id,
  value,
  onChange,
  min,
  max,
  step = 1,
  invalid,
  suffix,
  className,
  ...rest
}: {
  id?: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  invalid?: boolean;
  suffix?: string;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "min" | "max" | "step">) {
  return (
    <div className={cn("relative", className)}>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        value={value ?? ""}
        min={min}
        max={max}
        step={step}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className={cn(inputCls, suffix && "pr-12")}
        {...rest}
      />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11.5px] text-zinc-400">{suffix}</span>}
    </div>
  );
}
