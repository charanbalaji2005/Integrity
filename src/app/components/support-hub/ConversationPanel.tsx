import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRightLeft,
  BadgeCheck,
  Bot,
  CheckCircle2,
  FileText,
  Flag,
  Hand,
  Loader2,
  Lock,
  MessageSquare,
  PanelRight,
  Paperclip,
  Send,
  ShieldAlert,
  Sparkles,
  StickyNote,
  Timer,
  Undo2,
  X,
} from "lucide-react";
import { errorMessage, supportApi } from "./api";
import { useSupportSocket } from "./socket";
import type { Attachment, InternalNote, StaffProfile, SupportMessage, TicketDetail } from "./types";
import {
  EmptyState,
  ErrorBlock,
  OwnershipBadge,
  PriorityBadge,
  Spinner,
  StatusChip,
  btnIcon,
  btnPrimary,
  btnSecondary,
  cx,
  focusRing,
  formatBytes,
  formatDateTime,
  formatTime,
} from "./ui";

export type ActionKind = "resolve" | "escalate" | "reassign" | "priority" | "return_to_ai" | "finding";

const ALLOWED_FILE_TYPES = ".png,.jpg,.jpeg,.webp,.pdf,.txt";
const MAX_FILES = 3;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

type TimelineItem = { kind: "message"; at: number; message: SupportMessage } | { kind: "note"; at: number; note: InternalNote };

export function ConversationPanel({
  ticket,
  loading,
  error,
  onRetry,
  me,
  showBack,
  onBack,
  onAction,
  onAccept,
  accepting,
  onToggleContext,
  contextOpen,
  onOpenCopilot,
  copilotOpen,
  typingName,
  injection,
  onMessageSent,
  onNoteCreated,
}: {
  ticket: TicketDetail | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  me: StaffProfile | null;
  showBack: boolean;
  onBack: () => void;
  onAction: (kind: ActionKind, prefill?: string) => void;
  onAccept: () => void;
  accepting: boolean;
  onToggleContext: () => void;
  contextOpen: boolean;
  onOpenCopilot: () => void;
  copilotOpen: boolean;
  typingName: string | null;
  injection: { text: string; nonce: number } | null;
  onMessageSent: (m: SupportMessage) => void;
  onNoteCreated: (n: InternalNote) => void;
}) {
  if (!ticket) {
    if (error) return <ErrorBlock message={error} onRetry={onRetry} />;
    if (loading) return <Spinner label="Loading conversation" />;
    return (
      <div className="h-full flex items-center justify-center">
        <EmptyState
          icon={MessageSquare}
          title="No ticket selected"
          description="Choose a ticket from the queue to read the conversation, review student context and respond."
        />
      </div>
    );
  }
  return (
    <TicketConversation
      key={ticket.id}
      ticket={ticket}
      loading={loading}
      me={me}
      showBack={showBack}
      onBack={onBack}
      onAction={onAction}
      onAccept={onAccept}
      accepting={accepting}
      onToggleContext={onToggleContext}
      contextOpen={contextOpen}
      onOpenCopilot={onOpenCopilot}
      copilotOpen={copilotOpen}
      typingName={typingName}
      injection={injection}
      onMessageSent={onMessageSent}
      onNoteCreated={onNoteCreated}
    />
  );
}

function TicketConversation({
  ticket,
  loading,
  me,
  showBack,
  onBack,
  onAction,
  onAccept,
  accepting,
  onToggleContext,
  contextOpen,
  onOpenCopilot,
  copilotOpen,
  typingName,
  injection,
  onMessageSent,
  onNoteCreated,
}: {
  ticket: TicketDetail;
  loading: boolean;
  me: StaffProfile | null;
  showBack: boolean;
  onBack: () => void;
  onAction: (kind: ActionKind, prefill?: string) => void;
  onAccept: () => void;
  accepting: boolean;
  onToggleContext: () => void;
  contextOpen: boolean;
  onOpenCopilot: () => void;
  copilotOpen: boolean;
  typingName: string | null;
  injection: { text: string; nonce: number } | null;
  onMessageSent: (m: SupportMessage) => void;
  onNoteCreated: (n: InternalNote) => void;
}) {
  const p = ticket.permissions;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [notesOnly, setNotesOnly] = useState(false);

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [
      ...ticket.messages.map((m) => ({ kind: "message" as const, at: new Date(m.createdAt).getTime(), message: m })),
      ...(ticket.internalNotes ?? []).map((n) => ({ kind: "note" as const, at: new Date(n.createdAt).getTime(), note: n })),
    ];
    items.sort((a, b) => a.at - b.at);
    return notesOnly ? items.filter((i) => i.kind === "note") : items;
  }, [ticket.messages, ticket.internalNotes, notesOnly]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [timeline.length, typingName]);

  const offeredToMe = ticket.status === "pending_acceptance" && !!p?.canAccept;
  const claimable = ticket.status === "unassigned" && !!p?.canAccept;
  const noteCount = ticket.internalNotes?.length ?? 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-3 sm:px-4 py-3 border-b border-[#dedede]/60 bg-[#fafafa] shrink-0 space-y-2.5">
        <div className="flex items-start gap-2">
          {showBack && (
            <button type="button" onClick={onBack} aria-label="Back to ticket list" className={cx(btnIcon, "-ml-1 shrink-0")}>
              <ArrowLeft className="size-5" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-mono font-bold text-[#8a8a8a]">{ticket.referenceNumber}</span>
              <StatusChip status={ticket.status} />
              <OwnershipBadge ownership={ticket.ownershipType} />
              {ticket.blocksExam && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                  <ShieldAlert className="size-3" aria-hidden /> Blocks exam
                </span>
              )}
              {loading && <Loader2 className="size-3.5 animate-spin text-[#a2a2a2]" aria-label="Refreshing" />}
            </div>
            <h2 className="text-sm sm:text-[15px] font-bold text-[#1a1917] leading-snug mt-1 line-clamp-2">{ticket.title}</h2>
            <p className="text-[11px] text-[#676767] mt-0.5 truncate">
              {ticket.studentName} · {ticket.categoryLabel} · {ticket.moduleLabel} · Assigned to{" "}
              <span className="font-semibold">{ticket.assignedAgentName || "nobody"}</span>
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {p?.canChangePriority ? (
              <button
                type="button"
                onClick={() => onAction("priority")}
                className={cx("inline-flex items-center gap-1 min-h-11 px-2 rounded-xl hover:bg-white border border-transparent hover:border-[#dedede] cursor-pointer", focusRing)}
                aria-label={`Priority ${ticket.priority}. Change priority`}
                title="Change priority"
              >
                <PriorityBadge priority={ticket.priority} withLabel />
              </button>
            ) : (
              <span className="px-2">
                <PriorityBadge priority={ticket.priority} withLabel />
              </span>
            )}
            <button
              type="button"
              onClick={onToggleContext}
              aria-pressed={contextOpen}
              aria-label="Toggle student context panel"
              title="Student context"
              className={cx(btnIcon, contextOpen && "bg-[#1a1917] text-white hover:bg-black hover:text-white")}
            >
              <PanelRight className="size-5" />
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 -mx-1 px-1" role="toolbar" aria-label="Ticket actions">
          {(offeredToMe || claimable) && (
            <button type="button" onClick={onAccept} disabled={accepting} className={cx(btnPrimary, "bg-emerald-600 hover:bg-emerald-700 shrink-0")}>
              {accepting ? <Loader2 className="size-4 animate-spin" /> : <Hand className="size-4" />}
              {claimable ? "Claim ticket" : "Accept ticket"}
            </button>
          )}
          <button
            type="button"
            onClick={onOpenCopilot}
            aria-pressed={copilotOpen}
            className={cx(btnSecondary, "shrink-0 border-indigo-200 text-indigo-700 hover:bg-indigo-50", copilotOpen && "bg-indigo-50")}
          >
            <Sparkles className="size-4" /> AI Copilot
          </button>
          {p?.canResolve && (
            <button type="button" onClick={() => onAction("resolve")} className={cx(btnSecondary, "shrink-0")}>
              <CheckCircle2 className="size-4" /> Resolve
            </button>
          )}
          {p?.canEscalate && (
            <button type="button" onClick={() => onAction("escalate")} className={cx(btnSecondary, "shrink-0")}>
              <Flag className="size-4" /> Escalate
            </button>
          )}
          {p?.canReassign && (
            <button type="button" onClick={() => onAction("reassign")} className={cx(btnSecondary, "shrink-0")}>
              <ArrowRightLeft className="size-4" /> {p.isSupervisor ? "Reassign" : "Release"}
            </button>
          )}
          {p?.canReturnToAi && (
            <button type="button" onClick={() => onAction("return_to_ai")} className={cx(btnSecondary, "shrink-0")}>
              <Undo2 className="size-4" /> Return to AI
            </button>
          )}
        </div>
      </div>

      {ticket.status === "pending_acceptance" && ticket.assignment && ticket.assignment.status === "pending" && (
        <PendingBanner
          staffName={ticket.assignment.staffName}
          timeoutAt={ticket.assignment.timeoutAt}
          forMe={offeredToMe}
          accepting={accepting}
          onAccept={onAccept}
        />
      )}

      {/* Timeline */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-1.5 border-b border-[#dedede]/40 bg-white shrink-0">
        <div className="flex gap-1" role="tablist" aria-label="Timeline filter">
          <button
            type="button"
            role="tab"
            aria-selected={!notesOnly}
            onClick={() => setNotesOnly(false)}
            className={cx("min-h-9 px-3 rounded-lg text-[11px] font-bold cursor-pointer", focusRing, !notesOnly ? "bg-[#ececec] text-[#1a1917]" : "text-[#8a8a8a] hover:text-[#1a1917]")}
          >
            Conversation
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={notesOnly}
            onClick={() => setNotesOnly(true)}
            className={cx("min-h-9 px-3 rounded-lg text-[11px] font-bold cursor-pointer", focusRing, notesOnly ? "bg-amber-100 text-amber-900" : "text-[#8a8a8a] hover:text-[#1a1917]")}
          >
            Internal notes {noteCount > 0 && <span className="opacity-70">({noteCount})</span>}
          </button>
        </div>
        <span className="text-[10px] text-[#a2a2a2] hidden sm:block">Opened {formatDateTime(ticket.createdAt)}</span>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-5 py-4 space-y-3 bg-[#fcfcfc]" aria-live="polite" aria-label="Conversation">
        {!notesOnly && (
          <div className="rounded-xl border border-[#dedede] bg-white p-3.5">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#8a8a8a]">Original request · {ticket.studentName}</span>
              <span className="text-[10px] text-[#a2a2a2]">{formatTime(ticket.createdAt)}</span>
            </div>
            <p className="text-[13px] text-[#1a1917] whitespace-pre-wrap leading-relaxed">{ticket.description}</p>
            {ticket.attachments.length > 0 && <AttachmentList attachments={ticket.attachments} />}
          </div>
        )}

        {timeline.length === 0 && notesOnly && (
          <p className="text-center text-xs text-[#8a8a8a] py-8">No internal notes yet. Use the composer's "Internal note" mode to add one.</p>
        )}

        {timeline.map((item) =>
          item.kind === "note" ? <NoteCard key={`n-${item.note.id}`} note={item.note} /> : <MessageBubble key={`m-${item.message.id}`} message={item.message} />
        )}

        {!notesOnly && ticket.status === "resolved" && ticket.resolution && (
          <div className="rounded-xl p-3.5 bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
            <span className="font-bold block mb-1">Resolution · {formatDateTime(ticket.resolvedAt)}</span>
            <span className="whitespace-pre-wrap">{ticket.resolution}</span>
            {ticket.rating !== null && (
              <span className="block mt-2 text-emerald-800">
                Student rating: <strong>{ticket.rating}/5</strong>
                {ticket.ratingComment ? ` — “${ticket.ratingComment}”` : ""}
              </span>
            )}
          </div>
        )}

        {typingName && (
          <div className="flex items-center gap-2 text-[11px] text-[#8a8a8a]" role="status">
            <span className="flex gap-0.5" aria-hidden>
              <span className="size-1.5 rounded-full bg-[#b2b2b2] animate-bounce [animation-delay:-0.2s]" />
              <span className="size-1.5 rounded-full bg-[#b2b2b2] animate-bounce [animation-delay:-0.1s]" />
              <span className="size-1.5 rounded-full bg-[#b2b2b2] animate-bounce" />
            </span>
            {typingName} is typing…
          </div>
        )}
      </div>

      <Composer ticket={ticket} me={me} injection={injection} onMessageSent={onMessageSent} onNoteCreated={onNoteCreated} />
    </div>
  );
}

function PendingBanner({
  staffName,
  timeoutAt,
  forMe,
  accepting,
  onAccept,
}: {
  staffName: string;
  timeoutAt: string | null;
  forMe: boolean;
  accepting: boolean;
  onAccept: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const remaining = timeoutAt ? Math.max(0, Math.floor((new Date(timeoutAt).getTime() - now) / 1000)) : null;
  const mm = remaining !== null ? Math.floor(remaining / 60) : 0;
  const ss = remaining !== null ? String(remaining % 60).padStart(2, "0") : "00";
  return (
    <div
      className={cx(
        "flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-2.5 border-b text-xs shrink-0",
        forMe ? "bg-sky-50 border-sky-200 text-sky-900" : "bg-[#f6f6f6] border-[#dedede] text-[#676767]"
      )}
      role="status"
    >
      <Timer className="size-4 shrink-0" aria-hidden />
      <span className="flex-1">
        {forMe ? (
          <>
            <strong>This ticket is offered to you.</strong> Accept it to start replying.
          </>
        ) : (
          <>
            Awaiting acceptance by <strong>{staffName}</strong>.
          </>
        )}
        {remaining !== null && (
          <span className="ml-1 font-mono font-bold tabular-nums">
            {remaining > 0 ? `${mm}:${ss} left` : "Timing out…"}
          </span>
        )}
      </span>
      {forMe && (
        <button type="button" onClick={onAccept} disabled={accepting} className={cx(btnPrimary, "bg-sky-700 hover:bg-sky-800 min-h-9")}>
          {accepting && <Loader2 className="size-3.5 animate-spin" />} Accept now
        </button>
      )}
    </div>
  );
}

function AttachmentList({ attachments, dark = false }: { attachments: Attachment[]; dark?: boolean }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {attachments.map((a) =>
        a.mimeType.startsWith("image/") ? (
          <a
            key={a.id}
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cx("block rounded-lg overflow-hidden border", dark ? "border-white/20" : "border-[#dedede]", focusRing)}
            title={`${a.fileName} (${formatBytes(a.size)})`}
          >
            <img src={a.url} alt={a.fileName} className="max-h-40 max-w-[220px] object-cover" loading="lazy" />
          </a>
        ) : (
          <a
            key={a.id}
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cx(
              "inline-flex items-center gap-1.5 min-h-9 px-2.5 rounded-lg border text-[11px] font-semibold max-w-[240px]",
              dark ? "border-white/20 text-white hover:bg-white/10" : "border-[#dedede] bg-white text-[#1a1917] hover:bg-[#f6f6f6]",
              focusRing
            )}
          >
            <FileText className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{a.fileName}</span>
            <span className="opacity-60 shrink-0">{formatBytes(a.size)}</span>
          </a>
        )
      )}
    </div>
  );
}

function MessageBubble({ message: m }: { message: SupportMessage }) {
  if (m.senderType === "system" || m.messageType === "system" || m.messageType === "handoff") {
    return (
      <div className="flex justify-center">
        <span
          className={cx(
            "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold border max-w-[90%] text-center",
            m.messageType === "handoff" ? "bg-sky-50 text-sky-800 border-sky-200" : "bg-[#f1f1f1] text-[#676767] border-[#dedede]"
          )}
        >
          {m.messageType === "handoff" && <ArrowRightLeft className="size-3 shrink-0" aria-hidden />}
          <span>{m.content}</span>
          <span className="opacity-60 shrink-0">· {formatTime(m.createdAt)}</span>
        </span>
      </div>
    );
  }
  const isAgent = m.senderType === "agent";
  const isAI = m.senderType === "ai";
  return (
    <div className={cx("flex gap-2 max-w-[88%] sm:max-w-[75%]", isAgent ? "ml-auto flex-row-reverse" : "mr-auto")}>
      <div
        className={cx(
          "size-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5",
          isAgent ? "bg-[#1a1917] text-white" : isAI ? "bg-indigo-600 text-white" : "bg-[#ececec] text-[#676767]"
        )}
        aria-hidden
      >
        {isAI ? <Bot className="size-3.5" /> : (m.senderName || "?").charAt(0).toUpperCase()}
      </div>
      <div
        className={cx(
          "rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed",
          isAgent
            ? "bg-[#1a1917] text-white rounded-tr-md"
            : isAI
            ? "bg-indigo-50 text-[#1a1917] border border-indigo-100 rounded-tl-md"
            : "bg-white text-[#1a1917] border border-[#dedede] rounded-tl-md"
        )}
      >
        <div className={cx("flex items-center gap-1.5 mb-0.5 text-[10.5px] font-bold", isAgent ? "text-white/70" : "text-[#8a8a8a]")}>
          {isAI ? (
            <span className="inline-flex items-center gap-1 text-indigo-700">
              <Sparkles className="size-3" aria-hidden /> AI assistant
            </span>
          ) : (
            <span>{m.senderName}</span>
          )}
          <span className="font-normal opacity-80">· {formatTime(m.createdAt)}</span>
        </div>
        <p className="whitespace-pre-wrap break-words">{m.content}</p>
        {m.attachments?.length > 0 && <AttachmentList attachments={m.attachments} dark={isAgent} />}
      </div>
    </div>
  );
}

function NoteCard({ note }: { note: InternalNote }) {
  const finding = note.kind === "verified_finding";
  return (
    <div className={cx("rounded-xl border-l-4 border p-3 text-[12.5px]", finding ? "bg-emerald-50 border-emerald-300 border-l-emerald-600" : "bg-amber-50 border-amber-200 border-l-amber-500")}>
      <div className="flex items-center gap-1.5 flex-wrap mb-1">
        {finding ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-emerald-800">
            <BadgeCheck className="size-3.5" aria-hidden /> Verified finding
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-amber-800">
            <Lock className="size-3" aria-hidden /> Internal — not visible to student
          </span>
        )}
        <span className="text-[10.5px] text-[#676767]">
          · {note.staffName} · {formatTime(note.createdAt)}
        </span>
      </div>
      <p className="whitespace-pre-wrap text-[#1a1917]">{note.content}</p>
    </div>
  );
}

function Composer({
  ticket,
  me,
  injection,
  onMessageSent,
  onNoteCreated,
}: {
  ticket: TicketDetail;
  me: StaffProfile | null;
  injection: { text: string; nonce: number } | null;
  onMessageSent: (m: SupportMessage) => void;
  onNoteCreated: (n: InternalNote) => void;
}) {
  const { socket } = useSupportSocket();
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTyping = useRef(false);
  const lastNonce = useRef<number | null>(null);

  const canMessage = !!ticket.permissions?.canMessage;
  const replyDisabledReason = !canMessage
    ? ticket.status === "resolved"
      ? "This ticket is resolved. Replies are closed."
      : ticket.status === "pending_acceptance" || ticket.status === "unassigned"
      ? "Accept the ticket to reply to the student."
      : ticket.ownershipType === "AI"
      ? "The AI assistant owns this ticket. Accept or claim it to reply."
      : `Only the assigned representative${ticket.assignedAgentName ? ` (${ticket.assignedAgentName})` : ""} can reply.`
    : null;
  const disabled = mode === "reply" && !canMessage;

  useEffect(() => {
    if (!injection || injection.nonce === lastNonce.current) return;
    lastNonce.current = injection.nonce;
    setMode("reply");
    setText((t) => (t.trim() ? `${t.trim()}\n\n${injection.text}` : injection.text));
    setTimeout(() => taRef.current?.focus(), 50);
  }, [injection]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`;
  }, [text]);

  const emitTyping = (value: boolean) => {
    if (!socket || mode !== "reply") return;
    if (isTyping.current === value) return;
    isTyping.current = value;
    socket.emit("chat:typing", { ticketId: ticket.id, isTyping: value });
  };

  useEffect(
    () => () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (isTyping.current && socket) socket.emit("chat:typing", { ticketId: ticket.id, isTyping: false });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const onChange = (v: string) => {
    setText(v);
    if (mode !== "reply" || !canMessage) return;
    emitTyping(v.length > 0);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => emitTyping(false), 2500);
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= MAX_FILES) {
        toast.error(`You can attach up to ${MAX_FILES} files.`);
        break;
      }
      if (f.size > MAX_FILE_BYTES) {
        toast.error(`${f.name} is larger than 10 MB.`);
        continue;
      }
      next.push(f);
    }
    setFiles(next);
    if (fileRef.current) fileRef.current.value = "";
  };

  const send = async () => {
    const content = text.trim();
    if (sending || disabled) return;
    if (!content && (mode === "note" || files.length === 0)) return;
    setSending(true);
    try {
      if (mode === "note") {
        const note = await supportApi<InternalNote>(`/tickets/${ticket.id}/internal-notes`, { method: "POST", body: { content, kind: "note" } });
        onNoteCreated(note);
        toast.success("Internal note added");
      } else {
        const fd = new FormData();
        fd.append("content", content);
        files.forEach((f) => fd.append("files", f));
        const msg = await supportApi<SupportMessage>(`/tickets/${ticket.id}/messages`, { method: "POST", body: fd });
        onMessageSent(msg);
        emitTyping(false);
      }
      setText("");
      setFiles([]);
    } catch (err) {
      toast.error(errorMessage(err, "Could not send"));
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className={cx("border-t shrink-0 p-2.5 sm:p-3", mode === "note" ? "bg-amber-50/60 border-amber-200" : "bg-white border-[#dedede]/60")}>
      <div className="flex items-center gap-1 mb-2" role="radiogroup" aria-label="Composer mode">
        <button
          type="button"
          role="radio"
          aria-checked={mode === "reply"}
          onClick={() => setMode("reply")}
          className={cx("inline-flex items-center gap-1.5 min-h-9 px-3 rounded-lg text-[11px] font-bold cursor-pointer", focusRing, mode === "reply" ? "bg-[#1a1917] text-white" : "text-[#676767] hover:bg-[#f1f1f1]")}
        >
          <MessageSquare className="size-3.5" /> Reply to student
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mode === "note"}
          onClick={() => {
            setMode("note");
            emitTyping(false);
          }}
          className={cx("inline-flex items-center gap-1.5 min-h-9 px-3 rounded-lg text-[11px] font-bold cursor-pointer", focusRing, mode === "note" ? "bg-amber-500 text-white" : "text-[#676767] hover:bg-[#f1f1f1]")}
        >
          <StickyNote className="size-3.5" /> Internal note
        </button>
        {me && <span className="ml-auto text-[10px] text-[#a2a2a2] hidden sm:block">as {me.name}</span>}
      </div>

      {disabled ? (
        <div className="flex items-center gap-2 min-h-11 px-3 rounded-xl bg-[#f6f6f6] border border-dashed border-[#dedede] text-xs text-[#676767]" role="note">
          <AlertTriangle className="size-4 shrink-0 text-amber-600" aria-hidden />
          <span>{replyDisabledReason}</span>
          <span className="ml-auto text-[10.5px] text-[#a2a2a2] hidden sm:inline">You can still add an internal note.</span>
        </div>
      ) : (
        <>
          {files.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 mb-2" aria-label="Attachments to send">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="inline-flex items-center gap-1 pl-2 rounded-lg bg-[#f1f1f1] border border-[#dedede] text-[11px] font-semibold max-w-[220px]">
                  <FileText className="size-3 shrink-0" aria-hidden />
                  <span className="truncate">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    aria-label={`Remove ${f.name}`}
                    className={cx("size-8 inline-flex items-center justify-center rounded-lg hover:bg-[#e2e2e2] cursor-pointer", focusRing)}
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-end gap-2">
            {mode === "reply" && (
              <>
                <input ref={fileRef} type="file" multiple accept={ALLOWED_FILE_TYPES} className="sr-only" onChange={(e) => addFiles(e.target.files)} tabIndex={-1} aria-hidden />
                <button type="button" onClick={() => fileRef.current?.click()} aria-label="Attach files" title="Attach files (PNG, JPG, WEBP, PDF, TXT · max 3, 10 MB each)" className={btnIcon}>
                  <Paperclip className="size-4" />
                </button>
              </>
            )}
            <label className="flex-1">
              <span className="sr-only">{mode === "note" ? "Internal note" : "Reply to student"}</span>
              <textarea
                ref={taRef}
                value={text}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder={mode === "note" ? "Write an internal note — only staff can see this…" : "Write a reply to the student…"}
                className={cx(
                  "w-full resize-none min-h-11 max-h-[180px] rounded-xl px-3 py-2.5 text-[13px] text-[#1a1917] placeholder:text-[#a2a2a2] focus:outline-none border",
                  mode === "note" ? "bg-white border-amber-300 focus:border-amber-500" : "bg-[#f6f6f6] border-[#dedede] focus:border-[#1a1917]"
                )}
              />
            </label>
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending || (!text.trim() && (mode === "note" || files.length === 0))}
              aria-label={mode === "note" ? "Save internal note" : "Send reply"}
              className={cx(btnPrimary, "px-3 shrink-0", mode === "note" && "bg-amber-600 hover:bg-amber-700")}
            >
              {sending ? <Loader2 className="size-4 animate-spin" /> : mode === "note" ? <StickyNote className="size-4" /> : <Send className="size-4" />}
              <span className="hidden sm:inline">{mode === "note" ? "Add note" : "Send"}</span>
            </button>
          </div>
          <p className="text-[10px] text-[#a2a2a2] mt-1.5 hidden sm:block">Enter to send · Shift+Enter for a new line</p>
        </>
      )}
    </div>
  );
}
