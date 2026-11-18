import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Copy, Loader2, Lock, RotateCcw, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { API_BASE_URL } from "../../utils/api-client";
import { AgentMascot3D, type MascotExpression } from "../mascot/AgentMascot3D";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

const STORAGE_KEY = "faculty_ai_chat_v1";

const STARTERS = [
  "Write 5 MCQs on process scheduling with answer keys",
  "Create a 10-mark rubric for a descriptive answer on deadlocks",
  "How should I review a 'looking away' proctoring alert fairly?",
  "Balance my exam: 40% easy, 40% medium, 20% hard — suggest a blueprint",
];

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Tiny, safe markdown → React (headings, lists, bold, inline code, code blocks). */
function renderMarkdown(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const blocks = text.split(/```/);
  blocks.forEach((block, bi) => {
    if (bi % 2 === 1) {
      const code = block.replace(/^[a-zA-Z0-9]*\n/, "");
      out.push(
        <pre key={`c${bi}`} className="my-2 overflow-x-auto rounded-xl bg-[#14161f] p-3 text-[12px] leading-relaxed text-[#e6e8f2]">
          <code>{code.trimEnd()}</code>
        </pre>,
      );
      return;
    }
    let list: { ordered: boolean; items: string[] } | null = null;
    let table: string[][] | null = null;
    const flushTable = (key: string) => {
      if (!table) return;
      const rows = table.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c.trim())));
      const [head, ...body] = rows;
      out.push(
        <div key={key} className="my-2 overflow-x-auto rounded-xl border border-[#e6e6e6]">
          <table className="w-full border-collapse text-left text-[12.5px]">
            {head && (
              <thead className="bg-[#f4f5f8]">
                <tr>
                  {head.map((c, i) => (
                    <th key={i} className="border-b border-[#e6e6e6] px-3 py-2 font-semibold">
                      {cell(c)}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri} className="align-top odd:bg-white even:bg-[#fafafa]">
                  {r.map((c, ci) => (
                    <td key={ci} className="border-b border-[#f0f0f0] px-3 py-2">
                      {cell(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      table = null;
    };
    const flush = (key: string) => {
      flushTable(`t${key}`);
      if (!list) return;
      const Tag = list.ordered ? "ol" : "ul";
      out.push(
        <Tag key={key} className={`my-1.5 space-y-1 pl-5 ${list.ordered ? "list-decimal" : "list-disc"}`}>
          {list.items.map((it, i) => (
            <li key={i}>{inline(it)}</li>
          ))}
        </Tag>,
      );
      list = null;
    };
    block.split("\n").forEach((raw, li) => {
      const line = raw.trimEnd();
      const key = `${bi}-${li}`;
      if (/^\s*\|.*\|\s*$/.test(line)) {
        if (list) {
          const t = table;
          table = null;
          flush(`l${key}`);
          table = t;
        }
        table ??= [];
        table.push(line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
        return;
      }
      flushTable(`t${key}`);
      const ul = line.match(/^\s*[-*•]\s+(.*)/);
      const ol = line.match(/^\s*\d+[.)]\s+(.*)/);
      if (ul || ol) {
        const ordered = Boolean(ol);
        if (list && list.ordered !== ordered) flush(`l${key}`);
        list ??= { ordered, items: [] };
        list.items.push((ul ?? ol)![1]);
        return;
      }
      flush(`l${key}`);
      const h = line.match(/^(#{1,4})\s+(.*)/);
      if (h) {
        out.push(
          <p key={key} className="mb-1 mt-2.5 font-bold text-[#1a1917]">
            {inline(h[2])}
          </p>,
        );
      } else if (line.trim()) {
        out.push(
          <p key={key} className="my-1">
            {inline(line)}
          </p>,
        );
      }
    });
    flush(`end${bi}`);
  });
  return out;
}

/** Table cell: honours <br> line breaks the model puts inside cells. */
function cell(s: string): React.ReactNode[] {
  return s.split(/<br\s*\/?>/i).flatMap((part, i) => (i === 0 ? inline(part) : [<br key={`br${i}`} />, ...inline(part)]));
}

function inline(s: string): React.ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`"))
      return (
        <code key={i} className="rounded bg-[#eef0f6] px-1 py-0.5 text-[12px]">
          {part.slice(1, -1)}
        </code>
      );
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

/** Faculty-only AI assistant. Access is enforced server-side; the UI mirrors it. */
export function FacultyAIChat({ user }: { user: any }) {
  const [eligibility, setEligibility] = useState<{ eligible: boolean; reason?: string } | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      return saved ? (JSON.parse(saved) as ChatMsg[]) : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/faculty-assistant/status`, { credentials: "include", headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => setEligibility(d?.data ?? { eligible: false, reason: d?.message || "Unable to verify access." }))
      .catch(() => setEligibility({ eligible: false, reason: "Unable to reach the server." }));
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
    } catch {
      // ignore
    }
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || sending) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setInput("");
    setSending(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/faculty-assistant/chat`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ messages: next.slice(-20) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "The assistant couldn't respond.");
      setMessages((m) => [...m, { role: "assistant", content: data.data.reply }]);
    } catch (e: any) {
      toast.error(e.message || "The assistant couldn't respond.");
      setMessages((m) => m.slice(0, -1));
      setInput(content);
    } finally {
      setSending(false);
    }
  };

  const expression: MascotExpression = sending ? "think" : messages.length === 0 ? "wave" : "happy";
  const first = user?.name?.split(" ")[0] ?? "Professor";

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

  return (
    <div className="flex h-[calc(100dvh-140px)] min-h-[520px] flex-col overflow-hidden rounded-3xl border border-[#dedede] bg-white">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-[#ececec] px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="relative size-14 shrink-0" aria-hidden="true">
            <AgentMascot3D accent="#4f6bff" expression={expression} distance={5.6} trackPage={false} />
          </div>
          <div>
            <p className="flex items-center gap-2 text-sm font-extrabold text-[#1a1917]">
              Vigil AI Assistant
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Verified faculty</span>
            </p>
            <p className="text-[11.5px] text-[#8a8a8a]">{sending ? "Thinking…" : "Questions, rubrics, integrity reviews and more"}</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => setMessages([])}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#dedede] px-3 py-1.5 text-xs font-semibold text-[#575757] hover:text-[#1a1917]"
          >
            <RotateCcw className="size-3.5" /> New chat
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto bg-[#fafafa] px-5 py-5">
        {messages.length === 0 && (
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 py-6 text-center">
            <div className="relative h-44 w-44" aria-hidden="true">
              <AgentMascot3D accent="#4f6bff" expression="wave" distance={6} trackPage={false} />
            </div>
            <div>
              <h2 className="text-xl font-extrabold tracking-tight text-[#1a1917]">Hi {first}, how can I help today?</h2>
              <p className="mt-1 text-sm text-[#676767]">Draft questions, build rubrics, or talk through an integrity report.</p>
            </div>
            <div className="grid w-full gap-2 sm:grid-cols-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="flex items-start gap-2 rounded-2xl border border-[#e4e4e4] bg-white p-3 text-left text-[13px] font-medium text-[#3e3e3e] transition hover:border-[#4f6bff]/50 hover:shadow-sm"
                >
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-[#4f6bff]" />
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`group flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`relative max-w-[85%] rounded-2xl px-4 py-2.5 text-[13.5px] leading-relaxed ${
                  m.role === "user" ? "rounded-br-md bg-[#1a1917] text-white" : "rounded-bl-md border border-[#e6e6e6] bg-white text-[#2a2a2a]"
                }`}
              >
                {m.role === "assistant" ? renderMarkdown(m.content) : <span className="whitespace-pre-wrap">{m.content}</span>}
                {m.role === "assistant" && (
                  <button
                    type="button"
                    aria-label="Copy reply"
                    onClick={() => {
                      navigator.clipboard?.writeText(m.content);
                      toast.success("Copied");
                    }}
                    className="absolute -bottom-3 right-2 hidden rounded-lg border border-[#e6e6e6] bg-white p-1 text-[#8a8a8a] shadow-sm hover:text-[#1a1917] group-hover:block"
                  >
                    <Copy className="size-3.5" />
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {sending && (
          <div className="flex w-fit gap-1 rounded-2xl rounded-bl-md border border-[#e6e6e6] bg-white px-4 py-3">
            {[0, 1, 2].map((d) => (
              <motion.span
                key={d}
                className="size-1.5 rounded-full bg-[#9a9a9a]"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1, repeat: Infinity, delay: d * 0.15 }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Composer */}
      <form
        className="flex items-end gap-2 border-t border-[#ececec] p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, 4000))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          placeholder="Ask Vigil anything about your assessments…"
          className="max-h-40 min-h-[44px] flex-1 resize-none rounded-2xl border border-[#dedede] bg-white px-4 py-3 text-[13.5px] outline-none focus:border-[#1a1917]"
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          aria-label="Send"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#1a1917] text-white transition disabled:opacity-30"
        >
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </button>
      </form>
      <p className="px-4 pb-2 text-center text-[10.5px] text-[#9a9a9a]">
        AI can make mistakes. Proctoring signals are evidence for review, not proof of misconduct.
      </p>
    </div>
  );
}
