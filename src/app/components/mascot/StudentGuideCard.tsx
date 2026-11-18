import React, { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Camera, ChevronLeft, ChevronRight, Lightbulb, Maximize, Volume2, Wifi } from "lucide-react";
import { AgentMascot3D, type MascotExpression } from "./AgentMascot3D";

const TIPS = [
  { icon: Camera, title: "Camera ready", body: "Sit facing a light source so I can see your face clearly the whole time.", expression: "focus" as MascotExpression },
  { icon: Maximize, title: "Stay fullscreen", body: "Leaving fullscreen or switching tabs is logged — finish everything else first.", expression: "think" as MascotExpression },
  { icon: Volume2, title: "Quiet room", body: "Background voices can be flagged. A quiet space keeps your record clean.", expression: "alert" as MascotExpression },
  { icon: Wifi, title: "Stable network", body: "If you disconnect, your answers are saved and you can resume within the allowed window.", expression: "happy" as MascotExpression },
];

interface StudentGuideCardProps {
  name?: string;
  /** 0–100; drives Vigil's mood. */
  integrityScore?: number;
}

/** Student portal hero card: Vigil greets the student and rotates exam-readiness tips. */
export function StudentGuideCard({ name, integrityScore }: StudentGuideCardProps) {
  const reduce = useReducedMotion();
  const [tip, setTip] = useState(-1); // -1 = greeting
  const [paused, setPaused] = useState(false);
  const first = name?.split(" ")[0] ?? "there";

  useEffect(() => {
    if (reduce || paused) return;
    const t = window.setInterval(() => setTip((i) => (i + 1 >= TIPS.length ? 0 : i + 1)), 6000);
    return () => window.clearInterval(t);
  }, [reduce, paused]);

  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const score = integrityScore ?? 100;
  const mood = score >= 85 ? "Your integrity record looks spotless. Keep it up! ✨" : score >= 60 ? "A few alerts on record — the tips below help avoid false flags." : "Several alerts on record. Let's get your setup exam-ready together.";
  const current = tip >= 0 ? TIPS[tip] : null;
  const expression: MascotExpression = current ? current.expression : score < 60 ? "alert" : "wave";
  const accent = score < 60 ? "#f59e0b" : "#4f6bff";

  return (
    <div
      className="relative mb-5 overflow-hidden rounded-2xl border border-[#dedede] bg-[radial-gradient(120%_120%_at_0%_0%,#eef1ff_0%,#ffffff_55%)] shadow-[0_4px_20px_rgba(128,128,128,0.04)]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="grid items-center gap-2 sm:grid-cols-[220px_1fr]">
        <div className="relative h-[200px] sm:h-[220px]" aria-hidden="true">
          <AgentMascot3D accent={accent} expression={expression} distance={6.2} onPoke={() => setTip(-1)} />
        </div>

        <div className="px-5 pb-5 sm:py-5 sm:pl-0 sm:pr-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#4f6bff]">Vigil · your exam guide</p>
          <AnimatePresence mode="wait">
            <motion.div
              key={tip}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.3 }}
              aria-live="polite"
            >
              {current ? (
                <>
                  <h3 className="mt-1.5 flex items-center gap-2 text-lg font-extrabold tracking-tight text-[#1a1917]">
                    <current.icon className="size-5 text-[#4f6bff]" aria-hidden="true" />
                    {current.title}
                  </h3>
                  <p className="mt-1 max-w-xl text-[13.5px] leading-relaxed text-[#575757]">{current.body}</p>
                </>
              ) : (
                <>
                  <h3 className="mt-1.5 text-xl font-extrabold tracking-tight text-[#1a1917]">
                    {hello}, {first}! 👋
                  </h3>
                  <p className="mt-1 max-w-xl text-[13.5px] leading-relaxed text-[#575757]">{mood}</p>
                </>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous tip"
              onClick={() => setTip((i) => (i <= -1 ? TIPS.length - 1 : i - 1))}
              className="flex size-8 items-center justify-center rounded-full border border-[#dedede] bg-white text-[#575757] hover:text-[#1a1917]"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Next tip"
              onClick={() => setTip((i) => (i + 1 >= TIPS.length ? -1 : i + 1))}
              className="flex size-8 items-center justify-center rounded-full border border-[#dedede] bg-white text-[#575757] hover:text-[#1a1917]"
            >
              <ChevronRight className="size-4" />
            </button>
            <span className="ml-1 inline-flex items-center gap-1.5 text-[11.5px] font-medium text-[#8a8a8a]">
              <Lightbulb className="size-3.5" aria-hidden="true" />
              {tip >= 0 ? `Tip ${tip + 1} of ${TIPS.length}` : "Click Vigil anytime to come back here"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
