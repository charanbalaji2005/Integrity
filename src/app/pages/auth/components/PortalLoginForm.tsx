import React, { useRef, useState } from "react";
import { motion } from "motion/react";
import { LockKeyhole, Mail, type LucideIcon } from "lucide-react";
import { SecurityContext } from "../SecurityContext";
import {
  AuthDivider,
  AuthField,
  AuthHeader,
  AuthLogo,
  AuthSecondaryButton,
  AuthSubmitButton,
  BackendStatusPill,
  EMAIL_RE,
  GoogleGlyph,
  LegalFooter,
  PasswordField,
  stagger,
} from "./AuthPrimitives";
import { DemoCredentials, type DemoPortal } from "./DemoCredentials";

export interface PortalLink {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}

interface PortalLoginFormProps {
  viewKey: string;
  eyebrowIcon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  emailLabel: string;
  emailPlaceholder: string;
  /** Returns an inline error message for a well-formed address, or null. */
  domainError: (normalizedEmail: string) => string | null;
  submitLabel: string;

  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  isSubmitting: boolean;
  backendStatus: "checking" | "online" | "offline";
  handleLogin: () => void;
  handleGoogleSignIn: (emailOverride?: string) => void;
  setView: (view: any) => void;
  showDomainPopup?: boolean;

  /** Shown under the password label; omit to hide. */
  onForgotPassword?: () => void;
  /** Content between the Google button and the portal switcher (e.g. "Create account"). */
  belowSso?: React.ReactNode;
  /** Informational note rendered as a soft panel. */
  notice?: React.ReactNode;
  portalLinks: PortalLink[];
  /** Shows the public demo credentials for this portal (never set on the admin portal). */
  demoPortal?: DemoPortal;
}

export function PortalLoginForm(props: PortalLoginFormProps) {
  const {
    viewKey,
    eyebrowIcon: EyebrowIcon,
    eyebrow,
    title,
    description,
    emailLabel,
    emailPlaceholder,
    domainError,
    submitLabel,
    email,
    setEmail,
    password,
    setPassword,
    showPassword,
    setShowPassword,
    isSubmitting,
    backendStatus,
    handleLogin,
    handleGoogleSignIn,
    setView,
    showDomainPopup = false,
    onForgotPassword,
    belowSso,
    notice,
    portalLinks,
    demoPortal,
  } = props;

  const [touched, setTouched] = useState({ email: false });
  const [attempted, setAttempted] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const normalized = email.trim().toLowerCase();
  const emailIssue = !normalized
    ? "Enter your email address."
    : !EMAIL_RE.test(normalized)
      ? "That doesn't look like a valid email address."
      : domainError(normalized);
  const showEmailError = (touched.email || attempted || showDomainPopup) && !!emailIssue;
  const passwordIssue = !password ? "Enter your password." : null;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    // Only empty / malformed input is blocked here; domain + role checks stay
    // in the shared handleLogin so the existing shake and toasts still fire.
    if (!normalized || !EMAIL_RE.test(normalized)) {
      emailRef.current?.focus();
      return;
    }
    if (!password) {
      passwordRef.current?.focus();
      return;
    }
    handleLogin();
  };

  return (
    <motion.div
      key={viewKey}
      variants={stagger.container}
      initial="hidden"
      animate="show"
      exit={{ opacity: 0, y: -8, transition: { duration: 0.18 } }}
      className="flex w-full flex-col gap-7"
    >
      <motion.div variants={stagger.item} className="lg:hidden">
        <AuthLogo compact />
      </motion.div>

      <motion.div variants={stagger.item}>
        <AuthHeader
          eyebrow={<><EyebrowIcon className="size-3.5" aria-hidden="true" /> {eyebrow}</>}
          aside={<BackendStatusPill status={backendStatus} />}
          title={title}
          description={description}
        />
      </motion.div>

      {demoPortal && (
        <motion.div variants={stagger.item}>
          <DemoCredentials
            portal={demoPortal}
            onUse={(demoEmail, demoPassword) => {
              setEmail(demoEmail);
              setPassword(demoPassword);
              passwordRef.current?.focus();
            }}
          />
        </motion.div>
      )}

      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5" aria-label={title}>
        <motion.div variants={stagger.item}>
          <AuthField
            ref={emailRef}
            label={emailLabel}
            icon={Mail}
            type="email"
            name="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={emailPlaceholder}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={(e) => e.target.value && setTouched({ email: true })}
            error={showEmailError ? emailIssue : null}
            success={touched.email && !emailIssue}
          />
        </motion.div>

        <motion.div variants={stagger.item}>
          <PasswordField
            ref={passwordRef}
            label="Password"
            icon={LockKeyhole}
            name="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            visible={showPassword}
            onVisibleChange={setShowPassword}
            error={attempted && passwordIssue ? passwordIssue : null}
            labelAside={
              onForgotPassword && (
                <button
                  type="button"
                  onClick={onForgotPassword}
                  className="rounded-sm text-[13px] font-semibold text-tan-700 transition-colors hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tan-600"
                >
                  Forgot password?
                </button>
              )
            }
          />
        </motion.div>

        <motion.div variants={stagger.item} className="pt-1">
          <AuthSubmitButton loading={isSubmitting} loadingText="Signing in…">
            {submitLabel}
          </AuthSubmitButton>
        </motion.div>
      </form>

      <motion.div variants={stagger.item} className="flex flex-col gap-4">
        <AuthDivider label="or continue with" />
        <AuthSecondaryButton onClick={() => handleGoogleSignIn(email)} disabled={isSubmitting}>
          <GoogleGlyph className="size-5" />
          Google
        </AuthSecondaryButton>
      </motion.div>

      {belowSso && (
        <motion.div variants={stagger.item} className="text-center text-sm text-ink-500">
          {belowSso}
        </motion.div>
      )}

      {notice && (
        <motion.aside
          variants={stagger.item}
          className="flex gap-3 rounded-2xl border border-card-border/60 bg-sand/50 px-3.5 py-3 text-xs leading-relaxed text-ink-500"
        >
          <EyebrowIcon className="mt-0.5 size-4 shrink-0 text-tan-700" aria-hidden="true" />
          <div>{notice}</div>
        </motion.aside>
      )}

      <motion.nav variants={stagger.item} aria-label="Other portals" className="flex flex-col gap-2.5">
        <span className="text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">
          Other portals
        </span>
        <div className={`grid gap-2 ${portalLinks.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
          {portalLinks.map(({ label, icon: Icon, onClick }) => (
            <button
              key={label}
              type="button"
              onClick={onClick}
              className="group flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border border-line/80 bg-upload-bg/70 px-2 py-2 text-xs font-semibold text-ink-500 transition-all duration-200 hover:-translate-y-px hover:border-tan-300 hover:bg-white hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tan-600 sm:flex-row sm:gap-1.5"
            >
              <Icon className="size-4 text-tan-600 transition-colors group-hover:text-tan-700" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </motion.nav>

      <motion.div variants={stagger.item} className="flex flex-col gap-4">
        <SecurityContext />
        <LegalFooter setView={setView} />
      </motion.div>
    </motion.div>
  );
}
