import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { ClipboardList, FileCheck2, Radar } from "lucide-react";
import { WORKFLOW_STEPS } from "./landing-data";
import { Reveal, SectionHeading } from "./primitives";

const STEP_ICONS = [ClipboardList, Radar, FileCheck2];

export function WorkflowSection() {
  const reduce = useReducedMotion();

  return (
    <section id="how-it-works" aria-labelledby="workflow-title" className="relative scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          id="workflow-title"
          eyebrow="How IntegrityOS works"
          title="From exam setup to evidence-backed review."
          description="Three stages, one continuous record. Nothing is decided by the system alone: serious findings are routed to faculty."
        />

        <ol className="relative mt-14 sm:mt-20 grid gap-6 lg:grid-cols-3 lg:gap-8">
          {/* Connecting line (desktop: horizontal, mobile: vertical) */}
          <div aria-hidden="true" className="pointer-events-none absolute left-[27px] top-6 bottom-6 w-px bg-gradient-to-b from-[#8ea2ff]/50 via-[#a78bfa]/30 to-transparent lg:left-[calc(16.66%)] lg:right-[calc(16.66%)] lg:top-[27px] lg:bottom-auto lg:h-px lg:w-auto lg:bg-gradient-to-r" >
            {!reduce && (
              <motion.span
                className="absolute hidden lg:block top-[-2px] h-[5px] w-24 rounded-full bg-gradient-to-r from-transparent via-[#c4b5fd] to-transparent blur-[1px]"
                animate={{ left: ["0%", "100%"] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              />
            )}
          </div>

          {WORKFLOW_STEPS.map((s, i) => {
            const Icon = STEP_ICONS[i];
            return (
              <Reveal as="li" key={s.step} delay={i * 0.1} className="relative flex gap-5 lg:block">
                <div className="relative z-10 flex size-14 shrink-0 items-center justify-center rounded-2xl border border-black/12 bg-white shadow-[0_0_0_6px_#efefef] lg:mx-auto">
                  <Icon className="size-6 text-[#3b4fd8]" aria-hidden="true" />
                </div>
                <div className="flex-1 rounded-2xl border border-black/8 bg-white/60 p-5 sm:p-6 lg:mt-6 transition hover:border-black/15 hover:bg-white">
                  <p className="font-mono text-[12px] text-[#3b4fd8]">Step {s.step}</p>
                  <h3 className="mt-2 text-[19px] font-semibold tracking-[-0.01em] text-[#111111]">{s.title}</h3>
                  <p className="mt-2.5 text-[14px] leading-relaxed text-[#3a3a3a]">{s.body}</p>
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {s.points.map((p) => (
                      <li key={p} className="rounded-full border border-black/8 bg-white/60 px-2.5 py-1 text-[11.5px] text-[#3a3a3a]">
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
