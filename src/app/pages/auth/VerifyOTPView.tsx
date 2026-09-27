import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";

interface VerifyOTPViewProps {
  forgotEmail: string;
  otp: string[];
  otpRefs: React.MutableRefObject<(HTMLInputElement | null)[]>;
  otpTimer: number;
  resendCooldown: number;
  otpError: boolean;
  otpSuccess: boolean;
  isVerifyingOtp: boolean;
  handleOtpChange: (value: string, index: number) => void;
  handleOtpKeyDown: (e: React.KeyboardEvent<HTMLInputElement>, index: number) => void;
  handleOtpPaste: (e: React.ClipboardEvent<HTMLInputElement>) => void;
  handleVerifyOTP: () => void;
  handleResendOtp: () => void;
  resetToEmail: () => void;
}

export function VerifyOTPView({
  forgotEmail,
  otp,
  otpRefs,
  otpTimer,
  resendCooldown,
  otpError,
  otpSuccess,
  isVerifyingOtp,
  handleOtpChange,
  handleOtpKeyDown,
  handleOtpPaste,
  handleVerifyOTP,
  handleResendOtp,
  resetToEmail,
}: VerifyOTPViewProps) {
  return (
    <motion.div
      key="forgot-otp"
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-6 w-full"
    >
      <button
        type="button"
        onClick={resetToEmail}
        className="back-link inline-flex items-center gap-2 text-xs font-semibold text-[#6b6861] hover:text-[#1a1917] transition-colors duration-200 cursor-pointer self-start bg-transparent border-none outline-none font-inherit"
      >
        <ArrowLeft className="size-3.5" /> Change email
      </button>

      <div>
        <div className="otp-heading text-[18px] font-bold text-[#1a1917] mb-1">Verify OTP</div>
        <div className="otp-desc text-xs leading-relaxed text-[#6b6861]">
          We've sent a 6-digit verification code to{" "}
          <strong className="text-[#1a1917] font-semibold break-all">{forgotEmail}</strong>
        </div>
      </div>

      {/* OTP boxes with conditional shake animation */}
      <motion.div
        animate={otpError ? { x: [-6, 6, -6, 6, 0] } : {}}
        transition={{ duration: 0.4 }}
        className="flex gap-2.5 justify-center py-2"
      >
        {Array(6).fill(0).map((_, i) => (
          <input
            key={i}
            ref={(el) => (otpRefs.current[i] = el)}
            type="text"
            maxLength={1}
            inputMode="numeric"
            pattern="[0-9]*"
            value={otp[i]}
            onChange={(e) => handleOtpChange(e.target.value, i)}
            onKeyDown={(e) => handleOtpKeyDown(e, i)}
            onPaste={handleOtpPaste}
            className={`w-12 h-14 bg-[#fafaf8] border border-solid rounded-xl font-bold text-lg text-center outline-none transition-all duration-200
              ${otp[i] ? "border-[#1a1917] bg-[#f0ece4]" : "border-[#e8e2d8] hover:border-[#d5cbb8]"}
              focus:border-[#1a1917] focus:ring-3 focus:ring-[#1a1917]/8 focus:scale-105
              ${otpError ? "border-[#d4183d]" : ""}
            `}
          />
        ))}
      </motion.div>

      {/* Timer & countdown */}
      <div className="timer text-center text-xs text-[#6b6861]">
        {otpTimer > 0 ? (
          <>
            Code expires in <span className="font-semibold text-[#1a1917]">
              {String(Math.floor(otpTimer / 60)).padStart(2, "0")}:
              {String(otpTimer % 60).padStart(2, "0")}
            </span>
          </>
        ) : (
          <span className="text-[#d4183d] font-semibold">Code expired — please resend.</span>
        )}
      </div>

      {/* Resend Row */}
      <div className="resend-row text-center text-xs text-[#9b9690]">
        Didn't receive the code? &nbsp;
        <button
          type="button"
          disabled={resendCooldown > 0 || otpSuccess}
          onClick={handleResendOtp}
          className={`resend-btn font-semibold transition-colors duration-200 cursor-pointer bg-transparent border-none outline-none font-inherit ${
            resendCooldown > 0 || otpSuccess
              ? "text-[#c0bab3] cursor-not-allowed"
              : "text-[#1a1917] underline underline-offset-4"
          }`}
        >
          {resendCooldown > 0 ? `Resend OTP (${resendCooldown}s)` : "Resend OTP"}
        </button>
      </div>

      {/* Success Banner */}
      <AnimatePresence>
        {otpSuccess && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="bg-[#eaf5ee] border border-[#b5dec2] rounded-xl p-3.5 flex items-center gap-3"
          >
            <div className="size-6 bg-emerald-500 rounded-full flex items-center justify-center shrink-0">
              <Check className="size-3.5 text-white" />
            </div>
            <span className="text-[13px] font-semibold text-emerald-800 leading-normal">
              OTP Verified Successfully — Redirecting to Reset Password...
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Verify Button */}
      {!otpSuccess && (
        <motion.button
          type="button"
          disabled={isVerifyingOtp}
          onClick={handleVerifyOTP}
          initial="idle"
          whileHover="hover"
          whileTap={{ scale: 0.98 }}
          variants={{
            idle: { y: 0, backgroundColor: "#1f1e1a", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)" },
            hover: { y: -2, backgroundColor: "#161512", boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)" }
          }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="h-auto w-full flex items-center justify-center gap-2 rounded-xl py-4 text-base font-bold leading-6 text-white/90 hover:text-white transition-all duration-[250ms] ease-out cursor-pointer outline-none disabled:pointer-events-none disabled:opacity-75"
        >
          {isVerifyingOtp ? (
            <div className="size-[18px] border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <span>Verify OTP</span>
              <motion.div variants={{ idle: { x: 0 }, hover: { x: 6 } }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }} className="flex items-center">
                <ArrowRight className="size-[13.333px]" />
              </motion.div>
            </>
          )}
        </motion.button>
      )}
    </motion.div>
  );
}
