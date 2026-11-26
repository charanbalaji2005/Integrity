import React, { useEffect, useState } from "react";
import { Check, Copy, Sparkles } from "lucide-react";
import { apiFetch } from "../../../utils/api-client";

export type DemoPortal = "student" | "faculty" | "support";

interface DemoInfo {
  enabled: boolean;
  password?: string;
  accounts?: Record<DemoPortal, string>;
}

let cache: Promise<DemoInfo> | null = null;
function loadDemo(): Promise<DemoInfo> {
  cache ??= apiFetch("/api/authentication/demo-accounts")
    .then((r) => (r.ok ? r.json() : null))
    .then((b) => (b?.data as DemoInfo) ?? { enabled: false })
    .catch(() => {
      cache = null; // backend asleep (free hosting) — try again next render
      return { enabled: false };
    });
  return cache;
}

const PORTAL_LABEL: Record<DemoPortal, string> = { student: "Student", faculty: "Faculty", support: "Support" };

/**
 * Public demo credentials for this portal (never shown on the admin portal).
 * Credentials come from the backend so they always match what it created.
 */
export function DemoCredentials({ portal, onUse }: { portal: DemoPortal; onUse: (email: string, password: string) => void }) {
  const [info, setInfo] = useState<DemoInfo | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void loadDemo().then((d) => alive && setInfo(d));
    return () => {
      alive = false;
    };
  }, []);

  if (!info?.enabled || !info.accounts || !info.password) return null;
  const email = info.accounts[portal];
  const password = info.password;

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked — the values are visible anyway */
    }
  };

  const Row = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8a8a8a]">{label}</span>
      <button
        type="button"
        onClick={() => void copy(label, value)}
        className="inline-flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-0.5 font-mono text-[12.5px] text-[#1a1917] hover:bg-white"
        aria-label={`Copy demo ${label.toLowerCase()} ${value}`}
      >
        <span className="truncate">{value}</span>
        {copied === label ? <Check className="size-3.5 shrink-0 text-emerald-600" aria-hidden="true" /> : <Copy className="size-3.5 shrink-0 text-[#8a8a8a]" aria-hidden="true" />}
      </button>
    </div>
  );

  return (
    <section aria-label={`${PORTAL_LABEL[portal]} demo account`} className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-3.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-indigo-900">
          <Sparkles className="size-3.5" aria-hidden="true" /> Try the {PORTAL_LABEL[portal]} portal
        </span>
        <button
          type="button"
          onClick={() => onUse(email, password)}
          className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-indigo-700"
        >
          Use demo account
        </button>
      </div>
      <div className="space-y-1">
        <Row label="Email" value={email} />
        <Row label="Password" value={password} />
      </div>
      <p className="mt-2 text-[11px] leading-snug text-indigo-900/70">
        Shared demo data only. The same password works on the Student, Faculty and Support portals (each has its own demo email).
      </p>
    </section>
  );
}
