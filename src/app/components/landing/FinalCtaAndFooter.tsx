import React from "react";
import { ArrowRight } from "lucide-react";
import { Logo, scrollToSection } from "./LandingNav";
import { LINKS } from "./landing-data";
import { PrimaryButton, Reveal, SecondaryButton } from "./primitives";

export function FinalCta({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <section aria-labelledby="cta-title" className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="relative overflow-hidden rounded-3xl border border-black/10 px-6 py-14 sm:px-12 sm:py-20 text-center">
          <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(80%_120%_at_50%_0%,rgba(91,140,255,0.28),rgba(139,92,246,0.12)_45%,transparent_75%)]" />
          <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.05)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
          <div className="relative mx-auto max-w-2xl">
            <h2 id="cta-title" className="text-[30px] leading-[1.1] sm:text-[44px] font-semibold tracking-[-0.035em] text-[#111111] text-balance">
              Make Every Examination More Trustworthy.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-[15px] sm:text-[17px] leading-relaxed text-[#3a3a3a] text-pretty">
              Bring intelligent monitoring, transparent evidence, and examination integrity together with IntegrityOS.
            </p>
            <div className="mt-9 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
              <PrimaryButton onClick={() => onNavigate(LINKS.register)}>
                Start with IntegrityOS
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </PrimaryButton>
              <SecondaryButton onClick={() => onNavigate(LINKS.login)}>Sign in</SecondaryButton>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

type FooterLink =
  | { label: string; section: string }
  | { label: string; path: string }
  | { label: string; href: string; external?: boolean };

const FOOTER_COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Platform",
    links: [
      { label: "Student sign in", path: LINKS.login },
      { label: "Faculty portal", path: LINKS.facultyLogin },
      { label: "Create account", path: LINKS.register },
    ],
  },
  {
    title: "Features",
    links: [
      { label: "Capabilities", section: "capabilities" },
      { label: "How it works", section: "how-it-works" },
      { label: "AI agents", section: "monitoring" },
      { label: "Security", section: "trust" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "API documentation", href: LINKS.docs, external: true },
      { label: "Contact support", href: LINKS.contact },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: LINKS.privacy },
      { label: "Terms of Service", href: LINKS.terms },
    ],
  },
];

const linkCls =
  "inline-flex min-h-8 items-center text-[13.5px] text-[#3a3a3a] transition hover:text-[#111111] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8ea2ff] rounded";

export function LandingFooter({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <footer className="border-t border-black/8 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-14 sm:pt-16">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div className="max-w-sm">
            <Logo />
            <p className="mt-4 text-[13.5px] leading-relaxed text-[#3a3a3a]">
              AI-powered examination monitoring and academic integrity analysis for institutions: real-time proctoring,
              traceable evidence and faculty-led review.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 lg:col-span-4">
            {FOOTER_COLUMNS.map((col) => (
              <nav key={col.title} aria-label={col.title}>
                <p className="text-[12px] font-semibold uppercase tracking-wider text-[#3a3a3a]">{col.title}</p>
                <ul className="mt-4 space-y-1.5">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      {"section" in l ? (
                        <a
                          href={`#${l.section}`}
                          onClick={(e) => {
                            e.preventDefault();
                            scrollToSection(l.section);
                          }}
                          className={linkCls}
                        >
                          {l.label}
                        </a>
                      ) : "path" in l ? (
                        <a
                          href={l.path}
                          onClick={(e) => {
                            e.preventDefault();
                            onNavigate(l.path);
                          }}
                          className={linkCls}
                        >
                          {l.label}
                        </a>
                      ) : (
                        <a
                          href={l.href}
                          className={linkCls}
                          {...(l.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                        >
                          {l.label}
                          {l.external && <span className="sr-only"> (opens in a new tab)</span>}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="mt-12 flex flex-col-reverse gap-3 border-t border-black/8 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12.5px] text-[#666666]">© {new Date().getFullYear()} IntegrityOS. All rights reserved.</p>
          <p className="text-[12.5px] text-[#666666]">Monitoring results are decision support; final decisions rest with faculty.</p>
        </div>
      </div>
    </footer>
  );
}
