import React from "react";

export function ChatbotIcon({ className = "size-7" }: { className?: string }) {
  return (
    <div className={`relative flex items-center justify-center rounded-full bg-zinc-950 border border-white/20 shadow-[0_0_10px_rgba(255,255,255,0.18)] select-none shrink-0 ${className}`}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="size-[55%] text-white"
      >
        <path
          d="M12 2L14.8 9.2L22 12L14.8 14.8L12 22L9.2 14.8L2 12L9.2 9.2L12 2Z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
