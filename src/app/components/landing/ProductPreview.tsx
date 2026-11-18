import React, { useEffect, useRef, useState } from "react";
import { animate, motion, useInView, useReducedMotion } from "motion/react";
import { AppWindow, ScanFace, Smartphone, Users } from "lucide-react";
import { DEMO_CANDIDATES, DEMO_TIMELINE, type DemoEvent } from "./landing-data";
import { DemoBadge, SEVERITY_CLASSES } from "./primitives";

/* ---------------------------------------------------------------- */
/* Integrity score ring                                              */
/* ---------------------------------------------------------------- */
export function IntegrityRing({
  score,
  confidence,
  size = 112,
}: {
  score: number;
  confidence: number;
  size?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(reduce ? score : 0);

  useEffect(() => {
    if (!inView || reduce) {
      setDisplay(score);
      return;
    }
    const controls = animate(0, score, {
      duration: 1.4,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, score, reduce]);

  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = score >= 85 ? "#5fe1a8" : score >= 65 ? "#fbbf24" : "#fb7185";

  return (
    <div ref={ref} className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - display / 100)}
            style={{ transition: reduce ? undefined : "stroke 0.3s" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[26px] font-semibold tabular-nums tracking-tight text-white">{display}</span>
          <span className="text-[9px] font-semibold uppercase tracking-wider text-[#7d869c]">Integrity</span>
        </div>
      </div>
      <dl className="min-w-0 space-y-1.5 text-[11px] [&_dd]:whitespace-nowrap">
        <div className="flex items-center gap-2">
          <dt className="text-[#7d869c] w-[84px]">Evidence conf.</dt>
          <dd className="font-semibold tabular-nums text-white">{confidence}%</dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="text-[#7d869c] w-[84px]">Identity</dt>
          <dd className="font-semibold text-[#5fe1a8]">Verified</dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="text-[#7d869c] w-[84px]">Decision</dt>
          <dd className="font-semibold text-[#fbbf24]">Manual review</dd>
        </div>
      </dl>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Candidate camera tile (stylised, no real footage)                 */
/* ---------------------------------------------------------------- */
export function CandidateFeed({ compact = false, alert = false }: { compact?: boolean; alert?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative aspect-video overflow-hidden rounded-xl border border-white/8 bg-[radial-gradient(120%_90%_at_50%_0%,#1b2340_0%,#0b0f1d_70%)]">
      {/* Stylised candidate silhouette */}
      <svg viewBox="0 0 320 180" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <linearGradient id="sil" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#2b3560" />
            <stop offset="1" stopColor="#151b33" />
          </linearGradient>
        </defs>
        <ellipse cx="160" cy="78" rx="30" ry="36" fill="url(#sil)" />
        <path d="M92 180c6-38 34-58 68-58s62 20 68 58z" fill="url(#sil)" />
        {alert && <rect x="236" y="96" width="26" height="44" rx="5" fill="#2b3560" stroke="#fb7185" strokeWidth="1.5" />}
      </svg>

      {/* Face detection box */}
      <motion.div
        className="absolute rounded-md border border-[#5fe1a8]/80"
        style={{ left: "38%", top: "14%", width: "24%", height: "48%" }}
        animate={reduce ? undefined : { opacity: [0.65, 1, 0.65] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      >
        <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-[#5fe1a8]/15 px-1.5 py-0.5 text-[9px] font-semibold text-[#9ff0c9]">
          Face · match
        </span>
      </motion.div>

      {alert && (
        <div className="absolute rounded-md border border-[#fb7185]" style={{ left: "72%", top: "51%", width: "11%", height: "28%" }}>
          <span className="absolute -top-5 right-0 whitespace-nowrap rounded bg-[#fb7185]/15 px-1.5 py-0.5 text-[9px] font-semibold text-[#ffb3c2]">
            Phone 88%
          </span>
        </div>
      )}

      {/* HUD */}
      <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-md bg-black/45 px-2 py-1 text-[9px] font-semibold text-white backdrop-blur">
        <span className="relative flex size-1.5">
          {!reduce && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#fb7185] opacity-70" />}
          <span className="relative inline-flex size-1.5 rounded-full bg-[#fb7185]" />
        </span>
        REC
      </div>
      {!compact && (
        <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between text-[9px] font-mono text-[#aab3c8]">
          <span className="rounded bg-black/45 px-1.5 py-0.5 backdrop-blur">Gaze: center · yaw +2.1°</span>
          <span className="rounded bg-black/45 px-1.5 py-0.5 backdrop-blur">Quality 92%</span>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* AI agent status list                                              */
/* ---------------------------------------------------------------- */
const AGENTS = [
  { label: "Face analysis", icon: ScanFace, state: "Running" },
  { label: "Object detection", icon: Smartphone, state: "Running" },
  { label: "Multi-person", icon: Users, state: "Running" },
  { label: "Browser telemetry", icon: AppWindow, state: "Running" },
];

export function AgentStatus() {
  const reduce = useReducedMotion();
  return (
    <ul className="space-y-1.5">
      {AGENTS.map(({ label, icon: Icon, state }, i) => (
        <li key={label} className="flex items-center justify-between rounded-lg border border-white/6 bg-white/[0.025] px-2.5 py-1.5">
          <span className="flex items-center gap-2 text-[11px] text-[#c9cfdc]">
            <Icon className="size-3.5 text-[#8ea2ff]" aria-hidden="true" />
            {label}
          </span>
          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-[#5fe1a8]">
            <motion.span
              className="size-1.5 rounded-full bg-[#5fe1a8]"
              animate={reduce ? undefined : { opacity: [1, 0.35, 1] }}
              transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.25 }}
            />
            {state}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------- */
/* Event timeline                                                    */
/* ---------------------------------------------------------------- */
export function EventTimeline({ events, highlightLast = false }: { events: DemoEvent[]; highlightLast?: boolean }) {
  return (
    <ol className="relative space-y-2.5 before:absolute before:left-[5px] before:top-1.5 before:bottom-1.5 before:w-px before:bg-white/8">
      {events.map((e, i) => {
        const latest = highlightLast && i === events.length - 1;
        return (
          <motion.li
            key={`${e.time}-${e.label}`}
            layout
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35 }}
            className="relative flex gap-3 pl-0"
          >
            <span className={`relative z-10 mt-1 size-[11px] shrink-0 rounded-full ring-2 ring-[#0b0f1d] ${SEVERITY_CLASSES[e.severity]}`} />
            <div className={`min-w-0 flex-1 rounded-lg px-2 py-1 ${latest ? "bg-white/[0.05]" : ""}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[11.5px] font-semibold text-white">{e.label}</span>
                <span className="shrink-0 font-mono text-[10px] text-[#6f788e]">{e.time}</span>
              </div>
              <p className="truncate text-[10.5px] text-[#8b93a8]">{e.detail}</p>
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}

/* ---------------------------------------------------------------- */
/* Hero dashboard preview                                            */
/* ---------------------------------------------------------------- */
export function HeroDashboardPreview() {
  return (
    <div
      className="relative rounded-2xl border border-white/10 bg-[#0b0f1d]/90 shadow-[0_40px_120px_-30px_rgba(76,96,255,0.45)] backdrop-blur-xl"
      role="img"
      aria-label="Preview of the IntegrityOS faculty monitoring dashboard using demo data"
    >
      {/* window chrome */}
      <div className="flex items-center justify-between border-b border-white/8 px-4 py-2.5">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
        </div>
        <span className="hidden sm:block text-[11px] font-medium text-[#7d869c]">Live proctoring · Data Structures Quiz</span>
        <DemoBadge />
      </div>

      <div className="grid gap-3 p-3 sm:p-4 md:grid-cols-[170px_1fr_250px]">
        {/* candidate list */}
        <div className="hidden md:block space-y-1.5">
          <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-[#6f788e]">Candidates · 4 online</p>
          {DEMO_CANDIDATES.map((c, i) => (
            <div
              key={c.name}
              className={`flex items-center justify-between rounded-lg px-2.5 py-2 ${i === 2 ? "bg-white/[0.06] ring-1 ring-[#fb7185]/40" : "bg-white/[0.02]"}`}
            >
              <div className="min-w-0">
                <p className="truncate text-[11.5px] font-semibold text-white">{c.name}</p>
                <p
                  className={`text-[10px] ${c.tone === "ok" ? "text-[#5fe1a8]" : c.tone === "warn" ? "text-[#fbbf24]" : "text-[#fb7185]"}`}
                >
                  {c.status}
                </p>
              </div>
              <span className="font-mono text-[11px] tabular-nums text-[#c9cfdc]">{c.score}</span>
            </div>
          ))}
        </div>

        {/* main feed */}
        <div className="space-y-3">
          <CandidateFeed alert />
          <div className="grid grid-cols-3 gap-2">
            {[
              { k: "Warnings", v: "2", c: "text-[#fbbf24]" },
              { k: "Tab switches", v: "1", c: "text-white" },
              { k: "Last frame", v: "1s ago", c: "text-[#5fe1a8]" },
            ].map((m) => (
              <div key={m.k} className="rounded-lg border border-white/6 bg-white/[0.025] px-2.5 py-2">
                <p className="text-[9.5px] uppercase tracking-wider text-[#6f788e]">{m.k}</p>
                <p className={`text-[14px] font-semibold tabular-nums ${m.c}`}>{m.v}</p>
              </div>
            ))}
          </div>
        </div>

        {/* right rail */}
        <div className="space-y-3">
          <div className="rounded-xl border border-white/6 bg-white/[0.02] p-3">
            <IntegrityRing score={61} confidence={87} size={88} />
          </div>
          <div className="hidden sm:block rounded-xl border border-white/6 bg-white/[0.02] p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#6f788e]">Session activity</p>
            <EventTimeline events={DEMO_TIMELINE.slice(2)} highlightLast />
          </div>
        </div>
      </div>
    </div>
  );
}
