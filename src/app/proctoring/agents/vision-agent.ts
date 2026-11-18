import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { type AgentHealth, type BrowserSignals, type CameraQuality, type NetworkSnapshot, useLatest } from "../types";
import { detectDevToolsOpen } from "./keyboard-guard-agent";

/** Cadence between the end of one frame analysis and the next capture. */
export const FRAME_INTERVAL_MS = 2500;
const MAX_BACKOFF_MS = 15000;

async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return body?.message || fallback;
  } catch {
    return fallback;
  }
}

export interface VisionAgentHandlers {
  onIntegrityScore?: (score: number) => void;
  onWarningCount?: (count: number) => void;
  onFaceStatus?: (status: string) => void;
  /** Server paused the exam (`ended` = session is closed for good). */
  onSuspend?: (message: string, ended: boolean) => void;
  onNotice?: (message: string) => void;
}

/**
 * Vision Agent — the client side of the server multi-agent pipeline.
 * A self-scheduling loop: capture a frame, ship it with the shared browser
 * signals and network snapshot to /process-frame (where the face, object,
 * browser, behaviour, evidence and orchestrator agents run), then schedule
 * the next one only after the previous answer arrived, so requests never
 * overlap. Backs off while the link is failing.
 */
export function useVisionAgent(params: {
  active: boolean;
  attemptId: string | null;
  captureFrame: () => string | null;
  signalsRef: React.MutableRefObject<BrowserSignals>;
  networkRef: React.MutableRefObject<NetworkSnapshot>;
  handlers: VisionAgentHandlers;
}) {
  const { active, attemptId, signalsRef, networkRef } = params;
  const captureRef = useLatest(params.captureFrame);
  const handlersRef = useLatest(params.handlers);

  const [metrics, setMetrics] = useState<Record<string, number> | null>(null);
  const [cameraQuality, setCameraQuality] = useState<CameraQuality | null>(null);
  const [agentHealth, setAgentHealth] = useState<AgentHealth | null>(null);
  const [pose, setPose] = useState<{ gazeDirection?: string; isLookingAway?: boolean } | null>(null);
  const [linkOk, setLinkOk] = useState(true);
  const [framesSent, setFramesSent] = useState(0);
  const failuresRef = useRef(0);

  useEffect(() => {
    if (!active || !attemptId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = (delay: number) => {
      if (!cancelled) timer = setTimeout(tick, delay);
    };

    const tick = async () => {
      if (cancelled) return;
      const signals = signalsRef.current;
      signals.devToolsOpen = detectDevToolsOpen();
      // Send even without a frame: the server records the gap as missing telemetry.
      const frame = captureRef.current();
      const deliveredFullscreenExit = signals.fullscreenExited;
      const deliveredClipboard = signals.pendingClipboard;
      const deliveredBlurs = signals.pendingBlurs;

      try {
        const res = await fetch("/api/ai-proctoring/process-frame", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            attemptId,
            frame: frame ?? undefined,
            browserEvent: {
              tabSwitches: signals.tabSwitches,
              isDevToolsOpen: signals.devToolsOpen,
              visibilityHidden: document.hidden,
              fullscreenExited: deliveredFullscreenExit,
              fullscreenExits: signals.fullscreenExits,
              clipboardEvents: deliveredClipboard,
              windowBlurs: deliveredBlurs,
            },
            networkDetails: networkRef.current,
          }),
        });
        if (cancelled) return;

        if (res.status === 409) {
          handlersRef.current.onSuspend?.(await readApiError(res, "This proctoring session has ended."), true);
          return; // session closed server-side: stop the loop
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        // Only clear the latch once the server has actually received it.
        if (deliveredFullscreenExit) signals.fullscreenExited = false;
        signals.pendingClipboard = Math.max(0, signals.pendingClipboard - deliveredClipboard);
        signals.pendingBlurs = Math.max(0, signals.pendingBlurs - deliveredBlurs);
        failuresRef.current = 0;
        setLinkOk(true);
        setFramesSent((n) => n + 1);

        const data = (await res.json())?.data;
        if (data && !data.skipped) {
          const h = handlersRef.current;
          if (data.integrityScore !== undefined) h.onIntegrityScore?.(data.integrityScore);
          if (data.warningCount !== undefined) h.onWarningCount?.(data.warningCount);
          if (data.metrics) setMetrics(data.metrics);
          if (data.quality) setCameraQuality(data.quality);
          if (data.agentHealth) setAgentHealth(data.agentHealth);
          setPose(data.pose ?? null);

          if (data.agentHealth?.faceDetector === "no_frame") h.onFaceStatus?.("No Camera");
          else if (data.quality && data.quality.usable === false) h.onFaceStatus?.("Camera Unusable");
          else if (data.pose?.isLookingAway) h.onFaceStatus?.("Looking Away");
          else if (data.pose) h.onFaceStatus?.("Detected");

          if (data.status === "PAUSED" || data.action === "pause") {
            h.onSuspend?.(data.message || "Assessment paused by the proctoring agent pending faculty review.", false);
          } else if (data.action === "warning") {
            const notice =
              data.newEvents?.[0]?.narrativeExplanation || data.message || "Please keep your attention on screen.";
            toast.warning(`Proctor notice: ${notice}`);
            h.onNotice?.(notice);
          }
        }
      } catch (err) {
        if (cancelled) return;
        failuresRef.current += 1;
        if (failuresRef.current >= 3) setLinkOk(false);
        console.warn("AI proctoring frame stream warning:", err);
      }

      const failures = failuresRef.current;
      schedule(failures > 0 ? Math.min(FRAME_INTERVAL_MS * (1 + failures), MAX_BACKOFF_MS) : FRAME_INTERVAL_MS);
    };

    schedule(500);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [active, attemptId, signalsRef, networkRef, captureRef, handlersRef]);

  return { metrics, cameraQuality, agentHealth, pose, linkOk, framesSent };
}
