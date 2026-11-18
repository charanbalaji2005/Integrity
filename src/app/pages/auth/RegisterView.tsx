import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  BadgeCheck,
  Check,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Mail,
  MailCheck,
  PencilLine,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "../../utils/api-client";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "../../components/ui/input-otp";
import { cn } from "../../components/ui/utils";
import {
  AuthField,
  AuthHeader,
  AuthLogo,
  AuthSubmitButton,
  EMAIL_RE,
  PasswordField,
  PasswordStrength,
  TextLink,
  stagger,
} from "./components/AuthPrimitives";

interface RegisterViewProps {
  setView: (view: any) => void;
  onRegisterSuccess: (email: string, password: string) => void;
  isFacultyPortal?: boolean;
}

function emailIssue(raw: string) {
  const v = raw.trim().toLowerCase();
  if (!v) return "Enter your email address.";
  if (!EMAIL_RE.test(v)) return "That doesn't look like a valid email address.";
  return null;
}

const STEPS = [
  { label: "Details", icon: UserRound },
  { label: "Verify", icon: MailCheck },
  { label: "Secure", icon: LockKeyhole },
];

export function RegisterView({ setView, onRegisterSuccess }: RegisterViewProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [isOtpVerified, setIsOtpVerified] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [otpError, setOtpError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [attempted, setAttempted] = useState({ details: false, secure: false });

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (isOtpVerified) setTimeout(() => passwordRef.current?.focus(), 250);
  }, [isOtpVerified]);

  const step = isOtpVerified ? 2 : isOtpSent ? 1 : 0;

  /* ── validation ── */
  const nameIssue = !name.trim() ? "Enter your full name." : name.trim().length < 2 ? "Name looks too short." : null;
  const mailIssue = emailIssue(email);
  const pwIssue = !password ? "Create a password." : password.length < 8 ? "Use at least 8 characters." : null;
  const confirmIssue = !confirmPassword
    ? "Re-enter your password."
    : confirmPassword !== password
      ? "Passwords don't match."
      : null;

  const show = (field: string, group: "details" | "secure") => touched[field] || attempted[group];
  const touch = (field: string) => setTouched((t) => ({ ...t, [field]: true }));

  /* ── API: unchanged endpoints & payloads ── */
  const handleSendOtp = async () => {
    setAttempted((a) => ({ ...a, details: true }));
    if (nameIssue) {
      nameRef.current?.focus();
      return;
    }
    if (mailIssue) {
      emailRef.current?.focus();
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    setIsSendingOtp(true);
    try {
      const response = await apiFetch("/api/authentication/send-register-otp", {
        method: "POST",
        body: JSON.stringify({ email: normalizedEmail }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Failed to send verification code.");
      }

      setIsOtpSent(true);
      setOtp("");
      setOtpError(null);
      setResendCooldown(60);
      toast.success("Verification code sent to your email!");
    } catch (err: any) {
      toast.error(err.message || "Failed to send verification code.");
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp.trim() || otp.trim().length !== 6) {
      setOtpError("Enter the 6-digit code from your inbox.");
      return;
    }

    setIsVerifyingOtp(true);
    setOtpError(null);
    try {
      const response = await apiFetch("/api/authentication/verify-register-otp", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          otp: otp.trim(),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Invalid or expired verification code.");
      }

      setIsOtpVerified(true);
      toast.success("Email verified successfully! You can now set your password.");
    } catch (err: any) {
      setOtpError(err.message || "Verification failed.");
      toast.error(err.message || "Verification failed.");
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleRegister = async () => {
    setAttempted((a) => ({ ...a, secure: true }));
    if (!isOtpVerified) {
      toast.error("Please verify your email before completing registration.");
      return;
    }
    if (nameIssue) {
      nameRef.current?.focus();
      return;
    }
    if (pwIssue) {
      passwordRef.current?.focus();
      return;
    }
    if (confirmIssue) {
      confirmRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const response = await apiFetch("/api/auth/sign-up/email", {
        method: "POST",
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          name: name.trim(),
        }),
      });

      let data: any = {};
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const text = await response.text();
        throw new Error(text || `Server error: HTTP ${response.status}`);
      }

      if (!response.ok) {
        throw new Error(data.message || "Failed to create account.");
      }

      toast.success("Student account created successfully! Proceeding to link credentials...");
      onRegisterSuccess(normalizedEmail, password);
    } catch (err: any) {
      toast.error(err.message || "Registration failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 0) handleSendOtp();
    else if (step === 1) handleVerifyOtp();
    else handleRegister();
  };

  const changeEmail = () => {
    setIsOtpSent(false);
    setOtp("");
    setOtpError(null);
    setTimeout(() => emailRef.current?.focus(), 50);
  };

  return (
    <motion.div
      key="register"
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
          eyebrow={<><ShieldCheck className="size-3.5" aria-hidden="true" /> Student registration</>}
          title="Create your IntegrityOS account"
          description="Get started with intelligent examination integrity."
        />
      </motion.div>

      {/* Stepper */}
      <motion.ol variants={stagger.item} className="grid grid-cols-3 gap-2" aria-label="Registration progress">
        {STEPS.map((s, i) => {
          const done = i < step;
          const active = i === step;
          const Icon = s.icon;
          return (
            <li key={s.label} className="flex flex-col gap-2" aria-current={active ? "step" : undefined}>
              <div className="relative h-1 overflow-hidden rounded-full bg-sand">
                <motion.div
                  className={cn("absolute inset-y-0 left-0 rounded-full", done ? "bg-emerald-500" : "bg-tan-600")}
                  initial={false}
                  animate={{ width: done ? "100%" : active ? "45%" : "0%" }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
              <div
                className={cn(
                  "flex items-center gap-1.5 text-xs font-semibold transition-colors",
                  done ? "text-emerald-700" : active ? "text-ink-900" : "text-ink-400",
                )}
              >
                {done ? <Check className="size-3.5" aria-hidden="true" /> : <Icon className="size-3.5" aria-hidden="true" />}
                {s.label}
                <span className="sr-only">{done ? " (complete)" : active ? " (current)" : ""}</span>
              </div>
            </li>
          );
        })}
      </motion.ol>

      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5" aria-label="Create account">
        <motion.div variants={stagger.item}>
          <AuthField
            ref={nameRef}
            label="Full name"
            icon={UserRound}
            name="name"
            autoComplete="name"
            placeholder="e.g. Priya Sharma"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={(e) => e.target.value && touch("name")}
            error={show("name", "details") ? nameIssue : null}
            success={!!touched.name && !nameIssue}
          />
        </motion.div>

        <motion.div variants={stagger.item}>
          <AuthField
            ref={emailRef}
            label="Email address"
            icon={Mail}
            type="email"
            name="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={(e) => e.target.value && touch("email")}
            disabled={isOtpSent || isSendingOtp}
            error={!isOtpSent && show("email", "details") ? mailIssue : null}
            success={isOtpVerified}
            labelAside={
              isOtpVerified ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                  <BadgeCheck className="size-3.5" aria-hidden="true" /> Verified
                </span>
              ) : isOtpSent ? (
                <button
                  type="button"
                  onClick={changeEmail}
                  className="inline-flex items-center gap-1 rounded-sm text-xs font-semibold text-tan-700 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tan-600"
                >
                  <PencilLine className="size-3.5" aria-hidden="true" /> Change
                </button>
              ) : null
            }
            hint={!isOtpSent ? "We'll send a 6-digit code to confirm it's you." : undefined}
          />
        </motion.div>

        <AnimatePresence initial={false} mode="popLayout">
          {/* ── Step 1: verify code ── */}
          {step === 1 && (
            <motion.div
              key="otp"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="flex flex-col gap-3.5 rounded-2xl border border-card-border bg-card-bg p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white text-tan-700 shadow-[0_1px_2px_rgba(26,25,23,0.06)]">
                    <KeyRound className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 text-sm">
                    <p id="otp-label" className="font-semibold text-ink-900">Check your inbox</p>
                    <p className="text-[13px] leading-snug text-ink-500">
                      Enter the code sent to <span className="break-all font-medium text-ink-900">{email.trim().toLowerCase()}</span>
                    </p>
                  </div>
                </div>

                <InputOTP
                  maxLength={6}
                  value={otp}
                  onChange={(v) => {
                    setOtp(v.replace(/\D/g, ""));
                    setOtpError(null);
                  }}
                  inputMode="numeric"
                  pattern="^[0-9]*$"
                  autoComplete="one-time-code"
                  autoFocus
                  aria-labelledby="otp-label"
                  aria-invalid={!!otpError || undefined}
                  containerClassName="w-full"
                >
                  <InputOTPGroup className="grid w-full grid-cols-6 gap-1.5 sm:gap-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <InputOTPSlot
                        key={i}
                        index={i}
                        className={cn(
                          "!h-12 !w-full rounded-xl border bg-white font-mono text-lg font-semibold text-ink-900 first:rounded-xl last:rounded-xl",
                          "data-[active=true]:border-tan-600 data-[active=true]:ring-[3px] data-[active=true]:ring-tan-600/20",
                          otpError ? "border-rose-400" : "border-line",
                        )}
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>

                <AnimatePresence>
                  {otpError && (
                    <motion.p
                      role="alert"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="text-[12.5px] font-medium text-rose-600"
                    >
                      {otpError}
                    </motion.p>
                  )}
                </AnimatePresence>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-500">
                  <span>Expires in 10 minutes · max 5 attempts</span>
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={isSendingOtp || resendCooldown > 0}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-md text-xs font-semibold text-tan-700 transition-colors hover:text-ink-900 disabled:cursor-not-allowed disabled:text-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tan-600"
                  >
                    {isSendingOtp && <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />}
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Step 2: password ── */}
          {step === 2 && (
            <motion.div
              key="secure"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="flex flex-col gap-5 p-px">
                <div className="flex flex-col gap-3">
                  <PasswordField
                    ref={passwordRef}
                    label="Password"
                    icon={LockKeyhole}
                    name="new-password"
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onBlur={(e) => e.target.value && touch("password")}
                    visible={showPassword}
                    onVisibleChange={setShowPassword}
                    error={show("password", "secure") ? pwIssue : null}
                  />
                  <PasswordStrength password={password} />
                </div>

                <PasswordField
                  ref={confirmRef}
                  label="Confirm password"
                  icon={LockKeyhole}
                  name="confirm-password"
                  autoComplete="new-password"
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onBlur={(e) => e.target.value && touch("confirm")}
                  visible={showPassword}
                  onVisibleChange={setShowPassword}
                  hideToggle
                  error={show("confirm", "secure") ? confirmIssue : null}
                  success={!!confirmPassword && !confirmIssue}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div variants={stagger.item} className="pt-1">
          <AuthSubmitButton
            loading={step === 0 ? isSendingOtp : step === 1 ? isVerifyingOtp : isSubmitting}
            loadingText={step === 0 ? "Sending code…" : step === 1 ? "Verifying…" : "Creating account…"}
            disabled={step === 1 && otp.length !== 6}
          >
            {step === 0 ? "Send verification code" : step === 1 ? "Verify email" : "Create account"}
          </AuthSubmitButton>
          <p className="mt-3 text-center text-xs leading-relaxed text-ink-400">
            By continuing you agree to our{" "}
            <button type="button" onClick={() => setView("terms")} className="rounded-sm text-xs font-medium text-ink-500 underline underline-offset-2 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tan-600">
              Terms
            </button>{" "}
            and{" "}
            <button type="button" onClick={() => setView("privacy")} className="rounded-sm text-xs font-medium text-ink-500 underline underline-offset-2 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tan-600">
              Privacy Policy
            </button>
            .
          </p>
        </motion.div>
      </form>

      <motion.p variants={stagger.item} className="text-center text-sm text-ink-500">
        Already have an account? <TextLink onClick={() => setView("login")}>Sign in</TextLink>
      </motion.p>

      <motion.aside
        variants={stagger.item}
        className="flex gap-3 rounded-2xl border border-card-border/60 bg-sand/50 px-3.5 py-3 text-xs leading-relaxed text-ink-500"
      >
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-tan-700" aria-hidden="true" />
        <p>
          <span className="font-semibold text-ink-900">Faculty & staff:</span> accounts are provisioned by
          institutional administrators and can't be created here.
        </p>
      </motion.aside>
    </motion.div>
  );
}
