import { useCallback, useSyncExternalStore } from "react";

/**
 * Per-user preferences that have no backend yet. They are stored in this
 * browser's localStorage (one entry per user) and read by the exam camera,
 * the faculty exam form, notifications and the appearance layer.
 */

export type ThemeMode = "light" | "dark" | "system";
export type CameraResolution = "low" | "standard" | "high";
export type NotificationType = "announcement" | "assessment" | "report" | "system" | "message";

export interface ExamDefaults {
  webcam: boolean;
  mic: boolean;
  lockdown: boolean;
  face: boolean;
  gaze: boolean;
  tab: boolean;
  behavior: boolean;
  allowResume: boolean;
  maxResumeCount: string;
  resumeTimeWindow: string;
  resumeAfterDisconnect: boolean;
  resumeAfterCrash: boolean;
  resumeAfterLogout: boolean;
  lateSubmission: boolean;
  attemptLock: boolean;
}

export interface Preferences {
  appearance: {
    theme: ThemeMode;
    textScale: number;
    reduceMotion: boolean;
  };
  camera: {
    deviceId: string | null;
    resolution: CameraResolution;
    mirror: boolean;
  };
  notifications: {
    popups: boolean;
    sound: boolean;
    desktop: boolean;
    highPriorityOnly: boolean;
    types: Record<NotificationType, boolean>;
  };
  examDefaults: ExamDefaults;
}

export const DEFAULT_EXAM_DEFAULTS: ExamDefaults = {
  webcam: true,
  mic: false,
  lockdown: true,
  face: true,
  gaze: true,
  tab: true,
  behavior: false,
  allowResume: true,
  maxResumeCount: "3",
  resumeTimeWindow: "15",
  resumeAfterDisconnect: true,
  resumeAfterCrash: true,
  resumeAfterLogout: false,
  lateSubmission: false,
  attemptLock: false,
};

export const DEFAULT_PREFERENCES: Preferences = {
  appearance: { theme: "light", textScale: 100, reduceMotion: false },
  camera: { deviceId: null, resolution: "standard", mirror: true },
  notifications: {
    popups: true,
    sound: false,
    desktop: false,
    highPriorityOnly: false,
    types: { announcement: true, assessment: true, report: true, system: true, message: true },
  },
  examDefaults: DEFAULT_EXAM_DEFAULTS,
};

const CHANGE_EVENT = "integrity-preferences-changed";
const storageKey = (userId: string) => `integrityos.preferences.v1:${userId}`;

// Cache parsed values so useSyncExternalStore gets a stable snapshot.
const cache = new Map<string, { raw: string | null; value: Preferences }>();

function merge(stored: Partial<Preferences> | null): Preferences {
  const d = DEFAULT_PREFERENCES;
  if (!stored || typeof stored !== "object") return d;
  return {
    appearance: { ...d.appearance, ...stored.appearance },
    camera: { ...d.camera, ...stored.camera },
    notifications: {
      ...d.notifications,
      ...stored.notifications,
      types: { ...d.notifications.types, ...stored.notifications?.types },
    },
    examDefaults: { ...d.examDefaults, ...stored.examDefaults },
  };
}

function readRaw(userId: string): string | null {
  try {
    return localStorage.getItem(storageKey(userId));
  } catch {
    return null;
  }
}

export function readPreferences(userId: string | null | undefined): Preferences {
  if (!userId) return DEFAULT_PREFERENCES;
  const raw = readRaw(userId);
  const hit = cache.get(userId);
  if (hit && hit.raw === raw) return hit.value;
  let parsed: Partial<Preferences> | null = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  const value = merge(parsed);
  cache.set(userId, { raw, value });
  return value;
}

export function writePreferences(userId: string, next: Preferences) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch {
    // Storage blocked (private mode, quota): keep the in-memory value for this tab.
    cache.set(userId, { raw: readRaw(userId), value: next });
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { userId } }));
}

export function updatePreferences(userId: string, updater: (prev: Preferences) => Preferences) {
  writePreferences(userId, updater(readPreferences(userId)));
}

export function resetPreferences(userId: string, section?: keyof Preferences) {
  if (!section) {
    try {
      localStorage.removeItem(storageKey(userId));
    } catch {
      /* ignore */
    }
    cache.delete(userId);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { userId } }));
    return;
  }
  updatePreferences(userId, (p) => ({ ...p, [section]: DEFAULT_PREFERENCES[section] }));
}

function subscribe(callback: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (!e.key || e.key.startsWith("integrityos.preferences.")) callback();
  };
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}

/** React hook: current preferences for a user plus a typed section updater. */
export function usePreferences(userId: string | null | undefined) {
  const prefs = useSyncExternalStore(
    subscribe,
    () => readPreferences(userId),
    () => DEFAULT_PREFERENCES,
  );

  const update = useCallback(
    <K extends keyof Preferences>(section: K, patch: Partial<Preferences[K]>) => {
      if (!userId) return;
      updatePreferences(userId, (p) => ({ ...p, [section]: { ...p[section], ...patch } }));
    },
    [userId],
  );

  return { prefs, update };
}

/** getUserMedia video constraints honouring the user's camera preferences. */
export function cameraConstraints(userId: string | null | undefined): MediaTrackConstraints {
  const { camera } = readPreferences(userId);
  const size =
    camera.resolution === "low"
      ? { width: { ideal: 640 }, height: { ideal: 360 } }
      : camera.resolution === "high"
        ? { width: { ideal: 1920 }, height: { ideal: 1080 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 } };
  return camera.deviceId ? { ...size, deviceId: { ideal: camera.deviceId } } : size;
}

/**
 * Phone / virtual cameras Windows and browsers expose (Phone Link "Samsung …",
 * DroidCam, OBS…). Proctoring must use the laptop's own webcam, and these are
 * often disconnected, which leaves the scan stuck on a black frame.
 */
const AVOID_CAMERA_RE =
  /phone|link to windows|samsung|galaxy|iphone|android|pixel|oneplus|xiaomi|redmi|droidcam|iriun|epoccam|ivcam|camo|continuity|virtual|obs|snap camera|manycam|ndi|xsplit|nvidia broadcast|mmhmm/i;
const BUILT_IN_CAMERA_RE = /integrated|built-in|built in|internal|facetime|front|hd webcam|hd camera|usb2\.0 hd|webcam|camera \(/i;

export function isPhoneOrVirtualCamera(label: string): boolean {
  return AVOID_CAMERA_RE.test(label);
}

/** Best laptop camera among the listed devices (built-in first, phone/virtual last). */
export function pickLaptopCamera(devices: Pick<MediaDeviceInfo, "deviceId" | "label" | "kind">[]): string | null {
  const cams = devices.filter((d) => d.kind === "videoinput" && d.deviceId);
  if (!cams.length) return null;
  const score = (label: string) => (isPhoneOrVirtualCamera(label) ? -10 : 0) + (BUILT_IN_CAMERA_RE.test(label) ? 5 : 0);
  const best = [...cams].sort((a, b) => score(b.label) - score(a.label))[0]!;
  return best.deviceId;
}

const stopStream = (s: MediaStream) => s.getTracks().forEach((t) => t.stop());

/**
 * Ask for the camera using saved preferences. Without a saved choice, prefer the
 * laptop's built-in webcam over phone/virtual cameras (Windows Phone Link often
 * becomes the default and shows a black frame).
 */
export async function openPreferredCamera(userId: string | null | undefined): Promise<MediaStream> {
  const constraints = cameraConstraints(userId);
  const savedChoice = Boolean(readPreferences(userId).camera.deviceId);
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
  } catch (err) {
    const name = (err as DOMException)?.name;
    // Permission errors won't be fixed by relaxing constraints.
    if (name === "NotAllowedError" || name === "SecurityError") throw err;
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }
  if (savedChoice) return stream;

  // Device labels are only readable once permission is granted (it is now).
  try {
    const current = stream.getVideoTracks()[0]?.getSettings().deviceId;
    const currentLabel = stream.getVideoTracks()[0]?.label ?? "";
    const best = pickLaptopCamera(await navigator.mediaDevices.enumerateDevices());
    if (best && best !== current && isPhoneOrVirtualCamera(currentLabel)) {
      const { deviceId: _ignored, ...size } = constraints;
      const better = await navigator.mediaDevices.getUserMedia({ video: { ...size, deviceId: { exact: best } }, audio: false });
      stopStream(stream);
      return better;
    }
  } catch {
    /* keep the stream we have */
  }
  return stream;
}
