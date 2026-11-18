import { useEffect, useState } from "react";
import { usePreferences } from "./preferences";

const STYLE_ID = "integrityos-appearance-style";

// Dark mode inverts the (light) UI and flips hues back, then re-inverts media
// so photos, webcam feeds and logos keep their real colours.
const APPEARANCE_CSS = `
html.ios-theme-dark { filter: invert(1) hue-rotate(180deg); background: #ffffff; }
html.ios-theme-dark img,
html.ios-theme-dark video,
html.ios-theme-dark canvas,
html.ios-theme-dark picture,
html.ios-theme-dark [data-keep-colors] { filter: invert(1) hue-rotate(180deg); }
html.ios-reduce-motion *,
html.ios-reduce-motion *::before,
html.ios-reduce-motion *::after {
  animation-duration: 0.001ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0.001ms !important;
  scroll-behavior: auto !important;
}
`;

function useSystemPrefersDark() {
  const query = "(prefers-color-scheme: dark)";
  const [dark, setDark] = useState(() => typeof window !== "undefined" && window.matchMedia?.(query).matches);
  useEffect(() => {
    const mql = window.matchMedia?.(query);
    if (!mql) return;
    const onChange = () => setDark(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return dark;
}

/**
 * Applies the signed-in user's appearance preferences to the document while a
 * portal is mounted, and removes them again on unmount (e.g. on logout), so
 * public pages such as the landing page are never affected.
 * Returns whether reduced motion is on, for MotionConfig.
 */
export function useApplyAppearance(userId: string | null | undefined): boolean {
  const { prefs } = usePreferences(userId);
  const systemDark = useSystemPrefersDark();
  const { theme, textScale, reduceMotion } = prefs.appearance;
  const dark = theme === "dark" || (theme === "system" && systemDark);

  useEffect(() => {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = APPEARANCE_CSS;
      document.head.appendChild(style);
    }
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    html.classList.toggle("ios-theme-dark", dark);
    html.classList.toggle("ios-reduce-motion", reduceMotion);
    const zoom = textScale === 100 ? "" : String(textScale / 100);
    html.style.setProperty("zoom", zoom);
    return () => {
      html.classList.remove("ios-theme-dark", "ios-reduce-motion");
      html.style.removeProperty("zoom");
    };
  }, [dark, reduceMotion, textScale]);

  return reduceMotion;
}
