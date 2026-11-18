import React from "react";
import { motion, useReducedMotion } from "motion/react";

/** Fade-and-rise on first scroll into view. Disabled for reduced-motion users. */
export function Reveal({
  children,
  delay = 0,
  className,
  as = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "li" | "section";
}) {
  const reduce = useReducedMotion();
  const Component = motion[as];
  return (
    <Component
      className={className}
      initial={reduce ? false : { opacity: 0, y: 18 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </Component>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  id,
}: {
  eyebrow: string;
  title: React.ReactNode;
  description?: string;
  align?: "center" | "left";
  id?: string;
}) {
  const centered = align === "center";
  return (
    <Reveal className={`max-w-2xl ${centered ? "mx-auto text-center" : ""}`}>
      <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#3b4fd8]">{eyebrow}</p>
      <h2
        id={id}
        className="mt-3 text-[30px] leading-[1.1] sm:text-[40px] font-semibold tracking-[-0.03em] text-[#111111] text-balance"
      >
        {title}
      </h2>
      {description && (
        <p className="mt-4 text-[15px] sm:text-[16px] leading-relaxed text-[#3a3a3a] text-pretty">{description}</p>
      )}
    </Reveal>
  );
}

/** Small badge marking illustrative sample data in product previews. */
export function DemoBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-200 ${className}`}
      title="Illustrative sample data, not a live session"
    >
      <span className="size-1.5 rounded-full bg-amber-300" aria-hidden="true" />
      Demo data
    </span>
  );
}

export function PrimaryButton({
  children,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#111111] px-5 py-2.5 text-[14px] font-semibold text-[#efefef] shadow-[0_1px_0_rgba(255,255,255,0.4)_inset,0_8px_24px_-8px_rgba(110,130,255,0.55)] transition hover:bg-[#2b2b2b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8ea2ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#efefef] active:scale-[0.98] cursor-pointer ${className}`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  href,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  className?: string;
}) {
  const cls = `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-black/15 bg-white/50 px-5 py-2.5 text-[14px] font-semibold text-[#111111] transition hover:border-black/30 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8ea2ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#efefef] active:scale-[0.98] cursor-pointer ${className}`;
  if (href) {
    return (
      <a href={href} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

export const TONE_CLASSES = {
  blue: { text: "text-[#2f5bd8]", bg: "bg-[#3b6cff]/12", ring: "ring-[#3b6cff]/30", dot: "bg-[#5b8cff]" },
  violet: { text: "text-[#6d3fd8]", bg: "bg-[#8b5cf6]/12", ring: "ring-[#8b5cf6]/30", dot: "bg-[#a78bfa]" },
  cyan: { text: "text-[#0e7f92]", bg: "bg-[#22d3ee]/10", ring: "ring-[#22d3ee]/30", dot: "bg-[#5fe1f2]" },
  amber: { text: "text-[#a16207]", bg: "bg-[#f59e0b]/10", ring: "ring-[#f59e0b]/30", dot: "bg-[#fbbf24]" },
  rose: { text: "text-[#c92a4b]", bg: "bg-[#f43f5e]/10", ring: "ring-[#f43f5e]/30", dot: "bg-[#fb7185]" },
} as const;

export const SEVERITY_CLASSES = {
  info: "bg-[#5b8cff]",
  low: "bg-[#a78bfa]",
  medium: "bg-[#fbbf24]",
  high: "bg-[#fb7185]",
} as const;
