import React from "react";
import { Fingerprint } from "lucide-react";

function parseUserAgent(ua?: string) {
  if (!ua) return "Chrome on Windows";
  let browser = "Browser";
  let os = "OS";

  const lowerUa = ua.toLowerCase();
  if (lowerUa.includes("firefox")) browser = "Firefox";
  else if (lowerUa.includes("chrome") || lowerUa.includes("crios")) browser = "Chrome";
  else if (lowerUa.includes("safari")) browser = "Safari";
  else if (lowerUa.includes("edge") || lowerUa.includes("edg")) browser = "Edge";

  if (lowerUa.includes("windows")) os = "Windows";
  else if (lowerUa.includes("macintosh") || lowerUa.includes("mac os")) os = "macOS";
  else if (lowerUa.includes("linux")) os = "Linux";
  else if (lowerUa.includes("android")) os = "Android";
  else if (lowerUa.includes("iphone") || lowerUa.includes("ipad") || lowerUa.includes("ipod")) os = "iOS";

  return `${browser} on ${os}`;
}

export function SecurityContext() {
  const previousDevice = localStorage.getItem("lastLoginDevice") || parseUserAgent(navigator.userAgent);
  const previousTime = localStorage.getItem("lastLoginTime") || new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: true,
  });

  return (
    <div className="flex w-full items-center gap-3 rounded-2xl border border-card-border/60 bg-sand/50 px-3.5 py-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white text-tan-700 shadow-[0_1px_2px_rgba(26,25,23,0.06)]">
        <Fingerprint className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 text-xs leading-snug">
        <p className="font-semibold text-ink-900">Security context</p>
        <p className="truncate text-ink-500">
          {previousDevice} <span aria-hidden="true">·</span> {previousTime}
        </p>
      </div>
    </div>
  );
}
