import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { reportViolation } from "../report-violation";
import type { BrowserSignals } from "../types";

const TOAST_COOLDOWN_MS = 3000;

/**
 * Clipboard Agent.
 * Blocks copy, cut, paste and the context menu during the exam. Each attempt
 * is queued in the shared browser signals and delivered to the server-side
 * Browser Monitoring Agent (CLIPBOARD_ATTEMPT rule) with the next frame.
 */
export function useClipboardAgent(params: {
  active: boolean;
  attemptId: string | null;
  userId: string;
  signalsRef: React.MutableRefObject<BrowserSignals>;
  streamActive: boolean;
  /** Per-exam rules; both default to on (legacy behaviour). */
  blockClipboard?: boolean;
  blockContextMenu?: boolean;
}) {
  const { active, attemptId, userId, signalsRef, streamActive } = params;
  const blockClipboard = params.blockClipboard ?? true;
  const blockContextMenu = params.blockContextMenu ?? true;
  const [attempts, setAttempts] = useState(0);
  const streamActiveRef = useRef(streamActive);
  streamActiveRef.current = streamActive;

  useEffect(() => {
    if (!active || !attemptId) return;
    let lastToastAt = 0;

    const block = (label: string) => (e: Event) => {
      e.preventDefault();
      signalsRef.current.pendingClipboard += 1;
      setAttempts((n) => n + 1);

      const now = Date.now();
      if (now - lastToastAt > TOAST_COOLDOWN_MS) {
        lastToastAt = now;
        toast.warning(`${label} is disabled during the examination. This attempt was logged.`);
      }
      if (!streamActiveRef.current) {
        void reportViolation(attemptId, userId, "clipboard-attempt", "low", `Blocked ${label.toLowerCase()} attempt.`);
      }
    };

    const handlers: [string, (e: Event) => void][] = [
      ...(blockClipboard
        ? ([
            ["copy", block("Copy")],
            ["cut", block("Cut")],
            ["paste", block("Paste")],
          ] as [string, (e: Event) => void][])
        : []),
      ...(blockContextMenu ? ([["contextmenu", block("Right-click")]] as [string, (e: Event) => void][]) : []),
    ];
    handlers.forEach(([type, fn]) => document.addEventListener(type, fn, true));
    return () => handlers.forEach(([type, fn]) => document.removeEventListener(type, fn, true));
  }, [active, attemptId, userId, signalsRef, blockClipboard, blockContextMenu]);

  return { attempts };
}
