import React, { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Eye, ScanFace, ShieldCheck } from "lucide-react";
import { scrollToSection } from "./LandingNav";
import { LINKS } from "./landing-data";
import { PrimaryButton, SecondaryButton } from "./primitives";
import { IntegrityReportIllustration } from "./IntegrityReportIllustration";
import { MascotStage, MASCOT_AGENTS } from "../mascot/MascotStage";

export function HeroSection({ onNavigate }: { onNavigate: (path: string) => void }) {
  const reduce = useReducedMotion();
  const [hovered, setHovered] = useState<number | null>(null);
  const [auto, setAuto] = useState(0);

  // Vigil greets first, then cycles through the agent roles while the visitor isn't interacting.
  useEffect(() => {
    if (reduce || hovered !== null) return;
    const t = setInterval(() => setAuto((i) => (i + 1) % (MASCOT_AGENTS.length + 1)), 3400);
    return () => clearInterval(t);
  }, [reduce, hovered]);
  const activeAgent = hovered ?? (reduce || auto === 0 ? null : auto - 1);
  const rise = (delay: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const, delay },
        };

  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden pt-28 sm:pt-36 pb-16 sm:pb-24">
      {/* Background: soft radial light + fine grid, kept subtle on purpose */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-18%] h-[640px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(76,102,255,0.28),transparent)]" />
        <div className="absolute right-[-10%] top-[30%] h-[420px] w-[520px] rounded-full bg-[radial-gradient(closest-side,rgba(139,92,246,0.18),transparent)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.05)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-6 lg:grid-cols-[1.05fr_1fr] lg:gap-4">
        <div className="mx-auto max-w-3xl text-center lg:mx-0 lg:text-left">
          <motion.p
            {...rise(0)}
            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/60 px-3 py-1 text-[12px] font-medium text-[#3a3a3a]"
          >
            <span className="flex size-1.5 rounded-full bg-[#5fe1a8]" aria-hidden="true" />
            AI-powered examination monitoring
          </motion.p>

          <motion.h1
            {...rise(0.06)}
            id="hero-title"
            className="mt-6 text-[40px] leading-[1.04] sm:text-[60px] lg:text-[60px] xl:text-[66px] font-semibold tracking-[-0.045em] text-[#111111] text-balance"
          >
            Examination Integrity.<br className="hidden sm:block" />{" "}
            <span className="bg-gradient-to-r from-[#2f3fbf] via-[#5b3fd0] to-[#7c4ddb] bg-clip-text text-transparent">
              Powered by Intelligence.
            </span>
          </motion.h1>

          <motion.p
            {...rise(0.14)}
            className="mx-auto lg:mx-0 mt-6 max-w-2xl text-[16px] sm:text-[18px] leading-relaxed text-[#3a3a3a] text-pretty"
          >
            An intelligent examination monitoring platform that combines real-time AI analysis, behavioral monitoring,
            and automated evidence collection to protect the integrity of every assessment.
          </motion.p>

          <motion.div {...rise(0.22)} className="mt-9 flex flex-col sm:flex-row items-stretch sm:items-center justify-center lg:justify-start gap-3">
            <PrimaryButton onClick={() => onNavigate(LINKS.register)}>
              Get Started
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </PrimaryButton>
            <SecondaryButton onClick={() => scrollToSection("capabilities")}>Explore Platform</SecondaryButton>
          </motion.div>

          <motion.p {...rise(0.28)} className="mt-4 text-[12.5px] text-[#666666]">
            Faculty?{" "}
            <button
              type="button"
              onClick={() => onNavigate(LINKS.facultyLogin)}
              className="font-medium text-[#3b4fd8] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8ea2ff] rounded cursor-pointer"
            >
              Open the faculty portal
            </button>
          </motion.p>
        </div>

        {/* Vigil — the animated 3D integrity agent */}
        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 0.94 }}
          animate={reduce ? undefined : { opacity: 1, scale: 1 }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
          className="relative mx-auto w-full max-w-[600px]"
        >
          <div aria-hidden="true" className="absolute inset-[12%] rounded-full bg-[radial-gradient(closest-side,rgba(91,110,255,0.22),rgba(139,92,246,0.10)_55%,transparent)] blur-2xl" />
          <div
            className="relative aspect-square w-full"
            aria-label="Vigil, the IntegrityOS AI agent. Hover an agent icon to see what it watches; click Vigil to say hi."
          >
            <MascotStage active={activeAgent} onSelect={setHovered} distance={6.6} />
          </div>
          <ul className="relative -mt-2 flex flex-wrap justify-center gap-2" aria-label="Monitoring agents">
            {MASCOT_AGENTS.map(({ label }, i) => {
              const on = activeAgent === i;
              return (
                <li key={label}>
                  <button
                    type="button"
                    onMouseEnter={() => setHovered(i)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(i)}
                    onBlur={() => setHovered(null)}
                    onClick={() => scrollToSection("monitoring")}
                    className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-[12.5px] font-semibold transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f6bff] ${
                      on ? "border-black/10 bg-white text-[#111111] shadow-sm" : "border-black/[0.06] bg-white/50 text-[#3a3a3a] hover:bg-white/80"
                    }`}
                  >
                    <span className="size-2 rounded-full" style={{ backgroundColor: MASCOT_AGENTS[i].color }} aria-hidden="true" />
                    {label}
                  </button>
                </li>
              );
            })}
          </ul>
        </motion.div>
        </div>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 40, scale: 0.98 }}
          animate={reduce ? undefined : { opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
          className="relative mx-auto mt-14 sm:mt-20 max-w-5xl"
        >
          <div aria-hidden="true" className="absolute -inset-6 -z-10 rounded-[40px] bg-[radial-gradient(closest-side,rgba(76,102,255,0.35),transparent)] blur-2xl" />
          <IntegrityReportIllustration className="rounded-[28px] shadow-[0_40px_80px_-30px_rgba(49,46,129,0.55)]" />
        </motion.div>

        {/* Status chips sit in their own row so they never cover the preview */}
        <motion.ul
          {...rise(0.5)}
          aria-label="Example monitoring signals"
          className="mx-auto mt-6 flex max-w-6xl flex-wrap items-center justify-center gap-3"
        >
          {[
            { icon: ScanFace, k: "Identity", v: "Re-verified · 10s ago" },
            { icon: Eye, k: "Gaze", v: "Centered" },
            { icon: ShieldCheck, k: "Evidence", v: "6 events captured" },
          ].map(({ icon: Icon, k, v }) => (
            <li
              key={k}
              className="flex items-center gap-3 rounded-xl border border-black/10 bg-white/80 px-3.5 py-2.5 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.25)]"
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-[#3b4fd8]/10">
                <Icon className="size-4 text-[#3b4fd8]" aria-hidden="true" />
              </span>
              <span className="text-left">
                <span className="block text-[11px] text-[#666666]">{k}</span>
                <span className="block text-[13px] font-semibold text-[#111111]">{v}</span>
              </span>
            </li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}
