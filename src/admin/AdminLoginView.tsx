import React, { useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { Button } from "../app/components/ui/button";
import { Input } from "../app/components/ui/input";
import { Label } from "../app/components/ui/label";
import { toast } from "sonner";
import { apiFetch } from "../app/utils/api-client";
import { SecurityContext } from "../app/pages/auth/SecurityContext";
import imgAssessmentIntegrityLogo from "../imports/LoginPortalIntegrityOs/assessment_integrity_logo.png";

interface AdminLoginViewProps {
  handleLoginSuccess: (user: any, session: any) => void;
  setIsAdminPortal: (val: boolean) => void;
  backendStatus: "checking" | "online" | "offline";
  setView: (view: any) => void;
}

export function AdminLoginView({
  handleLoginSuccess,
  setIsAdminPortal,
  backendStatus,
  setView,
}: AdminLoginViewProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      toast.error("Please enter email and password");
      return;
    }

    const trimmedEmail = email.trim();
    setIsSubmitting(true);
    try {
      const response = await apiFetch("/api/authentication/login", {
        method: "POST",
        body: JSON.stringify({ email: trimmedEmail, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Invalid email or password");
      }

      if (data.data.user.role !== "admin") {
        throw new Error("Access Denied: Administrator role required to access the Admin Console.");
      }

      if (data.data.session?.token) {
        localStorage.setItem("auth_token", data.data.session.token);
      }

      toast.success("Successfully authenticated to Admin Portal!");
      handleLoginSuccess(data.data.user, data.data.session);
    } catch (err: any) {
      toast.error(err.message || "Connection failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      key="admin-login"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-8 w-full text-left"
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
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xl font-bold leading-[28px] tracking-[-0.4px] text-[#1a1917]">
            Admin Portal Login
          </h3>
          <div>
            {backendStatus === "online" ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                Online
              </span>
            ) : backendStatus === "offline" ? (
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
        <p className="text-sm font-normal leading-[21px] text-[#6b6861]">
          Manage the environment settings and system audits.
        </p>
      </div>

      {/* Login Form */}
      <div className="flex flex-col gap-8">
        {/* Email */}
        <div className="flex flex-col gap-2">
          <Label className="text-xs font-semibold leading-[16.8px] tracking-[0.24px] text-[#5e5a52]">
            Email Address
          </Label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@integrityos.com"
            className="h-[50px] w-full rounded-xl border border-[#e2dfd5] bg-[#fafaf8] px-[17px] py-[15px] text-sm text-[#1c1b1b] placeholder:text-[#a09c94] caret-[#c5af8a] outline-none transition-all duration-[250ms] ease-out cursor-text placeholder:transition-opacity placeholder:duration-[250ms] focus:placeholder:opacity-50 hover:border-[#d5cbb8] hover:shadow-[0_0_12px_rgba(197,175,138,0.15)] focus:border-[#c5af8a] focus:ring-2 focus:ring-[#c5af8a]/20 focus:shadow-[0_0_20px_rgba(197,175,138,0.2)]"
          />
        </div>

        {/* Password */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold leading-[16.8px] tracking-[0.24px] text-[#5e5a52]">
              Password
            </Label>
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
              className="absolute right-[14px] top-1/2 -translate-y-1/2 text-[#8e8a80] hover:text-[#1a1917] transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:text-[#1a1917]"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="size-[18px]" />
              ) : (
                <Eye className="size-[18px]" />
              )}
            </button>
          </div>
        </div>

        {/* Login Button */}
        <motion.button
          type="button"
          onClick={handleLogin}
          disabled={isSubmitting}
          whileTap={{ scale: 0.98 }}
          className="btn-liquid-glass-black h-auto w-full flex items-center justify-center gap-2 rounded-xl py-4 text-base font-bold leading-6 transition-all duration-300 cursor-pointer outline-none disabled:opacity-50"
        >
          {isSubmitting ? "Logging in..." : "Login to Admin Portal"}
          <motion.div
            variants={{
              idle: { x: 0 },
              hover: { x: 6 },
            }}
            transition={{
              duration: 0.25,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="flex items-center"
          >
            <ArrowRight className="size-[13.333px]" />
          </motion.div>
        </motion.button>

        {/* Back Link */}
        <div className="text-center text-sm text-[#6b6861] mt-2">
          <button
            type="button"
            onClick={() => setIsAdminPortal(false)}
            className="font-bold text-[#6b6861] hover:text-[#1a1917] hover:underline cursor-pointer bg-transparent border-none outline-none text-xs"
          >
            Access User Portal
          </button>
        </div>

        <div className="flex items-center justify-center gap-2 mt-4 text-xs text-[#9b9690] border-t border-[#ebdcc9]/40 pt-4">
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
      </div>

      <SecurityContext />
    </motion.div>
  );
}
