import { useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { toast } from "sonner";
import { createAuthedSocket, joinRoom } from "../../utils/socket-client";
import { useLatest } from "../types";

const HEARTBEAT_INTERVAL_MS = 15000;

export interface ProctorChannelHandlers {
  onPause?: (message: string) => void;
  onResume?: () => void;
  onTerminate?: (message: string) => void;
  onNotice?: (message: string) => void;
}

/**
 * Proctor Channel Agent.
 * Authenticated Socket.IO link for live faculty interventions
 * (pause / resume / terminate / warning), a liveness heartbeat, and the
 * live camera feed for the faculty video wall. The server sets the frame
 * rate (`live-config`): 0 while nobody watches, 1 fps in the grid, 5 fps
 * when a faculty member opens this candidate full-size.
 */
export function useProctorChannelAgent(params: {
  active: boolean;
  attemptId: string | null;
  handlers: ProctorChannelHandlers;
  /** Grabs a JPEG data URL for the live feed (larger when focused). */
  captureLiveFrame?: (focused: boolean) => string | null;
}) {
  const { active, attemptId } = params;
  const handlersRef = useLatest(params.handlers);
  const captureRef = useLatest(params.captureLiveFrame);
  const [connected, setConnected] = useState(false);
  const [liveFps, setLiveFps] = useState(0);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!active || !attemptId) return;

    const roomId = `student-proctoring-${attemptId}`;
    const socket = createAuthedSocket();
    socketRef.current = socket;

    socket.on("connect", async () => {
      setConnected(true);
      const ok = await joinRoom(socket, roomId);
      if (!ok) console.warn("[Socket] Proctoring room join was not authorized.");
    });
    socket.on("disconnect", () => {
      setConnected(false);
      setLiveFps(0);
    });
    socket.on("live-config", (cfg: { attemptId?: string; fps?: number }) => {
      if (cfg?.attemptId !== attemptId) return;
      const fps = Number(cfg.fps);
      setLiveFps(Number.isFinite(fps) ? Math.max(0, Math.min(fps, 6)) : 0);
    });
    socket.on("connect_error", (err) => {
      setConnected(false);
      console.warn("[Socket] Connection error:", err.message);
    });

    const heartbeat = setInterval(() => {
      if (socket.connected) socket.emit("proctor-heartbeat", { attemptId });
    }, HEARTBEAT_INTERVAL_MS);

    socket.on("proctor-action", (data: { action: string; status: string; message: string }) => {
      const h = handlersRef.current;
      if (data.action === "pause-exam") {
        h.onPause?.(data.message || "Exam paused by the faculty proctor.");
      } else if (data.action === "resume-exam") {
        h.onResume?.();
        toast.success("Examination resumed by the faculty proctor.");
      } else if (data.action === "terminate-exam") {
        h.onTerminate?.(data.message || "Exam terminated by the faculty proctor.");
      } else if (data.action === "warning") {
        const msg = data.message || "Please maintain focus on the examination.";
        toast.warning(`Proctor notice: ${msg}`);
        h.onNotice?.(msg);
      }
    });

    return () => {
      clearInterval(heartbeat);
      socket.emit("leave-room", roomId);
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
      setLiveFps(0);
    };
  }, [active, attemptId, handlersRef]);

  // Live feed publisher: only runs while a faculty member is watching.
  useEffect(() => {
    if (!active || !attemptId || !connected || liveFps <= 0) return;
    const focused = liveFps > 1;
    const timer = setInterval(() => {
      const socket = socketRef.current;
      if (!socket?.connected || document.hidden) return;
      const frame = captureRef.current?.(focused);
      if (frame) socket.volatile.emit("live-frame", { attemptId, frame });
    }, Math.round(1000 / liveFps));
    return () => clearInterval(timer);
  }, [active, attemptId, connected, liveFps, captureRef]);

  return { connected, liveFps, beingWatched: liveFps > 0 };
}
