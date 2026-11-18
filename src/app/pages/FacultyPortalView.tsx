import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import {
  BookOpen,
  LayoutDashboard,
  PlusCircle,
  Video,
  FileCheck,
  BarChart3,
  LogOut,
  Bell,
  Settings,
  Shield,
  Clock,
  CheckCircle,
  AlertTriangle,
  User,
  Trash2,
  Lock,
  Eye,
  Camera,
  Play,
  Check,
  MessageSquare,
  Sparkles,
  Zap,
  RefreshCw,
  FileSpreadsheet,
} from "lucide-react";
import SectionResults, { type CompletionEvent } from "../components/faculty/SectionResults";
import { analyzeLiveSessionWithGroq, GROQ_MODEL, type LiveSessionGroqAnalysis } from "../services/groq-service";
import { toast } from "sonner";
import SessionRecordingPlayer from "../components/SessionRecordingPlayer";
import LiveVideoWall from "../components/LiveVideoWall";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
  AreaChart,
  Area
} from "recharts";
import imgAssessmentIntegrityLogo from "../../imports/LoginPortalIntegrityOs/assessment_integrity_logo.png";
import { NotificationCenter } from "../components/NotificationCenter";
import { SidebarProvider, SidebarTrigger } from "../components/ui/sidebar";
import { PortalSidebar } from "../components/PortalSidebar";
import { FacultySectionsChip, FacultySectionsGate } from "../components/FacultySections";
import { openSettings } from "../settings/SettingsCenter";
import { readPreferences, usePreferences } from "../settings/preferences";
import { FacultyMessagingView } from "./FacultyMessagingView";
import { FacultyAIChat } from "../components/faculty/FacultyAIChat";
import { createAuthedSocket, joinRoom } from "../utils/socket-client";

interface FacultyPortalViewProps {
  user: any;
  session: any;
  handleLogout: () => void;
}

type WindowState = "draft" | "scheduled" | "live" | "closed";

/** Where an assessment sits in its availability window right now. */
function getWindowState(a: { published?: boolean; availabilityStart?: string | null; availabilityEnd?: string | null }): WindowState {
  if (!a.published) return "draft";
  const now = Date.now();
  if (a.availabilityStart && new Date(a.availabilityStart).getTime() > now) return "scheduled";
  if (a.availabilityEnd && new Date(a.availabilityEnd).getTime() < now) return "closed";
  return "live";
}

const WINDOW_BADGE: Record<WindowState, { label: string; cls: string }> = {
  live: { label: "Live", cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  scheduled: { label: "Scheduled", cls: "text-sky-700 bg-sky-50 border-sky-200" },
  closed: { label: "Closed", cls: "text-zinc-600 bg-zinc-50 border-zinc-200" },
  draft: { label: "Draft", cls: "text-amber-600 bg-amber-50 border-amber-100" },
};

const shortDate = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : null;

export default function FacultyPortalView({ user, session, handleLogout }: FacultyPortalViewProps) {
  const [activeTab, setActiveTab] = useState("Overview");
  
  // State for assessments list
  const [assessments, setAssessments] = useState<any[]>([]);
  const [lastCompletion, setLastCompletion] = useState<CompletionEvent | null>(null);

  // Live "student completed" notices for this faculty member (server sends
  // them only for students in the faculty's own sections).
  useEffect(() => {
    const socket = createAuthedSocket();
    socket.on("assessment-completed", (d: Omit<CompletionEvent, "at"> & { assessmentTitle?: string }) => {
      setLastCompletion({ ...d, at: Date.now() });
      toast.success(
        `${d.registrationNumber || d.studentName} · ${d.studentName} (${d.section}) completed "${d.assessmentTitle ?? "an assessment"}".`,
        {
          action: { label: "View results", onClick: () => setActiveTab("Section Results") },
          duration: 8000,
        },
      );
    });
    return () => {
      socket.disconnect();
    };
  }, []);
  const [isLoading, setIsLoading] = useState(true);

  // Assessment Builder States
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newDuration, setNewDuration] = useState("60");
  const [newGrading, setNewGrading] = useState("points");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [newLimit, setNewLimit] = useState("1");
  const [questions, setQuestions] = useState<any[]>([]);

  // Shield integrity controls (initial values come from Settings → Examination rules)
  const examDefaults = readPreferences(user.id).examDefaults;
  const [shieldWebcam, setShieldWebcam] = useState(examDefaults.webcam);
  const [shieldMic, setShieldMic] = useState(examDefaults.mic);
  const [shieldLockdown, setShieldLockdown] = useState(examDefaults.lockdown);
  const [shieldFace, setShieldFace] = useState(examDefaults.face);
  const [shieldGaze, setShieldGaze] = useState(examDefaults.gaze);
  const [shieldTab, setShieldTab] = useState(examDefaults.tab);
  const [shieldBehavior, setShieldBehavior] = useState(examDefaults.behavior);

  // Resume & Attempt controls states
  const [shieldAllowResume, setShieldAllowResume] = useState(examDefaults.allowResume);
  const [shieldMaxResumeCount, setShieldMaxResumeCount] = useState(examDefaults.maxResumeCount);
  const [shieldResumeTimeWindow, setShieldResumeTimeWindow] = useState(examDefaults.resumeTimeWindow);
  const [shieldResumeAfterDisconnect, setShieldResumeAfterDisconnect] = useState(examDefaults.resumeAfterDisconnect);
  const [shieldResumeAfterCrash, setShieldResumeAfterCrash] = useState(examDefaults.resumeAfterCrash);
  const [shieldResumeAfterLogout, setShieldResumeAfterLogout] = useState(examDefaults.resumeAfterLogout);
  const [shieldRetakeAllowed, setShieldRetakeAllowed] = useState(false);
  const [shieldRetakeDate, setShieldRetakeDate] = useState("");
  const [shieldAttemptLock, setShieldAttemptLock] = useState(examDefaults.attemptLock);
  const [shieldLateSubmission, setShieldLateSubmission] = useState(examDefaults.lateSubmission);

  // Re-apply defaults when they're changed in Settings while this portal is open.
  const { prefs: livePrefs } = usePreferences(user.id);
  const isFirstDefaultsRun = React.useRef(true);
  useEffect(() => {
    if (isFirstDefaultsRun.current) {
      isFirstDefaultsRun.current = false;
      return;
    }
    const d = livePrefs.examDefaults;
    setShieldWebcam(d.webcam);
    setShieldMic(d.mic);
    setShieldLockdown(d.lockdown);
    setShieldFace(d.face);
    setShieldGaze(d.gaze);
    setShieldTab(d.tab);
    setShieldBehavior(d.behavior);
    setShieldAllowResume(d.allowResume);
    setShieldMaxResumeCount(d.maxResumeCount);
    setShieldResumeTimeWindow(d.resumeTimeWindow);
    setShieldResumeAfterDisconnect(d.resumeAfterDisconnect);
    setShieldResumeAfterCrash(d.resumeAfterCrash);
    setShieldResumeAfterLogout(d.resumeAfterLogout);
    setShieldAttemptLock(d.attemptLock);
    setShieldLateSubmission(d.lateSubmission);
  }, [livePrefs.examDefaults]);

  // Active proctoring selection
  const [proctorId, setProctorId] = useState<string | null>(null);
  const [proctorAttempts, setProctorAttempts] = useState<any[]>([]);
  const [groqAudits, setGroqAudits] = useState<Record<string, LiveSessionGroqAnalysis>>({});
  const [analyzingAttemptId, setAnalyzingAttemptId] = useState<string | null>(null);
  const [useFacultyDemoProctor, setUseFacultyDemoProctor] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [proctorFilter, setProctorFilter] = useState<"all" | "attention" | "offline">("all");
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const handleGroqAuditAttempt = async (att: any) => {
    setAnalyzingAttemptId(att.id);
    try {
      const res = await analyzeLiveSessionWithGroq({
        id: att.id,
        studentName: att.studentName || "Candidate",
        exam: assessments.find((a) => a.id === (att.assessmentId || proctorId))?.title || "Exam Session",
        score: att.integrityScore ?? 100,
        status: att.proctoringStatus || att.status || "started",
        alerts: att.violations?.length || 0,
        faceStatus: att.faceStatus || "Detected",
        violations: att.violations?.map((v: any) => v.description || v.type) || [],
        breakdown: att.breakdown,
      });
      setGroqAudits((prev) => ({ ...prev, [att.id]: res }));
      toast.success(`Groq AI Audit for ${att.studentName}: Threat ${res.threatLevel} (${res.riskPercentage}% risk)`);
    } catch {
      toast.error("Failed to complete Groq live session audit.");
    } finally {
      setAnalyzingAttemptId(null);
    }
  };
  
  // Evaluation Queue selection
  const [evalId, setEvalId] = useState<string | null>(null);
  const [evalAttempts, setEvalAttempts] = useState<any[]>([]);
  const [selectedAttempt, setSelectedAttempt] = useState<any | null>(null);
  const [manualGrades, setManualGrades] = useState<Record<string, { manualGrade: number; feedback: string; overrideStatus: string }>>({});
  const [auditId, setAuditId] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [isAuditLoading, setIsAuditLoading] = useState(false);
  const [isReevaluating, setIsReevaluating] = useState(false);

  // Analytics selection
  const [analyticsId, setAnalyticsId] = useState<string | null>(null);
  const [analyticsData, setAnalyticsData] = useState<any | null>(null);

  // Fetch assessments from DB
  const fetchAssessments = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/assessments", {
        headers: { "x-user-id": user.id, "x-user-role": "faculty" }
      });
      if (res.ok) {
        const data = await res.json();
        setAssessments(data.data || []);
      }
    } catch (err) {
      console.error("Failed to load assessments:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAssessments();
  }, [user.id]);

  // Opening Proctoring with nothing selected jumps straight to the first assessment that is open now.
  useEffect(() => {
    if (activeTab !== "Proctoring" || proctorId || assessments.length === 0) return;
    const target = assessments.find((a) => getWindowState(a) === "live") || assessments.find((a) => a.published);
    if (target) setProctorId(target.id);
  }, [activeTab, proctorId, assessments]);

  // Periodic polling for proctoring dashboard
  useEffect(() => {
    if (activeTab !== "Proctoring" || !proctorId) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/assessments/${proctorId}/attempts`, {
          headers: { "x-user-id": user.id, "x-user-role": "faculty" }
        });
        if (res.ok) {
          const data = await res.json();
          setProctorAttempts(data.data || []);
        }
      } catch (err) {
        console.error("Proctoring poll error:", err);
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [activeTab, proctorId, user.id]);

  // Ticking clock so "last frame Xs ago" and stale-agent badges stay current
  useEffect(() => {
    if (activeTab !== "Proctoring") return;
    const t = setInterval(() => setNowTick(Date.now()), 5000);
    return () => clearInterval(t);
  }, [activeTab]);

  // Listen for real-time WebSocket proctor updates (authenticated; the server
  // only admits the assessment owner or an admin to this room)
  useEffect(() => {
    if (!proctorId) return;
    const roomId = `assessment-proctoring-${proctorId}`;
    const socket = createAuthedSocket();

    socket.on("connect", async () => {
      const ok = await joinRoom(socket, roomId);
      if (!ok) toast.error("You are not authorized to monitor this assessment.");
    });

    const patchAttempt = (attemptId: string, patch: Record<string, any>) => {
      setProctorAttempts((prev) => {
        const idx = prev.findIndex((att) => att.id === attemptId);
        if (idx === -1) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], ...patch };
        return next;
      });
    };

    socket.on("attempt-update", (updatedAttempt: any) => {
      setProctorAttempts((prev) => {
        const idx = prev.findIndex((att) => att.id === updatedAttempt.id);
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = { ...next[idx], ...updatedAttempt };
          return next;
        }
        return prev;
      });
    });

    socket.on("proctor-telemetry", (telemetry: any) => {
      const patch: Record<string, any> = {
        warningCount: telemetry.warningCount,
        proctoringStatus: telemetry.proctoringStatus,
        activeViolations: telemetry.activeViolations,
      };
      if (telemetry.integrityScore !== undefined) patch.integrityScore = telemetry.integrityScore;
      // The server sends the dimension scores as `metrics`.
      if (telemetry.metrics) patch.breakdown = telemetry.metrics;
      if (telemetry.correlatedIncidents) patch.correlatedIncidents = telemetry.correlatedIncidents;
      if (telemetry.agentHealth) patch.agentHealth = telemetry.agentHealth;
      if (telemetry.faceStatus) patch.faceStatus = telemetry.faceStatus;
      if (telemetry.lastFrameAt) patch.lastFrameAt = telemetry.lastFrameAt;
      if (telemetry.lastHeartbeatAt) patch.lastHeartbeatAt = telemetry.lastHeartbeatAt;
      if (telemetry.isOnline !== undefined) patch.isOnline = telemetry.isOnline;
      if (telemetry.requiresHumanReview !== undefined) patch.requiresHumanReview = telemetry.requiresHumanReview;
      patchAttempt(telemetry.attemptId, patch);
    });

    socket.on("student-online", (data: any) => {
      patchAttempt(data.attemptId, { isOnline: true, lastHeartbeatAt: data.lastHeartbeatAt });
      toast.info(`${data.studentName} ${data.reconnected ? "reconnected to" : "joined"} the proctored session.`);
    });

    socket.on("student-offline", (data: any) => {
      patchAttempt(data.attemptId, {
        isOnline: false,
        ...(data.status ? { proctoringStatus: data.status } : {}),
      });
      if (data.status !== "SUBMITTED") {
        toast.warning(`${data.studentName || "A candidate"} disconnected from the proctored session.`);
      }
    });

    return () => {
      socket.emit("leave-room", roomId);
      socket.disconnect();
    };
  }, [proctorId]);

  // Faculty control actions: surface server rejections instead of assuming success
  const runProctorAction = async (
    action: "warning" | "pause" | "resume" | "terminate",
    att: any,
    body: Record<string, unknown> = {},
  ) => {
    setPendingAction(`${action}:${att.id}`);
    try {
      const res = await fetch(`/api/ai-proctoring/faculty/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId: att.id, ...body }),
      });
      if (!res.ok) {
        let msg = `Could not ${action} this exam.`;
        try {
          msg = (await res.json())?.message || msg;
        } catch {}
        toast.error(msg);
        return;
      }
      const label = { warning: "Warning sent to", pause: "Exam paused for", resume: "Exam resumed for", terminate: "Exam terminated for" }[action];
      toast.success(`${label} ${att.studentName}.`);
    } catch {
      toast.error("Network error. The action was not applied.");
    } finally {
      setPendingAction(null);
    }
  };

  // Fetch attempts for evaluation
  useEffect(() => {
    if (evalId) {
      const getAttempts = async () => {
        const res = await fetch(`/api/assessments/${evalId}/attempts`, {
          headers: { "x-user-id": user.id, "x-user-role": "faculty" }
        });
        if (res.ok) {
          const data = await res.json();
          setEvalAttempts(data.data || []);
        }
      };
      getAttempts();
    }
  }, [evalId, user.id]);

  // Fetch analytics data
  useEffect(() => {
    if (analyticsId) {
      const getAnalytics = async () => {
        const res = await fetch(`/api/assessments/${analyticsId}/analytics`, {
          headers: { "x-user-id": user.id, "x-user-role": "faculty" }
        });
        if (res.ok) {
          const data = await res.json();
          setAnalyticsData(data.data || null);
        }
      };
      getAnalytics();
    }
  }, [analyticsId, user.id]);

  // Fetch audit logs
  useEffect(() => {
    if (auditId) {
      const getAuditLogs = async () => {
        setIsAuditLoading(true);
        try {
          const res = await fetch(`/api/assessments/${auditId}/audit-trail`, {
            headers: { "x-user-id": user.id, "x-user-role": "faculty" }
          });
          if (res.ok) {
            const data = await res.json();
            setAuditLogs(data.data || []);
          }
        } catch (err) {
          console.error("Failed to load audit logs:", err);
        } finally {
          setIsAuditLoading(false);
        }
      };
      getAuditLogs();
    }
  }, [auditId, user.id]);

  // Handle assessment submission
  const handleCreateAssessment = async () => {
    if (!newTitle.trim()) {
      toast.error("Please enter a title.");
      return;
    }
    if (questions.length === 0) {
      toast.error("Please add at least one question.");
      return;
    }

    try {
      const payload = {
        title: newTitle,
        description: newDesc,
        duration: Number(newDuration),
        gradingScheme: newGrading,
        availabilityStart: newStart || null,
        availabilityEnd: newEnd || null,
        attemptLimit: Number(newLimit),
        webcamMonitoring: shieldWebcam,
        microphoneAnalysis: shieldMic,
        browserLockdown: shieldLockdown,
        faceVerification: shieldFace,
        gazeTracking: shieldGaze,
        tabSwitchDetection: shieldTab,
        behavioralAnalysis: shieldBehavior,
        allowResume: shieldAllowResume,
        maxResumeCount: Number(shieldMaxResumeCount),
        resumeTimeWindow: Number(shieldResumeTimeWindow),
        resumeAfterDisconnect: shieldResumeAfterDisconnect,
        resumeAfterCrash: shieldResumeAfterCrash,
        resumeAfterLogout: shieldResumeAfterLogout,
        retakeAllowed: shieldRetakeAllowed,
        retakeDate: shieldRetakeDate || null,
        attemptLock: shieldAttemptLock,
        lateSubmissionAllowed: shieldLateSubmission,
        questions: questions.map((q) => ({
          type: q.type,
          text: q.text,
          options: q.options,
          correctAnswer: q.correctAnswer,
          points: Number(q.points),
          difficulty: q.difficulty,
          learningOutcome: q.learningOutcome
        }))
      };

      const res = await fetch("/api/assessments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id,
          "x-user-role": "faculty"
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        toast.success("Assessment created successfully!");
        // Reset states
        setNewTitle("");
        setNewDesc("");
        setQuestions([]);
        fetchAssessments();
        setActiveTab("Overview");
      } else {
        const data = await res.json();
        toast.error(data.message || "Failed to create assessment.");
      }
    } catch (err) {
      toast.error("An error occurred.");
    }
  };

  const handleLoadSample = async () => {
    try {
      const payload = {
        title: "Data Structures & Algorithms Midterm",
        description: "Midterm examination covering balanced trees, hashing, and sorting algorithms.",
        duration: 60,
        availabilityStart: null,
        availabilityEnd: null,
        attemptLimit: 1,
        gradingScheme: "points",
        webcamMonitoring: true,
        microphoneAnalysis: true,
        browserLockdown: true,
        faceVerification: true,
        gazeTracking: true,
        tabSwitchDetection: true,
        behavioralAnalysis: true,
        questions: [
          {
            type: "multiple-choice",
            text: "What is the worst-case time complexity of searching in a Balanced Binary Search Tree (e.g. AVL Tree)?",
            options: ["O(1)", "O(log n)", "O(n)", "O(n log n)"],
            correctAnswer: "O(log n)",
            points: 5,
            difficulty: "medium",
            learningOutcome: "CLO-1"
          },
          {
            type: "descriptive",
            text: "Explain the difference between a Hash Map and a Binary Search Tree. When would you prefer one over the other?",
            options: null,
            correctAnswer: "A Hash Map provides O(1) average time complexity for lookups, but does not keep elements sorted. A Binary Search Tree provides O(log n) lookups and keeps elements in sorted order.",
            points: 10,
            difficulty: "medium",
            learningOutcome: "CLO-2"
          },
          {
            type: "coding",
            text: "Write a function that takes a list of integers and returns the first duplicate element. If no duplicate exists, return null.",
            options: null,
            correctAnswer: "def find_duplicate(nums):\n    seen = set()\n    for num in nums:\n        if num in seen:\n            return num\n        seen.add(num)\n    return None",
            points: 15,
            difficulty: "hard",
            learningOutcome: "CLO-3"
          }
        ]
      };

      toast.loading("Creating sample assessment...", { id: "sample-loader" });
      const res = await fetch("/api/assessments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id,
          "x-user-role": "faculty"
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        toast.success("Sample assessment created successfully!", { id: "sample-loader" });
        fetchAssessments();
      } else {
        const data = await res.json();
        toast.error(data.message || "Failed to create sample assessment.", { id: "sample-loader" });
      }
    } catch (err) {
      toast.error("An error occurred.", { id: "sample-loader" });
    }
  };

  const handlePublish = async (id: string) => {
    try {
      const res = await fetch(`/api/assessments/${id}/publish`, {
        method: "POST",
        headers: { "x-user-id": user.id, "x-user-role": "faculty" }
      });
      if (res.ok) {
        toast.success("Assessment published successfully! Students can now access it.");
        fetchAssessments();
      } else {
        toast.error("Failed to publish.");
      }
    } catch {
      toast.error("An error occurred.");
    }
  };

  // Add a new empty question to the list
  const addQuestion = (type: string) => {
    setQuestions([
      ...questions,
      {
        id: Math.random().toString(),
        type,
        text: "",
        options: type === "multiple-choice" ? ["Option A", "Option B", "Option C", "Option D"] : null,
        correctAnswer: "",
        points: 5,
        difficulty: "medium",
        learningOutcome: "CLO-" + (questions.length + 1)
      }
    ]);
  };

  // Update question option content
  const updateOption = (qIdx: number, optIdx: number, val: string) => {
    const updated = [...questions];
    updated[qIdx].options[optIdx] = val;
    setQuestions(updated);
  };

  const updateQuestionField = (idx: number, field: string, val: any) => {
    const updated = [...questions];
    updated[idx][field] = val;
    setQuestions(updated);
  };

  const removeQuestion = (idx: number) => {
    setQuestions(questions.filter((_, i) => i !== idx));
  };

  // Select attempt to evaluate
  const loadAttemptDetails = async (attemptId: string) => {
    try {
      const res = await fetch(`/api/assessments/attempts/${attemptId}`, {
        headers: { "x-user-id": user.id, "x-user-role": "faculty" }
      });
      if (res.ok) {
        const data = await res.json();
        const details = data.data;
        setSelectedAttempt(details);
        
        // Pre-fill manual grades map
        const grades: Record<string, { manualGrade: number; feedback: string; overrideStatus: string }> = {};
        details.answers.forEach((ans: any) => {
          grades[ans.id] = {
            manualGrade: ans.manualGrade !== null ? ans.manualGrade : (ans.aiGrade || 0),
            feedback: ans.feedback || "",
            overrideStatus: ans.overrideStatus || "none"
          };
        });
        setManualGrades(grades);
      }
    } catch {
      toast.error("Failed to load attempt details.");
    }
  };

  const handleEvaluateSubmit = async () => {
    if (!selectedAttempt) return;

    try {
      const gradesPayload = Object.entries(manualGrades).map(([answerId, data]) => ({
        answerId,
        manualGrade: data.manualGrade,
        feedback: data.feedback,
        overrideStatus: (data as any).overrideStatus || "none"
      }));

      const res = await fetch(`/api/assessments/attempts/${selectedAttempt.id}/evaluate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id,
          "x-user-role": "faculty"
        },
        body: JSON.stringify({ grades: gradesPayload })
      });

      if (res.ok) {
        toast.success("Evaluation saved and marks finalized!");
        setSelectedAttempt(null);
        // Refresh attempts list
        if (evalId) {
          const resAtt = await fetch(`/api/assessments/${evalId}/attempts`, {
            headers: { "x-user-id": user.id, "x-user-role": "faculty" }
          });
          if (resAtt.ok) {
            const data = await resAtt.json();
            setEvalAttempts(data.data || []);
          }
        }
      } else {
        toast.error("Failed to save evaluation.");
      }
    } catch {
      toast.error("An error occurred.");
    }
  };

  const handleReevaluate = async () => {
    if (!selectedAttempt) return;
    setIsReevaluating(true);
    toast.loading("Re-running AI agents & calculating confidence...", { id: "reeval-loader" });
    try {
      const res = await fetch(`/api/assessments/attempts/${selectedAttempt.id}/re-evaluate`, {
        method: "POST",
        headers: {
          "x-user-id": user.id,
          "x-user-role": "faculty"
        }
      });
      if (res.ok) {
        toast.success("AI Re-evaluation complete!", { id: "reeval-loader" });
        await loadAttemptDetails(selectedAttempt.id);
      } else {
        toast.error("Failed to re-evaluate.", { id: "reeval-loader" });
      }
    } catch {
      toast.error("An error occurred.", { id: "reeval-loader" });
    } finally {
      setIsReevaluating(false);
    }
  };

  const COLORS = ["#10B981", "#F59E0B", "#EF4444", "#3B82F6"];

  return (
    <SidebarProvider className="min-h-screen bg-[#ffffff] text-[#1a1917] font-sans w-full overflow-x-hidden">
      <PortalSidebar
        portalLabel="Faculty portal"
        active={activeTab}
        onSelect={setActiveTab}
        user={{ name: user?.name, email: user?.email, image: user?.image, roleLabel: "Faculty" }}
        onSignOut={handleLogout}
        onOpenSettings={() => openSettings()}
        groups={[
          {
            label: "Teaching",
            items: [
              { id: "Overview", label: "Overview", icon: LayoutDashboard },
              { id: "Messages", label: "Messages", icon: MessageSquare },
              { id: "AI Assistant", label: "AI Assistant", icon: Sparkles },
            ],
          },
          {
            label: "Assessments",
            items: [
              { id: "Assessment Builder", label: "Assessment Builder", icon: PlusCircle },
              { id: "Proctoring", label: "Proctoring", icon: Video },
              { id: "Evaluation Queue", label: "Evaluation Queue", icon: FileCheck },
              { id: "Section Results", label: "Section Results", icon: FileSpreadsheet },
            ],
          },
          {
            label: "Insights",
            items: [
              { id: "Analytics Hub", label: "Analytics Hub", icon: BarChart3 },
              { id: "Audit Trails", label: "Audit Trails", icon: Shield },
            ],
          },
        ]}
      />

      {/* First-run: faculty must pick the 1–3 sections they teach */}
      <FacultySectionsGate />

      {/* Main Workspace Frame */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-[#dedede] bg-white/70 backdrop-blur-md px-6 md:px-8 flex items-center justify-between sticky top-0 z-20">
          <div className="flex min-w-0 items-center gap-3">
            <SidebarTrigger className="-ml-2 size-9 shrink-0 rounded-lg" />
            <div className="truncate text-[13.5px] font-semibold text-[#676767]">
              University: <span className="text-[#1a1917] font-bold">{user.institutionName || "SRM University AP"}</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <FacultySectionsChip />
            <NotificationCenter />
            <button
              type="button"
              onClick={() => openSettings()}
              aria-label="Open settings"
              title="Settings"
              className="p-2 rounded-xl text-[#676767] hover:bg-[#f6f6f6] hover:text-[#1a1917] transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#b2b2b2]"
            >
              <Settings className="size-5" />
            </button>
            <div
              className="flex items-center gap-3 border-l border-[#dedede] pl-4 cursor-pointer group"
              onClick={() => window.dispatchEvent(new CustomEvent("open-profile-drawer"))}
            >
              <div className="text-right hidden sm:block">
                <div className="text-[13.5px] font-bold leading-tight text-[#1a1917] group-hover:text-zinc-600 transition-colors">{user.name}</div>
                <div className="text-[11px] font-semibold text-[#8a8a8a] leading-none mt-0.5">Faculty Administrator</div>
              </div>
              <div className="w-9 h-9 rounded-full bg-[#1a1917] border border-[#b2b2b2] text-white flex items-center justify-center font-bold text-sm group-hover:scale-105 transition-all">
                {user.name ? user.name.charAt(0).toUpperCase() : "F"}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-6 md:p-8 space-y-6 overflow-y-auto">
          {/* TAB 1: OVERVIEW */}
          {activeTab === "Overview" && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">Portal Overview</h1>
                  <p className="text-xs text-[#8a8a8a]">Manage exams, proctor live sessions, and review submissions.</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleLoadSample}
                    className="bg-[#f6f6f6] border border-[#dedede] text-[#1a1917] hover:bg-[#e6e6e6] px-4 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all cursor-pointer flex items-center gap-2"
                  >
                    Load Sample Assessment
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("Assessment Builder")}
                    className="bg-[#1a1917] text-white hover:bg-black px-4 py-2 rounded-xl text-xs font-semibold shadow transition-all cursor-pointer flex items-center gap-2"
                  >
                    <PlusCircle className="size-4" /> Create Assessment
                  </button>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {[
                  { title: "Total Assessments", value: assessments.length, footer: "Exams & Quizzes" },
                  { title: "Live Now", value: assessments.filter((a) => getWindowState(a) === "live").length, footer: "Published and open to students", valueColor: "text-emerald-600" },
                  { title: "Draft Exams", value: assessments.filter((a) => !a.published).length, footer: "In creation phase", valueColor: "text-amber-500" },
                  { title: "Total Attempts", value: assessments.reduce((sum, a) => sum + (a._count?.attempts || 0), 0), footer: "Across all assessments", valueColor: "text-zinc-800" }
                ].map((stat, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.05 }}
                    whileHover={{ y: -4, scale: 1.025, boxShadow: "0 10px 20px -5px rgba(128,128,128,0.12), 0 0 0 1px rgba(178, 178, 178, 0.3)", borderColor: "rgba(178, 178, 178, 0.5)" }}
                    className="bg-white border border-[#dedede] rounded-2xl p-5 shadow-sm transition-all duration-300"
                  >
                    <span className="text-[11px] font-bold text-[#8a8a8a] uppercase tracking-wider">{stat.title}</span>
                    <div className={`text-3xl font-extrabold mt-1 ${stat.valueColor || "text-zinc-950"}`}>{stat.value}</div>
                    <span className="text-[11.5px] text-[#676767] mt-1.5 block">{stat.footer}</span>
                  </motion.div>
                ))}
              </div>

              {/* Assessments List Table */}
              <div className="bg-white border border-[#dedede] rounded-2xl p-5 shadow-sm">
                <h3 className="text-base font-bold mb-4">Assessments Inventory</h3>
                {isLoading ? (
                  <div className="py-10 text-center text-[#8a8a8a]">Loading...</div>
                ) : assessments.length === 0 ? (
                  <div className="py-12 text-center text-[#8a8a8a] border border-dashed border-[#dedede] rounded-xl flex flex-col items-center justify-center gap-4 bg-[#f6f6f6]/30">
                    <span>No assessments created yet. Start by building one or load a pre-configured sample assessment!</span>
                    <button
                      type="button"
                      onClick={handleLoadSample}
                      className="bg-[#1a1917] text-white hover:bg-black px-4 py-2 rounded-xl text-xs font-semibold shadow transition-all cursor-pointer"
                    >
                      Load Sample Assessment
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b border-[#dedede]/50 text-left text-xs font-bold text-[#8a8a8a] uppercase">
                          <th className="pb-3">Title</th>
                          <th className="pb-3">Duration</th>
                          <th className="pb-3">Questions</th>
                          <th className="pb-3">Attempts</th>
                          <th className="pb-3">Status</th>
                          <th className="pb-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#dedede]/30">
                        {assessments.map((a) => (
                          <tr key={a.id} className="hover:bg-[#f6f6f6]/30 transition-colors">
                            <td className="py-4 text-sm font-bold text-[#1a1917]">
                              {a.title}
                              {a.description && <span className="block text-xs font-normal text-[#8a8a8a] mt-0.5">{a.description}</span>}
                            </td>
                            <td className="py-4 text-xs font-semibold">{a.duration} mins</td>
                            <td className="py-4 text-xs font-semibold">{a._count?.questions || 0} items</td>
                            <td className="py-4 text-xs font-semibold">{a._count?.attempts || 0} {(a._count?.attempts || 0) === 1 ? "attempt" : "attempts"}</td>
                            <td className="py-4">
                              {(() => {
                                const state = getWindowState(a);
                                const badge = WINDOW_BADGE[state];
                                const hint =
                                  state === "live" && a.availabilityEnd ? `Closes ${shortDate(a.availabilityEnd)}`
                                  : state === "scheduled" ? `Opens ${shortDate(a.availabilityStart)}`
                                  : state === "closed" ? `Closed ${shortDate(a.availabilityEnd)}`
                                  : null;
                                return (
                                  <>
                                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.cls}`}>
                                      {state === "live" && <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                                      {badge.label}
                                    </span>
                                    {hint && <span className="block text-[10px] text-[#8a8a8a] mt-1">{hint}</span>}
                                  </>
                                );
                              })()}
                            </td>
                            <td className="py-4 text-right space-x-2">
                              {!a.published && (
                                <button
                                  type="button"
                                  onClick={() => handlePublish(a.id)}
                                  className="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg shadow-sm transition cursor-pointer"
                                >
                                  Publish
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setProctorId(a.id);
                                  setActiveTab("Proctoring");
                                }}
                                className="text-xs font-bold text-white bg-black hover:bg-zinc-800 px-3 py-1.5 rounded-lg shadow-sm transition cursor-pointer"
                              >
                                Proctor
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: ASSESSMENT BUILDER */}
          {activeTab === "Assessment Builder" && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Assessment Builder</h1>
                <p className="text-xs text-[#8a8a8a]">Design a secure, proctored assessment with custom grading configurations.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Form: Parameters */}
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-white border border-[#dedede] rounded-2xl p-5 shadow-sm space-y-4">
                    <h3 className="text-base font-bold border-b pb-2">1. Exam Information</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-[#676767]">Assessment Title</label>
                        <input
                          type="text"
                          value={newTitle}
                          onChange={(e) => setNewTitle(e.target.value)}
                          placeholder="e.g. Midterm Algorithms Design"
                          className="bg-[#f6f6f6] border border-[#dedede]/60 rounded-xl py-2 px-3 text-[13.5px] placeholder:text-[#a2a2a2]"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-[#676767]">Duration (minutes)</label>
                        <input
                          type="number"
                          value={newDuration}
                          onChange={(e) => setNewDuration(e.target.value)}
                          placeholder="60"
                          className="bg-[#f6f6f6] border border-[#dedede]/60 rounded-xl py-2 px-3 text-[13.5px]"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-[#676767]">Grading Scheme</label>
                        <select
                          value={newGrading}
                          onChange={(e) => setNewGrading(e.target.value)}
                          className="bg-[#f6f6f6] border border-[#dedede]/60 rounded-xl py-2 px-3 text-[13.5px]"
                        >
                          <option value="points">Points System</option>
                          <option value="percentage">Percentage Scale</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-[#676767]">Attempts Allowed</label>
                        <input
                          type="number"
                          value={newLimit}
                          onChange={(e) => setNewLimit(e.target.value)}
                          placeholder="1"
                          className="bg-[#f6f6f6] border border-[#dedede]/60 rounded-xl py-2 px-3 text-[13.5px]"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-[#676767]">Availability Start</label>
                        <input
                          type="datetime-local"
                          value={newStart}
                          onChange={(e) => setNewStart(e.target.value)}
                          className="bg-[#f6f6f6] border border-[#dedede]/60 rounded-xl py-2 px-3 text-[13.5px]"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-[#676767]">Availability End</label>
                        <input
                          type="datetime-local"
                          value={newEnd}
                          onChange={(e) => setNewEnd(e.target.value)}
                          className="bg-[#f6f6f6] border border-[#dedede]/60 rounded-xl py-2 px-3 text-[13.5px]"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-[#676767]">Description / Instructions</label>
                      <textarea
                        rows={2}
                        value={newDesc}
                        onChange={(e) => setNewDesc(e.target.value)}
                        placeholder="Provide dynamic information or instructions..."
                        className="bg-[#f6f6f6] border border-[#dedede]/60 rounded-xl py-2 px-3 text-[13.5px]"
                      />
                    </div>
                  </div>

                  {/* Question Builder */}
                  <div className="bg-white border border-[#dedede] rounded-2xl p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b pb-2">
                      <h3 className="text-base font-bold">2. Configure Questions</h3>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => addQuestion("multiple-choice")}
                          className="bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-[11px] font-bold px-3 py-1.5 rounded-lg transition cursor-pointer"
                        >
                          + Multiple Choice
                        </button>
                        <button
                          type="button"
                          onClick={() => addQuestion("descriptive")}
                          className="bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-[11px] font-bold px-3 py-1.5 rounded-lg transition cursor-pointer"
                        >
                          + Descriptive
                        </button>
                        <button
                          type="button"
                          onClick={() => addQuestion("coding")}
                          className="bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-[11px] font-bold px-3 py-1.5 rounded-lg transition cursor-pointer"
                        >
                          + Coding
                        </button>
                      </div>
                    </div>

                    {questions.length === 0 ? (
                      <div className="py-8 text-center text-xs text-[#8a8a8a] border border-dashed rounded-xl">
                        No questions added yet. Choose a question format above.
                      </div>
                    ) : (
                      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
                        {questions.map((q, idx) => (
                          <div key={q.id} className="border border-[#dedede]/60 rounded-xl p-4 bg-[#f6f6f6]/20 relative space-y-3">
                            <button
                              type="button"
                              onClick={() => removeQuestion(idx)}
                              className="absolute top-3 right-3 text-red-500 hover:text-red-700 cursor-pointer"
                            >
                              <Trash2 className="size-4" />
                            </button>

                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-white bg-zinc-800 rounded px-2 py-0.5 capitalize">
                                Q{idx + 1}: {q.type}
                              </span>
                            </div>

                            <div className="flex flex-col gap-1">
                              <label className="text-[11px] font-bold text-[#8a8a8a]">Question Text</label>
                              <input
                                type="text"
                                value={q.text}
                                onChange={(e) => updateQuestionField(idx, "text", e.target.value)}
                                placeholder="Enter question content..."
                                className="bg-white border border-[#dedede]/60 rounded-lg py-1.5 px-3 text-[13px]"
                              />
                            </div>

                            {q.type === "multiple-choice" && (
                              <div className="grid grid-cols-2 gap-2 mt-2">
                                {q.options.map((opt: string, oIdx: number) => (
                                  <div key={oIdx} className="flex items-center gap-1 bg-white border rounded-lg px-2 py-1">
                                    <span className="text-xs font-bold">{String.fromCharCode(65 + oIdx)}:</span>
                                    <input
                                      type="text"
                                      value={opt}
                                      onChange={(e) => updateOption(idx, oIdx, e.target.value)}
                                      className="w-full bg-transparent border-none text-xs outline-none"
                                    />
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Answer config & grading metadata */}
                            <div className="grid grid-cols-3 gap-2">
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-[#8a8a8a]">Correct Answer / Verification Key</label>
                                <input
                                  type="text"
                                  value={q.correctAnswer}
                                  onChange={(e) => updateQuestionField(idx, "correctAnswer", e.target.value)}
                                  placeholder="Answer text/option..."
                                  className="bg-white border border-[#dedede]/60 rounded-lg py-1 px-2 text-[12px]"
                                />
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-[#8a8a8a]">Points</label>
                                <input
                                  type="number"
                                  value={q.points}
                                  onChange={(e) => updateQuestionField(idx, "points", e.target.value)}
                                  className="bg-white border border-[#dedede]/60 rounded-lg py-1 px-2 text-[12px]"
                                />
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-[#8a8a8a]">Difficulty</label>
                                <select
                                  value={q.difficulty}
                                  onChange={(e) => updateQuestionField(idx, "difficulty", e.target.value)}
                                  className="bg-white border border-[#dedede]/60 rounded-lg py-1 px-2 text-[12px]"
                                >
                                  <option value="easy">Easy</option>
                                  <option value="medium">Medium</option>
                                  <option value="hard">Hard</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Form: Integrity Settings */}
                <div className="space-y-6">
                  <div className="bg-white border border-[#dedede] rounded-2xl p-5 shadow-sm space-y-4">
                    <h3 className="text-base font-bold border-b pb-2 flex items-center gap-2">
                      <Shield className="size-5 text-[#b2b2b2]" /> Integrity Controls
                    </h3>
                    <p className="text-xs text-[#8a8a8a]">Configure advanced AI security settings for students during this examination.</p>

                    <div className="space-y-3.5 pt-2">
                      {[
                        { state: shieldWebcam, setter: setShieldWebcam, title: "Webcam Monitoring", desc: "Periodic face analysis & anomaly detection" },
                        { state: shieldMic, setter: setShieldMic, title: "Microphone Analysis", desc: "Background noise & voice detection" },
                        { state: shieldLockdown, setter: setShieldLockdown, title: "Browser Lockdown", desc: "Block copy-paste, print screen & tools" },
                        { state: shieldFace, setter: setShieldFace, title: "Face Verification", desc: "Ensure student identity matches registration" },
                        { state: shieldGaze, setter: setShieldGaze, title: "Gaze Tracking", desc: "Detect looking away from screen" },
                        { state: shieldTab, setter: setShieldTab, title: "Tab-Switch Detection", desc: "Instantly flag and count tab switches" },
                        { state: shieldBehavior, setter: setShieldBehavior, title: "AI Behavior Analysis", desc: "Flags nervous behavior or multiple people" }
                      ].map((item, idx) => (
                        <div key={idx} className="flex items-start justify-between gap-3 p-2 border rounded-xl hover:bg-[#f6f6f6]/50 transition">
                          <div>
                            <span className="text-xs font-bold text-[#1a1917] block">{item.title}</span>
                            <span className="text-[10px] text-[#8a8a8a] leading-none mt-0.5">{item.desc}</span>
                          </div>
                          <input
                            type="checkbox"
                            checked={item.state}
                            onChange={(e) => item.setter(e.target.checked)}
                            className="size-4.5 rounded text-[#1a1917] border-gray-300 focus:ring-[#b2b2b2] mt-1 cursor-pointer"
                          />
                        </div>
                      ))}
                    </div>

                    <h3 className="text-base font-bold border-b pb-2 pt-4 flex items-center gap-2">
                      <Clock className="size-5 text-[#b2b2b2]" /> Resume & Attempt Rules
                    </h3>
                    <div className="space-y-3.5 pt-2 text-xs">
                      {/* Allow Resume */}
                      <div className="flex items-start justify-between gap-3 p-2 border rounded-xl hover:bg-[#f6f6f6]/50 transition">
                        <div>
                          <span className="font-bold text-[#1a1917] block">Allow Resume</span>
                          <span className="text-[10px] text-[#8a8a8a] leading-none mt-0.5">Allow candidates to resume exam if disconnected</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={shieldAllowResume}
                          onChange={(e) => setShieldAllowResume(e.target.checked)}
                          className="size-4.5 rounded text-[#1a1917] border-gray-300 focus:ring-[#b2b2b2] mt-1 cursor-pointer"
                        />
                      </div>

                      {shieldAllowResume && (
                        <div className="pl-4 space-y-3 border-l-2 border-[#dedede] ml-2">
                          <div className="flex flex-col gap-1">
                            <label className="font-bold text-[#676767]">Maximum Resume Count</label>
                            <input
                              type="number"
                              value={shieldMaxResumeCount}
                              onChange={(e) => setShieldMaxResumeCount(e.target.value)}
                              className="bg-[#f6f6f6] border border-[#dedede]/60 rounded-xl py-1.5 px-3 text-[12px] focus:outline-none"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="font-bold text-[#676767]">Resume Time Window (minutes)</label>
                            <input
                              type="number"
                              value={shieldResumeTimeWindow}
                              onChange={(e) => setShieldResumeTimeWindow(e.target.value)}
                              className="bg-[#f6f6f6] border border-[#dedede]/60 rounded-xl py-1.5 px-3 text-[12px] focus:outline-none"
                            />
                          </div>

                          <div className="flex items-start justify-between gap-3 hover:bg-[#f6f6f6]/30 p-1.5 rounded-lg">
                            <div>
                              <span className="font-semibold text-[#1a1917] block">Resume After Disconnect</span>
                            </div>
                            <input
                              type="checkbox"
                              checked={shieldResumeAfterDisconnect}
                              onChange={(e) => setShieldResumeAfterDisconnect(e.target.checked)}
                              className="size-4 rounded text-[#1a1917] border-gray-300 mt-1 cursor-pointer"
                            />
                          </div>

                          <div className="flex items-start justify-between gap-3 hover:bg-[#f6f6f6]/30 p-1.5 rounded-lg">
                            <div>
                              <span className="font-semibold text-[#1a1917] block">Resume After Browser Crash</span>
                            </div>
                            <input
                              type="checkbox"
                              checked={shieldResumeAfterCrash}
                              onChange={(e) => setShieldResumeAfterCrash(e.target.checked)}
                              className="size-4 rounded text-[#1a1917] border-gray-300 mt-1 cursor-pointer"
                            />
                          </div>

                          <div className="flex items-start justify-between gap-3 hover:bg-[#f6f6f6]/30 p-1.5 rounded-lg">
                            <div>
                              <span className="font-semibold text-[#1a1917] block">Resume After Logout</span>
                            </div>
                            <input
                              type="checkbox"
                              checked={shieldResumeAfterLogout}
                              onChange={(e) => setShieldResumeAfterLogout(e.target.checked)}
                              className="size-4 rounded text-[#1a1917] border-gray-300 mt-1 cursor-pointer"
                            />
                          </div>
                        </div>
                      )}

                      {/* Retake settings */}
                      <div className="flex items-start justify-between gap-3 p-2 border rounded-xl hover:bg-[#f6f6f6]/50 transition">
                        <div>
                          <span className="font-bold text-[#1a1917] block">Retake Allowed</span>
                          <span className="text-[10px] text-[#8a8a8a] leading-none mt-0.5">Allows student to start a new attempt if failed</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={shieldRetakeAllowed}
                          onChange={(e) => setShieldRetakeAllowed(e.target.checked)}
                          className="size-4.5 rounded text-[#1a1917] border-gray-300 focus:ring-[#b2b2b2] mt-1 cursor-pointer"
                        />
                      </div>

                      {shieldRetakeAllowed && (
                        <div className="pl-4 space-y-3 border-l-2 border-[#dedede] ml-2">
                          <div className="flex flex-col gap-1">
                            <label className="font-bold text-[#676767]">Retake Date</label>
                            <input
                              type="datetime-local"
                              value={shieldRetakeDate}
                              onChange={(e) => setShieldRetakeDate(e.target.value)}
                              className="bg-[#f6f6f6] border border-[#dedede]/60 rounded-xl py-1.5 px-3 text-[12px] focus:outline-none"
                            />
                          </div>
                        </div>
                      )}

                      {/* Attempt Lock */}
                      <div className="flex items-start justify-between gap-3 p-2 border rounded-xl hover:bg-[#f6f6f6]/50 transition">
                        <div>
                          <span className="font-bold text-[#1a1917] block">Attempt Lock</span>
                          <span className="text-[10px] text-[#8a8a8a] leading-none mt-0.5">Instantly lock all active/new exam entries</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={shieldAttemptLock}
                          onChange={(e) => setShieldAttemptLock(e.target.checked)}
                          className="size-4.5 rounded text-[#1a1917] border-gray-300 focus:ring-[#b2b2b2] mt-1 cursor-pointer"
                        />
                      </div>

                      {/* Late Submission */}
                      <div className="flex items-start justify-between gap-3 p-2 border rounded-xl hover:bg-[#f6f6f6]/50 transition">
                        <div>
                          <span className="font-bold text-[#1a1917] block">Late Submission Allowed</span>
                          <span className="text-[10px] text-[#8a8a8a] leading-none mt-0.5">Allow submissions after availability date ends</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={shieldLateSubmission}
                          onChange={(e) => setShieldLateSubmission(e.target.checked)}
                          className="size-4.5 rounded text-[#1a1917] border-gray-300 focus:ring-[#b2b2b2] mt-1 cursor-pointer"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleCreateAssessment}
                      className="w-full bg-[#1a1917] hover:bg-black text-white py-3 rounded-xl text-xs font-semibold shadow-lg transition-all cursor-pointer"
                    >
                      Save & Create Draft
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PROCTORING */}
          {activeTab === "Proctoring" && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold tracking-tight">Real-Time Proctoring</h1>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                      <Zap className="size-3 text-amber-600 animate-pulse" />
                      Groq LLM Active ({GROQ_MODEL})
                    </span>
                  </div>
                  <p className="text-xs text-[#8a8a8a]">Continuously monitors candidate streams, integrity indexes, and real-time Groq LLM assessments.</p>
                </div>
                {/* Selector */}
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <select
                    value={proctorId || ""}
                    onChange={(e) => {
                      setProctorId(e.target.value || null);
                      setProctorAttempts([]);
                    }}
                    className="w-full sm:w-auto min-h-11 bg-white border border-[#dedede] rounded-xl py-2 px-4 text-sm sm:text-xs font-bold shadow-sm"
                  >
                    <option value="">Select Assessment to Proctor</option>
                    {assessments.map((a) => (
                      <option key={a.id} value={a.id}>
                        {getWindowState(a) === "live" ? "● Live — " : ""}{a.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {!proctorId ? (
                <div className="bg-white border border-[#dedede] rounded-2xl p-10 text-center text-sm text-[#8a8a8a] shadow-sm">
                  Please select an assessment from the dropdown to start live monitoring.
                </div>
              ) : proctorAttempts.length === 0 ? (
                <div className="bg-white border border-[#dedede] rounded-2xl p-10 text-center text-sm text-[#8a8a8a] shadow-sm">
                  No students currently online for this assessment. Live streams will load once candidates join.
                </div>
              ) : (
                <>
                {(() => {
                  const live = proctorAttempts.filter((a) => a.status === "started");
                  const online = live.filter((a) => a.isOnline);
                  const paused = live.filter((a) => a.proctoringStatus === "PAUSED");
                  const stale = live.filter(
                    (a) => a.isOnline && (!a.lastFrameAt || nowTick - new Date(a.lastFrameAt).getTime() > 20000),
                  );
                  const review = live.filter(
                    (a) => a.requiresHumanReview || a.breakdown?.decision === "manual_review" || a.integrityScore < 60,
                  );
                  const stats: [string, number, string][] = [
                    ["Online", online.length, "text-emerald-700"],
                    ["Offline", live.length - online.length, "text-zinc-700"],
                    ["Paused", paused.length, "text-red-700"],
                    ["No frames", stale.length, "text-amber-700"],
                    ["Needs review", review.length, "text-rose-700"],
                  ];
                  return (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
                        {stats.map(([label, value, cls]) => (
                          <div key={label} className="bg-white border border-[#dedede] rounded-xl px-3 py-2.5 shadow-sm">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#8a8a8a] block">{label}</span>
                            <span className={`text-lg font-extrabold ${cls}`}>{value}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1" role="tablist" aria-label="Filter candidates">
                        {([
                          ["all", `All (${proctorAttempts.length})`],
                          ["attention", "Needs attention"],
                          ["offline", "Offline / no frames"],
                        ] as const).map(([key, label]) => (
                          <button
                            key={key}
                            type="button"
                            role="tab"
                            aria-selected={proctorFilter === key}
                            onClick={() => setProctorFilter(key)}
                            className={`shrink-0 min-h-9 px-3.5 rounded-full text-xs font-bold border transition cursor-pointer ${
                              proctorFilter === key
                                ? "bg-[#1a1917] text-white border-[#1a1917]"
                                : "bg-white text-[#676767] border-[#dedede] hover:bg-[#f6f6f6]"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                {proctorId && (
                  <LiveVideoWall
                    assessmentId={proctorId}
                    attempts={proctorAttempts}
                    pendingAction={pendingAction}
                    onAction={(action, att) => {
                      if (action === "warning") {
                        runProctorAction("warning", att, {
                          message: "Faculty notice: please keep your attention on the exam screen.",
                        });
                      } else if (action === "terminate") {
                        const reason = window.prompt(
                          `Terminate ${att.studentName}'s exam? This cannot be undone.

Reason (recorded in the audit timeline):`,
                        );
                        if (reason !== null) runProctorAction("terminate", att, { reason });
                      } else {
                        runProctorAction(action, att);
                      }
                    }}
                  />
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                  {proctorAttempts
                    .filter((att) => {
                      const frameStale = !att.lastFrameAt || nowTick - new Date(att.lastFrameAt).getTime() > 20000;
                      if (proctorFilter === "offline") return att.status === "started" && (!att.isOnline || frameStale);
                      if (proctorFilter === "attention")
                        return (
                          att.proctoringStatus === "PAUSED" ||
                          att.proctoringStatus === "WARNING" ||
                          att.requiresHumanReview ||
                          att.breakdown?.decision === "manual_review" ||
                          att.integrityScore < 85
                        );
                      return true;
                    })
                    .map((att) => {
                    const isHighRisk = att.integrityScore < 60;
                    const isMedRisk = att.integrityScore >= 60 && att.integrityScore < 85;
                    const lastFrameAgoSec = att.lastFrameAt
                      ? Math.max(0, Math.round((nowTick - new Date(att.lastFrameAt).getTime()) / 1000))
                      : null;
                    const agentsProcessing = att.isOnline && lastFrameAgoSec !== null && lastFrameAgoSec <= 20;
                    const identityState: string | undefined = att.breakdown?.identityVerification;
                    const isActing = (a: string) => pendingAction === `${a}:${att.id}`;

                    return (
                      <div
                        key={att.id}
                        className={`bg-white border rounded-2xl overflow-hidden shadow-md flex flex-col justify-between transition-all duration-300 ${
                          isHighRisk 
                            ? "border-red-400 ring-2 ring-red-100" 
                            : isMedRisk 
                            ? "border-amber-400" 
                            : "border-[#dedede]"
                        }`}
                      >
                        {/* Video Header Card */}
                        <div className="p-4 border-b border-[#dedede]/40 bg-[#fafcf7] flex justify-between items-center">
                          <div>
                            <span className="font-extrabold text-xs text-[#1a1917] block">{att.studentName}</span>
                            <span className="text-[10px] text-[#8a8a8a] font-mono">{att.id.slice(-8).toUpperCase()}</span>
                          </div>
                          
                          {/* Integrity status pill */}
                          <div className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                            isHighRisk 
                              ? "text-red-600 bg-red-50 border-red-100" 
                              : isMedRisk 
                              ? "text-amber-600 bg-amber-50 border-amber-100" 
                              : "text-emerald-600 bg-emerald-50 border-emerald-100"
                          }`}>
                            Integrity: {att.integrityScore}%
                          </div>
                        </div>

                        {/* Webcam Video Simulation Panel */}
                        <div className="relative aspect-video bg-zinc-950 flex items-center justify-center overflow-hidden">
                          {/* Simulated video frame */}
                          <div className="absolute inset-0 flex items-center justify-center">
                            {att.status === "started" ? (
                              <>
                                <span className={`absolute top-2 left-2 size-2 rounded-full ${att.isOnline ? "bg-red-650 animate-pulse" : "bg-zinc-600"}`} />
                                <span className="absolute top-2 right-2 text-[9px] text-white/50 uppercase font-bold tracking-widest bg-black/45 px-1.5 py-0.5 rounded">Live Stream</span>
                                <div className="text-center text-white space-y-1">
                                  <Camera className="size-8 text-white/60 mx-auto animate-pulse" />
                                  <span className="text-[10px] text-white/40 block">
                                    {att.isOnline ? "Camera Feed Active" : "Camera Stream Interrupted"}
                                  </span>
                                </div>
                              </>
                            ) : (
                              <div className="text-center text-white/40 text-xs">
                                <CheckCircle className="size-8 text-emerald-500 mx-auto mb-1" />
                                Submitted / Inactive
                              </div>
                            )}
                          </div>

                          {/* Identity overlay: only shows "verified" when the server's
                              identity re-verification actually succeeded */}
                          {att.status === "started" && (
                            <div
                              className={`absolute bottom-2 left-2 rounded px-2 py-0.5 text-[9px] font-bold border border-dashed ${
                                identityState === "verified"
                                  ? "border-emerald-500 text-emerald-300 bg-emerald-950/40"
                                  : identityState === "failed"
                                  ? "border-red-500 text-red-300 bg-red-950/40 animate-pulse"
                                  : "border-amber-500 text-amber-300 bg-amber-950/40"
                              }`}
                            >
                              Identity:{" "}
                              {identityState === "verified"
                                ? "verified"
                                : identityState === "failed"
                                ? "mismatch"
                                : identityState === "not_enrolled"
                                ? "not enrolled"
                                : "inconclusive"}
                            </div>
                          )}

                          {att.status === "started" && att.faceStatus && !["Detected", "Attentive"].includes(att.faceStatus) && (
                            <div className="absolute border border-dashed border-red-500 rounded px-2 py-0.5 text-[9px] text-red-400 font-bold bg-red-950/20 top-[30%] left-[20%] animate-pulse">
                              WARNING: {att.faceStatus}
                            </div>
                          )}
                        </div>

                        {/* Live Telemetry HUD inside Card */}
                        <div className="p-4 grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs border-b border-[#dedede]/40 bg-zinc-50/50">
                          <div className="flex justify-between items-center">
                            <span className="text-zinc-500">Connection Status</span>
                            <span className={`font-bold flex items-center gap-1 ${att.isOnline ? "text-emerald-600" : "text-rose-600"}`}>
                              <span className={`size-1.5 rounded-full ${att.isOnline ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
                              {att.isOnline ? "Online" : "Offline"}
                            </span>
                          </div>
                          
                          <div className="flex justify-between items-center">
                            <span className="text-zinc-500">Current Q</span>
                            <span className="font-bold text-zinc-800">Q{(att.currentQuestionIndex || 0) + 1}</span>
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="text-zinc-500">Internet Quality</span>
                            <span className="font-bold text-zinc-700">{att.networkQuality || "Excellent"}</span>
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="text-zinc-500">Ping latency</span>
                            <span className="font-mono font-semibold text-zinc-600">{att.networkLatency !== undefined ? att.networkLatency : 45} ms</span>
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="text-zinc-500">Face Status</span>
                            <span className={`font-bold ${att.faceStatus === "Detected" || !att.faceStatus ? "text-emerald-600" : "text-amber-600 animate-pulse"}`}>{att.faceStatus || "Detected"}</span>
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="text-zinc-500">Background Noise</span>
                            <span className={`font-bold ${att.backgroundNoise === "Quiet" || !att.backgroundNoise ? "text-zinc-600" : "text-amber-600 animate-pulse"}`}>{att.backgroundNoise || "Quiet"}</span>
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="text-zinc-500">Warnings Count</span>
                            <span className="font-semibold text-amber-600">{att.warningCount ?? (att.violations?.length || 0)}</span>
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="text-zinc-500">AI agents</span>
                            <span className={`font-bold ${agentsProcessing ? "text-emerald-600" : "text-amber-600"}`}>
                              {agentsProcessing ? "Processing" : att.isOnline ? "No frames" : "Idle"}
                            </span>
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="text-zinc-500">Last frame</span>
                            <span className="font-mono font-semibold text-zinc-600">
                              {lastFrameAgoSec === null ? "—" : `${lastFrameAgoSec}s ago`}
                            </span>
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="text-zinc-500">Evidence confidence</span>
                            <span className={`font-bold ${(att.breakdown?.evidenceConfidence ?? 0) < 60 ? "text-amber-600" : "text-zinc-800"}`}>
                              {att.breakdown?.evidenceConfidence !== undefined ? `${att.breakdown.evidenceConfidence}%` : "—"}
                            </span>
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="text-zinc-500">Status</span>
                            <span className={`font-bold ${att.proctoringStatus === "PAUSED" || att.proctoringStatus === "TERMINATED" ? "text-red-600" : att.proctoringStatus === "WARNING" ? "text-amber-600" : "text-zinc-800"}`}>
                              {att.proctoringStatus || "NORMAL"}
                            </span>
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="text-zinc-500">Resume Count</span>
                            <span className="font-semibold text-zinc-700">{att.resumeCount || 0}</span>
                          </div>

                          <div className="flex justify-between items-center col-span-2 border-t border-[#dedede]/50 pt-2">
                            <span className="text-zinc-505 font-semibold">Remaining Time</span>
                            <span className="font-mono font-bold text-zinc-800">
                              {att.timeLeft !== null && att.timeLeft !== undefined ? (
                                `${Math.floor(att.timeLeft / 60)}m ${att.timeLeft % 60}s`
                              ) : (
                                "N/A"
                              )}
                            </span>
                          </div>
                        </div>

                        {/* 5-Dimension Multi-Agent Integrity Breakdown */}
                        <div className="p-3.5 bg-white border-t border-b border-[#dedede]/40 space-y-2">
                          <span className="text-[10px] font-extrabold text-[#8a8a8a] uppercase tracking-wider block">
                            Multi-Agent Integrity Dimensions
                          </span>
                          <div className="space-y-1.5 text-[11px]">
                            <div>
                              <div className="flex justify-between text-zinc-600 mb-0.5">
                                <span>Identity Consistency</span>
                                <span className="font-bold text-zinc-900">{att.breakdown?.identityScore ?? 100}%</span>
                              </div>
                              <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${att.breakdown?.identityScore ?? 100}%` }} />
                              </div>
                            </div>

                            <div>
                              <div className="flex justify-between text-zinc-600 mb-0.5">
                                <span>Camera &amp; Lighting Quality</span>
                                <span className="font-bold text-zinc-900">{att.breakdown?.cameraQualityScore ?? 95}%</span>
                              </div>
                              <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${att.breakdown?.cameraQualityScore ?? 95}%` }} />
                              </div>
                            </div>

                            <div>
                              <div className="flex justify-between text-zinc-600 mb-0.5">
                                <span>Environment &amp; Secondary Devices</span>
                                <span className="font-bold text-zinc-900">{att.breakdown?.environmentScore ?? 100}%</span>
                              </div>
                              <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${(att.breakdown?.environmentScore ?? 100) < 80 ? "bg-rose-500" : "bg-emerald-500"}`} style={{ width: `${att.breakdown?.environmentScore ?? 100}%` }} />
                              </div>
                            </div>

                            <div>
                              <div className="flex justify-between text-zinc-600 mb-0.5">
                                <span>Behavior &amp; Temporal Attention</span>
                                <span className="font-bold text-zinc-900">{att.breakdown?.behaviorScore ?? 100}%</span>
                              </div>
                              <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${(att.breakdown?.behaviorScore ?? 100) < 80 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${att.breakdown?.behaviorScore ?? 100}%` }} />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Multimodal Correlated Alert Banner */}
                        {att.correlatedIncidents && att.correlatedIncidents.length > 0 && (
                          <div className="m-3 p-2 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-[11px] font-semibold flex items-center gap-2">
                            <AlertTriangle className="size-4 text-rose-600 shrink-0" />
                            <span>{att.correlatedIncidents[0]}</span>
                          </div>
                        )}

                        {/* Alert / Violation History Log */}
                        <div className="p-4 bg-[#f6f6f6]/30 flex-1 border-b border-[#dedede]/40 max-h-36 overflow-y-auto space-y-2">
                          <span className="text-[10px] font-bold text-[#8a8a8a] uppercase tracking-wider block">Real-Time Violation Alerts</span>
                          {att.violations && att.violations.length > 0 ? (
                            att.violations.map((v: any, vIdx: number) => (
                              <div key={vIdx} className="flex gap-1.5 items-start text-xs border-b border-[#dedede]/20 pb-1.5 last:border-0 last:pb-0">
                                <AlertTriangle className={`size-3.5 shrink-0 mt-0.5 ${v.severity === "high" ? "text-red-500" : "text-amber-500"}`} />
                                <div>
                                  <span className="font-bold capitalize">{v.type.replace("-", " ")}</span>
                                  <p className="text-[10px] text-[#676767] leading-tight">{v.description}</p>
                                </div>
                              </div>
                            ))
                          ) : att.activeViolations && att.activeViolations.length > 0 ? (
                            att.activeViolations.map((msg: string, vIdx: number) => (
                              <div key={vIdx} className="flex gap-1.5 items-start text-xs border-b border-[#dedede]/20 pb-1.5 last:border-0 last:pb-0">
                                <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-amber-500" />
                                <p className="text-[10px] text-[#676767] leading-tight font-medium">{msg}</p>
                              </div>
                            ))
                          ) : (
                            <p className="text-[11px] text-emerald-600 font-semibold">No anomalous behavior detected.</p>
                          )}
                        </div>

                        {/* Groq Live Session Evaluation Banner */}
                        {groqAudits[att.id] && (
                          <div className="m-3 p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1.5 text-xs text-zinc-800">
                            <div className="flex items-center justify-between">
                              <span className="font-extrabold text-[10px] text-amber-900 uppercase flex items-center gap-1">
                                <Zap className="size-3 text-amber-600" /> Groq LLM Live Assessment
                              </span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                                groqAudits[att.id].threatLevel === "CRITICAL"
                                  ? "bg-rose-100 text-rose-800 border-rose-300"
                                  : groqAudits[att.id].threatLevel === "ELEVATED"
                                  ? "bg-amber-100 text-amber-800 border-amber-300"
                                  : "bg-emerald-100 text-emerald-800 border-emerald-300"
                              }`}>
                                Threat: {groqAudits[att.id].threatLevel} ({groqAudits[att.id].riskPercentage}% Risk)
                              </span>
                            </div>
                            <p className="text-[11px] leading-relaxed font-medium">
                              {groqAudits[att.id].assessment}
                            </p>
                            <p className="text-[10px] text-zinc-600 font-semibold pt-1 border-t border-amber-200/60">
                              Action: {groqAudits[att.id].recommendedAction}
                            </p>
                          </div>
                        )}

                        {/* Action buttons (touch-sized; wrap into a 2-column grid on phones) */}
                        <div className="p-3 bg-white grid grid-cols-2 sm:flex sm:justify-end gap-2 sm:flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleGroqAuditAttempt(att)}
                            disabled={analyzingAttemptId === att.id}
                            className="col-span-2 sm:col-span-1 min-h-10 bg-[#1a1917] hover:bg-black text-amber-300 text-xs sm:text-[10px] font-extrabold px-3 py-2 sm:py-1.5 rounded-lg shadow-sm transition cursor-pointer flex items-center justify-center gap-1 disabled:opacity-50"
                          >
                            {analyzingAttemptId === att.id ? (
                              <RefreshCw className="size-3 animate-spin text-white" />
                            ) : (
                              <Sparkles className="size-3 text-amber-400" />
                            )}
                            Groq AI Audit
                          </button>

                          {att.status === "started" && att.proctoringStatus !== "TERMINATED" && (
                            <>
                              <button
                                type="button"
                                disabled={isActing("warning")}
                                onClick={() =>
                                  runProctorAction("warning", att, {
                                    message: "Faculty notice: please keep your attention on the exam screen.",
                                  })
                                }
                                className="min-h-10 bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs sm:text-[10px] font-extrabold px-3 py-2 sm:py-1.5 rounded-lg border border-amber-200 transition cursor-pointer disabled:opacity-50"
                              >
                                Send Warning
                              </button>

                              {att.proctoringStatus === "PAUSED" ? (
                                <button
                                  type="button"
                                  disabled={isActing("resume")}
                                  onClick={() => runProctorAction("resume", att)}
                                  className="min-h-10 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs sm:text-[10px] font-extrabold px-3 py-2 sm:py-1.5 rounded-lg border border-emerald-200 transition cursor-pointer disabled:opacity-50"
                                >
                                  Resume Exam
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isActing("pause")}
                                  onClick={() => runProctorAction("pause", att)}
                                  className="min-h-10 bg-red-50 hover:bg-red-100 text-red-700 text-xs sm:text-[10px] font-extrabold px-3 py-2 sm:py-1.5 rounded-lg border border-red-200 transition cursor-pointer disabled:opacity-50"
                                >
                                  Pause Exam
                                </button>
                              )}

                              <button
                                type="button"
                                disabled={isActing("terminate")}
                                onClick={() => {
                                  const reason = window.prompt(
                                    `Terminate ${att.studentName}'s exam? This cannot be undone.\n\nReason (recorded in the audit timeline):`,
                                  );
                                  if (reason === null) return;
                                  runProctorAction("terminate", att, { reason });
                                }}
                                className="col-span-2 sm:col-span-1 min-h-10 bg-white hover:bg-red-600 hover:text-white text-red-700 text-xs sm:text-[10px] font-extrabold px-3 py-2 sm:py-1.5 rounded-lg border border-red-300 transition cursor-pointer disabled:opacity-50"
                              >
                                Terminate
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                </>
              )}
            </div>
          )}

          {/* TAB 4: EVALUATION QUEUE */}
          {activeTab === "Evaluation Queue" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">AI-Assisted Evaluation</h1>
                  <p className="text-xs text-[#8a8a8a]">Grade and evaluate objective answers, review AI suggestions, and finalize marks.</p>
                </div>
                
                <select
                  value={evalId || ""}
                  onChange={(e) => {
                    setEvalId(e.target.value || null);
                    setEvalAttempts([]);
                    setSelectedAttempt(null);
                  }}
                  className="bg-white border border-[#dedede] rounded-xl py-2 px-4 text-xs font-bold shadow-sm"
                >
                  <option value="">Select Assessment to Grade</option>
                  {assessments.map((a) => (
                    <option key={a.id} value={a.id}>{a.title}</option>
                  ))}
                </select>
              </div>

              {evalId && evalAttempts.some(att => att.status === "Faculty Review Required") && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl flex items-center gap-3 text-xs font-semibold animate-pulse shadow-sm">
                  <AlertTriangle className="size-4 shrink-0 text-rose-600" />
                  <span>ATTENTION: There are student submissions flagged with low AI evaluation confidence (&lt;75%) that require urgent faculty review.</span>
                </div>
              )}

              {!evalId ? (
                <div className="bg-white border border-[#dedede] rounded-2xl p-10 text-center text-sm text-[#8a8a8a] shadow-sm">
                  Please select an assessment to load student submission attempts.
                </div>
              ) : !selectedAttempt ? (
                /* Attempts list */
                <div className="bg-white border border-[#dedede] rounded-2xl p-5 shadow-sm">
                  <h3 className="text-base font-bold mb-4">Submission Queue</h3>
                  {evalAttempts.length === 0 ? (
                    <div className="py-10 text-center text-[#8a8a8a]">No submissions found for this assessment.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b border-[#dedede]/50 text-left text-xs font-bold text-[#8a8a8a] uppercase">
                            <th className="pb-3">Candidate</th>
                            <th className="pb-3">Submitted At</th>
                            <th className="pb-3">Auto Grade Score</th>
                            <th className="pb-3">Integrity Score</th>
                            <th className="pb-3">Status</th>
                            <th className="pb-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#dedede]/30">
                          {evalAttempts.map((att) => (
                            <tr key={att.id} className="hover:bg-[#f6f6f6]/30 transition-colors">
                              <td className="py-4 text-sm font-bold text-[#1a1917]">{att.studentName}</td>
                              <td className="py-4 text-xs text-[#676767]">{att.submittedAt ? new Date(att.submittedAt).toLocaleString() : "Not submitted"}</td>
                              <td className="py-4 text-xs font-bold">{att.score !== null ? `${att.score} points` : "Pending manual review"}</td>
                              <td className="py-4 text-xs font-bold">{att.integrityScore}%</td>
                              <td className="py-4">
                                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                  att.status === "graded" 
                                    ? "text-emerald-600 bg-emerald-50 border-emerald-100" 
                                    : att.status === "Faculty Review Required"
                                    ? "text-rose-600 bg-rose-50 border-rose-100 animate-pulse"
                                    : "text-amber-600 bg-amber-50 border-amber-100"
                                }`}>
                                  {att.status === "graded" ? "Graded" : att.status === "Faculty Review Required" ? "Review Required" : "Submitted"}
                                </span>
                              </td>
                              <td className="py-4 text-right">
                                <button
                                  type="button"
                                  onClick={() => loadAttemptDetails(att.id)}
                                  className="text-xs font-bold text-white bg-black hover:bg-zinc-800 px-3 py-1.5 rounded-lg shadow-sm cursor-pointer"
                                >
                                  Evaluate
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                /* Review evaluation details for selected attempt */
                <div className="space-y-6">
                  <div className="flex items-center justify-between border-b pb-3">
                    <button
                      type="button"
                      onClick={() => setSelectedAttempt(null)}
                      className="text-xs font-bold text-[#676767] hover:text-[#1a1917] transition cursor-pointer"
                    >
                      ← Back to Queue
                    </button>
                    <h3 className="text-lg font-bold">Evaluating: {selectedAttempt.studentName}</h3>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleReevaluate}
                        disabled={isReevaluating}
                        className="bg-zinc-800 hover:bg-black text-white text-xs font-bold px-4 py-2 rounded-xl transition cursor-pointer shadow-sm disabled:opacity-55"
                      >
                        {isReevaluating ? "Re-evaluating..." : "Re-evaluate Submission"}
                      </button>
                      <button
                        type="button"
                        onClick={handleEvaluateSubmit}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition cursor-pointer shadow-sm"
                      >
                        Finalize & Save Grades
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left: Answers listing */}
                    <div className="lg:col-span-2 space-y-4">
                      {selectedAttempt.answers.map((ans: any, aIdx: number) => {
                        const question = ans.question;
                        const gradeData = manualGrades[ans.id] || { manualGrade: 0, feedback: "", overrideStatus: "none" };

                        let aiEval: any = null;
                        if (ans.aiEvaluation) {
                          try {
                            aiEval = JSON.parse(ans.aiEvaluation);
                          } catch (e) {}
                        }

                        // Determine reliability level
                        const reliability = aiEval?.scores?.reliability !== undefined ? aiEval.scores.reliability * 100 : (ans.aiConfidence !== null ? ans.aiConfidence * 100 : 100);
                        const reliabilityLevel = reliability >= 90 ? "HIGH" : reliability >= 75 ? "MEDIUM" : "LOW";

                        return (
                          <div key={ans.id} className="bg-white border border-[#dedede] rounded-2xl p-5 shadow-sm space-y-4">
                            {/* Question Header */}
                            <div className="flex items-start justify-between border-b pb-2">
                              <div>
                                <span className="text-xs font-bold text-[#8a8a8a] block">Question {aIdx + 1} ({question.type})</span>
                                <p className="text-sm font-bold mt-1 text-[#1a1917]">{question.text}</p>
                              </div>
                              <span className="text-xs font-extrabold text-[#b2b2b2] bg-[#fbfbfb] border px-3 py-1 rounded-full">
                                {question.points} Points Max
                              </span>
                            </div>

                            {/* Reference / Rubric Answer */}
                            {question.correctAnswer && (
                              <div className="bg-[#fdfdfd] border border-dashed border-[#b2b2b2]/35 rounded-xl p-3 text-xs">
                                <span className="font-bold text-[#b2b2b2] block">Expected Answer / Rubric:</span>
                                <p className="mt-1 text-[#676767] whitespace-pre-wrap">{question.correctAnswer}</p>
                              </div>
                            )}

                            {/* Student Answer */}
                            <div className="bg-[#f6f6f6]/30 border rounded-xl p-3">
                              <span className="text-[10px] font-bold text-[#8a8a8a] uppercase tracking-wider block">Student Response</span>
                              <p className="text-sm mt-1 whitespace-pre-wrap font-medium">{ans.response || "No response provided."}</p>
                            </div>

                            {/* Decision Transparency & AI Governance Panel */}
                            {question.type !== "multiple-choice" && (
                              <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 space-y-3.5">
                                {/* Badge and Reliability */}
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 border-zinc-200/60">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-extrabold text-zinc-700">🤖 Multi-Model AI Grading Engine</span>
                                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                                      reliabilityLevel === "HIGH"
                                        ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                                        : reliabilityLevel === "MEDIUM"
                                        ? "text-amber-700 bg-amber-50 border-amber-200"
                                        : "text-rose-700 bg-rose-50 border-rose-200 animate-pulse"
                                    }`}>
                                      {reliabilityLevel} CONFIDENCE ({reliability.toFixed(0)}%)
                                    </span>
                                  </div>
                                  
                                  <div className="text-[10px] font-bold text-zinc-500">
                                    Override Status: <span className="uppercase text-zinc-700 font-extrabold">{gradeData.overrideStatus}</span>
                                  </div>
                                </div>

                                {/* Transparency Scores */}
                                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                                  <div className="bg-white p-2 rounded-lg border border-zinc-100 shadow-sm">
                                    <span className="text-[9px] font-bold text-zinc-400 block">AI GRADE</span>
                                    <span className="text-sm font-extrabold text-zinc-800">{ans.aiGrade !== null ? `${ans.aiGrade} / ${question.points}` : "N/A"}</span>
                                  </div>
                                  <div className="bg-white p-2 rounded-lg border border-zinc-100 shadow-sm">
                                    <span className="text-[9px] font-bold text-zinc-400 block">SIMILARITY</span>
                                    <span className="text-sm font-extrabold text-indigo-600">{aiEval?.scores?.semanticSimilarity !== undefined ? `${Math.round(aiEval.scores.semanticSimilarity * 100)}%` : "N/A"}</span>
                                  </div>
                                  <div className="bg-white p-2 rounded-lg border border-zinc-100 shadow-sm">
                                    <span className="text-[9px] font-bold text-zinc-400 block">KNOWLEDGE COVERAGE</span>
                                    <span className="text-sm font-extrabold text-emerald-600">{aiEval?.scores?.knowledgeCoverage !== undefined ? `${Math.round(aiEval.scores.knowledgeCoverage * 100)}%` : "N/A"}</span>
                                  </div>
                                  <div className="bg-white p-2 rounded-lg border border-zinc-100 shadow-sm">
                                    <span className="text-[9px] font-bold text-zinc-400 block">QUALITY</span>
                                    <span className="text-sm font-extrabold text-teal-600">{aiEval?.scores?.explanationQuality !== undefined ? `${Math.round(aiEval.scores.explanationQuality * 100)}%` : "N/A"}</span>
                                  </div>
                                  <div className="bg-white p-2 rounded-lg border border-zinc-100 shadow-sm">
                                    <span className="text-[9px] font-bold text-zinc-400 block">RELIABILITY</span>
                                    <span className="text-sm font-extrabold text-violet-600">{aiEval?.scores?.reliability !== undefined ? `${Math.round(aiEval.scores.reliability * 100)}%` : "N/A"}</span>
                                  </div>
                                </div>

                                {/* Explainable Reasoning */}
                                {aiEval && (
                                  <div className="space-y-2 text-xs pt-1">
                                    <div>
                                      <span className="font-extrabold text-zinc-700 block">Why Marks Were Awarded:</span>
                                      <p className="text-zinc-600 leading-relaxed mt-0.5">{aiEval.reasoning?.whyMarksAwarded}</p>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 items-center">
                                      <span className="font-extrabold text-zinc-700">Concepts Identified:</span>
                                      {aiEval.reasoning?.conceptsIdentified?.map((tag: string, tIdx: number) => (
                                        <span key={tIdx} className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded text-[10px] font-semibold border border-emerald-100">{tag}</span>
                                      ))}
                                      {aiEval.reasoning?.conceptsIdentified?.length === 0 && <span className="text-zinc-400 italic">None</span>}
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 items-center">
                                      <span className="font-extrabold text-zinc-700">Missing Concepts:</span>
                                      {aiEval.reasoning?.missingConcepts?.map((tag: string, tIdx: number) => (
                                        <span key={tIdx} className="bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded text-[10px] font-semibold border border-rose-100">{tag}</span>
                                      ))}
                                      {aiEval.reasoning?.missingConcepts?.length === 0 && <span className="text-emerald-600 italic">None</span>}
                                    </div>
                                    <div>
                                      <span className="font-extrabold text-zinc-700 block">Suggested Improvements:</span>
                                      <p className="text-zinc-500 italic mt-0.5">{aiEval.reasoning?.suggestedImprovements}</p>
                                    </div>
                                  </div>
                                )}

                                {/* Multi-Model Breakdown */}
                                <div className="border-t pt-2 border-zinc-200/60 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                                  <div className="bg-white p-2.5 rounded-lg border">
                                    <span className="font-extrabold text-zinc-700 block">Groq LLM Agent:</span>
                                    <div className="mt-1 flex items-center gap-2">
                                      <span className="font-bold text-amber-600">{aiEval?.models?.groq?.score ?? ans.aiGrade} pts</span>
                                      <span className="text-[10px] text-zinc-400">Confidence: {Math.round((aiEval?.models?.groq?.confidence ?? 0.8) * 100)}%</span>
                                    </div>
                                    <p className="text-[10px] text-zinc-500 mt-1">{aiEval?.models?.groq?.reasoning || "Standard assessment verification log."}</p>
                                  </div>
                                  <div className="bg-white p-2.5 rounded-lg border">
                                    <span className="font-extrabold text-zinc-700 block">Ollama Local LLM (Llama 3.2):</span>
                                    <div className="mt-1 flex items-center gap-2">
                                      <span className="font-bold text-amber-600">{aiEval?.models?.ollama?.score ?? ans.aiGrade} pts</span>
                                      <span className="text-[10px] text-zinc-400">Confidence: {Math.round((aiEval?.models?.ollama?.confidence ?? 0.75) * 100)}%</span>
                                    </div>
                                    <p className="text-[10px] text-zinc-500 mt-1">{aiEval?.models?.ollama?.reasoning || "Standard evaluation alignment log."}</p>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Instructor grading Override */}
                            <div className="border-t pt-3 flex flex-col sm:flex-row gap-4 items-end sm:items-center justify-between">
                              <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                                <div className="flex flex-col gap-1 sm:col-span-1">
                                  <label className="text-[11px] font-bold text-[#676767]">Final Grade Score</label>
                                  <input
                                    type="number"
                                    step="0.5"
                                    max={question.points}
                                    value={gradeData.manualGrade}
                                    onChange={(e) => {
                                      const val = Number(e.target.value);
                                      const status = val === ans.aiGrade ? "accepted" : "modified";
                                      setManualGrades({
                                        ...manualGrades,
                                        [ans.id]: { ...gradeData, manualGrade: val, overrideStatus: status }
                                      });
                                    }}
                                    className="bg-[#f6f6f6] border rounded-lg py-1.5 px-3 text-[13px]"
                                  />
                                </div>
                                <div className="flex flex-col gap-1 sm:col-span-2">
                                  <label className="text-[11px] font-bold text-[#676767]">Feedback Comments</label>
                                  <input
                                    type="text"
                                    value={gradeData.feedback}
                                    onChange={(e) => {
                                      setManualGrades({
                                        ...manualGrades,
                                        [ans.id]: { ...gradeData, feedback: e.target.value }
                                      });
                                    }}
                                    placeholder="Well explained, check code logic..."
                                    className="bg-[#f6f6f6] border rounded-lg py-1.5 px-3 text-[13px]"
                                  />
                                </div>
                              </div>

                              {/* Overrides Control Actions */}
                              <div className="flex gap-2 w-full sm:w-auto shrink-0 justify-end pt-2 sm:pt-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setManualGrades({
                                      ...manualGrades,
                                      [ans.id]: { ...gradeData, manualGrade: ans.aiGrade || 0, overrideStatus: "accepted" }
                                    });
                                    toast.success("AI evaluation score accepted!");
                                  }}
                                  className="bg-[#f6f6f6] hover:bg-[#e6e6e6] text-[#1a1917] text-[10px] font-bold px-3 py-2 rounded-lg border border-[#dedede] transition cursor-pointer"
                                >
                                  Accept AI
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setManualGrades({
                                      ...manualGrades,
                                      [ans.id]: { ...gradeData, manualGrade: 0, overrideStatus: "rejected" }
                                    });
                                    toast.error("AI score rejected! Score set to 0. Please modify as needed.");
                                  }}
                                  className="bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] font-bold px-3 py-2 rounded-lg border border-rose-200 transition cursor-pointer"
                                >
                                  Reject AI
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Right: Violation alerts index */}
                    <div className="space-y-6">
                      <SessionRecordingPlayer
                        key={selectedAttempt.id}
                        attemptId={selectedAttempt.id}
                        violations={selectedAttempt.violations ?? []}
                      />
                      <div className="bg-white border border-[#dedede] rounded-2xl p-5 shadow-sm space-y-4">
                        <h4 className="text-sm font-bold border-b pb-2">Integrity Summary</h4>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-[#8a8a8a]">Integrity Index</span>
                          <span className={`text-base font-extrabold ${selectedAttempt.integrityScore < 70 ? "text-red-500" : "text-emerald-500"}`}>
                            {selectedAttempt.integrityScore}%
                          </span>
                        </div>

                        <div className="space-y-3 pt-2">
                          <span className="text-xs font-bold text-[#676767] block">Integrity Violation Logs</span>
                          {selectedAttempt.violations && selectedAttempt.violations.length > 0 ? (
                            selectedAttempt.violations.map((v: any, vIdx: number) => (
                              <div key={vIdx} className="bg-rose-50/50 border border-rose-100 rounded-xl p-3 flex gap-2">
                                <AlertTriangle className="size-4.5 text-red-500 shrink-0 mt-0.5" />
                                <div>
                                  <span className="text-xs font-bold text-red-700 capitalize">{v.type.replace("-", " ")}</span>
                                  <p className="text-[10px] text-red-600/80 leading-tight mt-0.5">{v.description}</p>
                                </div>
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-emerald-600 font-semibold">No integrity policy violations logged.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: ANALYTICS HUB */}
          {activeTab === "Section Results" && (
            <SectionResults
              assessments={assessments.map((a: any) => ({ id: a.id, title: a.title }))}
              lastCompletion={lastCompletion}
            />
          )}

          {activeTab === "Analytics Hub" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">Assessment Analytics</h1>
                  <p className="text-xs text-[#8a8a8a]">Performance statistics, integrity indices, and question level metrics.</p>
                </div>
                
                <select
                  value={analyticsId || ""}
                  onChange={(e) => {
                    setAnalyticsId(e.target.value || null);
                    setAnalyticsData(null);
                  }}
                  className="bg-white border border-[#dedede] rounded-xl py-2 px-4 text-xs font-bold shadow-sm"
                >
                  <option value="">Select Assessment to Analyze</option>
                  {assessments.map((a) => (
                    <option key={a.id} value={a.id}>{a.title}</option>
                  ))}
                </select>
              </div>

              {!analyticsId ? (
                <div className="bg-white border border-[#dedede] rounded-2xl p-10 text-center text-sm text-[#8a8a8a] shadow-sm">
                  Please select an assessment to generate performance analytics.
                </div>
              ) : !analyticsData ? (
                <div className="py-10 text-center text-[#8a8a8a]">Generating report stats...</div>
              ) : (
                <div className="space-y-6">
                  {/* Stats Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    {[
                      { title: "Total Attempts", value: analyticsData.totalAttempts, footer: "Completed submissions" },
                      { title: "Average Score", value: analyticsData.averageScore, footer: "Out of maximum points", valueColor: "text-[#b2b2b2]" },
                      { title: "Average Integrity Index", value: `${analyticsData.averageIntegrity}%`, footer: "Consistent candidate behavior", valueColor: "text-emerald-600" },
                      { title: "Total Violations", value: analyticsData.totalViolations, footer: "Flagged security alerts", valueColor: "text-red-500" }
                    ].map((card, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: i * 0.05 }}
                        whileHover={{ y: -4, scale: 1.025, boxShadow: "0 10px 20px -5px rgba(128,128,128,0.12), 0 0 0 1px rgba(178, 178, 178, 0.3)", borderColor: "rgba(178, 178, 178, 0.5)" }}
                        className="bg-white border border-[#dedede] rounded-2xl p-5 shadow-sm transition-all duration-300"
                      >
                        <span className="text-[11px] font-bold text-[#8a8a8a] uppercase tracking-wider">{card.title}</span>
                        <div className={`text-3xl font-extrabold mt-1 ${card.valueColor || "text-zinc-950"}`}>{card.value}</div>
                        <span className="text-[11.5px] text-[#676767] mt-1.5 block">{card.footer}</span>
                      </motion.div>
                    ))}
                  </div>

                  {/* Graphs Row */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Score distribution chart */}
                    <div className="bg-white border border-[#dedede] rounded-2xl p-5 shadow-sm">
                      <h3 className="text-sm font-bold mb-4">Score Distribution Profile</h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={analyticsData.scoreDistribution}>
                            <defs>
                              <linearGradient id="scoreColor" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#b2b2b2" stopOpacity={0.4}/>
                                <stop offset="95%" stopColor="#b2b2b2" stopOpacity={0.0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#dedede" opacity={0.3} />
                            <XAxis dataKey="range" fontSize={11} stroke="#8a8a8a" />
                            <YAxis fontSize={11} stroke="#8a8a8a" />
                            <Tooltip 
                              contentStyle={{
                                backgroundColor: "#ffffff",
                                borderColor: "#dedede",
                                borderRadius: "12px",
                                boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.05)",
                                fontSize: "11px",
                                fontFamily: "Inter, sans-serif"
                              }}
                              itemStyle={{ color: "#1a1917" }}
                              labelStyle={{ fontWeight: "bold", color: "#8a8a8a" }}
                            />
                            <Area type="monotone" dataKey="count" stroke="#b2b2b2" strokeWidth={2} fillOpacity={1} fill="url(#scoreColor)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Violation breakdown */}
                    <div className="bg-white border border-[#dedede] rounded-2xl p-5 shadow-sm">
                      <h3 className="text-sm font-bold mb-4">Violation Alerts Categorization</h3>
                      {analyticsData.violationBreakdown.length === 0 ? (
                        <div className="h-64 flex items-center justify-center text-xs text-[#8a8a8a] border border-dashed rounded-xl">
                          No violations recorded. Perfect integrity score record!
                        </div>
                      ) : (
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={analyticsData.violationBreakdown}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                outerRadius={80}
                                fill="#8884d8"
                                dataKey="count"
                                nameKey="type"
                                label={({ name, percent }) => `${name.replace("-", " ")}: ${(percent * 100).toFixed(0)}%`}
                              >
                                {analyticsData.violationBreakdown.map((entry: any, index: number) => (
                                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Question analysis */}
                  <div className="bg-white border border-[#dedede] rounded-2xl p-5 shadow-sm">
                    <h3 className="text-sm font-bold mb-4">Item Difficulty & Learning Outcome Success Rate</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b border-[#dedede]/50 text-left text-xs font-bold text-[#8a8a8a] uppercase">
                            <th className="pb-3">Question Text</th>
                            <th className="pb-3">Type</th>
                            <th className="pb-3">Outcome</th>
                            <th className="pb-3">Difficulty</th>
                            <th className="pb-3 text-right">Attainment Rate</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#dedede]/30">
                          {analyticsData.questionStats.map((qs: any, idx: number) => (
                            <tr key={idx} className="hover:bg-[#f6f6f6]/30 transition-colors">
                              <td className="py-3.5 text-xs font-bold text-[#1a1917] truncate max-w-xs">{qs.text}</td>
                              <td className="py-3.5 text-xs capitalize">{qs.type}</td>
                              <td className="py-3.5 text-xs font-bold">{qs.learningOutcome}</td>
                              <td className="py-3.5">
                                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                                  qs.difficulty === "hard" 
                                    ? "bg-red-50 text-red-600" 
                                    : qs.difficulty === "medium" 
                                    ? "bg-amber-50 text-amber-600" 
                                    : "bg-emerald-50 text-emerald-600"
                                }`}>
                                  {qs.difficulty}
                                </span>
                              </td>
                              <td className="py-3.5 text-right font-extrabold text-xs">
                                <div className="flex items-center justify-end gap-2">
                                  <div className="w-20 bg-[#f6f6f6] h-1.5 rounded-full overflow-hidden hidden sm:block">
                                    <div className={`h-full rounded-full ${qs.successRate > 70 ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${qs.successRate}%` }} />
                                  </div>
                                  <span>{qs.successRate}%</span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 6: AUDIT TRAILS */}
          {activeTab === "Audit Trails" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">Compliance & AI Audit Trail</h1>
                  <p className="text-xs text-[#8a8a8a]">Immutable records of AI grading decisions, similarity checks, risk ratings, and faculty overrides.</p>
                </div>
                
                <select
                  value={auditId || ""}
                  onChange={(e) => {
                    setAuditId(e.target.value || null);
                    setAuditLogs([]);
                  }}
                  className="bg-white border border-[#dedede] rounded-xl py-2 px-4 text-xs font-bold shadow-sm cursor-pointer"
                >
                  <option value="">Select Assessment to Audit</option>
                  {assessments.map((a) => (
                    <option key={a.id} value={a.id}>{a.title}</option>
                  ))}
                </select>
              </div>

              {!auditId ? (
                <div className="bg-white border border-[#dedede] rounded-2xl p-10 text-center text-sm text-[#8a8a8a] shadow-sm">
                  Please select an assessment to load its compliance audit log.
                </div>
              ) : isAuditLoading ? (
                <div className="py-10 text-center text-[#8a8a8a]">Fetching audit records...</div>
              ) : auditLogs.length === 0 ? (
                <div className="bg-white border border-[#dedede] rounded-2xl p-10 text-center text-sm text-[#8a8a8a] shadow-sm">
                  No evaluation audit records found for this assessment yet.
                </div>
              ) : (
                <div className="bg-white border border-[#dedede] rounded-2xl p-5 shadow-sm space-y-4">
                  <h3 className="text-base font-bold">Immutable Audit Logs ({auditLogs.length})</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b border-[#dedede]/50 text-left text-xs font-bold text-[#8a8a8a] uppercase">
                          <th className="pb-3 pr-4">Timestamp</th>
                          <th className="pb-3 px-4">Evaluator Agent</th>
                          <th className="pb-3 px-4 text-center">AI Score</th>
                          <th className="pb-3 px-4 text-center">Final Score</th>
                          <th className="pb-3 px-4 text-center">Override Status</th>
                          <th className="pb-3 px-4">Faculty Reviewer</th>
                          <th className="pb-3 pl-4">Student Answer</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#dedede]/30 text-xs">
                        {auditLogs.map((log) => {
                          let mods: any = {};
                          try {
                            mods = log.facultyModifications ? JSON.parse(log.facultyModifications) : {};
                          } catch (e) {}
                          
                          return (
                            <tr key={log.id} className="hover:bg-[#f6f6f6]/30 transition-colors">
                              <td className="py-3 pr-4 font-semibold text-zinc-500 whitespace-nowrap">
                                {new Date(log.timestamp).toLocaleString()}
                              </td>
                              <td className="py-3 px-4 font-semibold text-zinc-800">{log.modelUsed}</td>
                              <td className="py-3 px-4 font-bold text-amber-600 text-center">{log.aiScore} pts</td>
                              <td className="py-3 px-4 font-bold text-emerald-600 text-center">{log.finalAnswerScore} pts</td>
                              <td className="py-3 px-4 text-center">
                                <span className={`inline-flex items-center gap-1 text-[9px] font-extrabold px-2 py-0.5 rounded-full border uppercase ${
                                  log.overrideStatus === "accepted"
                                    ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                                    : log.overrideStatus === "modified"
                                    ? "text-amber-700 bg-amber-50 border-amber-200"
                                    : log.overrideStatus === "rejected"
                                    ? "text-rose-700 bg-rose-50 border-rose-200"
                                    : "text-zinc-600 bg-zinc-50 border-zinc-200"
                                }`}>
                                  {log.overrideStatus}
                                </span>
                              </td>
                              <td className="py-3 px-4 font-semibold text-zinc-700">
                                {log.facultyName || "System Auto"}
                                {log.facultyId && <span className="block text-[9px] text-[#8a8a8a] font-mono leading-none mt-0.5">{log.facultyId.slice(-8)}</span>}
                              </td>
                              <td className="py-3 pl-4 max-w-[200px] truncate text-zinc-600" title={log.originalAnswer}>
                                {log.originalAnswer}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 7: MESSAGES */}
          {activeTab === "Messages" && (
            <FacultyMessagingView />
          )}

          {/* TAB 8: AI ASSISTANT (verified faculty only — enforced server-side) */}
          {activeTab === "AI Assistant" && <FacultyAIChat user={user} />}
        </main>
      </div>
    </SidebarProvider>
  );
}
