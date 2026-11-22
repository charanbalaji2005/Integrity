import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "../../utils/api-client";

/**
 * Second step of sign-in for accounts with two-step verification on.
 * The session token already exists but the server treats it as signed out
 * until the emailed 6-digit code is verified here.
 */
export function TwoFactorChallenge({
  maskedEmail: initialMasked,
  codeAlreadySent,
  onVerified,
  onCancel,
}: {
  maskedEmail?: string | null;
  /** True right after password sign-in (the server already emailed a code). */
  codeAlreadySent?: boolean;
  onVerified: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [maskedEmail, setMaskedEmail] = useState(initialMasked ?? "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(codeAlreadySent ? 45 : 0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const send = useCallback(async () => {
    setSending(true);
    setError(null);
    try {
      const res = await apiFetch("/api/authentication/2fa/send", { method: "POST", body: "{}" });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        toast.error(data.message || "Your sign-in expired. Please sign in again.");
        onCancel();
        return;
      }
      if (!res.ok) throw new Error(data.message || "Could not send the code.");
      setMaskedEmail(data.data?.maskedEmail ?? maskedEmail);
      setCooldown(data.data?.resendInSeconds ?? 45);
      toast.success(data.message || "Code sent");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the code.");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [maskedEmail, onCancel]);

  // Arriving from Google sign-in or a page reload: find out where we are and send a code if none is live.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    inputRef.current?.focus();
    if (codeAlreadySent) return;
    (async () => {
      try {
        const res = await apiFetch("/api/authentication/2fa/status", { method: "POST", body: "{}" });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          onCancel();
          return;
        }
        if (res.ok) {
          setMaskedEmail(data.data?.maskedEmail ?? "");
          if (!data.data?.codeSent) await send();
        }
      } catch {
        /* network: user can press Resend */
      }
    })();
  }, [codeAlreadySent, onCancel, send]);

  const verify = async (value = code) => {
    if (!/^\d{6}$/.test(value)) {
      setError("Enter the 6-digit code.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/authentication/2fa/verify", { method: "POST", body: JSON.stringify({ code: value }) });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        toast.error(data.message || "Please sign in again.");
        onCancel();
        return;
      }
      if (!res.ok) {
        setError(data.message || "Incorrect code.");
        setCode("");
        inputRef.current?.focus();
        return;
      }
      await onVerified();
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="tfa-title">
      <div className="w-full max-w-sm rounded-3xl border border-[#e7e7e7] bg-white p-6 sm:p-7 shadow-2xl">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-zinc-100">
          <ShieldCheck className="size-6 text-zinc-900" aria-hidden="true" />
        </div>
        <h2 id="tfa-title" className="text-center text-[19px] font-extrabold tracking-tight text-[#1a1917]">Two-step verification</h2>
        <p className="mt-1.5 text-center text-[13px] text-[#676767]">
          <Mail className="mr-1 inline size-3.5 -mt-0.5" aria-hidden="true" />
          Enter the 6-digit code we emailed to <span className="font-semibold text-[#1a1917]">{maskedEmail || "your inbox"}</span>.
        </p>

        <form
          className="mt-5 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
        >
          <input
            ref={inputRef}
            value={code}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 6);
              setCode(v);
              setError(null);
              if (v.length === 6) void verify(v);
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label="Verification code"
            aria-invalid={!!error}
            placeholder="••••••"
            disabled={busy}
            className="h-14 w-full rounded-2xl border border-[#dedede] bg-[#fafafa] text-center font-mono text-[26px] font-bold tracking-[0.5em] outline-none focus:border-[#1a1917] disabled:opacity-60"
          />
          {error && <p role="alert" className="text-center text-[12.5px] font-medium text-rose-600">{error}</p>}
          <button
            type="submit"
            disabled={busy || code.length !== 6}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-zinc-950 text-[14px] font-bold text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />} Verify and sign in
          </button>
        </form>

        <div className="mt-4 flex items-center justify-between text-[12.5px]">
          <button type="button" onClick={onCancel} className="font-semibold text-[#676767] hover:text-[#1a1917]">
            Use another account
          </button>
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending || cooldown > 0}
            className="font-semibold text-indigo-600 hover:text-indigo-800 disabled:text-[#b2b2b2]"
          >
            {sending ? "Sending…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
          </button>
        </div>
        <p className="mt-4 text-center text-[11px] leading-relaxed text-[#8a8a8a]">The code expires in 10 minutes. After 5 wrong attempts you'll need to sign in again.</p>
      </div>
    </div>
  );
}
