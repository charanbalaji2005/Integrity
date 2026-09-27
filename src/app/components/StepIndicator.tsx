import React from "react";

interface StepIndicatorProps {
  activeStep?: 1 | 2 | 3 | 4;
}

function CheckIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M2.5 6.25L4.75 8.5L9.5 3.5"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function StepIndicator({ activeStep = 2 }: StepIndicatorProps) {
  const steps = [
    {
      label: "Account",
      status: activeStep > 1 ? "complete" : activeStep === 1 ? "active" : "upcoming",
    },
    {
      label: "Institution",
      status: activeStep > 2 ? "complete" : activeStep === 2 ? "active" : "upcoming",
    },
    {
      label: "Identity",
      status: activeStep > 3 ? "complete" : activeStep === 3 ? "active" : "upcoming",
    },
    {
      label: "Security",
      status: activeStep === 4 ? "active" : "upcoming",
    },
  ];

  return (
    <div className="flex items-center gap-6">
      {steps.map((step, index) => {
        const isComplete = step.status === "complete";
        const isActive = step.status === "active";
        const stepNum = index + 1;

        return (
          <div key={step.label} className="flex items-center gap-2">
            <span
              className={[
                "flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold leading-none",
                isComplete || isActive
                  ? "bg-[#1a1a1a] text-white"
                  : "bg-[#eae7e2] text-[#bebcb7]",
              ].join(" ")}
            >
              {isComplete ? <CheckIcon /> : stepNum}
            </span>
            <span
              className={[
                "text-[14px] leading-none",
                isComplete
                  ? "font-medium text-[#1a1a1a]"
                  : isActive
                  ? "font-semibold text-[#1a1a1a]"
                  : "font-medium text-[#bebcb7]",
              ].join(" ")}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
