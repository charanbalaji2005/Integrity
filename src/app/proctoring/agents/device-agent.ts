import { useEffect, useState } from "react";
import { toast } from "sonner";
import { reportViolation } from "../report-violation";

const MUTE_GRACE_MS = 3000;

/**
 * Device Agent.
 * Watches the camera track for disconnection (track ended) or prolonged
 * interruption (muted > 3 s), and the microphone for removal when the
 * assessment uses audio. Each interruption is logged once; the exam view
 * blocks on a lost camera until it is reconnected.
 */
export function useDeviceAgent(params: {
  active: boolean;
  attemptId: string | null;
  userId: string;
  stream: MediaStream | null;
  watchMicrophone: boolean;
}) {
  const { active, attemptId, userId, stream, watchMicrophone } = params;
  const [cameraLost, setCameraLost] = useState(false);
  const [cameraInterrupted, setCameraInterrupted] = useState(false);
  const [micLost, setMicLost] = useState(false);

  // Camera track lifecycle
  useEffect(() => {
    setCameraLost(false);
    setCameraInterrupted(false);
    if (!active || !attemptId || !stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;

    let muteTimer: ReturnType<typeof setTimeout> | null = null;

    const onEnded = () => {
      setCameraLost(true);
      toast.error("Your camera was disconnected. Reconnect it to continue the exam.");
      void reportViolation(attemptId, userId, "camera-disconnected", "high", "Camera stream ended during the examination.");
    };
    const onMute = () => {
      muteTimer = setTimeout(() => {
        setCameraInterrupted(true);
        void reportViolation(
          attemptId,
          userId,
          "camera-interrupted",
          "medium",
          `Camera stopped delivering video for more than ${MUTE_GRACE_MS / 1000} seconds.`,
        );
      }, MUTE_GRACE_MS);
    };
    const onUnmute = () => {
      if (muteTimer) clearTimeout(muteTimer);
      setCameraInterrupted(false);
    };

    if (track.readyState === "ended") onEnded();
    track.addEventListener("ended", onEnded);
    track.addEventListener("mute", onMute);
    track.addEventListener("unmute", onUnmute);
    return () => {
      if (muteTimer) clearTimeout(muteTimer);
      track.removeEventListener("ended", onEnded);
      track.removeEventListener("mute", onMute);
      track.removeEventListener("unmute", onUnmute);
    };
  }, [active, attemptId, userId, stream]);

  // Microphone presence (device unplugged / disabled)
  useEffect(() => {
    setMicLost(false);
    if (!active || !attemptId || !watchMicrophone || !navigator.mediaDevices?.enumerateDevices) return;
    let lost = false;

    const check = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasMic = devices.some((d) => d.kind === "audioinput");
        if (!hasMic && !lost) {
          lost = true;
          setMicLost(true);
          toast.error("Your microphone was disconnected.");
          void reportViolation(attemptId, userId, "microphone-disconnected", "medium", "Microphone was disconnected during the examination.");
        } else if (hasMic && lost) {
          lost = false;
          setMicLost(false);
        }
      } catch {
        /* enumeration not permitted */
      }
    };

    navigator.mediaDevices.addEventListener("devicechange", check);
    return () => navigator.mediaDevices.removeEventListener("devicechange", check);
  }, [active, attemptId, userId, watchMicrophone]);

  return { cameraLost, cameraInterrupted, micLost };
}
