import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, MessageSquareText, RefreshCw, Search, Star } from "lucide-react";
import { API_BASE_URL } from "../app/utils/api-client";

interface FeedbackItem {
  id: string;
  attemptId: string;
  assessmentId: string;
  assessmentTitle: string;
  studentName: string;
  studentEmail: string | null;
  overallRating: number;
  difficulty: string;
  proctoringRating: number;
  technicalIssues: string[];
  comments: string | null;
  sentiment: "positive" | "neutral" | "negative";
  createdAt: string;
}

interface FeedbackStats {
  total: number;
  avgOverall: number;
  avgProctoring: number;
  difficulty: Record<string, number>;
  sentiment: Record<string, number>;
  issues: Record<string, number>;
}

const DIFF_LABEL: Record<string, string> = { easy: "Easy", "just-right": "Just right", hard: "Hard" };
const SENTIMENT_CLASS: Record<string, string> = {
  positive: "text-emerald-700 bg-emerald-50 border-emerald-200",
  neutral: "text-zinc-600 bg-zinc-50 border-zinc-200",
  negative: "text-rose-700 bg-rose-50 border-rose-200",
};

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex" aria-label={`${value} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`size-3.5 ${n <= value ? "fill-amber-400 text-amber-400" : "text-zinc-200"}`} />
      ))}
    </span>
  );
}

/** Admin panel tab: post-exam feedback collected by the feedback agent. */
export function AdminFeedbackPanel() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [exam, setExam] = useState("all");
  const [sentiment, setSentiment] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`${API_BASE_URL}/api/exam-feedback/admin`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Failed to load feedback");
      setItems(data.data.items);
      setStats(data.data.stats);
    } catch (e: any) {
      setError(e.message || "Failed to load feedback");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const exams = useMemo(() => {
    const m = new Map<string, string>();
    items.forEach((i) => m.set(i.assessmentId, i.assessmentTitle));
    return [...m.entries()];
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (i) =>
        (exam === "all" || i.assessmentId === exam) &&
        (sentiment === "all" || i.sentiment === sentiment) &&
        (!q ||
          i.studentName.toLowerCase().includes(q) ||
          (i.studentEmail ?? "").toLowerCase().includes(q) ||
          (i.comments ?? "").toLowerCase().includes(q) ||
          i.assessmentTitle.toLowerCase().includes(q)),
    );
  }, [items, query, exam, sentiment]);

  const topIssue = stats
    ? Object.entries(stats.issues).sort((a, b) => b[1] - a[1])[0]
    : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#1a1917]">Exam Feedback</h2>
          <p className="text-xs text-[#686868]">
            Responses collected by the post-exam feedback agent after each submission.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 rounded-xl border border-[#dedede] bg-white px-3 py-2 text-xs font-bold text-[#1a1917] hover:bg-[#f5f5f5]"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Responses" value={stats?.total ?? 0} />
        <StatCard label="Avg. experience" value={stats ? `${stats.avgOverall} / 5` : "—"} />
        <StatCard label="Avg. proctoring fairness" value={stats ? `${stats.avgProctoring} / 5` : "—"} />
        <StatCard
          label="Top technical issue"
          value={topIssue ? `${topIssue[0]} (${topIssue[1]})` : "None"}
          capitalize
        />
      </div>

      {stats && stats.total > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          <Distribution
            title="Difficulty"
            data={["easy", "just-right", "hard"].map((k) => [DIFF_LABEL[k], stats.difficulty[k] ?? 0])}
            total={stats.total}
          />
          <Distribution
            title="Sentiment"
            data={["positive", "neutral", "negative"].map((k) => [k, stats.sentiment[k] ?? 0])}
            total={stats.total}
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <label className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#8a8a8a]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search student, exam or comment…"
            className="w-full rounded-xl border border-[#dedede] bg-white py-2 pl-9 pr-3 text-xs outline-none focus:border-[#1a1917]"
          />
        </label>
        <select
          value={exam}
          onChange={(e) => setExam(e.target.value)}
          className="rounded-xl border border-[#dedede] bg-white px-3 py-2 text-xs font-semibold"
          aria-label="Filter by exam"
        >
          <option value="all">All exams</option>
          {exams.map(([id, title]) => (
            <option key={id} value={id}>
              {title}
            </option>
          ))}
        </select>
        <select
          value={sentiment}
          onChange={(e) => setSentiment(e.target.value)}
          className="rounded-xl border border-[#dedede] bg-white px-3 py-2 text-xs font-semibold"
          aria-label="Filter by sentiment"
        >
          <option value="all">All sentiment</option>
          <option value="positive">Positive</option>
          <option value="neutral">Neutral</option>
          <option value="negative">Negative</option>
        </select>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-xs text-[#8a8a8a]">
          <Loader2 className="size-4 animate-spin" /> Loading feedback…
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-700">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[#dedede] py-16 text-center">
          <MessageSquareText className="size-6 text-[#b2b2b2]" />
          <p className="text-sm font-semibold text-[#1a1917]">No feedback yet</p>
          <p className="text-xs text-[#8a8a8a]">Students are asked for feedback right after they submit an exam.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((f) => (
            <li key={f.id} className="rounded-2xl border border-[#dedede]/70 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-[#1a1917]">{f.studentName}</p>
                  <p className="text-[11px] text-[#8a8a8a]">
                    {f.studentEmail ? `${f.studentEmail} · ` : ""}
                    {f.assessmentTitle} · {new Date(f.createdAt).toLocaleString()}
                  </p>
                </div>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${SENTIMENT_CLASS[f.sentiment]}`}
                >
                  {f.sentiment}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-[11px] text-[#686868] sm:grid-cols-4">
                <div>
                  <p className="mb-1 font-semibold">Experience</p>
                  <Stars value={f.overallRating} />
                </div>
                <div>
                  <p className="mb-1 font-semibold">Proctoring</p>
                  <Stars value={f.proctoringRating} />
                </div>
                <div>
                  <p className="mb-1 font-semibold">Difficulty</p>
                  <p className="font-bold text-[#1a1917]">{DIFF_LABEL[f.difficulty] ?? f.difficulty}</p>
                </div>
                <div>
                  <p className="mb-1 font-semibold">Tech issues</p>
                  <p className="font-bold capitalize text-[#1a1917]">
                    {f.technicalIssues.length ? f.technicalIssues.join(", ") : "None"}
                  </p>
                </div>
              </div>
              {f.comments && (
                <p className="mt-3 rounded-xl bg-[#f7f7f7] px-3 py-2 text-xs leading-relaxed text-[#3e3e3e]">
                  “{f.comments}”
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatCard({ label, value, capitalize }: { label: string; value: React.ReactNode; capitalize?: boolean }) {
  return (
    <div className="rounded-2xl border border-[#dedede]/70 bg-white p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-[#8a8a8a]">{label}</p>
      <p className={`mt-1.5 text-xl font-bold text-[#1a1917] ${capitalize ? "capitalize" : ""}`}>{value}</p>
    </div>
  );
}

function Distribution({ title, data, total }: { title: string; data: [string, number][]; total: number }) {
  return (
    <div className="rounded-2xl border border-[#dedede]/70 bg-white p-4">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-[#8a8a8a]">{title}</p>
      <div className="flex flex-col gap-2">
        {data.map(([label, n]) => (
          <div key={label} className="flex items-center gap-3 text-xs">
            <span className="w-20 shrink-0 font-semibold capitalize text-[#3e3e3e]">{label}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-[#f0f0f0]">
              <span
                className="block h-full rounded-full bg-[#1a1917]"
                style={{ width: `${total ? (n / total) * 100 : 0}%` }}
              />
            </span>
            <span className="w-8 text-right font-mono text-[#686868]">{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
