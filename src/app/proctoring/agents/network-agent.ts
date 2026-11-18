import { useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "../../utils/api-client";
import { reportViolation } from "../report-violation";
import { type NetworkSnapshot, type NetworkStatus, useLatest } from "../types";

const PROBE_INTERVAL_MS = 4000;
/** A probe slower than this (or failing) counts as unusable. */
const PROBE_TIMEOUT_MS = 8000;
const UNUSABLE_LATENCY_MS = 2500;
/** Consecutive unusable probes (≈ 12 s) before the exam is put on hold. */
const CRITICAL_AFTER = 3;
/** Consecutive healthy probes before the hold is lifted. */
const RECOVER_AFTER = 2;

const classify = (ms: number): NetworkStatus =>
  ms < 50 ? "Excellent" : ms < 100 ? "Good" : ms < 250 ? "Slow" : "Poor";

/**
 * Network Agent.
 * Probes latency every few seconds and tracks online/offline transitions.
 * A degraded link is logged once per episode (on entering Slow/Poor), not on
 * every probe, so a single bad connection doesn't flood the proctor log.
 *
 * `critical` turns on when the link is too slow to run the exam at all
 * (several consecutive probes time out, fail, or take > 2.5 s) and turns
 * off again after consecutive healthy probes. The exam view uses it to put
 * the exam on hold and freeze the timer.
 */
export function useNetworkAgent(params: {
  active: boolean;
  attemptId: string | null;
  userId: string;
  /** Called when the link degrades or drops, to adjust local warning counters. */
  onPenalty?: (scorePenalty: number) => void;
  /** Called after the connection comes back (e.g. to sync offline answers). */
  onReconnect?: () => Promise<boolean | void> | boolean | void;
}) {
  const { active, attemptId, userId } = params;
  const [status, setStatus] = useState<NetworkStatus>("Excellent");
  const [latency, setLatency] = useState(42);
  const [showSlowAlert, setShowSlowAlert] = useState(false);
  const [critical, setCritical] = useState(false);
  const snapshotRef = useRef<NetworkSnapshot>({ status: "Excellent", latency: 42 });
  const onPenaltyRef = useLatest(params.onPenalty);
  const onReconnectRef = useLatest(params.onReconnect);

  const apply = (next: NetworkStatus, ms: number) => {
    snapshotRef.current = { status: next, latency: ms };
    setStatus(next);
    setLatency(ms);
  };

  // Latency probe
  useEffect(() => {
    if (!active || !attemptId) return;
    let cancelled = false;
    let degraded = false;
    let badStreak = 0;
    let goodStreak = 0;
    let inFlight = false;

    const track = (usable: boolean) => {
      if (usable) {
        goodStreak += 1;
        badStreak = 0;
        if (goodStreak >= RECOVER_AFTER) setCritical(false);
      } else {
        badStreak += 1;
        goodStreak = 0;
        if (badStreak >= CRITICAL_AFTER) setCritical(true);
      }
    };

    const probe = async () => {
      if (inFlight) return; // a stalled probe counts once, not on every tick
      if (!navigator.onLine) {
        apply("Offline", 0);
        track(false);
        return;
      }
      inFlight = true;
      const start = performance.now();
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
      try {
        const res = await fetch(`${API_BASE_URL}/api/health`, { method: "HEAD", cache: "no-store", signal: ctrl.signal });
        if (cancelled) return;
        if (!res.ok) {
          apply("Offline", 0);
          track(false);
          return;
        }
        const ms = Math.round(performance.now() - start);
        track(ms < UNUSABLE_LATENCY_MS);
        const next = classify(ms);
        apply(next, ms);

        const isDegraded = next === "Slow" || next === "Poor";
        if (isDegraded && !degraded) {
          setShowSlowAlert(true);
          onPenaltyRef.current?.(2);
          void reportViolation(attemptId, userId, "slow-network", "low", `Slow connection detected: latency ${ms} ms.`);
        } else if (!isDegraded) {
          setShowSlowAlert(false);
        }
        degraded = isDegraded;
      } catch {
        if (!cancelled) {
          apply("Offline", 0);
          track(false);
        }
      } finally {
        clearTimeout(timeout);
        inFlight = false;
      }
    };

    void probe();
    const interval = setInterval(probe, PROBE_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
      setCritical(false);
    };
  }, [active, attemptId, userId, onPenaltyRef]);

  // Online / offline transitions
  useEffect(() => {
    if (!active || !attemptId) return;

    const onOnline = async () => {
      apply("Good", snapshotRef.current.latency);
      const synced = await onReconnectRef.current?.();
      if (synced) {
        void reportViolation(
          attemptId,
          userId,
          "internet-reconnect",
          "low",
          "Internet connection restored. Answers synced successfully.",
        );
      }
    };
    const onOffline = async () => {
      apply("Offline", 0);
      const ok = await reportViolation(
        attemptId,
        userId,
        "internet-disconnect",
        "medium",
        "Internet connection was disconnected.",
      );
      if (ok) onPenaltyRef.current?.(5);
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [active, attemptId, userId, onPenaltyRef, onReconnectRef]);

  return {
    status,
    latency,
    snapshotRef,
    showSlowAlert,
    critical,
    dismissSlowAlert: () => setShowSlowAlert(false),
  };
}
