import React, { useCallback, useEffect, useState } from "react";
import { BadgeCheck, ChevronRight, Eye, FileText, Lock, RefreshCw, ShieldAlert } from "lucide-react";
import { errorMessage, supportApi } from "./api";
import type { StudentContext, TicketDetail } from "./types";
import { PRIORITY_LABEL, STATUS_LABEL, categoryLabel } from "./types";
import {
  ErrorBlock,
  PriorityBadge,
  ProvenanceTag,
  type ProvenanceKind,
  Spinner,
  btnPrimary,
  cx,
  focusRing,
  formatBytes,
  formatDateTime,
} from "./ui";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "profile", label: "Student Profile" },
  { key: "portal", label: "Portal Details" },
  { key: "exam", label: "Examination Context" },
  { key: "diagnostics", label: "Technical Diagnostics" },
  { key: "activity", label: "Activity Timeline" },
  { key: "ai", label: "AI Analysis" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export function StudentContextPanel({
  ticket,
  reloadKey,
  onFinding,
}: {
  ticket: TicketDetail;
  reloadKey: number;
  onFinding: (prefill: string) => void;
}) {
  const [tab, setTab] = useState<TabKey>("overview");
  const [ctx, setCtx] = useState<StudentContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);

  const load = useCallback(async () => {
    setRequested(true);
    setLoading(true);
    setError(null);
    try {
      setCtx(await supportApi<StudentContext>(`/tickets/${ticket.id}/student-context`));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [ticket.id]);

  // Reset when the ticket changes; data is fetched only on explicit request (audited access).
  useEffect(() => {
    setCtx(null);
    setError(null);
    setRequested(false);
    setTab("overview");
  }, [ticket.id]);

  // Live diagnostics updates refresh only if the details were already opened.
  useEffect(() => {
    if (requested && reloadKey > 0) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  const needsContext = tab !== "ai";

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 pt-3 shrink-0 border-b border-[#dedede]/60">
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="text-sm font-bold text-[#1a1917]">Student context</span>
          {ctx && (
            <button type="button" onClick={() => void load()} disabled={loading} aria-label="Refresh student context" className={cx("inline-flex items-center justify-center size-9 rounded-lg text-[#676767] hover:bg-[#f6f6f6] cursor-pointer", focusRing)}>
              <RefreshCw className={cx("size-3.5", loading && "animate-spin")} />
            </button>
          )}
        </div>
        <p className="flex items-center gap-1 text-[10.5px] text-[#8a8a8a] px-1 mt-0.5">
          <Lock className="size-3" aria-hidden /> Access is logged
        </p>
        <div className="scrollbar-visible flex gap-1 overflow-x-auto mt-2 -mx-1 px-1 pb-1.5" role="tablist" aria-label="Student context sections">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={(e) => {
                setTab(t.key);
                // Bring a partly hidden tab fully into view.
                e.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
              }}
              className={cx(
                "whitespace-nowrap min-h-9 px-2.5 rounded-lg text-[11px] font-bold cursor-pointer shrink-0",
                focusRing,
                tab === t.key ? "bg-[#1a1917] text-white" : "text-[#676767] hover:bg-[#f1f1f1]"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4" role="tabpanel" aria-label={TABS.find((t) => t.key === tab)?.label}>
        {tab === "ai" ? (
          <AiTab ticket={ticket} onFinding={onFinding} />
        ) : needsContext && !ctx ? (
          error ? (
            <ErrorBlock message={error} onRetry={load} />
          ) : loading ? (
            <Spinner label="Loading student context" />
          ) : (
            <div className="text-center py-8 px-2">
              <Eye className="size-8 text-[#dedede] mx-auto mb-3" aria-hidden />
              <p className="text-sm font-bold text-[#1a1917]">Student portal details</p>
              <p className="text-xs text-[#8a8a8a] mt-1 mb-4 leading-relaxed">
                Profile, portal origin, examination context, diagnostics and activity for {ticket.studentName}. Each access is recorded in the audit log.
              </p>
              <button type="button" className={btnPrimary} onClick={() => void load()}>
                View Student Portal Details
              </button>
            </div>
          )
        ) : ctx ? (
          <>
            {tab === "overview" && <OverviewTab ctx={ctx} ticket={ticket} />}
            {tab === "profile" && <ProfileTab ctx={ctx} />}
            {tab === "portal" && <PortalTab ctx={ctx} />}
            {tab === "exam" && <ExamTab ctx={ctx} onFinding={onFinding} />}
            {tab === "diagnostics" && <DiagnosticsTab ctx={ctx} onFinding={onFinding} />}
            {tab === "activity" && <ActivityTab ctx={ctx} />}
          </>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */

function Section({
  title,
  provenance,
  children,
  action,
}: {
  title: string;
  provenance: ProvenanceKind;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="mb-5">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#676767]">{title}</h3>
        <ProvenanceTag kind={provenance} />
      </div>
      {children}
      {action && <div className="mt-2">{action}</div>}
    </section>
  );
}

function Rows({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="divide-y divide-[#dedede]/50 border border-[#dedede]/70 rounded-xl bg-white">
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-3 px-3 py-2 text-xs">
          <dt className="w-[42%] shrink-0 text-[#8a8a8a] font-semibold">{k}</dt>
          <dd className="flex-1 min-w-0 text-[#1a1917] break-words">{v === null || v === undefined || v === "" ? "—" : v}</dd>
        </div>
      ))}
    </dl>
  );
}

function FindingButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx("inline-flex items-center gap-1.5 min-h-9 px-2.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-[11px] font-bold hover:bg-emerald-100 cursor-pointer", focusRing)}
    >
      <BadgeCheck className="size-3.5" /> Mark as verified finding
    </button>
  );
}

function Breadcrumb({ path }: { path: string[] }) {
  if (!path.length) return null;
  return (
    <nav aria-label="Ticket origin" className="mb-4">
      <ol className="flex flex-wrap items-center gap-1 text-[11px] text-[#676767] bg-[#f6f6f6] border border-[#dedede]/70 rounded-xl px-3 py-2">
        {path.map((p, i) => (
          <li key={`${p}-${i}`} className="inline-flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3 text-[#b2b2b2]" aria-hidden />}
            <span className={i === path.length - 1 ? "font-bold text-[#1a1917]" : ""}>{p}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

const yesNo = (b: boolean | null | undefined) => (b === null || b === undefined ? "—" : b ? "Yes" : "No");

function OverviewTab({ ctx, ticket }: { ctx: StudentContext; ticket: TicketDetail }) {
  return (
    <>
      <Breadcrumb path={ctx.origin.path} />
      <Section title="Student" provenance="system">
        <Rows
          rows={[
            ["Name", ctx.profile.name],
            ["Student ID", ctx.profile.studentId],
            ["Institution", ctx.profile.institution],
            ["Department", ctx.profile.department],
            ["Account status", ctx.profile.accountStatus],
          ]}
        />
      </Section>
      <Section title="Reported issue" provenance="student">
        <Rows
          rows={[
            ["Category", categoryLabel(ctx.origin.category)],
            ["Module", ctx.origin.affectedModule],
            ["Urgency (student)", ticket.urgency],
            ["Raised", formatDateTime(ctx.origin.createdAt)],
          ]}
        />
      </Section>
      {ctx.exam && (
        <Section title="Exam at time of ticket" provenance="system">
          <Rows
            rows={[
              ["Assessment", ctx.exam.title],
              ["Attempt status", ctx.exam.attemptStatus],
              ["Proctoring", ctx.exam.proctoringStatus],
              ["Online now", yesNo(ctx.exam.isOnline)],
            ]}
          />
        </Section>
      )}
      {ctx.origin.aiSummary && (
        <Section title="AI summary" provenance="ai">
          <p className="text-xs text-[#1a1917] bg-indigo-50/60 border border-indigo-100 rounded-xl p-3 leading-relaxed">{ctx.origin.aiSummary}</p>
        </Section>
      )}
    </>
  );
}

function ProfileTab({ ctx }: { ctx: StudentContext }) {
  const p = ctx.profile;
  return (
    <Section title="Student profile" provenance="system">
      <Rows
        rows={[
          ["Name", p.name],
          ["Student ID", p.studentId],
          ["Email", p.email],
          ["Email verified", yesNo(p.emailVerified)],
          ["Institution", p.institution],
          ["Department", p.department],
          ["Branch", p.branch],
          ["Semester", p.semester],
          ["Section", p.section],
          ["Enrolment verification", p.enrolmentVerification],
          ["Account status", p.accountStatus],
          ["Account created", formatDateTime(p.accountCreatedAt)],
        ]}
      />
    </Section>
  );
}

function PortalTab({ ctx }: { ctx: StudentContext }) {
  const o = ctx.origin;
  return (
    <>
      <Breadcrumb path={o.path} />
      <Section title="Where the ticket was raised" provenance="system">
        <Rows
          rows={[
            ["Source portal", o.sourcePortal],
            ["Affected module", o.affectedModule],
            ["Category", categoryLabel(o.category)],
            ["Priority", <span key="p" className="inline-flex items-center gap-1.5"><PriorityBadge priority={o.priority} /> {PRIORITY_LABEL[o.priority]}</span>],
            ["Status", STATUS_LABEL[o.status] ?? o.status],
            ["Created", formatDateTime(o.createdAt)],
          ]}
        />
      </Section>
      <Section title="Description" provenance="student">
        <p className="text-xs text-[#1a1917] whitespace-pre-wrap bg-white border border-[#dedede]/70 rounded-xl p-3 leading-relaxed">{o.description}</p>
        {o.attachments.length > 0 && (
          <ul className="mt-2 space-y-1">
            {o.attachments.map((a) => (
              <li key={a.id}>
                <a href={a.url} target="_blank" rel="noopener noreferrer" className={cx("inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#1a1917] underline min-h-9", focusRing)}>
                  <FileText className="size-3.5" aria-hidden /> {a.fileName} <span className="text-[#a2a2a2] no-underline">{formatBytes(a.size)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {(o.aiSummary || o.aiCategory) && (
        <Section title="AI interpretation" provenance="ai">
          <Rows
            rows={[
              ["AI category", o.aiCategory ? categoryLabel(o.aiCategory) : null],
              ["Summary", o.aiSummary],
            ]}
          />
        </Section>
      )}
    </>
  );
}

function ExamTab({ ctx, onFinding }: { ctx: StudentContext; onFinding: (s: string) => void }) {
  const e = ctx.exam;
  if (!e) return <p className="text-xs text-[#8a8a8a] py-6 text-center">This ticket is not linked to an examination attempt.</p>;
  const remaining =
    e.remainingSeconds === null ? null : `${Math.floor(e.remainingSeconds / 60)}m ${String(e.remainingSeconds % 60).padStart(2, "0")}s`;
  return (
    <>
      <Section
        title="Examination attempt"
        provenance="system"
        action={
          <FindingButton
            onClick={() =>
              onFinding(
                `Exam "${e.title}" (attempt ${e.attemptId}): attempt status ${e.attemptStatus}, proctoring ${e.proctoringStatus}, ` +
                  `student ${e.isOnline ? "online" : "offline"}, last heartbeat ${formatDateTime(e.lastHeartbeatAt)}, ` +
                  `network ${e.networkQuality ?? "unknown"}, face status ${e.faceStatus ?? "unknown"}, ${e.warningCount} warning(s).`
              )
            }
          />
        }
      >
        <Rows
          rows={[
            ["Assessment", e.title],
            ["Course", e.course],
            ["Scheduled", e.scheduledStart ? `${formatDateTime(e.scheduledStart)} – ${formatDateTime(e.scheduledEnd)}` : null],
            ["Duration", `${e.durationMinutes} min`],
            ["Started", formatDateTime(e.startedAt)],
            ["Submitted", e.submittedAt ? formatDateTime(e.submittedAt) : "Not submitted"],
            ["Remaining", remaining],
            ["Attempt status", e.attemptStatus],
          ]}
        />
      </Section>
      <Section title="Live proctoring signals" provenance="automatic">
        <Rows
          rows={[
            ["Proctoring status", e.proctoringStatus],
            ["Online", yesNo(e.isOnline)],
            ["Last heartbeat", formatDateTime(e.lastHeartbeatAt)],
            ["Last camera frame", formatDateTime(e.lastFrameAt)],
            ["Network quality", e.networkQuality],
            ["Face status", e.faceStatus],
            ["Warnings", String(e.warningCount)],
          ]}
        />
      </Section>
      <Section title="Exam events" provenance="automatic">
        {e.events.length === 0 ? (
          <p className="text-xs text-[#8a8a8a]">No events recorded.</p>
        ) : (
          <ol className="space-y-1.5">
            {e.events.map((ev, i) => (
              <li key={i} className="text-xs border-l-2 border-[#dedede] pl-3">
                <span className="text-[10.5px] text-[#8a8a8a] block">{formatDateTime(ev.at)}</span>
                <span className="font-semibold text-[#1a1917]">{ev.event}</span>
                {ev.details && <span className="text-[#676767]"> — {ev.details}</span>}
              </li>
            ))}
          </ol>
        )}
      </Section>
      <p className="text-[10.5px] text-[#a2a2a2]">Exam answers are never shown to support staff.</p>
    </>
  );
}

function DiagnosticsTab({ ctx, onFinding }: { ctx: StudentContext; onFinding: (s: string) => void }) {
  const c = ctx.diagnostics.client;
  const s = ctx.diagnostics.server;
  return (
    <>
      <Section
        title="Client device (shared by student's browser)"
        provenance="automatic"
        action={
          c ? (
            <FindingButton
              onClick={() =>
                onFinding(
                  `Diagnostics (${formatDateTime(c.collectedAt)}): ${c.browser} ${c.browserVersion} on ${c.os} (${c.deviceType}), ` +
                    `camera permission ${c.cameraPermission}, microphone permission ${c.microphonePermission}, ` +
                    `WebRTC ${c.webrtcSupported ? "supported" : "not supported"}, ${c.online ? "online" : "offline"}` +
                    (c.connection?.effectiveType ? `, connection ${c.connection.effectiveType}` : "") +
                    (c.recentFailedRequests.length ? `, ${c.recentFailedRequests.length} recent failed request(s)` : "") +
                    "."
                )
              }
            />
          ) : undefined
        }
      >
        {!c ? (
          <p className="text-xs text-[#8a8a8a]">The student did not share technical details with this ticket.</p>
        ) : (
          <>
            <Rows
              rows={[
                ["Browser", `${c.browser} ${c.browserVersion}`],
                ["OS", c.os],
                ["Device", c.deviceType],
                ["Screen / viewport", `${c.screen} / ${c.viewport}`],
                ["Language / timezone", `${c.language} / ${c.timezone}`],
                ["Online", yesNo(c.online)],
                [
                  "Connection",
                  c.connection
                    ? [c.connection.effectiveType, c.connection.downlink !== undefined ? `${c.connection.downlink} Mbps` : null, c.connection.rtt !== undefined ? `${c.connection.rtt} ms RTT` : null]
                        .filter(Boolean)
                        .join(" · ") || null
                    : null,
                ],
                ["Camera permission", <PermissionValue key="cam" v={c.cameraPermission} />],
                ["Microphone permission", <PermissionValue key="mic" v={c.microphonePermission} />],
                ["WebRTC", c.webrtcSupported ? "Supported" : "Not supported"],
                ["Socket connected", yesNo(c.socketConnected)],
                ["App version", c.appVersion],
                ["Collected", formatDateTime(c.collectedAt)],
              ]}
            />
            <h4 className="text-[11px] font-bold text-[#676767] mt-3 mb-1.5">Recent failed requests</h4>
            {c.recentFailedRequests.length === 0 ? (
              <p className="text-xs text-[#8a8a8a]">None.</p>
            ) : (
              <ul className="text-[11px] font-mono space-y-1 bg-[#f6f6f6] rounded-xl p-2.5 border border-[#dedede]/70">
                {c.recentFailedRequests.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-rose-600 font-bold">{r.status}</span>
                    <span className="truncate flex-1">{r.path}</span>
                    <span className="text-[#a2a2a2]">{new Date(r.at).toLocaleTimeString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Section>
      <Section title="Server-side signals" provenance="system">
        <Rows
          rows={[
            ["Last login", formatDateTime(s.lastLoginAt)],
            ["Last login user agent", s.lastLoginUserAgent],
            ["Last heartbeat", formatDateTime(s.lastHeartbeatAt)],
            ["Socket online now", yesNo(s.socketOnline)],
          ]}
        />
      </Section>
    </>
  );
}

function PermissionValue({ v }: { v: string }) {
  const cls = v === "granted" ? "text-emerald-700" : v === "denied" ? "text-rose-700 font-bold" : "text-[#676767]";
  return <span className={cls}>{v}</span>;
}

const SOURCE_STYLE: Record<string, string> = {
  student: "bg-sky-500",
  system: "bg-zinc-400",
  ai: "bg-indigo-500",
  staff: "bg-[#1a1917]",
};

function ActivityTab({ ctx }: { ctx: StudentContext }) {
  if (ctx.activity.length === 0) return <p className="text-xs text-[#8a8a8a] py-6 text-center">No activity recorded.</p>;
  return (
    <section>
      <div className="flex flex-wrap gap-2 mb-3 text-[10px] text-[#676767]">
        {(["student", "system", "ai", "staff"] as const).map((s) => (
          <span key={s} className="inline-flex items-center gap-1 capitalize">
            <span className={cx("size-2 rounded-full", SOURCE_STYLE[s])} aria-hidden /> {s === "ai" ? "AI" : s}
          </span>
        ))}
      </div>
      <ol className="relative border-l border-[#dedede] ml-1.5 space-y-3">
        {ctx.activity.map((a, i) => (
          <li key={i} className="pl-4 relative">
            <span className={cx("absolute -left-[5px] top-1 size-2.5 rounded-full ring-2 ring-white", SOURCE_STYLE[a.source] ?? "bg-zinc-400")} aria-hidden />
            <span className="text-[10.5px] text-[#8a8a8a] block">
              {formatDateTime(a.at)} · <span className="capitalize">{a.source === "ai" ? "AI" : a.source}</span>
            </span>
            <span className="text-xs font-semibold text-[#1a1917]">{a.label}</span>
            {a.detail && <span className="block text-[11px] text-[#676767]">{a.detail}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

function AiTab({ ticket, onFinding }: { ticket: TicketDetail; onFinding: (s: string) => void }) {
  const a = ticket.aiAnalysis;
  if (!a) return <p className="text-xs text-[#8a8a8a] py-6 text-center">AI triage has not produced an analysis for this ticket yet.</p>;
  const pct = Math.round(Math.max(0, Math.min(1, a.confidence)) * 100);
  return (
    <>
      <Section
        title="AI triage"
        provenance="ai"
        action={<FindingButton onClick={() => onFinding(`Confirmed AI assessment: ${a.issueSummary} (priority ${a.priority} — ${a.priorityReason}).`)} />}
      >
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <PriorityBadge priority={a.priority} withLabel />
            <span className="text-[10.5px] font-bold uppercase text-[#676767]">Severity: {a.severity}</span>
            {a.blocksExam && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                <ShieldAlert className="size-3" aria-hidden /> Blocks exam
              </span>
            )}
            {a.recurring && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">Recurring issue</span>}
          </div>
          <p className="text-xs text-[#1a1917] leading-relaxed">{a.issueSummary}</p>
          <p className="text-[11px] text-[#676767]">
            <strong>Why this priority:</strong> {a.priorityReason}
          </p>
          <div>
            <div className="flex justify-between text-[10.5px] text-[#676767] mb-1">
              <span>Confidence</span>
              <span className="font-bold tabular-nums">{pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="AI confidence">
              <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      </Section>
      <Section title="Routing recommendation" provenance="ai">
        <Rows
          rows={[
            ["Category", categoryLabel(a.category)],
            ["Subcategory", a.subcategory],
            ["Suggested department", a.suggestedDepartment],
            ["Required expertise", a.requiredExpertise.length ? a.requiredExpertise.map(categoryLabel).join(", ") : null],
            ["Recommended staff", a.recommendedStaffName],
            ["Generated by", a.generatedBy === "llm" ? "Language model" : "Rules engine"],
            ["Analysed", formatDateTime(a.createdAt)],
          ]}
        />
      </Section>
      <p className="text-[10.5px] text-[#a2a2a2]">AI analysis is an interpretation to support your judgement — verify before acting.</p>
    </>
  );
}
