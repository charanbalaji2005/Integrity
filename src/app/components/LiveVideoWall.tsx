import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Maximize2, Pause, Play, ShieldAlert, Video, VideoOff, X, XCircle } from "lucide-react";
import { createAuthedSocket, joinRoom } from "../utils/socket-client";
import type { Socket } from "socket.io-client";

type ProctorAction = "warning" | "pause" | "resume" | "terminate";

interface LiveFrame {
  src: string;
  at: number;
}

/** A tile is "live" if a frame arrived within this window. */
const LIVE_WINDOW_MS = 4000;

/**
 * Faculty live video wall. Joins `assessment-live-<id>`; the server then asks
 * every candidate in the assessment to publish ~1 fps thumbnails, and 5 fps
 * for the candidate opened full-size. Nothing is streamed when nobody watches.
 */
export default function LiveVideoWall({
  assessmentId,
  attempts,
  onAction,
  pendingAction,
}: {
  assessmentId: string;
  attempts: any[];
  onAction: (action: ProctorAction, att: any) => void;
  pendingAction?: string | null;
}) {
  const [frames, setFrames] = useState<Record<string, LiveFrame>>({});
  const [focusId, setFocusId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState(Date.now());
  const socketRef = useRef<Socket | null>(null);
  const pendingRef = useRef<Record<string, LiveFrame>>({});
  const rafRef = useRef<number | null>(null);
  const focusIdRef = useRef<string | null>(null);

  useEffect(() => {
    const roomId = `assessment-live-${assessmentId}`;
    const socket = createAuthedSocket();
    socketRef.current = socket;

    socket.on("connect", async () => {
      const ok = await joinRoom(socket, roomId);
      setConnected(ok);
      if (ok && focusIdRef.current) socket.emit("live-focus", { assessmentId, attemptId: focusIdRef.current });
    });
    socket.on("disconnect", () => setConnected(false));

    // Batch incoming frames into one render per animation frame.
    socket.on("live-frame", (data: { attemptId: string; frame: string; at: number }) => {
      if (!data?.attemptId || typeof data.frame !== "string") return;
      pendingRef.current[data.attemptId] = { src: data.frame, at: Date.now() };
      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          const batch = pendingRef.current;
          pendingRef.current = {};
          setFrames((prev) => ({ ...prev, ...batch }));
        });
      }
    });

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      socket.emit("leave-room", roomId);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [assessmentId]);

  useEffect(() => {
    focusIdRef.current = focusId;
    socketRef.current?.emit("live-focus", { assessmentId, attemptId: focusId });
  }, [focusId, assessmentId]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!focusId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFocusId(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusId]);

  const live = attempts.filter((a) => a.status === "started");
  const focused = live.find((a) => a.id === focusId) ?? null;
  const isLive = (id: string) => {
    const f = frames[id];
    return Boolean(f && now - f.at < LIVE_WINDOW_MS);
  };
  const liveCount = live.filter((a) => isLive(a.id)).length;

  const statusBadge = (att: any) => {
    if (att.proctoringStatus === "PAUSED") return { text: "Paused", cls: "bg-red-600 text-white" };
    if (att.proctoringStatus === "WARNING") return { text: "Warning", cls: "bg-amber-500 text-zinc-950" };
    if (!att.isOnline) return { text: "Offline", cls: "bg-zinc-600 text-white" };
    return null;
  };

  const actionButtons = (att: any, size: "sm" | "md") => {
    const base =
      size === "md"
        ? "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold cursor-pointer disabled:opacity-50"
        : "inline-flex items-center justify-center rounded-md size-7 cursor-pointer disabled:opacity-50";
    const busy = (a: string) => pendingAction === `${a}:${att.id}`;
    const paused = att.proctoringStatus === "PAUSED";
    return (
      <>
        <button type="button" title="Send warning" disabled={busy("warning")} onClick={() => onAction("warning", att)} className={`${base} bg-amber-100 text-amber-900 hover:bg-amber-200`}>
          <AlertTriangle className="size-3.5" />{size === "md" && "Warn"}
        </button>
        {paused ? (
          <button type="button" title="Resume exam" disabled={busy("resume")} onClick={() => onAction("resume", att)} className={`${base} bg-emerald-100 text-emerald-900 hover:bg-emerald-200`}>
            <Play className="size-3.5" />{size === "md" && "Resume"}
          </button>
        ) : (
          <button type="button" title="Pause exam" disabled={busy("pause")} onClick={() => onAction("pause", att)} className={`${base} bg-zinc-200 text-zinc-900 hover:bg-zinc-300`}>
            <Pause className="size-3.5" />{size === "md" && "Pause"}
          </button>
        )}
        <button
          type="button"
          title="Terminate exam"
          disabled={busy("terminate")}
          onClick={() => onAction("terminate", att)}
          className={`${base} bg-red-100 text-red-800 hover:bg-red-200`}
        >
          <XCircle className="size-3.5" />{size === "md" && "Terminate"}
        </button>
      </>
    );
  };

  return (
    <section className="bg-white border border-[#dedede] rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Video className="size-4 text-[#1a1917]" />
          <h2 className="text-sm font-bold">Live Video Monitoring</h2>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
              connected ? "bg-red-50 text-red-700 border border-red-200" : "bg-zinc-100 text-zinc-600 border border-zinc-200"
            }`}
          >
            <span className={`size-1.5 rounded-full ${connected ? "bg-red-500 animate-pulse" : "bg-zinc-400"}`} />
            {connected ? "LIVE" : "Connecting"}
          </span>
        </div>
        <span className="text-[11px] text-[#8a8a8a]">
          {liveCount}/{live.length} cameras streaming · click a tile to enlarge
        </span>
      </div>

      {live.length === 0 ? (
        <p className="text-xs text-[#8a8a8a] py-6 text-center">No candidates are taking this assessment right now.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6 gap-3">
          {live.map((att) => {
            const frame = frames[att.id];
            const streaming = isLive(att.id);
            const badge = statusBadge(att);
            const risk = att.integrityScore < 60 ? "ring-2 ring-red-500" : att.integrityScore < 85 ? "ring-2 ring-amber-400" : "";
            return (
              <button
                key={att.id}
                type="button"
                onClick={() => setFocusId(att.id)}
                className={`group relative aspect-[4/3] rounded-xl overflow-hidden bg-zinc-900 text-left cursor-pointer ${risk}`}
                aria-label={`Open live camera for ${att.studentName}`}
              >
                {frame ? (
                  <img src={frame.src} alt="" className={`absolute inset-0 w-full h-full object-cover -scale-x-100 ${streaming ? "" : "opacity-40 grayscale"}`} />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-zinc-500">
                    <VideoOff className="size-5" />
                    <span className="text-[10px]">{att.isOnline ? "Waiting for video" : "Offline"}</span>
                  </div>
                )}
                <div className="absolute inset-x-0 top-0 flex items-center justify-between p-1.5">
                  <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold ${streaming ? "bg-red-600 text-white" : "bg-black/60 text-zinc-300"}`}>
                    {streaming && <span className="size-1.5 rounded-full bg-white animate-pulse" />}
                    {streaming ? "LIVE" : frame ? `${Math.round((now - frame.at) / 1000)}s ago` : "NO SIGNAL"}
                  </span>
                  {badge && <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${badge.cls}`}>{badge.text}</span>}
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-2 pt-5 flex items-end justify-between gap-1">
                  <span className="text-[11px] font-bold text-white truncate">{att.studentName}</span>
                  <span className={`text-[10px] font-extrabold shrink-0 ${att.integrityScore < 60 ? "text-red-300" : att.integrityScore < 85 ? "text-amber-300" : "text-emerald-300"}`}>
                    {Math.round(att.integrityScore ?? 100)}%
                  </span>
                </div>
                <Maximize2 className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-6 text-white opacity-0 group-hover:opacity-80 transition" />
              </button>
            );
          })}
        </div>
      )}

      {focused && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Live camera: ${focused.studentName}`}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-3 sm:p-6"
          onClick={() => setFocusId(null)}
        >
          <div className="w-full max-w-4xl bg-white rounded-2xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#dedede]">
              <div className="min-w-0">
                <h3 className="text-sm font-bold truncate">{focused.studentName}</h3>
                <p className="text-[11px] text-[#8a8a8a]">
                  Integrity {Math.round(focused.integrityScore ?? 100)}% · {focused.warningCount ?? 0} warnings · {focused.faceStatus || "—"}
                </p>
              </div>
              <button type="button" onClick={() => setFocusId(null)} className="rounded-lg p-2 hover:bg-[#f6f6f6] cursor-pointer" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>
            <div className="relative bg-black aspect-video">
              {frames[focused.id] ? (
                <img src={frames[focused.id].src} alt={`Live camera of ${focused.studentName}`} className="absolute inset-0 w-full h-full object-contain -scale-x-100" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-zinc-400 text-xs gap-2">
                  <VideoOff className="size-4" /> Waiting for video…
                </div>
              )}
              <span className={`absolute top-3 left-3 inline-flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-bold ${isLive(focused.id) ? "bg-red-600 text-white" : "bg-black/70 text-zinc-300"}`}>
                {isLive(focused.id) && <span className="size-1.5 rounded-full bg-white animate-pulse" />}
                {isLive(focused.id) ? "LIVE · 5 fps" : "NO SIGNAL"}
              </span>
              {focused.proctoringStatus === "PAUSED" && (
                <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-[10px] font-bold text-white">
                  <ShieldAlert className="size-3" /> Exam paused
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3">{actionButtons(focused, "md")}</div>
          </div>
        </div>
      )}
    </section>
  );
}
