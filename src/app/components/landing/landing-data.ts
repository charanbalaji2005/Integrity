import {
  Activity,
  AppWindow,
  Eye,
  FileText,
  Fingerprint,
  ScanFace,
  Smartphone,
  Users,
  type LucideIcon,
} from "lucide-react";
import { API_BASE_URL } from "../../utils/api-client";

/**
 * Landing-page content. Every capability listed here maps to code that exists
 * in this repository (backend/src/features/proctoring and the exam client).
 * All "demo" values are illustrative sample data for the marketing preview
 * only; nothing here is read by, or written to, the real monitoring pipeline.
 */

export const LINKS = {
  login: "/login",
  register: "/register",
  facultyLogin: "/faculty-login",
  privacy: "/login?view=privacy",
  terms: "/login?view=terms",
  docs: `${API_BASE_URL}/api/v1/docs`,
  contact: "mailto:support@assessmentintegrity.ai",
} as const;

export const NAV_SECTIONS = [
  { id: "capabilities", label: "Capabilities" },
  { id: "how-it-works", label: "How it works" },
  { id: "monitoring", label: "AI agents" },
  { id: "trust", label: "Security" },
] as const;

export interface Capability {
  id: string;
  title: string;
  summary: string;
  detail: string;
  /** What the system actually measures, shown in the interactive preview. */
  signals: string[];
  icon: LucideIcon;
  /** Accent hue for the preview card. */
  tone: "blue" | "violet" | "cyan" | "amber" | "rose";
}

export const CAPABILITIES: Capability[] = [
  {
    id: "monitoring",
    title: "AI candidate monitoring",
    summary: "A multi-agent pipeline analyses the webcam feed throughout the attempt.",
    detail:
      "Face, behaviour and evidence agents run over every frame and hand their findings to a proctor orchestrator that decides when to warn, pause or escalate to faculty.",
    signals: ["Head pose & gaze direction", "Eye closure (EAR)", "Mouth movement / possible speech"],
    icon: Activity,
    tone: "blue",
  },
  {
    id: "suspicious",
    title: "Suspicious activity detection",
    summary: "Temporal state machines confirm behaviour before anything is flagged.",
    detail:
      "Signals must persist for several seconds before they become evidence, so natural glances at a scratch-pad are not treated as misconduct.",
    signals: ["Sustained look-away", "Natural scratch-pad glances filtered", "Correlated incidents"],
    icon: Eye,
    tone: "violet",
  },
  {
    id: "identity",
    title: "Face & identity verification",
    summary: "The candidate's face is enrolled at calibration and re-checked during the exam.",
    detail:
      "A face descriptor captured at calibration is compared against the live feed at regular intervals. Liveness checks flag frozen or static camera streams.",
    signals: ["Enrolment at calibration", "Periodic re-verification", "Static-image (liveness) check"],
    icon: ScanFace,
    tone: "cyan",
  },
  {
    id: "multi-person",
    title: "Multiple-person detection",
    summary: "Additional faces in frame are detected and confirmed over time.",
    detail:
      "When more than one person is visible for a sustained period the attempt is flagged for review and, if it persists, paused for faculty attention.",
    signals: ["Face count per frame", "Sustained-presence confirmation", "Automatic pause on persistence"],
    icon: Users,
    tone: "rose",
  },
  {
    id: "objects",
    title: "Phone & object detection",
    summary: "Object detection looks for phones, secondary screens, books and earphones.",
    detail:
      "Phones and secondary screens can pause the exam; books and earphones raise a warning. A failed detector is reported as inconclusive, never as a clean room.",
    signals: ["Mobile phones", "Secondary screens", "Books & earphones"],
    icon: Smartphone,
    tone: "amber",
  },
  {
    id: "browser",
    title: "Browser & focus monitoring",
    summary: "Tab switches, focus loss, fullscreen exits and developer tools are tracked.",
    detail:
      "The exam client reports browser telemetry with every frame; the server converts it into timestamped evidence alongside the camera signals.",
    signals: ["Tab-switch & focus loss", "Fullscreen exit", "Developer-tools detection"],
    icon: AppWindow,
    tone: "blue",
  },
  {
    id: "evidence",
    title: "Evidence & event tracking",
    summary: "Every confirmed event is stored with its duration, confidence and context.",
    detail:
      "Violations and a full session timeline are persisted per attempt, with a recommendation for human review where the evidence warrants it.",
    signals: ["Per-attempt timeline", "Confidence per event", "Human-review recommendations"],
    icon: Fingerprint,
    tone: "violet",
  },
  {
    id: "reports",
    title: "Automated integrity reports",
    summary: "Each submission receives a report built only from evidence that was captured.",
    detail:
      "Reports state frame coverage, detector health and identity status alongside the integrity score, so missing telemetry is never presented as compliance.",
    signals: ["Integrity score + evidence confidence", "Telemetry coverage", "Accept / monitor / review decision"],
    icon: FileText,
    tone: "cyan",
  },
];

export const WORKFLOW_STEPS = [
  {
    step: "01",
    title: "Initialize examination",
    body: "Faculty create an assessment and choose which safeguards apply: webcam monitoring, face verification, gaze tracking, tab-switch detection and browser lockdown.",
    points: ["Question builder", "Per-exam monitoring policy", "Resume & attempt rules"],
  },
  {
    step: "02",
    title: "Monitor in real time",
    body: "Candidates calibrate their camera, then the agent pipeline analyses each frame while faculty watch a live dashboard and can warn, pause, resume or terminate.",
    points: ["Camera calibration", "Live faculty dashboard", "Manual interventions"],
  },
  {
    step: "03",
    title: "Generate integrity reports",
    body: "On submission the session closes and a report summarises the evidence, its confidence and a recommended decision for faculty review.",
    points: ["Evidence timeline", "Confidence-aware score", "Faculty review"],
  },
] as const;

export const TRUST_POINTS = [
  {
    title: "Secure examination sessions",
    body: "Every proctoring request is tied to an authenticated session and checked against the attempt it targets, so candidates can only act on their own attempt.",
  },
  {
    title: "Controlled access",
    body: "Live monitoring channels are restricted to the faculty member who owns the assessment, or an administrator. Unknown rooms are rejected.",
  },
  {
    title: "Evidence traceability",
    body: "Each event records when it started, how long it lasted, its confidence and the camera quality at the time, building an auditable timeline.",
  },
  {
    title: "Reliable monitoring workflows",
    body: "Session state is persisted, so a reconnect or server restart resumes monitoring with its history instead of starting over.",
  },
  {
    title: "Transparent event reporting",
    body: "Gaps in telemetry and detector failures are reported as inconclusive rather than hidden, and serious findings are routed to human review.",
  },
] as const;

/* ------------------------------------------------------------------ */
/* Demo data — illustrative only (visibly labelled as such in the UI)  */
/* ------------------------------------------------------------------ */

export type DemoSeverity = "info" | "low" | "medium" | "high";

export interface DemoEvent {
  time: string;
  label: string;
  detail: string;
  severity: DemoSeverity;
}

export const DEMO_TIMELINE: DemoEvent[] = [
  { time: "10:02:14", label: "Session started", detail: "Agent pipeline online", severity: "info" },
  { time: "10:02:31", label: "Camera calibrated", detail: "Identity enrolment captured", severity: "info" },
  { time: "10:09:48", label: "Sustained look-away", detail: "Gaze left for 4.1s", severity: "low" },
  { time: "10:14:05", label: "Tab switch", detail: "Focus lost · 1st occurrence", severity: "medium" },
  { time: "10:21:37", label: "Phone detected", detail: "Lower-right · 88% confidence", severity: "high" },
  { time: "10:21:39", label: "Exam paused", detail: "Awaiting faculty review", severity: "high" },
];

export const DEMO_CANDIDATES = [
  { name: "Aarav M.", score: 96, status: "Attentive", tone: "ok" as const },
  { name: "Diya R.", score: 88, status: "Looking away", tone: "warn" as const },
  { name: "Kabir S.", score: 61, status: "Paused", tone: "alert" as const },
  { name: "Meera P.", score: 99, status: "Attentive", tone: "ok" as const },
];
