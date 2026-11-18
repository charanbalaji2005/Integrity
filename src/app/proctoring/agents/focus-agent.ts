import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { reportViolation } from "../report-violation";
import type { BrowserSignals } from "../types";

/**
 * Focus Agent.
 * Counts every time the exam tab is hidden (tab switch / minimise), and
 * separately every time the window loses focus to another app or window while
 * the tab itself stays visible (e.g. a chat window over the exam). The
 * cumulative counter rides on the next AI frame; the direct violation API is
 * used only when no frame stream is live, so one switch is never logged twice.
 */
export function useFocusAgent(params: {
  active: boolean;
  attemptId: string | null;
  userId: string;
  signalsRef: React.MutableRefObject<BrowserSignals>;
  streamActive: boolean;
  /** Per-exam rules; both default to on (legacy behaviour). */
  watchTabSwitch?: boolean;
  watchWindowFocus?: boolean;
}) {
  const { active, attemptId, userId, signalsRef, streamActive } = params;
  const watchTabSwitch = params.watchTabSwitch ?? true;
  const watchWindowFocus = params.watchWindowFocus ?? true;
  const [tabSwitches, setTabSwitches] = useState(signalsRef.current.tabSwitches);
  const [windowBlurs, setWindowBlurs] = useState(0);
  const streamActiveRef = useRef(streamActive);
  streamActiveRef.current = streamActive;

  useEffect(() => {
    if (!active || !attemptId || (!watchTabSwitch && !watchWindowFocus)) return;

    const onVisibility = () => {
      if (!document.hidden) return;
      signalsRef.current.tabSwitches += 1;
      setTabSwitches(signalsRef.current.tabSwitches);
      toast.warning("Tab switch detected. This event has been logged to the proctoring dashboard.");

      if (!streamActiveRef.current) {
        void reportViolation(
          attemptId,
          userId,
          "tab-switch",
          "medium",
          "Candidate switched browser tabs or minimized the assessment environment.",
        );
      }
    };

    // A blur that also hides the page is a tab switch (counted above). Wait a
    // moment so visibilitychange can land first, then count genuine blurs only.
    let blurTimer: ReturnType<typeof setTimeout> | null = null;
    const onBlur = () => {
      if (blurTimer) clearTimeout(blurTimer);
      blurTimer = setTimeout(() => {
        if (document.hidden || document.hasFocus()) return;
        signalsRef.current.pendingBlurs += 1;
        setWindowBlurs((n) => n + 1);
        toast.warning("The exam window lost focus. Keep the exam window active; this was logged.");
        if (!streamActiveRef.current) {
          void reportViolation(
            attemptId,
            userId,
            "window-blur",
            "low",
            "Exam window lost focus to another application or window.",
          );
        }
      }, 300);
    };

    if (watchTabSwitch) document.addEventListener("visibilitychange", onVisibility);
    if (watchWindowFocus) window.addEventListener("blur", onBlur);
    return () => {
      if (blurTimer) clearTimeout(blurTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
    };
  }, [active, attemptId, userId, signalsRef, watchTabSwitch, watchWindowFocus]);

  return { tabSwitches, windowBlurs };
}
