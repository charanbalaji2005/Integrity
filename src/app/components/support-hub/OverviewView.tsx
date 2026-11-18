import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Clock, Inbox, Loader2, ShieldAlert, UserCheck } from "lucide-react";
import { errorMessage, supportApi } from "./api";
import type { AnalyticsData, HubSection, QueueResponse, StaffProfile, TicketSummary } from "./types";
import {
  EmptyState,
  ErrorBlock,
  KpiTile,
  OwnershipBadge,
  PriorityBadge,
  SectionHeader,
  Spinner,
  StatusChip,
  WorkloadBar,
  btnPrimary,
  btnSecondary,
  cardCls,
  cx,
  fmt,
  formatDuration,
  formatMinutes,
  useNow,
} from "./ui";

function todayISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function OverviewView({
  me,
  refreshKey,
  onOpenTicket,
  onNavigate,
}: {
  me: StaffProfile | null;
  refreshKey: number;
  onOpenTicket: (section: HubSection, ticketId: string) => void;
  onNavigate: (s: HubSection) => void;
}) {
  const now = useNow(30000);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [pending, setPending] = useState<TicketSummary[]>([]);
  const [unassigned, setUnassigned] = useState<TicketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState<string | null>(null);

  const load = useCallback(async () => {
    const today = todayISO();
    const [a, mine, un] = await Promise.allSettled([
      supportApi<AnalyticsData>(`/analytics?from=${today}&to=${today}`),
      supportApi<QueueResponse>(`/queue?view=mine&sort=oldest`),
      supportApi<QueueResponse>(`/queue?view=unassigned&sort=priority`),
    ]);
    if (a.status === "fulfilled") {
      setAnalytics(a.value);
      setAnalyticsError(null);
    } else setAnalyticsError(errorMessage(a.reason));
    if (mine.status === "fulfilled") setPending(mine.value.tickets.filter((t) => t.status === "pending_acceptance"));
    if (un.status === "fulfilled") setUnassigned(un.value.tickets.slice(0, 5));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const accept = async (t: TicketSummary) => {
    setAccepting(t.id);
    try {
      await supportApi(`/tickets/${t.id}/accept`, { method: "POST", body: {} });
      toast.success(`Accepted ${t.referenceNumber}`);
      onOpenTicket("mine", t.id);
    } catch (err) {
      toast.error(errorMessage(err, "Could not accept ticket"));
      void load();
    } finally {
      setAccepting(null);
    }
  };

  const totals = analytics?.totals;
  const sla = analytics?.slaCompliancePercent ?? null;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 overflow-y-auto h-full">
      <SectionHeader
        title="Overview"
        description="Today's support activity, your workload and assignments waiting for you."
        actions={
          <button type="button" className={btnPrimary} onClick={() => onNavigate("queue")}>
            Open live queue
          </button>
        }
      />

      {analyticsError && <ErrorBlock message={analyticsError} onRetry={load} />}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
        <KpiTile label="Tickets today" value={totals ? totals.today : "—"} hint="Created today" />
        <KpiTile label="Pending" value={totals ? totals.pending : "—"} hint="Open, not resolved" tone={totals && totals.pending > 0 ? "warn" : "default"} />
        <KpiTile label="Unassigned" value={totals ? totals.unassigned : "—"} hint="No owner yet" tone={totals && totals.unassigned > 0 ? "danger" : "default"} />
        <KpiTile label="AI-handled" value={totals ? totals.aiHandled : "—"} hint="Owned by AI assistant" />
        <KpiTile label="Avg first response" value={formatMinutes(analytics?.avgFirstResponseMinutes)} hint="Human first reply" />
        <KpiTile
          label="SLA compliance"
          value={fmt(sla, sla === null ? "" : "%")}
          hint="Within target"
          tone={sla === null ? "default" : sla >= 90 ? "good" : sla >= 75 ? "warn" : "danger"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <section className={cx(cardCls, "p-5")} aria-labelledby="workload-h">
          <h2 id="workload-h" className="text-sm font-bold text-[#1a1917]">
            My workload
          </h2>
          {me ? (
            <div className="mt-4 space-y-3">
              <div className="flex items-end justify-between">
                <span className="text-3xl font-extrabold tabular-nums text-[#1a1917]">
                  {me.activeTickets}
                  <span className="text-base text-[#a2a2a2] font-bold"> / {me.maxActiveTickets}</span>
                </span>
                <span className="text-xs text-[#676767]">active tickets</span>
              </div>
              <WorkloadBar value={me.activeTickets} max={me.maxActiveTickets} />
              <dl className="grid grid-cols-2 gap-3 pt-2 text-xs">
                <div>
                  <dt className="text-[#8a8a8a] font-semibold">Pending acceptance</dt>
                  <dd className="font-bold text-[#1a1917] mt-0.5">{me.pendingTickets}</dd>
                </div>
                <div>
                  <dt className="text-[#8a8a8a] font-semibold">Resolved</dt>
                  <dd className="font-bold text-[#1a1917] mt-0.5">{me.resolvedCount}</dd>
                </div>
                <div>
                  <dt className="text-[#8a8a8a] font-semibold">Avg resolution</dt>
                  <dd className="font-bold text-[#1a1917] mt-0.5">{formatMinutes(me.avgResolutionMinutes)}</dd>
                </div>
                <div>
                  <dt className="text-[#8a8a8a] font-semibold">Avg first response</dt>
                  <dd className="font-bold text-[#1a1917] mt-0.5">{formatMinutes(me.avgFirstResponseMinutes)}</dd>
                </div>
              </dl>
              {!me.assignmentsEnabled && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                  Automatic assignment is turned off for you. Ask a supervisor to enable it.
                </p>
              )}
            </div>
          ) : loading ? (
            <Spinner />
          ) : (
            <p className="text-xs text-[#8a8a8a] mt-3">Your support profile is not available.</p>
          )}
        </section>

        <section className={cx(cardCls, "p-5 lg:col-span-2")} aria-labelledby="pending-h">
          <div className="flex items-center justify-between">
            <h2 id="pending-h" className="text-sm font-bold text-[#1a1917] flex items-center gap-2">
              <UserCheck className="size-4" /> Waiting for my acceptance
            </h2>
            {pending.length > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                {pending.length}
              </span>
            )}
          </div>
          {loading ? (
            <Spinner />
          ) : pending.length === 0 ? (
            <EmptyState icon={Clock} title="Nothing waiting" description="Tickets offered to you will appear here with an Accept button." />
          ) : (
            <ul className="mt-3 space-y-2">
              {pending.map((t) => (
                <li key={t.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl border border-[#dedede] bg-[#fafafa]">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[11px] font-bold text-[#676767]">{t.referenceNumber}</span>
                      <PriorityBadge priority={t.priority} />
                      {t.blocksExam && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700">
                          <ShieldAlert className="size-3" /> Blocks exam
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-bold text-[#1a1917] truncate mt-0.5">{t.title}</p>
                    <p className="text-[11px] text-[#8a8a8a] truncate">
                      {t.studentName} · {t.categoryLabel}
                      {t.waitingSince && ` · waiting ${formatDuration(now - new Date(t.waitingSince).getTime())}`}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button type="button" className={btnSecondary} onClick={() => onOpenTicket("mine", t.id)}>
                      View
                    </button>
                    <button type="button" className={btnPrimary} disabled={accepting === t.id} onClick={() => accept(t)}>
                      {accepting === t.id && <Loader2 className="size-3.5 animate-spin" />}
                      Accept
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className={cx(cardCls, "p-5")} aria-labelledby="unassigned-h">
        <div className="flex items-center justify-between mb-3">
          <h2 id="unassigned-h" className="text-sm font-bold text-[#1a1917] flex items-center gap-2">
            <Inbox className="size-4" /> Unassigned — highest priority
          </h2>
          <button type="button" className={cx(btnSecondary, "min-h-9")} onClick={() => onNavigate("unassigned")}>
            View all
          </button>
        </div>
        {loading ? (
          <Spinner />
        ) : unassigned.length === 0 ? (
          <EmptyState icon={Inbox} title="No unassigned tickets" description="Every open ticket has an owner." />
        ) : (
          <ul className="divide-y divide-[#dedede]/60">
            {unassigned.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => onOpenTicket("unassigned", t.id)}
                  className="w-full min-h-11 text-left py-3 flex items-center gap-3 hover:bg-[#fafafa] rounded-lg px-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1917]"
                >
                  <PriorityBadge priority={t.priority} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-bold text-[#1a1917] truncate">{t.title}</span>
                    <span className="block text-[11px] text-[#8a8a8a] truncate">
                      {t.referenceNumber} · {t.studentName} · {t.categoryLabel}
                    </span>
                  </span>
                  <OwnershipBadge ownership={t.ownershipType} />
                  <span className="hidden sm:inline-flex">
                    <StatusChip status={t.status} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
