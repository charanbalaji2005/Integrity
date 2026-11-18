import React, { useEffect } from "react";
import { CapabilitiesSection } from "../components/landing/CapabilitiesSection";
import { FinalCta, LandingFooter } from "../components/landing/FinalCtaAndFooter";
import { HeroSection } from "../components/landing/HeroSection";
import { LandingNav } from "../components/landing/LandingNav";
import { MonitoringPreviewSection } from "../components/landing/MonitoringPreviewSection";
import { TrustSection } from "../components/landing/TrustSection";
import { WorkflowSection } from "../components/landing/WorkflowSection";

interface LandingViewProps {
  onNavigate: (path: string) => void;
}

/**
 * Public marketing page for IntegrityOS (route "/").
 * Each section lives in components/landing; product previews use clearly
 * labelled demo data and never touch the real monitoring APIs.
 */
export function LandingView({ onNavigate }: LandingViewProps) {
  // Beige page chrome while the landing page is mounted (restored on leave),
  // so overscroll and the mobile browser UI match the design.
  useEffect(() => {
    const html = document.documentElement;
    const prevBg = html.style.backgroundColor;
    const prevScheme = html.style.colorScheme;
    html.style.backgroundColor = "#efefef";
    html.style.colorScheme = "light";

    const meta = document.querySelector('meta[name="theme-color"]');
    const prevTheme = meta?.getAttribute("content") ?? null;
    meta?.setAttribute("content", "#efefef");

    return () => {
      html.style.backgroundColor = prevBg;
      html.style.colorScheme = prevScheme;
      if (meta && prevTheme !== null) meta.setAttribute("content", prevTheme);
    };
  }, []);

  return (
    <div
      className="relative min-h-screen w-full overflow-x-clip bg-[#efefef] text-[#111111] antialiased selection:bg-[#4c66ff]/40 selection:text-[#111111]"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <LandingNav onNavigate={onNavigate} />
      <main id="main">
        <HeroSection onNavigate={onNavigate} />
        <Divider />
        <CapabilitiesSection />
        <Divider />
        <WorkflowSection />
        <MonitoringPreviewSection />
        <Divider />
        <TrustSection />
        <FinalCta onNavigate={onNavigate} />
      </main>
      <LandingFooter onNavigate={onNavigate} />
    </div>
  );
}

function Divider() {
  return (
    <div aria-hidden="true" className="mx-auto h-px max-w-5xl bg-gradient-to-r from-transparent via-black/10 to-transparent" />
  );
}
