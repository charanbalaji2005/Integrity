import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, Eye, EyeOff, ShieldCheck, GraduationCap } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { SecurityContext } from "./SecurityContext";
import imgAssessmentIntegrityLogo from "../../../imports/LoginPortalIntegrityOs/assessment_integrity_logo.png";

interface FacultyLoginViewProps {
  email: string;
  setEmail: (email: string) => void;
  password: string;
  setPassword: (password: string) => void;
  showPassword: boolean;
  setShowPassword: (show: boolean) => void;
  isSubmitting: boolean;
  backendStatus: "checking" | "online" | "offline";
  handleLogin: () => void;
  handleGoogleSignIn: () => void;
  setView: (view: any) => void;
  clientInfo: { ip: string; userAgent: string } | null;
  currentTime: string;
  parseUserAgent: (ua?: string) => string;
  isAdminPortal?: boolean;
  setIsAdminPortal?: (val: boolean) => void;
  isFacultyPortal?: boolean;
  setIsFacultyPortal?: (val: boolean) => void;
  showDomainPopup?: boolean;
  onDismissDomainPopup?: () => void;
  onNavigate: (to: string) => void;
}

export function FacultyLoginView({
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
  clientInfo,
  currentTime,
  parseUserAgent,
  isAdminPortal,
  setIsAdminPortal,
  isFacultyPortal,
  setIsFacultyPortal,
  showDomainPopup = false,
  onDismissDomainPopup,
  onNavigate,
}: FacultyLoginViewProps) {
  return (
    <motion.div
      key="faculty-login"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-6 w-full"
    >
      {/* Volumetric Theme Indicator Badge */}
      <div className="flex justify-between items-center">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#ebdcc9]/25 text-[#91764c] border border-[#d5cbb8]/45">
          <GraduationCap className="size-3.5" />
          Faculty Portal Mode
        </div>
        <div>
          {backendStatus === 'online' ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
              <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
              Online
            </span>
          ) : backendStatus === 'offline' ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-500/10 text-rose-600 border border-rose-500/20">
              <span className="w-1 h-1 rounded-full bg-rose-500" />
              Offline
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-600 border border-amber-500/20 animate-pulse">
              <span className="w-1 h-1 rounded-full bg-amber-500 animate-bounce" />
              Checking...
            </span>
          )}
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col">
        <div className="flex items-center gap-3.5 mb-4 w-fit">
          <img
            src={imgAssessmentIntegrityLogo}
            alt="Assessment Integrity Logo"
            className="h-10 w-auto object-contain"
          />
          <h2 className="text-[28px] font-bold leading-[34px] tracking-[-1.2px] text-[#1a1917]">
            IntegrityOS
          </h2>
        </div>
        <h3 className="text-xl font-bold leading-[28px] tracking-[-0.4px] text-[#1a1917] mb-1">
          Faculty Portal Login
        </h3>
        <p className="text-sm font-normal leading-[21px] text-[#6b6861]">
          Design assessments, monitor live proctoring dashboard, and evaluate student attempts with AI-assisted grading tools.
        </p>
      </div>

      {/* Form */}
      <div className="flex flex-col gap-5">
        {/* Email */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-semibold leading-[16.8px] tracking-[0.24px] text-[#5e5a52]">
            Instructor Email
          </Label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@university.edu"
            className={`h-[50px] w-full rounded-xl border bg-[#fafaf8] px-[17px] py-[15px] text-sm text-[#1c1b1b] placeholder:text-[#a09c94] caret-[#c5af8a] outline-none transition-all duration-[250ms] ease-out cursor-text placeholder:transition-opacity placeholder:duration-[250ms] focus:placeholder:opacity-50 hover:shadow-[0_0_12px_rgba(197,175,138,0.15)] focus:ring-2 focus:shadow-[0_0_20px_rgba(197,175,138,0.2)] ${
              showDomainPopup
                ? "border-rose-400 ring-2 ring-rose-400/20 focus:border-rose-400 focus:ring-rose-400/20"
                : "border-[#e2dfd5] hover:border-[#d5cbb8] focus:border-[#c5af8a] focus:ring-[#c5af8a]/20"
            }`}
          />

          <AnimatePresence>
            {showDomainPopup && (
              <motion.div
                key="domain-popup"
                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 mt-1"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                  <p className="text-[11px] font-semibold text-rose-700 leading-tight">
                    Please use your <span className="font-bold text-rose-800">@srmap.edu.in</span> email.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onDismissDomainPopup}
                  className="shrink-0 text-rose-400 hover:text-rose-700 transition-colors cursor-pointer outline-none"
                >
                  <svg viewBox="0 0 14 14" className="size-3" fill="none">
                    <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Password */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold leading-[16.8px] tracking-[0.24px] text-[#5e5a52]">
              Password
            </Label>
            <button
              type="button"
              onClick={() => setView("forgot-email")}
              className="text-xs font-semibold leading-[16.8px] tracking-[0.24px] text-[#1a1917] hover:underline cursor-pointer bg-transparent border-none outline-none"
            >
              Forgot Password?
            </button>
          </div>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="h-[50px] w-full rounded-xl border-[#e2dfd5] bg-[#fafaf8] pl-[17px] pr-[44px] py-[15px] text-sm text-[#1c1b1b] placeholder:text-[#a09c94] focus-visible:border-[#c5af8a] transition-all duration-300"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-[14px] top-1/2 -translate-y-1/2 text-[#8e8a80] hover:text-[#1a1917] transition-colors duration-200 cursor-pointer focus:outline-none"
            >
              {showPassword ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
            </button>
          </div>
        </div>

        {/* Login Button */}
        <motion.button
          type="button"
          onClick={handleLogin}
          disabled={isSubmitting}
          whileTap={{ scale: 0.98 }}
          className="btn-liquid-glass-black h-auto w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-base font-bold leading-6 transition-all duration-300 cursor-pointer outline-none disabled:opacity-50 mt-1"
        >
          {isSubmitting ? "Logging in..." : "Login to Faculty Portal"}
          <ArrowRight className="size-[16px]" />
        </motion.button>

        {/* Divider */}
        <div className="relative flex items-center py-1">
          <div className="flex-1 border-t border-[#ebdcc9]/60" />
          <div className="bg-[#d5c7ab] px-3 py-0.5 rounded-[4px] mx-3">
            <p className="text-[9px] font-bold uppercase tracking-[1px] text-white">OR</p>
          </div>
          <div className="flex-1 border-t border-[#ebdcc9]/60" />
        </div>

        {/* Google SSO */}
        <Button
          variant="glass"
          onClick={() => handleGoogleSignIn()}
          disabled={isSubmitting}
          className="h-[50px] w-full gap-3 rounded-full py-3 shadow-[0_2px_4px_rgba(0,0,0,0.02)] transition-all duration-300 cursor-pointer"
        >
          <div className="flex items-center justify-center bg-white rounded-full p-0.5">
            <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
            </svg>
          </div>
          <span className="text-sm font-bold tracking-tight text-[#1a1917]">Sign in with Google</span>
        </Button>
      </div>
      <div className="flex flex-col gap-1.5 text-center text-xs text-[#6b6861] mt-2 p-3 rounded-xl bg-[#faf8f4] border border-[#ebdcc9]/80">
        <p className="font-semibold text-[#1a1917]">
          Faculty Account Provisioning
        </p>
        <p className="text-[11px] leading-relaxed text-[#75716a]">
          Faculty accounts cannot be self-registered. They are created and provisioned exclusively by Institutional Administrators. Please contact your university IT department if you require access.
        </p>
      </div>

      {/* Switch to Student Portal */}
      <div className="flex flex-col items-center gap-2 mt-2 text-center">
        <button
          type="button"
          onClick={() => {
            setIsFacultyPortal?.(false);
            onNavigate("/login");
          }}
          className="font-bold text-[#c5af8a] hover:text-[#1a1917] hover:underline cursor-pointer bg-transparent border-none outline-none text-xs"
        >
          Access Student Portal Login
        </button>

        <button
          type="button"
          onClick={() => setIsAdminPortal?.(!isAdminPortal)}
          className="font-bold text-[#6b6861] hover:text-[#1a1917] hover:underline cursor-pointer bg-transparent border-none outline-none text-xs"
        >
          Access Admin Portal
        </button>
      </div>

      {/* Security Context Footer */}
      <SecurityContext />
    </motion.div>
  );
}
