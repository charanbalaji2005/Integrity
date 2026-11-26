import React, { useEffect, useRef, useState } from "react";
import { Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "../../utils/api-client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";

/**
 * Turning two-step verification on or off. The server emails a 6-digit code
 * first, so a mistyped or unreachable inbox can never lock the user out.
 */
export function TwoFactorToggleDialog({
  open,
  enable,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  /** true = turning on, false = turning off */
  enable: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the updated profile after the server confirms the change. */
  onChanged: (profile: unknown) => void;
}) {
  const [step, setStep] = useState<"intro" | "code">("intro");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setStep("intro");
    setCode("");
    setError(null);
  }, [open, enable]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const requestCode = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/profile/2fa/request", { method: "POST", body: JSON.stringify({ enabled: enable }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Could not send the code.");
      setMaskedEmail(data.data?.maskedEmail ?? "");
      setCooldown(data.data?.resendInSeconds ?? 45);
      setStep("code");
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the code.");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (value = code) => {
    if (!/^\d{6}$/.test(value)) {
      setError("Enter the 6-digit code.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/profile/2fa", { method: "POST", body: JSON.stringify({ enabled: enable, code: value }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Incorrect code.");
        setCode("");
        inputRef.current?.focus();
        return;
      }
      onChanged(data.data);
      toast.success(enable ? "Two-step verification is on" : "Two-step verification is off");
      onOpenChange(false);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const Icon = enable ? ShieldCheck : ShieldOff;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="size-5" aria-hidden="true" />
            {enable ? "Turn on two-step verification" : "Turn off two-step verification"}
          </DialogTitle>
          <DialogDescription>
            {step === "intro"
              ? enable
                ? "Each time you sign in — with a password or Google — we'll email you a 6-digit code to enter. First, confirm you can receive codes."
                : "You'll only need your password to sign in. Confirm with a code we email you."
              : `Enter the 6-digit code we sent to ${maskedEmail || "your email"}.`}
          </DialogDescription>
        </DialogHeader>

        {step === "code" && (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void confirm();
            }}
          >
            <input
              ref={inputRef}
              value={code}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                setCode(v);
                setError(null);
                if (v.length === 6) void confirm(v);
              }}
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label="Verification code"
              aria-invalid={!!error}
              placeholder="••••••"
              disabled={busy}
              className="h-12 w-full rounded-xl border border-[#dedede] bg-[#fafafa] text-center font-mono text-[22px] font-bold tracking-[0.45em] outline-none focus:border-[#1a1917] disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => void requestCode()}
              disabled={busy || cooldown > 0}
              className="text-[12px] font-semibold text-indigo-600 hover:text-indigo-800 disabled:text-[#b2b2b2]"
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </button>
          </form>
        )}

        {error && (
          <p role="alert" className="text-[12.5px] font-medium text-rose-600">
            {error}
          </p>
        )}

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="h-10 rounded-xl border border-[#dedede] px-4 text-[13px] font-semibold hover:bg-zinc-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void (step === "intro" ? requestCode() : confirm())}
            disabled={busy || (step === "code" && code.length !== 6)}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-zinc-950 px-4 text-[13px] font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {step === "intro" ? "Email me a code" : enable ? "Turn on" : "Turn off"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
