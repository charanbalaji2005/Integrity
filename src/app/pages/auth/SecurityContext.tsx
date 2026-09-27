import React from "react";
import { Shield, Clock } from "lucide-react";

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
  const previousTime = localStorage.getItem("lastLoginTime") || new Date().toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true
  });

  return (
    <div className="mt-10 flex gap-3 rounded-2xl border border-[#ebdcc9]/50 bg-[#eae5d8] p-4 w-full">
      <Shield className="size-[13.333px] shrink-0 text-[#6b6861]" />
      <div>
        <p className="mb-2 text-xs font-bold leading-[16.8px] tracking-[0.24px] text-[#1a1917]">
          Security Context
        </p>
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-normal leading-[1.2] text-[#6b6861]">
            Device: <span className="font-semibold text-[#1a1917]">{previousDevice}</span>
          </p>
          <p className="text-xs font-normal leading-[1.2] text-[#6b6861] flex items-center gap-1">
            Time: <span className="font-semibold text-[#1a1917] flex items-center gap-1"><Clock className="size-3" /> {previousTime}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
