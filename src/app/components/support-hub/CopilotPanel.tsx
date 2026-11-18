import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BookOpen, CheckCircle2, ClipboardCopy, CornerDownLeft, Flag, History, Lightbulb, ListChecks, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { errorMessage, supportApi } from "./api";
import type { CopilotResult, TicketDetail } from "./types";
import { ErrorBlock, Spinner, btnPrimary, btnSecondary, cx } from "./ui";

export function CopilotPanel({
  ticket,
  onInsert,
  onUseResolution,
  onOpenTicketRef,
}: {
  ticket: TicketDetail;
  onInsert: (text: string) => void;
  onUseResolution: (text: string) => void;
  onOpenTicketRef: (id: string) => void;
}) {
  const [data, setData] = useState<CopilotResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await supportApi<CopilotResult>(`/tickets/${ticket.id}/copilot`, { method: "POST", body: {} }));
    } catch (err) {
      setError(errorMessage(err, "Copilot is unavailable right now"));
    } finally {
      setLoading(false);
    }
  }, [ticket.id]);

  useEffect(() => {
    setData(null);
    void run();
  }, [run]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 py-3 border-b border-indigo-100 bg-indigo-50/70 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-indigo-700" aria-hidden />
          <span className="text-sm font-bold text-[#1a1917]">AI Copilot</span>
          <span className="text-[10px] text-[#676767] ml-1">Private to staff</span>
          <button
            type="button"
            onClick={() => void run()}
            disabled={loading}
            className="ml-auto inline-flex items-center gap-1 min-h-9 px-2 rounded-lg text-[11px] font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
          >
            <RefreshCw className={cx("size-3.5", loading && "animate-spin")} /> Regenerate
          </button>
        </div>
        <p className="mt-1.5 inline-flex items-center gap-1 text-[10.5px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-1.5 py-0.5">
          <AlertTriangle className="size-3" aria-hidden /> AI suggestion — review before sending
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-5">
        {loading && !data ? (
          <Spinner label="Analysing ticket" />
        ) : error ? (
          <ErrorBlock message={error} onRetry={run} />
        ) : data ? (
          <>
            <Block icon={CornerDownLeft} title="Suggested reply">
              {data.suggestedReply ? (
                <>
                  <p className="text-[12.5px] whitespace-pre-wrap text-[#1a1917] bg-white border border-[#dedede] rounded-xl p-3 leading-relaxed">{data.suggestedReply}</p>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <button type="button" className={btnPrimary} onClick={() => onInsert(data.suggestedReply)} disabled={!ticket.permissions?.canMessage} title={!ticket.permissions?.canMessage ? "Accept the ticket to reply" : undefined}>
                      Insert into composer
                    </button>
                    <button type="button" className={btnSecondary} onClick={() => copy(data.suggestedReply)}>
                      <ClipboardCopy className="size-3.5" /> Copy
                    </button>
                  </div>
                  {!ticket.permissions?.canMessage && <p className="text-[10.5px] text-[#8a8a8a] mt-1">Accept the ticket to reply.</p>}
                </>
              ) : (
                <Empty />
              )}
            </Block>

            <Block icon={Lightbulb} title="Likely root causes">
              {data.rootCauses.length ? (
                <ul className="space-y-1.5">
                  {data.rootCauses.map((c, i) => (
                    <li key={i} className="flex items-start gap-2 text-[12.5px]">
                      <span className={cx("text-[9.5px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-0.5 uppercase", c.likelihood === "likely" ? "bg-rose-50 text-rose-700" : "bg-[#f1f1f1] text-[#676767]")}>
                        {c.likelihood}
                      </span>
                      <span>{c.cause}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty />
              )}
            </Block>

            <Block icon={ListChecks} title="Troubleshooting steps">
              {data.steps.length ? (
                <ol className="list-decimal pl-5 space-y-1 text-[12.5px] text-[#1a1917]">
                  {data.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              ) : (
                <Empty />
              )}
            </Block>

            <Block icon={BookOpen} title="Knowledge base articles">
              {data.articles.length ? (
                <ul className="space-y-1">
                  {data.articles.map((a) => (
                    <li key={a.id} className="text-[12.5px] text-[#1a1917] flex items-center gap-2">
                      <BookOpen className="size-3 text-[#a2a2a2]" aria-hidden /> {a.title}
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty />
              )}
            </Block>

            <Block icon={History} title="Similar tickets">
              {data.similarTickets.length ? (
                <ul className="space-y-2">
                  {data.similarTickets.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => onOpenTicketRef(t.id)}
                        className="w-full text-left p-2.5 rounded-lg border border-[#dedede] hover:bg-[#fafafa] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1917]"
                      >
                        <span className="text-[10.5px] font-mono font-bold text-[#8a8a8a]">{t.referenceNumber}</span>
                        <span className="block text-xs font-bold text-[#1a1917]">{t.title}</span>
                        {t.resolution && <span className="block text-[11px] text-[#676767] mt-0.5 line-clamp-2">Resolved: {t.resolution}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty />
              )}
            </Block>

            <Block icon={Flag} title="Escalation recommendation">
              <p className="text-[12.5px] text-[#1a1917]">{data.recommendedEscalation || "No escalation recommended."}</p>
            </Block>

            <Block icon={CheckCircle2} title="Resolution summary draft">
              {data.resolutionSummaryDraft ? (
                <>
                  <p className="text-[12.5px] whitespace-pre-wrap text-[#1a1917] bg-white border border-[#dedede] rounded-xl p-3">{data.resolutionSummaryDraft}</p>
                  {ticket.permissions?.canResolve && (
                    <button type="button" className={cx(btnSecondary, "mt-2")} onClick={() => onUseResolution(data.resolutionSummaryDraft)}>
                      Use when resolving
                    </button>
                  )}
                </>
              ) : (
                <Empty />
              )}
            </Block>

            <p className="text-[10.5px] text-[#8a8a8a] border-t border-[#dedede]/60 pt-3">
              {data.disclaimer} · Generated by {data.generatedBy === "llm" ? "language model" : "rules engine"}. Nothing is sent to the student automatically.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}

function Block({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#676767] mb-2">
        <Icon className="size-3.5" /> {title}
      </h3>
      {children}
    </section>
  );
}

function Empty() {
  return <p className="text-xs text-[#a2a2a2]">No suggestions.</p>;
}
