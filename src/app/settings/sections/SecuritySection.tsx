import React, { useEffect, useState } from "react";
import { Laptop, Loader2, LogOut } from "lucide-react";
import { useProfile } from "../../context/ProfileContext";
import { Button, Card, SectionHeader, StatusPill, ToggleRow } from "../ui";

function describeAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /edg\//i.test(ua)
    ? "Edge"
    : /chrome|crios/i.test(ua)
      ? "Chrome"
      : /firefox|fxios/i.test(ua)
        ? "Firefox"
        : /safari/i.test(ua)
          ? "Safari"
          : "Browser";
  const os = /windows/i.test(ua)
    ? "Windows"
    : /android/i.test(ua)
      ? "Android"
      : /iphone|ipad|ipod/i.test(ua)
        ? "iOS"
        : /mac os/i.test(ua)
          ? "macOS"
          : /linux/i.test(ua)
            ? "Linux"
            : "Unknown OS";
  return `${browser} on ${os}`;
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export function SecuritySection() {
  const { profile, toggle2FA, activeSessions, activityHistory, fetchActiveSessions, fetchActivityHistory, revokeSession } =
    useProfile();
  const [loading, setLoading] = useState(true);
  const [busy2fa, setBusy2fa] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([fetchActiveSessions(), fetchActivityHistory()]).finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [fetchActiveSessions, fetchActivityHistory]);

  const currentToken = (() => {
    try {
      return localStorage.getItem("auth_token");
    } catch {
      return null;
    }
  })();

  const onToggle2fa = async (value: boolean) => {
    setBusy2fa(true);
    await toggle2FA(value);
    setBusy2fa(false);
  };

  const onRevoke = async (id: string) => {
    setRevoking(id);
    await revokeSession(id);
    setRevoking(null);
  };

  const history = showAllHistory ? activityHistory : activityHistory.slice(0, 8);

  return (
    <div>
      <SectionHeader title="Security" description="Two-factor authentication, signed-in devices and recent account activity." />

      <Card title="Two-factor authentication">
        <ToggleRow
          label="Require a verification code at sign-in"
          description="Adds a second step after your password. Recommended for faculty and administrators."
          checked={!!profile?.twoFactorEnabled}
          onChange={onToggle2fa}
          disabled={!profile || busy2fa}
        />
      </Card>

      <Card
        title="Active sessions"
        description="Devices currently signed in to your account."
        action={
          <Button variant="secondary" onClick={() => fetchActiveSessions()}>
            Refresh
          </Button>
        }
      >
        {loading ? (
          <p className="flex items-center gap-2 text-[12.5px] text-[#8a8a8a]">
            <Loader2 className="size-4 animate-spin" /> Loading sessions...
          </p>
        ) : activeSessions.length === 0 ? (
          <p className="text-[12.5px] text-[#8a8a8a]">No other active sessions.</p>
        ) : (
          <ul className="divide-y divide-[#efefef]">
            {activeSessions.map((s) => {
              const isCurrent = !!currentToken && s.token === currentToken;
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#f6f6f6]">
                      <Laptop className="size-4 text-[#555]" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-[13px] font-semibold text-[#1a1917]">
                        <span className="truncate">{describeAgent(s.userAgent)}</span>
                        {isCurrent && <StatusPill tone="ok">This device</StatusPill>}
                      </p>
                      <p className="truncate text-[11.5px] text-[#8a8a8a]">
                        {s.ipAddress || "Unknown IP"} · signed in {formatDate(s.createdAt)}
                      </p>
                    </div>
                  </div>
                  {!isCurrent && (
                    <Button variant="danger" onClick={() => onRevoke(s.id)} disabled={revoking === s.id}>
                      {revoking === s.id ? <Loader2 className="size-3.5 animate-spin" /> : <LogOut className="size-3.5" />}
                      Sign out
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Login history" description="Recent sign-ins and security events on your account.">
        {loading ? (
          <p className="flex items-center gap-2 text-[12.5px] text-[#8a8a8a]">
            <Loader2 className="size-4 animate-spin" /> Loading history...
          </p>
        ) : activityHistory.length === 0 ? (
          <p className="text-[12.5px] text-[#8a8a8a]">No activity recorded yet.</p>
        ) : (
          <>
            <ul className="divide-y divide-[#efefef]">
              {history.map((log) => (
                <li key={log.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-semibold text-[#1a1917]">{log.action}</p>
                    <p className="truncate text-[11px] text-[#8a8a8a]">
                      {describeAgent(log.userAgent)} · {log.ipAddress || "Unknown IP"}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-[#8a8a8a]">{formatDate(log.createdAt)}</span>
                </li>
              ))}
            </ul>
            {activityHistory.length > 8 && (
              <div className="mt-3">
                <Button variant="secondary" onClick={() => setShowAllHistory((v) => !v)}>
                  {showAllHistory ? "Show less" : `Show all ${activityHistory.length}`}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
