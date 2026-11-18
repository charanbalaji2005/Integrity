import React, { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import { AppWindow, MousePointer2, ScanFace, Smartphone, UserCheck } from "lucide-react";
import { MascotStage, MASCOT_AGENTS } from "../mascot/MascotStage";
import { Reveal, SectionHeading } from "./primitives";

const AGENT_COPY = [
  {
    icon: ScanFace,
    title: "Face & attention agent",
    body: "Tracks face presence, head pose, gaze, eye closure and possible speech, confirming behaviour over several seconds before flagging it.",
  },
  {
    icon: Smartphone,
    title: "Object detection agent",
    body: "Looks for phones, secondary screens, books and earphones in the workspace. A failed detector is reported as inconclusive, never as clean.",
  },
  {
    icon: UserCheck,
    title: "Identity agent",
    body: "Compares the live face with the one enrolled at calibration and flags static or frozen camera streams.",
  },
  {
    icon: AppWindow,
    title: "Browser agent",
    body: "Records tab switches, focus loss, fullscreen exits and developer tools alongside the camera evidence.",
  },
];

/**
 * "AI agents" section: an interactive 3D integrity core with the four
 * monitoring agents orbiting it. Hovering an agent highlights its orbit.
 */
export function MonitoringPreviewSection() {
  const reduce = useReducedMotion();
  const [hovered, setHovered] = useState<number | null>(null);
  const [auto, setAuto] = useState(0);

  // Gently cycle the highlight while the user isn't interacting.
  useEffect(() => {
    if (reduce || hovered !== null) return;
    const t = setInterval(() => setAuto((i) => (i + 1) % MASCOT_AGENTS.length), 3200);
    return () => clearInterval(t);
  }, [reduce, hovered]);

  const active = hovered ?? (reduce ? null : auto);

  return (
    <section id="monitoring" aria-labelledby="agents-title" className="relative scroll-mt-20 py-20 sm:py-28">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          id="agents-title"
          eyebrow="AI agents"
          title="Meet Vigil. Four agents in one."
          description="Vigil switches between four specialised roles, each watching a different signal. Their findings meet in the evidence engine, which confirms them over time and decides when faculty should review."
        />

        <div className="mt-12 sm:mt-16 grid items-center gap-8 lg:grid-cols-[1.5fr_1fr] lg:gap-10">
          <Reveal>
            <div className="relative aspect-square w-full min-h-[360px] overflow-hidden rounded-[28px] border border-black/[0.06] bg-[radial-gradient(120%_90%_at_50%_10%,#ffffff_0%,#eef0fb_45%,#e3e6f6_100%)] shadow-[0_30px_80px_-40px_rgba(60,70,160,0.45)] sm:aspect-[4/3] lg:aspect-[6/5] lg:min-h-[620px]">
              <MascotStage active={active} onSelect={setHovered} distance={6.8} />
              <div className="pointer-events-none absolute bottom-4 left-4 flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-[#3a3a3a] shadow-sm backdrop-blur">
                <MousePointer2 className="size-3.5" aria-hidden="true" />
                Vigil follows your cursor · click to say hi
              </div>
            </div>
          </Reveal>

          <ul className="grid gap-3" aria-label="Monitoring agents">
            {AGENT_COPY.map((a, i) => {
              const Icon = a.icon;
              const isActive = active === i;
              const color = MASCOT_AGENTS[i].color;
              return (
                <Reveal as="li" key={a.title} delay={i * 0.06}>
                  <button
                    type="button"
                    onMouseEnter={() => setHovered(i)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(i)}
                    onBlur={() => setHovered(null)}
                    aria-pressed={isActive}
                    className={`flex w-full items-start gap-4 rounded-2xl border p-4 sm:p-5 text-left transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f6bff] ${
                      isActive ? "border-black/10 bg-white shadow-[0_12px_30px_-18px_rgba(40,50,120,0.45)]" : "border-black/[0.06] bg-white/50 hover:bg-white/80"
                    }`}
                  >
                    <span
                      className="flex size-11 shrink-0 items-center justify-center rounded-xl transition"
                      style={{ backgroundColor: `${color}${isActive ? "26" : "14"}`, color }}
                    >
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-[15.5px] font-semibold text-[#111111]">
                        <span className="size-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
                        {a.title}
                      </span>
                      <span className="mt-1 block text-[13.5px] leading-relaxed text-[#3a3a3a]">{a.body}</span>
                    </span>
                  </button>
                </Reveal>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
