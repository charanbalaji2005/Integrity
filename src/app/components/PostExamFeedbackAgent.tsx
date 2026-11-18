import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bot, Loader2, Send, Star } from "lucide-react";
import { toast } from "sonner";
import { API_BASE_URL } from "../utils/api-client";

interface PostExamFeedbackAgentProps {
  attemptId: string;
  assessmentTitle?: string;
  studentName?: string;
  onDone: () => void;
}

type Step = "overall" | "difficulty" | "proctoring" | "issues" | "comments" | "sending" | "done";

interface Msg {
  from: "agent" | "user";
  text: string;
}

const DIFFICULTY = [
  { value: "easy", label: "Easy" },
  { value: "just-right", label: "Just right" },
  { value: "hard", label: "Hard" },
] as const;

const ISSUES = [
  { value: "camera", label: "Camera" },
  { value: "microphone", label: "Microphone" },
  { value: "network", label: "Network" },
  { value: "browser", label: "Browser / fullscreen" },
  { value: "timer", label: "Timer" },
  { value: "other", label: "Other" },
] as const;

function Stars({ onPick }: { onPick: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1.5" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          onMouseEnter={() => setHover(n)}
          onFocus={() => setHover(n)}
          onClick={() => onPick(n)}
          className="rounded-lg p-1.5 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
        >
          <Star className={`size-7 ${n <= hover ? "fill-amber-400 text-amber-400" : "text-zinc-300"}`} />
        </button>
      ))}
    </div>
  );
}

/**
 * Conversational agent shown after an exam is submitted. Asks a few quick
 * questions and stores the answers via POST /api/exam-feedback, which admins
 * review in the "Exam Feedback" tab.
 */
export function PostExamFeedbackAgent({ attemptId, assessmentTitle, studentName, onDone }: PostExamFeedbackAgentProps) {
  const first = studentName?.split(" ")[0];
  const [messages, setMessages] = useState<Msg[]>([]);
  const [step, setStep] = useState<Step>("overall");
  const [typing, setTyping] = useState(true);

  const [overall, setOverall] = useState(0);
  const [difficulty, setDifficulty] = useState<string>("");
  const [proctoring, setProctoring] = useState(0);
  const [issues, setIssues] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const agentSay = (text: string, next?: Step) => {
    setTyping(true);
    window.setTimeout(() => {
      setMessages((m) => [...m, { from: "agent", text }]);
      setTyping(false);
      if (next) setStep(next);
    }, 650);
  };
  const userSay = (text: string) => setMessages((m) => [...m, { from: "user", text }]);

  // Opening lines
  useEffect(() => {
    const t1 = window.setTimeout(() => {
      setMessages([
        {
          from: "agent",
          text: `Hi${first ? ` ${first}` : ""}! Your exam${assessmentTitle ? ` "${assessmentTitle}"` : ""} has been submitted successfully. 🎉`,
        },
      ]);
      agentSay("I'm the IntegrityOS feedback agent. Mind answering 4 quick questions? First — how was your overall exam experience?", "overall");
    }, 400);
    return () => window.clearTimeout(t1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing, step]);

  const answerOverall = (n: number) => {
    setOverall(n);
    userSay(`${"★".repeat(n)}${"☆".repeat(5 - n)}`);
    agentSay(n <= 2 ? "Sorry it wasn't great. How difficult did the questions feel?" : "Glad to hear it! How difficult did the questions feel?", "difficulty");
  };

  const answerDifficulty = (v: string, label: string) => {
    setDifficulty(v);
    userSay(label);
    agentSay("How fair and comfortable did the proctoring (camera, monitoring, warnings) feel?", "proctoring");
  };

  const answerProctoring = (n: number) => {
    setProctoring(n);
    userSay(`${"★".repeat(n)}${"☆".repeat(5 - n)}`);
    agentSay("Did you run into any technical issues? Pick all that apply, or choose “No issues”.", "issues");
  };

  const answerIssues = (none: boolean) => {
    const picked = none ? [] : issues;
    if (none) setIssues([]);
    userSay(none || picked.length === 0 ? "No issues 👍" : picked.map((p) => ISSUES.find((i) => i.value === p)?.label).join(", "));
    agentSay("Last one — anything else you'd like the exam team to know? (optional)", "comments");
  };

  const submit = async (skip: boolean) => {
    const text = skip ? "" : comment.trim();
    userSay(text || "Nothing more, thanks.");
    setStep("sending");
    setTyping(true);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`${API_BASE_URL}/api/exam-feedback`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          attemptId,
          overallRating: overall,
          difficulty,
          proctoringRating: proctoring,
          technicalIssues: issues.length ? issues : ["none"],
          comments: text || undefined,
        }),
      });
      if (!res.ok && res.status !== 409) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "Could not save feedback");
      }
      setTyping(false);
      agentSay("Thank you! Your feedback has been recorded and shared with the exam team. You can close this now. 🙌", "done");
    } catch (err: any) {
      setTyping(false);
      toast.error(err.message || "Could not save feedback");
      setStep("comments");
    }
  };

  const chip =
    "rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-900";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950/40 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="flex h-[min(620px,90dvh)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-2xl"
        role="dialog"
        aria-label="Exam feedback"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="relative flex size-10 items-center justify-center rounded-2xl bg-zinc-950 text-white">
              <Bot className="size-5" />
              <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-white bg-emerald-500" />
            </span>
            <div>
              <p className="text-sm font-bold text-zinc-900">Feedback Agent</p>
              <p className="text-[11px] font-medium text-zinc-500">{typing ? "typing…" : "online"}</p>
            </div>
          </div>
          <button type="button" onClick={onDone} className="text-xs font-semibold text-zinc-400 hover:text-zinc-700">
            {step === "done" ? "Close" : "Skip"}
          </button>
        </div>

        {/* Conversation */}
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-zinc-50/60 px-5 py-5">
          <AnimatePresence initial={false}>
            {messages.map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed ${
                    m.from === "user"
                      ? "rounded-br-md bg-zinc-950 text-white"
                      : "rounded-bl-md border border-zinc-200 bg-white text-zinc-800"
                  }`}
                >
                  {m.text}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {typing && (
            <div className="flex w-fit gap-1 rounded-2xl rounded-bl-md border border-zinc-200 bg-white px-4 py-3">
              {[0, 1, 2].map((d) => (
                <motion.span
                  key={d}
                  className="size-1.5 rounded-full bg-zinc-400"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1, repeat: Infinity, delay: d * 0.15 }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Reply area */}
        <div className="min-h-[88px] border-t border-zinc-100 px-5 py-4">
          {!typing && step === "overall" && <Stars onPick={answerOverall} />}
          {!typing && step === "difficulty" && (
            <div className="flex flex-wrap gap-2">
              {DIFFICULTY.map((d) => (
                <button key={d.value} type="button" className={chip} onClick={() => answerDifficulty(d.value, d.label)}>
                  {d.label}
                </button>
              ))}
            </div>
          )}
          {!typing && step === "proctoring" && <Stars onPick={answerProctoring} />}
          {!typing && step === "issues" && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {ISSUES.map((it) => {
                  const on = issues.includes(it.value);
                  return (
                    <button
                      key={it.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setIssues((s) => (on ? s.filter((x) => x !== it.value) : [...s, it.value]))}
                      className={on ? `${chip} border-zinc-950 bg-zinc-950 text-white hover:text-white` : chip}
                    >
                      {it.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <button type="button" className={chip} onClick={() => answerIssues(true)}>
                  No issues
                </button>
                <button
                  type="button"
                  disabled={issues.length === 0}
                  onClick={() => answerIssues(false)}
                  className="rounded-full bg-zinc-950 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-30"
                >
                  Continue
                </button>
              </div>
            </div>
          )}
          {!typing && step === "comments" && (
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                submit(false);
              }}
            >
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value.slice(0, 2000))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit(false);
                  }
                }}
                rows={2}
                placeholder="Type your thoughts… (optional)"
                className="flex-1 resize-none rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-[13px] outline-none focus:border-zinc-900"
                autoFocus
              />
              <div className="flex flex-col gap-1.5">
                <button
                  type="submit"
                  aria-label="Send"
                  className="flex size-10 items-center justify-center rounded-full bg-zinc-950 text-white"
                >
                  <Send className="size-4" />
                </button>
                <button type="button" onClick={() => submit(true)} className="text-[10px] font-semibold text-zinc-400 hover:text-zinc-700">
                  Skip
                </button>
              </div>
            </form>
          )}
          {step === "sending" && (
            <p className="flex items-center gap-2 text-xs font-medium text-zinc-500">
              <Loader2 className="size-4 animate-spin" /> Saving your feedback…
            </p>
          )}
          {!typing && step === "done" && (
            <button
              type="button"
              onClick={onDone}
              className="w-full rounded-2xl bg-zinc-950 py-3 text-sm font-bold text-white transition hover:bg-zinc-800"
            >
              Back to dashboard
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
