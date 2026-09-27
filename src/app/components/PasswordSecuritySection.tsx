import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Lock, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  KeyRound,
  Check,
  LogOut
} from "lucide-react";
import { toast } from "sonner";

interface PasswordSecuritySectionProps {
  userId: string;
  userDetails: {
    name?: string | null;
    email?: string | null;
    rollNumber?: string | null;
    academicId?: string | null;
  };
  onSuccessLogout: () => void;
}

export const PasswordSecuritySection: React.FC<PasswordSecuritySectionProps> = ({ 
  userId, 
  userDetails,
  onSuccessLogout 
}) => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successReset, setSuccessReset] = useState(false);

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

  // Validate password in real-time
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

      // Personal info
      if (userDetails.name) {
        const nameParts = userDetails.name.toLowerCase().split(/\s+/).filter(part => part.length > 2);
        for (const part of nameParts) {
          if (pLower.includes(part)) {
            newChecks.noPersonalInfo = false;
          }
        }
      }

      if (userDetails.email) {
        const emailLower = userDetails.email.toLowerCase();
        const username = emailLower.split("@")[0];
        if (pLower.includes(emailLower) || (username && pLower.includes(username))) {
          newChecks.noPersonalInfo = false;
        }
      }

      if (userDetails.rollNumber) {
        const rollLower = userDetails.rollNumber.toLowerCase();
        if (rollLower.length > 2 && pLower.includes(rollLower)) {
          newChecks.noPersonalInfo = false;
        }
      }

      if (userDetails.academicId) {
        const acadLower = userDetails.academicId.toLowerCase();
        if (acadLower.length > 2 && pLower.includes(acadLower)) {
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
    if (!newChecks.noPersonalInfo) calculatedSuggestions.push("Avoid personal details like names, email, IDs.");
    if (!newChecks.noCommon) calculatedSuggestions.push("Avoid qwerty sequences or common terms.");
    if (!newChecks.noRepeated) calculatedSuggestions.push("Remove repeated characters (e.g. 'aaaaaa').");
    if (!newChecks.noSequential) calculatedSuggestions.push("Avoid sequential sequences (e.g. '123456').");

    setSuggestions(calculatedSuggestions);
  }, [newPassword, userDetails]);

  // Color mapping for strength level
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

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    const isAllPassed = Object.values(checks).every(v => v === true);
    if (!isAllPassed) {
      toast.error("Please satisfy all password criteria before submitting.");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/profile/password", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({
          currentPassword,
          newPassword
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to update password");
      }

      toast.success("Password Updated Successfully!");
      setSuccessReset(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to change password. Make sure current password is correct.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFinalSignOut = () => {
    onSuccessLogout();
  };

  if (successReset) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="p-6 bg-[#FAF8F5] border border-emerald-200 rounded-2xl text-center space-y-5"
      >
        <div className="size-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto border border-emerald-200 shadow-sm">
          <Check className="size-6 text-emerald-600" />
        </div>
        <div className="space-y-1.5">
          <h4 className="text-base font-extrabold text-zinc-900 font-sans">✅ Password Updated Successfully</h4>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto leading-relaxed font-sans">
            Your password has been securely updated. For your security, you have been signed out from all active sessions on all devices.
          </p>
        </div>
        <button
          onClick={handleFinalSignOut}
          className="h-10 px-5 bg-zinc-950 hover:bg-zinc-900 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 mx-auto transition-transform active:scale-[0.98] shadow-sm cursor-pointer"
        >
          <LogOut className="size-3.5" />
          Acknowledge & Sign Out
        </button>
      </motion.div>
    );
  }

  return (
    <form onSubmit={handleUpdatePassword} className="space-y-4 border border-[#ebdcc9] rounded-2xl p-4 bg-white/45 shadow-sm text-left">
      <h4 className="font-extrabold text-[11px] text-[#8e8a80] uppercase tracking-wider flex items-center gap-2 mb-2 font-sans">
        <KeyRound className="size-4 text-zinc-700" /> Password Security Settings
      </h4>

      {/* 1. Current Password */}
      <div className="flex flex-col gap-1 relative font-sans">
        <label className="text-xs font-semibold text-zinc-700">Current Password</label>
        <div className="relative">
          <input
            type={showCurrent ? "text" : "password"}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="h-9 w-full pl-3 pr-10 border border-[#ebdcc9] rounded-xl bg-white focus:outline-none focus:border-zinc-900 text-xs"
            required
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShowCurrent(!showCurrent)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 cursor-pointer"
          >
            {showCurrent ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
        </div>
      </div>

      {/* 2. New Password */}
      <div className="flex flex-col gap-1 relative font-sans">
        <label className="text-xs font-semibold text-zinc-700">New Password</label>
        <div className="relative">
          <input
            type={showNew ? "text" : "password"}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="h-9 w-full pl-3 pr-10 border border-[#ebdcc9] rounded-xl bg-white focus:outline-none focus:border-zinc-900 text-xs"
            required
            placeholder="Min 12 characters"
          />
          <button
            type="button"
            onClick={() => setShowNew(!showNew)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 cursor-pointer"
          >
            {showNew ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
        </div>

        {/* Strength Meter */}
        {newPassword.length > 0 && (
          <div className="mt-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-semibold text-zinc-500">Password Strength:</span>
              <span className={`font-bold ${getStrengthTextColor()}`}>{strengthLabel}</span>
            </div>
            
            {/* 5 segment progress bar */}
            <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden flex gap-0.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <div 
                  key={i} 
                  className={`h-full flex-1 transition-colors duration-300 ${
                    i <= score ? getStrengthColor() : "bg-zinc-150"
                  }`} 
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 3. Confirm Password */}
      <div className="flex flex-col gap-1 relative font-sans">
        <label className="text-xs font-semibold text-zinc-700">Confirm Password</label>
        <div className="relative">
          <input
            type={showConfirm ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="h-9 w-full pl-3 pr-10 border border-[#ebdcc9] rounded-xl bg-white focus:outline-none focus:border-zinc-900 text-xs"
            required
            placeholder="Match new password"
          />
          <button
            type="button"
            onClick={() => setShowConfirm(!showConfirm)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 cursor-pointer"
          >
            {showConfirm ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
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

      {/* Checklist Grid */}
      <div className="mt-3 bg-zinc-50/50 border border-[#ebdcc9]/30 rounded-xl p-3 space-y-2 font-sans">
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Security Requirements Checklist</span>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1.5">
          <div className="flex items-center gap-1.5 text-[10.5px]">
            {checks.length ? <CheckCircle2 className="size-3.5 text-green-600 shrink-0" /> : <XCircle className="size-3.5 text-zinc-300 shrink-0" />}
            <span className={checks.length ? "text-zinc-800" : "text-zinc-400"}>12 to 64 Characters</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10.5px]">
            {checks.uppercase ? <CheckCircle2 className="size-3.5 text-green-600 shrink-0" /> : <XCircle className="size-3.5 text-zinc-300 shrink-0" />}
            <span className={checks.uppercase ? "text-zinc-800" : "text-zinc-400"}>Uppercase Letter</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10.5px]">
            {checks.lowercase ? <CheckCircle2 className="size-3.5 text-green-600 shrink-0" /> : <XCircle className="size-3.5 text-zinc-300 shrink-0" />}
            <span className={checks.lowercase ? "text-zinc-800" : "text-zinc-400"}>Lowercase Letter</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10.5px]">
            {checks.number ? <CheckCircle2 className="size-3.5 text-green-600 shrink-0" /> : <XCircle className="size-3.5 text-zinc-300 shrink-0" />}
            <span className={checks.number ? "text-zinc-800" : "text-zinc-400"}>Numeric Digit</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10.5px]">
            {checks.specialChar ? <CheckCircle2 className="size-3.5 text-green-600 shrink-0" /> : <XCircle className="size-3.5 text-zinc-300 shrink-0" />}
            <span className={checks.specialChar ? "text-zinc-800" : "text-zinc-400"}>Special Character</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10.5px]">
            {checks.noSpaces ? <CheckCircle2 className="size-3.5 text-green-600 shrink-0" /> : <XCircle className="size-3.5 text-zinc-300 shrink-0" />}
            <span className={checks.noSpaces ? "text-zinc-800" : "text-zinc-400"}>No Spaces</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10.5px]">
            {checks.noPersonalInfo ? <CheckCircle2 className="size-3.5 text-green-600 shrink-0" /> : <XCircle className="size-3.5 text-zinc-300 shrink-0" />}
            <span className={checks.noPersonalInfo ? "text-zinc-800" : "text-zinc-400"}>No Personal Information</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10.5px]">
            {checks.noCommon ? <CheckCircle2 className="size-3.5 text-green-600 shrink-0" /> : <XCircle className="size-3.5 text-zinc-300 shrink-0" />}
            <span className={checks.noCommon ? "text-zinc-800" : "text-zinc-400"}>No Common Passwords</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10.5px]">
            {checks.noRepeated ? <CheckCircle2 className="size-3.5 text-green-600 shrink-0" /> : <XCircle className="size-3.5 text-zinc-300 shrink-0" />}
            <span className={checks.noRepeated ? "text-zinc-800" : "text-zinc-400"}>No Repeated sequences</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10.5px]">
            {checks.noSequential ? <CheckCircle2 className="size-3.5 text-green-600 shrink-0" /> : <XCircle className="size-3.5 text-zinc-300 shrink-0" />}
            <span className={checks.noSequential ? "text-zinc-800" : "text-zinc-400"}>No Sequential sequences</span>
          </div>
        </div>
      </div>

      {/* Suggestion alert */}
      {suggestions.length > 0 && newPassword.length > 0 && (
        <div className="p-2.5 bg-amber-50/50 border border-amber-200 text-amber-800 rounded-xl text-[10px] space-y-0.5 flex items-start gap-1.5 font-medium leading-normal font-sans">
          <AlertCircle className="size-3.5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block mb-0.5">Suggestions to strengthen password:</span>
            <ul className="list-disc pl-3 space-y-0.5">
              {suggestions.map((sug, idx) => (
                <li key={idx}>{sug}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isSubmitting || !Object.values(checks).every(v => v === true) || newPassword !== confirmPassword}
        className="w-full h-10 mt-3 rounded-xl bg-zinc-950 text-white font-bold hover:bg-zinc-850 disabled:bg-zinc-100 disabled:text-zinc-300 disabled:cursor-not-allowed active:scale-[0.985] transition-all cursor-pointer flex items-center justify-center gap-1.5 text-xs shadow-sm font-sans"
      >
        {isSubmitting ? (
          <>
            <span className="size-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Updating Account Password...
          </>
        ) : (
          <>
            <KeyRound className="size-4" />
            Verify & Update Account Password
          </>
        )}
      </button>
    </form>
  );
};
