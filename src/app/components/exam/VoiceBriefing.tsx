import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, VolumeX, RotateCcw, ShieldCheck } from "lucide-react";

/** ~56 words: about 20 seconds of speech at rate 1.05. */
export const BRIEFING_SENTENCES = [
  "Welcome to your proctored assessment.",
  "Your camera is monitored and the whole session is recorded.",
  "Stay in full screen and keep your face visible.",
  "Do not switch tabs, copy, paste, or use other devices.",
  "If your internet becomes too slow, the exam pauses and your time stops.",
  "Your timer starts when this briefing ends. Good luck.",
];

const BRIEFING_SECONDS = 20;
/** If speech runs past the countdown, wait at most this long for it to finish. */
const MAX_SPEECH_OVERRUN_MS = 8000;

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  return (
    voices.find((v) => v.lang === "en-IN") ||
    voices.find((v) => v.lang === "en-GB" && /female|natural|google/i.test(v.name)) ||
    voices.find((v) => v.lang?.startsWith("en") && v.localService) ||
    voices.find((v) => v.lang?.startsWith("en")) ||
    null
  );
}

/**
 * Spoken, captioned pre-exam briefing. Runs for a fixed 20 seconds (cannot be
 * skipped) and then calls onDone; the exam timer only starts afterwards.
 * Falls back to captions alone where speech synthesis is unavailable.
 */
export default function VoiceBriefing({ onDone, examTitle }: { onDone: () => void; examTitle?: string }) {
  const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [secondsLeft, setSecondsLeft] = useState(BRIEFING_SECONDS);
  const [current, setCurrent] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const doneRef = useRef(false);
  const runIdRef = useRef(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    window.speechSynthesis?.cancel();
    onDoneRef.current();
  }, []);

  /** Speaks the sentences one after another so captions can follow along. */
  const speakFrom = useCallback(
    (start: number) => {
      if (!speechSupported) return;
      const runId = ++runIdRef.current;
      window.speechSynthesis.cancel();
      const voice = pickVoice();
      const say = (i: number) => {
        if (runId !== runIdRef.current || doneRef.current) return;
        if (i >= BRIEFING_SENTENCES.length) {
          setSpeaking(false);
          return;
        }
        const u = new SpeechSynthesisUtterance(BRIEFING_SENTENCES[i]);
        if (voice) u.voice = voice;
        u.lang = voice?.lang || "en-IN";
        u.rate = 1.05;
        u.pitch = 1;
        u.onstart = () => {
          setCurrent(i);
          setSpeaking(true);
        };
        u.onend = () => say(i + 1);
        u.onerror = () => say(i + 1);
        window.speechSynthesis.speak(u);
      };
      say(start);
    },
    [speechSupported],
  );

  // Start speaking (voices can load asynchronously on first use).
  useEffect(() => {
    if (!speechSupported) return;
    let started = false;
    const begin = () => {
      if (started) return;
      started = true;
      speakFrom(0);
    };
    if (window.speechSynthesis.getVoices().length > 0) begin();
    else {
      window.speechSynthesis.addEventListener("voiceschanged", begin, { once: true });
      const fallback = setTimeout(begin, 600);
      return () => {
        clearTimeout(fallback);
        window.speechSynthesis.removeEventListener("voiceschanged", begin);
        window.speechSynthesis.cancel();
      };
    }
    return () => window.speechSynthesis.cancel();
  }, [speechSupported, speakFrom]);

  // Captions advance on a timer when there is no speech to follow.
  useEffect(() => {
    if (speechSupported && !muted) return;
    const step = (BRIEFING_SECONDS * 1000) / BRIEFING_SENTENCES.length;
    const t = setInterval(() => setCurrent((c) => Math.min(c + 1, BRIEFING_SENTENCES.length - 1)), step);
    return () => clearInterval(t);
  }, [speechSupported, muted]);

  // Fixed 20-second countdown.
  useEffect(() => {
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  // Finish once the countdown is over and the voice has finished (bounded wait).
  useEffect(() => {
    if (secondsLeft > 0) return;
    if (!speaking || muted || !speechSupported) {
      finish();
      return;
    }
    const t = setTimeout(finish, MAX_SPEECH_OVERRUN_MS);
    return () => clearTimeout(t);
  }, [secondsLeft, speaking, muted, speechSupported, finish]);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const toggleMute = () => {
    if (!speechSupported) return;
    if (muted) {
      setMuted(false);
      speakFrom(current);
    } else {
      setMuted(true);
      runIdRef.current += 1;
      window.speechSynthesis.cancel();
      setSpeaking(false);
    }
  };

  const progress = ((BRIEFING_SECONDS - secondsLeft) / BRIEFING_SECONDS) * 100;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="briefing-title"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[#141312] p-4 sm:p-6 select-none"
    >
      <div className="w-full max-w-[560px] rounded-3xl border border-zinc-800 bg-[#1f1e1c] p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Before you begin</span>
            <h2 id="briefing-title" className="mt-1 text-xl font-bold text-white">Exam briefing</h2>
            {examTitle && <p className="text-xs text-zinc-400 mt-0.5 truncate">{examTitle}</p>}
          </div>
          <div className="relative size-14 shrink-0" aria-label={`${secondsLeft} seconds remaining`}>
            <svg viewBox="0 0 56 56" className="size-14 -rotate-90">
              <circle cx="28" cy="28" r="24" fill="none" stroke="#3f3f46" strokeWidth="4" />
              <circle
                cx="28"
                cy="28"
                r="24"
                fill="none"
                stroke="#e4e4e7"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 24}
                strokeDashoffset={2 * Math.PI * 24 * (1 - progress / 100)}
                className="transition-[stroke-dashoffset] duration-1000 ease-linear"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-extrabold font-mono text-white">
              {secondsLeft}
            </span>
          </div>
        </div>

        <ol className="space-y-2.5" aria-live="polite">
          {BRIEFING_SENTENCES.map((line, i) => (
            <li
              key={line}
              className={`flex gap-3 rounded-xl px-3 py-2 text-sm leading-relaxed transition-colors duration-300 ${
                i === current
                  ? "bg-zinc-100 text-zinc-950 font-semibold"
                  : i < current
                  ? "text-zinc-400"
                  : "text-zinc-600"
              }`}
            >
              <span className="font-mono text-[11px] pt-0.5 opacity-60">{String(i + 1).padStart(2, "0")}</span>
              <span>{line}</span>
            </li>
          ))}
        </ol>

        <div className="flex items-center justify-between gap-3 border-t border-zinc-800 pt-4">
          <div className="flex items-center gap-2 text-[11px] text-zinc-400">
            <ShieldCheck className="size-4 text-emerald-400 shrink-0" />
            {speechSupported ? (speaking ? "Playing voice instructions…" : muted ? "Voice muted · read the captions" : "Listen to the instructions") : "Voice isn't available in this browser · read the captions"}
          </div>
          {speechSupported && (
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setMuted(false);
                  speakFrom(0);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-200 hover:bg-zinc-800 cursor-pointer"
              >
                <RotateCcw className="size-3.5" /> Replay
              </button>
              <button
                type="button"
                onClick={toggleMute}
                aria-pressed={muted}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-200 hover:bg-zinc-800 cursor-pointer"
              >
                {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
                {muted ? "Unmute" : "Mute"}
              </button>
            </div>
          )}
        </div>
        <p className="text-[11px] text-zinc-500 text-center">The exam starts automatically when the countdown ends.</p>
      </div>
    </div>
  );
}
