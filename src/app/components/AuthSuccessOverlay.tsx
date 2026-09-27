import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import imgAssessmentIntegrityLogo from "../../imports/LoginPortalIntegrityOs/assessment_integrity_logo.png";

interface AuthSuccessOverlayProps {
  visible: boolean;
  onComplete: () => void;
  /** Position of the logo in the login card so we can animate FROM there */
  logoRect?: DOMRect | null;
}

export function AuthSuccessOverlay({ visible, onComplete, logoRect }: AuthSuccessOverlayProps) {
  const [phase, setPhase] = useState<"enter" | "hold" | "exit">("enter");

  useEffect(() => {
    if (!visible) {
      setPhase("enter");
      return;
    }
    // enter → hold → exit timeline  (total: 0.5 s)
    const holdTimer = setTimeout(() => setPhase("hold"), 150);
    const exitTimer = setTimeout(() => setPhase("exit"), 350);
    const completeTimer = setTimeout(() => onComplete(), 500);

    return () => {
      clearTimeout(holdTimer);
      clearTimeout(exitTimer);
      clearTimeout(completeTimer);
    };
  }, [visible, onComplete]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="auth-success-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="fixed inset-0 z-[999] flex flex-col items-center justify-center overflow-hidden"
          style={{ pointerEvents: "all" }}
        >
          {/* ── Backdrop blur + dim ── */}
          <motion.div
            className="absolute inset-0"
            initial={{ backdropFilter: "blur(0px)", backgroundColor: "rgba(247,244,239,0)" }}
            animate={{
              backdropFilter: phase === "exit" ? "blur(0px)" : "blur(10px)",
              backgroundColor: phase === "exit" ? "rgba(247,244,239,0)" : "rgba(247,244,239,0.88)",
            }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />

          {/* ── Radial glow behind logo ── */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: phase === "hold" || phase === "exit" ? 1 : 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <div
              className="rounded-full"
              style={{
                width: 320,
                height: 320,
                background:
                  "radial-gradient(circle, rgba(197,175,138,0.35) 0%, rgba(235,220,200,0.18) 50%, transparent 75%)",
                filter: "blur(32px)",
              }}
            />
          </motion.div>

          {/* ── Animated ring ── */}
          <motion.div
            className="absolute pointer-events-none"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{
              opacity: phase === "hold" ? [0, 0.5, 0] : 0,
              scale: phase === "hold" ? [0.6, 1.6, 2.2] : 0.5,
            }}
            transition={{ duration: 1.4, ease: "easeOut", repeat: phase === "hold" ? Infinity : 0, repeatDelay: 0.4 }}
            style={{
              width: 180,
              height: 180,
              borderRadius: "50%",
              border: "1.5px solid rgba(197,175,138,0.6)",
            }}
          />

          {/* ── Logo + text block ── */}
          <motion.div
            className="relative flex flex-col items-center gap-7"
            initial={{ opacity: 0, scale: 0.72, y: 30 }}
            animate={{
              opacity: phase === "exit" ? 0 : 1,
              scale: phase === "exit" ? 1.08 : 1,
              y: phase === "exit" ? -20 : 0,
            }}
            transition={{
              opacity: { duration: 0.45, ease: "easeOut" },
              scale: { type: "spring", stiffness: 220, damping: 22, mass: 0.9 },
              y: { type: "spring", stiffness: 200, damping: 20 },
            }}
          >
            {/* Logo mark with glow */}
            <motion.div
              className="relative flex flex-col items-center gap-3"
              animate={{
                filter:
                  phase === "hold"
                    ? "drop-shadow(0 0 24px rgba(197,175,138,0.7)) drop-shadow(0 0 8px rgba(197,175,138,0.4))"
                    : "drop-shadow(0 0 0px transparent)",
              }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            >
              <motion.img
                src={imgAssessmentIntegrityLogo}
                alt="IntegrityOS"
                className="object-contain"
                style={{ width: 72, height: 72 }}
                animate={{ rotate: phase === "hold" ? [0, 3, -3, 0] : 0 }}
                transition={{ duration: 2, ease: "easeInOut", repeat: Infinity, repeatType: "loop" }}
              />
              <motion.span
                className="text-[28px] sm:text-[34px] font-extrabold tracking-[-1.5px] text-[#1a1917] leading-none"
                animate={{ letterSpacing: phase === "hold" ? "-1.5px" : "-2px" }}
                transition={{ duration: 0.4 }}
              >
                IntegrityOS
              </motion.span>
            </motion.div>

            {/* Status text */}
            <motion.div
              className="flex flex-col items-center gap-2"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: phase === "enter" ? 0 : 1, y: phase === "enter" ? 12 : 0 }}
              transition={{ duration: 0.4, delay: 0.15, ease: "easeOut" }}
            >
              <motion.p
                className="text-[18px] sm:text-[22px] font-bold text-[#1a1917] tracking-[-0.5px]"
                animate={{ opacity: phase === "exit" ? 0 : 1 }}
                transition={{ duration: 0.3 }}
              >
                Authentication Successful
              </motion.p>
              <motion.p
                className="text-[14px] sm:text-[15px] text-[#8e8a80] font-medium tracking-tight"
                animate={{ opacity: phase === "exit" ? 0 : 1 }}
                transition={{ duration: 0.3, delay: 0.05 }}
              >
                Loading Workspace...
              </motion.p>
            </motion.div>

            {/* Loading dots */}
            <motion.div
              className="flex items-center gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: phase === "enter" ? 0 : 1 }}
              transition={{ duration: 0.35, delay: 0.25 }}
            >
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="block w-2 h-2 rounded-full bg-[#c5af8a]"
                  animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }}
                  transition={{
                    duration: 0.9,
                    delay: i * 0.18,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </motion.div>
          </motion.div>

          {/* ── Success check mark that briefly flashes ── */}
          <AnimatePresence>
            {phase === "hold" && (
              <motion.div
                key="checkmark"
                className="absolute bottom-[12%] flex items-center gap-2"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              >
                <motion.div
                  className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20 }}
                >
                  <svg viewBox="0 0 12 10" className="w-3 h-3" fill="none">
                    <path d="M1 5l3 3 7-7" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </motion.div>
                <span className="text-[13px] font-semibold text-[#5e5a52]">Verified &amp; Authenticated</span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
