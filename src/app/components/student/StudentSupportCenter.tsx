import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { Inbox, LifeBuoy, Loader2, MessageSquare, Plus, RefreshCw, Search } from "lucide-react";
import { createAuthedSocket } from "../../utils/socket-client";
import { AgentMascot3D } from "../mascot/AgentMascot3D";
import { KnowledgeBaseSearch } from "./support/KnowledgeBaseSearch";
import { NewTicketForm, type SupportInitialContext } from "./support/NewTicketForm";
import { TicketConversation } from "./support/TicketConversation";
import {
  card,
  errMessage,
  fieldCls,
  focusRing,
  friendlyStatus,
  primaryBtn,
  PRIORITY_LABELS,
  priorityTone,
  secondaryBtn,
  statusTone,
  supportApi,
  timeAgo,
  type TicketDetail,
  type TicketSummary,
} from "./support/support-shared";

/**
 * Student Support Center — self-contained: loads its own data from
 * /api/support and listens for real-time updates over Socket.IO.
 */
interface StudentSupportCenterProps {
  user: any;
  onOpenDocs?: () => void;
  initialContext?: SupportInitialContext;
}

type Filter = "open" | "resolved" | "all";
type Pane = { kind: "empty" } | { kind: "new" } | { kind: "ticket"; id: string; justCreated: boolean };

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "open", label: "Open" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
];

export function StudentSupportCenter({ user, onOpenDocs, initialContext }: StudentSupportCenterProps) {
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [query, setQuery] = useState("");
  const [pane, setPane] = useState<Pane>(initialContext ? { kind: "new" } : { kind: "empty" });
  const [socket, setSocket] = useState<Socket | null>(null);
  const socketConnectedRef = useRef<boolean | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const firstLoadRef = useRef(true);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadTickets = useCallback(async (silent = false) => {
    if (!silent) setListLoading(true);
    try {
      const data = await supportApi<TicketSummary[]>("/api/support/tickets/my");
      const list = Array.isArray(data) ? data : [];
      setTickets(list);
      setListError(null);
      if (firstLoadRef.current) {
        firstLoadRef.current = false;
        // First-time visitors with no tickets land straight on the form.
        if (list.length === 0) setPane((p) => (p.kind === "empty" ? { kind: "new" } : p));
      }
    } catch (err) {
      if (!silent) setListError(errMessage(err, "Couldn't load your tickets."));
    } finally {
      if (!silent) setListLoading(false);
    }
  }, []);

  /** Debounced silent refresh, used after real-time events. */
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => loadTickets(true), 400);
  }, [loadTickets]);

  useEffect(() => {
    loadTickets();
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [loadTickets, user?.id]);

  // One socket for the whole Support Center.
  useEffect(() => {
    let s: Socket;
    try {
      s = createAuthedSocket();
    } catch {
      return;
    }
    const onConnect = () => {
      socketConnectedRef.current = true;
      setSocketConnected(true);
    };
    const onDisconnect = () => {
      socketConnectedRef.current = false;
      setSocketConnected(false);
    };
    const onAnyTicketEvent = () => scheduleRefresh();
    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("notification:new", onAnyTicketEvent);
    s.on("chat:message", onAnyTicketEvent);
    s.on("chat:handoff", onAnyTicketEvent);
    ["ticket:triaged", "ticket:assigned", "ticket:accepted", "ticket:reassigned", "ticket:escalated", "ticket:resolved", "ticket:updated"].forEach(
      (ev) => s.on(ev, onAnyTicketEvent)
    );
    socketConnectedRef.current = s.connected;
    setSocket(s);
    return () => {
      s.removeAllListeners();
      s.disconnect();
      setSocket(null);
      socketConnectedRef.current = null;
    };
  }, [scheduleRefresh]);

  // Fallback refresh when the live connection is down, plus on tab focus.
  useEffect(() => {
    const onFocus = () => loadTickets(true);
    window.addEventListener("focus", onFocus);
    const interval = socketConnected ? null : setInterval(() => loadTickets(true), 30000);
    return () => {
      window.removeEventListener("focus", onFocus);
      if (interval) clearInterval(interval);
    };
  }, [socketConnected, loadTickets]);

  const getSocketConnected = useCallback(() => socketConnectedRef.current, []);

  const handleCreated = (t: TicketDetail) => {
    setTickets((prev) => [t, ...prev.filter((x) => x.id !== t.id)]);
    setFilter((f) => (f === "resolved" ? "open" : f));
    setPane({ kind: "ticket", id: t.id, justCreated: true });
    scheduleRefresh();
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets.filter((t) => {
      if (filter === "open" && t.status === "resolved") return false;
      if (filter === "resolved" && t.status !== "resolved") return false;
      if (!q) return true;
      return [t.referenceNumber, t.title, t.categoryLabel, t.moduleLabel, t.lastMessagePreview]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [tickets, filter, query]);

  const counts = useMemo(
    () => ({
      open: tickets.filter((t) => t.status !== "resolved").length,
      resolved: tickets.filter((t) => t.status === "resolved").length,
      all: tickets.length,
    }),
    [tickets]
  );

  const selectedId = pane.kind === "ticket" ? pane.id : null;
  const showRightOnMobile = pane.kind !== "empty";

  return (
    <div className="max-w-7xl mx-auto w-full space-y-4">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="size-10 rounded-xl bg-[#1a1917] text-white flex items-center justify-center shrink-0" aria-hidden>
            <LifeBuoy className="size-5" />
          </span>
          <div>
            <h1 className="text-[20px] sm:text-[22px] font-semibold text-[#1a1917] leading-tight">Support Center</h1>
            <p className="text-[12px] text-[#676767]">Get help with exams, proctoring, your account and more.</p>
          </div>
        </div>
        <button type="button" onClick={() => setPane({ kind: "new" })} className={`${primaryBtn} self-start sm:self-auto`}>
          <Plus className="size-4" aria-hidden />
          New ticket
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(300px,380px)_1fr] gap-4 items-start">
        {/* Ticket list */}
        <aside
          className={`${card} flex flex-col lg:h-[calc(100vh-180px)] lg:min-h-[600px] overflow-hidden ${showRightOnMobile ? "hidden lg:flex" : "flex"}`}
          aria-labelledby="support-my-tickets"
        >
          <div className="p-4 border-b border-[#eee] space-y-3">
            <div className="flex items-center justify-between">
              <h2 id="support-my-tickets" className="text-[15px] font-semibold text-[#1a1917]">
                My tickets
              </h2>
              <button
                type="button"
                onClick={() => loadTickets()}
                className={`size-11 -mr-2 rounded-xl flex items-center justify-center text-[#676767] hover:bg-[#f6f6f6] ${focusRing}`}
                aria-label="Refresh tickets"
              >
                <RefreshCw className={`size-4 ${listLoading ? "animate-spin" : ""}`} aria-hidden />
              </button>
            </div>
            <div className="flex gap-1 p-1 bg-[#f6f6f6] rounded-xl" role="tablist" aria-label="Filter tickets">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.key}
                  onClick={() => setFilter(f.key)}
                  className={`flex-1 min-h-[40px] rounded-lg text-[12px] font-semibold transition-colors ${focusRing} ${
                    filter === f.key ? "bg-white text-[#1a1917] shadow-sm" : "text-[#676767] hover:text-[#1a1917]"
                  }`}
                >
                  {f.label} <span className="text-[#8a8a8a] font-medium">{counts[f.key]}</span>
                </button>
              ))}
            </div>
            <div className="relative">
              <label htmlFor="support-ticket-search" className="sr-only">
                Search tickets
              </label>
              <Search className="size-4 text-[#8a8a8a] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden />
              <input
                id="support-ticket-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by reference or title"
                className={`${fieldCls} h-11 pl-9`}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-[200px]">
            {listLoading && tickets.length === 0 ? (
              <ul className="p-3 space-y-2" aria-busy="true" aria-label="Loading tickets">
                {[0, 1, 2].map((i) => (
                  <li key={i} className="h-[84px] rounded-xl bg-[#f6f6f6] animate-pulse" />
                ))}
              </ul>
            ) : listError && tickets.length === 0 ? (
              <div className="p-6 text-center space-y-3">
                <p className="text-[13px] text-red-700" role="alert">
                  {listError}
                </p>
                <button type="button" onClick={() => loadTickets()} className={secondaryBtn}>
                  <RefreshCw className="size-4" aria-hidden /> Try again
                </button>
              </div>
            ) : visible.length === 0 ? (
              <div className="p-6 text-center flex flex-col items-center gap-2">
                <span className="size-11 rounded-full bg-[#f6f6f6] flex items-center justify-center text-[#8a8a8a]">
                  <Inbox className="size-5" aria-hidden />
                </span>
                <p className="text-[13px] font-semibold text-[#1a1917]">
                  {tickets.length === 0 ? "No tickets yet" : query ? "No tickets match your search" : `No ${filter === "open" ? "open" : "resolved"} tickets`}
                </p>
                <p className="text-[12px] text-[#676767]">
                  {tickets.length === 0 ? "When you raise a ticket it will appear here." : "Try a different filter or search."}
                </p>
                {tickets.length === 0 && (
                  <button type="button" onClick={() => setPane({ kind: "new" })} className={`${secondaryBtn} mt-1`}>
                    <Plus className="size-4" aria-hidden /> Raise a ticket
                  </button>
                )}
              </div>
            ) : (
              <ul className="p-2 space-y-1">
                {visible.map((t) => {
                  const active = selectedId === t.id;
                  const needsReply = t.status === "waiting_student";
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => setPane({ kind: "ticket", id: t.id, justCreated: false })}
                        aria-current={active ? "true" : undefined}
                        className={`w-full text-left rounded-xl px-3 py-3 border transition-colors ${focusRing} ${
                          active
                            ? "bg-[#f6f6f6] border-[#cfcfcf]"
                            : needsReply
                            ? "bg-amber-50/40 border-amber-200 hover:bg-amber-50"
                            : "bg-white border-transparent hover:bg-[#fafafa] hover:border-[#eee]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-mono font-semibold text-[#8a8a8a]">{t.referenceNumber}</span>
                          <span className="text-[11px] text-[#8a8a8a] shrink-0">{timeAgo(t.lastMessageAt || t.updatedAt)}</span>
                        </div>
                        <p className={`text-[13px] text-[#1a1917] mt-0.5 truncate ${needsReply ? "font-bold" : "font-semibold"}`}>{t.title}</p>
                        <p className="text-[11px] text-[#676767] truncate">{t.categoryLabel}</p>
                        {t.lastMessagePreview && (
                          <p className={`text-[12px] mt-1 line-clamp-1 ${needsReply ? "text-[#1a1917]" : "text-[#8a8a8a]"}`}>
                            <MessageSquare className="size-3 inline mr-1 -mt-0.5" aria-hidden />
                            {t.lastMessagePreview}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusTone(t)}`}>{friendlyStatus(t)}</span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md border ${priorityTone(t.priority)}`}>
                            {PRIORITY_LABELS[t.priority] ?? t.priority}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {!socketConnected && !listLoading && (
            <p className="px-4 py-2 border-t border-[#eee] text-[11px] text-[#8a8a8a]" role="status">
              Live updates paused — reconnecting…
            </p>
          )}
        </aside>

        {/* Right pane */}
        <div className={`${showRightOnMobile ? "block" : "hidden lg:block"} min-w-0 space-y-4`}>
          {pane.kind === "new" && (
            <>
              <KnowledgeBaseSearch onOpenDocs={onOpenDocs} />
              <NewTicketForm
                initialContext={initialContext}
                getSocketConnected={getSocketConnected}
                onCreated={handleCreated}
                onCancel={() => setPane({ kind: "empty" })}
              />
            </>
          )}
          {pane.kind === "ticket" && (
            <TicketConversation
              key={pane.id}
              ticketId={pane.id}
              socket={socket}
              justCreated={pane.justCreated}
              onBack={() => setPane({ kind: "empty" })}
              onChanged={scheduleRefresh}
            />
          )}
          {pane.kind === "empty" && (
            <>
              <KnowledgeBaseSearch onOpenDocs={onOpenDocs} />
              <div className={`${card} p-8 flex flex-col items-center justify-center text-center gap-3 min-h-[320px]`}>
                {listLoading ? (
                  <Loader2 className="size-6 animate-spin text-[#8a8a8a]" aria-hidden />
                ) : (
                  <>
                    {/* Vigil, the IntegrityOS assistant (3D, falls back to a vector drawing without WebGL) */}
                    <div className="relative h-40 w-40" aria-hidden="true">
                      <AgentMascot3D accent="#f5c542" expression="wave" distance={5.8} trackPage={false} />
                    </div>
                    <p className="rounded-2xl rounded-bl-md border border-[#e4e7f5] bg-[#f5f7ff] px-4 py-2 text-[13px] font-medium text-[#1a1917]">
                      Hi, I'm <span className="font-semibold">Vigil</span> 👋 How can I help with your exam today?
                    </p>
                    <p className="text-[12px] text-[#676767] max-w-sm">
                      Pick a ticket on the left, or raise a new one — I reply right away and bring in a support agent when a
                      human is needed.
                    </p>
                    <button type="button" onClick={() => setPane({ kind: "new" })} className={primaryBtn}>
                      <Plus className="size-4" aria-hidden /> New ticket
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default StudentSupportCenter;
