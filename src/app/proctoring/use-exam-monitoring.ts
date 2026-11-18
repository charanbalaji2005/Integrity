import { useMemo, useRef } from "react";
import { useAudioAgent } from "./agents/audio-agent";
import { useClipboardAgent } from "./agents/clipboard-agent";
import { useDeviceAgent } from "./agents/device-agent";
import { useFocusAgent } from "./agents/focus-agent";
import { useFullscreenAgent } from "./agents/fullscreen-agent";
import { useKeyboardGuardAgent } from "./agents/keyboard-guard-agent";
import { useNetworkAgent } from "./agents/network-agent";
import { type ProctorChannelHandlers, useProctorChannelAgent } from "./agents/proctor-channel-agent";
import { useRecordingAgent } from "./agents/recording-agent";
import { type VisionAgentHandlers, useVisionAgent } from "./agents/vision-agent";
import type { BrowserSignals, ClientAgentState } from "./types";

export interface ExamMonitoringOptions {
  /** Exam UI is live (started and not yet finished). */
  examActive: boolean;
  /** Exam UI was entered at least once (keeps the faculty channel open through submit). */
  examStarted: boolean;
  attemptId: string | null;
  userId: string;
  cameraStream: MediaStream | null;
  browserLockdown: boolean;
  microphoneAnalysis: boolean;
  /**
   * Per-exam browser rules from the assessment's integrity configuration.
   * Omitted for assessments created before granular rules existed, which keep
   * every browser check on exactly as before.
   */
  browserRules?: {
    tabSwitch: boolean;
    windowFocus: boolean;
    fullscreenExit: boolean;
    copyPaste: boolean;
    contextMenu: boolean;
    micDisconnect: boolean;
  };
  captureFrame: () => string | null;
  /** Live feed for the faculty video wall (smaller, cheaper than AI frames). */
  captureLiveFrame?: (focused: boolean) => string | null;
  handlers: VisionAgentHandlers &
    ProctorChannelHandlers & {
      /** Local (optimistic) penalty from client-only agents; the server score wins on the next frame. */
      onPenalty?: (scorePenalty: number) => void;
      onReconnect?: () => Promise<boolean | void> | boolean | void;
    };
}

/**
 * Coordinator for the client-side monitoring agents. Each agent owns one
 * concern and runs independently; they share only the browser-signal ref,
 * which the vision agent forwards to the server multi-agent pipeline:
 *
 *   fullscreen ─┐
 *   focus ──────┤
 *   clipboard ──┼─► BrowserSignals ─► vision ─► /process-frame (server agents)
 *   keyboard ───┘
 *   network ───► NetworkSnapshot ──┘
 *   audio, device ─► direct violation log
 *   recording ─► continuous 30 s segments ─► /proctoring/recordings
 *   channel ◄── faculty interventions (socket)
 */
export function useExamMonitoring(opts: ExamMonitoringOptions) {
  const { examActive, examStarted, attemptId, userId, cameraStream, handlers } = opts;
  const streamActive = Boolean(cameraStream);

  const signalsRef = useRef<BrowserSignals>({
    tabSwitches: 0,
    devToolsOpen: false,
    fullscreenExited: false,
    fullscreenExits: 0,
    pendingClipboard: 0,
    pendingBlurs: 0,
  });

  const rules = opts.browserRules;
  const fullscreen = useFullscreenAgent({
    active: examActive && (rules ? rules.fullscreenExit : true),
    attemptId,
    userId,
    signalsRef,
    streamActive,
  });
  const focus = useFocusAgent({
    active: examActive,
    attemptId,
    userId,
    signalsRef,
    streamActive,
    watchTabSwitch: rules ? rules.tabSwitch : true,
    watchWindowFocus: rules ? rules.windowFocus : true,
  });
  const clipboard = useClipboardAgent({
    active: examActive,
    attemptId,
    userId,
    signalsRef,
    streamActive,
    blockClipboard: rules ? rules.copyPaste : true,
    blockContextMenu: rules ? rules.contextMenu : true,
  });
  const device = useDeviceAgent({
    active: examActive,
    attemptId,
    userId,
    stream: cameraStream,
    watchMicrophone: opts.microphoneAnalysis && (rules ? rules.micDisconnect : true),
  });
  const recording = useRecordingAgent({
    active: examActive,
    attemptId,
    stream: cameraStream,
    includeAudio: opts.microphoneAnalysis,
  });
  const keyboard = useKeyboardGuardAgent({ active: examActive && opts.browserLockdown, attemptId, userId });
  const network = useNetworkAgent({
    active: examStarted,
    attemptId,
    userId,
    onPenalty: handlers.onPenalty,
    onReconnect: handlers.onReconnect,
  });
  const audio = useAudioAgent({
    active: examActive && streamActive && opts.microphoneAnalysis,
    attemptId,
    userId,
    onPenalty: handlers.onPenalty,
  });
  const vision = useVisionAgent({
    active: examActive && streamActive,
    attemptId,
    captureFrame: opts.captureFrame,
    signalsRef,
    networkRef: network.snapshotRef,
    handlers,
  });
  const channel = useProctorChannelAgent({
    active: examStarted,
    attemptId,
    handlers,
    captureLiveFrame: opts.captureLiveFrame,
  });

  const clientAgents = useMemo<ClientAgentState[]>(() => {
    const idle = !examActive;
    const mins = Math.floor(recording.recordedMs / 60000);
    return [
      {
        id: "recording",
        name: "Session recording",
        status: idle
          ? "idle"
          : recording.status === "recording"
          ? recording.pending > 3 || recording.failed > 0
            ? "alert"
            : "running"
          : recording.status === "starting"
          ? "idle"
          : "degraded",
        detail:
          recording.status === "unsupported"
            ? "Not supported"
            : `${mins} min · ${recording.uploaded} saved${recording.pending ? ` · ${recording.pending} queued` : ""}`,
      },
      {
        id: "camera",
        name: "Camera device",
        status: idle ? "idle" : device.cameraLost ? "degraded" : device.cameraInterrupted ? "alert" : "running",
        detail: device.cameraLost ? "Disconnected" : device.cameraInterrupted ? "Interrupted" : "Connected",
      },
      {
        id: "vision",
        name: "Vision stream",
        status: idle ? "idle" : !streamActive ? "degraded" : vision.linkOk ? "running" : "degraded",
        detail: vision.linkOk ? `${vision.framesSent} frames` : "Server unreachable",
      },
      {
        id: "fullscreen",
        name: "Full-screen lock",
        status: idle
          ? "idle"
          : !fullscreen.supported
          ? "unsupported"
          : fullscreen.needsReentry
          ? "alert"
          : "running",
        detail: fullscreen.supported ? `${fullscreen.exitCount} exits` : "Not supported on this device",
      },
      {
        id: "focus",
        name: "Tab focus",
        status: idle ? "idle" : focus.tabSwitches > 0 ? "alert" : "running",
        detail: `${focus.tabSwitches} switches · ${focus.windowBlurs} blurs`,
      },
      {
        id: "clipboard",
        name: "Clipboard guard",
        status: idle ? "idle" : clipboard.attempts > 0 ? "alert" : "running",
        detail: `${clipboard.attempts} blocked`,
      },
      {
        id: "keyboard",
        name: "Keyboard guard",
        status: idle || !opts.browserLockdown ? "idle" : keyboard.blockedAttempts > 0 ? "alert" : "running",
        detail: opts.browserLockdown ? `${keyboard.blockedAttempts} blocked` : "Lockdown off",
      },
      {
        id: "network",
        name: "Network",
        status: idle
          ? "idle"
          : network.status === "Offline"
          ? "degraded"
          : network.status === "Slow" || network.status === "Poor"
          ? "alert"
          : "running",
        detail: `${network.latency} ms`,
      },
      {
        id: "audio",
        name: "Audio",
        status:
          idle || !opts.microphoneAnalysis
            ? "idle"
            : audio.micState === "denied"
            ? "degraded"
            : audio.noise !== "Quiet"
            ? "alert"
            : audio.micState === "running"
            ? "running"
            : "idle",
        detail: opts.microphoneAnalysis ? audio.noise : "Disabled",
      },
      {
        id: "channel",
        name: "Proctor link",
        status: idle ? "idle" : channel.connected ? "running" : "degraded",
        detail: channel.connected ? (channel.beingWatched ? "Faculty watching live" : "Connected") : "Reconnecting",
      },
    ];
  }, [
    examActive,
    streamActive,
    vision.linkOk,
    vision.framesSent,
    fullscreen.supported,
    fullscreen.needsReentry,
    fullscreen.exitCount,
    focus.tabSwitches,
    focus.windowBlurs,
    clipboard.attempts,
    device.cameraLost,
    device.cameraInterrupted,
    recording.status,
    recording.recordedMs,
    recording.uploaded,
    recording.pending,
    recording.failed,
    keyboard.blockedAttempts,
    opts.browserLockdown,
    opts.microphoneAnalysis,
    network.status,
    network.latency,
    audio.micState,
    audio.noise,
    channel.connected,
  ]);

  return { fullscreen, focus, clipboard, device, recording, keyboard, network, audio, vision, channel, clientAgents };
}

export { enterExamFullscreen, exitExamFullscreen } from "./agents/fullscreen-agent";
export type { ClientAgentState } from "./types";
