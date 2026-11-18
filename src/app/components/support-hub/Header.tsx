import React, { useEffect, useRef, useState } from "react";
import { Bell, ChevronDown, Settings as SettingsIcon, Wifi, WifiOff } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { Availability, StaffProfile, SupportNotification } from "./types";
import { AVAILABILITY_OPTIONS } from "./types";
import { AvailabilityDot, btnIcon, cx, focusRing, timeAgo } from "./ui";

export function HubHeader({
  user,
  me,
  connected,
  leading,
  onChangeAvailability,
  availabilityBusy,
  notifications,
  onOpenNotification,
  onMarkAllRead,
  onClearNotifications,
  onOpenSettings,
}: {
  user: any;
  me: StaffProfile | null;
  connected: boolean;
  /** Rendered before the title, e.g. the sidebar trigger. */
  leading?: React.ReactNode;
  onChangeAvailability: (a: Availability) => void;
  availabilityBusy: boolean;
  notifications: SupportNotification[];
  onOpenNotification: (n: SupportNotification) => void;
  onMarkAllRead: () => void;
  onClearNotifications: () => void;
  onOpenSettings: () => void;
}) {
  const name: string = me?.name || user?.name || "Support";
  const roleLabel =
    user?.role === "admin" ? "Administrator" : me?.supportRole === "supervisor" ? "Support Supervisor" : "Support Representative";

  return (
    <header className="h-16 border-b border-[#dedede] bg-white/80 backdrop-blur-md px-2 sm:px-4 lg:px-6 flex items-center justify-between gap-2 sticky top-0 z-30 shrink-0">
      <div className="flex items-center gap-1 sm:gap-2 min-w-0">
        {leading}
        <span className="text-[13.5px] font-bold text-[#1a1917] truncate">Support Hub Console</span>
        <span
          className={cx(
            "hidden md:inline-flex items-center gap-1 ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold border",
            connected ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-zinc-100 text-zinc-500 border-zinc-200"
          )}
          title={connected ? "Real-time updates connected" : "Real-time updates disconnected — reconnecting"}
        >
          {connected ? <Wifi className="size-3" aria-hidden /> : <WifiOff className="size-3" aria-hidden />}
          {connected ? "Live" : "Offline"}
        </span>
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        <label className="relative flex items-center" title="Your availability">
          <span className="sr-only">Your availability</span>
          <AvailabilityDot
            availability={me?.availability ?? "offline"}
            isOnline={connected}
            className="absolute left-3 pointer-events-none"
          />
          <select
            value={me?.availability === "unavailable" ? "offline" : me?.availability ?? ""}
            disabled={!me || availabilityBusy}
            onChange={(e) => onChangeAvailability(e.target.value as Availability)}
            className={cx(
              "appearance-none min-h-11 pl-7 pr-7 rounded-xl border border-[#dedede] bg-white text-xs font-bold text-[#1a1917] cursor-pointer disabled:opacity-50",
              focusRing
            )}
          >
            {!me && <option value="">Loading…</option>}
            {AVAILABILITY_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown className="size-3.5 absolute right-2.5 pointer-events-none text-[#8a8a8a]" aria-hidden />
        </label>

        <NotificationBell
          notifications={notifications}
          onOpen={onOpenNotification}
          onMarkAllRead={onMarkAllRead}
          onClear={onClearNotifications}
        />

        <button type="button" onClick={onOpenSettings} aria-label="Open settings" title="Settings" className={cx(btnIcon, "hidden sm:inline-flex")}>
          <SettingsIcon className="size-5" />
        </button>

        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("open-profile-drawer"))}
          className={cx("flex items-center gap-3 min-h-11 pl-1 pr-1 rounded-xl hover:bg-[#f6f6f6] transition cursor-pointer", focusRing)}
          aria-label={`Open profile for ${name}`}
        >
          <div className="text-right hidden md:block">
            <div className="text-[13px] font-bold leading-tight text-[#1a1917] max-w-[160px] truncate">{name}</div>
            <div className="text-[11px] font-semibold text-[#8a8a8a] leading-none mt-0.5">
              {roleLabel}
            </div>
          </div>
          <div className="relative">
            <div className="w-9 h-9 rounded-full bg-[#1a1917] border border-[#b2b2b2] text-white flex items-center justify-center font-bold text-sm">
              {name.charAt(0).toUpperCase()}
            </div>
            <AvailabilityDot availability={me?.availability ?? "offline"} isOnline={connected} className="absolute -bottom-0.5 -right-0.5" />
          </div>
        </button>
      </div>
    </header>
  );
}

function NotificationBell({
  notifications,
  onOpen,
  onMarkAllRead,
  onClear,
}: {
  notifications: SupportNotification[];
  onOpen: (n: SupportNotification) => void;
  onMarkAllRead: () => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
        aria-haspopup="true"
        className={cx(btnIcon, "relative")}
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 rounded-full bg-rose-600 text-white text-[9px] font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-[min(92vw,360px)] bg-white border border-[#dedede] rounded-2xl shadow-xl z-50 overflow-hidden"
            role="region"
            aria-label="Support notifications"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#dedede]/60">
              <span className="text-sm font-bold text-[#1a1917]">Notifications</span>
              <div className="flex gap-1">
                <button type="button" onClick={onMarkAllRead} className={cx("text-[11px] font-bold text-[#676767] hover:text-[#1a1917] px-2 min-h-9 rounded-lg", focusRing)}>
                  Mark all read
                </button>
                <button type="button" onClick={onClear} className={cx("text-[11px] font-bold text-[#676767] hover:text-[#1a1917] px-2 min-h-9 rounded-lg", focusRing)}>
                  Clear
                </button>
              </div>
            </div>
            <ul className="max-h-[60vh] overflow-y-auto divide-y divide-[#dedede]/50">
              {notifications.length === 0 ? (
                <li className="px-4 py-10 text-center text-xs text-[#8a8a8a]">
                  No notifications yet. New assignments and timeouts will appear here.
                </li>
              ) : (
                notifications.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onOpen(n);
                        setOpen(false);
                      }}
                      className={cx("w-full text-left px-4 py-3 hover:bg-[#f6f6f6] flex gap-3 cursor-pointer", focusRing, !n.read && "bg-[#fafafa]")}
                    >
                      <span className={cx("mt-1.5 size-2 rounded-full shrink-0", n.read ? "bg-transparent" : "bg-rose-500")} aria-hidden />
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#1a1917] truncate">{n.title}</span>
                          {n.priority && (
                            <span className="text-[9px] font-extrabold px-1 rounded bg-[#ececec] text-[#676767]">{String(n.priority)}</span>
                          )}
                        </span>
                        {n.description && <span className="block text-[11px] text-[#676767] mt-0.5 line-clamp-2">{n.description}</span>}
                        <span className="block text-[10px] text-[#a2a2a2] mt-1">{timeAgo(n.at)}</span>
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
