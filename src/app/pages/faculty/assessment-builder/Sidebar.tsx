import React, { useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import {
  AlertTriangle,
  AppWindow,
  BrainCircuit,
  Camera,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock,
  Eye,
  Info,
  Mic,
  ScanFace,
  Shield,
  Smartphone,
  BarChart3,
  ClipboardCheck,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { cn } from "../../../components/ui/utils";
import type { BuilderForm, CheckItem, IntegrityConfig, Summary } from "./builder-model";
import { Field, NumberInput, Pill, SettingsGroup, ToggleRow, inputCls } from "./ui-kit";

/** Sidebar card: always open on desktop, collapsible on small screens. */
export function SidebarPanel({
  id,
  icon: Icon,
  title,
  subtitle,
  children,
  defaultOpenMobile = false,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  defaultOpenMobile?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpenMobile);
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 rounded-2xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-4 py-3.5 text-left lg:pointer-events-none"
      >
        <Icon className="size-4 text-zinc-500" />
        <span className="min-w-0 flex-1">
          <span id={`${id}-title`} className="block text-[14px] font-semibold tracking-tight text-zinc-900">
            {title}
          </span>
          {subtitle && <span className="block text-[11.5px] text-zinc-500">{subtitle}</span>}
        </span>
        <ChevronDown className={cn("size-4 text-zinc-400 transition-transform lg:hidden", open && "rotate-180")} />
      </button>
      <div className={cn("border-t border-zinc-100 px-4 pb-4 pt-3", open ? "block" : "hidden lg:block")}>{children}</div>
    </section>
  );
}

type Path = { [G in keyof IntegrityConfig]: `integrityConfig.${G & string}.${keyof IntegrityConfig[G] & string}` }[keyof IntegrityConfig];

function CfgToggle({ path, label, description, disabled, tip }: { path: Path; label: string; description?: string; disabled?: boolean; tip?: string }) {
  const { control } = useFormContext<BuilderForm>();
  return (
    <Controller
      control={control}
      name={path as any}
      render={({ field }) => (
        <ToggleRow compact id={`ic-${path}`} label={label} description={description} checked={!!field.value} onChange={field.onChange} disabled={disabled} tip={tip} />
      )}
    />
  );
}

const SERVER_POLICY_TIP =
  "Saved with this exam's integrity policy for reviewers. The live AI proctoring service currently applies your institution's detection thresholds.";

export function IntegrityPanel() {
  const { control, setValue } = useFormContext<BuilderForm>();
  const v = useWatch({ control });
  const cfg = v.integrityConfig as IntegrityConfig;
  const master = (name: keyof BuilderForm) => ({
    enabled: !!v[name],
    onToggle: (on: boolean) => setValue(name, on as never, { shouldDirty: true }),
    toggleId: `ic-master-${String(name)}`,
  });
  const enabledCount = [v.webcamMonitoring, v.faceVerification, v.gazeTracking, v.webcamMonitoring && cfg?.objects?.enabled, v.microphoneAnalysis, v.browserLockdown || v.tabSwitchDetection, v.behavioralAnalysis].filter(Boolean).length;

  return (
    <SidebarPanel id="section-integrity" icon={Shield} title="Integrity Controls" subtitle={`${enabledCount} of 7 monitoring groups active`} defaultOpenMobile>
      <div className="space-y-2">
        <SettingsGroup icon={Camera} title="Webcam Monitoring" summary="Face presence, multiple faces, camera status" {...master("webcamMonitoring")}>
          <CfgToggle path="integrityConfig.webcam.facePresence" label="Face presence detection" disabled={!v.webcamMonitoring} />
          <CfgToggle path="integrityConfig.webcam.multipleFaces" label="Multiple face detection" disabled={!v.webcamMonitoring} />
          <CfgToggle path="integrityConfig.webcam.faceDisappearanceAlerts" label="Face disappearance alerts" disabled={!v.webcamMonitoring} tip={SERVER_POLICY_TIP} />
          <CfgToggle path="integrityConfig.webcam.cameraDisconnect" label="Camera disconnection monitoring" disabled={!v.webcamMonitoring} />
        </SettingsGroup>

        <SettingsGroup icon={ScanFace} title="Face Verification" summary="Identity check before the exam starts" {...master("faceVerification")}>
          <CfgToggle path="integrityConfig.faceVerification.preExam" label="Pre-exam identity verification" disabled={!v.faceVerification} />
          <CfgToggle path="integrityConfig.faceVerification.referenceComparison" label="Compare with reference image" description="Uses the student's verified profile photo." disabled={!v.faceVerification} />
          <div className="py-1.5">
            <Field label="If verification fails" htmlFor="ic-fv-fail">
              <Controller
                control={control}
                name="integrityConfig.faceVerification.onFailure"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={!v.faceVerification}>
                    <SelectTrigger id="ic-fv-fail" className="h-8 rounded-lg border-zinc-200 text-[12.5px] shadow-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="flag">Allow and flag for review</SelectItem>
                      <SelectItem value="block">Block until a proctor approves</SelectItem>
                      <SelectItem value="allow">Allow without flag</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </div>
        </SettingsGroup>

        <SettingsGroup icon={Eye} title="Gaze & Head Monitoring" summary={`Off-screen after ${cfg?.gaze?.offScreenSeconds ?? 5}s sustained`} {...master("gazeTracking")}>
          <CfgToggle path="integrityConfig.gaze.gazeDirection" label="Approximate gaze direction" disabled={!v.gazeTracking} />
          <CfgToggle path="integrityConfig.gaze.headPose" label="Head pose monitoring" disabled={!v.gazeTracking} />
          <div className="py-1.5">
            <Field label="Sustained off-screen threshold" htmlFor="ic-gaze-sec" tip={SERVER_POLICY_TIP}>
              <Controller
                control={control}
                name="integrityConfig.gaze.offScreenSeconds"
                render={({ field }) => <NumberInput id="ic-gaze-sec" value={field.value} onChange={(n) => field.onChange(Math.min(60, Math.max(2, n ?? 5)))} min={2} max={60} suffix="sec" disabled={!v.gazeTracking} />}
              />
            </Field>
          </div>
          <p className="pb-1 text-[11px] leading-snug text-zinc-500">Gaze is estimated from the webcam image; it is approximate and should be reviewed by a person.</p>
        </SettingsGroup>

        <SettingsGroup
          icon={Smartphone}
          title="Object Detection"
          summary={v.webcamMonitoring ? "Phones, unauthorized objects, extra people" : "Requires webcam monitoring"}
          enabled={!!(v.webcamMonitoring && cfg?.objects?.enabled)}
          onToggle={(on) => setValue("integrityConfig.objects.enabled", on, { shouldDirty: true })}
          toggleId="ic-master-objects"
        >
          <CfgToggle path="integrityConfig.objects.phone" label="Mobile phone detection" disabled={!v.webcamMonitoring || !cfg?.objects?.enabled} />
          <CfgToggle path="integrityConfig.objects.unauthorizedObjects" label="Unauthorized object detection" disabled={!v.webcamMonitoring || !cfg?.objects?.enabled} tip={SERVER_POLICY_TIP} />
          <CfgToggle path="integrityConfig.objects.multiplePersons" label="Multiple person detection" disabled={!v.webcamMonitoring || !cfg?.objects?.enabled} />
        </SettingsGroup>

        <SettingsGroup icon={Mic} title="Microphone Analysis" summary="Voice activity and background speech" {...master("microphoneAnalysis")}>
          <CfgToggle path="integrityConfig.microphone.voiceActivity" label="Voice activity detection" disabled={!v.microphoneAnalysis} />
          <CfgToggle path="integrityConfig.microphone.backgroundSpeech" label="Background speech indicators" disabled={!v.microphoneAnalysis} tip={SERVER_POLICY_TIP} />
          <CfgToggle path="integrityConfig.microphone.micDisconnect" label="Microphone disconnection" disabled={!v.microphoneAnalysis} />
        </SettingsGroup>

        <SettingsGroup icon={AppWindow} title="Browser Monitoring" summary="Tabs, fullscreen, clipboard, focus" {...master("browserLockdown")}>
          <Controller
            control={control}
            name="tabSwitchDetection"
            render={({ field }) => <ToggleRow compact id="ic-tab" label="Tab switching detection" checked={field.value} onChange={field.onChange} />}
          />
          <CfgToggle path="integrityConfig.browser.windowFocus" label="Window focus monitoring" disabled={!v.tabSwitchDetection} />
          <CfgToggle path="integrityConfig.browser.fullscreenExit" label="Fullscreen exit detection" />
          <CfgToggle path="integrityConfig.browser.copyPaste" label="Copy / paste blocking" description={v.browserLockdown ? "Blocks copying questions and pasting outside text; copy/paste within a student's own answers stays allowed." : "Needs browser lockdown on."} disabled={!v.browserLockdown} />
          <CfgToggle path="integrityConfig.browser.contextMenu" label="Context menu restriction" disabled={!v.browserLockdown} />
        </SettingsGroup>

        <SettingsGroup icon={BrainCircuit} title="AI Behavior Analysis" summary={`${cfg?.behavior?.sensitivity ?? "medium"} sensitivity · alert after ${cfg?.behavior?.alertThreshold ?? 3} signals`} {...master("behavioralAnalysis")}>
          <CfgToggle path="integrityConfig.behavior.combineSignals" label="Combine detection signals" description="Fuse camera, audio and browser events before alerting." disabled={!v.behavioralAnalysis} />
          <div className="grid grid-cols-2 gap-2 py-1.5">
            <Field label="Sensitivity" htmlFor="ic-sens" className="col-span-2">
              <Controller
                control={control}
                name="integrityConfig.behavior.sensitivity"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={!v.behavioralAnalysis}>
                    <SelectTrigger id="ic-sens" className="h-8 rounded-lg border-zinc-200 text-[12.5px] shadow-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low — fewer alerts</SelectItem>
                      <SelectItem value="medium">Medium — balanced</SelectItem>
                      <SelectItem value="high">High — flag more readily</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label="Alert threshold" htmlFor="ic-thr" tip="Number of correlated signals before an alert is raised.">
              <Controller control={control} name="integrityConfig.behavior.alertThreshold" render={({ field }) => <NumberInput id="ic-thr" value={field.value} onChange={(n) => field.onChange(Math.min(20, Math.max(1, n ?? 3)))} min={1} max={20} disabled={!v.behavioralAnalysis} />} />
            </Field>
            <Field label="Duplicate window" htmlFor="ic-dedupe" tip="Repeated alerts of the same kind inside this window are merged.">
              <Controller control={control} name="integrityConfig.behavior.dedupeWindowSeconds" render={({ field }) => <NumberInput id="ic-dedupe" value={field.value} onChange={(n) => field.onChange(Math.min(600, Math.max(0, n ?? 30)))} min={0} max={600} suffix="sec" disabled={!v.behavioralAnalysis} />} />
            </Field>
          </div>
        </SettingsGroup>
      </div>

      <div className="mt-3 flex gap-2 rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-2.5 text-[11.5px] leading-snug text-sky-900">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <p>
          Monitoring runs in the student's browser and webcam. It cannot see other devices, other applications or operating-system activity, and every
          detection is an indicator for human review — not proof of misconduct.
        </p>
      </div>
    </SidebarPanel>
  );
}

export function ResumePanel() {
  const { control, setValue, formState: { errors } } = useFormContext<BuilderForm>();
  const allowResume = useWatch({ control, name: "allowResume" });
  const retakeAllowed = useWatch({ control, name: "retakeAllowed" });
  const attemptLimit = useWatch({ control, name: "attemptLimit" });
  return (
    <SidebarPanel id="section-resume" icon={Clock} title="Resume & Attempt Rules" subtitle={allowResume ? "Resume allowed" : "No resume"}>
      <div className="divide-y divide-zinc-100">
        <Controller control={control} name="allowResume" render={({ field }) => (
          <ToggleRow compact id="rr-allow" label="Allow exam resume" description="Students can continue an interrupted attempt." checked={field.value} onChange={field.onChange} />
        )} />
        {allowResume && (
          <div className="space-y-2 py-2">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Max resumes" htmlFor="rr-max" error={errors.maxResumeCount?.message}>
                <Controller control={control} name="maxResumeCount" render={({ field }) => <NumberInput id="rr-max" value={field.value} onChange={(n) => field.onChange(n ?? 0)} min={0} max={20} />} />
              </Field>
              <Field label="Grace period" htmlFor="rr-grace" error={errors.resumeTimeWindow?.message} tip="How long after disconnecting a student may resume.">
                <Controller control={control} name="resumeTimeWindow" render={({ field }) => <NumberInput id="rr-grace" value={field.value} onChange={(n) => field.onChange(n ?? 0)} min={0} max={240} suffix="min" />} />
              </Field>
            </div>
            <div className="text-[11.5px] font-semibold uppercase tracking-wide text-zinc-400">Session recovery</div>
            <Controller control={control} name="resumeAfterDisconnect" render={({ field }) => <ToggleRow compact id="rr-net" label="After network disconnect" checked={field.value} onChange={field.onChange} />} />
            <Controller control={control} name="resumeAfterCrash" render={({ field }) => <ToggleRow compact id="rr-crash" label="After browser crash" checked={field.value} onChange={field.onChange} />} />
            <Controller control={control} name="resumeAfterLogout" render={({ field }) => <ToggleRow compact id="rr-logout" label="After manual logout" checked={field.value} onChange={field.onChange} />} />
          </div>
        )}
        <Controller control={control} name="autoSubmitOnExpiry" render={({ field }) => (
          <ToggleRow compact id="rr-auto" label="Auto-submit when time expires" description={field.value ? undefined : "Answers lock at zero; the student must submit."} checked={field.value} onChange={field.onChange} />
        )} />
        <ToggleRow
          compact
          id="rr-multi"
          label="Allow multiple attempts"
          description={retakeAllowed ? `Up to ${attemptLimit} attempts.` : "One attempt per student."}
          checked={retakeAllowed}
          onChange={(on) => {
            setValue("retakeAllowed", on, { shouldDirty: true, shouldValidate: true });
            if (on && Number(attemptLimit) < 2) setValue("attemptLimit", 2, { shouldDirty: true, shouldValidate: true });
            if (!on) setValue("attemptLimit", 1, { shouldDirty: true, shouldValidate: true });
          }}
        />
        {retakeAllowed && (
          <div className="py-2">
            <Field label="Retakes open from" htmlFor="rr-retake" hint="Optional.">
              <Controller control={control} name="retakeDate" render={({ field }) => <input id="rr-retake" type="datetime-local" value={field.value} onChange={field.onChange} className={inputCls} />} />
            </Field>
          </div>
        )}
        <Controller control={control} name="attemptResetAllowed" render={({ field }) => (
          <ToggleRow compact id="rr-reset" label="Faculty may reset attempts" description="Lets you void an attempt from the Evaluation Queue so the student can start again." checked={field.value} onChange={field.onChange} />
        )} />
      </div>
    </SidebarPanel>
  );
}

export function SummaryPanel({ summary, totalMarks, passingMarks, duration }: { summary: Summary; totalMarks: number | null; passingMarks: number | null; duration: number }) {
  const total = totalMarks ?? summary.totalMarks;
  const max = Math.max(1, summary.byDifficulty.easy + summary.byDifficulty.medium + summary.byDifficulty.hard);
  return (
    <SidebarPanel id="section-summary" icon={BarChart3} title="Assessment Summary" subtitle={`${summary.totalQuestions} questions · ${total} marks`}>
      <dl className="grid grid-cols-3 gap-2">
        {[
          { k: "Questions", v: summary.totalQuestions },
          { k: "Marks", v: total },
          { k: "Est. time", v: `${summary.estimatedMinutes}m` },
        ].map((s) => (
          <div key={s.k} className="rounded-lg bg-zinc-50 px-2.5 py-2">
            <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-zinc-500">{s.k}</dt>
            <dd className="text-[17px] font-semibold tabular-nums text-zinc-900">{s.v}</dd>
          </div>
        ))}
      </dl>
      {summary.estimatedMinutes > duration && (
        <p className="mt-2 flex items-start gap-1.5 text-[11.5px] text-amber-700">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> Estimated completion time exceeds the {duration}-minute duration.
        </p>
      )}
      {passingMarks != null && <p className="mt-2 text-[11.5px] text-zinc-500">Pass mark: {passingMarks} / {total} ({total ? Math.round((passingMarks / total) * 100) : 0}%)</p>}

      <div className="mt-3">
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">By type</div>
        {summary.byType.length === 0 ? (
          <p className="text-[12px] text-zinc-400">No questions yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {summary.byType.map((t) => (
              <li key={t.type}>
                <Pill>
                  {t.label} · {t.count}
                </Pill>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-3">
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">By difficulty</div>
        <div className="space-y-1.5">
          {(["easy", "medium", "hard"] as const).map((d) => (
            <div key={d} className="flex items-center gap-2 text-[12px]">
              <span className="w-14 capitalize text-zinc-600">{d}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className={cn("h-full rounded-full", d === "easy" ? "bg-emerald-500" : d === "medium" ? "bg-amber-500" : "bg-rose-500")}
                  style={{ width: `${(summary.byDifficulty[d] / max) * 100}%` }}
                />
              </div>
              <span className="w-5 text-right tabular-nums text-zinc-700">{summary.byDifficulty[d]}</span>
            </div>
          ))}
        </div>
      </div>
    </SidebarPanel>
  );
}

export function ChecklistPanel({ items, serverIssues, onPublish, publishing, published }: { items: CheckItem[]; serverIssues: string[]; onPublish: () => void; publishing: boolean; published: boolean }) {
  const required = items.filter((i) => i.required);
  const done = required.filter((i) => i.ok).length;
  const ready = done === required.length;
  return (
    <SidebarPanel id="section-checklist" icon={ClipboardCheck} title="Publishing Checklist" subtitle={published ? "Published" : ready ? "Ready to publish" : `${required.length - done} required item${required.length - done === 1 ? "" : "s"} left`} defaultOpenMobile>
      <ul className="space-y-1">
        {items.map((it) => (
          <li key={it.id}>
            <button
              type="button"
              onClick={() => document.getElementById(it.target)?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="flex w-full items-start gap-2 rounded-md px-1.5 py-1.5 text-left transition hover:bg-zinc-50"
            >
              {it.ok ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-label="Done" />
              ) : it.required ? (
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" aria-label="Required" />
              ) : (
                <Circle className="mt-0.5 size-4 shrink-0 text-zinc-300" aria-label="Recommended" />
              )}
              <span className="min-w-0">
                <span className={cn("block text-[12.5px]", it.ok ? "text-zinc-700" : "font-medium text-zinc-900")}>
                  {it.label}
                  {!it.required && !it.ok && <span className="ml-1 text-[11px] font-normal text-zinc-400">(recommended)</span>}
                </span>
                {!it.ok && it.detail && <span className="block text-[11px] text-zinc-500">{it.detail}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {serverIssues.length > 0 && (
        <div role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11.5px] text-rose-700">
          <div className="mb-1 font-semibold">The server blocked publishing:</div>
          <ul className="list-disc space-y-0.5 pl-4">
            {serverIssues.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {!published && (
        <button
          type="button"
          onClick={onPublish}
          disabled={publishing}
          className={cn(
            "mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg text-[13px] font-semibold shadow-sm transition disabled:opacity-60",
            ready ? "bg-emerald-600 text-white hover:bg-emerald-700" : "border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50",
          )}
        >
          {ready ? "Publish assessment" : "Review & publish"}
        </button>
      )}
    </SidebarPanel>
  );
}
