import React, { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Bot, Loader2, User as UserIcon, X } from "lucide-react";
import type { Availability, Ownership, Priority, TicketStatus } from "./types";
import { AVAILABILITY_LABEL, PRIORITY_LABEL, STATUS_LABEL } from "./types";

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export const focusRing =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1917] focus-visible:ring-offset-2";

export const btnPrimary = cx(
  "inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-xl bg-[#1a1917] text-white text-xs font-bold",
  "hover:bg-black active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer",
  focusRing
);
export const btnSecondary = cx(
  "inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-xl bg-white text-[#1a1917] text-xs font-bold border border-[#dedede]",
  "hover:bg-[#f6f6f6] active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer",
  focusRing
);
export const btnDanger = cx(
  "inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-xl bg-rose-600 text-white text-xs font-bold",
  "hover:bg-rose-700 active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer",
  focusRing
);
export const btnIcon = cx(
  "inline-flex items-center justify-center size-11 rounded-xl text-[#676767] hover:bg-[#f6f6f6] hover:text-[#1a1917] transition cursor-pointer",
  "disabled:opacity-40 disabled:cursor-not-allowed",
  focusRing
);
export const inputCls = cx(
  "w-full min-h-11 bg-[#f6f6f6] border border-[#dedede] rounded-xl px-3 text-sm text-[#1a1917] placeholder:text-[#a2a2a2]",
  "focus:outline-none focus:border-[#1a1917] focus-visible:ring-2 focus-visible:ring-[#1a1917]/20"
);
export const cardCls = "bg-white border border-[#dedede] rounded-2xl shadow-sm";

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export function formatMinutes(min: number | null | undefined): string {
  if (min === null || min === undefined || !Number.isFinite(min)) return "—";
  if (min < 1) return "<1m";
  return formatDuration(min * 60000);
}

export function fmt(v: number | null | undefined, suffix = ""): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${Math.round(v * 10) / 10}${suffix}`;
}

/** Rates from the analytics API are already 0–100 percentages. */
export function fmtRate(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${Math.round(v * 10) / 10}%`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  return `${formatDuration(now - t)} ago`;
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n)) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Re-renders every `intervalMs` and returns the current time. */
export function useNow(intervalMs = 30000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function useMediaQuery(query: string): boolean {
  const get = () => (typeof window !== "undefined" ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const fn = () => setMatches(mql.matches);
    fn();
    mql.addEventListener("change", fn);
    return () => mql.removeEventListener("change", fn);
  }, [query]);
  return matches;
}

/* ------------------------------------------------------------------ */
/* badges                                                              */
/* ------------------------------------------------------------------ */

const PRIORITY_STYLE: Record<Priority, string> = {
  P1: "bg-rose-50 text-rose-700 border-rose-200",
  P2: "bg-orange-50 text-orange-700 border-orange-200",
  P3: "bg-yellow-50 text-yellow-800 border-yellow-200",
  P4: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

export function PriorityBadge({ priority, withLabel = false }: { priority: Priority; withLabel?: boolean }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-extrabold tracking-wide shrink-0",
        PRIORITY_STYLE[priority] ?? PRIORITY_STYLE.P4
      )}
      title={`${priority} · ${PRIORITY_LABEL[priority] ?? ""}`}
    >
      {priority}
      {withLabel && <span className="font-semibold">{PRIORITY_LABEL[priority]}</span>}
    </span>
  );
}

const STATUS_STYLE: Record<TicketStatus, string> = {
  unassigned: "bg-amber-50 text-amber-700 border-amber-200",
  pending_acceptance: "bg-sky-50 text-sky-700 border-sky-200",
  in_progress: "bg-emerald-50 text-emerald-700 border-emerald-200",
  waiting_student: "bg-violet-50 text-violet-700 border-violet-200",
  escalated: "bg-rose-50 text-rose-700 border-rose-200",
  resolved: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

export function StatusChip({ status }: { status: TicketStatus }) {
  return (
    <span
      className={cx(
        "inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold whitespace-nowrap shrink-0",
        STATUS_STYLE[status] ?? STATUS_STYLE.resolved
      )}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function OwnershipBadge({ ownership }: { ownership: Ownership }) {
  const ai = ownership === "AI";
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold border shrink-0",
        ai ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-white text-[#1a1917] border-[#dedede]"
      )}
      title={ai ? "Handled by AI assistant" : "Handled by a human representative"}
    >
      {ai ? <Bot className="size-3" aria-hidden /> : <UserIcon className="size-3" aria-hidden />}
      {ai ? "AI" : "Human"}
    </span>
  );
}

const AVAIL_DOT: Record<Availability, string> = {
  available: "bg-emerald-500",
  busy: "bg-rose-500",
  away: "bg-amber-400",
  on_break: "bg-sky-400",
  offline: "bg-zinc-300",
  unavailable: "bg-zinc-300",
};

export function AvailabilityDot({
  availability,
  isOnline = true,
  className,
}: {
  availability: Availability;
  isOnline?: boolean;
  className?: string;
}) {
  const color = isOnline ? AVAIL_DOT[availability] ?? "bg-zinc-300" : "bg-zinc-300";
  return (
    <span
      className={cx("inline-block size-2.5 rounded-full ring-2 ring-white shrink-0", color, className)}
      aria-label={`${AVAILABILITY_LABEL[availability] ?? availability}${isOnline ? "" : " (offline)"}`}
      role="img"
    />
  );
}

export function WorkloadBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const color = pct >= 100 ? "bg-rose-500" : pct >= 75 ? "bg-amber-500" : "bg-[#1a1917]";
  return (
    <div
      className="h-2 w-full rounded-full bg-[#ececec] overflow-hidden"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={`Workload ${value} of ${max}`}
    >
      <div className={cx("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export type ProvenanceKind = "student" | "automatic" | "system" | "ai";

const PROVENANCE: Record<ProvenanceKind, { label: string; cls: string }> = {
  student: { label: "Provided by student", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  automatic: { label: "Collected automatically", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  system: { label: "From system records", cls: "bg-zinc-100 text-zinc-700 border-zinc-200" },
  ai: { label: "AI-generated interpretation", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
};

export function ProvenanceTag({ kind }: { kind: ProvenanceKind }) {
  const p = PROVENANCE[kind];
  return (
    <span className={cx("inline-flex items-center px-1.5 py-0.5 rounded-md border text-[10px] font-bold", p.cls)}>
      {p.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* states                                                              */
/* ------------------------------------------------------------------ */

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-xs text-[#8a8a8a]" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      <span>{label}…</span>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6 text-[#8a8a8a]">
      {Icon && <Icon className="size-10 mb-3 text-[#dedede]" />}
      <p className="text-sm font-bold text-[#1a1917]">{title}</p>
      {description && <p className="text-xs max-w-xs mt-1 leading-relaxed">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="m-4 p-4 rounded-xl border border-rose-200 bg-rose-50 text-xs text-rose-700 flex items-start gap-3" role="alert">
      <AlertTriangle className="size-4 shrink-0 mt-0.5" aria-hidden />
      <div className="flex-1">
        <p className="font-bold">Couldn't load</p>
        <p className="mt-0.5">{message}</p>
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} className={cx("text-xs font-bold underline min-h-11 px-2", focusRing)}>
          Retry
        </button>
      )}
    </div>
  );
}

export function KpiTile({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "default" | "warn" | "danger" | "good";
}) {
  const color =
    tone === "warn" ? "text-amber-700" : tone === "danger" ? "text-rose-600" : tone === "good" ? "text-emerald-600" : "text-[#1a1917]";
  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ duration: 0.2 }}
      className={cx(cardCls, "p-4 sm:p-5")}
    >
      <span className="text-[10.5px] font-bold text-[#8a8a8a] uppercase tracking-wider">{label}</span>
      <div className={cx("text-2xl sm:text-3xl font-extrabold mt-1 tabular-nums", color)}>{value}</div>
      {hint && <span className="text-[11px] text-[#676767] mt-1 block">{hint}</span>}
    </motion.div>
  );
}

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-bold text-[#1a1917]">
        {label}
      </label>
      {children}
      {hint && <span className="text-[11px] text-[#8a8a8a]">{hint}</span>}
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
  onChange: (v: boolean) => void;
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
      className={cx("inline-flex items-center min-h-11 min-w-11 justify-center cursor-pointer disabled:opacity-40 rounded-full", focusRing)}
    >
      <span className={cx("relative w-10 h-6 rounded-full transition-colors", checked ? "bg-[#1a1917]" : "bg-[#dedede]")}>
        <span
          className={cx(
            "absolute top-0.5 size-5 rounded-full bg-white shadow transition-all",
            checked ? "left-[18px]" : "left-0.5"
          )}
        />
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* dialogs                                                             */
/* ------------------------------------------------------------------ */

function useDialogBehaviour(open: boolean, onClose: () => void, containerRef: React.RefObject<HTMLDivElement | null>) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => {
      const el = containerRef.current;
      if (!el) return;
      const target =
        el.querySelector<HTMLElement>("[data-autofocus]") ||
        el.querySelector<HTMLElement>("input, textarea, select, button:not([data-close])") ||
        el;
      target.focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key === "Tab" && containerRef.current) {
        const nodes = Array.from(
          containerRef.current.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((n) => n.offsetParent !== null);
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey, true);
      previouslyFocused?.focus?.();
    };
  }, [open, containerRef]);
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  useDialogBehaviour(open, onClose, ref);
  const width = size === "sm" ? "max-w-md" : size === "lg" ? "max-w-2xl" : "max-w-lg";
  // Rendered in place (fixed positioning) — no portal needed and avoids a react-dom type dependency.
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <motion.div
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.18 }}
            className={cx(
              "relative w-full bg-white rounded-t-2xl sm:rounded-2xl shadow-xl border border-[#dedede] flex flex-col max-h-[92vh] focus:outline-none",
              width
            )}
          >
            <div className="flex items-start justify-between gap-3 p-5 border-b border-[#dedede]/60">
              <div>
                <h2 id={titleId} className="text-base font-bold text-[#1a1917]">
                  {title}
                </h2>
                {description && (
                  <p id={descId} className="text-xs text-[#676767] mt-1 leading-relaxed">
                    {description}
                  </p>
                )}
              </div>
              <button type="button" data-close onClick={onClose} aria-label="Close dialog" className={btnIcon}>
                <X className="size-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">{children}</div>
            {footer && <div className="p-4 border-t border-[#dedede]/60 flex flex-wrap justify-end gap-2">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function SlideOver({
  open,
  onClose,
  title,
  children,
  side = "right",
  widthCls = "w-full sm:w-[420px]",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  side?: "right" | "left";
  widthCls?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogBehaviour(open, onClose, ref);
  const fromX = side === "right" ? "100%" : "-100%";
  // Rendered in place (fixed positioning) — no portal needed and avoids a react-dom type dependency.
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90]">
          <motion.div
            className="absolute inset-0 bg-black/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ x: fromX }}
            animate={{ x: 0 }}
            exit={{ x: fromX }}
            transition={{ type: "tween", duration: 0.22 }}
            className={cx(
              "absolute top-0 bottom-0 bg-white shadow-2xl flex flex-col focus:outline-none",
              side === "right" ? "right-0 border-l" : "left-0 border-r",
              "border-[#dedede]",
              widthCls
            )}
          >
            <div className="flex items-center justify-between gap-3 px-4 h-16 border-b border-[#dedede]/60 shrink-0">
              <h2 id={titleId} className="text-sm font-bold text-[#1a1917]">
                {title}
              </h2>
              <button type="button" data-close onClick={onClose} aria-label={`Close ${title}`} className={btnIcon}>
                <X className="size-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function SectionHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1a1917]">{title}</h1>
        {description && <p className="text-xs text-[#8a8a8a] mt-1">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
