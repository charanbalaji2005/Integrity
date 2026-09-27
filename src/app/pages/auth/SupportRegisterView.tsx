import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, ArrowLeft, Eye, EyeOff, User, Mail, Lock, LifeBuoy } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { toast } from "sonner";
import imgAssessmentIntegrityLogo from "../../../imports/LoginPortalIntegrityOs/assessment_integrity_logo.png";

interface SupportRegisterViewProps {
  setView: (view: any) => void;
  onNavigate: (to: string) => void;
}

export function SupportRegisterView({ setView, onNavigate }: SupportRegisterViewProps) {
  const [step, setStep] = useState<"register" | "otp">("register");
  
  // Registration States
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // OTP Verification States
  const [otp, setOtp] = useState<string[]>(Array(6).fill(""));
  const [otpError, setOtpError] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleRequestOtp = async () => {
    if (!name.trim() || !email.trim() || !password || !confirmPassword) {
      toast.error("Please fill in all fields.");
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    // Allow srmap, support, or university.edu domains for testing
    const isValidDomain = normalizedEmail.endsWith("@srmap.edu.in") || 
                          normalizedEmail.endsWith("@support.com") || 
                          normalizedEmail === "admin@university.edu";
    if (!isValidDomain) {
      toast.error("Please use an authorized support domain (e.g. @support.com).");
      return;
    }

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/support/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
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
        throw new Error(data.message || "Failed to send registration OTP.");
      }

      toast.success("Verification code sent to your email!");
      setStep("otp");
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (err: any) {
      toast.error(err.message || "Failed to send verification code.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOtpChange = (value: string, index: number) => {
    const cleanValue = value.replace(/\D/g, "");
    const newOtp = [...otp];
    newOtp[index] = cleanValue.slice(-1);
    setOtp(newOtp);
    if (cleanValue && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const newOtp = [...otp];
    for (let j = 0; j < pasteData.length; j++) {
      newOtp[j] = pasteData[j];
    }
    setOtp(newOtp);
    const focusIndex = Math.min(pasteData.length, 5);
    otpRefs.current[focusIndex]?.focus();
  };

  const handleVerifyOTP = async () => {
    const enteredCode = otp.join("");
    if (enteredCode.length < 6) {
      setOtpError(true);
      setTimeout(() => setOtpError(false), 400);
      return;
    }

    setIsVerifyingOtp(true);
    try {
      // 1. Verify OTP first
      const verifyResponse = await fetch("/api/support/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          otp: enteredCode,
        }),
      });

      let verifyData: any = {};
      const verifyContentType = verifyResponse.headers.get("content-type");
      if (verifyContentType && verifyContentType.includes("application/json")) {
        verifyData = await verifyResponse.json();
      }

      if (!verifyResponse.ok) {
        throw new Error(verifyData.message || "Invalid verification code.");
      }

      // 2. OTP matches! Create the user account
      const registerResponse = await fetch(
  "https://assessment-integrity-backend-0w4b.onrender.com/api/auth/sign-up/email",
  {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          name: name.trim(),
        }),
      });

      let registerData: any = {};
      const registerContentType = registerResponse.headers.get("content-type");
      if (registerContentType && registerContentType.includes("application/json")) {
        registerData = await registerResponse.json();
      }

      if (!registerResponse.ok) {
        throw new Error(registerData.message || "Failed to create support account.");
      }

      // Explicitly set support activeRole
      localStorage.setItem("activeRole", "support");
      
      toast.success("Support account created successfully! Please log in.");
      onNavigate("/support-login");
    } catch (err: any) {
      setOtpError(true);
      setOtp(Array(6).fill(""));
      otpRefs.current[0]?.focus();
      // Popup toast indicating OTP is invalid
      toast.error(err.message || "OTP is invalid. Please try again.");
      setTimeout(() => setOtpError(false), 2000);
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  return (
    <motion.div
      key="support-register"
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-6 w-full"
    >
      {/* Volumetric Theme Indicator Badge */}
      <div className="flex justify-between items-center">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#ebdcc9]/25 text-[#91764c] border border-[#d5cbb8]/45">
          <LifeBuoy className="size-3.5" />
          Support Portal Mode
        </div>
      </div>

      {step === "register" ? (
        <>
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
            <h3 className="text-xl font-bold leading-[28px] tracking-[-0.4px] text-[#1a1917] mb-1">Create Support Account</h3>
            <p className="text-sm font-normal leading-[21px] text-[#6b6861]">Register a new support agent console workspace profile.</p>
          </div>

          {/* Form */}
          <div className="flex flex-col gap-5">
            {/* Full Name */}
            <div className="flex flex-col gap-2 relative">
              <Label className="text-xs font-semibold leading-[16.8px] tracking-[0.24px] text-[#5e5a52]">
                Full Name
              </Label>
              <div className="relative">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Support Representative"
                  className="h-[50px] w-full rounded-xl border border-[#e2dfd5] bg-[#fafaf8] pl-11 pr-4 py-4 text-sm text-[#1c1b1b] placeholder:text-[#a09c94] outline-none caret-[#c5af8a] transition-all duration-[250ms] ease-out hover:border-[#d5cbb8] hover:shadow-[0_0_12px_rgba(197,175,138,0.15)] focus:border-[#c5af8a] focus:ring-2 focus:ring-[#c5af8a]/20 focus:shadow-[0_0_20px_rgba(197,175,138,0.2)]"
                />
                <User className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-[#9b9690] pointer-events-none" />
              </div>
            </div>

            {/* Email */}
            <div className="flex flex-col gap-2 relative">
              <Label className="text-xs font-semibold leading-[16.8px] tracking-[0.24px] text-[#5e5a52]">
                Support Email
              </Label>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@support.com"
                  className="h-[50px] w-full rounded-xl border border-[#e2dfd5] bg-[#fafaf8] pl-11 pr-4 py-4 text-sm text-[#1c1b1b] placeholder:text-[#a09c94] outline-none caret-[#c5af8a] transition-all duration-[250ms] ease-out hover:border-[#d5cbb8] hover:shadow-[0_0_12px_rgba(197,175,138,0.15)] focus:border-[#c5af8a] focus:ring-2 focus:ring-[#c5af8a]/20 focus:shadow-[0_0_20px_rgba(197,175,138,0.2)]"
                />
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-[#9b9690] pointer-events-none" />
              </div>
            </div>

            {/* Password */}
            <div className="flex flex-col gap-2 relative">
              <Label className="text-xs font-semibold leading-[16.8px] tracking-[0.24px] text-[#5e5a52]">
                Create Password
              </Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-[50px] w-full rounded-xl border-[#e2dfd5] bg-[#fafaf8] pl-[44px] pr-[44px] py-[15px] text-sm text-[#1c1b1b] placeholder:text-[#a09c94] focus-visible:border-[#c5af8a] transition-all duration-300"
                />
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-[#9b9690] pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-[14px] top-1/2 -translate-y-1/2 text-[#8e8a80] hover:text-[#1a1917] transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:text-[#1a1917]"
                >
                  {showPassword ? (
                    <EyeOff className="size-[18px]" />
                  ) : (
                    <Eye className="size-[18px]" />
                  )}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="flex flex-col gap-2 relative">
              <Label className="text-xs font-semibold leading-[16.8px] tracking-[0.24px] text-[#5e5a52]">
                Confirm Password
              </Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-[50px] w-full rounded-xl border-[#e2dfd5] bg-[#fafaf8] pl-[44px] pr-4 py-[15px] text-sm text-[#1c1b1b] placeholder:text-[#a09c94] focus-visible:border-[#c5af8a] transition-all duration-300"
                />
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-[#9b9690] pointer-events-none" />
              </div>
            </div>

            {/* Request OTP / Register Button */}
            <motion.button
              type="button"
              onClick={handleRequestOtp}
              disabled={isSubmitting}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="btn-liquid-glass-black h-auto w-full flex items-center justify-center gap-2 rounded-xl py-4 text-base font-bold leading-6 transition-all duration-300 cursor-pointer outline-none disabled:opacity-50"
            >
              {isSubmitting ? "Sending verification..." : "Verify Email with OTP"}
              <motion.div variants={{ idle: { x: 0 }, hover: { x: 6 } }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }} className="flex items-center">
                <ArrowRight className="size-[13.333px]" />
              </motion.div>
            </motion.button>
          </div>

          <div className="relative flex items-center">
            <div className="flex-1 border-t border-[#ebdcc9]/60" />
            <div className="bg-[#d5c7ab] px-3 py-1 rounded-[4px] mx-3">
              <p className="text-[10px] font-bold uppercase leading-[14px] tracking-[1px] text-white">OR</p>
            </div>
            <div className="flex-1 border-t border-[#ebdcc9]/60" />
          </div>

          <div className="text-center text-sm text-[#6b6861]">
            Already have a support account?{" "}
            <button
              type="button"
              onClick={() => onNavigate("/support-login")}
              className="font-bold text-[#1a1917] hover:underline cursor-pointer bg-transparent border-none outline-none"
            >
              Login
            </button>
          </div>
        </>
      ) : (
        <>
          {/* OTP Verification Step */}
          <button
            type="button"
            onClick={() => setStep("register")}
            className="inline-flex items-center gap-2 text-xs font-semibold text-[#6b6861] hover:text-[#1a1917] transition-colors duration-200 cursor-pointer self-start bg-transparent border-none outline-none"
          >
            <ArrowLeft className="size-3.5" /> Back to details
          </button>

          <div>
            <h3 className="text-xl font-bold text-[#1a1917] mb-1">Verify Security Code</h3>
            <p className="text-sm text-[#6b6861] leading-relaxed">
              A 6-digit OTP code has been sent to <strong className="text-[#1a1917] font-semibold">{email.trim().toLowerCase()}</strong>. Please enter the verification code below.
            </p>
          </div>

          {/* OTP code boxes */}
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
                className={`w-11 h-12 bg-[#fafaf8] border border-solid rounded-xl font-bold text-lg text-center outline-none transition-all duration-200
                  ${otp[i] ? "border-[#1a1917] bg-[#f0ece4]" : "border-[#e8e2d8] hover:border-[#d5cbb8]"}
                  focus:border-[#1a1917] focus:ring-3 focus:ring-[#1a1917]/8 focus:scale-105
                  ${otpError ? "border-[#d4183d] bg-rose-50" : ""}
                `}
              />
            ))}
          </motion.div>

          {/* Verify Button */}
          <motion.button
            type="button"
            disabled={isVerifyingOtp}
            onClick={handleVerifyOTP}
            whileTap={{ scale: 0.98 }}
            className="btn-liquid-glass-black h-auto w-full flex items-center justify-center gap-2 rounded-xl py-4 text-base font-bold leading-6 transition-all duration-300 cursor-pointer outline-none disabled:opacity-50"
          >
            {isVerifyingOtp ? "Creating support workspace..." : "Verify OTP & Create Account"}
            <ArrowRight className="size-[13.333px]" />
          </motion.button>

          <div className="text-center text-xs text-[#9b9690]">
            Didn't receive the code? &nbsp;
            <button
              type="button"
              disabled={isVerifyingOtp}
              onClick={handleRequestOtp}
              className="font-semibold text-[#1a1917] underline cursor-pointer bg-transparent border-none outline-none"
            >
              Resend OTP
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
}
