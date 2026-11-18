import React, { useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";
import { CAPABILITIES } from "./landing-data";
import { Reveal, SectionHeading, TONE_CLASSES } from "./primitives";

export function CapabilitiesSection() {
  const [activeId, setActiveId] = useState(CAPABILITIES[0].id);
  const active = CAPABILITIES.find((c) => c.id === activeId) ?? CAPABILITIES[0];
  const reduce = useReducedMotion();
  const tabsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const baseId = useId();

  // Roving tabindex: arrow keys move between capabilities (WAI-ARIA tabs pattern).
  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const last = CAPABILITIES.length - 1;
    let next: number | null = null;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = index === last ? 0 : index + 1;
    if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = last;
    if (next !== null) {
      e.preventDefault();
      setActiveId(CAPABILITIES[next].id);
      tabsRef.current[next]?.focus();
    }
  };

  const tone = TONE_CLASSES[active.tone];
  const ActiveIcon = active.icon;

  return (
    <section id="capabilities" aria-labelledby="capabilities-title" className="relative scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          id="capabilities-title"
          eyebrow="Platform capabilities"
          title="Every signal that matters, in one monitoring pipeline."
          description="Camera, identity, environment and browser signals are analysed together, confirmed over time, and stored as evidence for faculty to review."
        />

        <Reveal className="mt-12 sm:mt-16 grid gap-4 lg:grid-cols-[minmax(0,380px)_1fr] lg:gap-6">
          {/* Tab list */}
          <div
            role="tablist"
            aria-label="Platform capabilities"
            aria-orientation="vertical"
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 snap-x lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0 [scrollbar-width:none]"
          >
            {CAPABILITIES.map((c, i) => {
              const selected = c.id === activeId;
              const Icon = c.icon;
              const t = TONE_CLASSES[c.tone];
              return (
                <button
                  key={c.id}
                  ref={(el) => {
                    tabsRef.current[i] = el;
                  }}
                  id={`${baseId}-tab-${c.id}`}
                  role="tab"
                  type="button"
                  aria-selected={selected}
                  aria-controls={`${baseId}-panel`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActiveId(c.id)}
                  onKeyDown={(e) => onKeyDown(e, i)}
                  className={`group relative flex shrink-0 snap-start items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition lg:w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8ea2ff] ${
                    selected
                      ? "border-black/15 bg-white shadow-sm"
                      : "border-black/6 bg-white/40 hover:border-black/12 hover:bg-white"
                  }`}
                >
                  <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${t.bg}`}>
                    <Icon className={`size-[18px] ${t.text}`} aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block whitespace-nowrap lg:whitespace-normal text-[14px] font-semibold text-[#111111]">{c.title}</span>
                    <span className="hidden lg:block mt-0.5 text-[12.5px] leading-snug text-[#3a3a3a]">{c.summary}</span>
                  </span>
                  {selected && !reduce && (
                    <motion.span
                      layoutId="cap-indicator"
                      className="absolute inset-y-3 left-0 hidden w-[2px] rounded-full bg-gradient-to-b from-[#8ea2ff] to-[#a78bfa] lg:block"
                      transition={{ type: "spring", stiffness: 400, damping: 34 }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Panel */}
          <div
            id={`${baseId}-panel`}
            role="tabpanel"
            aria-labelledby={`${baseId}-tab-${active.id}`}
            className="relative overflow-hidden rounded-2xl border border-black/10 lg:sticky lg:top-24 lg:self-start bg-[linear-gradient(180deg,rgba(255,255,255,0.75),rgba(255,255,255,0.45))]"
          >
            <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-[radial-gradient(closest-side,rgba(110,130,255,0.18),transparent)]" />
            <AnimatePresence mode="wait">
              <motion.div
                key={active.id}
                initial={reduce ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -8 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="relative grid gap-8 p-6 sm:p-8 md:grid-cols-2 md:items-start"
              >
                <div>
                  <span className={`inline-flex size-12 items-center justify-center rounded-xl ring-1 ${tone.bg} ${tone.ring}`}>
                    <ActiveIcon className={`size-6 ${tone.text}`} aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-[22px] sm:text-[26px] font-semibold tracking-[-0.02em] text-[#111111]">{active.title}</h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-[#3a3a3a]">{active.detail}</p>
                </div>

                <div className="rounded-xl border border-black/8 bg-white/70 p-4 sm:p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#666666]">What it measures</p>
                  <ul className="mt-3 space-y-2.5">
                    {active.signals.map((s, i) => (
                      <motion.li
                        key={s}
                        initial={reduce ? false : { opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: reduce ? 0 : 0.08 * i + 0.1 }}
                        className="flex items-center gap-3 rounded-lg border border-black/6 bg-white/60 px-3 py-2.5"
                      >
                        <span className={`flex size-5 items-center justify-center rounded-full ${tone.bg}`}>
                          <Check className={`size-3 ${tone.text}`} aria-hidden="true" />
                        </span>
                        <span className="text-[13.5px] text-[#3a3a3a]">{s}</span>
                      </motion.li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
