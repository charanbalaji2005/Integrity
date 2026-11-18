import React, { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, Row, SectionHeader, StatusPill, TextField, ToggleRow } from "../ui";

interface PlatformSettings {
  maintenanceMode: boolean;
  emergencyShutdown: boolean;
  studentPortalEnabled: boolean;
  facultyPortalEnabled: boolean;
  adminPortalEnabled: boolean;
  securityAgentEnabled: boolean;
  aiModelsConfig: { evaluationModel: string; supportModel: string; ocrModel: string };
  thresholds: { integrityWarningLimit: number; similarityThreshold: number; riskEscalationLimit: number };
}

interface Infrastructure {
  memoryUsage: number;
  memoryTotal: number;
  dbConnections: number;
  queryTime: number;
  backupStatus: string;
}

interface PublicHealth {
  status?: string;
  uptime?: number;
}

const formatUptime = (s?: number) => {
  if (s === undefined) return "-";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export function SystemSection({ userId, userRole }: { userId: string; userRole: string }) {
  const headers = { "x-user-id": userId, "x-user-role": userRole || "admin" };
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [infra, setInfra] = useState<Infrastructure | null>(null);
  const [health, setHealth] = useState<PublicHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [thresholds, setThresholds] = useState({ integrityWarningLimit: "", similarityThreshold: "", riskEscalationLimit: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [s, h, p] = await Promise.all([
        fetch("/api/admin/settings", { headers }),
        fetch("/api/admin/health", { headers }),
        fetch("/api/health"),
      ]);
      if (!s.ok) throw new Error("settings");
      const sd: PlatformSettings = (await s.json()).data;
      setSettings(sd);
      setThresholds({
        integrityWarningLimit: String(sd.thresholds.integrityWarningLimit),
        similarityThreshold: String(sd.thresholds.similarityThreshold),
        riskEscalationLimit: String(sd.thresholds.riskEscalationLimit),
      });
      if (h.ok) setInfra((await h.json()).data?.infrastructure ?? null);
      if (p.ok) {
        const pd = await p.json();
        setHealth(pd.data ?? pd);
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, userRole]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (patch: Partial<PlatformSettings>, successMessage = "Platform settings saved.") => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()).data as PlatformSettings | undefined;
      setSettings((prev) => (data ? data : prev ? { ...prev, ...patch } : prev));
      toast.success(successMessage);
    } catch {
      toast.error("Couldn't save platform settings.");
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: keyof PlatformSettings, label: string, value: boolean, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    save({ [key]: value } as Partial<PlatformSettings>, `${label} ${value ? "enabled" : "disabled"}.`);
  };

  const thresholdErrors = {
    integrityWarningLimit: !/^\d+$/.test(thresholds.integrityWarningLimit) || Number(thresholds.integrityWarningLimit) < 1,
    similarityThreshold:
      thresholds.similarityThreshold === "" ||
      Number.isNaN(Number(thresholds.similarityThreshold)) ||
      Number(thresholds.similarityThreshold) < 0 ||
      Number(thresholds.similarityThreshold) > 100,
    riskEscalationLimit:
      thresholds.riskEscalationLimit === "" ||
      Number.isNaN(Number(thresholds.riskEscalationLimit)) ||
      Number(thresholds.riskEscalationLimit) < 0 ||
      Number(thresholds.riskEscalationLimit) > 100,
  };
  const thresholdsDirty =
    !!settings &&
    (Number(thresholds.integrityWarningLimit) !== settings.thresholds.integrityWarningLimit ||
      Number(thresholds.similarityThreshold) !== settings.thresholds.similarityThreshold ||
      Number(thresholds.riskEscalationLimit) !== settings.thresholds.riskEscalationLimit);
  const thresholdsValid = !Object.values(thresholdErrors).some(Boolean);

  const saveThresholds = () =>
    save(
      {
        thresholds: {
          integrityWarningLimit: Number(thresholds.integrityWarningLimit),
          similarityThreshold: Number(thresholds.similarityThreshold),
          riskEscalationLimit: Number(thresholds.riskEscalationLimit),
        },
      },
      "Detection thresholds saved.",
    );

  if (loading && !settings) {
    return (
      <div>
        <SectionHeader title="System" />
        <p className="flex items-center gap-2 text-[13px] text-[#8a8a8a]">
          <Loader2 className="size-4 animate-spin" /> Loading system status...
        </p>
      </div>
    );
  }

  if (loadError || !settings) {
    return (
      <div>
        <SectionHeader title="System" />
        <Card>
          <p className="text-[13px] text-[#555]">Couldn't load platform settings. Check that the API server is running.</p>
          <div className="mt-3">
            <Button variant="secondary" onClick={load}>
              <RefreshCw className="size-3.5" /> Try again
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const dbHealthy = health?.status ? health.status === "healthy" : !!infra;

  return (
    <div>
      <SectionHeader title="System" description="Platform health, portal availability, detection thresholds and AI integrations." />

      <Card
        title="Status"
        action={
          <Button variant="secondary" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Refresh
          </Button>
        }
      >
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { k: "API server", v: <StatusPill tone="ok">Online · {formatUptime(health?.uptime)}</StatusPill> },
            { k: "Database", v: <StatusPill tone={dbHealthy ? "ok" : "bad"}>{dbHealthy ? `Healthy · ${infra?.queryTime ?? "-"} ms` : "Degraded"}</StatusPill> },
            { k: "Active sessions", v: <span className="text-[15px] font-bold tabular-nums">{infra?.dbConnections ?? "-"}</span> },
            {
              k: "Server memory",
              v: <span className="text-[15px] font-bold tabular-nums">{infra ? `${infra.memoryUsage} / ${infra.memoryTotal} GB` : "-"}</span>,
            },
          ].map((item) => (
            <div key={item.k} className="rounded-xl border border-[#efefef] bg-[#fafafa] p-3">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-[#8a8a8a]">{item.k}</dt>
              <dd className="mt-1.5">{item.v}</dd>
            </div>
          ))}
        </dl>
        {infra?.backupStatus && <p className="mt-3 text-[11.5px] text-[#8a8a8a]">Backups: {infra.backupStatus}</p>}
      </Card>

      <Card title="Portal availability" description="Changes apply to everyone immediately.">
        <ToggleRow
          label="Student portal"
          description="Candidates can sign in and take exams."
          checked={settings.studentPortalEnabled}
          onChange={(v) => toggle("studentPortalEnabled", "Student portal", v, v ? undefined : "Disable the student portal? Candidates won't be able to sign in or take exams.")}
          disabled={saving}
        />
        <ToggleRow
          label="Faculty portal"
          checked={settings.facultyPortalEnabled}
          onChange={(v) => toggle("facultyPortalEnabled", "Faculty portal", v, v ? undefined : "Disable the faculty portal? Faculty won't be able to sign in.")}
          disabled={saving}
        />
        <ToggleRow
          label="Maintenance mode"
          description="Shows a maintenance screen to everyone except administrators."
          checked={settings.maintenanceMode}
          onChange={(v) => toggle("maintenanceMode", "Maintenance mode", v, v ? "Turn on maintenance mode? All non-admin users will be blocked." : undefined)}
          disabled={saving}
        />
        <ToggleRow
          label="Security agent"
          description="Background threat monitoring for the platform."
          checked={settings.securityAgentEnabled}
          onChange={(v) => toggle("securityAgentEnabled", "Security agent", v)}
          disabled={saving}
        />
        {settings.emergencyShutdown && (
          <div className="mt-3">
            <StatusPill tone="bad">Emergency shutdown is active. Manage it from Admin panel → System Settings.</StatusPill>
          </div>
        )}
      </Card>

      <Card
        title="Detection thresholds"
        description="Platform-wide limits used by proctoring and integrity analysis."
        action={
          <Button onClick={saveThresholds} disabled={!thresholdsDirty || !thresholdsValid || saving}>
            {saving && <Loader2 className="size-3.5 animate-spin" />} Save
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label="Integrity warning limit"
            type="number"
            value={thresholds.integrityWarningLimit}
            onChange={(v) => setThresholds((t) => ({ ...t, integrityWarningLimit: v }))}
            hint={thresholdErrors.integrityWarningLimit ? "Whole number, 1 or more." : "Warnings before a session is escalated."}
          />
          <TextField
            label="Similarity threshold (%)"
            type="number"
            value={thresholds.similarityThreshold}
            onChange={(v) => setThresholds((t) => ({ ...t, similarityThreshold: v }))}
            hint={thresholdErrors.similarityThreshold ? "Between 0 and 100." : "Content similarity that triggers a flag."}
          />
          <TextField
            label="Risk escalation (%)"
            type="number"
            value={thresholds.riskEscalationLimit}
            onChange={(v) => setThresholds((t) => ({ ...t, riskEscalationLimit: v }))}
            hint={thresholdErrors.riskEscalationLimit ? "Between 0 and 100." : "Risk score that routes to faculty review."}
          />
        </div>
      </Card>

      <Card title="AI integrations" description="Models currently configured for platform agents.">
        <Row label="Evaluation model">
          <span className="text-[12.5px] font-semibold text-[#1a1917]">{settings.aiModelsConfig.evaluationModel}</span>
        </Row>
        <Row label="Support assistant model">
          <span className="text-[12.5px] font-semibold text-[#1a1917]">{settings.aiModelsConfig.supportModel}</span>
        </Row>
        <Row label="Identity verification">
          <span className="text-[12.5px] font-semibold text-[#1a1917]">{settings.aiModelsConfig.ocrModel}</span>
        </Row>
        <p className="mt-2 text-[11.5px] text-[#8a8a8a]">Change models from Admin panel → System Settings.</p>
      </Card>
    </div>
  );
}
