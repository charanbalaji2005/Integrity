import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { reportViolation } from "../report-violation";
import type { BrowserSignals } from "../types";

type FsDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type KeyboardLockNavigator = Navigator & {
  keyboard?: { lock?: (keys?: string[]) => Promise<void>; unlock?: () => void };
};

const fsDoc = () => document as FsDocument;

export function isFullscreenSupported(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(fsDoc().fullscreenEnabled || fsDoc().webkitFullscreenEnabled);
}

export function isInFullscreen(): boolean {
  return Boolean(fsDoc().fullscreenElement || fsDoc().webkitFullscreenElement);
}

/**
 * Puts the whole page into full screen. Must be called from a user gesture
 * (click handler) BEFORE any `await`, otherwise browsers reject the request.
 */
export async function enterExamFullscreen(): Promise<boolean> {
  if (!isFullscreenSupported()) return false;
  if (isInFullscreen()) return true;
  const el = document.documentElement as FsElement;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    else return false;
    // Chromium: capture Esc so a single key press can't silently leave full screen
    // (the user has to press-and-hold Esc, which we still detect below).
    (navigator as KeyboardLockNavigator).keyboard?.lock?.(["Escape"]).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

export async function exitExamFullscreen(): Promise<void> {
  (navigator as KeyboardLockNavigator).keyboard?.unlock?.();
  if (!isInFullscreen()) return;
  try {
    if (document.exitFullscreen) await document.exitFullscreen();
    else await fsDoc().webkitExitFullscreen?.();
  } catch {
    /* already left */
  }
}

/**
 * Full-Screen Agent.
 * While the exam is active it keeps the browser in full screen: every exit is
 * counted, latched into the shared browser signals for the server-side
 * Browser Monitoring Agent, and the exam is blocked until the candidate returns.
 * On devices without the Fullscreen API (e.g. iPhone Safari) it stands down.
 */
export function useFullscreenAgent(params: {
  active: boolean;
  attemptId: string | null;
  userId: string;
  signalsRef: React.MutableRefObject<BrowserSignals>;
  /** When the AI frame stream is live it carries the signal; otherwise log directly. */
  streamActive: boolean;
}) {
  const { active, attemptId, userId, signalsRef, streamActive } = params;
  const supported = isFullscreenSupported();
  const [isFullscreen, setIsFullscreen] = useState(() => isInFullscreen());
  const [needsReentry, setNeedsReentry] = useState(false);
  const [exitCount, setExitCount] = useState(0);
  const streamActiveRef = useRef(streamActive);
  streamActiveRef.current = streamActive;
  const releasingRef = useRef(false);

  useEffect(() => {
    if (!active || !supported) {
      setNeedsReentry(false);
      return;
    }

    // Entering the exam without full screen (e.g. the request was rejected).
    if (!isInFullscreen()) setNeedsReentry(true);

    const onChange = () => {
      const fs = isInFullscreen();
      setIsFullscreen(fs);
      if (fs) {
        setNeedsReentry(false);
        return;
      }
      if (releasingRef.current) return;

      const signals = signalsRef.current;
      signals.fullscreenExited = true;
      signals.fullscreenExits += 1;
      setExitCount(signals.fullscreenExits);
      setNeedsReentry(true);
      toast.warning("You left full-screen mode. This has been logged. Return to full screen to continue.");

      if (!streamActiveRef.current && attemptId) {
        void reportViolation(
          attemptId,
          userId,
          "fullscreen-exit",
          "medium",
          `Candidate exited full-screen exam mode (exit #${signals.fullscreenExits}).`,
        );
      }
    };

    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, [active, supported, attemptId, userId, signalsRef]);

  // Release full screen once the exam ends (submit / terminate / unmount).
  useEffect(() => {
    if (!active) return;
    releasingRef.current = false;
    return () => {
      releasingRef.current = true;
      void exitExamFullscreen();
    };
  }, [active]);

  const requestReentry = useCallback(async () => {
    const ok = await enterExamFullscreen();
    if (!ok) toast.error("Your browser blocked full screen. Click the button again or press F11.");
    return ok;
  }, []);

  return { supported, isFullscreen, needsReentry, exitCount, requestReentry };
}
