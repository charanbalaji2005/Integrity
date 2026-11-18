import React, { useEffect, useId, useState } from "react";
import { BookOpen, ChevronDown, Loader2, Search } from "lucide-react";
import { card, categoryLabel, errMessage, fieldCls, focusRing, secondaryBtn, supportApi, type KbArticle } from "./support-shared";

/** Self-serve help: link to Documentation plus a public knowledge-base search. */
export function KnowledgeBaseSearch({ onOpenDocs }: { onOpenDocs?: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<KbArticle[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const inputId = useId();
  const statusId = useId();

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const data = await supportApi<KbArticle[]>(`/api/support/kb?q=${encodeURIComponent(term)}`);
        if (!cancelled) {
          setResults(Array.isArray(data) ? data.slice(0, 6) : []);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(errMessage(err, "Couldn't search help articles."));
          setResults(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <section className={`${card} p-4 sm:p-5`} aria-labelledby={`${inputId}-h`}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div>
          <h2 id={`${inputId}-h`} className="text-[15px] font-semibold text-[#1a1917]">
            Find an answer first
          </h2>
          <p className="text-[12px] text-[#676767] mt-0.5">Many common issues are solved in a minute with our help articles.</p>
        </div>
        {onOpenDocs && (
          <button type="button" onClick={onOpenDocs} className={`${secondaryBtn} shrink-0`}>
            <BookOpen className="size-4" aria-hidden />
            Browse documentation
          </button>
        )}
      </div>

      <div className="relative mt-3">
        <label htmlFor={inputId} className="sr-only">
          Search help articles
        </label>
        <Search className="size-4 text-[#8a8a8a] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden />
        <input
          id={inputId}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. camera not detected, can't log in, exam won't start"
          className={`${fieldCls} h-11 pl-9 pr-9`}
          aria-describedby={statusId}
        />
        {loading && <Loader2 className="size-4 text-[#8a8a8a] absolute right-3 top-1/2 -translate-y-1/2 animate-spin" aria-hidden />}
      </div>

      <div id={statusId} aria-live="polite" className="mt-2">
        {error && <p className="text-[12px] text-red-700">{error}</p>}
        {results && results.length === 0 && !loading && (
          <p className="text-[12px] text-[#676767]">No articles matched. You can raise a ticket below and we'll help you directly.</p>
        )}
      </div>

      {results && results.length > 0 && (
        <ul className="mt-1 divide-y divide-[#eee] border border-[#eee] rounded-xl overflow-hidden">
          {results.map((a) => {
            const open = openId === a.id;
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : a.id)}
                  aria-expanded={open}
                  className={`w-full min-h-[44px] text-left px-3 py-2.5 flex items-start gap-3 hover:bg-[#fafafa] ${focusRing} focus-visible:ring-inset focus-visible:ring-offset-0`}
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold text-[#1a1917]">{a.title}</span>
                    <span className="block text-[12px] text-[#676767] mt-0.5 line-clamp-2">{a.summary}</span>
                    <span className="block text-[11px] text-[#8a8a8a] mt-1">{categoryLabel(a.category)}</span>
                  </span>
                  <ChevronDown className={`size-4 text-[#8a8a8a] mt-0.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
                </button>
                {open && (
                  <div className="px-3 pb-3 text-[13px] text-[#1a1917] whitespace-pre-wrap leading-relaxed">{a.body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
