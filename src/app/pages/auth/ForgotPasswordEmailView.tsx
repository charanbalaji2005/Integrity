import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mail, ArrowRight, ArrowLeft } from "lucide-react";
import { Label } from "../../components/ui/label";
import imgAssessmentIntegrityLogo from "../../../imports/LoginPortalIntegrityOs/assessment_integrity_logo.png";

interface ForgotPasswordEmailViewProps {
  forgotEmail: string;
  setForgotEmail: (email: string) => void;
  forgotEmailTouched: boolean;
  setForgotEmailTouched: (touched: boolean) => void;
  isSendingOtp: boolean;
  handleSendOTP: () => void;
  handleBackToLogin: () => void;
}

export function ForgotPasswordEmailView({
  forgotEmail,
  setForgotEmail,
  forgotEmailTouched,
  setForgotEmailTouched,
  isSendingOtp,
  handleSendOTP,
  handleBackToLogin,
}: ForgotPasswordEmailViewProps) {
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isEmailInvalid = forgotEmailTouched && forgotEmail && !EMAIL_RE.test(forgotEmail.trim().toLowerCase());

  return (
    <motion.div
      key="forgot-email"
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-8 w-full"
    >
      {/* Header */}
      <div className="flex flex-col">
        <div className="flex items-center gap-3.5 mb-6 w-fit">
          <img
            src={imgAssessmentIntegrityLogo}
            alt="Assessment Integrity Logo"
            className="h-12 w-auto object-contain"
          />
          <h2 className="text-[32px] font-bold leading-[38.4px] tracking-[-1.6px] text-[#1a1917]">
            IntegrityOS
          </h2>
        </div>
        <h3 className="text-xl font-bold leading-[28px] tracking-[-0.4px] text-[#1a1917] mb-2">Forgot Password</h3>
        <p className="text-sm font-normal leading-[21px] text-[#686868]">Reset your password securely using your registered email.</p>
      </div>

      <div className="flex flex-col gap-8">
        {/* Email entry */}
        <div className="flex flex-col gap-2 relative">
          <Label className="text-xs font-semibold leading-[16.8px] tracking-[0.24px] text-[#5a5a5a]">
            Email Address
          </Label>
          <div className="relative">
            <input
              type="email"
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
              onBlur={() => setForgotEmailTouched(true)}
              placeholder="Enter your registered email"
              className={`h-[50px] w-full rounded-xl border bg-[#fafaf8] pl-11 pr-4 py-4 text-sm text-[#1c1b1b] placeholder:text-[#9c9c9c] outline-none caret-[#b2b2b2] transition-all duration-[250ms] ease-out cursor-text placeholder:transition-opacity placeholder:duration-[250ms] focus:placeholder:opacity-50
                ${isEmailInvalid
                  ? "border-[#d4183d] focus:border-[#d4183d] focus:ring-2 focus:ring-[#d4183d]/20 shadow-[0_0_12px_rgba(212,24,61,0.08)]"
                  : "border-[#dfdfdf] hover:border-[#cccccc] hover:shadow-[0_0_12px_rgba(178,178,178,0.15)] focus:border-[#b2b2b2] focus:ring-2 focus:ring-[#b2b2b2]/20 focus:shadow-[0_0_20px_rgba(178,178,178,0.2)]"
                }`}
            />
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-[#979797] pointer-events-none" />
          </div>
          <AnimatePresence>
            {isEmailInvalid && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="absolute top-[calc(100%+2px)] left-0 pointer-events-none z-10"
              >
                <span className="text-[11px] font-semibold text-[#d4183d] tracking-wide">
                  Please enter a valid email address
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Send OTP Button */}
        <motion.button
          type="button"
          disabled={isSendingOtp}
          onClick={handleSendOTP}
          initial="idle"
          whileHover="hover"
          whileTap={{ scale: 0.98 }}
          variants={{
            idle: { y: 0, backgroundColor: "#1e1e1e", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)" },
            hover: { y: -2, backgroundColor: "#151515", boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)" }
          }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="h-auto w-full flex items-center justify-center gap-2 rounded-xl py-4 text-base font-bold leading-6 text-white/90 hover:text-white transition-all duration-[250ms] ease-out cursor-pointer outline-none disabled:pointer-events-none disabled:opacity-75"
        >
          {isSendingOtp ? (
            <div className="size-[18px] border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <span>Send OTP</span>
              <motion.div variants={{ idle: { x: 0 }, hover: { x: 6 } }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }} className="flex items-center">
                <ArrowRight className="size-[13.333px]" />
              </motion.div>
            </>
          )}
        </motion.button>

        <div className="relative flex items-center">
          <div className="flex-1 border-t border-[#dedede]/60" />
          <div className="bg-[#c8c8c8] px-3 py-1 rounded-[4px] mx-3">
            <p className="text-[10px] font-bold uppercase leading-[14px] tracking-[1px] text-white">OR</p>
          </div>
          <div className="flex-1 border-t border-[#dedede]/60" />
        </div>

        <div style={{ textAlign: "center" }}>
          <button
            type="button"
            onClick={handleBackToLogin}
            className="back-link inline-flex items-center gap-2 text-sm font-semibold text-[#686868] hover:text-[#1a1917] transition-colors duration-200 cursor-pointer bg-transparent border-none outline-none font-inherit"
          >
            <ArrowLeft className="size-4" /> Back to Login
          </button>
        </div>
      </div>
    </motion.div>
  );
}
