import React from "react";
import { Eye, FileSearch, KeyRound, Lock, RefreshCw } from "lucide-react";
import { TRUST_POINTS } from "./landing-data";
import { Reveal, SectionHeading } from "./primitives";

const ICONS = [Lock, KeyRound, FileSearch, RefreshCw, Eye];

export function TrustSection() {
  const [first, ...rest] = TRUST_POINTS;
  const FirstIcon = ICONS[0];

  return (
    <section id="trust" aria-labelledby="trust-title" className="relative scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          id="trust-title"
          eyebrow="Security & trust"
          title="Built so evidence can be trusted, and questioned."
          description="Integrity decisions affect real people. IntegrityOS is designed around access control, traceable evidence and honest reporting of what was and wasn't observed."
        />

        <div className="mt-12 sm:mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Feature card spans two rows on large screens */}
          <Reveal className="relative overflow-hidden rounded-2xl border border-black/10 bg-[linear-gradient(160deg,rgba(91,140,255,0.14),rgba(139,92,246,0.06)_45%,rgba(255,255,255,0.5))] p-6 sm:p-8 md:col-span-2 lg:col-span-1 lg:row-span-2">
            <span className="flex size-11 items-center justify-center rounded-xl bg-black/5 ring-1 ring-black/15">
              <FirstIcon className="size-5 text-[#111111]" aria-hidden="true" />
            </span>
            <h3 className="mt-5 text-[22px] font-semibold tracking-[-0.02em] text-[#111111]">{first.title}</h3>
            <p className="mt-3 text-[15px] leading-relaxed text-[#3a3a3a]">{first.body}</p>
            <div className="mt-8 rounded-xl border border-black/10 bg-white/70 p-4 font-mono text-[11.5px] leading-relaxed text-[#3a3a3a]" aria-hidden="true">
              <p><span className="text-[#3b4fd8]">request</span> POST /process-frame</p>
              <p><span className="text-[#0f8a56]">✓</span> session verified</p>
              <p><span className="text-[#0f8a56]">✓</span> attempt owned by caller</p>
              <p><span className="text-[#0f8a56]">✓</span> attempt still active</p>
              <p><span className="text-[#6d3fd8]">→</span> frame queued for analysis</p>
            </div>
          </Reveal>

          {rest.map((p, i) => {
            const Icon = ICONS[i + 1];
            return (
              <Reveal
                key={p.title}
                delay={(i + 1) * 0.06}
                className="rounded-2xl border border-black/8 bg-white/60 p-6 transition hover:border-black/15 hover:bg-white"
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-[#3b6cff]/12">
                  <Icon className="size-[18px] text-[#3b4fd8]" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-[16.5px] font-semibold text-[#111111]">{p.title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-[#3a3a3a]">{p.body}</p>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
