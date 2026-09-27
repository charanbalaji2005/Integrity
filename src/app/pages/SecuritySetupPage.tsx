import React, { useState } from "react";
import StepIndicator from "../components/StepIndicator";
import BuildingIllustration from "../components/BuildingIllustration";
import { 
  ShieldCheckIcon, 
  ArrowLeftIcon, 
  ArrowRightIcon 
} from "../components/Icons";
import { motion } from "motion/react";

interface SecuritySetupPageProps {
  onBack: () => void;
  onFinish: () => void;
}

export default function SecuritySetupPage({ onBack, onFinish }: SecuritySetupPageProps) {
  const [isFinishing, setIsFinishing] = useState(false);

  const handleFinish = () => {
    setIsFinishing(true);
    // Simulate short security verification/activation delay for premium feel
    setTimeout(() => {
      onFinish();
    }, 1200);
  };

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#fff1d3]">
      {/* Background decorative illustration */}
      <BuildingIllustration />

      {/* Page content */}
      <div className="relative z-10 flex min-h-screen flex-col items-center px-4 pt-16 pb-10">
        {/* Header */}
        <div className="mb-8 text-center">
          <p className="text-[13px] font-medium text-[#605e5b]">IntegrityOS</p>
          <p className="mt-1 text-[13px] text-[#75716a]">
            Step 4: Security & verification settings
          </p>
        </div>

        {/* Card */}
        <div className="w-full max-w-[470px] rounded-[28px] bg-[#fffbf2] px-9 pt-8 pb-7 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.12)]">
          {/* Step indicator */}
          <StepIndicator activeStep={4} />

          {/* Icon Area */}
          <div className="mt-8 flex flex-col items-center justify-center">
            <div className="relative flex items-center justify-center">
              {/* Outer pulsing ring */}
              <motion.div 
                animate={{ scale: [1, 1.25, 1], opacity: [0.15, 0.4, 0.15] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                className="absolute size-24 rounded-full bg-[#24a37a]" 
              />
              {/* Middle ring */}
              <div className="absolute size-20 rounded-full bg-[#fafcf3] border border-[#d2edd6]" />
              {/* Inner Icon */}
              <div className="relative z-10 flex size-14 items-center justify-center rounded-full bg-[#e3f4e1] border border-[#24a37a]/25 text-[#24a37a]">
                <ShieldCheckIcon />
              </div>
            </div>
            <h4 className="mt-4 text-lg font-bold text-[#1a1a1a]">Security Shield Active</h4>
            <p className="mt-1 text-center text-[13px] text-[#6b6760] max-w-[320px]">
              Your account security setup is complete. Automated integrity protection has been deployed.
            </p>
          </div>

          {/* Details list */}
          <div className="mt-6 space-y-3.5">
            {/* Row 1 */}
            <div className="flex items-center justify-between rounded-[14px] bg-[#fafafa] border border-[#e4e0d4] px-4 py-3">
              <span className="text-[13px] font-medium text-[#605e5b]">System Integrity Check</span>
              <span className="text-[12px] font-bold text-[#24a37a] bg-[#e3f4e1] px-2 py-0.5 rounded-full">PASSED</span>
            </div>

            {/* Row 2 */}
            <div className="flex items-center justify-between rounded-[14px] bg-[#fafafa] border border-[#e4e0d4] px-4 py-3">
              <span className="text-[13px] font-medium text-[#605e5b]">Automated Audit Status</span>
              <span className="text-[12px] font-bold text-[#24a37a] bg-[#e3f4e1] px-2 py-0.5 rounded-full">ENABLED</span>
            </div>

            {/* Row 3 */}
            <div className="flex items-center justify-between rounded-[14px] bg-[#fafafa] border border-[#e4e0d4] px-4 py-3">
              <span className="text-[13px] font-medium text-[#605e5b]">AI Copilot Tools</span>
              <span className="text-[12px] font-bold text-[#24a37a] bg-[#e3f4e1] px-2 py-0.5 rounded-full">ACTIVATED</span>
            </div>
          </div>

          {/* Footer actions */}
          <div className="mt-8 flex items-center justify-between">
            <button
              type="button"
              onClick={onBack}
              disabled={isFinishing}
              className="flex items-center gap-2 text-[14px] font-medium text-[#1a1a1a] hover:opacity-75 transition-opacity disabled:opacity-50"
            >
              <ArrowLeftIcon />
              Back
            </button>

            <button
              type="button"
              onClick={handleFinish}
              disabled={isFinishing}
              className="flex h-11 items-center gap-2 rounded-[12px] bg-[#1a1a1a] px-5 text-[14px] font-medium text-white shadow-[0_4px_10px_rgba(0,0,0,0.18)] hover:bg-[#333] transition-colors disabled:opacity-50"
            >
              {isFinishing ? "Deploying..." : "Finish & Enter Dashboard"}
              {!isFinishing && <ArrowRightIcon />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
