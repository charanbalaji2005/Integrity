import React from "react";

/**
 * Vigil — the IntegrityOS assistant — as a lightweight SVG avatar.
 * Used for every AI message bubble (support chat, support console,
 * dashboards). The full 3D Vigil (AgentMascot3D) is reserved for single
 * hero spots, because one WebGL context per chat message would exhaust the
 * browser's context limit.
 */
export function ChatbotIcon({ className = "size-7", title = "Vigil, IntegrityOS assistant" }: { className?: string; title?: string }) {
  const id = React.useId().replace(/:/g, "");
  return (
    <span
      className={`relative inline-flex shrink-0 select-none items-center justify-center rounded-full bg-gradient-to-b from-[#eef2ff] to-[#dfe5ff] ring-1 ring-black/5 ${className}`}
      role="img"
      aria-label={title}
    >
      <svg viewBox="0 0 64 64" className="size-[92%]" aria-hidden="true">
        <defs>
          <radialGradient id={`vb-${id}`} cx="40%" cy="30%" r="75%">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.7" stopColor="#e9ebf2" />
            <stop offset="1" stopColor="#c9cdd9" />
          </radialGradient>
          <linearGradient id={`vv-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1f2033" />
            <stop offset="1" stopColor="#0b0b14" />
          </linearGradient>
        </defs>
        {/* halo */}
        <ellipse cx="32" cy="12" rx="17" ry="3.6" fill="none" stroke="#f5c542" strokeOpacity="0.75" strokeWidth="1.4" />
        {/* antenna */}
        <line x1="32" y1="9" x2="32" y2="16" stroke="#c9cdd9" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="32" cy="8" r="2.6" fill="#f5c542" />
        {/* side "hands" */}
        <circle cx="12.5" cy="41" r="4.2" fill={`url(#vb-${id})`} />
        <circle cx="51.5" cy="41" r="4.2" fill={`url(#vb-${id})`} />
        {/* capsule body */}
        <rect x="16" y="15" width="32" height="44" rx="16" fill={`url(#vb-${id})`} />
        {/* visor */}
        <rect x="20" y="22" width="24" height="15" rx="7.5" fill={`url(#vv-${id})`} />
        {/* eyes + smile */}
        <path d="M25.5 28.4 Q27.5 26.6 29.5 28.4" stroke="#f5c542" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <path d="M34.5 28.4 Q36.5 26.6 38.5 28.4" stroke="#f5c542" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <path d="M29.5 32 Q32 34 34.5 32" stroke="#f5c542" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        {/* shield badge */}
        <path d="M32 41 L37 43 V47 Q37 51 32 53 Q27 51 27 47 V43 Z" fill="#f5c542" />
      </svg>
    </span>
  );
}
