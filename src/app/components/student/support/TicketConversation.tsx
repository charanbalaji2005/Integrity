import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  Paperclip,
  RefreshCw,
  RotateCcw,
  Send,
  Star,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { addFiles, LocalFilePreviews, RemoteAttachments } from "./Attachments";
import {
  ACCEPTED_EXT,
  card,
  errMessage,
  fieldCls,
  focusRing,
  formatTime,
  friendlyStatus,
  LIMITS,
  primaryBtn,
  PRIORITY_LABELS,
  priorityTone,
  secondaryBtn,
  statusTone,
  supportApi,
  type SupportMessage,
  type TicketDetail,
} from "./support-shared";
import { joinRoom } from "../../../utils/socket-client";
import { ChatbotIcon } from "../../ChatbotIcon";

const TICKET_EVENTS = [
  "ticket:created",
  "ticket:triaged",
  "ticket:assigned",
  "ticket:accepted",
  "ticket:reassigned",
  "ticket:escalated",
  "ticket:resolved",
  "ticket:updated",
  "chat:handoff",
] as const;

const STEPS = ["Submitted", "AI triage", "Agent assigned", "In progress", "Resolved"];

function currentStep(t: TicketDetail): number {
  if (t.status === "resolved") return 4;
  if (t.ownershipType === "HUMAN") {
    if (t.status === "in_progress" || t.status === "waiting_student") return 3;
    if (t.status === "pending_acceptance") return 2;
    if (t.status === "escalated") return t.assignedAgentName ? 3 : 2;
    return 1; // unassigned: triaged, waiting for an agent
  }
  return 1;
}

function ProgressTracker({ ticket }: { ticket: TicketDetail }) {
  const step = currentStep(ticket);
  return (
    <ol className="flex items-center gap-1 sm:gap-2 overflow-x-auto pb-1" aria-label="Ticket progress">
      {STEPS.map((label, i) => {
        const done = i < step || (i === 4 && step === 4);
        const active = i === step && step !== 4;
        return (
          <li key={label} className="flex items-center gap-1 sm:gap-2 shrink-0" aria-current={active ? "step" : undefined}>
            <span className="flex items-center gap-1.5">
              <span
                className={`size-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                  done
                    ? "bg-[#1a1917] border-[#1a1917] text-white"
                    : active
                    ? "bg-white border-[#1a1917] text-[#1a1917]"
                    : "bg-white border-[#dedede] text-[#a2a2a2]"
                }`}
                aria-hidden
              >
                {done ? <Check className="size-3" /> : i + 1}
              </span>
              <span
                className={`text-[11px] whitespace-nowrap ${
                  done || active ? "text-[#1a1917] font-semibold" : "text-[#8a8a8a]"
                }`}
              >
                {label}
                <span className="sr-only">{done ? " (complete)" : active ? " (current)" : ""}</span>
              </span>
            </span>
            {i < STEPS.length - 1 && <span className={`w-4 sm:w-8 h-px ${i < step ? "bg-[#1a1917]" : "bg-[#dedede]"}`} aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

function MessageBubble({ m }: { m: SupportMessage }) {
  if (m.senderType === "system" || m.messageType === "system" || m.messageType === "handoff") {
    return (
      <div className="flex justify-center my-1" role="note">
        <span className="max-w-[90%] text-center text-[11px] text-[#676767] bg-[#f3f3f3] border border-[#e6e6e6] rounded-full px-3 py-1.5">
          {m.content}
          <span className="text-[#a2a2a2]"> · {formatTime(m.createdAt)}</span>
        </span>
      </div>
    );
  }
  const mine = m.senderType === "student";
  const isAi = m.senderType === "ai";
  return (
    <div className={`flex gap-2 ${mine ? "justify-end" : "justify-start"}`}>
      {!mine &&
        (isAi ? (
          <ChatbotIcon className="size-8 mt-5" />
        ) : (
          <span
            className="size-8 rounded-full flex items-center justify-center shrink-0 mt-5 bg-emerald-100 text-emerald-800"
            aria-hidden
          >
            <UserRound className="size-4" />
          </span>
        ))}
      <div className={`max-w-[85%] sm:max-w-[75%] min-w-0 ${mine ? "items-end" : "items-start"} flex flex-col`}>
        <div className={`flex items-center gap-1.5 mb-1 text-[11px] ${mine ? "flex-row-reverse" : ""}`}>
          <span className="font-semibold text-[#1a1917]">{mine ? "You" : isAi ? "Vigil" : m.senderName || "Support agent"}</span>
          {isAi && (
            <span className="px-1.5 py-0.5 rounded-md bg-sky-50 border border-sky-200 text-sky-800 text-[10px] font-semibold">
              AI assistant
            </span>
          )}
          {m.senderType === "agent" && (
            <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-semibold">
              Support team
            </span>
          )}
          <span className="text-[#a2a2a2]">{formatTime(m.createdAt)}</span>
        </div>
        <div
          className={`rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words ${
            mine
              ? "bg-[#1a1917] text-white rounded-tr-md"
              : isAi
              ? "bg-[#f6f6f6] border border-[#e6e6e6] text-[#1a1917] rounded-tl-md"
              : "bg-white border border-emerald-200 text-[#1a1917] rounded-tl-md"
          }`}
        >
          {m.content}
          <RemoteAttachments items={m.attachments || []} tone={mine ? "dark" : "light"} />
        </div>
      </div>
    </div>
  );
}

function TypingBubble({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-[12px] text-[#676767]" role="status" aria-live="polite">
      <span className="flex gap-1 bg-[#f6f6f6] border border-[#e6e6e6] rounded-full px-3 py-2" aria-hidden>
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="size-1.5 rounded-full bg-[#8a8a8a]"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </span>
      {label}
    </div>
  );
}

function StarRating({ value, onChange, disabled }: { value: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Rate your support experience" className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          disabled={disabled}
          onClick={() => onChange(n)}
          className={`size-11 rounded-xl flex items-center justify-center hover:bg-[#f6f6f6] disabled:cursor-default ${focusRing}`}
        >
          <Star className={`size-6 ${n <= value ? "fill-amber-400 text-amber-400" : "text-[#cfcfcf]"}`} aria-hidden />
        </button>
      ))}
    </div>
  );
}

export function TicketConversation({
  ticketId,
  socket,
  justCreated,
  onBack,
  onChanged,
}: {
  ticketId: string;
  socket: Socket | null;
  justCreated: boolean;
  onBack: () => void;
  onChanged: () => void;
}) {
  const ids = useId();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [awaitingAi, setAwaitingAi] = useState(justCreated);
  const [typing, setTyping] = useState<{ name: string; senderType: string } | null>(null);
  const [actionBusy, setActionBusy] = useState<null | "close" | "rate" | "reopen">(null);
  const [rating, setRating] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [showReopen, setShowReopen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingSentRef = useRef(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const data = await supportApi<TicketDetail>(`/api/support/tickets/${encodeURIComponent(ticketId)}`);
        setTicket(data);
        setLoadError(null);
        // If the latest conversational message isn't the student's, a reply has already arrived.
        const lastChat = [...(data.messages || [])].reverse().find((m) => m.senderType !== "system" && m.messageType === "text");
        if (lastChat && lastChat.senderType !== "student") setAwaitingAi(false);
        if (data.ownershipType !== "AI" || data.status === "resolved") setAwaitingAi(false);
      } catch (err) {
        if (!silent) setLoadError(errMessage(err, "Couldn't load this ticket."));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [ticketId]
  );

  useEffect(() => {
    setTicket(null);
    setTyping(null);
    setAwaitingAi(justCreated);
    load();
  }, [ticketId, load, justCreated]);

  // Stop showing "AI is typing…" if nothing arrives within a minute.
  useEffect(() => {
    if (!awaitingAi) return;
    const t = setTimeout(() => {
      setAwaitingAi(false);
      load(true);
    }, 60000);
    return () => clearTimeout(t);
  }, [awaitingAi, load]);

  // Real-time: join the ticket room and listen for updates.
  useEffect(() => {
    if (!socket) return;
    const room = `support-ticket-${ticketId}`;
    const join = () => {
      joinRoom(socket, room).then((ok) => {
        if (ok) load(true); // catch up on anything missed while disconnected
      });
    };
    if (socket.connected) join();
    socket.on("connect", join);

    const onMessage = (p: { ticketId?: string; message?: SupportMessage }) => {
      if (p?.ticketId !== ticketId || !p.message) return;
      const msg = p.message;
      setTicket((prev) => {
        if (!prev) return prev;
        if (prev.messages.some((m) => m.id === msg.id)) return prev;
        return { ...prev, messages: [...prev.messages, msg], lastMessageAt: msg.createdAt, lastMessagePreview: msg.content };
      });
      if (msg.senderType !== "student") {
        setAwaitingAi(false);
        setTyping(null);
      }
      onChanged();
    };
    const onTicketEvent = (p: { ticketId?: string }) => {
      if (p?.ticketId !== ticketId) return;
      load(true);
      onChanged();
    };
    const onTyping = (p: { ticketId?: string; name?: string; senderType?: string; isTyping?: boolean }) => {
      if (p?.ticketId !== ticketId || p.senderType === "student") return;
      if (remoteTypingTimerRef.current) clearTimeout(remoteTypingTimerRef.current);
      if (p.isTyping) {
        setTyping({ name: p.name || (p.senderType === "ai" ? "AI assistant" : "Support agent"), senderType: p.senderType || "agent" });
        remoteTypingTimerRef.current = setTimeout(() => setTyping(null), 8000);
      } else {
        setTyping(null);
      }
    };

    socket.on("chat:message", onMessage);
    socket.on("chat:typing", onTyping);
    TICKET_EVENTS.forEach((ev) => socket.on(ev, onTicketEvent));
    return () => {
      socket.off("connect", join);
      socket.off("chat:message", onMessage);
      socket.off("chat:typing", onTyping);
      TICKET_EVENTS.forEach((ev) => socket.off(ev, onTicketEvent));
      if (typingSentRef.current) socket.emit("chat:typing", { ticketId, isTyping: false });
      typingSentRef.current = false;
      socket.emit("leave-room", room);
      if (remoteTypingTimerRef.current) clearTimeout(remoteTypingTimerRef.current);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, [socket, ticketId, load, onChanged]);

  // Auto-scroll on new content.
  const msgCount = ticket?.messages.length ?? 0;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgCount, awaitingAi, typing]);

  const emitTyping = (isTyping: boolean) => {
    if (!socket?.connected) return;
    if (typingSentRef.current === isTyping) return;
    typingSentRef.current = isTyping;
    socket.emit("chat:typing", { ticketId, isTyping });
  };

  const onDraftChange = (v: string) => {
    setDraft(v);
    emitTyping(v.trim().length > 0);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => emitTyping(false), 2500);
  };

  const send = async () => {
    if (!ticket || sending) return;
    const content = draft.trim();
    if (!content && files.length === 0) return;
    setSending(true);
    try {
      const fd = new FormData();
      fd.append("content", content);
      files.forEach((f) => fd.append("files", f));
      const msg = await supportApi<SupportMessage>(`/api/support/tickets/${encodeURIComponent(ticket.id)}/messages`, {
        method: "POST",
        body: fd,
      });
      setTicket((prev) =>
        prev && msg && !prev.messages.some((m) => m.id === msg.id) ? { ...prev, messages: [...prev.messages, msg] } : prev
      );
      setDraft("");
      setFiles([]);
      emitTyping(false);
      if (ticket.ownershipType === "AI") setAwaitingAi(true);
      onChanged();
    } catch (err) {
      toast.error(errMessage(err, "Couldn't send your message."));
    } finally {
      setSending(false);
    }
  };

  const runAction = async (kind: "close" | "rate" | "reopen", body: Record<string, unknown>, success: string) => {
    if (!ticket) return;
    setActionBusy(kind);
    try {
      const data = await supportApi<TicketDetail>(`/api/support/tickets/${encodeURIComponent(ticket.id)}/${kind}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (data && data.id) setTicket(data);
      else load(true);
      toast.success(success);
      if (kind === "reopen") {
        setShowReopen(false);
        setReopenReason("");
      }
      onChanged();
    } catch (err) {
      toast.error(errMessage(err));
    } finally {
      setActionBusy(null);
    }
  };

  const copyRef = async () => {
    if (!ticket) return;
    try {
      await navigator.clipboard.writeText(ticket.referenceNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  if (loading && !ticket) {
    return (
      <div className={`${card} p-8 flex flex-col items-center justify-center gap-3 min-h-[320px]`} role="status">
        <Loader2 className="size-6 animate-spin text-[#8a8a8a]" aria-hidden />
        <p className="text-[13px] text-[#676767]">Loading conversation…</p>
      </div>
    );
  }

  if (loadError || !ticket) {
    return (
      <div className={`${card} p-8 flex flex-col items-center justify-center gap-3 min-h-[320px] text-center`}>
        <p className="text-[14px] font-semibold text-[#1a1917]">We couldn't open this ticket</p>
        <p className="text-[13px] text-[#676767]" role="alert">
          {loadError}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={onBack} className={`${secondaryBtn} lg:hidden`}>
            <ArrowLeft className="size-4" aria-hidden /> Back
          </button>
          <button type="button" onClick={() => load()} className={primaryBtn}>
            <RefreshCw className="size-4" aria-hidden /> Try again
          </button>
        </div>
      </div>
    );
  }

  const resolved = ticket.status === "resolved";
  const helper =
    ticket.ownershipType === "AI"
      ? { label: "Vigil · AI assistant", icon: <ChatbotIcon className="size-4" /> }
      : ticket.assignedAgentName
      ? { label: ticket.assignedAgentName, icon: <UserRound className="size-3.5" aria-hidden /> }
      : { label: "Waiting for an agent", icon: <UserRound className="size-3.5" aria-hidden /> };
  const hasStaffReply = ticket.messages.some((m) => m.senderType === "ai" || m.senderType === "agent");
  const showAiTyping = !resolved && awaitingAi && ticket.ownershipType === "AI" && !typing;
  const showFirstAiTyping = showAiTyping && !hasStaffReply;

  return (
    <section className={`${card} flex flex-col min-h-[560px] lg:h-[calc(100vh-180px)] lg:min-h-[600px] overflow-hidden`} aria-labelledby={`${ids}-title`}>
      {/* Header */}
      <header className="px-4 sm:px-5 pt-4 pb-3 border-b border-[#eee] space-y-3">
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={onBack}
            className={`lg:hidden size-11 -ml-2 rounded-xl flex items-center justify-center text-[#1a1917] hover:bg-[#f6f6f6] shrink-0 ${focusRing}`}
            aria-label="Back to my tickets"
          >
            <ArrowLeft className="size-5" aria-hidden />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={copyRef}
                className={`inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-[#676767] hover:text-[#1a1917] rounded ${focusRing}`}
                aria-label={`Reference ${ticket.referenceNumber}. Copy`}
              >
                {ticket.referenceNumber}
                {copied ? <Check className="size-3" aria-hidden /> : <Copy className="size-3" aria-hidden />}
              </button>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md border ${priorityTone(ticket.priority)}`}>
                {PRIORITY_LABELS[ticket.priority] ?? ticket.priority}
              </span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusTone(ticket)}`}>{friendlyStatus(ticket)}</span>
            </div>
            <h2 id={`${ids}-title`} className="text-[15px] sm:text-[16px] font-semibold text-[#1a1917] mt-1 break-words">
              {ticket.title}
            </h2>
            <p className="text-[12px] text-[#676767] mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span>{ticket.categoryLabel}</span>
              <span aria-hidden>·</span>
              <span>{ticket.moduleLabel}</span>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                {helper.icon}
                {resolved ? "Helped by" : "Helping you:"} <span className="font-semibold text-[#1a1917]">{helper.label}</span>
              </span>
            </p>
          </div>
          {!resolved && (
            <button
              type="button"
              onClick={() => runAction("close", {}, "Glad it's sorted! Ticket marked as resolved.")}
              disabled={actionBusy !== null}
              className={`${secondaryBtn} hidden sm:inline-flex shrink-0`}
            >
              {actionBusy === "close" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CheckCircle2 className="size-4" aria-hidden />}
              My issue is solved
            </button>
          )}
        </div>
        <ProgressTracker ticket={ticket} />
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-4 bg-[#fcfcfc]" aria-live="polite" aria-relevant="additions">
        {justCreated && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <CheckCircle2 className="size-6 text-emerald-700 shrink-0" aria-hidden />
            <div className="flex-1">
              <p className="text-[13px] font-semibold text-emerald-900">Your ticket has been submitted</p>
              <p className="text-[12px] text-emerald-800">Keep this reference number for any follow-up.</p>
            </div>
            <p className="font-mono text-[18px] sm:text-[20px] font-bold text-emerald-950 tracking-wide">{ticket.referenceNumber}</p>
          </div>
        )}

        {/* Original request */}
        <div className="rounded-2xl border border-[#e6e6e6] bg-white px-4 py-3">
          <p className="text-[11px] font-semibold text-[#8a8a8a] uppercase tracking-wide">Your request · {formatTime(ticket.createdAt)}</p>
          <p className="text-[13px] text-[#1a1917] whitespace-pre-wrap break-words mt-1 leading-relaxed">{ticket.description}</p>
          <RemoteAttachments items={ticket.attachments || []} />
        </div>

        {ticket.messages.map((m) => (
          <MessageBubble key={m.id} m={m} />
        ))}

        <AnimatePresence>
          {(typing || showAiTyping) && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <TypingBubble
                label={
                  typing
                    ? `${typing.senderType === "ai" ? "AI assistant" : typing.name} is typing…`
                    : showFirstAiTyping
                    ? "AI is typing… reviewing your issue"
                    : "AI is typing…"
                }
              />
            </motion.div>
          )}
        </AnimatePresence>

        {resolved && (
          <div className="rounded-2xl border border-[#dedede] bg-white px-4 py-4 space-y-3">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="size-5 text-emerald-600 shrink-0 mt-0.5" aria-hidden />
              <div>
                <p className="text-[13px] font-semibold text-[#1a1917]">
                  Resolved{ticket.resolvedAt ? ` · ${formatTime(ticket.resolvedAt)}` : ""}
                </p>
                <p className="text-[13px] text-[#1a1917] whitespace-pre-wrap mt-1">
                  {ticket.resolution || "This ticket was marked as resolved."}
                </p>
              </div>
            </div>

            {ticket.rating ? (
              <div className="border-t border-[#eee] pt-3">
                <p className="text-[12px] font-semibold text-[#1a1917]">Your rating</p>
                <div className="flex gap-0.5 mt-1" aria-label={`${ticket.rating} out of 5 stars`}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star key={n} className={`size-5 ${n <= (ticket.rating ?? 0) ? "fill-amber-400 text-amber-400" : "text-[#dedede]"}`} aria-hidden />
                  ))}
                </div>
                {ticket.ratingComment && <p className="text-[12px] text-[#676767] mt-1">"{ticket.ratingComment}"</p>}
              </div>
            ) : (
              <form
                className="border-t border-[#eee] pt-3 space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!rating) return;
                  runAction("rate", { rating, ...(ratingComment.trim() ? { comment: ratingComment.trim() } : {}) }, "Thanks for your feedback!");
                }}
              >
                <p className="text-[13px] font-semibold text-[#1a1917]">How was your support experience?</p>
                <StarRating value={rating} onChange={setRating} disabled={actionBusy === "rate"} />
                <label htmlFor={`${ids}-rc`} className="sr-only">
                  Optional comment
                </label>
                <textarea
                  id={`${ids}-rc`}
                  value={ratingComment}
                  onChange={(e) => setRatingComment(e.target.value)}
                  rows={2}
                  maxLength={1000}
                  placeholder="Anything we could do better? (optional)"
                  className={`${fieldCls} py-2 resize-none`}
                />
                <button type="submit" className={primaryBtn} disabled={!rating || actionBusy !== null}>
                  {actionBusy === "rate" && <Loader2 className="size-4 animate-spin" aria-hidden />}
                  Submit rating
                </button>
              </form>
            )}

            {ticket.canReopen && (
              <div className="border-t border-[#eee] pt-3">
                {!showReopen ? (
                  <button type="button" onClick={() => setShowReopen(true)} className={secondaryBtn}>
                    <RotateCcw className="size-4" aria-hidden />
                    Reopen ticket
                  </button>
                ) : (
                  <form
                    className="space-y-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (reopenReason.trim().length < 3) return;
                      runAction("reopen", { reason: reopenReason.trim() }, "Ticket reopened");
                    }}
                  >
                    <label htmlFor={`${ids}-rr`} className="block text-[12px] font-semibold text-[#1a1917]">
                      Why are you reopening this ticket?
                    </label>
                    <textarea
                      id={`${ids}-rr`}
                      value={reopenReason}
                      onChange={(e) => setReopenReason(e.target.value)}
                      rows={2}
                      maxLength={1000}
                      placeholder="e.g. The camera problem came back during my next exam"
                      className={`${fieldCls} py-2 resize-none`}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button type="submit" className={primaryBtn} disabled={reopenReason.trim().length < 3 || actionBusy !== null}>
                        {actionBusy === "reopen" && <Loader2 className="size-4 animate-spin" aria-hidden />}
                        Reopen
                      </button>
                      <button type="button" className={secondaryBtn} onClick={() => setShowReopen(false)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Composer */}
      {!resolved && (
        <div className="border-t border-[#eee] px-3 sm:px-4 py-3 bg-white space-y-2">
          <LocalFilePreviews files={files} onRemove={(i) => setFiles((prev) => prev.filter((_, idx) => idx !== i))} />
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={files.length >= LIMITS.messageFiles || sending}
              className={`size-11 rounded-xl border border-[#dedede] flex items-center justify-center text-[#676767] hover:bg-[#f6f6f6] disabled:opacity-40 shrink-0 ${focusRing}`}
              aria-label={`Attach files (${files.length} of ${LIMITS.messageFiles})`}
            >
              <Paperclip className="size-4" aria-hidden />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED_EXT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                const picked = e.target.files;
                setFiles((prev) => addFiles(prev, picked, LIMITS.messageFiles));
                e.target.value = "";
              }}
            />
            <label htmlFor={`${ids}-composer`} className="sr-only">
              Message
            </label>
            <textarea
              id={`${ids}-composer`}
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              onBlur={() => emitTyping(false)}
              rows={1}
              maxLength={5000}
              placeholder={ticket.ownershipType === "AI" ? "Reply to the AI assistant…" : "Write a message…"}
              className={`${fieldCls} py-2.5 resize-none min-h-[44px] max-h-40 flex-1`}
              aria-describedby={`${ids}-composer-hint`}
            />
            <button
              type="button"
              onClick={send}
              disabled={sending || (!draft.trim() && files.length === 0)}
              className={`${primaryBtn} px-3 sm:px-4 shrink-0`}
              aria-label="Send message"
            >
              {sending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
              <span className="hidden sm:inline">Send</span>
            </button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p id={`${ids}-composer-hint`} className="text-[11px] text-[#8a8a8a]">
              Enter to send · Shift+Enter for a new line · up to {LIMITS.messageFiles} files
            </p>
            <button
              type="button"
              onClick={() => runAction("close", {}, "Glad it's sorted! Ticket marked as resolved.")}
              disabled={actionBusy !== null}
              className={`sm:hidden inline-flex items-center gap-1 min-h-[44px] px-2 text-[12px] font-semibold text-[#1a1917] rounded-lg ${focusRing}`}
            >
              <CheckCircle2 className="size-4" aria-hidden />
              My issue is solved
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
