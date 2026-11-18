import { useEffect, useState } from "react";
import { toast } from "sonner";
import { reportViolation } from "../report-violation";
import { useLatest } from "../types";

const SAMPLE_INTERVAL_MS = 250;
const NOISE_THRESHOLD = 35;
const NOISE_COOLDOWN_MS = 8000;

export type NoiseLevel = "Quiet" | "Noise Detected";

/**
 * Audio Agent (only when the assessment enables microphone analysis).
 * Samples the microphone's average spectrum energy and flags sustained loud
 * background sound, with a cooldown so one conversation is one event.
 * Releases the microphone when the exam ends.
 */
export function useAudioAgent(params: {
  active: boolean;
  attemptId: string | null;
  userId: string;
  onPenalty?: (scorePenalty: number) => void;
}) {
  const { active, attemptId, userId } = params;
  const [noise, setNoise] = useState<NoiseLevel>("Quiet");
  const [showAlert, setShowAlert] = useState(false);
  const [micState, setMicState] = useState<"idle" | "running" | "denied">("idle");
  const onPenaltyRef = useLatest(params.onPenalty);

  useEffect(() => {
    if (!active || !attemptId) {
      setMicState("idle");
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let sampler: ReturnType<typeof setInterval> | null = null;
    let quietTimer: ReturnType<typeof setTimeout> | null = null;
    let lastNoiseAt = 0;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx = new AudioCtx();
        const analyser = ctx.createAnalyser();
        analyser.smoothingTimeConstant = 0.8;
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const bins = new Uint8Array(analyser.frequencyBinCount);
        setMicState("running");

        sampler = setInterval(() => {
          analyser.getByteFrequencyData(bins);
          let sum = 0;
          for (let i = 0; i < bins.length; i++) sum += bins[i];
          if (sum / bins.length <= NOISE_THRESHOLD) return;

          const now = Date.now();
          if (now - lastNoiseAt < NOISE_COOLDOWN_MS) return;
          lastNoiseAt = now;

          setNoise("Noise Detected");
          setShowAlert(true);
          toast.error("⚠ Background Noise Detected. Please move to a quieter environment.");
          void reportViolation(
            attemptId,
            userId,
            "background-noise",
            "medium",
            "Microphone analysis: Loud conversational volume or repeated background voices detected.",
          ).then((ok) => ok && onPenaltyRef.current?.(10));

          if (quietTimer) clearTimeout(quietTimer);
          quietTimer = setTimeout(() => setNoise("Quiet"), 4000);
        }, SAMPLE_INTERVAL_MS);
      } catch (err) {
        console.error("Microphone check failed:", err);
        if (!cancelled) setMicState("denied");
      }
    })();

    return () => {
      cancelled = true;
      if (sampler) clearInterval(sampler);
      if (quietTimer) clearTimeout(quietTimer);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close().catch(() => {});
    };
  }, [active, attemptId, userId, onPenaltyRef]);

  return {
    noise,
    micState,
    showAlert,
    dismissAlert: () => {
      setShowAlert(false);
      setNoise("Quiet");
    },
  };
}
