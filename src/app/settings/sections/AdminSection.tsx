import React, { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Loader2, RefreshCw } from "lucide-react";
import { Button, Card, SectionHeader, StatusPill } from "../ui";

interface AdminUser {
  id: string;
  role: string | null;
  status: string | null;
  twoFactorEnabled?: boolean;
}

interface AuditLog {
  id: string;
  action: string;
  ipAddress: string | null;
  createdAt: string;
}

/** Ask the admin panel (if mounted) to switch to one of its tabs, then close Settings. */
function openAdminTab(tab: string, close: () => void) {
  window.dispatchEvent(new CustomEvent("admin-open-tab", { detail: { tab } }));
  close();
}

export function AdminSection({ userId, userRole, onClose }: { userId: string; userRole: string; onClose: () => void }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [logs, setLogs] = useState<AuditLog[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    const headers = { "x-user-id": userId, "x-user-role": userRole || "admin" };
    setLoading(true);
    setError(false);
    try {
      const [u, a] = await Promise.all([
        fetch("/api/admin/users", { headers }),
        fetch("/api/admin/audit-logs", { headers }),
      ]);
      if (!u.ok || !a.ok) throw new Error();
      setUsers((await u.json()).data ?? []);
      setLogs(((await a.json()).data?.adminLogs ?? []).slice(0, 15));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [userId, userRole]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = (users ?? []).reduce(
    (acc, u) => {
      const role = u.role === "user" || !u.role ? "student" : u.role;
      acc[role] = (acc[role] ?? 0) + 1;
      if (u.status === "suspended" || u.status === "locked") acc.restricted += 1;
      if (u.twoFactorEnabled) acc.twoFactor += 1;
      return acc;
    },
    { student: 0, faculty: 0, support: 0, admin: 0, restricted: 0, twoFactor: 0 } as Record<string, number>,
  );
  const total = users?.length ?? 0;

  return (
    <div>
      <SectionHeader title="Users & audit" description="Overview of accounts, roles and recent administrative activity." />

      {error ? (
        <Card>
          <p className="text-[13px] text-[#555]">Couldn't load admin data.</p>
          <div className="mt-3">
            <Button variant="secondary" onClick={load}>
              <RefreshCw className="size-3.5" /> Try again
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <Card
            title="Users and roles"
            action={
              <Button variant="secondary" onClick={() => openAdminTab("users", onClose)}>
                Manage users <ArrowUpRight className="size-3.5" />
              </Button>
            }
          >
            {loading && !users ? (
              <p className="flex items-center gap-2 text-[12.5px] text-[#8a8a8a]">
                <Loader2 className="size-4 animate-spin" /> Loading users...
              </p>
            ) : (
              <>
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { k: "Students", v: counts.student },
                    { k: "Faculty", v: counts.faculty },
                    { k: "Support", v: counts.support },
                    { k: "Admins", v: counts.admin },
                  ].map((item) => (
                    <div key={item.k} className="rounded-xl border border-[#efefef] bg-[#fafafa] p-3">
                      <dt className="text-[11px] font-bold uppercase tracking-wider text-[#8a8a8a]">{item.k}</dt>
                      <dd className="mt-1 text-[20px] font-extrabold tabular-nums text-[#1a1917]">{item.v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  <StatusPill tone="neutral">{total} accounts</StatusPill>
                  <StatusPill tone={counts.restricted ? "warn" : "ok"}>{counts.restricted} suspended or locked</StatusPill>
                  <StatusPill tone="neutral">
                    {total ? Math.round((counts.twoFactor / total) * 100) : 0}% using 2FA
                  </StatusPill>
                </div>
              </>
            )}
          </Card>

          <Card title="Permissions" description="What each role can do on the platform.">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[460px] text-left text-[12px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-[#8a8a8a]">
                    <th className="py-2 pr-3 font-bold">Capability</th>
                    <th className="py-2 px-2 font-bold">Student</th>
                    <th className="py-2 px-2 font-bold">Faculty</th>
                    <th className="py-2 px-2 font-bold">Support</th>
                    <th className="py-2 px-2 font-bold">Admin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#efefef]">
                  {[
                    ["Take proctored exams", 1, 0, 0, 0],
                    ["Create and monitor exams", 0, 1, 0, 1],
                    ["Review evidence & decide", 0, 1, 0, 1],
                    ["Answer support tickets", 0, 0, 1, 1],
                    ["Manage users & roles", 0, 0, 0, 1],
                    ["Change platform settings", 0, 0, 0, 1],
                  ].map(([label, ...flags]) => (
                    <tr key={label as string}>
                      <td className="py-2 pr-3 font-semibold text-[#1a1917]">{label}</td>
                      {flags.map((f, i) => (
                        <td key={i} className="py-2 px-2">
                          {f ? <span className="font-bold text-emerald-700">Yes</span> : <span className="text-[#b2b2b2]">-</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11.5px] text-[#8a8a8a]">Change a user's role from Users Directory in the admin panel.</p>
          </Card>

          <Card
            title="Recent audit log"
            action={
              <Button variant="secondary" onClick={() => openAdminTab("audit", onClose)}>
                Full audit log <ArrowUpRight className="size-3.5" />
              </Button>
            }
          >
            {loading && !logs ? (
              <p className="flex items-center gap-2 text-[12.5px] text-[#8a8a8a]">
                <Loader2 className="size-4 animate-spin" /> Loading audit log...
              </p>
            ) : !logs || logs.length === 0 ? (
              <p className="text-[12.5px] text-[#8a8a8a]">No audit entries yet.</p>
            ) : (
              <ul className="divide-y divide-[#efefef]">
                {logs.map((log) => (
                  <li key={log.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate text-[12.5px] text-[#1a1917]">{log.action}</span>
                    <span className="shrink-0 font-mono text-[11px] text-[#8a8a8a]">
                      {new Date(log.createdAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
