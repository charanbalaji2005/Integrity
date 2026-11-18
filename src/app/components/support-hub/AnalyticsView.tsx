import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BarChart3, Download, Loader2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { errorMessage, supportApi, supportDownload } from "./api";
import type { AnalyticsData } from "./types";
import { AVAILABILITY_LABEL, PRIORITY_LABEL } from "./types";
import { AvailabilityDot, EmptyState, ErrorBlock, KpiTile, SectionHeader, Spinner, btnSecondary, cardCls, cx, fmt, fmtRate, formatMinutes, inputCls } from "./ui";

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
}

const PRESETS = [
  { label: "Today", from: () => daysAgo(0) },
  { label: "7 days", from: () => daysAgo(6) },
  { label: "30 days", from: () => daysAgo(29) },
  { label: "90 days", from: () => daysAgo(89) },
];

const INK = "#1a1917";
const MUTED = "#a3a3a3";
const GRID = "#ececec";
const AXIS = { fontSize: 11, fill: "#676767" };

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#dedede] rounded-lg shadow-md px-3 py-2 text-[11px]">
      <p className="font-bold text-[#1a1917] mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-1.5 text-[#676767]">
          <span className="size-2 rounded-sm" style={{ background: p.color }} aria-hidden />
          {p.name}: <strong className="text-[#1a1917] tabular-nums">{p.value}</strong>
        </p>
      ))}
    </div>
  );
}

export function AnalyticsView() {
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(daysAgo(0));
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await supportApi<AnalyticsData>(`/analytics?from=${from}&to=${to}`));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    if (from && to && from <= to) void load();
  }, [load, from, to]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      await supportDownload(`/analytics/export?from=${from}&to=${to}`, `support-analytics-${from}_to_${to}.csv`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  const t = data?.totals;
  const priorityData = (data?.byPriority ?? []).map((p) => ({ name: `${p.priority} ${PRIORITY_LABEL[p.priority] ?? ""}`.trim(), count: p.count }));
  const categoryData = [...(data?.byCategory ?? [])].sort((a, b) => b.count - a.count).map((c) => ({ name: c.label, count: c.count }));
  const staffData = (data?.staffWorkload ?? []).map((s) => ({ name: s.name, Active: s.active, Pending: s.pending, Resolved: s.resolved }));

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5 overflow-y-auto h-full">
      <SectionHeader
        title="Analytics"
        description="Support performance for the selected period. “—” means there is no data yet."
        actions={
          <button type="button" className={btnSecondary} onClick={exportCsv} disabled={exporting || from > to}>
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Export CSV
          </button>
        }
      />

      <div className={cx(cardCls, "p-3 sm:p-4 flex flex-col md:flex-row md:items-end gap-3")} role="group" aria-label="Date range">
        <div className="flex gap-1.5 flex-wrap">
          {PRESETS.map((p) => {
            const active = from === p.from() && to === daysAgo(0);
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setFrom(p.from());
                  setTo(daysAgo(0));
                }}
                aria-pressed={active}
                className={cx(
                  "min-h-11 px-3 rounded-xl text-xs font-bold border cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1917]",
                  active ? "bg-[#1a1917] text-white border-[#1a1917]" : "bg-white text-[#676767] border-[#dedede] hover:bg-[#f6f6f6]"
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2 md:ml-auto">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-[#8a8a8a] uppercase tracking-wider">From</span>
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={cx(inputCls, "text-xs")} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-[#8a8a8a] uppercase tracking-wider">To</span>
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={cx(inputCls, "text-xs")} />
          </label>
        </div>
      </div>

      {error && <ErrorBlock message={error} onRetry={load} />}
      {loading && !data ? (
        <Spinner label="Loading analytics" />
      ) : !data ? null : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <KpiTile label="Total tickets" value={t?.total ?? "—"} hint={`${t?.resolved ?? 0} resolved · ${t?.escalated ?? 0} escalated`} />
            <KpiTile label="Pending" value={t?.pending ?? "—"} hint={`${t?.unassigned ?? 0} unassigned`} />
            <KpiTile label="AI / Human handled" value={t ? `${t.aiHandled} / ${t.humanHandled}` : "—"} />
            <KpiTile label="SLA compliance" value={fmt(data.slaCompliancePercent, data.slaCompliancePercent === null ? "" : "%")} />
            <KpiTile label="Avg first response" value={formatMinutes(data.avgFirstResponseMinutes)} />
            <KpiTile label="Avg resolution" value={formatMinutes(data.avgResolutionMinutes)} />
            <KpiTile label="AI resolution rate" value={fmtRate(data.aiResolutionRate)} />
            <KpiTile label="Reassignment rate" value={fmtRate(data.reassignmentRate)} />
            <KpiTile
              label="Satisfaction"
              value={data.satisfaction.average === null ? "—" : `${fmt(data.satisfaction.average)} / 5`}
              hint={`${data.satisfaction.count} rating${data.satisfaction.count === 1 ? "" : "s"}`}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
            <ChartCard title="Tickets by category" empty={categoryData.length === 0}>
              <ResponsiveContainer width="100%" height={Math.max(220, categoryData.length * 30 + 40)}>
                <BarChart data={categoryData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                  <CartesianGrid horizontal={false} stroke={GRID} />
                  <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={150} tick={AXIS} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f6f6f6" }} />
                  <Bar dataKey="count" name="Tickets" fill={INK} radius={[0, 4, 4, 0]} barSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Tickets by priority" empty={priorityData.length === 0}>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={priorityData} margin={{ left: -12, right: 8, top: 8, bottom: 4 }}>
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f6f6f6" }} />
                  <Bar dataKey="count" name="Tickets" fill={INK} radius={[4, 4, 0, 0]} barSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <ChartCard title="Staff workload comparison" empty={staffData.length === 0}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={staffData} margin={{ left: -12, right: 8, top: 8, bottom: 4 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} interval={0} />
                <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f6f6f6" }} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="square" />
                <Bar dataKey="Active" stackId="w" fill={INK} barSize={28} stroke="#fff" strokeWidth={1} />
                <Bar dataKey="Pending" stackId="w" fill={MUTED} radius={[4, 4, 0, 0]} barSize={28} stroke="#fff" strokeWidth={1} />
              </BarChart>
            </ResponsiveContainer>
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-xs">
                <caption className="sr-only">Staff workload table</caption>
                <thead>
                  <tr className="text-left text-[10.5px] uppercase tracking-wider text-[#8a8a8a]">
                    <th className="py-2 pr-3 font-bold">Representative</th>
                    <th className="py-2 pr-3 font-bold">Status</th>
                    <th className="py-2 pr-3 font-bold text-right">Active</th>
                    <th className="py-2 pr-3 font-bold text-right">Pending</th>
                    <th className="py-2 pr-3 font-bold text-right">Capacity</th>
                    <th className="py-2 font-bold text-right">Resolved</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#dedede]/60">
                  {data.staffWorkload.map((s) => (
                    <tr key={s.staffId}>
                      <td className="py-2 pr-3 font-semibold text-[#1a1917]">{s.name}</td>
                      <td className="py-2 pr-3">
                        <span className="inline-flex items-center gap-1.5 text-[#676767]">
                          <AvailabilityDot availability={s.availability} isOnline={s.isOnline} />
                          {s.isOnline ? AVAILABILITY_LABEL[s.availability] : "Offline"}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{s.active}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{s.pending}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{s.max}</td>
                      <td className="py-2 text-right tabular-nums">{s.resolved}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </>
      )}
    </div>
  );
}

function ChartCard({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) {
  return (
    <section className={cx(cardCls, "p-4 sm:p-5")} aria-label={title}>
      <h2 className="text-sm font-bold text-[#1a1917] mb-3">{title}</h2>
      {empty ? <EmptyState icon={BarChart3} title="No data for this period" /> : children}
    </section>
  );
}
