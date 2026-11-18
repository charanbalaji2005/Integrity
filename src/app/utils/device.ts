/**
 * Device classification for exam eligibility.
 *
 * Assessments may only be taken on a laptop or desktop computer: proctoring
 * needs a stable front camera, a physical keyboard, a full browser window and
 * reliable tab/fullscreen detection, none of which phones or tablets provide
 * consistently. Everything else in the app works on mobile.
 *
 * Mirrors backend/src/utils/device.ts (server-side enforcement).
 */

export type DeviceKind = "phone" | "tablet" | "desktop";

const PHONE_UA = /iPhone|iPod|Android.*Mobile|Windows Phone|IEMobile|BlackBerry|Opera Mini|Mobile Safari(?!.*Macintosh)/i;
const TABLET_UA = /iPad|Tablet|PlayBook|Silk|Kindle|Android(?!.*Mobile)/i;

export function getDeviceKind(): DeviceKind {
  if (typeof navigator === "undefined" || typeof window === "undefined") return "desktop";
  const ua = navigator.userAgent || "";

  // Client hint (Chromium): authoritative "mobile" flag when present.
  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (uaData?.mobile) return "phone";

  if (PHONE_UA.test(ua)) return "phone";
  if (TABLET_UA.test(ua)) return "tablet";

  // iPadOS 13+ reports itself as a Mac; a Mac with multi-touch is an iPad.
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return "tablet";

  // Touch-only devices with no fine pointer (no mouse/trackpad) are tablets/phones,
  // even if the UA was switched to "desktop mode". Touchscreen laptops still
  // report a fine pointer and stay eligible.
  const mq = (q: string) => window.matchMedia?.(q).matches ?? false;
  const touchOnly = mq("(any-pointer: coarse)") && !mq("(any-pointer: fine)");
  if (touchOnly) {
    const shortSide = Math.min(window.screen.width, window.screen.height);
    return shortSide < 600 ? "phone" : "tablet";
  }

  return "desktop";
}

export function canTakeExamOnThisDevice(): boolean {
  return getDeviceKind() === "desktop";
}

export const EXAM_DEVICE_MESSAGE =
  "Assessments can only be taken on a laptop or desktop computer with a webcam. You can still use everything else here, including results, messages and support, on your phone or tablet.";
