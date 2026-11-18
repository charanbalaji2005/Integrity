import React from "react";
import { DEFAULT_EXAM_DEFAULTS, type ExamDefaults, resetPreferences, usePreferences } from "../preferences";
import { Button, Card, Row, SavedLocallyNote, SectionHeader, Select, ToggleRow } from "../ui";

const MONITORING: { key: keyof ExamDefaults; label: string; description: string }[] = [
  { key: "webcam", label: "Webcam monitoring", description: "Periodic face analysis and anomaly detection." },
  { key: "mic", label: "Microphone analysis", description: "Background noise and voice detection." },
  { key: "lockdown", label: "Browser lockdown", description: "Block copy-paste, print screen and developer tools." },
  { key: "face", label: "Face verification", description: "Confirm the candidate matches their registration photo." },
  { key: "gaze", label: "Gaze tracking", description: "Flag sustained looking away from the screen." },
  { key: "tab", label: "Tab-switch detection", description: "Flag and count every tab or window switch." },
  { key: "behavior", label: "AI behaviour analysis", description: "Flag multiple people or unusual behaviour." },
];

export function ExamRulesSection({ userId }: { userId: string }) {
  const { prefs, update } = usePreferences(userId);
  const r = prefs.examDefaults;
  const set = (patch: Partial<ExamDefaults>) => update("examDefaults", patch);
  const isDefault = (Object.keys(DEFAULT_EXAM_DEFAULTS) as (keyof ExamDefaults)[]).every(
    (k) => r[k] === DEFAULT_EXAM_DEFAULTS[k],
  );

  return (
    <div>
      <SectionHeader
        title="Examination rules"
        description="Defaults applied when you create a new assessment. You can still change them per exam in the create form."
      />

      <Card
        title="Monitoring policies"
        description="Which proctoring signals are switched on for new exams."
        action={
          <Button variant="secondary" disabled={isDefault} onClick={() => resetPreferences(userId, "examDefaults")}>
            Restore defaults
          </Button>
        }
      >
        {MONITORING.map((m) => (
          <ToggleRow
            key={m.key}
            label={m.label}
            description={m.description}
            checked={r[m.key] as boolean}
            onChange={(v) => set({ [m.key]: v } as Partial<ExamDefaults>)}
          />
        ))}
      </Card>

      <Card title="Interruptions and attempts" description="What happens when a candidate's session is interrupted.">
        <ToggleRow
          label="Allow resuming an attempt"
          description="Candidates can continue after an interruption instead of starting over."
          checked={r.allowResume}
          onChange={(allowResume) => set({ allowResume })}
        />
        {r.allowResume && (
          <>
            <Row label="Maximum resumes" description="Interruptions allowed per attempt." htmlFor="max-resume">
              <Select
                id="max-resume"
                value={r.maxResumeCount}
                onChange={(maxResumeCount) => set({ maxResumeCount })}
                options={["1", "2", "3", "5", "10"].map((v) => ({ value: v, label: `${v} time${v === "1" ? "" : "s"}` }))}
              />
            </Row>
            <Row label="Resume window" description="How long a candidate has to come back." htmlFor="resume-window">
              <Select
                id="resume-window"
                value={r.resumeTimeWindow}
                onChange={(resumeTimeWindow) => set({ resumeTimeWindow })}
                options={["5", "10", "15", "30", "60"].map((v) => ({ value: v, label: `${v} minutes` }))}
              />
            </Row>
            <ToggleRow
              label="Resume after network disconnect"
              checked={r.resumeAfterDisconnect}
              onChange={(resumeAfterDisconnect) => set({ resumeAfterDisconnect })}
            />
            <ToggleRow
              label="Resume after browser crash"
              checked={r.resumeAfterCrash}
              onChange={(resumeAfterCrash) => set({ resumeAfterCrash })}
            />
            <ToggleRow
              label="Resume after signing out"
              checked={r.resumeAfterLogout}
              onChange={(resumeAfterLogout) => set({ resumeAfterLogout })}
            />
          </>
        )}
        <ToggleRow
          label="Lock attempt after submission"
          description="Prevent reopening a submitted attempt."
          checked={r.attemptLock}
          onChange={(attemptLock) => set({ attemptLock })}
        />
        <ToggleRow
          label="Accept late submissions"
          checked={r.lateSubmission}
          onChange={(lateSubmission) => set({ lateSubmission })}
        />
        <SavedLocallyNote />
      </Card>

      <p className="text-[11.5px] text-[#8a8a8a]">
        Platform-wide detection thresholds (integrity warning limit, similarity threshold) are set by administrators.
      </p>
    </div>
  );
}
