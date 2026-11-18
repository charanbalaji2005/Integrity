import React from "react";
import { motion, useReducedMotion, type MotionValue } from "motion/react";
import { Eye, FileCheck2, ScanFace, ShieldCheck } from "lucide-react";
import { IntegrityGlobe, globeColor } from "./webgl/IntegrityGlobe";
import imgLogo from "../../imports/LoginPortalIntegrityOs/assessment_integrity_logo.png";

interface AuthBrandPanelProps {
  parallaxX?: MotionValue<number>;
  parallaxY?: MotionValue<number>;
}

const EASE = [0.22, 1, 0.36, 1] as const;

const STATS = [
  { value: "128", label: "Live sessions" },
  { value: "99.2%", label: "Match accuracy" },
  { value: "<2s", label: "Flag latency" },
];

/**
 * Left-hand product identity panel for the authentication shell (lg+ only).
 * Purely presentational — no auth logic lives here.
 */
export function AuthBrandPanel({ parallaxX, parallaxY }: AuthBrandPanelProps) {
  const reduce = !!useReducedMotion();

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-[28px] bg-[#111110] text-cream shadow-[0_30px_80px_-30px_rgba(26,25,23,0.55)]">
      {/* Backdrop: soft spotlight + fine noise-like lines */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 70% at 100% 0%, rgba(255,255,255,0.07) 0%, transparent 55%), radial-gradient(80% 60% at 0% 100%, rgba(52,211,153,0.06) 0%, transparent 60%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage: "repeating-linear-gradient(90deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 72px)",
          maskImage: "linear-gradient(to bottom, black, transparent 85%)",
        }}
      />

      <div className="relative flex h-full w-full flex-col px-10 py-9 xl:px-14 xl:py-12">
        {/* Top bar */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-white p-1.5">
              <img src={imgLogo} alt="" aria-hidden="true" className="size-full object-contain" />
            </span>
            <span className="text-lg font-semibold tracking-[-0.03em] text-white">IntegrityOS</span>
          </div>
          <span className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-white/45">
            <span className="relative flex size-1.5">
              <span className="absolute inset-0 rounded-full bg-emerald-400 opacity-70 motion-safe:animate-ping" />
              <span className="relative size-1.5 rounded-full bg-emerald-400" />
            </span>
            All systems operational
          </span>
        </motion.div>

        {/* Headline */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.08, ease: EASE }}
          className="mt-10 xl:mt-14"
        >
          <p className="mb-4 inline-flex items-center gap-2 text-[12px] font-medium text-white/50">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Exam integrity platform
          </p>
          <h2 className="max-w-[560px] text-[38px] font-semibold leading-[1.02] tracking-[-0.045em] text-white xl:text-[52px]">
            Every exam, <span className="text-white/35">watched over.</span>
            <br />
            Every grade, <span className="italic font-light text-white/90">defensible.</span>
          </h2>
          <p className="mt-5 max-w-[460px] text-[15px] leading-relaxed text-white/50">
            Identity checks, live proctoring signals and a tamper-evident evidence trail — in one quiet console.
          </p>
        </motion.div>

        {/* WebGL monitoring globe */}
        <div className="relative mt-6 min-h-[220px] flex-1 xl:mt-8" aria-hidden="true">
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.2, delay: 0.15, ease: EASE }}
            style={reduce ? undefined : { x: parallaxX, y: parallaxY }}
            className="absolute inset-0"
          >
            {/* soft glow behind the sphere */}
            <div className="absolute left-1/2 top-1/2 size-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(52,211,153,0.16),transparent)]" />
            <IntegrityGlobe
              base={globeColor("#f5f5f4")}
              accent={globeColor("#34d399")}
              intensity={0.95}
              points={2400}
              pointSize={2.3}
            />
          </motion.div>

          <GlobeChip className="left-0 top-[10%]" delay={0.6} icon={ScanFace} label="Identity re-verified" />
          <GlobeChip className="right-0 top-[38%]" delay={0.75} icon={Eye} label="Gaze tracking" live />
          <GlobeChip className="bottom-[8%] left-[6%]" delay={0.9} icon={FileCheck2} label="Evidence sealed" />
        </div>

        {/* Stats strip */}
        <motion.dl
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="mt-8 grid grid-cols-3 border-t border-white/10 pt-6"
        >
          {STATS.map((s, i) => (
            <div key={s.label} className={i > 0 ? "border-l border-white/10 pl-6" : ""}>
              <dt className="text-[11px] uppercase tracking-[0.12em] text-white/40">{s.label}</dt>
              <dd className="mt-1.5 font-mono text-2xl font-medium tracking-tight text-white">{s.value}</dd>
            </div>
          ))}
        </motion.dl>
      </div>
    </div>
  );
}

/* ───────── Floating label over the globe ───────── */

function GlobeChip({
  className,
  delay,
  icon: Icon,
  label,
  live = false,
}: {
  className: string;
  delay: number;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  live?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay, ease: EASE }}
      className={`absolute flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[12px] font-medium text-white/75 shadow-[0_12px_30px_-12px_rgba(0,0,0,0.8)] backdrop-blur-md ${className}`}
    >
      <Icon className="size-3.5 text-emerald-300" />
      {label}
      {live && (
        <span className="relative ml-0.5 flex size-1.5">
          <span className="absolute inset-0 rounded-full bg-emerald-400 opacity-70 motion-safe:animate-ping" />
          <span className="relative size-1.5 rounded-full bg-emerald-400" />
        </span>
      )}
    </motion.div>
  );
}
