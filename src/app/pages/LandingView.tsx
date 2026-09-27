import React, { useEffect, useRef, useState } from "react";
import { motion, useInView, useMotionValue, useSpring, animate, AnimatePresence } from "motion/react";
// Flaticon UIcons are used via CDN
import imgLogo from "../../imports/LoginPortalIntegrityOs/assessment_integrity_logo.png";
import imgHero from "../../imports/LoginPortalIntegrityOs/246cb418eb5fc0839fc05c1e211063549b0c188b.png";

const OPTIONS_DETAIL = {
  "AI Detection": {
    category: "Platform",
    icon: "fi fi-rr-brain",
    description: "Advanced artificial intelligence detection engine that identifies AI-generated content across assignments, examinations, essays, reports, and academic submissions. Our system analyzes linguistic patterns, writing consistency, token probability, and contextual authenticity to help institutions maintain academic integrity."
  },
  "Plagiarism Engine": {
    category: "Platform",
    icon: "fi fi-rr-search-alt",
    description: "Comprehensive plagiarism detection system that compares submitted content against academic databases, web sources, institutional repositories, and previous submissions. Generate detailed similarity reports with source attribution and confidence scoring."
  },
  "Behavioral Analysis": {
    category: "Platform",
    icon: "fi fi-rr-fingerprint",
    description: "Monitor student interaction patterns, assessment behavior, response timing, navigation activities, and suspicious actions during assessments. Behavioral analytics help identify irregularities while maintaining a fair and secure examination environment."
  },
  "Live Monitoring": {
    category: "Platform",
    icon: "fi fi-rr-chart-line-up",
    description: "Real-time assessment supervision with activity tracking, risk scoring, violation detection, and live alerts. Administrators gain immediate visibility into ongoing assessments and potential integrity concerns."
  },
  "API Integrations": {
    category: "Platform",
    icon: "fi fi-rr-plug",
    description: "Seamlessly integrate IntegrityOS with Learning Management Systems (LMS), Student Information Systems (SIS), examination platforms, authentication providers, and third-party academic tools through secure enterprise APIs."
  },
  "Universities": {
    category: "Solutions",
    icon: "fi fi-rr-graduation-cap",
    description: "Enterprise-grade academic integrity solutions designed for higher education institutions. Support large-scale assessments, accreditation requirements, faculty oversight, and institutional compliance with advanced monitoring and reporting capabilities."
  },
  "Certification Bodies": {
    category: "Solutions",
    icon: "fi fi-rr-award",
    description: "Secure examination infrastructure for professional certification providers. Ensure candidate authenticity, prevent misconduct, and maintain the credibility of certifications through AI-powered integrity verification."
  },
  "Corporate Training": {
    category: "Solutions",
    icon: "fi fi-rr-briefcase",
    description: "Protect employee assessments, compliance examinations, certification programs, and internal evaluations. Verify learning outcomes while maintaining fairness and accountability across organizational training initiatives."
  },
  "Government Exams": {
    category: "Solutions",
    icon: "fi fi-rr-bank",
    description: "Scalable integrity solutions for public sector examinations, recruitment assessments, and competitive testing environments. Deliver secure, transparent, and reliable examination processes at scale."
  },
  "Online Proctoring": {
    category: "Solutions",
    icon: "fi fi-rr-desktop",
    description: "Advanced remote assessment monitoring powered by AI-driven supervision, identity verification, activity analysis, and integrity reporting. Enable secure online examinations without compromising candidate experience."
  },
  "About": {
    category: "Company",
    icon: "fi fi-rr-info",
    description: "IntegrityOS is an AI-powered Assessment Integrity Platform dedicated to helping educational institutions, certification organizations, and enterprises maintain trust, fairness, and transparency in assessments through intelligent monitoring and advanced analytics."
  },
  "Security": {
    category: "Company",
    icon: "fi fi-rr-shield-check",
    description: "Enterprise-grade security architecture featuring encrypted data transmission, secure authentication, role-based access controls, audit logging, infrastructure monitoring, and compliance-focused security practices to protect institutional and student data."
  },
  "Compliance": {
    category: "Company",
    icon: "fi fi-rr-balance-scale",
    description: "Designed to support institutional governance, academic regulations, privacy requirements, and industry best practices. IntegrityOS promotes responsible data handling, transparency, accountability, and ethical AI usage."
  },
  "Privacy Policy": {
    category: "Company",
    icon: "fi fi-rr-lock",
    description: "Learn how IntegrityOS collects, processes, stores, and protects personal and institutional data. Our Privacy Policy outlines user rights, data security measures, retention practices, and privacy commitments."
  },
  "Terms of Service": {
    category: "Company",
    icon: "fi fi-rr-document",
    description: "Review the terms governing access to and use of IntegrityOS services. The Terms of Service define user responsibilities, platform usage guidelines, service limitations, intellectual property rights, and compliance expectations."
  }
};

/* ─── smooth scroll helper ─── */
function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ─── animated counter ─── */
function Counter({ to, decimals = 0, suffix = "", duration = 2 }: { to: number; decimals?: number; suffix?: string; duration?: number }) {
  const nodeRef = useRef<HTMLSpanElement>(null);
  const inView = useInView(nodeRef, { once: true });
  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, to, {
      duration,
      ease: "easeOut",
      onUpdate(v) {
        if (nodeRef.current) nodeRef.current.textContent = v.toFixed(decimals) + suffix;
      },
    });
    return controls.stop;
  }, [inView, to, decimals, suffix, duration]);
  return <span ref={nodeRef}>0{suffix}</span>;
}

/* ─── section reveal wrapper ─── */
function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ─── spotlight card ─── */
function SpotlightCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0, show: false });
  return (
    <div
      ref={cardRef}
      className={`relative overflow-hidden ${className}`}
      onMouseMove={(e) => {
        const rect = cardRef.current!.getBoundingClientRect();
        setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top, show: true });
      }}
      onMouseLeave={() => setPos((p) => ({ ...p, show: false }))}
    >
      {pos.show && (
        <div
          className="pointer-events-none absolute z-0 rounded-full transition-opacity duration-300"
          style={{
            width: 300,
            height: 300,
            left: pos.x - 150,
            top: pos.y - 150,
            background: "radial-gradient(circle, rgba(197,175,138,0.12) 0%, transparent 70%)",
          }}
        />
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/* ─── animated orb ─── */
function IntegrityOrb() {
  return (
    <div className="relative flex items-center justify-center w-56 h-56 mx-auto">
      {/* outer rings */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute rounded-full border border-[#c5af8a]/20"
          style={{ width: 80 + i * 52, height: 80 + i * 52 }}
          animate={{ rotate: i % 2 === 0 ? 360 : -360, scale: [1, 1.04, 1] }}
          transition={{ rotate: { duration: 12 + i * 4, repeat: Infinity, ease: "linear" }, scale: { duration: 4 + i * 2, repeat: Infinity, ease: "easeInOut" } }}
        />
      ))}
      {/* glow */}
      <div className="absolute w-24 h-24 rounded-full bg-[#c5af8a]/20 blur-2xl" />
      {/* core */}
      <motion.div
        className="relative z-10 w-20 h-20 rounded-full bg-gradient-to-br from-[#1f1e1a] to-[#3a3830] flex items-center justify-center shadow-[0_0_40px_rgba(197,175,138,0.3)]"
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        <img src={imgLogo} alt="IntegrityOS" className="w-10 h-10 object-contain" />
      </motion.div>
      {/* orbit dot */}
      <motion.div
        className="absolute w-3 h-3 rounded-full bg-[#c5af8a] shadow-[0_0_8px_rgba(197,175,138,0.8)]"
        style={{ top: "50%", left: "50%", translateX: "-50%", translateY: "-50%" }}
        animate={{ rotate: 360 }}
        transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
        // orbit at 88px radius
        transformTemplate={({ rotate }) => `rotate(${rotate}) translateX(88px) rotate(-${rotate})`}
      />
    </div>
  );
}

/* ─── live feed item ─── */
const FEED_ITEMS = [
  { icon: <i className="fi fi-rr-shield-exclamation text-[16px]"></i>, msg: "Fraud pattern detected — Session #48291", time: "just now", color: "text-rose-500" },
  { icon: <i className="fi fi-rr-check-circle text-[16px]"></i>, msg: "Assessment completed — SRM-CS-401 batch", time: "2s ago", color: "text-emerald-500" },
  { icon: <i className="fi fi-rr-search-alt text-[16px]"></i>, msg: "Plagiarism scan: 97.4% original — Student #2847", time: "5s ago", color: "text-sky-500" },
  { icon: <i className="fi fi-rr-bolt text-[16px]"></i>, msg: "AI model re-calibrated — Accuracy 99.8%", time: "12s ago", color: "text-amber-500" },
  { icon: <i className="fi fi-rr-bank text-[16px]"></i>, msg: "New institution onboarded — 3,200 students", time: "28s ago", color: "text-violet-500" },
  { icon: <i className="fi fi-rr-chart-pie-alt text-[16px]"></i>, msg: "Weekly integrity report generated", time: "1m ago", color: "text-[#c5af8a]" },
];

function LiveFeed() {
  const [items, setItems] = useState(FEED_ITEMS);
  useEffect(() => {
    const t = setInterval(() => {
      setItems((prev) => {
        const copy = [...prev];
        const first = copy.shift()!;
        copy.push({ ...first, time: "just now" });
        return copy;
      });
    }, 3000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex flex-col gap-2">
      <AnimatePresence initial={false}>
        {items.slice(0, 4).map((item, i) => (
          <motion.div
            key={item.msg}
            layout
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/60 border border-[#e8e2d8]/60 backdrop-blur-sm"
          >
            <span className="text-lg">{item.icon}</span>
            <p className={`text-[12px] font-semibold flex-1 ${item.color}`}>{item.msg}</p>
            <span className="text-[10px] text-[#9a9590] font-medium shrink-0">{item.time}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ─── detection pipeline ─── */
const PIPELINE_STEPS = [
  { label: "Input Processing", icon: <i className="fi fi-rr-download text-lg"></i>, pct: 100 },
  { label: "AI Content Scan", icon: <i className="fi fi-rr-robot text-lg"></i>, pct: 94 },
  { label: "Plagiarism Engine", icon: <i className="fi fi-rr-search-alt text-lg"></i>, pct: 88 },
  { label: "Behavior Analysis", icon: <i className="fi fi-rr-brain text-lg"></i>, pct: 76 },
  { label: "Risk Scoring", icon: <i className="fi fi-rr-shield-exclamation text-lg"></i>, pct: 62 },
  { label: "Integrity Report", icon: <i className="fi fi-rr-document text-lg"></i>, pct: 48 },
];

function DetectionPipeline() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });
  return (
    <div ref={ref} className="flex flex-col gap-3">
      {PIPELINE_STEPS.map((step, i) => (
        <motion.div
          key={step.label}
          initial={{ opacity: 0, x: -20 }}
          animate={inView ? { opacity: 1, x: 0 } : {}}
          transition={{ delay: i * 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-center gap-4"
        >
          <span className="text-xl w-8 text-center shrink-0">{step.icon}</span>
          <div className="flex-1">
            <div className="flex justify-between mb-1">
              <span className="text-[11px] font-bold text-[#3a3830]">{step.label}</span>
              <span className="text-[11px] font-bold text-[#c5af8a]">{step.pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-[#ede7dc] overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-[#c5af8a] to-[#1f1e1a]"
                initial={{ width: 0 }}
                animate={inView ? { width: `${step.pct}%` } : {}}
                transition={{ delay: i * 0.1 + 0.3, duration: 0.8, ease: "easeOut" }}
              />
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/* ─── heatmap grid ─── */
function HeatmapGrid() {
  const cells = Array.from({ length: 56 }, (_, i) => Math.random());
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(8, 1fr)" }}>
      {cells.map((v, i) => (
        <motion.div
          key={i}
          className="aspect-square rounded-sm"
          style={{ backgroundColor: `rgba(197,175,138,${v * 0.9 + 0.05})` }}
          animate={{ opacity: [1, 0.6, 1] }}
          transition={{ duration: 2 + Math.random() * 2, delay: Math.random() * 2, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

/* ─── metric card ─── */
function MetricCard({ label, value, sub, icon, color = "#c5af8a", delay = 0 }: { label: string; value: React.ReactNode; sub: string; icon: React.ReactNode; color?: string; delay?: number }) {
  return (
    <Reveal delay={delay}>
      <SpotlightCard className="rounded-2xl border border-[#e8e2d8]/80 bg-white/80 backdrop-blur-sm p-6 hover:shadow-[0_8px_32px_rgba(142,126,98,0.12)] transition-shadow duration-300">
        <div className="flex items-start justify-between mb-4">
          <div className="text-2xl">{icon}</div>
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ backgroundColor: `${color}15`, color }}>
            <span className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: color }} />
            Live
          </span>
        </div>
        <div className="text-3xl font-bold tracking-tight text-[#1f1e1a] mb-1">{value}</div>
        <div className="text-xs font-bold text-[#6b6861] uppercase tracking-wider mb-0.5">{label}</div>
        <div className="text-[11px] text-[#9a9590]">{sub}</div>
      </SpotlightCard>
    </Reveal>
  );
}

/* ─── bento feature card ─── */
function BentoCard({ title, desc, icon, children, className = "", delay = 0 }: { title: string; desc: string; icon: React.ReactNode; children?: React.ReactNode; className?: string; delay?: number }) {
  return (
    <Reveal delay={delay} className={className}>
      <SpotlightCard className="h-full rounded-3xl border border-[#e8e2d8]/80 bg-white/90 backdrop-blur-sm p-8 flex flex-col gap-5 hover:shadow-[0_16px_48px_rgba(142,126,98,0.1)] transition-all duration-500 group">
        <div className="text-3xl">{icon}</div>
        <div>
          <h3 className="text-xl font-bold text-[#1f1e1a] mb-2 tracking-tight">{title}</h3>
          <p className="text-[14px] text-[#6b6861] leading-relaxed">{desc}</p>
        </div>
        {children && <div className="mt-auto">{children}</div>}
      </SpotlightCard>
    </Reveal>
  );
}

/* ═══════════════════════════════════════════════════ MAIN ═══ */
interface LandingViewProps {
  onNavigate: (path: string) => void;
}

export function LandingView({ onNavigate }: LandingViewProps) {
  const [scrolled, setScrolled] = useState(false);
  const [activeModalData, setActiveModalData] = useState<{
    title: string;
    category: string;
    description: string;
    icon: string;
  } | null>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { stiffness: 60, damping: 18 });
  const springY = useSpring(mouseY, { stiffness: 60, damping: 18 });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleMouseMove = (e: React.MouseEvent) => {
    const { left, top, width, height } = (e.currentTarget as HTMLElement).getBoundingClientRect();
    mouseX.set(((e.clientX - left) / width - 0.5) * 20);
    mouseY.set(((e.clientY - top) / height - 0.5) * 20);
  };

  return (
    <div
      className="text-[#1a1917] bg-[#f5f0e6] min-h-screen w-full relative overflow-x-hidden selection:bg-[#eae3d2] selection:text-[#1a1917]"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      {/* ── Background watermark ── */}
      <div className="fixed inset-0 pointer-events-none z-0 flex items-center justify-center overflow-hidden">
        <img src={imgLogo} alt="" className="w-[60vw] max-w-[800px] opacity-[0.025] select-none" style={{ filter: "grayscale(1)" }} />
      </div>

      {/* ══════════════════ NAVBAR ══════════════════ */}
      <header className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? "bg-[#f5f0e6]/90 backdrop-blur-2xl shadow-sm border-b border-[#1a1917]/5" : "bg-transparent"}`}>
        <div className="max-w-7xl mx-auto px-6 flex justify-between items-center h-18 py-4">
          <div className="flex items-center gap-2.5">
            <img src={imgLogo} alt="IntegrityOS" className="h-9 w-auto object-contain" />
            <span className="text-[22px] font-extrabold tracking-[-1px] text-[#1f1e1a]">IntegrityOS</span>
          </div>
          <nav className="hidden md:flex items-center gap-8">
            {["Platform", "Security", "Solutions", "Pricing", "Docs"].map((item) => (
              <a key={item} href="#" onClick={(e) => e.preventDefault()} className="text-[13px] font-semibold text-[#6b6861] hover:text-[#1f1e1a] transition-colors tracking-tight">
                {item}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <button onClick={() => onNavigate("/login")} className="px-5 py-2 text-[13px] font-bold text-[#1f1e1a] hover:bg-[#1f1e1a]/5 rounded-full transition-all cursor-pointer bg-transparent border-none outline-none">
              Sign In
            </button>
            <button onClick={() => onNavigate("/login")} className="px-6 py-2.5 bg-[#1f1e1a] text-white text-[13px] font-bold rounded-full shadow-[0_4px_14px_rgba(0,0,0,0.12)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.18)] hover:-translate-y-0.5 active:scale-95 transition-all cursor-pointer border-none">
              Get Started →
            </button>
          </div>
        </div>
      </header>

      <main className="pt-16">
        {/* ══════════════════ HERO ══════════════════ */}
        <section id="hero" className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden pt-16 pb-24" onMouseMove={handleMouseMove}>
          {/* ambient blobs */}
          <motion.div className="absolute -top-40 -left-40 w-[700px] h-[700px] rounded-full bg-[#ebdcc9]/50 blur-[140px] pointer-events-none" animate={{ scale: [1, 1.1, 1], x: [-20, 20, -20] }} transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }} />
          <motion.div className="absolute -bottom-40 -right-20 w-[600px] h-[600px] rounded-full bg-[#dfd8cc]/60 blur-[130px] pointer-events-none" animate={{ scale: [1.1, 0.9, 1.1], x: [20, -20, 20] }} transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }} />

          <div className="relative z-10 max-w-7xl mx-auto px-6 w-full">
            <div className="text-center mb-20">
              {/* badge */}
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#1f1e1a]/6 border border-[#1f1e1a]/10 mb-8">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[11px] font-bold uppercase tracking-[2.5px] text-[#1f1e1a]">System Integrity 2.0 — Now Live</span>
              </motion.div>

              {/* headline */}
              <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }} className="text-[60px] md:text-[82px] font-extrabold leading-[1.02] tracking-[-0.05em] text-[#1f1e1a] max-w-5xl mx-auto mb-8">
                Enterprise AI for
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#c5af8a] via-[#b89c6e] to-[#8a6e40]">Academic Integrity</span>
              </motion.h1>

              {/* sub */}
              <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.25 }} className="text-[18px] md:text-[20px] text-[#6b6861] max-w-2xl mx-auto mb-12 leading-relaxed font-medium">
                The gold standard for university-grade assessment monitoring. AI-powered detection, plagiarism analysis, and behavioral monitoring — all in one command center.
              </motion.p>

              {/* CTAs */}
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.35 }} className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <button onClick={() => onNavigate("/login")} className="px-10 py-4 bg-[#1f1e1a] text-white text-[15px] font-bold rounded-2xl shadow-[0_20px_40px_-8px_rgba(0,0,0,0.25)] hover:shadow-[0_28px_48px_-8px_rgba(0,0,0,0.32)] hover:-translate-y-1 active:scale-95 transition-all cursor-pointer border-none flex items-center gap-2.5">
                  Access Portal
                  <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-sm">→</span>
                </button>
                <button onClick={() => onNavigate("/login")} className="px-10 py-4 bg-white border-2 border-[#e8e2d8] text-[#1f1e1a] text-[15px] font-bold rounded-2xl hover:border-[#c5af8a]/60 hover:shadow-[0_8px_24px_rgba(197,175,138,0.15)] hover:-translate-y-0.5 active:scale-95 transition-all cursor-pointer">
                  View Demo
                </button>
              </motion.div>

              {/* trust badges */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="flex flex-wrap justify-center gap-6 mt-10">
                {["SOC 2 Type II", "ISO 27001", "GDPR Compliant", "99.9% Uptime"].map((badge) => (
                  <span key={badge} className="flex items-center gap-1.5 text-[11px] font-bold text-[#9a9590]">
                    <span className="text-emerald-500">✓</span> {badge}
                  </span>
                ))}
              </motion.div>
            </div>

            {/* ── AI Command Center Cards ── */}
            <div className="relative">
              <div className="grid grid-cols-12 gap-5">
                {/* Left cards */}
                <motion.div initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5, duration: 0.8, ease: [0.22, 1, 0.36, 1] }} className="col-span-3 flex flex-col gap-4">
                  {/* Fraud Detection */}
                  <div className="rounded-2xl border border-[#e8e2d8]/80 bg-white/80 backdrop-blur-xl p-5 shadow-[0_4px_24px_rgba(142,126,98,0.08)]">
                    <div className="flex items-center gap-2 mb-3">
                      <motion.span className="w-2 h-2 rounded-full bg-rose-500" animate={{ scale: [1, 1.4, 1] }} transition={{ duration: 1.4, repeat: Infinity }} />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600">Fraud Detection</span>
                    </div>
                    <div className="text-2xl font-extrabold text-[#1f1e1a] mb-1">14</div>
                    <div className="text-[11px] text-[#9a9590]">Anomalies flagged today</div>
                    <div className="mt-3 h-1.5 rounded-full bg-[#fde8e8] overflow-hidden">
                      <motion.div className="h-full bg-rose-500 rounded-full" initial={{ width: 0 }} animate={{ width: "28%" }} transition={{ delay: 0.8, duration: 1, ease: "easeOut" }} />
                    </div>
                  </div>

                  {/* Similarity Score */}
                  <div className="rounded-2xl border border-[#e8e2d8]/80 bg-white/80 backdrop-blur-xl p-5 shadow-[0_4px_24px_rgba(142,126,98,0.08)]">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#9a9590] mb-2">Avg. Similarity</div>
                    <div className="text-3xl font-extrabold text-[#1f1e1a] mb-1">4.2%</div>
                    <div className="text-[11px] text-emerald-600 font-semibold">↓ Well below threshold</div>
                  </div>

                  {/* Status */}
                  <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50/60 backdrop-blur-xl p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">System Online</span>
                    </div>
                    <div className="text-[12px] text-emerald-800 font-semibold">All agents operational</div>
                    <div className="text-[11px] text-emerald-600 mt-1">Last sync: 2s ago</div>
                  </div>
                </motion.div>

                {/* Center — hero image */}
                <motion.div
                  className="col-span-6"
                  initial={{ opacity: 0, scale: 0.92, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ delay: 0.4, duration: 1, ease: [0.22, 1, 0.36, 1] }}
                  style={{ x: springX, y: springY }}
                >
                  <div className="rounded-3xl overflow-hidden border-2 border-white/70 shadow-[0_40px_100px_-20px_rgba(142,126,98,0.25)] relative">
                    <img src={imgHero} alt="AI Integrity Command Center" className="w-full aspect-[4/3] object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#1f1e1a]/20 via-transparent to-transparent" />
                    {/* overlay badge */}
                    <motion.div
                      className="absolute bottom-4 left-4 right-4 flex items-center justify-between bg-white/90 backdrop-blur-xl rounded-2xl px-4 py-3 border border-white/60 shadow-lg"
                      animate={{ y: [-3, 3, -3] }}
                      transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <div className="flex items-center gap-2">
                        <img src={imgLogo} alt="" className="w-6 h-6 object-contain" />
                        <span className="text-[13px] font-bold text-[#1f1e1a]">IntegrityOS Command Center</span>
                      </div>
                      <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Live
                      </span>
                    </motion.div>
                  </div>
                </motion.div>

                {/* Right cards */}
                <motion.div initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5, duration: 0.8, ease: [0.22, 1, 0.36, 1] }} className="col-span-3 flex flex-col gap-4">
                  {/* Accuracy Rate */}
                  <div className="rounded-2xl border border-[#e8e2d8]/80 bg-white/80 backdrop-blur-xl p-5 shadow-[0_4px_24px_rgba(142,126,98,0.08)]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#58448c]">Detection Accuracy</span>
                      <svg className="w-8 h-8 -rotate-90" viewBox="0 0 32 32">
                        <circle cx="16" cy="16" r="12" stroke="#ebdcc9" strokeWidth="3" fill="none" />
                        <motion.circle cx="16" cy="16" r="12" stroke="#58448c" strokeWidth="3" fill="none"
                          strokeDasharray={75.4}
                          initial={{ strokeDashoffset: 75.4 }}
                          animate={{ strokeDashoffset: 75.4 * 0.002 }}
                          transition={{ delay: 0.8, duration: 1.5, ease: "easeOut" }}
                        />
                      </svg>
                    </div>
                    <div className="text-3xl font-extrabold text-[#1f1e1a]">99.8%</div>
                    <div className="text-[11px] text-[#9a9590]">AI model precision</div>
                  </div>

                  {/* Assessments */}
                  <div className="rounded-2xl border border-[#e8e2d8]/80 bg-white/80 backdrop-blur-xl p-5 shadow-[0_4px_24px_rgba(142,126,98,0.08)]">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#9a9590] mb-2">Monitored Today</div>
                    <div className="text-3xl font-extrabold text-[#1f1e1a] mb-1">8,492</div>
                    <div className="text-[11px] text-[#c5af8a] font-semibold">↑ 12% vs yesterday</div>
                    {/* mini sparkline */}
                    <svg className="w-full h-8 mt-2 text-[#c5af8a]" viewBox="0 0 100 30" preserveAspectRatio="none">
                      <motion.polyline points="0,25 16,18 32,22 48,10 64,15 80,8 100,12"
                        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 1, duration: 1.2 }} />
                    </svg>
                  </div>

                  {/* Institutions */}
                  <div className="rounded-2xl border border-[#e8e2d8]/80 bg-white/80 backdrop-blur-xl p-5 shadow-[0_4px_24px_rgba(142,126,98,0.08)]">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#9a9590] mb-2">Institutions Protected</div>
                    <div className="text-3xl font-extrabold text-[#1f1e1a]">500+</div>
                    <div className="text-[11px] text-sky-600 font-semibold">Globally trusted</div>
                  </div>
                </motion.div>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════ STATS BAR ══════════════════ */}
        <section id="stats" className="py-16 border-y border-[#e8e2d8]/60 bg-white/60 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {[
                { label: "Detection Accuracy", to: 99.8, decimals: 1, suffix: "%", sub: "AI-powered precision" },
                { label: "Assessments Monitored", to: 2.4, decimals: 1, suffix: "M+", sub: "Across all institutions" },
                { label: "Institutions Protected", to: 500, decimals: 0, suffix: "+", sub: "Universities & colleges" },
                { label: "Avg Response Time", to: 48, decimals: 0, suffix: "ms", sub: "Real-time analysis" },
              ].map((stat, i) => (
                <Reveal key={stat.label} delay={i * 0.1} className="text-center">
                  <div className="text-[40px] font-extrabold tracking-tight text-[#1f1e1a] leading-none mb-1">
                    <Counter to={stat.to} decimals={stat.decimals} suffix={stat.suffix} />
                  </div>
                  <div className="text-[12px] font-bold uppercase tracking-wider text-[#1f1e1a] mb-0.5">{stat.label}</div>
                  <div className="text-[12px] text-[#9a9590]">{stat.sub}</div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════ BENTO GRID ══════════════════ */}
        <section className="py-32 bg-[#f5f0e6]">
          <div className="max-w-7xl mx-auto px-6">
            <Reveal className="text-center mb-16">
              <span className="text-[11px] font-bold uppercase tracking-[3px] text-[#c5af8a] mb-4 block">Platform Capabilities</span>
              <h2 className="text-[48px] md:text-[56px] font-extrabold tracking-[-0.04em] text-[#1f1e1a] mb-5">Everything you need to secure academic integrity</h2>
              <p className="text-[17px] text-[#6b6861] max-w-2xl mx-auto leading-relaxed">A unified AI platform covering every dimension of assessment integrity, from content detection to behavioral analysis.</p>
            </Reveal>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
              {/* AI Detection — large card */}
              <BentoCard
                className="md:col-span-7"
                delay={0}
                title="AI Content Detection"
                desc="Multi-model ensemble for detecting AI-generated content, paraphrasing tools, and essay spinners with 99.8% accuracy across 47 languages."
                icon="🤖"
              >
                <DetectionPipeline />
              </BentoCard>

              {/* Live Feed */}
              <BentoCard
                className="md:col-span-5"
                delay={0.1}
                title="Real-Time Activity Feed"
                desc="Live stream of all assessment events, flags, and AI decisions across your institution."
                icon="⚡"
              >
                <LiveFeed />
              </BentoCard>

              {/* Heatmap */}
              <BentoCard
                className="md:col-span-4"
                delay={0.15}
                title="Fraud Detection Heatmap"
                desc="Visual representation of suspicious activity patterns across all assessments."
                icon="🗺️"
              >
                <HeatmapGrid />
              </BentoCard>

              {/* Orb — integrity score */}
              <BentoCard
                className="md:col-span-4"
                delay={0.2}
                title="Integrity Score Orb"
                desc="Real-time holistic integrity score synthesizing all detection signals."
                icon="🔮"
              >
                <IntegrityOrb />
              </BentoCard>

              {/* Behavior analysis */}
              <BentoCard
                className="md:col-span-4"
                delay={0.25}
                title="Behavioral Biometrics"
                desc="Keystroke dynamics, mouse patterns, and physiological signals identify impersonation without storing biometric data."
                icon="🧠"
              >
                <div className="space-y-2.5 mt-2">
                  {[["Keystroke cadence", "98%"], ["Mouse dynamics", "94%"], ["Focus tracking", "91%"], ["Tab-switch detection", "100%"]].map(([label, val]) => (
                    <div key={label} className="flex items-center gap-3">
                      <span className="text-[12px] text-[#6b6861] w-36 shrink-0">{label}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-[#ede7dc] overflow-hidden">
                        <motion.div className="h-full rounded-full bg-[#1f1e1a]" initial={{ width: 0 }} whileInView={{ width: val }} transition={{ duration: 0.8, ease: "easeOut" }} viewport={{ once: true }} />
                      </div>
                      <span className="text-[11px] font-bold text-[#c5af8a] w-8 text-right">{val}</span>
                    </div>
                  ))}
                </div>
              </BentoCard>

              {/* Plagiarism */}
              <BentoCard
                className="md:col-span-5"
                delay={0.1}
                title="Plagiarism Detection Engine"
                desc="Cross-referenced against 95B+ academic papers, web content, and institutional repositories."
                icon="🔍"
              >
                <div className="flex gap-4 mt-2">
                  {[{ label: "Academic Papers", val: 95, unit: "B+" }, { label: "Web Pages", val: 62, unit: "T+" }, { label: "Match Types", val: 14, unit: "" }].map((s) => (
                    <div key={s.label} className="flex-1 rounded-xl bg-[#f5f0e6]/80 p-3 text-center">
                      <div className="text-xl font-extrabold text-[#1f1e1a]">{s.val}{s.unit}</div>
                      <div className="text-[10px] text-[#9a9590] font-semibold">{s.label}</div>
                    </div>
                  ))}
                </div>
              </BentoCard>

              {/* Institutional analytics */}
              <BentoCard
                className="md:col-span-7"
                delay={0.15}
                title="Institutional Analytics Dashboard"
                desc="Department-level risk scoring, cohort comparisons, longitudinal integrity trends, and exportable compliance reports."
                icon="📊"
              >
                <div className="grid grid-cols-3 gap-3 mt-2">
                  {[["Dept. Risk Score", "2.4", "Low"], ["Incidents MTD", "18", "−32%"], ["Compliance Rate", "99.1%", "A+"]].map(([label, val, sub]) => (
                    <div key={label as string} className="rounded-xl bg-[#f5f0e6]/80 p-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#9a9590] mb-1">{label}</div>
                      <div className="text-xl font-extrabold text-[#1f1e1a]">{val}</div>
                      <div className="text-[11px] text-emerald-600 font-semibold">{sub}</div>
                    </div>
                  ))}
                </div>
              </BentoCard>
            </div>
          </div>
        </section>

        {/* ══════════════════ METRICS GRID ══════════════════ */}
        <section id="metrics" className="py-24 bg-white">
          <div className="max-w-7xl mx-auto px-6">
            <Reveal className="text-center mb-14">
              <h2 className="text-[40px] font-extrabold tracking-[-0.04em] text-[#1f1e1a] mb-4">Live Platform Metrics</h2>
              <p className="text-[16px] text-[#6b6861]">Real-time data from our global assessment network</p>
            </Reveal>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricCard label="Detection Accuracy" value={<Counter to={99.8} decimals={1} suffix="%" />} sub="AI ensemble model" icon={<i className="fi fi-rr-bullseye"></i>} color="#58448c" delay={0} />
              <MetricCard label="Live Assessments" value={<Counter to={1247} />} sub="Running right now" icon={<i className="fi fi-rr-signal-stream"></i>} color="#c25f3c" delay={0.08} />
              <MetricCard label="Threats Blocked" value={<Counter to={38291} />} sub="This month" icon={<i className="fi fi-rr-shield-check"></i>} color="#c5af8a" delay={0.16} />
              <MetricCard label="Response Time" value={<><Counter to={48} />ms</>} sub="p99 latency" icon={<i className="fi fi-rr-bolt"></i>} color="#059669" delay={0.24} />
            </div>
          </div>
        </section>

        {/* ══════════════════ DARK SHIELD SECTION ══════════════════ */}
        <section id="security" className="py-32 bg-[#1f1e1a] text-white relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_60%_40%,rgba(197,175,138,0.12)_0%,transparent_60%)]" />
            <div className="absolute bottom-0 right-0 w-[600px] h-[600px] rounded-full bg-[#c5af8a]/5 blur-[100px]" />
          </div>
          <div className="max-w-7xl mx-auto px-6 relative z-10">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
              <div>
                <Reveal>
                  <span className="text-[#c5af8a] text-[11px] font-bold uppercase tracking-[3px] mb-5 block">Proprietary Technology</span>
                  <h2 className="text-[52px] font-extrabold tracking-[-0.04em] leading-[1.05] mb-8">The Integrity Shield™ Engine</h2>
                  <p className="text-white/50 text-[17px] leading-relaxed mb-10">Our multi-stage AI pipeline processes every assessment through six layers of verification before issuing a confidence-rated integrity verdict.</p>
                </Reveal>
                <div className="space-y-6">
                  {[
                    { icon: <i className="fi fi-rr-network-cloud"></i>, title: "Multi-stage Neural Processing", desc: "Advanced tokenization and cleaning to eliminate variance and false positives across 47 languages." },
                    { icon: <i className="fi fi-rr-fingerprint"></i>, title: "Identity DNA Mapping", desc: "Physiological interaction patterns verify identity without storing invasive biometric data." },
                    { icon: <i className="fi fi-rr-globe"></i>, title: "Global Knowledge Graph", desc: "Cross-reference against 95B+ academic documents in real time with sub-50ms response." },
                    { icon: <i className="fi fi-rr-users-alt"></i>, title: "Multi-Agent Collaboration", desc: "Specialized AI agents collaborate to reach consensus on complex integrity edge cases." },
                  ].map((item, i) => (
                    <Reveal key={item.title} delay={i * 0.1}>
                      <div className="flex gap-5 group">
                        <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-xl group-hover:bg-white/10 transition-colors">
                          {item.icon}
                        </div>
                        <div>
                          <h4 className="text-[16px] font-bold mb-1.5">{item.title}</h4>
                          <p className="text-white/45 text-[14px] leading-relaxed">{item.desc}</p>
                        </div>
                      </div>
                    </Reveal>
                  ))}
                </div>
              </div>
              <Reveal delay={0.2}>
                <div className="relative">
                  <div className="absolute -inset-8 bg-[#c5af8a]/10 blur-[80px] rounded-full" />
                  <div className="relative rounded-3xl border border-white/10 bg-white/5 backdrop-blur-sm p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <img src={imgLogo} alt="" className="w-8 h-8 object-contain" />
                      <span className="font-bold text-white">AI Detection Pipeline</span>
                      <span className="ml-auto flex items-center gap-1.5 text-[11px] font-bold text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Processing
                      </span>
                    </div>
                    <div className="space-y-3">
                      {PIPELINE_STEPS.map((step, i) => (
                        <motion.div key={step.label} className="flex items-center gap-3" initial={{ opacity: 0, x: -16 }} whileInView={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08, duration: 0.4 }} viewport={{ once: true }}>
                          <span className="text-lg w-7 text-center">{step.icon}</span>
                          <div className="flex-1">
                            <div className="flex justify-between mb-1">
                              <span className="text-[11px] font-semibold text-white/70">{step.label}</span>
                              <span className="text-[11px] font-bold text-[#c5af8a]">{step.pct}%</span>
                            </div>
                            <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                              <motion.div className="h-full rounded-full bg-gradient-to-r from-[#c5af8a] to-white" initial={{ width: 0 }} whileInView={{ width: `${step.pct}%` }} transition={{ delay: i * 0.08 + 0.3, duration: 0.7 }} viewport={{ once: true }} />
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ══════════════════ FEATURES GRID ══════════════════ */}
        <section className="py-32 bg-[#f5f0e6]">
          <div className="max-w-7xl mx-auto px-6">
            <Reveal className="text-center mb-16">
              <span className="text-[11px] font-bold uppercase tracking-[3px] text-[#c5af8a] mb-4 block">Complete Platform</span>
              <h2 className="text-[44px] font-extrabold tracking-[-0.04em] text-[#1f1e1a] mb-4">Built for every stakeholder</h2>
            </Reveal>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {[
                { icon: <i className="fi fi-rr-graduation-cap"></i>, title: "Student Workspace", desc: "Zero-distraction environment with focus-locking, real-time biometric verification, and seamless UX." },
                { icon: <i className="fi fi-rr-building"></i>, title: "Admin Console", desc: "Unprecedented institutional oversight. Real-time risk scoring, automated flags, and granular audit logs." },
                { icon: <i className="fi fi-rr-chart-histogram"></i>, title: "Analytics Dashboard", desc: "Department-level insights, cohort comparisons, longitudinal trends, and automated compliance reports." },
                { icon: <i className="fi fi-rr-link-alt"></i>, title: "API Integrations", desc: "Native connectors for Canvas, Moodle, Blackboard, Google Classroom, and 20+ LMS platforms." },
                { icon: <i className="fi fi-rr-globe"></i>, title: "Multi-Language Support", desc: "AI detection and plagiarism analysis across 47 languages with equal accuracy." },
                { icon: <i className="fi fi-rr-cloud"></i>, title: "Enterprise Security", desc: "SOC 2 Type II, ISO 27001, FERPA compliant. Data never leaves your regional infrastructure." },
                { icon: <i className="fi fi-rr-clipboard-list-check"></i>, title: "Live Integrity Reports", desc: "Automated, customizable reports with AI-generated summaries and remediation recommendations." },
                { icon: <i className="fi fi-rr-robot"></i>, title: "Multi-Agent AI Processing", desc: "Ensemble of specialized AI agents that collaborate to eliminate false positives." },
                { icon: <i className="fi fi-rr-gears"></i>, title: "Workflow Automation", desc: "Custom assessment pipelines, escalation rules, and automated case management for your team." },
              ].map((f, i) => (
                <Reveal key={f.title} delay={(i % 3) * 0.08}>
                  <SpotlightCard className="h-full rounded-2xl border border-[#e8e2d8]/80 bg-white/80 backdrop-blur-sm p-7 hover:shadow-[0_8px_32px_rgba(142,126,98,0.1)] transition-all duration-300 group cursor-default">
                    <div className="text-2xl mb-4">{f.icon}</div>
                    <h3 className="text-[16px] font-bold text-[#1f1e1a] mb-2 tracking-tight">{f.title}</h3>
                    <p className="text-[13px] text-[#6b6861] leading-relaxed">{f.desc}</p>
                  </SpotlightCard>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════ FOR WHO ══════════════════ */}
        <section id="solutions" className="py-28 bg-white">
          <div className="max-w-7xl mx-auto px-6">
            <Reveal className="text-center mb-14">
              <h2 className="text-[42px] font-extrabold tracking-[-0.04em] text-[#1f1e1a] mb-4">Who it's built for</h2>
              <p className="text-[16px] text-[#6b6861]">Tailored experiences for every role in the assessment lifecycle.</p>
            </Reveal>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Reveal delay={0.05}>
                <SpotlightCard className="rounded-3xl border border-[#e8e2d8]/80 bg-[#f5f0e6]/40 p-12 flex flex-col justify-between min-h-[360px]">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#9a9590] mb-5 block">Target 01 / Learners</span>
                    <h3 className="text-[36px] font-extrabold text-[#1f1e1a] mb-5 tracking-tight">For Students</h3>
                    <p className="text-[15px] text-[#6b6861] leading-relaxed mb-8 max-w-md">Protect your hard-earned accomplishments. A fair, distraction-free testing ground where integrity is rewarded and academic honesty is preserved.</p>
                  </div>
                  <button onClick={() => onNavigate("/login")} className="w-full py-4 rounded-2xl border-2 border-[#1f1e1a] text-[#1f1e1a] font-bold text-[15px] hover:bg-[#1f1e1a] hover:text-white transition-all cursor-pointer">
                    Student Guide →
                  </button>
                </SpotlightCard>
              </Reveal>
              <Reveal delay={0.1}>
                <div className="rounded-3xl bg-[#1f1e1a] p-12 flex flex-col justify-between min-h-[360px] text-white relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-[#c5af8a]/10 blur-[60px]" />
                  <div className="relative">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-5 block">Target 02 / Institutional</span>
                    <h3 className="text-[36px] font-extrabold text-white mb-5 tracking-tight">For Institutions</h3>
                    <p className="text-[15px] text-white/60 leading-relaxed mb-8 max-w-md">Uphold the prestige of your certifications. Gain deep visibility into assessment health and secure your institution's academic future.</p>
                  </div>
                  <button onClick={() => onNavigate("/login")} className="relative w-full py-4 rounded-2xl bg-[#c5af8a] text-white font-bold text-[15px] hover:bg-[#b89c6e] transition-all cursor-pointer border-none shadow-[0_8px_24px_rgba(197,175,138,0.3)] hover:shadow-[0_12px_32px_rgba(197,175,138,0.4)] hover:-translate-y-0.5 active:scale-95">
                    Institutional Access →
                  </button>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ══════════════════ CTA ══════════════════ */}
        <section id="cta" className="py-40 bg-[#1f1e1a] text-center relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-[#c5af8a]/8 blur-[120px]" />
          </div>
          {/* watermark */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03]">
            <img src={imgLogo} alt="" className="w-[400px]" />
          </div>
          <Reveal className="relative z-10 max-w-4xl mx-auto px-6">
            <div className="flex items-center justify-center mb-8">
              <img src={imgLogo} alt="IntegrityOS" className="h-14 w-auto object-contain opacity-80" />
            </div>
            <h2 className="text-[56px] md:text-[68px] font-extrabold tracking-[-0.05em] text-white mb-6 leading-tight">
              Deploy Your Secure<br />
              <span className="text-[#c5af8a]">Environment Today.</span>
            </h2>
            <p className="text-[18px] text-white/50 mb-12 leading-relaxed">Join 500+ leading institutions securing academic futures with IntegrityOS.</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button onClick={() => onNavigate("/login")} className="px-12 py-5 bg-white text-[#1f1e1a] text-[16px] font-bold rounded-full shadow-[0_8px_32px_rgba(255,255,255,0.1)] hover:shadow-[0_12px_40px_rgba(255,255,255,0.15)] hover:-translate-y-1 active:scale-95 transition-all cursor-pointer border-none">
                Get Started Now →
              </button>
              <button onClick={() => onNavigate("/login")} className="px-12 py-5 border-2 border-white/20 text-white text-[16px] font-bold rounded-full hover:border-white/40 hover:-translate-y-0.5 transition-all cursor-pointer">
                Schedule Demo
              </button>
            </div>
            <div className="flex flex-wrap justify-center gap-8 mt-12">
              {["No credit card required", "SOC 2 Certified", "24/7 Enterprise Support", "Free onboarding"].map((item) => (
                <span key={item} className="flex items-center gap-2 text-[13px] font-medium text-white/40">
                  <span className="text-[#c5af8a]">✓</span> {item}
                </span>
              ))}
            </div>
          </Reveal>
        </section>
      </main>

      {/* ══════════════════ FOOTER ══════════════════ */}
      <footer className="bg-[#fafaf8] border-t border-[#1a1917]/5 py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
            <div className="md:col-span-1">
              <div className="flex items-center gap-2.5 mb-4">
                <img src={imgLogo} alt="IntegrityOS" className="h-8 w-auto object-contain" />
                <span className="text-[20px] font-extrabold tracking-[-0.8px] text-[#1f1e1a]">IntegrityOS</span>
              </div>
              <p className="text-[13px] text-[#9a9590] leading-relaxed mb-5">Enterprise AI Assessment Integrity Platform for universities and institutions worldwide.</p>
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-600">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                All systems operational
              </div>
            </div>
            {[
              {
                heading: "Platform",
                links: ["AI Detection", "Plagiarism Engine", "Behavioral Analysis", "Live Monitoring", "API Integrations"],
              },
              {
                heading: "Solutions",
                links: ["Universities", "Certification Bodies", "Corporate Training", "Government Exams", "Online Proctoring"],
              },
              {
                heading: "Company",
                links: ["About", "Security", "Compliance", "Privacy Policy", "Terms of Service"],
              },
            ].map((col) => (
              <div key={col.heading}>
                <div className="text-[11px] font-bold uppercase tracking-[2px] text-[#9a9590] mb-4">{col.heading}</div>
                <div className="flex flex-col gap-2.5">
                  {col.links.map((label) => {
                    const detail = OPTIONS_DETAIL[label as keyof typeof OPTIONS_DETAIL];
                    const IconComponent = detail ? detail.icon : null;
                    return (
                      <a
                        key={label}
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          if (detail) {
                            setActiveModalData({
                              title: label,
                              category: col.heading,
                              description: detail.description,
                              icon: detail.icon,
                            });
                          }
                        }}
                        className="text-[13px] font-medium text-[#6b6861] hover:text-[#1f1e1a] transition-colors cursor-pointer flex items-center gap-2 group/link"
                      >
                        {IconComponent && (
                          <i className={`${IconComponent} text-[16px] text-[#c5af8a] opacity-70 group-hover/link:opacity-100 group-hover/link:scale-110 transition-all duration-300`} />
                        )}
                        <span>{label}</span>
                      </a>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-[#e8e2d8] pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-[12px] text-[#9a9590]">© 2026 IntegrityOS. All rights reserved. Enterprise AI Assessment Integrity.</p>
            <div className="flex items-center gap-6">
              {["SOC 2", "ISO 27001", "GDPR", "FERPA"].map((cert) => (
                <span key={cert} className="text-[11px] font-bold text-[#c5af8a] border border-[#c5af8a]/30 px-2 py-0.5 rounded">{cert}</span>
              ))}
            </div>
          </div>
        </div>
      </footer>

      {/* ─── Premium Option Modal ─── */}
      <AnimatePresence>
        {activeModalData && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveModalData(null)}
              className="absolute inset-0 bg-[#1a1917]/60 backdrop-blur-md"
            />

            {/* Modal Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", stiffness: 350, damping: 30 }}
              className="relative bg-white rounded-3xl border border-[#e8e2d8] max-w-lg w-full p-8 shadow-[0_32px_64px_-16px_rgba(142,126,98,0.25)] overflow-hidden text-[#1a1917] z-10"
            >
              {/* Background gradient hint */}
              <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-[#c5af8a]/5 blur-3xl pointer-events-none" />

              {/* Close button */}
              <button
                onClick={() => setActiveModalData(null)}
                className="absolute top-6 right-6 p-2 rounded-full hover:bg-[#f5f0e6] transition-colors cursor-pointer text-[#9a9590] hover:text-[#1a1917] border-none bg-transparent outline-none"
              >
                <i className="fi fi-rr-cross text-lg flex items-center justify-center"></i>
              </button>

              {/* Icon & Category */}
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 rounded-2xl bg-[#c5af8a]/10 text-[#8a6e40] flex items-center justify-center text-3xl">
                  <i className={activeModalData.icon}></i>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-[2.5px] text-[#9a9590]">
                    {activeModalData.category}
                  </span>
                  <h3 className="text-2xl font-extrabold text-[#1f1e1a] tracking-tight mt-0.5">
                    {activeModalData.title}
                  </h3>
                </div>
              </div>

              {/* Description Body */}
              <div className="border-t border-[#e8e2d8]/60 pt-6 mb-8">
                <p className="text-[15px] text-[#6b6861] leading-relaxed">
                  {activeModalData.description}
                </p>
              </div>

              {/* Footer action button */}
              <div className="flex gap-3">
                <button
                  onClick={() => setActiveModalData(null)}
                  className="flex-1 py-4 bg-[#1f1e1a] text-white text-[14px] font-bold rounded-2xl hover:bg-[#3a3830] transition-colors cursor-pointer border-none shadow-[0_8px_20px_rgba(0,0,0,0.15)] active:scale-95 transition-all text-center"
                >
                  Acknowledge & Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
