import { useEffect, useState } from "react";
import { toast } from "sonner";
import { reportViolation } from "../report-violation";

/** Heuristic DevTools detection (docked panels). Skipped on touch devices. */
export function detectDevToolsOpen(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(pointer: coarse)").matches) return false;
  // In full screen the outer/inner gap is 0 unless a docked panel steals space.
  const widthGap = window.outerWidth - window.innerWidth;
  const heightGap = window.outerHeight - window.innerHeight;
  return widthGap > 160 || heightGap > 200;
}

const isDevToolsShortcut = (e: KeyboardEvent) => {
  const key = e.key.toLowerCase();
  return (
    e.key === "F12" ||
    (e.ctrlKey && e.shiftKey && (key === "i" || key === "j" || key === "c")) ||
    (e.metaKey && e.altKey && (key === "i" || key === "j" || key === "c")) ||
    (e.ctrlKey && key === "u")
  );
};

/**
 * Keyboard Guard Agent (browser lockdown only).
 * Blocks DevTools / view-source shortcuts and logs each blocked attempt.
 * Passive DevTools detection is sampled by the vision agent; right-click and
 * clipboard are handled by the clipboard agent.
 */
export function useKeyboardGuardAgent(params: {
  active: boolean;
  attemptId: string | null;
  userId: string;
}) {
  const { active, attemptId, userId } = params;
  const [blockedAttempts, setBlockedAttempts] = useState(0);

  useEffect(() => {
    if (!active || !attemptId) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isDevToolsShortcut(e)) return;
      e.preventDefault();
      e.stopPropagation();
      setBlockedAttempts((n) => n + 1);
      toast.error("Developer tools are restricted during the examination.");
      void reportViolation(
        attemptId,
        userId,
        "developer-tools",
        "high",
        "Student attempted to open browser Developer Tools (keyboard shortcut blocked).",
      );
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [active, attemptId, userId]);

  return { blockedAttempts };
}
