import React, { useId, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LoaderCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../../../components/ui/utils";
import imgLogo from "../../../../imports/LoginPortalIntegrityOs/assessment_integrity_logo.png";

/* ───────────────────────── Brand ───────────────────────── */

export function AuthLogo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <img
        src={imgLogo}
        alt=""
        aria-hidden="true"
        className={cn("w-auto object-contain", compact ? "h-8" : "h-10")}
      />
      <span
        className={cn(
          "font-bold tracking-[-0.04em] text-ink-900",
          compact ? "text-lg" : "text-[22px]",
        )}
      >
        IntegrityOS
      </span>
    </div>
  );
}

/* ───────────────────────── Header ───────────────────────── */

export function AuthHeader({
  eyebrow,
  title,
  description,
  aside,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-2">
      {(eyebrow || aside) && (
        <div className="flex items-center justify-between gap-3">
          {eyebrow ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-tan-700">
              {eyebrow}
            </span>
          ) : (
            <span />
          )}
          {aside}
        </div>
      )}
      <h1 className="text-[26px] sm:text-[30px] font-bold leading-[1.15] tracking-[-0.035em] text-ink-900 text-balance">
        {title}
      </h1>
      {description && (
        <p className="text-sm sm:text-[15px] leading-relaxed text-ink-500">{description}</p>
      )}
    </header>
  );
}

/* ───────────────────────── Backend status ───────────────────────── */

export function BackendStatusPill({ status }: { status: "checking" | "online" | "offline" }) {
  const map = {
    online: { label: "Systems online", dot: "bg-emerald-500", text: "text-emerald-700", ring: "border-emerald-500/20 bg-emerald-500/[0.07]" },
    offline: { label: "Offline", dot: "bg-rose-500", text: "text-rose-700", ring: "border-rose-500/20 bg-rose-500/[0.07]" },
    checking: { label: "Connecting", dot: "bg-amber-500", text: "text-amber-700", ring: "border-amber-500/20 bg-amber-500/[0.07]" },
  }[status];

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
        map.ring,
        map.text,
      )}
    >
      <span className="relative flex size-1.5">
        {status !== "offline" && (
          <span className={cn("absolute inset-0 rounded-full opacity-60 motion-safe:animate-ping", map.dot)} />
        )}
        <span className={cn("relative size-1.5 rounded-full", map.dot)} />
      </span>
      {map.label}
    </span>
  );
}

/* ───────────────────────── Field ───────────────────────── */

type FieldState = "default" | "error" | "success";

interface AuthFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  label: string;
  icon?: LucideIcon;
  error?: string | null;
  hint?: React.ReactNode;
  success?: boolean;
  labelAside?: React.ReactNode;
  /** Element rendered inside the input on the right (e.g. a button). */
  trailing?: React.ReactNode;
  trailingWidth?: number;
}

export const AuthField = React.forwardRef<HTMLInputElement, AuthFieldProps>(function AuthField(
  { label, icon: Icon, error, hint, success, labelAside, trailing, trailingWidth = 44, className, id, disabled, ...inputProps },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? `field-${autoId}`;
  const msgId = `${inputId}-msg`;
  const state: FieldState = error ? "error" : success ? "success" : "default";
  const showSuccessIcon = state === "success" && !trailing;

  return (
    <div className="group/field flex flex-col gap-1.5">
      <div className="flex min-h-5 items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-[13px] font-semibold text-ink-700">
          {label}
        </label>
        {labelAside}
      </div>

      <div
        className={cn(
          "relative flex items-center rounded-[14px] border transition-[border-color,box-shadow,background-color] duration-200 focus-within:bg-white",
          disabled ? "bg-sand/60 opacity-70" : "bg-upload-bg",
          state === "error" &&
            "border-rose-400 focus-within:shadow-[0_0_0_4px_rgba(244,63,94,0.12)]",
          state === "success" &&
            "border-emerald-500/40 focus-within:border-tan-600 focus-within:shadow-[0_0_0_4px_rgba(178,178,178,0.16)]",
          state === "default" &&
            "border-line hover:border-tan-300 focus-within:border-tan-600 focus-within:shadow-[0_0_0_4px_rgba(178,178,178,0.16)]",
        )}
      >
        {Icon && (
          <Icon
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute left-3.5 size-[18px] transition-colors duration-200",
              state === "error" ? "text-rose-500" : "text-ink-400 group-focus-within/field:text-tan-700",
            )}
          />
        )}
        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          aria-invalid={state === "error" || undefined}
          aria-describedby={error || hint ? msgId : undefined}
          className={cn(
            "h-12 w-full min-w-0 rounded-[14px] bg-transparent text-[15px] text-ink-900 caret-tan-600 outline-none placeholder:text-ink-300 disabled:cursor-not-allowed sm:text-sm",
            Icon ? "pl-11" : "pl-4",
            className,
          )}
          style={{ paddingRight: trailing ? trailingWidth : showSuccessIcon ? 40 : 16 }}
          {...inputProps}
        />
        <AnimatePresence initial={false}>
          {showSuccessIcon && (
            <motion.span
              key="ok"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              className="pointer-events-none absolute right-3.5 text-emerald-600"
            >
              <CheckCircle2 className="size-[18px]" aria-hidden="true" />
            </motion.span>
          )}
        </AnimatePresence>
        {trailing && <div className="absolute right-1.5 flex items-center">{trailing}</div>}
      </div>

      <AnimatePresence initial={false} mode="wait">
        {error ? (
          <motion.p
            key="err"
            id={msgId}
            role="alert"
            initial={{ opacity: 0, y: -4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            transition={{ duration: 0.18 }}
            className="flex items-start gap-1.5 text-[12.5px] font-medium leading-snug text-rose-600"
          >
            <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </motion.p>
        ) : hint ? (
          <motion.div
            key="hint"
            id={msgId}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-[12.5px] leading-snug text-ink-500"
          >
            {hint}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
});

/* ───────────────────────── Password field ───────────────────────── */

export const PasswordField = React.forwardRef<
  HTMLInputElement,
  Omit<AuthFieldProps, "type" | "trailing"> & { visible?: boolean; onVisibleChange?: (v: boolean) => void; hideToggle?: boolean }
>(function PasswordField({ visible: visibleProp, onVisibleChange, hideToggle, ...props }, ref) {
  const [visibleState, setVisibleState] = useState(false);
  const visible = visibleProp ?? visibleState;
  const setVisible = onVisibleChange ?? setVisibleState;

  return (
    <AuthField
      ref={ref}
      {...props}
      type={visible ? "text" : "password"}
      trailing={
        hideToggle ? undefined : (
          <button
            type="button"
            onClick={() => setVisible(!visible)}
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
            className="flex size-9 items-center justify-center rounded-[10px] text-ink-400 transition-colors hover:bg-sand hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tan-600"
          >
            <AnimatePresence initial={false} mode="wait">
              <motion.span
                key={visible ? "off" : "on"}
                initial={{ opacity: 0, rotate: -30, scale: 0.7 }}
                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                exit={{ opacity: 0, rotate: 30, scale: 0.7 }}
                transition={{ duration: 0.15 }}
                className="flex"
              >
                {visible ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
              </motion.span>
            </AnimatePresence>
          </button>
        )
      }
      trailingWidth={hideToggle ? 16 : 48}
    />
  );
});

/* ───────────────────────── Password strength ───────────────────────── */

export function scorePassword(pw: string) {
  const checks = [
    { label: "8+ characters", ok: pw.length >= 8 },
    { label: "Upper & lowercase", ok: /[a-z]/.test(pw) && /[A-Z]/.test(pw) },
    { label: "A number", ok: /\d/.test(pw) },
    { label: "A symbol", ok: /[^A-Za-z0-9]/.test(pw) },
  ];
  const score = checks.filter((c) => c.ok).length;
  return { checks, score };
}

export function PasswordStrength({ password }: { password: string }) {
  const { checks, score } = scorePassword(password);
  const levels = [
    { label: "Too weak", color: "bg-rose-500", text: "text-rose-600" },
    { label: "Weak", color: "bg-rose-500", text: "text-rose-600" },
    { label: "Fair", color: "bg-amber-500", text: "text-amber-600" },
    { label: "Good", color: "bg-tan-600", text: "text-tan-700" },
    { label: "Strong", color: "bg-emerald-500", text: "text-emerald-700" },
  ];
  const level = levels[score];

  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      <div className="flex items-center gap-3">
        <div className="grid flex-1 grid-cols-4 gap-1.5" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-1.5 overflow-hidden rounded-full bg-sand">
              <motion.div
                className={cn("h-full rounded-full", level.color)}
                initial={false}
                animate={{ width: i < score ? "100%" : "0%" }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          ))}
        </div>
        <span className={cn("w-16 text-right text-xs font-semibold", password ? level.text : "text-ink-400")}>
          {password ? level.label : "—"}
        </span>
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
        {checks.map((c) => (
          <li
            key={c.label}
            className={cn(
              "flex items-center gap-1.5 text-[12px] transition-colors",
              c.ok ? "text-emerald-700" : "text-ink-400",
            )}
          >
            <CheckCircle2 className={cn("size-3.5 shrink-0 transition-opacity", c.ok ? "opacity-100" : "opacity-40")} aria-hidden="true" />
            <span>
              {c.label}
              <span className="sr-only">{c.ok ? " — met" : " — not met"}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ───────────────────────── Buttons ───────────────────────── */

export function AuthSubmitButton({
  loading,
  loadingText,
  children,
  className,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; loadingText?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="submit"
      whileTap={reduce ? undefined : { scale: 0.985 }}
      disabled={loading || disabled}
      aria-busy={loading || undefined}
      className={cn(
        "btn-liquid-glass-black group/btn relative flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] text-[15px] font-semibold text-white outline-none",
        "focus-visible:ring-2 focus-visible:ring-tan-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...(props as any)}
    >
      {/* sheen */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-[14px]">
        <span className="absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/15 to-transparent opacity-0 transition-[left,opacity] duration-700 ease-out group-hover/btn:left-[130%] group-hover/btn:opacity-100" />
      </span>
      <AnimatePresence initial={false} mode="wait">
        {loading ? (
          <motion.span
            key="loading"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="relative flex items-center gap-2"
          >
            <LoaderCircle className="size-[18px] animate-spin" aria-hidden="true" />
            {loadingText ?? "Please wait…"}
          </motion.span>
        ) : (
          <motion.span
            key="idle"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="relative flex items-center gap-2"
          >
            {children}
            <ArrowRight
              className="size-4 transition-transform duration-300 ease-out group-hover/btn:translate-x-1"
              aria-hidden="true"
            />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

export function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
    </svg>
  );
}

export function AuthSecondaryButton({ className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-12 w-full items-center justify-center gap-3 rounded-[14px] border border-line bg-white text-sm font-semibold text-ink-900 shadow-[0_1px_2px_rgba(26,25,23,0.04)] transition-all duration-200",
        "hover:-translate-y-px hover:border-tan-300 hover:shadow-[0_6px_16px_-6px_rgba(128,128,128,0.35)]",
        "active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tan-600 focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function AuthDivider({ label = "or" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3" role="separator" aria-label={label}>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-line" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">{label}</span>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-line" />
    </div>
  );
}

export function TextLink({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-sm text-sm font-semibold text-ink-900 underline decoration-tan-600/50 decoration-2 underline-offset-4 transition-colors hover:decoration-tan-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tan-600",
        className,
      )}
      {...props}
    />
  );
}

export function LegalFooter({ setView }: { setView: (v: any) => void }) {
  return (
    <nav aria-label="Legal" className="flex items-center justify-center gap-4 text-xs text-ink-400">
      <button type="button" onClick={() => setView("terms")} className="rounded-sm py-1 text-xs transition-colors hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tan-600">
        Terms
      </button>
      <span aria-hidden="true" className="size-1 rounded-full bg-tan-300" />
      <button type="button" onClick={() => setView("privacy")} className="rounded-sm py-1 text-xs transition-colors hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tan-600">
        Privacy
      </button>
    </nav>
  );
}

/* ───────────────────────── Motion helpers ───────────────────────── */

export const stagger = {
  container: {
    hidden: {},
    show: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
  },
  item: {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
  },
};

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
