import React from "react";
import { motion, MotionValue } from "motion/react";
import { CheckCircle2, Shield, Eye } from "lucide-react";
import imgAiIntegrityIllustration from "../../imports/LoginPortalIntegrityOs/246cb418eb5fc0839fc05c1e211063549b0c188b.png";

interface AiIllustrationProps {
  aiTranslateX: MotionValue<number>;
  aiTranslateY: MotionValue<number>;
  cardRotateX: MotionValue<number>;
  cardRotateY: MotionValue<number>;
  cardTranslateX: MotionValue<number>;
  cardTranslateY: MotionValue<number>;
  CountUpComponent: React.ComponentType<{ end: number; decimals?: number; duration?: number; suffix?: string }>;
}

export function AiIllustration({
  aiTranslateX,
  aiTranslateY,
  cardRotateX,
  cardRotateY,
  cardTranslateX,
  cardTranslateY,
  CountUpComponent,
}: AiIllustrationProps) {
  return (
    <div className="relative flex size-full flex-col overflow-hidden">

      {/* ── Tiny top label ── */}
      <div className="px-10 pt-8 pb-2 opacity-0 animate-fade-in transition-all duration-[1s]">
        <span className="font-normal text-xs uppercase tracking-[2px] text-[#7c776e]">System Integrity</span>
      </div>

      {/* ── Hero image zone — pushed to fill from top ── */}
      <div
        className="relative flex-1 flex flex-col items-center justify-start px-10 pt-4"
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* Central AI image */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          style={{
            x: aiTranslateX,
            y: aiTranslateY,
            transformStyle: "preserve-3d",
            willChange: "transform, opacity",
          }}
          className="relative w-full max-w-[600px] aspect-[768/688]"
        >
          {/* Float + breath loop */}
          <motion.div
            animate={{ y: [-5, 5, -5], scale: [0.99, 1.01, 0.99] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
            className="relative size-full overflow-hidden rounded-[32px] shadow-[0px_32px_80px_rgba(142,126,98,0.14)] border border-white/50 bg-white/10"
          >
            <img
              alt="AI Integrity Illustration"
              className="absolute inset-0 size-full object-cover"
              src={imgAiIntegrityIllustration}
            />

            {/* Sweep light reflection */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -skew-x-12 pointer-events-none"
              animate={{ left: ["-150%", "250%"] }}
              transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", repeatDelay: 2 }}
            />

            {/* SVG fiber strands */}
            <svg
              className="absolute inset-0 size-full pointer-events-none mix-blend-screen opacity-70"
              viewBox="0 0 768 688"
            >
              <motion.path
                d="M 120 180 C 260 140, 390 420, 520 320 S 660 120, 680 280"
                fill="none"
                stroke="url(#svgFib1)"
                strokeWidth="2.5"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: [0, 1, 1, 0], opacity: [0, 0.8, 0.8, 0] }}
                transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.path
                d="M 80 430 C 220 330, 310 180, 480 480 S 580 580, 720 320"
                fill="none"
                stroke="url(#svgFib2)"
                strokeWidth="2"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: [0, 1, 1, 0], opacity: [0, 0.6, 0.6, 0] }}
                transition={{ duration: 13, repeat: Infinity, ease: "easeInOut", delay: 2.5 }}
              />
              <defs>
                <linearGradient id="svgFib1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#c5af8a" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#58448c" stopOpacity="0.8" />
                </linearGradient>
                <linearGradient id="svgFib2" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#c25f3c" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#6e3fa1" stopOpacity="0.6" />
                </linearGradient>
              </defs>
            </svg>
          </motion.div>

          {/* ── Fraud Detection — left-middle edge overlap ── */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3, type: "spring", stiffness: 90, damping: 15 }}
            className="absolute left-[-28px] top-[42%] z-20 -translate-y-1/2"
          >
            <motion.div
              animate={{ y: [-3, 3, -3] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            >
              <motion.div
                style={{
                  rotateX: cardRotateX,
                  rotateY: cardRotateY,
                  x: cardTranslateX,
                  y: cardTranslateY,
                  transformStyle: "preserve-3d",
                  willChange: "transform",
                }}
                whileHover={{ scale: 1.05, boxShadow: "0px 24px 50px rgba(142,126,98,0.18)", borderColor: "rgba(255,255,255,0.7)" }}
                className="flex items-center gap-3 rounded-[32px] border border-white/40 bg-white/80 px-[21px] py-[13px] backdrop-blur-[16px] shadow-md cursor-default"
              >
                <motion.div
                  animate={{ scale: [1, 1.25, 1], opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  className="size-2 shrink-0 rounded-full bg-[#c25f3c]"
                />
                <p className="text-sm font-semibold tracking-wide text-[#2b2925] uppercase">Fraud Detection</p>
              </motion.div>
            </motion.div>
          </motion.div>

          {/* ── Accuracy Rate — top-right corner overlap ── */}
          <motion.div
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, type: "spring", stiffness: 90, damping: 15 }}
            className="absolute right-[-20px] top-[-16px] z-20"
          >
            <motion.div
              animate={{ y: [-4, 4, -4] }}
              transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            >
              <motion.div
                style={{
                  rotateX: cardRotateX,
                  rotateY: cardRotateY,
                  x: cardTranslateX,
                  y: cardTranslateY,
                  transformStyle: "preserve-3d",
                  willChange: "transform",
                }}
                whileHover={{ scale: 1.03, boxShadow: "0px 24px 50px rgba(142,126,98,0.18)", borderColor: "rgba(255,255,255,0.7)" }}
                className="relative overflow-hidden flex w-[210px] flex-col gap-[6px] rounded-[32px] border border-white/40 bg-white/80 px-[22px] pb-[22px] pt-[20px] backdrop-blur-[16px] shadow-md cursor-default"
              >
                {/* Shimmer */}
                <motion.div
                  variants={{ animate: { left: ["-150%", "250%"], transition: { duration: 1.5, repeat: Infinity, repeatDelay: 10.5, ease: "easeInOut" } } }}
                  animate="animate"
                  className="absolute top-0 bottom-0 w-[40%] bg-gradient-to-r from-transparent via-white/50 to-transparent skew-x-12 pointer-events-none"
                />
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="size-[13px] text-[#58448c]" />
                    <p className="text-[10px] font-bold uppercase tracking-[0.8px] text-[#58448c]">ACCURACY RATE</p>
                  </div>
                  <div className="relative size-6">
                    <svg className="size-full -rotate-90">
                      <circle cx="12" cy="12" r="9" stroke="#ebdcc9" strokeWidth="2" fill="none" />
                      <motion.circle
                        cx="12" cy="12" r="9"
                        stroke="#58448c" strokeWidth="2" fill="none"
                        strokeDasharray={56}
                        initial={{ strokeDashoffset: 56 }}
                        animate={{ strokeDashoffset: 56 - (56 * 99.8) / 100 }}
                        transition={{ duration: 2, ease: "easeOut" }}
                      />
                    </svg>
                  </div>
                </div>
                <p className="text-[32px] font-bold leading-[38px] tracking-[-1.2px] text-[#2b2925]">
                  <CountUpComponent end={99.8} decimals={1} duration={2} suffix="%" />
                </p>
                <p className="text-[10px] font-medium leading-[14px] tracking-[0.2px] text-[#6b6861]">Detection present Threshold</p>
              </motion.div>
            </motion.div>
          </motion.div>

          {/* ── Behavior Analysis — bottom-right corner overlap ── */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.45, type: "spring", stiffness: 90, damping: 15 }}
            className="absolute right-[-20px] bottom-[-12px] z-20"
          >
            <motion.div
              animate={{ y: [3, -3, 3] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            >
              <motion.div
                style={{
                  rotateX: cardRotateX,
                  rotateY: cardRotateY,
                  x: cardTranslateX,
                  y: cardTranslateY,
                  transformStyle: "preserve-3d",
                  willChange: "transform",
                }}
                whileHover={{ scale: 1.05, boxShadow: "0px 24px 50px rgba(142,126,98,0.18)", borderColor: "rgba(255,255,255,0.7)" }}
                className="flex items-center gap-3 rounded-[32px] border border-white/40 bg-white/80 px-[21px] py-[13px] backdrop-blur-[16px] shadow-md cursor-default"
              >
                <motion.div
                  animate={{ rotate: [0, 2, -2, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Shield className="size-[19px] text-[#2b2925]" />
                </motion.div>
                <p className="text-sm font-semibold tracking-wide text-[#2b2925] uppercase">Behavior Analysis</p>
              </motion.div>
            </motion.div>
          </motion.div>

          {/* ── Statistics card — bottom-left corner overlap ── */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, type: "spring", stiffness: 90, damping: 15 }}
            className="absolute left-[-20px] bottom-[-16px] z-20"
          >
            <motion.div
              animate={{ y: [4, -4, 4] }}
              transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
            >
              <motion.div
                style={{
                  rotateX: cardRotateX,
                  rotateY: cardRotateY,
                  x: cardTranslateX,
                  y: cardTranslateY,
                  transformStyle: "preserve-3d",
                  willChange: "transform",
                }}
                whileHover={{ scale: 1.03, y: -5, boxShadow: "0px 24px 50px rgba(142,126,98,0.18)", borderColor: "rgba(255,255,255,0.7)" }}
                className="flex w-[230px] flex-col gap-4 rounded-[32px] border border-white/40 bg-white/80 p-[22px] backdrop-blur-[16px] shadow-md cursor-default"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-black">
                    <Eye className="size-[22px] text-white" />
                  </div>
                  <div>
                    <p className="text-xl font-bold leading-[28px] tracking-[-0.6px] text-[#2b2925]">
                      <CountUpComponent end={2.4} decimals={1} duration={2} suffix="M+" />
                    </p>
                    <p className="text-[10px] font-medium leading-[14px] tracking-[0.2px] text-[#6b6861]">
                      instances monitored
                    </p>
                  </div>
                </div>

                {/* Animated graph line */}
                <div className="w-full h-8 overflow-visible opacity-80 text-[#2b2925] mt-1">
                  <svg className="w-full h-full" viewBox="0 0 195 30">
                    <motion.path
                      initial={{ d: "M0 15 C 30 5, 60 25, 90 15 C 120 5, 150 25, 195 15" }}
                      animate={{
                        d: [
                          "M0 15 C 30 5, 60 25, 90 15 C 120 5, 150 25, 195 15",
                          "M0 15 C 35 28, 65 5, 95 22 C 125 8, 160 5, 195 15",
                          "M0 15 C 30 5, 60 25, 90 15 C 120 5, 150 25, 195 15",
                        ],
                      }}
                      transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                      stroke="currentColor"
                      strokeWidth="2.5"
                      fill="none"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              </motion.div>
            </motion.div>
          </motion.div>
        </motion.div>

        {/* ── Tagline below image ── */}
        <div className="flex max-w-[560px] flex-col gap-5 mx-auto mt-20 pb-8 text-center">
          <h1 className="text-[50px] font-bold leading-[58px] tracking-[-2.5px] text-[#1a1917]">
            Protecting Academic
            <br />
            Integrity with AI
          </h1>
          <p className="text-[16px] font-normal leading-[26px] text-[#6b6861]">
            The gold standard for university-grade assessment monitoring.
            <br />
            Secure, unbiased, and enterprise-ready.
          </p>
        </div>
      </div>
    </div>
  );
}
