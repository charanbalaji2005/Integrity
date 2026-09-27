import React from "react";

export function SupportConsoleLogo({ className = "size-8" }: { className?: string }) {
  return (
    <div className={`relative flex items-center justify-center bg-zinc-950 text-white rounded-xl shadow-sm ${className}`}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-[55%] text-white"
      >
        <rect x="4" y="4" width="16" height="16" rx="4" strokeWidth="2" />
        <circle cx="12" cy="9" r="1.5" fill="currentColor" />
        <path d="M12 13v3" />
      </svg>
    </div>
  );
}
