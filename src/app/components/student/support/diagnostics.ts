import { getRecentFailedRequests, type FailedRequest } from "../../../utils/diagnostics-buffer";

export type PermissionValue = "granted" | "denied" | "prompt" | "unknown";

export interface ClientDiagnostics {
  browser: string;
  browserVersion: string;
  os: string;
  deviceType: "desktop" | "tablet" | "phone";
  screen: string;
  viewport: string;
  language: string;
  timezone: string;
  online: boolean;
  connection: { effectiveType?: string; downlink?: number; rtt?: number } | null;
  cameraPermission: PermissionValue;
  microphonePermission: PermissionValue;
  webrtcSupported: boolean;
  socketConnected: boolean | null;
  appVersion: string;
  recentFailedRequests: FailedRequest[];
  collectedAt: string;
}

/** Human-readable list of exactly what is shared (shown in the disclosure). */
export const DIAGNOSTICS_DISCLOSURE: string[] = [
  "Browser name and version, operating system and device type",
  "Screen and browser window size",
  "Language and time zone",
  "Whether you're online and your connection type/speed (if your browser reports it)",
  "Whether camera and microphone permission is granted, denied or not yet asked",
  "Whether your browser supports WebRTC (used for live proctoring)",
  "Whether the live connection to IntegrityOS is active, and the app version",
  "The last few failed requests (page address and error code only)",
];

export const DIAGNOSTICS_NOT_SHARED =
  "Never shared: passwords, tokens, cookies, form contents, browsing history, or camera/microphone recordings.";

function parseBrowser(ua: string): { browser: string; browserVersion: string } {
  const tests: Array<[string, RegExp]> = [
    ["Edge", /Edg(?:e|A|iOS)?\/([\d.]+)/],
    ["Opera", /(?:OPR|Opera)\/([\d.]+)/],
    ["Samsung Internet", /SamsungBrowser\/([\d.]+)/],
    ["Firefox", /(?:Firefox|FxiOS)\/([\d.]+)/],
    ["Chrome", /(?:Chrome|CriOS)\/([\d.]+)/],
    ["Safari", /Version\/([\d.]+).*Safari/],
  ];
  for (const [name, re] of tests) {
    const m = ua.match(re);
    if (m) return { browser: name, browserVersion: m[1] };
  }
  return { browser: "Unknown", browserVersion: "" };
}

function parseOs(ua: string): string {
  if (/Windows NT 10/.test(ua)) return "Windows 10/11";
  if (/Windows NT/.test(ua)) return "Windows";
  if (/iPhone|iPad|iPod/.test(ua)) {
    const m = ua.match(/OS (\d+[_\d]*)/);
    return m ? `iOS ${m[1].replace(/_/g, ".")}` : "iOS";
  }
  if (/Android/.test(ua)) {
    const m = ua.match(/Android ([\d.]+)/);
    return m ? `Android ${m[1]}` : "Android";
  }
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Mac OS X/.test(ua)) {
    // iPadOS 13+ reports as Mac; detect touch.
    if (typeof navigator !== "undefined" && navigator.maxTouchPoints > 1) return "iPadOS";
    const m = ua.match(/Mac OS X (\d+[_.\d]*)/);
    return m ? `macOS ${m[1].replace(/_/g, ".")}` : "macOS";
  }
  if (/Linux/.test(ua)) return "Linux";
  return "Unknown";
}

function parseDevice(ua: string): "desktop" | "tablet" | "phone" {
  if (/iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) return "tablet";
  if (/Mac OS X/.test(ua) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1 && !/iPhone/.test(ua)) return "tablet";
  if (/Mobi|iPhone|iPod|Android/.test(ua)) return "phone";
  return "desktop";
}

async function queryPermission(name: string): Promise<PermissionValue> {
  try {
    if (!navigator.permissions?.query) return "unknown";
    const status = await navigator.permissions.query({ name: name as PermissionName });
    const s = status.state;
    return s === "granted" || s === "denied" || s === "prompt" ? s : "unknown";
  } catch {
    return "unknown";
  }
}

export async function collectDiagnostics(socketConnected: boolean | null): Promise<ClientDiagnostics> {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const { browser, browserVersion } = parseBrowser(ua);
  const conn = (navigator as any).connection;
  const [cameraPermission, microphonePermission] = await Promise.all([
    queryPermission("camera"),
    queryPermission("microphone"),
  ]);
  let timezone = "";
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    timezone = "";
  }
  return {
    browser,
    browserVersion,
    os: parseOs(ua),
    deviceType: parseDevice(ua),
    screen: `${window.screen?.width ?? 0}x${window.screen?.height ?? 0}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    language: navigator.language || "",
    timezone,
    online: navigator.onLine,
    connection: conn
      ? {
          ...(typeof conn.effectiveType === "string" ? { effectiveType: conn.effectiveType } : {}),
          ...(typeof conn.downlink === "number" ? { downlink: conn.downlink } : {}),
          ...(typeof conn.rtt === "number" ? { rtt: conn.rtt } : {}),
        }
      : null,
    cameraPermission,
    microphonePermission,
    webrtcSupported: typeof RTCPeerConnection !== "undefined",
    socketConnected,
    appVersion: import.meta.env.VITE_APP_VERSION || "web",
    recentFailedRequests: getRecentFailedRequests(),
    collectedAt: new Date().toISOString(),
  };
}
