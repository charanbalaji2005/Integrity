import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { type NotificationType, usePreferences } from "../preferences";
import { playNotificationSound } from "../notify";
import { Button, Card, SavedLocallyNote, SectionHeader, StatusPill, ToggleRow } from "../ui";
import type { SettingsRole } from "../roles";

const TYPE_LABELS: Record<NotificationType, { label: string; description: string; roles?: SettingsRole[] }> = {
  assessment: { label: "Assessments", description: "New exams, schedule changes and results." },
  announcement: { label: "Announcements", description: "Messages from faculty and your institution." },
  message: { label: "Direct messages", description: "Replies from faculty, students or support." },
  report: {
    label: "Integrity reports & suspicious activity",
    description: "Flagged sessions and completed integrity reports.",
    roles: ["faculty", "admin", "support"],
  },
  system: { label: "System alerts", description: "Maintenance, outages and security notices." },
};

type Permission = NotificationPermission | "unsupported";

export function NotificationsSection({ userId, role }: { userId: string; role: SettingsRole }) {
  const { prefs, update } = usePreferences(userId);
  const n = prefs.notifications;
  const [permission, setPermission] = useState<Permission>(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );

  useEffect(() => {
    // Keep the toggle honest if permission was revoked in browser settings.
    if (n.desktop && permission !== "granted") update("notifications", { desktop: false });
  }, [n.desktop, permission, update]);

  const onDesktopToggle = async (value: boolean) => {
    if (!value) {
      update("notifications", { desktop: false });
      return;
    }
    if (permission === "unsupported") return;
    const result = permission === "granted" ? "granted" : await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") update("notifications", { desktop: true });
    else toast.error("Desktop notifications are blocked in your browser settings.");
  };

  const sendTest = () => {
    if (n.popups) toast("Test notification", { description: "This is how new notifications will appear." });
    if (n.sound) playNotificationSound();
    if (n.desktop && permission === "granted") {
      new Notification("IntegrityOS", { body: "This is a test notification." });
    }
    if (!n.popups && !n.sound && !n.desktop) toast.info("All alert styles are off, so new notifications only appear in the bell menu.");
  };

  const visibleTypes = (Object.keys(TYPE_LABELS) as NotificationType[]).filter((t) => {
    const roles = TYPE_LABELS[t].roles;
    return !roles || roles.includes(role);
  });

  return (
    <div>
      <SectionHeader
        title="Notifications"
        description="Choose how you're alerted when something new arrives. Everything is always kept in the bell menu."
      />

      <Card title="Alert style" action={<Button variant="secondary" onClick={sendTest}>Send test</Button>}>
        <ToggleRow
          label="In-app pop-ups"
          description="Show a short pop-up when a new notification arrives."
          checked={n.popups}
          onChange={(popups) => update("notifications", { popups })}
        />
        <ToggleRow
          label="Sound"
          description="Play a soft chime with new notifications."
          checked={n.sound}
          onChange={(sound) => update("notifications", { sound })}
        />
        <ToggleRow
          label="Desktop notifications"
          description={
            permission === "unsupported"
              ? "Not supported in this browser."
              : permission === "denied"
                ? "Blocked in browser settings. Allow notifications for this site to enable."
                : "Alerts even when IntegrityOS is in a background tab."
          }
          checked={n.desktop}
          onChange={onDesktopToggle}
          disabled={permission === "unsupported" || permission === "denied"}
        />
        <ToggleRow
          label="High priority only"
          description="Only alert for notifications marked high priority."
          checked={n.highPriorityOnly}
          onChange={(highPriorityOnly) => update("notifications", { highPriorityOnly })}
        />
        {permission === "denied" && (
          <div className="mt-2">
            <StatusPill tone="warn">Desktop notifications blocked by the browser</StatusPill>
          </div>
        )}
      </Card>

      <Card title="Alert me about" description="Notifications you switch off here still appear in the bell menu.">
        {visibleTypes.map((t) => (
          <ToggleRow
            key={t}
            label={TYPE_LABELS[t].label}
            description={TYPE_LABELS[t].description}
            checked={n.types[t]}
            onChange={(v) => update("notifications", { types: { ...n.types, [t]: v } })}
          />
        ))}
        <SavedLocallyNote />
      </Card>
    </div>
  );
}
