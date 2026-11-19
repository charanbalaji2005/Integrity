import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  BarChart3,
  BookOpenCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  ClipboardCheck,
  Copy,
  FileDown,
  FilePlus2,
  FileText,
  GraduationCap,
  History,
  ListChecks,
  Loader2,
  Lock,
  MessageSquarePlus,
  Mic,
  MicOff,
  Paperclip,
  Pencil,
  Pin,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  Square,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "../../utils/api-client";
import { AgentMascot3D, type MascotExpression } from "../mascot/AgentMascot3D";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import {
  type AgentId,
  type AssessmentOption,
  type Attachment,
  type ChatMessage,
  type ConversationSummary,
  type Step,
  streamTurn,
  uploadAttachment,
  vigilApi,
} from "./vigil/vigil-api";
import { exportPdf, exportWord, renderMarkdown, splitQuestions, toBuilderQuestions, type GeneratedQuestion } from "./vigil/vigil-content";

/* ───────────────────────── static config ───────────────────────── */

const AGENT_META: Record<AgentId, { name: string; icon: React.ComponentType<{ className?: string }>; color: string; bg: string; blurb: string }> = {
  question: { name: "Question Agent", icon: ListChecks, color: "text-indigo-600", bg: "bg-indigo-50", blurb: "Questions & papers" },
  integrity: { name: "Integrity Agent", icon: ShieldAlert, color: "text-rose-600", bg: "bg-rose-50", blurb: "Proctoring analysis" },
  analytics: { name: "Analytics Agent", icon: BarChart3, color: "text-emerald-600", bg: "bg-emerald-50", blurb: "Performance insights" },
  grading: { name: "Grading Agent", icon: ClipboardCheck, color: "text-amber-600", bg: "bg-amber-50", blurb: "Rubrics & evaluation" },
  document: { name: "Document Agent", icon: FileText, color: "text-sky-600", bg: "bg-sky-50", blurb: "PDF & document analysis" },
  academic: { name: "Academic Agent", icon: GraduationCap, color: "text-violet-600", bg: "bg-violet-50", blurb: "Syllabus & learning" },
};

const CAPABILITIES: { title: string; subtitle: string; icon: React.ComponentType<{ className?: string }>; prompts: string[] }[] = [
  {
    title: "Generate Questions",
    subtitle: "Create exam questions",
    icon: Wand2,
    prompts: [
      "Generate 5 MCQs and 2 descriptive questions on process scheduling, tagged with Bloom's levels, with answer keys",
      "Create a 60-minute exam blueprint: 40% easy, 40% medium, 20% hard",
      "Review my latest exam's question paper and give it a quality score",
    ],
  },
  {
    title: "Review Integrity",
    subtitle: "Analyze student alerts",
    icon: ShieldAlert,
    prompts: [
      "Show students with more than three suspicious alerts in my latest exam",
      "Which alerts in my latest exam are likely false positives?",
      "Draft an incident report for the student with the lowest integrity score",
    ],
  },
  {
    title: "Exam Analytics",
    subtitle: "Analyze performance",
    icon: BarChart3,
    prompts: [
      "Analyze performance in my latest exam: difficult questions and weak learning outcomes",
      "Compare section performance for my latest exam",
      "Who is taking my exam right now and does anyone need attention?",
    ],
  },
  {
    title: "Evaluate Answers",
    subtitle: "Assist with grading",
    icon: ClipboardCheck,
    prompts: [
      "Create a 10-mark rubric with a model answer for: Explain deadlock prevention",
      "Find unusually similar written answers in my latest exam",
      "Is my latest exam ready to publish?",
    ],
  },
];

const ACCEPT = ".pdf,.docx,.pptx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp";

const relTime = (iso: string) => {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

interface PendingFile {
  key: string;
  name: string;
  pct: number;
  status: "uploading" | "ready" | "error";
  attachment?: Attachment;
  error?: string;
  abort?: () => void;
}

type SpeechCtor = new () => {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: any) => void) | null;
  start: () => void;
  stop: () => void;
};
const SpeechRecognitionImpl: SpeechCtor | undefined =
  typeof window !== "undefined" ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition) : undefined;

/* ───────────────────────── component ───────────────────────── */

/** Vigil — faculty examination copilot. Access is enforced server-side; the UI mirrors it. */
export function FacultyAIChat({ user, onOpenAssessment }: { user: any; onOpenAssessment?: (id: string) => void }) {
  const [eligibility, setEligibility] = useState<{ eligible: boolean; reason?: string } | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [convoLoading, setConvoLoading] = useState(false);
  const [assessments, setAssessments] = useState<AssessmentOption[]>([]);
  const [pinned, setPinned] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ConversationSummary | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [openCapability, setOpenCapability] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recogRef = useRef<InstanceType<SpeechCtor> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const first = user?.name?.split(" ")[0] ?? "Professor";

  /* ── data loading ── */
  useEffect(() => {
    vigilApi
      .status()
      .then(setEligibility)
      .catch((e) => setEligibility({ eligible: false, reason: e.message || "Unable to verify access." }));
  }, []);

  const refreshList = useCallback(async (q?: string) => {
    try {
      setConversations(await vigilApi.list(q));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!eligibility?.eligible) return;
    void refreshList();
    vigilApi.assessments().then(setAssessments).catch(() => {});
  }, [eligibility?.eligible, refreshList]);

  useEffect(() => {
    if (!eligibility?.eligible) return;
    const t = setTimeout(() => void refreshList(search), 250);
    return () => clearTimeout(t);
  }, [search, eligibility?.eligible, refreshList]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: streaming ? "auto" : "smooth" });
  }, [messages, streaming]);

  const openConversation = async (id: string) => {
    if (streaming) return;
    setActiveId(id);
    setHistoryOpen(false);
    setSuggestions([]);
    setConvoLoading(true);
    try {
      const c = await vigilApi.get(id);
      const names = new Map(c.attachments.map((a) => [a.id, a.fileName]));
      setPinned(c.assessmentId);
      setMessages(
        c.messages.map((m) => {
          const meta = m.meta ? JSON.parse(m.meta) : {};
          return {
            id: m.id,
            role: m.role,
            content: m.content,
            agent: m.agent,
            steps: meta.steps,
            sources: meta.sources,
            model: meta.model,
            createdAt: m.createdAt,
            attachments: (meta.attachmentIds ?? []).map((aid: string) => ({ id: aid, fileName: names.get(aid) ?? "document" })),
          };
        }),
      );
    } catch (e: any) {
      toast.error(e.message);
      setActiveId(null);
    } finally {
      setConvoLoading(false);
    }
  };

  const newConversation = () => {
    if (streaming) return;
    setActiveId(null);
    setMessages([]);
    setSuggestions([]);
    setFiles([]);
    setHistoryOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  /* ── sending ── */
  const runStream = async (conversationId: string, path: string, body: unknown, placeholderId: string) => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStreaming(true);
    setSuggestions([]);
    const patch = (fn: (m: ChatMessage) => ChatMessage) => setMessages((list) => list.map((m) => (m.id === placeholderId ? fn(m) : m)));
    let failed = false;
    try {
      await streamTurn(
        path,
        body,
        {
          onStatus: (s) => patch((m) => ({ ...m, steps: upsertStep(m.steps ?? [], s) })),
          onAgent: (a) => patch((m) => ({ ...m, agent: a.id })),
          onDelta: (t) => patch((m) => ({ ...m, content: m.content + t })),
          onDone: (d) => {
            patch((m) => ({ ...m, id: d.messageId, streaming: false }));
            setSuggestions(d.suggestions ?? []);
          },
          onError: (msg) => {
            failed = true;
            toast.error(msg);
            patch((m) => ({ ...m, streaming: false, content: m.content || `⚠️ ${msg}` }));
          },
        },
        ctrl.signal,
      );
    } catch (e: any) {
      if (ctrl.signal.aborted) {
        // Server saves the partial reply; reload to get real ids.
        setTimeout(() => void openConversation(conversationId), 600);
      } else {
        failed = true;
        toast.error(e.message || "Connection lost.");
        patch((m) => ({ ...m, streaming: false, content: m.content || "⚠️ Connection lost." }));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      void refreshList(search);
      if (failed) setSuggestions([]);
    }
  };

  const send = async (raw: string) => {
    const content = raw.trim();
    if (!content || streaming) return;
    if (files.some((f) => f.status === "uploading")) {
      toast.info("Wait for attachments to finish uploading.");
      return;
    }
    let id = activeId;
    if (!id) {
      try {
        const c = await vigilApi.create(pinned);
        id = c.id;
        setActiveId(id);
      } catch (e: any) {
        toast.error(e.message);
        return;
      }
    }
    const ready = files.filter((f) => f.status === "ready" && f.attachment);
    const placeholderId = `pending-${Date.now()}`;
    setMessages((list) => [
      ...list,
      { id: `u-${Date.now()}`, role: "user", content, attachments: ready.map((f) => ({ id: f.attachment!.id, fileName: f.name })) },
      { id: placeholderId, role: "assistant", content: "", steps: [], streaming: true },
    ]);
    setInput("");
    setFiles([]);
    await runStream(id, `/conversations/${id}/messages`, { content, attachmentIds: ready.map((f) => f.attachment!.id), assessmentId: pinned }, placeholderId);
  };

  const regenerate = async () => {
    if (!activeId || streaming) return;
    const placeholderId = `pending-${Date.now()}`;
    setMessages((list) => {
      const trimmed = list.at(-1)?.role === "assistant" ? list.slice(0, -1) : list;
      return [...trimmed, { id: placeholderId, role: "assistant", content: "", steps: [], streaming: true }];
    });
    await runStream(activeId, `/conversations/${activeId}/regenerate`, {}, placeholderId);
  };

  const stop = () => abortRef.current?.abort();

  /* ── attachments ── */
  const addFiles = (list: FileList | File[]) => {
    for (const file of Array.from(list)) {
      if (files.length >= 5) {
        toast.error("Attach up to 5 files per message.");
        break;
      }
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!ACCEPT.split(",").includes(`.${ext}`)) {
        toast.error(`${file.name}: use PDF, DOCX, PPTX, TXT, MD, CSV or an image.`);
        continue;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`${file.name} is larger than 20 MB.`);
        continue;
      }
      const key = `${file.name}-${Date.now()}-${Math.random()}`;
      const job = uploadAttachment(file, activeId, (pct) => setFiles((fs) => fs.map((f) => (f.key === key ? { ...f, pct } : f))));
      setFiles((fs) => [...fs, { key, name: file.name, pct: 0, status: "uploading", abort: job.abort }]);
      job.promise
        .then((attachment) => setFiles((fs) => fs.map((f) => (f.key === key ? { ...f, status: "ready", pct: 100, attachment } : f))))
        .catch((e) => setFiles((fs) => fs.map((f) => (f.key === key ? { ...f, status: "error", error: e.message } : f))));
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  /* ── voice ── */
  const toggleVoice = () => {
    if (!SpeechRecognitionImpl) return;
    if (listening) {
      recogRef.current?.stop();
      return;
    }
    const r = new SpeechRecognitionImpl();
    r.lang = navigator.language || "en-US";
    r.continuous = true;
    r.interimResults = true;
    const base = input ? `${input.trimEnd()} ` : "";
    r.onresult = (e: any) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      setInput((base + text).slice(0, 8000));
    };
    r.onend = () => setListening(false);
    r.onerror = (e: any) => {
      setListening(false);
      if (e?.error === "not-allowed") toast.error("Microphone permission was denied.");
    };
    recogRef.current = r;
    r.start();
    setListening(true);
  };
  useEffect(() => () => recogRef.current?.stop(), []);

  /* ── conversation management ── */
  const saveRename = async () => {
    if (!renaming) return;
    const title = renaming.title.trim();
    setRenaming(null);
    if (!title) return;
    try {
      await vigilApi.update(renaming.id, { title });
      setConversations((cs) => cs.map((c) => (c.id === renaming.id ? { ...c, title } : c)));
    } catch (e: any) {
      toast.error(e.message);
    }
  };
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await vigilApi.remove(deleteTarget.id);
      setConversations((cs) => cs.filter((c) => c.id !== deleteTarget.id));
      if (deleteTarget.id === activeId) newConversation();
      toast.success("Conversation deleted");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDeleteTarget(null);
    }
  };
  const changePin = async (id: string | null) => {
    setPinned(id);
    if (activeId) await vigilApi.update(activeId, { assessmentId: id }).catch((e) => toast.error(e.message));
  };

  const createDraft = async (questions: GeneratedQuestion[]) => {
    const payload = toBuilderQuestions(questions);
    const minutes = Math.max(10, Math.ceil(payload.reduce((s, q) => s + (q.type === "coding" ? 15 : q.type === "descriptive" ? 8 : q.type === "short-answer" ? 3 : 1.5), 0) / 5) * 5);
    try {
      const res = await apiFetch("/api/assessments", {
        method: "POST",
        body: JSON.stringify({
          title: `Vigil draft — ${new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`,
          description: "Generated with Vigil. Review every question before publishing.",
          duration: minutes,
          published: false,
          questions: payload,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || "Could not create the draft.");
      toast.success(`Draft assessment created with ${payload.length} questions.`, {
        action: onOpenAssessment ? { label: "Open in builder", onClick: () => onOpenAssessment(body.data.id) } : undefined,
      });
      vigilApi.assessments().then(setAssessments).catch(() => {});
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const lastAssistantIdx = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === "assistant") return i;
    return -1;
  }, [messages]);
  const liveAgent = streaming ? messages.at(-1)?.agent : null;
  const expression: MascotExpression = streaming ? "think" : messages.length === 0 ? "wave" : "happy";
  const pinnedTitle = assessments.find((a) => a.id === pinned)?.title;

  /* ── gates ── */
  if (eligibility === null) {
    return (
      <div className="flex h-[60vh] items-center justify-center gap-2 text-sm text-[#8a8a8a]">
        <Loader2 className="size-4 animate-spin" /> Checking access…
      </div>
    );
  }
  if (!eligibility.eligible) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-3xl border border-[#dedede] bg-white p-8 text-center">
        <div className="relative h-40 w-40">
          <AgentMascot3D accent="#f59e0b" expression="alert" distance={6} trackPage={false} />
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-700">
          <Lock className="size-3.5" /> Verified faculty only
        </span>
        <h2 className="text-lg font-extrabold text-[#1a1917]">AI Assistant is locked</h2>
        <p className="text-sm text-[#676767]">{eligibility.reason}</p>
      </div>
    );
  }

  /* ── history sidebar ── */
  const historyPanel = (
    <div className="flex h-full flex-col">
      <div className="space-y-2 p-3">
        <button
          type="button"
          onClick={newConversation}
          disabled={streaming}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1a1917] px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-black disabled:opacity-50"
        >
          <MessageSquarePlus className="size-4" /> New conversation
        </button>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#9a9a9a]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations"
            aria-label="Search conversations"
            className="h-8 w-full rounded-lg border border-[#e4e4e4] bg-white pl-8 pr-2 text-[12.5px] outline-none focus:border-[#1a1917]"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {listLoading ? (
          <div className="space-y-2 px-1">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-[#f0f0f0]" />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <p className="px-2 py-6 text-center text-[12px] text-[#9a9a9a]">{search ? "No conversations match." : "Your conversations appear here."}</p>
        ) : (
          <ul className="space-y-0.5">
            {conversations.map((c) => (
              <li key={c.id} className={`group flex items-center gap-1 rounded-lg ${c.id === activeId ? "bg-[#efefef]" : "hover:bg-[#f5f5f5]"}`}>
                {renaming?.id === c.id ? (
                  <input
                    autoFocus
                    value={renaming.title}
                    onChange={(e) => setRenaming({ id: c.id, title: e.target.value.slice(0, 80) })}
                    onBlur={() => void saveRename()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void saveRename();
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    aria-label="Conversation title"
                    className="m-1 h-7 w-full rounded-md border border-[#1a1917] px-2 text-[12.5px] outline-none"
                  />
                ) : (
                  <>
                    <button type="button" onClick={() => void openConversation(c.id)} className="min-w-0 flex-1 px-2.5 py-2 text-left">
                      <span className="block truncate text-[12.5px] font-medium text-[#1a1917]">{c.title}</span>
                      <span className="flex items-center gap-1 text-[10.5px] text-[#9a9a9a]">
                        {c.assessmentId && <Pin className="size-2.5" />}
                        {relTime(c.updatedAt)} · {c._count.messages} msgs
                      </span>
                    </button>
                    <div className="flex shrink-0 pr-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                      <button type="button" aria-label={`Rename ${c.title}`} onClick={() => setRenaming({ id: c.id, title: c.title })} className="rounded p-1 text-[#8a8a8a] hover:bg-white hover:text-[#1a1917]">
                        <Pencil className="size-3.5" />
                      </button>
                      <button type="button" aria-label={`Delete ${c.title}`} onClick={() => setDeleteTarget(c)} className="rounded p-1 text-[#8a8a8a] hover:bg-white hover:text-rose-600">
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-white">
      {/* History (desktop) */}
      <aside className="hidden w-[260px] shrink-0 border-r border-[#ececec] bg-[#fafafa] md:block" aria-label="Chat history">
        {historyPanel}
      </aside>
      {/* History (mobile drawer) */}
      {historyOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden" role="dialog" aria-modal="true" aria-label="Chat history">
          <div className="h-full w-[82vw] max-w-xs bg-[#fafafa] shadow-xl">{historyPanel}</div>
          <button type="button" aria-label="Close history" className="flex-1 bg-black/30" onClick={() => setHistoryOpen(false)} />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ececec] px-4 py-2.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setHistoryOpen(true)} aria-label="Open chat history" className="rounded-lg p-1.5 text-[#676767] hover:bg-[#f4f4f4] md:hidden">
              <History className="size-4" />
            </button>
            <div className="relative size-12 shrink-0" aria-hidden="true">
              <AgentMascot3D accent="#4f6bff" expression={expression} distance={5.6} trackPage={false} />
            </div>
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-extrabold text-[#1a1917]">
                Vigil AI Assistant
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                  <span className="size-1.5 rounded-full bg-emerald-500" /> Online
                </span>
              </p>
              <p className="truncate text-[11.5px] text-[#8a8a8a]" aria-live="polite">
                {liveAgent ? `${AGENT_META[liveAgent].name} is working…` : streaming ? "Orchestrator is routing your request…" : "Multi-agent examination copilot"}
              </p>
            </div>
          </div>
          <label className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-[#676767]">
            <Pin className="size-3.5 shrink-0" />
            <span className="hidden sm:inline">Exam context</span>
            <select
              value={pinned ?? ""}
              onChange={(e) => void changePin(e.target.value || null)}
              disabled={streaming}
              aria-label="Pin an exam as context"
              className="h-8 max-w-[220px] truncate rounded-lg border border-[#e4e4e4] bg-white px-2 text-[12px] text-[#1a1917] outline-none focus:border-[#1a1917]"
            >
              <option value="">Auto-detect from message</option>
              {assessments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title} ({a.status})
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto bg-[#fafafa] px-4 py-5 sm:px-6">
          {convoLoading ? (
            <div className="mx-auto max-w-3xl space-y-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className={`h-16 animate-pulse rounded-2xl bg-[#efefef] ${i % 2 ? "ml-auto w-1/2" : "w-3/4"}`} />
              ))}
            </div>
          ) : messages.length === 0 ? (
            <EmptyState
              first={first}
              openCapability={openCapability}
              setOpenCapability={setOpenCapability}
              onPrompt={(p) => void send(p)}
              pinnedTitle={pinnedTitle}
            />
          ) : (
            <div className="mx-auto max-w-3xl space-y-5">
              <AnimatePresence initial={false}>
                {messages.map((m, i) => (
                  <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    {m.role === "user" ? (
                      <div className="max-w-[85%] space-y-1.5">
                        {m.attachments && m.attachments.length > 0 && (
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {m.attachments.map((a) => (
                              <span key={a.id} className="inline-flex items-center gap-1 rounded-lg border border-[#e4e4e4] bg-white px-2 py-1 text-[11px] text-[#575757]">
                                <FileText className="size-3" /> {a.fileName}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="whitespace-pre-wrap rounded-2xl rounded-br-md bg-[#1a1917] px-4 py-2.5 text-[13.5px] leading-relaxed text-white">{m.content}</div>
                      </div>
                    ) : (
                      <AssistantMessage
                        message={m}
                        isLast={i === lastAssistantIdx}
                        busy={streaming}
                        onRegenerate={() => void regenerate()}
                        onCreateDraft={(qs) => void createDraft(qs)}
                        conversationTitle={conversations.find((c) => c.id === activeId)?.title ?? "Vigil response"}
                      />
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
              {!streaming && suggestions.length > 0 && (
                <div className="flex flex-wrap gap-2 pl-1" aria-label="Suggested follow-ups">
                  {suggestions.map((s) => (
                    <button key={s} type="button" onClick={() => void send(s)} className="inline-flex items-center gap-1.5 rounded-full border border-[#dfe3f5] bg-white px-3 py-1.5 text-[12px] font-medium text-[#3b4aa8] transition hover:border-[#4f6bff] hover:bg-[#f5f7ff]">
                      <Sparkles className="size-3" /> {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-[#ececec] bg-white p-3">
          {files.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {files.map((f) => (
                <span
                  key={f.key}
                  title={f.error}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11.5px] ${f.status === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-[#e4e4e4] bg-[#fafafa] text-[#3e3e3e]"}`}
                >
                  {f.status === "uploading" ? <Loader2 className="size-3 animate-spin" /> : f.status === "ready" ? <CheckCircle2 className="size-3 text-emerald-600" /> : <CircleAlert className="size-3" />}
                  <span className="max-w-[160px] truncate">{f.name}</span>
                  {f.status === "uploading" && <span className="tabular-nums text-[#9a9a9a]">{f.pct}%</span>}
                  {f.status === "error" && <span className="max-w-[180px] truncate">{f.error}</span>}
                  {f.attachment?.truncated && <span className="text-amber-600">(long — truncated)</span>}
                  <button
                    type="button"
                    aria-label={`Remove ${f.name}`}
                    onClick={() => {
                      f.abort?.();
                      setFiles((fs) => fs.filter((x) => x.key !== f.key));
                    }}
                    className="rounded p-0.5 hover:bg-black/5"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
            }}
          >
            <input ref={fileRef} type="file" multiple accept={ACCEPT} className="sr-only" aria-label="Attach documents" onChange={(e) => e.target.files && addFiles(e.target.files)} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={streaming}
              aria-label="Attach PDF, DOCX, PPTX or images"
              title="Attach PDF, DOCX, PPTX or images"
              className="flex size-11 shrink-0 items-center justify-center rounded-full border border-[#dedede] text-[#575757] transition hover:bg-[#f5f5f5] hover:text-[#1a1917] disabled:opacity-40"
            >
              <Paperclip className="size-4" />
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, 8000))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              rows={1}
              placeholder={pinnedTitle ? `Ask about “${pinnedTitle}”…` : "Ask Vigil to generate, analyze, review or grade…"}
              aria-label="Message Vigil"
              className="max-h-40 min-h-[44px] flex-1 resize-none rounded-2xl border border-[#dedede] bg-white px-4 py-3 text-[13.5px] outline-none focus:border-[#1a1917]"
            />
            {SpeechRecognitionImpl && (
              <button
                type="button"
                onClick={toggleVoice}
                disabled={streaming}
                aria-pressed={listening}
                aria-label={listening ? "Stop voice input" : "Voice input"}
                title={listening ? "Stop voice input" : "Voice input"}
                className={`flex size-11 shrink-0 items-center justify-center rounded-full border transition disabled:opacity-40 ${listening ? "animate-pulse border-rose-300 bg-rose-50 text-rose-600" : "border-[#dedede] text-[#575757] hover:bg-[#f5f5f5]"}`}
              >
                {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
              </button>
            )}
            {streaming ? (
              <button type="button" onClick={stop} aria-label="Stop generating" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#1a1917] text-white">
                <Square className="size-3.5 fill-current" />
              </button>
            ) : (
              <button type="submit" disabled={!input.trim()} aria-label="Send" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#1a1917] text-white transition disabled:opacity-30">
                <Send className="size-4" />
              </button>
            )}
          </form>
          <p className="pt-2 text-center text-[10.5px] text-[#9a9a9a]">
            Vigil only reads your own exams and students in your sections. AI can make mistakes — proctoring signals are evidence for human review, never proof.
          </p>
        </div>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteTarget?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>The conversation and its attached documents are permanently deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={() => void confirmDelete()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function upsertStep(steps: Step[], s: Step) {
  const i = steps.findIndex((x) => x.id === s.id);
  if (i < 0) return [...steps, s];
  const next = [...steps];
  next[i] = s;
  return next;
}

/* ───────────────────────── empty state ───────────────────────── */

function EmptyState({
  first,
  openCapability,
  setOpenCapability,
  onPrompt,
  pinnedTitle,
}: {
  first: string;
  openCapability: number | null;
  setOpenCapability: (i: number | null) => void;
  onPrompt: (p: string) => void;
  pinnedTitle?: string;
}) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 py-4 text-center">
      <div className="relative h-36 w-36" aria-hidden="true">
        <AgentMascot3D accent="#4f6bff" expression="wave" distance={6} trackPage={false} />
      </div>
      <div>
        <h2 className="text-xl font-extrabold tracking-tight text-[#1a1917]">What would you like to accomplish, {first}?</h2>
        <p className="mt-1 text-sm text-[#676767]">Your intelligent examination workspace{pinnedTitle ? ` · focused on “${pinnedTitle}”` : ""}</p>
      </div>
      <div className="grid w-full items-start gap-3 text-left sm:grid-cols-2">
        {CAPABILITIES.map((c, i) => {
          const open = openCapability === i;
          return (
            <div key={c.title} className={`rounded-2xl border bg-white text-left transition ${open ? "border-[#4f6bff]/60 shadow-sm" : "border-[#e4e4e4] hover:border-[#4f6bff]/40"}`}>
              <button type="button" onClick={() => setOpenCapability(open ? null : i)} aria-expanded={open} className="flex w-full items-center gap-3 p-4 text-left">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#f0f3ff] text-[#4f6bff]">
                  <c.icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold text-[#1a1917]">{c.title}</span>
                  <span className="block text-[12px] text-[#8a8a8a]">{c.subtitle}</span>
                </span>
                <ChevronDown className={`size-4 text-[#9a9a9a] transition-transform ${open ? "rotate-180" : ""}`} />
              </button>
              {open && (
                <ul className="space-y-1 border-t border-[#f0f0f0] p-2">
                  {c.prompts.map((p) => (
                    <li key={p}>
                      <button type="button" onClick={() => onPrompt(p)} className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] text-[#3e3e3e] hover:bg-[#f5f7ff]">
                        <Sparkles className="mt-0.5 size-3.5 shrink-0 text-[#4f6bff]" /> {p}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      <div className="w-full">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#9a9a9a]">Vigil multi-agent system</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(Object.keys(AGENT_META) as AgentId[]).map((id) => {
            const a = AGENT_META[id];
            return (
              <div key={id} className="flex items-center gap-2 rounded-xl border border-[#ececec] bg-white px-3 py-2 text-left">
                <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${a.bg} ${a.color}`}>
                  <a.icon className="size-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-semibold text-[#1a1917]">{a.name}</span>
                  <span className="block truncate text-[10.5px] text-[#8a8a8a]">{a.blurb}</span>
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-[#9a9a9a]">The orchestrator picks the right agent automatically and loads only the data it is authorized to see.</p>
      </div>
    </div>
  );
}

/* ───────────────────────── assistant message ───────────────────────── */

function AssistantMessage({
  message: m,
  isLast,
  busy,
  onRegenerate,
  onCreateDraft,
  conversationTitle,
}: {
  message: ChatMessage;
  isLast: boolean;
  busy: boolean;
  onRegenerate: () => void;
  onCreateDraft: (q: GeneratedQuestion[]) => void;
  conversationTitle: string;
}) {
  const [stepsOpen, setStepsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { text, questions } = splitQuestions(m.content, m.streaming);
  const meta = m.agent ? AGENT_META[m.agent] : null;
  const steps = m.steps ?? [];
  const running = steps.find((s) => s.state === "running");
  const exportMeta = `Vigil · ${meta?.name ?? "Assistant"} · ${new Date(m.createdAt ?? Date.now()).toLocaleString()}`;

  return (
    <div className="w-full max-w-[92%] space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {meta ? (
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.bg} ${meta.color}`}>
            <meta.icon className="size-3" /> {meta.name}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f0f3ff] px-2 py-0.5 text-[11px] font-semibold text-[#4f6bff]">
            <Sparkles className="size-3" /> Vigil Orchestrator
          </span>
        )}
        {steps.length > 0 && (
          <button type="button" onClick={() => setStepsOpen((o) => !o)} aria-expanded={stepsOpen || !!m.streaming} className="inline-flex items-center gap-1 text-[11px] text-[#8a8a8a] hover:text-[#1a1917]">
            {m.streaming && running ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
            {m.streaming && running ? `${running.label}${running.detail ? ` — ${running.detail}` : ""}` : `${steps.length} steps`}
            <ChevronDown className={`size-3 transition-transform ${stepsOpen ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>

      {(stepsOpen || (m.streaming && !text)) && steps.length > 0 && (
        <ol className="space-y-1 rounded-xl border border-[#ececec] bg-white px-3 py-2 text-[11.5px]" aria-label="Agent execution status">
          {steps.map((s) => (
            <li key={s.id} className="flex items-start gap-2">
              {s.state === "running" ? <Loader2 className="mt-0.5 size-3 animate-spin text-[#4f6bff]" /> : s.state === "done" ? <CheckCircle2 className="mt-0.5 size-3 text-emerald-600" /> : <CircleAlert className="mt-0.5 size-3 text-amber-600" />}
              <span className="text-[#3e3e3e]">
                {s.label}
                {s.detail && <span className="text-[#9a9a9a]"> — {s.detail}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}

      {(text || !m.streaming) && (
        <div className="rounded-2xl rounded-tl-md border border-[#e6e6e6] bg-white px-4 py-3 text-[13.5px] leading-relaxed text-[#2a2a2a]">
          {renderMarkdown(text)}
          {m.streaming && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-[#4f6bff] align-middle" aria-hidden="true" />}
        </div>
      )}

      {questions && questions.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2">
          <span className="text-[12px] text-indigo-900">
            <BookOpenCheck className="mr-1 inline size-3.5" />
            {questions.length} structured question{questions.length === 1 ? "" : "s"} ready for the assessment builder
          </span>
          <button type="button" onClick={() => onCreateDraft(questions)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-indigo-700">
            <FilePlus2 className="size-3.5" /> Create draft assessment
          </button>
        </div>
      )}

      {!m.streaming && text && (
        <div className="flex flex-wrap items-center gap-1 text-[11px] text-[#8a8a8a]">
          <ActionButton
            label={copied ? "Copied" : "Copy"}
            icon={copied ? Check : Copy}
            onClick={() => {
              void navigator.clipboard?.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          />
          {isLast && <ActionButton label="Regenerate" icon={RotateCcw} onClick={onRegenerate} disabled={busy} />}
          <ActionButton
            label="PDF"
            icon={FileDown}
            onClick={() => {
              try {
                exportPdf(conversationTitle, text, exportMeta);
              } catch (e: any) {
                toast.error(e.message);
              }
            }}
          />
          <ActionButton label="Word" icon={FileText} onClick={() => exportWord(conversationTitle, text, exportMeta)} />
          {m.sources && m.sources.length > 0 && (
            <span className="ml-1 truncate" title={m.sources.join(", ")}>
              Sources: {m.sources.slice(0, 3).join(" · ")}
              {m.sources.length > 3 ? ` +${m.sources.length - 3}` : ""}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ActionButton({ label, icon: Icon, onClick, disabled }: { label: string; icon: React.ComponentType<{ className?: string }>; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium hover:bg-[#efefef] hover:text-[#1a1917] disabled:opacity-40">
      <Icon className="size-3.5" /> {label}
    </button>
  );
}
