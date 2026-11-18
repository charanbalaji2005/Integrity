import React, { useState } from "react";
import { Download, ExternalLink, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useProfile } from "../../context/ProfileContext";
import { resetPreferences } from "../preferences";
import { Button, Card, Row, SectionHeader } from "../ui";
import type { SettingsRole } from "../roles";

const SUPPORT_EMAIL = "support@assessmentintegrity.ai";

const COLLECTED: Record<SettingsRole, { title: string; body: string }[]> = {
  candidate: [
    { title: "Face images", body: "Your onboarding photo and periodic webcam frames during proctored exams, used to confirm it's you taking the exam." },
    { title: "Exam activity", body: "Tab switches, fullscreen exits, gaze and object detections, recorded as evidence for faculty review." },
    { title: "Account details", body: "Name, email, roll number and institution, shared with your faculty." },
  ],
  faculty: [
    { title: "Account details", body: "Name, email, department and subjects, visible to administrators and your students." },
    { title: "Review actions", body: "Warnings, pauses and decisions you make on candidate sessions are logged for accountability." },
  ],
  support: [
    { title: "Account details", body: "Name and email, visible to users you assist." },
    { title: "Support actions", body: "Ticket replies and account actions are logged in the audit trail." },
  ],
  admin: [
    { title: "Account details", body: "Name and email, visible in audit logs." },
    { title: "Administrative actions", body: "Every configuration change and user action is recorded in the audit trail." },
  ],
};

export function PrivacySection({ role, onLogout }: { userId: string; role: SettingsRole; onLogout: () => void }) {
  const { profile, activityHistory, activeSessions, fetchActivityHistory, fetchActiveSessions } = useProfile();
  const [exporting, setExporting] = useState(false);

  const downloadData = async () => {
    if (!profile) return;
    setExporting(true);
    try {
      await Promise.all([fetchActivityHistory(), fetchActiveSessions()]);
      const data = {
        exportedAt: new Date().toISOString(),
        profile,
        activityHistory,
        // Session tokens are credentials; never include them in an export.
        activeSessions: activeSessions.map(({ token: _token, ...s }) => s),
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `integrityos-my-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Your data export has been downloaded.");
    } catch {
      toast.error("Couldn't prepare your data export.");
    } finally {
      setExporting(false);
    }
  };

  const clearDeviceData = () => {
    if (!profile) return;
    if (!window.confirm("Reset all settings saved on this device (appearance, camera, notifications, exam defaults)?")) return;
    resetPreferences(profile.id);
    toast.success("Settings on this device were reset.");
  };

  const requestDeletion = () => {
    const subject = encodeURIComponent("Account and data deletion request");
    const body = encodeURIComponent(
      `Please delete my IntegrityOS account and associated personal data.\n\nAccount email: ${profile?.email ?? ""}\n`,
    );
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
  };

  return (
    <div>
      <SectionHeader title="Privacy & data" description="What IntegrityOS stores about you, and how to get a copy or ask for it to be removed." />

      <Card title="What we collect">
        <ul className="space-y-3">
          {COLLECTED[role].map((item) => (
            <li key={item.title}>
              <p className="text-[13px] font-semibold text-[#1a1917]">{item.title}</p>
              <p className="text-[12px] leading-relaxed text-[#6b6b6b]">{item.body}</p>
            </li>
          ))}
        </ul>
        {role === "candidate" && (
          <p className="mt-4 rounded-xl bg-[#f6f6f6] px-3 py-2.5 text-[12px] leading-relaxed text-[#555]">
            Biometric data is used only to verify your identity for exams. Proctoring results are decision support:
            final decisions on any flagged session are made by faculty, never by the system alone.
          </p>
        )}
        {(role === "faculty" || role === "admin") && (
          <p className="mt-4 rounded-xl bg-[#f6f6f6] px-3 py-2.5 text-[12px] leading-relaxed text-[#555]">
            Evidence captured during exams (frames, detections, timelines) is kept with the attempt so decisions can be
            reviewed and appealed. Ask an administrator about your institution's retention period.
          </p>
        )}
      </Card>

      <Card title="Your data">
        <Row label="Download my data" description="Your profile, login history and active sessions as a JSON file.">
          <Button variant="secondary" onClick={downloadData} disabled={!profile || exporting}>
            {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            Download
          </Button>
        </Row>
        <Row label="Reset settings on this device" description="Clears appearance, camera, notification and exam default preferences saved in this browser.">
          <Button variant="secondary" onClick={clearDeviceData} disabled={!profile}>
            Reset
          </Button>
        </Row>
        <Row label="Request account deletion" description="Opens an email to support. Exam records your institution must keep may be retained.">
          <Button variant="danger" onClick={requestDeletion}>
            <Trash2 className="size-3.5" /> Request deletion
          </Button>
        </Row>
      </Card>

      <Card title="Policies">
        <div className="flex flex-wrap gap-2">
          <a
            href="/login?view=privacy"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-[#dedede] px-3 text-[12.5px] font-bold text-[#1a1917] hover:bg-[#f6f6f6]"
          >
            Privacy policy <ExternalLink className="size-3.5" />
          </a>
          <a
            href="/login?view=terms"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-[#dedede] px-3 text-[12.5px] font-bold text-[#1a1917] hover:bg-[#f6f6f6]"
          >
            Terms of service <ExternalLink className="size-3.5" />
          </a>
          <Button variant="secondary" onClick={onLogout}>
            Sign out
          </Button>
        </div>
      </Card>
    </div>
  );
}
