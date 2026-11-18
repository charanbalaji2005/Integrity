import React, { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AppWindow, ScanFace, Smartphone, UserCheck, type LucideIcon } from "lucide-react";
import { AgentMascot3D, type MascotExpression } from "./AgentMascot3D";

/** The four monitoring roles the mascot acts out (order matches the landing copy). */
export const MASCOT_AGENTS: {
  key: string;
  label: string;
  color: string;
  icon: LucideIcon;
  expression: MascotExpression;
  line: string;
}[] = [
  { key: "face", label: "Face & attention", color: "#4f6bff", icon: ScanFace, expression: "focus", line: "Eyes on the screen — attention looks steady 👀" },
  { key: "objects", label: "Objects", color: "#8b5cf6", icon: Smartphone, expression: "alert", line: "Scanning the desk for phones, notes and earbuds…" },
  { key: "identity", label: "Identity", color: "#14b8c4", icon: UserCheck, expression: "happy", line: "Identity re-verified. Same student as enrolment ✓" },
  { key: "browser", label: "Browser", color: "#f59e0b", icon: AppWindow, expression: "think", line: "Hmm… fullscreen kept, no tab switches so far." },
];

// Positions of the floating agent icons around the mascot (percent of the stage)
const ICON_SPOTS = [
  { left: "10%", top: "24%" },
  { left: "80%", top: "18%" },
  { left: "84%", top: "62%" },
  { left: "6%", top: "66%" },
];

const POKE_LINES = ["Hey! I'm Vigil, your exam integrity agent 👋", "Boop! Still watching — fairly, of course.", "Every exam, defensible. That's my job ✨"];

interface MascotStageProps {
  /** Highlighted agent index, or null for the greeting state. */
  active: number | null;
  onSelect?: (i: number | null) => void;
  distance?: number;
  greeting?: string;
}

/**
 * Landing-page stage: the 3D Vigil mascot, a speech bubble and four floating
 * agent icons. Hover / tap an icon to make Vigil switch into that agent's role.
 */
export function MascotStage({ active, onSelect, distance = 6.4, greeting = POKE_LINES[0] }: MascotStageProps) {
  const reduce = useReducedMotion();
  const [poke, setPoke] = useState<number | null>(null);
  const agent = active === null ? null : MASCOT_AGENTS[active];
  const line = poke !== null ? POKE_LINES[poke] : agent ? agent.line : greeting;
  const expression: MascotExpression = poke !== null ? "wave" : agent ? agent.expression : "wave";

  const handlePoke = () => {
    setPoke((p) => ((p ?? -1) + 1) % POKE_LINES.length);
    window.setTimeout(() => setPoke(null), 2600);
  };

  return (
    <div className="absolute inset-0">
      <AgentMascot3D accent={agent?.color ?? "#4f6bff"} expression={expression} distance={distance} onPoke={handlePoke} />

      {/* Speech bubble */}
      <div className="pointer-events-none absolute inset-x-0 top-[4%] flex justify-center px-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={line}
            initial={reduce ? false : { opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="relative max-w-[320px] rounded-2xl border border-black/[0.06] bg-white/90 px-4 py-2.5 text-center text-[13px] font-medium leading-snug text-[#1f2140] shadow-[0_14px_34px_-18px_rgba(40,50,120,0.5)] backdrop-blur"
            role="status"
            aria-live="polite"
          >
            {agent && (
              <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: agent.color }}>
                {agent.label} agent
              </span>
            )}
            {line}
            <span className="absolute -bottom-1.5 left-1/2 size-3 -translate-x-1/2 rotate-45 border-b border-r border-black/[0.06] bg-white/90" />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Floating agent icons */}
      {MASCOT_AGENTS.map((a, i) => {
        const Icon = a.icon;
        const on = active === i;
        return (
          <motion.button
            key={a.key}
            type="button"
            aria-label={`${a.label} agent`}
            aria-pressed={on}
            onMouseEnter={() => onSelect?.(i)}
            onMouseLeave={() => onSelect?.(null)}
            onFocus={() => onSelect?.(i)}
            onBlur={() => onSelect?.(null)}
            onClick={() => onSelect?.(i)}
            className="absolute flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl border bg-white/85 shadow-[0_12px_28px_-14px_rgba(30,40,110,0.55)] backdrop-blur transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f6bff] sm:size-14"
            style={{ ...ICON_SPOTS[i], borderColor: on ? a.color : "rgba(0,0,0,0.06)", color: a.color }}
            animate={
              reduce
                ? { scale: on ? 1.12 : 1 }
                : { y: [0, i % 2 ? 8 : -8, 0], rotate: [0, i % 2 ? -4 : 4, 0], scale: on ? 1.15 : 1 }
            }
            transition={{ y: { duration: 4 + i * 0.6, repeat: Infinity, ease: "easeInOut" }, rotate: { duration: 5 + i, repeat: Infinity, ease: "easeInOut" }, scale: { duration: 0.25 } }}
          >
            <span
              className="absolute inset-0 rounded-2xl transition-opacity"
              style={{ backgroundColor: a.color, opacity: on ? 0.14 : 0 }}
              aria-hidden="true"
            />
            <Icon className="relative size-5 sm:size-6" aria-hidden="true" />
            {on && !reduce && (
              <motion.span
                className="absolute inset-0 rounded-2xl border-2"
                style={{ borderColor: a.color }}
                initial={{ opacity: 0.7, scale: 1 }}
                animate={{ opacity: 0, scale: 1.5 }}
                transition={{ duration: 1.2, repeat: Infinity }}
                aria-hidden="true"
              />
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
