import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, RotateCcw } from "lucide-react";
import { errorMessage, supportApi } from "./api";
import type { SupportSettings } from "./types";
import { ErrorBlock, Field, SectionHeader, Spinner, Toggle, btnPrimary, btnSecondary, cardCls, cx, inputCls } from "./ui";

const WEIGHTS: Array<{ key: keyof SupportSettings["weights"]; label: string; hint: string }> = [
  { key: "workload", label: "Workload", hint: "Prefer representatives with fewer active tickets." },
  { key: "expertise", label: "Expertise", hint: "Prefer representatives skilled in the ticket's category." },
  { key: "availability", label: "Availability", hint: "Prefer representatives who are online and available." },
  { key: "performance", label: "Performance", hint: "Prefer faster resolution and better ratings." },
  { key: "recency", label: "Recency", hint: "Spread work to those not assigned recently." },
];

export function SettingsView({ canEdit }: { canEdit: boolean }) {
  const [original, setOriginal] = useState<SupportSettings | null>(null);
  const [s, setS] = useState<SupportSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await supportApi<SupportSettings>("/settings");
      setOriginal(data);
      setS(data);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!s) return;
    setSaving(true);
    try {
      const data = await supportApi<SupportSettings>("/settings", { method: "PUT", body: s });
      setOriginal(data);
      setS(data);
      toast.success("Assignment settings saved");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const dirty = !!s && !!original && JSON.stringify(s) !== JSON.stringify(original);
  const total = s ? WEIGHTS.reduce((n, w) => n + (s.weights[w.key] || 0), 0) : 0;
  // Weights are integers on a 0–100 scale (defaults 40/30/15/10/5); the score uses each one's share of the total.
  const sliderMax = 100;
  const sliderStep = 1;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5 overflow-y-auto h-full">
      <SectionHeader
        title="Assignment settings"
        description="Controls how the assignment engine routes new tickets to representatives."
        actions={
          canEdit && s ? (
            <>
              <button type="button" className={btnSecondary} onClick={() => original && setS(original)} disabled={!dirty || saving}>
                <RotateCcw className="size-4" /> Reset
              </button>
              <button type="button" className={btnPrimary} onClick={save} disabled={!dirty || saving}>
                {saving && <Loader2 className="size-4 animate-spin" />} Save settings
              </button>
            </>
          ) : undefined
        }
      />
      {error ? (
        <ErrorBlock message={error} onRetry={load} />
      ) : loading || !s ? (
        <Spinner label="Loading settings" />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4 sm:gap-6">
          <section className={cx(cardCls, "p-5")} aria-labelledby="weights-h">
            <h2 id="weights-h" className="text-sm font-bold text-[#1a1917]">
              Scoring weights
            </h2>
            <p className="text-[11px] text-[#8a8a8a] mt-1 mb-4">
              Weights are <strong>relative</strong> — each factor's share of the score is its weight divided by the total. Only the proportions matter.
            </p>
            <div className="space-y-5">
              {WEIGHTS.map((w) => {
                const v = s.weights[w.key] ?? 0;
                const share = total > 0 ? Math.round((v / total) * 100) : 0;
                const id = `w-${w.key}`;
                return (
                  <div key={w.key}>
                    <div className="flex items-center justify-between mb-1">
                      <label htmlFor={id} className="text-xs font-bold text-[#1a1917]">
                        {w.label}
                      </label>
                      <span className="text-[11px] text-[#676767] tabular-nums">
                        weight <strong className="text-[#1a1917]">{Math.round(v * 100) / 100}</strong> · {share}% of score
                      </span>
                    </div>
                    <input
                      id={id}
                      type="range"
                      min={0}
                      max={sliderMax}
                      step={sliderStep}
                      value={v}
                      disabled={!canEdit}
                      onChange={(e) => setS({ ...s, weights: { ...s.weights, [w.key]: Number(e.target.value) } })}
                      className="w-full h-11 accent-[#1a1917] cursor-pointer disabled:cursor-not-allowed"
                      aria-describedby={`${id}-hint`}
                    />
                    <div className="h-1.5 rounded-full bg-[#ececec] overflow-hidden" aria-hidden>
                      <div className="h-full bg-[#1a1917] rounded-full transition-all" style={{ width: `${share}%` }} />
                    </div>
                    <p id={`${id}-hint`} className="text-[10.5px] text-[#8a8a8a] mt-1">
                      {w.hint}
                    </p>
                  </div>
                );
              })}
              {total === 0 && <p className="text-[11px] text-rose-600">All weights are zero — the engine cannot rank representatives.</p>}
            </div>
          </section>

          <section className={cx(cardCls, "p-5 space-y-5")} aria-labelledby="rules-h">
            <h2 id="rules-h" className="text-sm font-bold text-[#1a1917]">
              Acceptance and alerts
            </h2>
            <Field label="Acceptance timeout (seconds)" htmlFor="set-timeout" hint="How long a representative has to accept an offered ticket before it moves to the next person.">
              <input
                id="set-timeout"
                type="number"
                min={15}
                step={15}
                value={s.acceptanceTimeoutSeconds}
                disabled={!canEdit}
                onChange={(e) => setS({ ...s, acceptanceTimeoutSeconds: Math.max(0, Number(e.target.value) || 0) })}
                className={inputCls}
              />
            </Field>
            <Field label="Reassignment alert threshold" htmlFor="set-thresh" hint="Alert supervisors when a ticket has been reassigned this many times.">
              <input
                id="set-thresh"
                type="number"
                min={1}
                value={s.reassignAlertThreshold}
                disabled={!canEdit}
                onChange={(e) => setS({ ...s, reassignAlertThreshold: Math.max(0, Number(e.target.value) || 0) })}
                className={inputCls}
              />
            </Field>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-[#1a1917]">Allow offline assignment</p>
                <p className="text-[11px] text-[#8a8a8a] mt-0.5">Offer tickets to representatives who are offline when no one else is available.</p>
              </div>
              <Toggle checked={s.allowOfflineAssignment} onChange={(v) => setS({ ...s, allowOfflineAssignment: v })} label="Allow offline assignment" disabled={!canEdit} />
            </div>
            {!canEdit && <p className="text-[11px] text-[#8a8a8a]">Only supervisors can change these settings.</p>}
          </section>
        </div>
      )}
    </div>
  );
}
