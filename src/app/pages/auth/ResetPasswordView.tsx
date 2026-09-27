import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  LockKeyhole, 
  Lock, 
  ArrowRight, 
  Check, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  XCircle, 
  AlertCircle
} from "lucide-react";
import { Label } from "../../components/ui/label";

interface ResetPasswordViewProps {
  newPassword: string;
  setNewPassword: (pw: string) => void;
  confirmPassword: string;
  setConfirmPassword: (pw: string) => void;
  newPasswordError: boolean;
  confirmPasswordError: boolean;
  resetCompleted: boolean;
  handleResetPassword: () => void;
  handleBackToLogin: () => void;
  email?: string;
}

export function ResetPasswordView({
  newPassword,
  setNewPassword,
  confirmPassword,
  setConfirmPassword,
  newPasswordError,
  confirmPasswordError,
  resetCompleted,
  handleResetPassword,
  handleBackToLogin,
  email = "",
}: ResetPasswordViewProps) {
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Criteria validation states
  const [checks, setChecks] = useState({
    length: false,
    uppercase: false,
    lowercase: false,
    number: false,
    specialChar: false,
    noSpaces: false,
    noPersonalInfo: true,
    noCommon: true,
    noRepeated: true,
    noSequential: true,
  });

  const [score, setScore] = useState(0);
  const [strengthLabel, setStrengthLabel] = useState("Very Weak");
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    const password = newPassword;
    const newChecks = {
      length: password.length >= 12 && password.length <= 64,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      specialChar: /[^A-Za-z0-9]/.test(password),
      noSpaces: password.length > 0 && !/\s/.test(password),
      noPersonalInfo: true,
      noCommon: true,
      noRepeated: true,
      noSequential: true,
    };

    if (password.length === 0) {
      newChecks.noPersonalInfo = true;
      newChecks.noCommon = true;
      newChecks.noRepeated = true;
      newChecks.noSequential = true;
    } else {
      const pLower = password.toLowerCase();

      // Personal info validation from email username
      if (email) {
        const emailLower = email.toLowerCase();
        const username = emailLower.split("@")[0];
        if (pLower.includes(emailLower) || (username && pLower.includes(username))) {
          newChecks.noPersonalInfo = false;
        }
      }

      // Common Passwords
      const commonPasswords = ["password", "123456", "12345678", "qwerty", "asdfgh", "admin123", "welcome", "letmein"];
      for (const common of commonPasswords) {
        if (pLower.includes(common)) {
          newChecks.noCommon = false;
        }
      }

      // Keyboard patterns
      const keyboardPatterns = ["qwerty", "asdfgh", "zxcvbn", "yuiop", "hjkl", "bnm"];
      for (const pattern of keyboardPatterns) {
        if (pLower.includes(pattern)) {
          newChecks.noCommon = false;
        }
      }

      // Repeated Characters (aaaaaa, 111111)
      if (/(.)\1{5,}/.test(password)) {
        newChecks.noRepeated = false;
      }

      // Sequential
      for (let i = 0; i <= password.length - 6; i++) {
        const slice = pLower.slice(i, i + 6);
        const codes = Array.from(slice).map(c => c.charCodeAt(0));
        let ascending = true;
        let descending = true;

        for (let j = 0; j < 5; j++) {
          if (codes[j + 1] !== codes[j] + 1) ascending = false;
          if (codes[j + 1] !== codes[j] - 1) descending = false;
        }
        if (ascending || descending) {
          newChecks.noSequential = false;
        }
      }
    }

    setChecks(newChecks);

    // Calculate score
    let calculatedScore = 0;
    if (newChecks.length) calculatedScore++;
    if (newChecks.uppercase && newChecks.lowercase) calculatedScore++;
    if (newChecks.number && newChecks.specialChar) calculatedScore++;
    if (newChecks.noPersonalInfo && newChecks.noCommon) calculatedScore++;
    if (newChecks.noRepeated && newChecks.noSequential) calculatedScore++;

    if (password.length === 0) calculatedScore = 0;

    setScore(calculatedScore);

    let calculatedLabel = "Very Weak";
    if (calculatedScore === 1) calculatedLabel = "Weak";
    else if (calculatedScore === 2) calculatedLabel = "Fair";
    else if (calculatedScore === 3) calculatedLabel = "Strong";
    else if (calculatedScore >= 4) calculatedLabel = "Very Strong";

    setStrengthLabel(calculatedLabel);

    // Dynamic suggestions
    const calculatedSuggestions = [];
    if (!newChecks.length) calculatedSuggestions.push("Length should be 12-64 characters.");
    if (!newChecks.uppercase) calculatedSuggestions.push("Include at least one uppercase letter.");
    if (!newChecks.lowercase) calculatedSuggestions.push("Include at least one lowercase letter.");
    if (!newChecks.number) calculatedSuggestions.push("Include at least one numeric digit.");
    if (!newChecks.specialChar) calculatedSuggestions.push("Include at least one special character.");
    if (!newChecks.noSpaces && password.length > 0) calculatedSuggestions.push("Remove spaces.");
    if (!newChecks.noPersonalInfo) calculatedSuggestions.push("Avoid username or email references.");
    if (!newChecks.noCommon) calculatedSuggestions.push("Avoid qwerty sequences or common terms.");
    if (!newChecks.noRepeated) calculatedSuggestions.push("Remove repeated characters (e.g. 'aaaaaa').");
    if (!newChecks.noSequential) calculatedSuggestions.push("Avoid sequential sequences (e.g. '123456').");

    setSuggestions(calculatedSuggestions);
  }, [newPassword, email]);

  const getStrengthColor = () => {
    switch (score) {
      case 0: return "bg-red-500";
      case 1: return "bg-red-500";
      case 2: return "bg-orange-500";
      case 3: return "bg-yellow-500";
      case 4: return "bg-green-500";
      case 5: return "bg-purple-500";
      default: return "bg-red-500";
    }
  };

  const getStrengthTextColor = () => {
    switch (score) {
      case 0: return "text-red-600";
      case 1: return "text-red-600";
      case 2: return "text-orange-600";
      case 3: return "text-yellow-600";
      case 4: return "text-green-600";
      case 5: return "text-purple-600";
      default: return "text-red-600";
    }
  };

  const isAllPassed = Object.values(checks).every(v => v === true);

  return (
    <motion.div
      key="forgot-reset"
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-6 w-full text-left"
    >
      {!resetCompleted ? (
        <>
          <div className="text-center py-2 flex flex-col items-center">
            <div className="w-14 h-14 bg-[#eaf5ee] rounded-full flex items-center justify-center mb-4 border border-[#b5dec2]/50">
              <LockKeyhole className="size-6 text-emerald-600" />
            </div>
            <div className="otp-heading text-[18px] font-bold text-[#1a1917] mb-1 font-sans">Reset Password</div>
            <div className="otp-desc text-xs text-[#6b6560] font-sans">Create a new secure password for your account.</div>
          </div>

          <div className="flex flex-col gap-4">
            {/* New Password */}
            <div className="flex flex-col gap-1.5 relative font-sans">
              <Label className="text-xs font-semibold leading-[16.8px] tracking-[0.24px] text-[#5e5a52]">
                New Password
              </Label>
              <div className="relative">
                <input
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className={`h-[46px] w-full rounded-xl border bg-[#fafaf8] pl-11 pr-10 py-3 text-sm text-[#1c1b1b] placeholder:text-[#a09c94] outline-none caret-[#c5af8a] transition-all duration-[250ms] ease-out cursor-text focus:bg-white
                    ${newPasswordError
                      ? "border-[#d4183d] focus:border-[#d4183d]"
                      : "border-[#e2dfd5] focus:border-[#c5af8a]"
                    }`}
                />
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-[#9b9690] pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 cursor-pointer"
                >
                  {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>

              {/* Strength Progress */}
              {newPassword.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-semibold text-zinc-500">Password Strength:</span>
                    <span className={`font-bold ${getStrengthTextColor()}`}>{strengthLabel}</span>
                  </div>
                  <div className="h-1.5 w-full bg-zinc-150 rounded-full overflow-hidden flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div 
                        key={i} 
                        className={`h-full flex-1 transition-colors duration-300 ${
                          i <= score ? getStrengthColor() : "bg-zinc-200"
                        }`} 
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div className="flex flex-col gap-1.5 relative font-sans">
              <Label className="text-xs font-semibold leading-[16.8px] tracking-[0.24px] text-[#5e5a52]">
                Confirm Password
              </Label>
              <div className="relative">
                <input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className={`h-[46px] w-full rounded-xl border bg-[#fafaf8] pl-11 pr-10 py-3 text-sm text-[#1c1b1b] placeholder:text-[#a09c94] outline-none caret-[#c5af8a] transition-all duration-[250ms] ease-out cursor-text focus:bg-white
                    ${confirmPasswordError
                      ? "border-[#d4183d] focus:border-[#d4183d]"
                      : "border-[#e2dfd5] focus:border-[#c5af8a]"
                    }`}
                />
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-[#9b9690] pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 cursor-pointer"
                >
                  {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {confirmPassword.length > 0 && (
                <div className="mt-1 flex items-center gap-1 text-[10px]">
                  {newPassword === confirmPassword ? (
                    <span className="text-green-600 font-bold flex items-center gap-0.5">✔ Passwords Match</span>
                  ) : (
                    <span className="text-rose-600 font-bold flex items-center gap-0.5">❌ Passwords Do Not Match</span>
                  )}
                </div>
              )}
            </div>

            {/* Live Requirements Checklist */}
            <div className="bg-zinc-50 border border-zinc-150 rounded-xl p-3 space-y-1.5 font-sans">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Security Requirements Checklist</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-1">
                <div className="flex items-center gap-1.5 text-[10px]">
                  {checks.length ? <CheckCircle2 className="size-3.5 text-green-600" /> : <XCircle className="size-3.5 text-zinc-300" />}
                  <span className={checks.length ? "text-zinc-800" : "text-zinc-400"}>12 to 64 Characters</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px]">
                  {checks.uppercase ? <CheckCircle2 className="size-3.5 text-green-600" /> : <XCircle className="size-3.5 text-zinc-300" />}
                  <span className={checks.uppercase ? "text-zinc-800" : "text-zinc-400"}>Uppercase Letter</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px]">
                  {checks.lowercase ? <CheckCircle2 className="size-3.5 text-green-600" /> : <XCircle className="size-3.5 text-zinc-300" />}
                  <span className={checks.lowercase ? "text-zinc-800" : "text-zinc-400"}>Lowercase Letter</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px]">
                  {checks.number ? <CheckCircle2 className="size-3.5 text-green-600" /> : <XCircle className="size-3.5 text-zinc-300" />}
                  <span className={checks.number ? "text-zinc-800" : "text-zinc-400"}>Numeric Digit</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px]">
                  {checks.specialChar ? <CheckCircle2 className="size-3.5 text-green-600" /> : <XCircle className="size-3.5 text-zinc-300" />}
                  <span className={checks.specialChar ? "text-zinc-800" : "text-zinc-400"}>Special Character</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px]">
                  {checks.noSpaces ? <CheckCircle2 className="size-3.5 text-green-600" /> : <XCircle className="size-3.5 text-zinc-300" />}
                  <span className={checks.noSpaces ? "text-zinc-800" : "text-zinc-400"}>No Spaces</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px]">
                  {checks.noPersonalInfo ? <CheckCircle2 className="size-3.5 text-green-600" /> : <XCircle className="size-3.5 text-zinc-300" />}
                  <span className={checks.noPersonalInfo ? "text-zinc-800" : "text-zinc-400"}>No Personal Info</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px]">
                  {checks.noCommon ? <CheckCircle2 className="size-3.5 text-green-600" /> : <XCircle className="size-3.5 text-zinc-300" />}
                  <span className={checks.noCommon ? "text-zinc-800" : "text-zinc-400"}>No Common Terms</span>
                </div>
              </div>
            </div>

            {/* Suggestions Alert */}
            {suggestions.length > 0 && newPassword.length > 0 && (
              <div className="p-2.5 bg-amber-50/50 border border-amber-200 text-amber-800 rounded-xl text-[10px] space-y-0.5 flex items-start gap-1.5 font-medium leading-normal font-sans">
                <AlertCircle className="size-3.5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block mb-0.5">Suggestions:</span>
                  <ul className="list-disc pl-3 space-y-0.5">
                    {suggestions.map((sug, idx) => (
                      <li key={idx}>{sug}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Reset Password Button */}
            <motion.button
              type="button"
              onClick={handleResetPassword}
              disabled={!isAllPassed || newPassword !== confirmPassword}
              initial="idle"
              whileHover={isAllPassed && newPassword === confirmPassword ? "hover" : "idle"}
              whileTap={{ scale: 0.98 }}
              variants={{
                idle: { y: 0, backgroundColor: "#1f1e1a", opacity: 0.6, cursor: "not-allowed" },
                hover: { y: -2, backgroundColor: "#161512", opacity: 1, cursor: "pointer" }
              }}
              className={`h-[48px] w-full flex items-center justify-center gap-2 rounded-xl text-sm font-bold text-white transition-all duration-[250ms] ease-out outline-none mt-2
                ${isAllPassed && newPassword === confirmPassword ? "opacity-100 cursor-pointer" : "opacity-40 cursor-not-allowed bg-zinc-400"}`}
            >
              <span>Reset Password</span>
              <motion.div variants={{ idle: { x: 0 }, hover: { x: 6 } }} className="flex items-center">
                <ArrowRight className="size-[13.333px]" />
              </motion.div>
            </motion.button>
          </div>
        </>
      ) : (
        <div className="text-center py-6 flex flex-col items-center w-full">
          <div className="w-16 h-16 bg-[#eaf5ee] rounded-full flex items-center justify-center mb-5 border border-[#b5dec2]">
            <Check className="size-8 text-emerald-600" />
          </div>
          <div className="otp-heading text-xl font-bold text-[#1a1917] mb-2 font-sans">✅ Password Updated Successfully</div>
          <div className="otp-desc text-sm leading-relaxed text-[#6b6560] mb-8 font-sans">
            Your password has been successfully reset.<br />All active devices have been logged out for safety.<br />Please log in again.
          </div>
          <motion.button
            type="button"
            onClick={handleBackToLogin}
            initial="idle"
            whileHover="hover"
            whileTap={{ scale: 0.98 }}
            variants={{
              idle: { y: 0, backgroundColor: "#1f1e1a" },
              hover: { y: -2, backgroundColor: "#161512" }
            }}
            className="h-[48px] w-full flex items-center justify-center gap-2 rounded-xl text-sm font-bold text-white cursor-pointer outline-none font-sans"
          >
            <span>Back to Login</span>
            <motion.div variants={{ idle: { x: 0 }, hover: { x: 6 } }} className="flex items-center">
              <ArrowRight className="size-[13.333px]" />
            </motion.div>
          </motion.button>
        </div>
      )}
    </motion.div>
  );
}
