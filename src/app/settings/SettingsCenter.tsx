import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { type SettingsSectionId, sectionsForRole, toSettingsRole } from "./roles";
import { AccountSection } from "./sections/AccountSection";
import { SecuritySection } from "./sections/SecuritySection";
import { AppearanceSection } from "./sections/AppearanceSection";
import { CameraSection } from "./sections/CameraSection";
import { ExamRulesSection } from "./sections/ExamRulesSection";
import { NotificationsSection } from "./sections/NotificationsSection";
import { PrivacySection } from "./sections/PrivacySection";
import { SystemSection } from "./sections/SystemSection";
import { AdminSection } from "./sections/AdminSection";

export const OPEN_SETTINGS_EVENT = "open-settings";

/** Open the Settings page from anywhere, optionally at a given section. */
export function openSettings(section?: SettingsSectionId) {
  window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT, { detail: { section } }));
}

const ROLE_LABEL = { candidate: "Candidate", faculty: "Faculty", support: "Support", admin: "Administrator" } as const;

interface SettingsCenterProps {
  user: { id: string; role?: string | null; name?: string | null; email?: string | null };
  handleLogout: () => void;
}

export function SettingsCenter({ user, handleLogout }: SettingsCenterProps) {
  const role = toSettingsRole(user.role);
  const sections = useMemo(() => sectionsForRole(role), [role]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<SettingsSectionId>("account");
  const contentRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const requested = (e as CustomEvent<{ section?: SettingsSectionId }>).detail?.section;
      if (requested && sections.some((s) => s.id === requested)) setActive(requested);
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      setOpen(true);
    };
    window.addEventListener(OPEN_SETTINGS_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, onOpen);
  }, [sections]);

  // Escape closes; lock background scroll while open; restore focus on close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      returnFocusRef.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [active]);

  const close = () => setOpen(false);
  const logout = () => {
    setOpen(false);
    handleLogout();
  };

  const renderSection = () => {
    const role_ = user.role || "user";
    switch (active) {
      case "account":
        return <AccountSection role={role} onLogout={logout} />;
      case "security":
        return <SecuritySection />;
      case "appearance":
        return <AppearanceSection userId={user.id} />;
      case "camera":
        return <CameraSection userId={user.id} userRole={role_} />;
      case "exam-rules":
        return <ExamRulesSection userId={user.id} />;
      case "notifications":
        return <NotificationsSection userId={user.id} role={role} />;
      case "privacy":
        return <PrivacySection userId={user.id} role={role} onLogout={logout} />;
      case "system":
        return <SystemSection userId={user.id} userRole={role_} />;
      case "admin":
        return <AdminSection userId={user.id} userRole={role_} onClose={close} />;
      default:
        return null;
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="settings"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[60] flex flex-col bg-[#f7f7f5] text-[#1a1917] font-sans"
        >
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#dedede] bg-white px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <h1 id="settings-title" className="text-[15px] font-extrabold tracking-tight">
                Settings
              </h1>
              <span className="hidden truncate text-[12px] text-[#8a8a8a] sm:inline">
                {user.name || user.email} · {ROLE_LABEL[role]}
              </span>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={close}
              aria-label="Close settings"
              className="flex size-9 items-center justify-center rounded-xl text-[#555] hover:bg-[#f1f1f1] hover:text-[#1a1917] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b2b2b2] cursor-pointer"
            >
              <X className="size-5" />
            </button>
          </header>

          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <nav
              aria-label="Settings sections"
              className="shrink-0 border-b border-[#dedede] bg-white md:w-60 md:border-b-0 md:border-r md:py-4"
            >
              <ul className="flex gap-1 overflow-x-auto px-3 py-2 [scrollbar-width:none] md:flex-col md:overflow-visible md:px-3 md:py-0">
                {sections.map((s) => {
                  const Icon = s.icon;
                  const selected = s.id === active;
                  return (
                    <li key={s.id} className="shrink-0">
                      <button
                        type="button"
                        onClick={() => setActive(s.id)}
                        aria-current={selected ? "page" : undefined}
                        className={`flex w-full items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-[12.5px] font-bold transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b2b2b2] ${
                          selected ? "bg-[#1a1917] text-white" : "text-[#555] hover:bg-[#f1f1f1] hover:text-[#1a1917]"
                        }`}
                      >
                        <Icon className="size-4 shrink-0" aria-hidden="true" />
                        {s.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">{renderSection()}</div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
