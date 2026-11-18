import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { errorMessage, supportApi } from "./api";
import { ActionDialogs, type DialogRequest } from "./ActionDialogs";
import { ConversationPanel, type ActionKind } from "./ConversationPanel";
import { CopilotPanel } from "./CopilotPanel";
import { StudentContextPanel } from "./StudentContextPanel";
import { TicketList, type QueueFilters } from "./TicketList";
import { TICKET_EVENTS, useJoinRoom, useSocketEvent } from "./socket";
import type { InternalNote, QueueResponse, QueueView, StaffProfile, SupportMessage, TicketDetail, TicketSummary } from "./types";
import { SlideOver, cx, useMediaQuery } from "./ui";

const VIEW_META: Record<string, { title: string; description: string }> = {
  all: { title: "Live Queue", description: "All open tickets across the support team." },
  mine: { title: "My Tickets", description: "Assigned to you — pending acceptance or in progress." },
  unassigned: { title: "Unassigned", description: "Open tickets without an owner. Claim one to start." },
  ai: { title: "AI-Assisted", description: "Tickets currently handled by the AI assistant." },
  escalated: { title: "Escalations", description: "Tickets escalated to another department or supervisor." },
  resolved: { title: "Resolved", description: "Recently resolved tickets." },
};

type SidePanel = "context" | "copilot" | null;

export function QueueWorkspace({
  view,
  me,
  initialTicketId,
  onQueueChanged,
}: {
  view: QueueView;
  me: StaffProfile | null;
  initialTicketId: string | null;
  onQueueChanged: () => void;
}) {
  const isWide = useMediaQuery("(min-width: 1280px)");
  const isTablet = useMediaQuery("(min-width: 768px)");

  const [filters, setFilters] = useState<QueueFilters>({ q: "", priority: "", category: "", sort: "priority" });
  const [debouncedQ, setDebouncedQ] = useState("");
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(initialTicketId);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [side, setSide] = useState<SidePanel>("context");
  const [sideSheetOpen, setSideSheetOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogRequest | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [injection, setInjection] = useState<{ text: string; nonce: number } | null>(null);
  const [typing, setTyping] = useState<{ name: string; until: number } | null>(null);
  const [contextReload, setContextReload] = useState(0);

  const selectedRef = useRef<string | null>(selectedId);
  selectedRef.current = selectedId;

  useEffect(() => {
    if (initialTicketId) setSelectedId(initialTicketId);
  }, [initialTicketId]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(filters.q.trim()), 300);
    return () => clearTimeout(t);
  }, [filters.q]);

  /* ---------------- list ---------------- */
  const listReq = useRef(0);
  const loadList = useCallback(async () => {
    const id = ++listReq.current;
    setListLoading(true);
    const params = new URLSearchParams({ view, sort: filters.sort });
    if (debouncedQ) params.set("q", debouncedQ);
    if (filters.priority) params.set("priority", filters.priority);
    if (filters.category) params.set("category", filters.category);
    try {
      const res = await supportApi<QueueResponse>(`/queue?${params.toString()}`);
      if (id !== listReq.current) return;
      setTickets(res.tickets);
      setListError(null);
    } catch (err) {
      if (id !== listReq.current) return;
      setListError(errorMessage(err));
    } finally {
      if (id === listReq.current) setListLoading(false);
    }
  }, [view, filters.sort, filters.priority, filters.category, debouncedQ]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  /* ---------------- detail ---------------- */
  const detailReq = useRef(0);
  const loadDetail = useCallback(async (id: string, silent = false) => {
    const req = ++detailReq.current;
    if (!silent) setDetailLoading(true);
    try {
      const d = await supportApi<TicketDetail>(`/tickets/${id}`);
      if (req !== detailReq.current) return;
      setDetail(d);
      setDetailError(null);
    } catch (err) {
      if (req !== detailReq.current) return;
      setDetailError(errorMessage(err));
    } finally {
      if (req === detailReq.current) setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    setTyping(null);
    setInjection(null); // never carry a Copilot draft over to another ticket
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setDetail((d) => (d && d.id === selectedId ? d : null));
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  useJoinRoom(selectedId ? `support-ticket-${selectedId}` : null);

  /* ---------------- realtime ---------------- */
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleListRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => void loadList(), 500);
  }, [loadList]);
  useEffect(() => () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
  }, []);

  useSocketEvent(TICKET_EVENTS, (payload: { ticketId?: string; ticket?: TicketSummary }) => {
    scheduleListRefresh();
    if (payload?.ticketId && payload.ticketId === selectedRef.current) void loadDetail(payload.ticketId, true);
  });

  useSocketEvent("chat:message", (payload: { ticketId: string; message: SupportMessage }) => {
    if (!payload?.message) return;
    if (payload.ticketId === selectedRef.current) {
      setDetail((d) => {
        if (!d || d.id !== payload.ticketId) return d;
        if (d.messages.some((m) => m.id === payload.message.id)) return d;
        return { ...d, messages: [...d.messages, payload.message] };
      });
      if (payload.message.senderType === "student") setTyping(null);
    }
    setTickets((list) =>
      list.map((t) =>
        t.id === payload.ticketId ? { ...t, lastMessagePreview: payload.message.content, lastMessageAt: payload.message.createdAt } : t
      )
    );
  });

  useSocketEvent("support:note", (payload: { ticketId: string; note: InternalNote }) => {
    if (!payload?.note || payload.ticketId !== selectedRef.current) return;
    appendNote(payload.note);
  });

  useSocketEvent("chat:handoff", (payload: { ticketId: string }) => {
    scheduleListRefresh();
    if (payload?.ticketId === selectedRef.current) void loadDetail(payload.ticketId, true);
  });

  useSocketEvent("chat:typing", (payload: { ticketId: string; name: string; senderType: string; isTyping: boolean }) => {
    if (!payload || payload.ticketId !== selectedRef.current) return;
    if (payload.senderType === "agent" && me && payload.name === me.name) return;
    if (payload.isTyping) setTyping({ name: payload.name, until: Date.now() + 6000 });
    else setTyping(null);
  });

  useSocketEvent("student:diagnostics:updated", (payload: { ticketId: string }) => {
    if (payload?.ticketId === selectedRef.current) setContextReload((n) => n + 1);
  });

  // Expire stale typing indicators.
  useEffect(() => {
    if (!typing) return;
    const t = setTimeout(() => setTyping(null), Math.max(0, typing.until - Date.now()));
    return () => clearTimeout(t);
  }, [typing]);

  /* ---------------- mutations ---------------- */
  const appendNote = (note: InternalNote) =>
    setDetail((d) => {
      if (!d) return d;
      const notes = d.internalNotes ?? [];
      if (notes.some((n) => n.id === note.id)) return d;
      return { ...d, internalNotes: [...notes, note] };
    });

  const onUpdated = (t: TicketDetail) => {
    setDetail(t);
    void loadList();
    onQueueChanged();
  };

  const accept = async () => {
    if (!detail) return;
    setAccepting(true);
    try {
      const t = await supportApi<TicketDetail>(`/tickets/${detail.id}/accept`, { method: "POST", body: {} });
      toast.success(`You now own ${t.referenceNumber}`);
      onUpdated(t);
    } catch (err) {
      toast.error(errorMessage(err, "Could not accept ticket"));
      void loadDetail(detail.id, true);
      void loadList();
    } finally {
      setAccepting(false);
    }
  };

  const onMessageSent = (m: SupportMessage) => {
    setDetail((d) => (d && !d.messages.some((x) => x.id === m.id) ? { ...d, messages: [...d.messages, m] } : d));
    scheduleListRefresh();
  };

  const openSide = (panel: Exclude<SidePanel, null>) => {
    if (isWide) {
      setSide((s) => (s === panel ? null : panel));
    } else {
      setSide(panel);
      setSideSheetOpen(true);
    }
  };

  const onAction = (kind: ActionKind, prefill?: string) => setDialog({ kind, prefill });

  /* ---------------- layout ---------------- */
  const meta = VIEW_META[view] ?? VIEW_META.all;
  const showList = isTablet || !selectedId;
  const showConversation = isTablet || !!selectedId;
  const dockSide = isWide && side !== null && !!detail;

  const sideContent =
    detail && side === "copilot" ? (
      <CopilotPanel
        ticket={detail}
        onInsert={(text) => {
          setInjection({ text, nonce: Date.now() });
          if (!isWide) setSideSheetOpen(false);
        }}
        onUseResolution={(text) => {
          if (!isWide) setSideSheetOpen(false);
          setDialog({ kind: "resolve", prefill: text });
        }}
        onOpenTicketRef={(id) => {
          if (!isWide) setSideSheetOpen(false);
          setSelectedId(id);
        }}
      />
    ) : detail ? (
      <StudentContextPanel
        ticket={detail}
        reloadKey={contextReload}
        onFinding={(prefill) => {
          if (!isWide) setSideSheetOpen(false);
          setDialog({ kind: "finding", prefill });
        }}
      />
    ) : null;

  return (
    <div className="h-full min-h-0 flex">
      {showList && (
        <div className={cx("min-h-0 bg-white border-r border-[#dedede]", isTablet ? "w-[300px] lg:w-[340px] shrink-0" : "flex-1")}>
          <TicketList
            title={meta.title}
            description={meta.description}
            tickets={tickets}
            loading={listLoading}
            error={listError}
            onRetry={loadList}
            filters={filters}
            onFilters={setFilters}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>
      )}

      {showConversation && (
        <div className="flex-1 min-w-0 min-h-0 bg-white">
          <ConversationPanel
            ticket={detail && detail.id === selectedId ? detail : null}
            loading={detailLoading}
            error={detailError}
            onRetry={() => selectedId && loadDetail(selectedId)}
            me={me}
            showBack={!isTablet}
            onBack={() => setSelectedId(null)}
            onAction={onAction}
            onAccept={accept}
            accepting={accepting}
            onToggleContext={() => openSide("context")}
            contextOpen={isWide ? side === "context" : sideSheetOpen && side === "context"}
            onOpenCopilot={() => openSide("copilot")}
            copilotOpen={isWide ? side === "copilot" : sideSheetOpen && side === "copilot"}
            typingName={typing?.name ?? null}
            injection={injection}
            onMessageSent={onMessageSent}
            onNoteCreated={appendNote}
          />
        </div>
      )}

      {dockSide && <aside className="w-[380px] 2xl:w-[420px] shrink-0 min-h-0 border-l border-[#dedede] bg-[#fcfcfc]" aria-label={side === "copilot" ? "AI Copilot" : "Student context"}>{sideContent}</aside>}

      {!isWide && (
        <SlideOver open={sideSheetOpen && !!detail} onClose={() => setSideSheetOpen(false)} title={side === "copilot" ? "AI Copilot" : "Student context"}>
          <div className="h-full">{sideContent}</div>
        </SlideOver>
      )}

      <ActionDialogs request={dialog} ticket={detail} onClose={() => setDialog(null)} onUpdated={onUpdated} onNoteCreated={appendNote} />
    </div>
  );
}
