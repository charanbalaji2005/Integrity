import React, { useMemo } from "react";
import { motion } from "motion/react";
import {
  Sparkles,
  ClipboardCheck,
  Target,
  ShieldCheck,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Lightbulb,
  Loader2,
  ArrowRight,
  BadgeCheck,
  Info,
} from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import {
  VIOLATION_INFO,
  violationLabel,
  isConductViolation,
  hasAttempt,
  isFinished,
  scorePercent,
  integrityOf,
  attemptDate,
  formatDate,
  useAttemptDetails,
  type StudentAttemptDetail,
} from "./studentData";

interface StudentAIInsightsProps {
  dbAssessments: any[];
  verificationStatus?: string;
  verificationRequired?: boolean;
  onOpenVerify: () => void;
  onNavigate: (tab: string) => void;
}

const SCORE_COLOR = "#2a6fdb";
const INTEGRITY_COLOR = "#0f9f6e";

const card = "bg-white border border-[#dedede] rounded-2xl shadow-[0_4px_20px_rgba(128,128,128,0.04)]";
const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1917] focus-visible:ring-offset-2";

type Tip = { tone: "good" | "warn" | "info"; title: string; body: string; action?: { label: string; tab?: string; verify?: boolean } };

function avg(nums: number[]) {
  return nums.length ? Math.round(nums.reduce((s, n) => s + n, 0) / nums.length) : null;
}

export function StudentAIInsights({ dbAssessments, verificationStatus, verificationRequired, onOpenVerify, onNavigate }: StudentAIInsightsProps) {
  const { details, loading, failed } = useAttemptDetails(dbAssessments);

  const finished = useMemo(
    () =>
      dbAssessments
        .filter(isFinished)
        .map((a) => ({ a, d: details[a.attemptId] as StudentAttemptDetail | undefined }))
        .sort((x, y) => (attemptDate(x.a, x.d)?.getTime() ?? 0) - (attemptDate(y.a, y.d)?.getTime() ?? 0)),
    [dbAssessments, details],
  );
  const inProgress = dbAssessments.filter((a) => a.attemptStatus === "started");
  const attemptedAny = dbAssessments.some(hasAttempt);

  const scores = finished.map(({ a }) => scorePercent(a)).filter((n): n is number => n !== null);
  const integrities = finished.map(({ a }) => integrityOf(a)).filter((n): n is number => n !== null);
  const avgScore = avg(scores);
  const avgIntegrity = avg(integrities);

  const allViolations = finished.flatMap(({ d }) => (d?.violations || []).filter(isConductViolation));
  const detailsLoaded = finished.filter(({ d }) => d).length;
  const totalWarnings = finished.reduce((s, { d }) => s + (d?.warningCount ?? 0), 0);

  const breakdown = useMemo(() => {
    const map = new Map<string, { label: string; count: number; points: number; key: string }>();
    allViolations.forEach((v) => {
      const label = violationLabel(v.type);
      const cur = map.get(label) || { label, count: 0, points: 0, key: v.type };
      cur.count += 1;
      cur.points += typeof v.riskScore === "number" ? v.riskScore : 0;
      map.set(label, cur);
    });
    return [...map.values()].sort((x, y) => y.count - x.count || y.points - x.points);
  }, [allViolations]);
  const maxCount = breakdown[0]?.count ?? 1;

  const chartData = finished
    .map(({ a, d }, i) => ({
      name: `#${i + 1}`,
      title: a.title as string,
      date: formatDate(attemptDate(a, d)),
      score: scorePercent(a),
      integrity: integrityOf(a),
    }))
    .filter((r) => r.score !== null || r.integrity !== null);

  // ───────── deterministic, rule-based tips ─────────
  const tips: Tip[] = [];
  if (verificationRequired !== false && verificationStatus && verificationStatus !== "approved") {
    tips.push({
      tone: "warn",
      title: verificationStatus === "pending" ? "Enrolment verification is awaiting approval" : "Verify your enrolment to unlock exams",
      body:
        verificationStatus === "pending"
          ? "An administrator is reviewing your document. Exams unlock as soon as it's approved."
          : verificationStatus === "rejected"
          ? "Your last document was rejected. Upload a clearer college ID or current fee receipt."
          : "Upload your college ID card or current fee receipt. Exams unlock once an admin approves it.",
      action: verificationStatus === "pending" ? undefined : { label: "Upload document", verify: true },
    });
  }
  if (inProgress.length > 0) {
    tips.push({
      tone: "info",
      title: `${inProgress.length} exam${inProgress.length > 1 ? "s" : ""} in progress`,
      body: `"${inProgress[0].title}" was started but not submitted. You can resume it from Live Sessions; your saved answers are restored.`,
      action: { label: "Go to Live Sessions", tab: "Live Sessions" },
    });
  }
  const last = finished[finished.length - 1];
  if (last?.d) {
    const lastV = (last.d.violations || []).filter(isConductViolation);
    if (lastV.length === 0) {
      tips.push({ tone: "good", title: "Clean last exam", body: `No proctoring flags were recorded in "${last.a.title}". Keep the same setup next time.` });
    } else {
      const counts = new Map<string, number>();
      lastV.forEach((v) => counts.set(v.type, (counts.get(v.type) || 0) + 1));
      const [topType, topCount] = [...counts.entries()].sort((x, y) => y[1] - x[1])[0];
      tips.push({
        tone: "warn",
        title: `${topCount} × ${violationLabel(topType).toLowerCase()} flagged in your last exam`,
        body: VIOLATION_INFO[topType]?.tip ?? "Review the flagged events in History to see what triggered them.",
        action: { label: "View in History", tab: "History" },
      });
    }
  }
  breakdown
    .filter((b) => !last?.d || !(last.d.violations || []).some((v) => violationLabel(v.type) === b.label))
    .slice(0, 2)
    .forEach((b) => {
      tips.push({
        tone: "warn",
        title: `${b.label}: ${b.count} time${b.count > 1 ? "s" : ""} across your exams`,
        body: VIOLATION_INFO[b.key]?.tip ?? "Review these events in History.",
      });
    });
  const integ = finished.map(({ a }) => integrityOf(a)).filter((n): n is number => n !== null);
  if (integ.length >= 2) {
    const delta = integ[integ.length - 1] - integ[integ.length - 2];
    if (delta <= -5) tips.push({ tone: "warn", title: `Integrity dropped ${Math.abs(delta)} points since your previous exam`, body: "Check the flagged events of your latest attempt and fix your setup (lighting, camera angle, notifications) before the next one." });
    else if (delta >= 5) tips.push({ tone: "good", title: `Integrity up ${delta} points since your previous exam`, body: "Your exam setup is improving. Keep it consistent." });
  }
  if (scores.length >= 2) {
    const delta = scores[scores.length - 1] - scores[scores.length - 2];
    if (Math.abs(delta) >= 5)
      tips.push({
        tone: delta > 0 ? "good" : "info",
        title: `Score ${delta > 0 ? "up" : "down"} ${Math.abs(delta)} percentage points vs. your previous graded exam`,
        body: delta > 0 ? "Nice progress. Your faculty's feedback is in Integrity Reports." : "Review faculty feedback on your answers in Integrity Reports.",
        action: { label: "Open Integrity Reports", tab: "Integrity Reports" },
      });
  }
  if (avgIntegrity !== null && avgIntegrity >= 90 && allViolations.length === 0 && finished.length >= 2) {
    tips.push({ tone: "good", title: "Consistently excellent integrity", body: `Your average integrity is ${avgIntegrity} across ${integrities.length} exams with no flags recorded.` });
  }

  const kpis = [
    { label: "Exams taken", value: finished.length ? String(finished.length) : "0", sub: inProgress.length ? `${inProgress.length} in progress` : `${dbAssessments.length} assigned`, icon: ClipboardCheck },
    { label: "Average score", value: avgScore !== null ? `${avgScore}%` : "—", sub: scores.length ? `Across ${scores.length} graded` : "No graded exams yet", icon: Target },
    { label: "Average integrity", value: avgIntegrity !== null ? String(avgIntegrity) : "—", sub: integrities.length ? "Out of 100" : "No data yet", icon: ShieldCheck },
    {
      label: "Proctoring flags",
      value: detailsLoaded || finished.length === 0 ? String(allViolations.length) : "—",
      sub: totalWarnings ? `${totalWarnings} warning${totalWarnings > 1 ? "s" : ""} issued` : detailsLoaded ? "Recorded events" : loading ? "Loading…" : "Unavailable",
      icon: AlertTriangle,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="size-5 text-[#1a1917]" aria-hidden /> AI Insights
          </h2>
          <p className="text-xs text-[#8a8a8a] mt-1 max-w-xl">
            Personal insights computed from your own proctored attempts: scores, integrity index and the events the AI proctor recorded.
          </p>
        </div>
        {verificationStatus === "approved" && (
          <span className="inline-flex w-fit items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">
            <BadgeCheck className="size-3.5" aria-hidden /> Enrolment verified
          </span>
        )}
      </div>

      {!attemptedAny ? (
        <div className={`${card} p-8 sm:p-12 text-center`}>
          <div className="mx-auto size-12 rounded-2xl bg-[#f6f6f6] flex items-center justify-center">
            <Sparkles className="size-5 text-[#676767]" aria-hidden />
          </div>
          <h3 className="mt-4 text-base font-bold text-[#1a1917]">Insights appear after your first proctored exam</h3>
          <p className="mt-1.5 text-sm text-[#676767] max-w-md mx-auto">
            Once you complete an assessment, you'll see your score and integrity trend, what affected your integrity, and tips to improve.
          </p>
          <div className="mt-5 flex flex-col sm:flex-row gap-2 justify-center">
            {verificationRequired !== false && verificationStatus && verificationStatus !== "approved" && verificationStatus !== "pending" ? (
              <button type="button" onClick={onOpenVerify} className={`min-h-11 px-5 rounded-xl bg-[#1a1917] text-white text-sm font-semibold hover:bg-black transition cursor-pointer ${focusRing}`}>
                Verify enrolment
              </button>
            ) : (
              <button type="button" onClick={() => onNavigate("Live Sessions")} className={`min-h-11 px-5 rounded-xl bg-[#1a1917] text-white text-sm font-semibold hover:bg-black transition cursor-pointer ${focusRing}`}>
                View available exams
              </button>
            )}
            <button type="button" onClick={() => onNavigate("Documentation")} className={`min-h-11 px-5 rounded-xl border border-[#dedede] bg-white text-sm font-semibold text-[#1a1917] hover:bg-[#f6f6f6] transition cursor-pointer ${focusRing}`}>
              How proctoring works
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* KPI tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
            {kpis.map((k, i) => {
              const Icon = k.icon;
              return (
                <motion.div
                  key={k.label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.25 }}
                  className={`${card} p-4 sm:p-5`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] sm:text-[12px] font-bold text-[#8a8a8a] uppercase tracking-wider">{k.label}</span>
                    <Icon className="size-4 text-[#8a8a8a] shrink-0" aria-hidden />
                  </div>
                  <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-[#1a1917]">{k.value}</div>
                  <div className="mt-1 text-[11.5px] text-[#676767]">{k.sub}</div>
                </motion.div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
            {/* Trend chart */}
            <section className={`${card} p-5 xl:col-span-3`} aria-labelledby="trend-heading">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 id="trend-heading" className="text-base font-bold text-[#1a1917]">Score &amp; integrity over attempts</h3>
                  <p className="text-xs text-[#8a8a8a] mt-0.5">Each point is one finished attempt, oldest to newest. Both on a 0–100 scale.</p>
                </div>
                <div className="flex items-center gap-4 text-[11.5px] text-[#676767]" aria-hidden>
                  <span className="inline-flex items-center gap-1.5"><span className="w-4 h-0.5 rounded" style={{ background: SCORE_COLOR }} /> Score %</span>
                  <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed" style={{ borderColor: INTEGRITY_COLOR }} /> Integrity</span>
                </div>
              </div>
              {chartData.length === 0 ? (
                <div className="mt-4 h-[220px] flex items-center justify-center text-center text-xs text-[#8a8a8a] border border-dashed border-[#dedede] rounded-xl px-6">
                  Your trend appears once a finished attempt has a score or integrity index.
                </div>
              ) : (
                <>
                  <div className="mt-4 h-[240px]" role="img" aria-label={`Line chart of score and integrity across ${chartData.length} attempts`}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                        <CartesianGrid stroke="#f0f0f0" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#8a8a8a" }} axisLine={false} tickLine={false} />
                        <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 11, fill: "#8a8a8a" }} axisLine={false} tickLine={false} />
                        <Tooltip
                          cursor={{ stroke: "#dedede" }}
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const p = payload[0].payload as (typeof chartData)[number];
                            return (
                              <div className="bg-white border border-[#dedede] rounded-xl shadow-md px-3 py-2 text-xs">
                                <div className="font-bold text-[#1a1917] max-w-[200px] truncate">{p.title}</div>
                                <div className="text-[#8a8a8a] mb-1">{p.date}</div>
                                <div className="flex items-center gap-1.5 text-[#1a1917]"><span className="size-2 rounded-full" style={{ background: SCORE_COLOR }} /> Score: {p.score !== null ? `${p.score}%` : "Not graded"}</div>
                                <div className="flex items-center gap-1.5 text-[#1a1917]"><span className="size-2 rounded-full" style={{ background: INTEGRITY_COLOR }} /> Integrity: {p.integrity ?? "—"}</div>
                              </div>
                            );
                          }}
                        />
                        <Line type="monotone" dataKey="score" name="Score %" stroke={SCORE_COLOR} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: "#fff" }} activeDot={{ r: 5 }} connectNulls />
                        <Line type="monotone" dataKey="integrity" name="Integrity" stroke={INTEGRITY_COLOR} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 4, strokeWidth: 2, fill: "#fff" }} activeDot={{ r: 5 }} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <details className="mt-3 group">
                    <summary className={`text-[11.5px] font-semibold text-[#676767] cursor-pointer select-none rounded ${focusRing}`}>Show as table</summary>
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-[#8a8a8a]">
                            <th className="py-1.5 pr-3 font-semibold">#</th>
                            <th className="py-1.5 pr-3 font-semibold">Assessment</th>
                            <th className="py-1.5 pr-3 font-semibold">Date</th>
                            <th className="py-1.5 pr-3 font-semibold">Score</th>
                            <th className="py-1.5 font-semibold">Integrity</th>
                          </tr>
                        </thead>
                        <tbody>
                          {chartData.map((r) => (
                            <tr key={r.name} className="border-t border-[#f0f0f0] text-[#1a1917]">
                              <td className="py-1.5 pr-3">{r.name}</td>
                              <td className="py-1.5 pr-3">{r.title}</td>
                              <td className="py-1.5 pr-3 whitespace-nowrap">{r.date}</td>
                              <td className="py-1.5 pr-3">{r.score !== null ? `${r.score}%` : "—"}</td>
                              <td className="py-1.5">{r.integrity ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </>
              )}
            </section>

            {/* Breakdown */}
            <section className={`${card} p-5 xl:col-span-2`} aria-labelledby="breakdown-heading">
              <h3 id="breakdown-heading" className="text-base font-bold text-[#1a1917]">What affected your integrity</h3>
              <p className="text-xs text-[#8a8a8a] mt-0.5">Events recorded by the AI proctor across your finished exams.</p>
              <div className="mt-4">
                {loading && detailsLoaded === 0 ? (
                  <div className="flex items-center gap-2 text-xs text-[#8a8a8a] py-8 justify-center">
                    <Loader2 className="size-4 animate-spin" aria-hidden /> Loading proctoring events…
                  </div>
                ) : finished.length === 0 ? (
                  <div className="py-8 text-center text-xs text-[#8a8a8a] border border-dashed border-[#dedede] rounded-xl">Finish an exam to see this breakdown.</div>
                ) : detailsLoaded === 0 ? (
                  <div className="py-8 text-center text-xs text-[#8a8a8a] border border-dashed border-[#dedede] rounded-xl px-4">Proctoring event details couldn't be loaded right now. Try again later.</div>
                ) : breakdown.length === 0 ? (
                  <div className="py-8 text-center rounded-xl bg-emerald-50/60 border border-emerald-100 px-4">
                    <ShieldCheck className="size-6 text-emerald-600 mx-auto" aria-hidden />
                    <p className="mt-2 text-sm font-semibold text-emerald-800">No proctoring flags recorded</p>
                    <p className="text-xs text-emerald-700/80 mt-0.5">Nothing reduced your integrity in {detailsLoaded} exam{detailsLoaded > 1 ? "s" : ""}.</p>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {breakdown.slice(0, 7).map((b) => (
                      <li key={b.label}>
                        <div className="flex items-center justify-between text-xs gap-2">
                          <span className="font-semibold text-[#1a1917] truncate">{b.label}</span>
                          <span className="text-[#676767] shrink-0">
                            {b.count}×{b.points > 0 ? ` · −${b.points} pts` : ""}
                          </span>
                        </div>
                        <div className="mt-1.5 h-2 rounded-full bg-[#f6f6f6] overflow-hidden" aria-hidden>
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.max(6, (b.count / maxCount) * 100)}%` }}
                            transition={{ duration: 0.5, ease: "easeOut" }}
                            className="h-full rounded-full bg-[#1a1917]"
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {failed > 0 && detailsLoaded > 0 && (
                  <p className="mt-3 text-[11px] text-[#8a8a8a]">Details for {failed} attempt{failed > 1 ? "s" : ""} couldn't be loaded and are not included.</p>
                )}
              </div>
            </section>
          </div>

          {/* Tips */}
          <section className={`${card} p-5`} aria-labelledby="tips-heading">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="tips-heading" className="text-base font-bold text-[#1a1917] flex items-center gap-2">
                <Lightbulb className="size-4" aria-hidden /> Personal tips
              </h3>
              <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-[#676767] bg-[#f6f6f6] border border-[#dedede] px-2.5 py-1 rounded-full">
                <Info className="size-3" aria-hidden /> Rule-based from your data · not AI-generated
              </span>
            </div>
            {tips.length === 0 ? (
              <p className="mt-3 text-sm text-[#676767]">{loading ? "Analysing your attempts…" : "No specific tips right now. Complete more exams for a richer picture."}</p>
            ) : (
              <ul className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                {tips.map((t, i) => {
                  const Icon = t.tone === "good" ? TrendingUp : t.tone === "warn" ? TrendingDown : Info;
                  const tone =
                    t.tone === "good" ? "bg-emerald-50 text-emerald-700" : t.tone === "warn" ? "bg-amber-50 text-amber-700" : "bg-[#f6f6f6] text-[#676767]";
                  return (
                    <li key={i} className="flex gap-3 p-4 rounded-xl border border-[#dedede]/70 bg-white">
                      <span className={`size-8 shrink-0 rounded-lg flex items-center justify-center ${tone}`}>
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#1a1917]">{t.title}</p>
                        <p className="text-xs text-[#676767] mt-1 leading-relaxed">{t.body}</p>
                        {t.action && (
                          <button
                            type="button"
                            onClick={() => (t.action!.verify ? onOpenVerify() : t.action!.tab && onNavigate(t.action!.tab))}
                            className={`mt-2 inline-flex items-center gap-1 min-h-11 sm:min-h-0 sm:py-1 text-xs font-semibold text-[#1a1917] hover:underline cursor-pointer rounded ${focusRing}`}
                          >
                            {t.action.label} <ArrowRight className="size-3.5" aria-hidden />
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
