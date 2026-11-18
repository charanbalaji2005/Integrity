import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Menu, X } from "lucide-react";
import imgLogo from "../../../imports/LoginPortalIntegrityOs/assessment_integrity_logo.png";
import { LINKS, NAV_SECTIONS } from "./landing-data";

export function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  // Move focus for keyboard/screen-reader users without a second scroll jump.
  el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-white/95 p-1 shadow-[0_0_0_1px_rgba(255,255,255,0.1)]">
        <img src={imgLogo} alt="" className="h-full w-full object-contain" />
      </span>
      <span className="text-[17px] font-semibold tracking-[-0.02em] text-[#111111]">IntegrityOS</span>
    </span>
  );
}

export function LandingNav({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the mobile menu on Escape and lock background scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const go = (id: string) => {
    setOpen(false);
    // Wait for the menu to close so the scroll target is measured correctly.
    requestAnimationFrame(() => scrollToSection(id));
  };

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300 ${
        scrolled || open ? "border-b border-black/8 bg-[#efefef]/80 backdrop-blur-xl" : "border-b border-transparent"
      }`}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-[#efefef]"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8ea2ff] cursor-pointer"
          aria-label="IntegrityOS, back to top"
        >
          <Logo />
        </button>

        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV_SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    go(s.id);
                  }}
                  className="rounded-lg px-3 py-2 text-[13.5px] font-medium text-[#3a3a3a] transition hover:bg-white hover:text-[#111111] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8ea2ff]"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden md:flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate(LINKS.login)}
            className="min-h-10 rounded-lg px-3.5 text-[13.5px] font-medium text-[#3a3a3a] transition hover:text-[#111111] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8ea2ff] cursor-pointer"
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => onNavigate(LINKS.register)}
            className="min-h-10 rounded-lg bg-[#111111] px-4 text-[13.5px] font-semibold text-[#efefef] transition hover:bg-[#2b2b2b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8ea2ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#efefef] cursor-pointer"
          >
            Get Started
          </button>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="md:hidden flex size-10 items-center justify-center rounded-lg border border-black/10 text-[#111111] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8ea2ff] cursor-pointer"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav
            id="mobile-menu"
            aria-label="Mobile"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="md:hidden overflow-hidden border-t border-black/8 bg-[#efefef]/95 backdrop-blur-xl"
          >
            <ul className="px-4 py-3">
              {NAV_SECTIONS.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      go(s.id);
                    }}
                    className="flex min-h-12 items-center rounded-lg px-3 text-[15px] font-medium text-[#3a3a3a] hover:bg-white hover:text-[#111111]"
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="grid grid-cols-2 gap-2 border-t border-black/8 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => onNavigate(LINKS.login)}
                className="min-h-11 rounded-xl border border-black/12 text-[14px] font-semibold text-[#111111] cursor-pointer"
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => onNavigate(LINKS.register)}
                className="min-h-11 rounded-xl bg-[#111111] text-[14px] font-semibold text-[#efefef] cursor-pointer"
              >
                Get Started
              </button>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
