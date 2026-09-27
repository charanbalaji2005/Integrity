import React from "react";

export default function BuildingIllustration() {
  return (
    <div className="pointer-events-none absolute right-0 top-0 h-full overflow-hidden" aria-hidden="true">
      <svg
        width="300"
        height="700"
        viewBox="0 0 300 700"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-auto"
        preserveAspectRatio="xMaxYMid slice"
      >
        <path d="M70 240 L230 240 L150 150 Z" fill="#e6d9be" />
        <rect x="55" y="240" width="190" height="20" fill="#e6d9be" />
        <rect x="80" y="280" width="22" height="120" fill="#e6d9be" />
        <rect x="139" y="280" width="22" height="120" fill="#e6d9be" />
        <rect x="198" y="280" width="22" height="120" fill="#e6d9be" />
        <rect x="40" y="420" width="220" height="22" fill="#e6d9be" />
      </svg>
    </div>
  );
}
