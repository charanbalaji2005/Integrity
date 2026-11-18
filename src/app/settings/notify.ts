import { toast } from "sonner";
import { readPreferences } from "./preferences";

let audioCtx: AudioContext | null = null;

/** Short two-tone chime generated with WebAudio (no audio asset needed). */
export function playNotificationSound() {
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audioCtx ??= new Ctor();
    const ctx = audioCtx;
    const now = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.12;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.3);
    });
  } catch {
    /* Audio unavailable: ignore. */
  }
}

interface IncomingNotification {
  title: string;
  description: string;
  type: string;
  priority: string;
}

/** Alert the user about newly arrived notifications according to their preferences. */
export function alertNewNotifications(userId: string, items: IncomingNotification[]) {
  const { notifications: n } = readPreferences(userId);
  const wanted = items.filter((item) => {
    const typeOn = n.types[item.type as keyof typeof n.types] ?? true;
    return typeOn && (!n.highPriorityOnly || item.priority === "high");
  });
  if (wanted.length === 0) return;

  if (n.popups) {
    if (wanted.length === 1) {
      toast(wanted[0].title, { description: wanted[0].description });
    } else {
      toast(`${wanted.length} new notifications`, { description: wanted[0].title });
    }
  }
  if (n.sound) playNotificationSound();
  if (n.desktop && typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
    const first = wanted[0];
    new Notification(wanted.length === 1 ? first.title : `${wanted.length} new notifications`, {
      body: wanted.length === 1 ? first.description : first.title,
      tag: "integrityos-notification",
    });
  }
}
