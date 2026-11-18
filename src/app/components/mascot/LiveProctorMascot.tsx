import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "motion/react";
import { AlertTriangle, Eye, ShieldCheck, WifiOff } from "lucide-react";
import { AgentMascot3D, type MascotExpression } from "./AgentMascot3D";

export interface LiveProctorMascotProps {
  integrityScore: number;
  warningsCount: number;
  /** "Detected" | "Missing" | "Multiple Faces" | "Looking Away" | … */
  faceStatus: string;
  monitoringHealthy: boolean;
  recording: boolean;
  beingWatched: boolean;
  /** Newest proctor notice, shown when a warning arrives. */
  latestNotice?: string;
}

type Mood = {
  key: string;
  expression: MascotExpression;
  accent: string;
  tone: "ok" | "warn" | "bad" | "info";
  title: string;
  body: string;
  icon: React.ComponentType<{ className?: string }>;
};

const CALM_LINES = [
  "All clear — you're doing great. Take your time.",
  "I'm keeping watch so you can focus on the questions.",
  "Steady and focused. Your session looks clean.",
  "Everything checks out. Keep going at your own pace.",
];

const TONE = {
  ok: { ring: "border-emerald-400/40", text: "text-emerald-300", dot: "bg-emerald-400", glow: "rgba(16,185,129,0.22)" },
  info: { ring: "border-sky-400/40", text: "text-sky-300", dot: "bg-sky-400", glow: "rgba(56,189,248,0.22)" },
  warn: { ring: "border-amber-400/50", text: "text-amber-300", dot: "bg-amber-400", glow: "rgba(245,158,11,0.25)" },
  bad: { ring: "border-rose-400/50", text: "text-rose-300", dot: "bg-rose-400", glow: "rgba(244,63,94,0.28)" },
} as const;

/**
 * Vigil, the IntegrityOS proctor-bot, live in the exam sidebar. Its expression,
 * colour and message follow the real proctoring signals so students see at a
 * glance whether everything is fine — and what to fix when it isn't.
 */
export function LiveProctorMascot({
  integrityScore,
  warningsCount,
  faceStatus,
  monitoringHealthy,
  recording,
  beingWatched,
  latestNotice,
}: LiveProctorMascotProps) {
  const reduce = useReducedMotion();
  const [calmIdx, setCalmIdx] = useState(0);
  const [alertUntil, setAlertUntil] = useState(0);
  const [pulse, setPulse] = useState(0);
  const prevWarnings = useRef(warningsCount);
  const [, force] = useState(0);
  const shake = useAnimationControls();

  useEffect(() => {
    if (pulse && !reduce) void shake.start({ x: [0, -5, 5, -3, 3, 0], transition: { duration: 0.45 } });
  }, [pulse, reduce, shake]);

  // A new warning triggers a short "alert" reaction (pulse + notice).
  useEffect(() => {
    if (warningsCount > prevWarnings.current) {
      setAlertUntil(Date.now() + 7000);
      setPulse((p) => p + 1);
      const t = window.setTimeout(() => force((n) => n + 1), 7100);
      prevWarnings.current = warningsCount;
      return () => window.clearTimeout(t);
    }
    prevWarnings.current = warningsCount;
  }, [warningsCount]);

  // Rotate reassuring lines while everything is fine.
  useEffect(() => {
    if (reduce) return;
    const t = window.setInterval(() => setCalmIdx((i) => (i + 1) % CALM_LINES.length), 9000);
    return () => window.clearInterval(t);
  }, [reduce]);

  const mood: Mood = useMemo(() => {
    const face = faceStatus.toLowerCase();
    if (!monitoringHealthy)
      return { key: "degraded", expression: "think", accent: "#f59e0b", tone: "warn", icon: WifiOff, title: "Reconnecting to proctoring", body: "Stay on this page — your answers are still being saved." };
    if (face.includes("multiple"))
      return { key: "multi", expression: "alert", accent: "#f43f5e", tone: "bad", icon: AlertTriangle, title: "More than one person seen", body: "Only you should be visible to the camera." };
    if (face.includes("missing") || face.includes("no face") || face === "not detected")
      return { key: "missing", expression: "alert", accent: "#f43f5e", tone: "bad", icon: AlertTriangle, title: "I can't see your face", body: "Move back into the camera frame and face the screen." };
    if (face.includes("away"))
      return { key: "away", expression: "focus", accent: "#f59e0b", tone: "warn", icon: Eye, title: "Eyes on the exam", body: "Looking away for long stretches is flagged for review." };
    if (Date.now() < alertUntil)
      return { key: `warn-${warningsCount}`, expression: "alert", accent: "#f59e0b", tone: "warn", icon: AlertTriangle, title: "Heads up", body: latestNotice || "Something was flagged. Keep the exam window active and stay in view." };
    if (beingWatched)
      return { key: "watched", expression: "wave", accent: "#38bdf8", tone: "info", icon: Eye, title: "A proctor is viewing live", body: "Nothing to worry about — just carry on as normal." };
    if (integrityScore < 75)
      return { key: "low", expression: "focus", accent: "#f59e0b", tone: "warn", icon: ShieldCheck, title: "Let's keep it clean", body: "A few alerts so far. Stay in frame, fullscreen and on this tab." };
    return { key: `calm-${calmIdx}`, expression: calmIdx % 2 ? "happy" : "focus", accent: "#4f6bff", tone: "ok", icon: ShieldCheck, title: "Session secure", body: CALM_LINES[calmIdx] };
  }, [faceStatus, monitoringHealthy, alertUntil, warningsCount, latestNotice, beingWatched, integrityScore, calmIdx]);

  const tone = TONE[mood.tone];

  return (
    <motion.section
      animate={shake}
      aria-label="Live session proctoring"
      className={`relative overflow-hidden rounded-2xl border ${tone.ring} bg-zinc-950/70 transition-colors duration-500`}
    >
      {/* Stage */}
      <div className="relative h-[150px]" aria-hidden="true">
        <div
          className="absolute inset-0 transition-[background] duration-700"
          style={{ background: `radial-gradient(60% 70% at 50% 45%, ${tone.glow} 0%, transparent 70%)` }}
        />
        {!reduce && (
          <>
            {/* expanding scan rings */}
            {[0, 1].map((i) => (
              <motion.span
                key={i}
                className="absolute left-1/2 top-[56%] size-24 -translate-x-1/2 -translate-y-1/2 rounded-full border"
                style={{ borderColor: mood.accent }}
                initial={{ scale: 0.6, opacity: 0.5 }}
                animate={{ scale: 1.9, opacity: 0 }}
                transition={{ duration: 2.8, repeat: Infinity, delay: i * 1.4, ease: "easeOut" }}
              />
            ))}
            {/* sweeping scan line */}
            <motion.span
              className="absolute inset-x-6 h-px"
              style={{ background: `linear-gradient(90deg, transparent, ${mood.accent}, transparent)` }}
              initial={{ top: "12%", opacity: 0 }}
              animate={{ top: ["12%", "88%", "12%"], opacity: [0, 0.8, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            />
          </>
        )}
        <AgentMascot3D accent={mood.accent} expression={mood.expression} distance={6.6} trackPage={false} />

        {/* live chips */}
        <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-full border border-zinc-700/70 bg-black/50 px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-zinc-200 backdrop-blur-sm">
          <span className={`size-1.5 rounded-full ${tone.dot} ${reduce ? "" : "animate-pulse"}`} /> Live
        </div>
        {recording && (
          <div className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-[9px] font-extrabold text-red-300">
            <span className={`size-1.5 rounded-full bg-red-500 ${reduce ? "" : "animate-pulse"}`} /> REC
          </div>
        )}
        <div className="absolute bottom-2 right-2.5 rounded-full border border-zinc-700/70 bg-black/50 px-2 py-0.5 text-[10px] font-extrabold tabular-nums text-zinc-100 backdrop-blur-sm">
          {integrityScore}%
        </div>
      </div>

      {/* Message */}
      <div className="border-t border-zinc-800/80 px-3.5 py-3">
        <div className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-zinc-500">Vigil · live session proctor</div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={mood.key}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
            aria-live="polite"
          >
            <p className={`mt-1 flex items-center gap-1.5 text-[13px] font-bold ${tone.text}`}>
              <mood.icon className="size-3.5 shrink-0" />
              {mood.title}
            </p>
            <p className="mt-0.5 text-[11.5px] leading-snug text-zinc-400">{mood.body}</p>
          </motion.div>
        </AnimatePresence>
        <HeartbeatBar tone={mood.tone} reduce={!!reduce} />
      </div>
    </motion.section>
  );
}

/** Small rolling activity strip: one bar per ~1.5 s coloured by the current state. */
function HeartbeatBar({ tone, reduce }: { tone: keyof typeof TONE; reduce: boolean }) {
  const [bars, setBars] = useState<(keyof typeof TONE)[]>(() => Array(24).fill("ok"));
  const toneRef = useRef(tone);
  toneRef.current = tone;
  useEffect(() => {
    if (reduce) return;
    const t = window.setInterval(() => setBars((b) => [...b.slice(1), toneRef.current]), 1500);
    return () => window.clearInterval(t);
  }, [reduce]);
  return (
    <div className="mt-2.5 flex h-4 items-end gap-[3px]" aria-hidden="true">
      {bars.map((b, i) => (
        <span
          key={i}
          className={`flex-1 rounded-sm ${TONE[b].dot} transition-all duration-500`}
          style={{ height: `${b === "ok" ? 35 + ((i * 37) % 30) : b === "info" ? 55 : b === "warn" ? 75 : 100}%`, opacity: 0.25 + (i / bars.length) * 0.75 }}
        />
      ))}
    </div>
  );
}
