import { useEffect, useRef, useState } from "react";

/** Each segment is a complete, independently playable file. */
export const SEGMENT_MS = 30_000;
const VIDEO_BITS_PER_SECOND = 300_000;
const AUDIO_BITS_PER_SECOND = 32_000;
const MAX_BACKOFF_MS = 30_000;

export type RecordingStatus = "idle" | "starting" | "recording" | "unsupported" | "error";

interface PendingSegment {
  localIndex: number;
  blob: Blob;
  startedAt: number;
  durationMs: number;
  hasAudio: boolean;
  tries: number;
}

function pickMimeType(withAudio: boolean): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = withAudio
    ? ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]
    : ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Recording Agent.
 * Records the WHOLE exam session (not only rule violations) from the moment
 * the exam starts until it ends. The camera (and, when the assessment enables
 * microphone analysis, the microphone) is recorded in 30-second segments; each
 * segment is a standalone file uploaded to the backend with a retrying queue,
 * so a network drop delays upload but does not lose footage while the page
 * stays open. Uploads keep running after submit until the queue drains.
 */
export function useRecordingAgent(params: {
  active: boolean;
  attemptId: string | null;
  stream: MediaStream | null;
  includeAudio: boolean;
}) {
  const { active, attemptId, stream, includeAudio } = params;
  const [status, setStatus] = useState<RecordingStatus>("idle");
  const [uploaded, setUploaded] = useState(0);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);
  const [recordedMs, setRecordedMs] = useState(0);

  // Per-page state that must survive effect restarts (e.g. camera reconnect).
  const queueRef = useRef<PendingSegment[]>([]);
  const nextLocalIndexRef = useRef(0);
  const sequenceBaseRef = useRef<number | null>(null);
  const drainingRef = useRef(false);
  const attemptRef = useRef(attemptId);
  attemptRef.current = attemptId;

  const fetchSequenceBase = async (id: string): Promise<number | null> => {
    try {
      const res = await fetch(`/api/proctoring/recordings/${id}/status`, { cache: "no-store" });
      if (!res.ok) return null;
      const body = await res.json();
      const n = Number(body?.data?.nextSequence);
      return Number.isInteger(n) && n >= 0 ? n : null;
    } catch {
      return null;
    }
  };

  /** Uploads queued segments in order; never cancelled by unmount. */
  const drain = async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    try {
      while (queueRef.current.length > 0) {
        const id = attemptRef.current;
        if (!id) break;
        if (sequenceBaseRef.current === null) {
          sequenceBaseRef.current = await fetchSequenceBase(id);
          if (sequenceBaseRef.current === null) {
            await sleep(5000);
            continue;
          }
        }

        const seg = queueRef.current[0];
        const form = new FormData();
        const ext = seg.blob.type.includes("mp4") ? "mp4" : "webm";
        form.append("sequence", String(sequenceBaseRef.current + seg.localIndex));
        form.append("startedAt", String(seg.startedAt));
        form.append("durationMs", String(seg.durationMs));
        form.append("hasAudio", String(seg.hasAudio));
        form.append("segment", seg.blob, `segment-${seg.localIndex}.${ext}`);

        let outcome: "ok" | "retry" | "drop" = "retry";
        try {
          const res = await fetch(`/api/proctoring/recordings/${id}/segments`, { method: "POST", body: form });
          if (res.ok) outcome = "ok";
          else if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
            outcome = "drop";
            console.error(`[recording] Segment ${seg.localIndex} rejected (${res.status}).`);
          }
        } catch {
          outcome = "retry";
        }

        if (outcome === "retry") {
          seg.tries += 1;
          await sleep(Math.min(2000 * 2 ** (seg.tries - 1), MAX_BACKOFF_MS));
          continue;
        }
        queueRef.current.shift();
        setPending(queueRef.current.length);
        if (outcome === "ok") setUploaded((n) => n + 1);
        else setFailed((n) => n + 1);
      }
    } finally {
      drainingRef.current = false;
    }
  };

  useEffect(() => {
    if (!active || !attemptId || !stream) {
      setStatus((s) => (s === "unsupported" ? s : "idle"));
      return;
    }
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return;

    let cancelled = false;
    let recorder: MediaRecorder | null = null;
    let segmentTimer: ReturnType<typeof setTimeout> | null = null;
    let micStream: MediaStream | null = null;

    const enqueue = (seg: Omit<PendingSegment, "tries" | "localIndex">) => {
      queueRef.current.push({ ...seg, localIndex: nextLocalIndexRef.current++, tries: 0 });
      setPending(queueRef.current.length);
      setRecordedMs((ms) => ms + seg.durationMs);
      void drain();
    };

    const start = async () => {
      setStatus("starting");
      if (sequenceBaseRef.current === null) {
        void fetchSequenceBase(attemptId).then((n) => {
          if (n !== null && sequenceBaseRef.current === null) sequenceBaseRef.current = n;
        });
      }

      if (includeAudio) {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
          micStream = null; // record video only
        }
      }
      if (cancelled) {
        micStream?.getTracks().forEach((t) => t.stop());
        return;
      }

      const tracks: MediaStreamTrack[] = [videoTrack, ...(micStream?.getAudioTracks() ?? [])];
      const hasAudio = tracks.length > 1;
      const recStream = new MediaStream(tracks);
      const mimeType = pickMimeType(hasAudio);
      if (!mimeType) {
        setStatus("unsupported");
        return;
      }

      const startSegment = () => {
        if (cancelled) return;
        if (videoTrack.readyState !== "live") {
          setStatus("idle"); // camera gone: resumes when a new stream arrives
          micStream?.getTracks().forEach((t) => t.stop());
          return;
        }
        const chunks: Blob[] = [];
        const startedAt = Date.now();
        let rec: MediaRecorder;
        try {
          rec = new MediaRecorder(recStream, {
            mimeType,
            videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
            audioBitsPerSecond: hasAudio ? AUDIO_BITS_PER_SECOND : undefined,
          });
        } catch (err) {
          console.error("[recording] MediaRecorder failed to start:", err);
          setStatus("error");
          return;
        }
        rec.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };
        rec.onerror = (e) => console.error("[recording] Recorder error:", e);
        rec.onstop = () => {
          if (segmentTimer) clearTimeout(segmentTimer);
          const blob = new Blob(chunks, { type: (rec.mimeType || mimeType).split(";")[0] });
          if (blob.size > 0) enqueue({ blob, startedAt, durationMs: Date.now() - startedAt, hasAudio });
          if (cancelled) micStream?.getTracks().forEach((t) => t.stop());
          else startSegment(); // seamless roll-over to the next segment
        };
        // A timeslice flushes data every second, so an abrupt stop loses < 1s.
        rec.start(1000);
        recorder = rec;
        setStatus("recording");
        segmentTimer = setTimeout(() => {
          if (rec.state !== "inactive") rec.stop();
        }, SEGMENT_MS);
      };

      startSegment();
    };

    void start();

    return () => {
      cancelled = true;
      if (segmentTimer) clearTimeout(segmentTimer);
      if (recorder && recorder.state !== "inactive") recorder.stop(); // final partial segment
      else micStream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, attemptId, stream, includeAudio]);

  return { status, uploaded, pending, failed, recordedMs };
}
