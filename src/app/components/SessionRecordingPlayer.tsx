import { useCallback, useEffect, useRef, useState } from "react";
import { Film, Loader2, RefreshCw, ShieldCheck } from "lucide-react";

interface Segment {
  id: string;
  sequence: number;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  hasAudio: boolean;
  startedAt: string;
  durationMs: number;
}

interface Violation {
  type: string;
  timestamp: string;
  severity?: string;
}

const fmtDuration = (ms: number) => {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
};
const fmtClock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/**
 * Faculty playback of the continuous exam recording. Segments are fetched as
 * authenticated blobs and played back-to-back; violation timestamps are shown
 * as markers so a reviewer can jump to the footage around any event.
 */
export default function SessionRecordingPlayer({ attemptId, violations = [] }: { attemptId: string; violations?: Violation[] }) {
  const [segments, setSegments] = useState<Segment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [loadingSegment, setLoadingSegment] = useState(false);
  const [pendingSeekMs, setPendingSeekMs] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const blobCache = useRef(new Map<number, string>());

  const load = useCallback(async () => {
    setError(null);
    setSegments(null);
    try {
      const res = await fetch(`/api/proctoring/recordings/${attemptId}/segments`, { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
      setSegments(body?.data?.segments ?? []);
      setIndex(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the recording.");
    }
  }, [attemptId]);

  useEffect(() => {
    void load();
    const cache = blobCache.current;
    return () => {
      cache.forEach((url) => URL.revokeObjectURL(url));
      cache.clear();
    };
  }, [load]);

  const fetchSegmentUrl = useCallback(
    async (seg: Segment) => {
      const cached = blobCache.current.get(seg.sequence);
      if (cached) return cached;
      const res = await fetch(`/api/proctoring/recordings/${attemptId}/segments/${seg.sequence}`);
      if (!res.ok) throw new Error(`Segment ${seg.sequence + 1} could not be loaded (HTTP ${res.status}).`);
      const url = URL.createObjectURL(await res.blob());
      blobCache.current.set(seg.sequence, url);
      return url;
    },
    [attemptId],
  );

  // Load the current segment (and prefetch the next one).
  useEffect(() => {
    if (!segments || segments.length === 0) return;
    const seg = segments[index];
    if (!seg) return;
    let cancelled = false;
    setLoadingSegment(true);
    fetchSegmentUrl(seg)
      .then((url) => {
        if (cancelled || !videoRef.current) return;
        const v = videoRef.current;
        v.src = url;
        v.onloadedmetadata = () => {
          if (pendingSeekMs > 0) v.currentTime = pendingSeekMs / 1000;
          setPendingSeekMs(0);
        };
        void v.play().catch(() => {});
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoadingSegment(false));
    const next = segments[index + 1];
    if (next) void fetchSegmentUrl(next).catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments, index, fetchSegmentUrl]);

  const totalMs = segments?.reduce((sum, s) => sum + s.durationMs, 0) ?? 0;
  const sessionStart = segments?.[0] ? new Date(segments[0].startedAt).getTime() : 0;
  const sessionEnd = segments?.length
    ? new Date(segments[segments.length - 1].startedAt).getTime() + segments[segments.length - 1].durationMs
    : 0;

  /** Jump to the segment covering a wall-clock time. */
  const seekToTime = (t: number) => {
    if (!segments) return;
    const i = segments.findIndex((s) => {
      const start = new Date(s.startedAt).getTime();
      return t >= start && t < start + s.durationMs;
    });
    if (i < 0) return;
    const offset = Math.max(0, t - new Date(segments[i].startedAt).getTime() - 5000); // 5 s of context
    if (i === index && videoRef.current) {
      videoRef.current.currentTime = offset / 1000;
      void videoRef.current.play().catch(() => {});
    } else {
      setPendingSeekMs(offset);
      setIndex(i);
    }
  };

  const markers =
    segments && sessionEnd > sessionStart
      ? violations
          .map((v) => ({ ...v, t: new Date(v.timestamp).getTime() }))
          .filter((v) => v.t >= sessionStart && v.t <= sessionEnd)
      : [];

  return (
    <div className="bg-white border border-[#dedede] rounded-2xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b pb-2">
        <h4 className="text-sm font-bold flex items-center gap-2">
          <Film className="size-4 text-[#676767]" /> Full Session Recording
        </h4>
        <button
          type="button"
          onClick={() => void load()}
          className="text-[#8a8a8a] hover:text-[#1a1917] cursor-pointer"
          aria-label="Reload recording"
        >
          <RefreshCw className="size-3.5" />
        </button>
      </div>

      {error ? (
        <p className="text-xs text-rose-600">{error}</p>
      ) : segments === null ? (
        <div className="flex items-center gap-2 text-xs text-[#8a8a8a]">
          <Loader2 className="size-4 animate-spin" /> Loading recording...
        </div>
      ) : segments.length === 0 ? (
        <p className="text-xs text-[#8a8a8a]">No recording was uploaded for this attempt.</p>
      ) : (
        <>
          <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
            <video
              ref={videoRef}
              controls
              playsInline
              className="w-full h-full object-contain"
              onEnded={() => setIndex((i) => (segments && i < segments.length - 1 ? i + 1 : i))}
            />
            {loadingSegment && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <Loader2 className="size-6 animate-spin text-white" />
              </div>
            )}
          </div>

          <div className="flex justify-between text-[11px] text-[#676767]">
            <span>
              Segment {index + 1}/{segments.length} · {fmtClock(segments[index].startedAt)}
            </span>
            <span>Total {fmtDuration(totalMs)}</span>
          </div>

          {/* Session timeline: one block per segment, red ticks at violations */}
          <div className="relative h-6 rounded-md bg-[#f2f2f2] flex overflow-hidden" aria-label="Recording timeline">
            {segments.map((s, i) => (
              <button
                key={s.id}
                type="button"
                title={`${fmtClock(s.startedAt)} · ${fmtDuration(s.durationMs)}`}
                onClick={() => setIndex(i)}
                style={{ flexGrow: Math.max(s.durationMs, 1) }}
                className={`h-full border-r border-white/70 cursor-pointer ${i === index ? "bg-[#1a1917]/70" : "bg-[#c4c4c4] hover:bg-[#9e9e9e]"}`}
              />
            ))}
            {markers.map((m, i) => (
              <button
                key={`${m.type}-${i}`}
                type="button"
                title={`${m.type} at ${fmtClock(m.timestamp)}`}
                onClick={() => seekToTime(m.t)}
                style={{ left: `${((m.t - sessionStart) / (sessionEnd - sessionStart)) * 100}%` }}
                className="absolute top-0 h-full w-1 -ml-0.5 bg-red-500 cursor-pointer"
              />
            ))}
          </div>

          {markers.length > 0 && (
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {markers.map((m, i) => (
                <button
                  key={`row-${i}`}
                  type="button"
                  onClick={() => seekToTime(m.t)}
                  className="w-full flex justify-between text-[11px] px-2 py-1 rounded hover:bg-rose-50 cursor-pointer"
                >
                  <span className="text-red-700 font-semibold capitalize">{m.type.replace(/[-_]/g, " ").toLowerCase()}</span>
                  <span className="text-[#8a8a8a] font-mono">{fmtClock(m.timestamp)}</span>
                </button>
              ))}
            </div>
          )}

          <p className="flex items-start gap-1.5 text-[10px] text-[#8a8a8a]">
            <ShieldCheck className="size-3.5 shrink-0 mt-px" />
            Each segment is stored write-once with a SHA-256 hash (current: {segments[index].sha256.slice(0, 12)}…).
          </p>
        </>
      )}
    </div>
  );
}
