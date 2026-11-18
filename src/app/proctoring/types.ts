import { useRef } from "react";

export type ViolationSeverity = "low" | "medium" | "high";

/**
 * Browser signals shared between client agents. Agents write into it; the
 * vision agent ships it to the server with every frame. A ref (not state) so
 * the frame loop never restarts when a counter changes.
 */
export interface BrowserSignals {
  tabSwitches: number;
  devToolsOpen: boolean;
  /** Latched true on exit; cleared once a frame has delivered it. */
  fullscreenExited: boolean;
  fullscreenExits: number;
  /** Clipboard / right-click attempts not yet delivered to the server. */
  pendingClipboard: number;
  /** Window focus losses (not tab switches) not yet delivered to the server. */
  pendingBlurs: number;
}

export interface NetworkSnapshot {
  status: NetworkStatus;
  latency: number;
}

export type NetworkStatus = "Excellent" | "Good" | "Slow" | "Poor" | "Offline";

export type ClientAgentStatus = "idle" | "running" | "alert" | "degraded" | "unsupported";

/** UI-facing status of one client-side monitoring agent. */
export interface ClientAgentState {
  id: string;
  name: string;
  status: ClientAgentStatus;
  detail?: string;
}

export interface AgentHealth {
  faceDetector: string;
  objectDetector: string;
  identity: string;
  liveness: string;
  lastFrameAt: string | null;
}

export interface CameraQuality {
  qualityScore: number;
  usable: boolean;
  lightingState: string;
  brightness: number;
  blur: number;
  faceVisibility: number;
}

/** Keeps a ref pointing at the latest value so long-lived listeners never go stale. */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
