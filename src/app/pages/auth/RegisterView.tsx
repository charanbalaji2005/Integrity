import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { ArrowRight, Eye, EyeOff, User, Mail, Lock, KeyRound, CheckCircle2, ShieldCheck, RefreshCw } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { toast } from "sonner";
import { apiFetch } from "../../utils/api-client";
import imgAssessmentIntegrityLogo from "../../../imports/LoginPortalIntegrityOs/assessment_integrity_logo.png";

interface RegisterViewProps {
  setView: (view: any) => void;
  onRegisterSuccess: (email: string, password: string) => void;
  isFacultyPortal?: boolean;
}

export function RegisterView({ setView, onRegisterSuccess }: RegisterViewProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [isOtpVerified, setIsOtpVerified] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleSendOtp = async () => {
    if (!email.trim()) {
      toast.error("Please enter your university email address.");
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.endsWith("@srmap.edu.in") && !normalizedEmail.endsWith("@support.com")) {
      toast.error("Only authorized @srmap.edu.in university email domains are permitted.");
      return;
    }

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
      setResendCooldown(60);
      toast.success("Verification code sent to your university email!");
    } catch (err: any) {
      toast.error(err.message || "Failed to send verification code.");
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp.trim() || otp.trim().length !== 6) {
      toast.error("Please enter the 6-digit verification code.");
      return;
    }

    setIsVerifyingOtp(true);
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
      toast.error(err.message || "Verification failed.");
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleRegister = async () => {
    if (!isOtpVerified) {
      toast.error("Please verify your university email before completing registration.");
      return;
    }

    if (!name.trim()) {
      toast.error("Please enter your full name.");
      return;
    }

    if (!password || !confirmPassword) {
      toast.error("Please enter and confirm your password.");
      return;
    }

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
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

  return (
    <motion.div
      key="register"
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-6 w-full"
    >
      {/* Header */}
      <div className="flex flex-col">
        <div className="flex items-center gap-3.5 mb-5 w-fit">
          <img
            src={imgAssessmentIntegrityLogo}
            alt="Assessment Integrity Logo"
            className="h-12 w-auto object-contain"
          />
          <h2 className="text-[32px] font-bold leading-[38.4px] tracking-[-1.6px] text-[#1a1917]">
            IntegrityOS
          </h2>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-xl font-bold leading-[28px] tracking-[-0.4px] text-[#1a1917]">
            Student Registration
          </h3>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
            <ShieldCheck className="size-3" />
            Verified Portal
          </span>
        </div>
        <p className="text-sm font-normal leading-[21px] text-[#6b6861]">
          Register with your verified institutional email to access examination sessions.
        </p>
      </div>

      {/* Verification Steps Visual Indicator */}
      <div className="flex items-center gap-2 p-3 rounded-xl bg-[#faf8f4] border border-[#ebdcc9]/80 text-xs">
        <div className="flex items-center gap-1.5 font-semibold text-[#5e5a52]">
          <span className={`flex items-center justify-center size-5 rounded-full text-[10px] font-bold ${
            isOtpVerified ? "bg-emerald-500 text-white" : "bg-[#c5af8a] text-white"
          }`}>
            {isOtpVerified ? "✓" : "1"}
          </span>
          <span>Verify Email</span>
        </div>
        <span className="text-[#d5cbb8]">→</span>
        <div className="flex items-center gap-1.5 font-semibold text-[#5e5a52]">
          <span className={`flex items-center justify-center size-5 rounded-full text-[10px] font-bold ${
            isOtpVerified ? "bg-[#c5af8a] text-white" : "bg-[#e2dfd5] text-[#8e8a80]"
          }`}>
            2
          </span>
          <span className={isOtpVerified ? "text-[#1a1917]" : "text-[#8e8a80]"}>Setup Security</span>
        </div>
      </div>

      {/* Form Fields */}
      <div className="flex flex-col gap-4">
        {/* Full Name */}
        <div className="flex flex-col gap-1.5 relative">
          <Label className="text-xs font-semibold leading-[16.8px] tracking-[0.24px] text-[#5e5a52]">
            Full Name
          </Label>
          <div className="relative">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isOtpVerified}
              placeholder="e.g. John Doe"
              className="h-[48px] w-full rounded-xl border border-[#e2dfd5] bg-[#fafaf8] pl-11 pr-4 py-3 text-sm text-[#1c1b1b] placeholder:text-[#a09c94] outline-none caret-[#c5af8a] transition-all duration-[250ms] ease-out hover:border-[#d5cbb8] focus:border-[#c5af8a] focus:ring-2 focus:ring-[#c5af8a]/20 disabled:opacity-75 disabled:bg-[#f0ede6]"
            />
            <User className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-[#9b9690] pointer-events-none" />
          </div>
        </div>

        {/* University Email */}
        <div className="flex flex-col gap-1.5 relative">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold leading-[16.8px] tracking-[0.24px] text-[#5e5a52]">
              University Email Address
            </Label>
            {isOtpVerified && (
              <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="size-3.5" /> Verified
              </span>
            )}
          </div>
          <div className="relative">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isOtpVerified || isSendingOtp}
              placeholder="name@srmap.edu.in"
              className="h-[48px] w-full rounded-xl border border-[#e2dfd5] bg-[#fafaf8] pl-11 pr-[130px] py-3 text-sm text-[#1c1b1b] placeholder:text-[#a09c94] outline-none caret-[#c5af8a] transition-all duration-[250ms] ease-out hover:border-[#d5cbb8] focus:border-[#c5af8a] focus:ring-2 focus:ring-[#c5af8a]/20 disabled:opacity-75 disabled:bg-[#f0ede6]"
            />
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-[#9b9690] pointer-events-none" />

            {!isOtpVerified && (
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={isSendingOtp || resendCooldown > 0 || !email.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1a1917] text-white hover:bg-[#2e2c29] transition-all duration-200 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {isSendingOtp ? (
                  <>
                    <RefreshCw className="size-3 animate-spin" />
                    Sending...
                  </>
                ) : resendCooldown > 0 ? (
                  `${resendCooldown}s`
                ) : isOtpSent ? (
                  "Resend Code"
                ) : (
                  "Send Code"
                )}
              </button>
            )}
          </div>
        </div>

        {/* OTP Input Block */}
        {isOtpSent && !isOtpVerified && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="flex flex-col gap-1.5 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25"
          >
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-[#5e5a52]">
                6-Digit Verification Code
              </Label>
              <span className="text-[11px] text-[#8e8a80]">Sent to {email}</span>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  className="h-[44px] w-full rounded-lg border border-[#e2dfd5] bg-white pl-10 pr-3 py-2 text-center text-base font-mono tracking-widest text-[#1c1b1b] outline-none focus:border-[#c5af8a]"
                />
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#9b9690] pointer-events-none" />
              </div>
              <button
                type="button"
                onClick={handleVerifyOtp}
                disabled={isVerifyingOtp || otp.length !== 6}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition-all duration-200 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
              >
                {isVerifyingOtp ? "Verifying..." : "Verify"}
              </button>
            </div>
            <p className="text-[11px] text-[#6b6861]">
              Verification token expires in 10 minutes. Maximum 5 attempts allowed.
            </p>
          </motion.div>
        )}

        {/* Password Setup (Available only after email ownership verification) */}
        {isOtpVerified && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-4 pt-1"
          >
            {/* Password */}
            <div className="flex flex-col gap-1.5 relative">
              <Label className="text-xs font-semibold leading-[16.8px] tracking-[0.24px] text-[#5e5a52]">
                Create Password (min. 8 characters)
              </Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-[48px] w-full rounded-xl border-[#e2dfd5] bg-[#fafaf8] pl-[44px] pr-[44px] py-3 text-sm text-[#1c1b1b] placeholder:text-[#a09c94] focus-visible:border-[#c5af8a]"
                />
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-[#9b9690] pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-[14px] top-1/2 -translate-y-1/2 text-[#8e8a80] hover:text-[#1a1917] transition-colors duration-200 cursor-pointer focus:outline-none"
                >
                  {showPassword ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="flex flex-col gap-1.5 relative">
              <Label className="text-xs font-semibold leading-[16.8px] tracking-[0.24px] text-[#5e5a52]">
                Confirm Password
              </Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-[48px] w-full rounded-xl border-[#e2dfd5] bg-[#fafaf8] pl-[44px] pr-4 py-3 text-sm text-[#1c1b1b] placeholder:text-[#a09c94] focus-visible:border-[#c5af8a]"
                />
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-[#9b9690] pointer-events-none" />
              </div>
            </div>

            {/* Register Button */}
            <motion.button
              type="button"
              onClick={handleRegister}
              disabled={isSubmitting}
              whileTap={{ scale: 0.98 }}
              className="btn-liquid-glass-black h-auto w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-base font-bold leading-6 transition-all duration-300 cursor-pointer outline-none disabled:opacity-50 mt-1"
            >
              {isSubmitting ? "Creating account..." : "Complete Registration"}
              <ArrowRight className="size-[14px]" />
            </motion.button>
          </motion.div>
        )}
      </div>

      {/* Institutional Policy Notice */}
      <div className="p-3 rounded-xl bg-[#f7f5f0] border border-[#e8e4dc] text-xs text-[#6b6861] flex flex-col gap-1">
        <p className="font-semibold text-[#1a1917]">Faculty & Staff Notice:</p>
        <p>
          Faculty and administrative accounts cannot be created via public registration. They are provisioned strictly by Institutional Administrators.
        </p>
      </div>

      <div className="text-center text-sm text-[#6b6861]">
        Already have an account?{" "}
        <button
          type="button"
          onClick={() => setView("login")}
          className="font-bold text-[#1a1917] hover:underline cursor-pointer bg-transparent border-none outline-none"
        >
          Login
        </button>
      </div>

      <div className="flex items-center justify-center gap-2 text-xs text-[#9b9690] border-t border-[#ebdcc9]/40 pt-3">
        <button
          type="button"
          onClick={() => setView("terms")}
          className="hover:text-[#1a1917] hover:underline cursor-pointer bg-transparent border-none outline-none"
        >
          Terms & Conditions
        </button>
        <span>•</span>
        <button
          type="button"
          onClick={() => setView("privacy")}
          className="hover:text-[#1a1917] hover:underline cursor-pointer bg-transparent border-none outline-none"
        >
          Privacy Policy
        </button>
      </div>
    </motion.div>
  );
}
