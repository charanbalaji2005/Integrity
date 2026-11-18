/**
 * Support Hub types — mirrors the Support Hub API & real-time contract exactly.
 * Do not add fields here that the backend does not send.
 */

export const SUPPORT_CATEGORIES = [
  { key: "login_auth", label: "Login and Authentication" },
  { key: "examination", label: "Examination Issues" },
  { key: "assessment_quiz", label: "Assessment and Quiz Issues" },
  { key: "camera_microphone", label: "Camera and Microphone Problems" },
  { key: "ai_proctoring", label: "AI Proctoring Issues" },
  { key: "face_verification", label: "Face Verification" },
  { key: "browser_compat", label: "Browser Compatibility" },
  { key: "network", label: "Network and Connectivity" },
  { key: "syllabus_materials", label: "Syllabus and Learning Materials" },
  { key: "course_management", label: "Course Management" },
  { key: "results_grading", label: "Results and Grading" },
  { key: "account_profile", label: "Account and Profile" },
  { key: "technical", label: "Technical Issues" },
  { key: "other", label: "Other" },
] as const;

export const SUPPORT_MODULES = [
  { key: "student_dashboard", label: "Student Dashboard" },
  { key: "examination_portal", label: "Examination Portal" },
  { key: "assessment_builder", label: "Assessment Builder" },
  { key: "live_proctoring", label: "Live Proctoring" },
  { key: "materials_syllabus", label: "Materials and Syllabus" },
  { key: "results", label: "Results" },
  { key: "profile_account", label: "Profile and Account" },
  { key: "other", label: "Other" },
] as const;

export type Urgency = "low" | "medium" | "high" | "critical";
export type Priority = "P1" | "P2" | "P3" | "P4";
export type TicketStatus =
  | "unassigned"
  | "pending_acceptance"
  | "in_progress"
  | "waiting_student"
  | "escalated"
  | "resolved";
export type Ownership = "AI" | "HUMAN";
export type Availability = "available" | "busy" | "away" | "offline" | "on_break" | "unavailable";

export const PRIORITIES: Priority[] = ["P1", "P2", "P3", "P4"];
export const PRIORITY_LABEL: Record<Priority, string> = {
  P1: "Critical",
  P2: "High",
  P3: "Medium",
  P4: "Low",
};

export const STATUS_LABEL: Record<TicketStatus, string> = {
  unassigned: "Unassigned",
  pending_acceptance: "Pending acceptance",
  in_progress: "In progress",
  waiting_student: "Waiting on student",
  escalated: "Escalated",
  resolved: "Resolved",
};

export const AVAILABILITY_OPTIONS: { key: Availability; label: string }[] = [
  { key: "available", label: "Available" },
  { key: "busy", label: "Busy" },
  { key: "away", label: "Away" },
  { key: "on_break", label: "On break" },
  { key: "offline", label: "Offline" },
];

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  available: "Available",
  busy: "Busy",
  away: "Away",
  on_break: "On break",
  offline: "Offline",
  unavailable: "Unavailable",
};

export interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
}

export interface SupportMessage {
  id: string;
  senderType: "student" | "ai" | "agent" | "system";
  senderName: string;
  content: string;
  messageType: "text" | "system" | "handoff";
  createdAt: string;
  attachments: Attachment[];
}

export interface TicketSummary {
  id: string;
  referenceNumber: string;
  title: string;
  category: string;
  categoryLabel: string;
  affectedModule: string;
  moduleLabel: string;
  priority: Priority;
  status: TicketStatus;
  ownershipType: Ownership;
  studentId: string;
  studentName: string;
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  waitingSince: string | null;
  blocksExam: boolean;
  rating: number | null;
}

export interface AIAnalysis {
  category: string;
  subcategory: string | null;
  priority: Priority;
  priorityReason: string;
  severity: "critical" | "major" | "moderate" | "minor";
  issueSummary: string;
  suggestedDepartment: string;
  requiredExpertise: string[];
  recommendedStaffId: string | null;
  recommendedStaffName: string | null;
  confidence: number;
  blocksExam: boolean;
  recurring: boolean;
  generatedBy: "llm" | "rules";
  createdAt: string;
}

export interface AssignmentInfo {
  id: string;
  staffId: string;
  staffName: string;
  status: "pending" | "accepted" | "timed_out" | "reassigned" | "released";
  assignedAt: string;
  acceptedAt: string | null;
  timeoutAt: string | null;
  score: number | null;
  reason: string | null;
}

export interface InternalNote {
  id: string;
  staffId: string;
  staffName: string;
  content: string;
  kind: "note" | "verified_finding";
  createdAt: string;
}

export interface TicketPermissions {
  canAccept: boolean;
  canReassign: boolean;
  canResolve: boolean;
  canEscalate: boolean;
  canChangePriority: boolean;
  canReturnToAi: boolean;
  canMessage: boolean;
  isSupervisor: boolean;
}

export interface TicketDetail extends TicketSummary {
  description: string;
  subcategory: string | null;
  severity: string | null;
  urgency: Urgency;
  department: string;
  resolution: string | null;
  resolvedAt: string | null;
  reopenCount: number;
  canReopen: boolean;
  messages: SupportMessage[];
  attachments: Attachment[];
  ratingComment: string | null;
  assignment?: AssignmentInfo | null;
  assignmentHistory?: AssignmentInfo[];
  aiAnalysis?: AIAnalysis | null;
  internalNotes?: InternalNote[];
  permissions?: TicketPermissions;
}

export interface WorkingHours {
  timezone: string;
  days: number[];
  start: string;
  end: string;
}

export interface StaffProfile {
  id: string;
  userId: string;
  name: string;
  email: string;
  supportRole: "agent" | "supervisor";
  availability: Availability;
  isOnline: boolean;
  lastSeenAt: string | null;
  assignmentsEnabled: boolean;
  maxActiveTickets: number;
  activeTickets: number;
  pendingTickets: number;
  workloadPercent: number;
  expertise: string[];
  workingHours: WorkingHours | null;
  avgResolutionMinutes: number | null;
  avgFirstResponseMinutes: number | null;
  resolvedCount: number;
  lastAssignedAt: string | null;
}

export type QueueView =
  | "all"
  | "mine"
  | "unassigned"
  | "ai"
  | "pending_acceptance"
  | "in_progress"
  | "waiting_student"
  | "escalated"
  | "resolved";

export type QueueCounts = Record<QueueView, number>;

export type QueueSort = "priority" | "oldest" | "newest" | "waiting";

export interface QueueResponse {
  tickets: TicketSummary[];
  counts: QueueCounts;
  me: StaffProfile | null;
}

export interface CopilotResult {
  suggestedReply: string;
  rootCauses: Array<{ cause: string; likelihood: "likely" | "possible" }>;
  steps: string[];
  articles: Array<{ id: string; title: string }>;
  similarTickets: Array<{ id: string; referenceNumber: string; title: string; resolution: string | null }>;
  recommendedEscalation: string | null;
  resolutionSummaryDraft: string;
  generatedBy: "llm" | "rules";
  disclaimer: string;
}

export interface ClientDiagnostics {
  browser: string;
  browserVersion: string;
  os: string;
  deviceType: "desktop" | "tablet" | "phone";
  screen: string;
  viewport: string;
  language: string;
  timezone: string;
  online: boolean;
  connection: { effectiveType?: string; downlink?: number; rtt?: number } | null;
  cameraPermission: "granted" | "denied" | "prompt" | "unknown";
  microphonePermission: "granted" | "denied" | "prompt" | "unknown";
  webrtcSupported: boolean;
  socketConnected: boolean | null;
  appVersion: string;
  recentFailedRequests: Array<{ path: string; status: number; at: string }>;
  collectedAt: string;
}

export interface StudentContext {
  profile: {
    name: string;
    studentId: string | null;
    email: string;
    institution: string | null;
    department: string | null;
    branch: string | null;
    semester: string | null;
    section: string | null;
    accountCreatedAt: string;
    emailVerified: boolean;
    enrolmentVerification: string;
    accountStatus: string;
  };
  origin: {
    path: string[];
    sourcePortal: string;
    affectedModule: string;
    category: string;
    priority: Priority;
    status: TicketStatus;
    createdAt: string;
    description: string;
    attachments: Attachment[];
    aiSummary: string | null;
    aiCategory: string | null;
  };
  exam: null | {
    attemptId: string;
    assessmentId: string;
    title: string;
    course: string | null;
    scheduledStart: string | null;
    scheduledEnd: string | null;
    durationMinutes: number;
    startedAt: string;
    submittedAt: string | null;
    attemptStatus: string;
    proctoringStatus: string;
    remainingSeconds: number | null;
    isOnline: boolean;
    lastHeartbeatAt: string | null;
    lastFrameAt: string | null;
    networkQuality: string | null;
    faceStatus: string | null;
    warningCount: number;
    events: Array<{ at: string; event: string; details: string | null }>;
  };
  diagnostics: {
    client: ClientDiagnostics | null;
    server: {
      lastLoginAt: string | null;
      lastLoginUserAgent: string | null;
      lastHeartbeatAt: string | null;
      socketOnline: boolean;
    };
  };
  activity: Array<{
    at: string;
    type: string;
    label: string;
    detail: string | null;
    source: "student" | "system" | "ai" | "staff";
  }>;
  provenance: { profile: "system"; origin: "student"; exam: "system"; diagnostics: "automatic"; ai: "ai" };
}

export interface SupportSettings {
  weights: { workload: number; expertise: number; availability: number; performance: number; recency: number };
  acceptanceTimeoutSeconds: number;
  allowOfflineAssignment: boolean;
  reassignAlertThreshold: number;
}

export interface AnalyticsData {
  range: { from: string; to: string };
  totals: {
    total: number;
    today: number;
    pending: number;
    aiHandled: number;
    humanHandled: number;
    unassigned: number;
    resolved: number;
    escalated: number;
  };
  avgFirstResponseMinutes: number | null;
  avgResolutionMinutes: number | null;
  slaCompliancePercent: number | null;
  byCategory: Array<{ category: string; label: string; count: number }>;
  byPriority: Array<{ priority: Priority; count: number }>;
  staffWorkload: Array<{
    staffId: string;
    name: string;
    active: number;
    pending: number;
    max: number;
    resolved: number;
    availability: Availability;
    isOnline: boolean;
  }>;
  reassignmentRate: number | null;
  aiResolutionRate: number | null;
  satisfaction: { average: number | null; count: number };
}

export interface KbArticle {
  id: string;
  title: string;
  category: string;
  summary: string;
  body: string;
  visibility: "public" | "internal";
  tags: string[];
  updatedAt: string;
}

export interface SupportNotification {
  id: string;
  title: string;
  description: string;
  ticketId?: string;
  priority?: Priority | string;
  at: string;
  read: boolean;
}

export type HubSection =
  | "overview"
  | "queue"
  | "mine"
  | "unassigned"
  | "ai"
  | "escalated"
  | "resolved"
  | "staff"
  | "analytics"
  | "kb"
  | "settings";

/** Queue sections → backend `view` parameter. */
export const SECTION_VIEW: Partial<Record<HubSection, QueueView>> = {
  queue: "all",
  mine: "mine",
  unassigned: "unassigned",
  ai: "ai",
  escalated: "escalated",
  resolved: "resolved",
};

export function categoryLabel(key: string | null | undefined): string {
  if (!key) return "—";
  return SUPPORT_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}
