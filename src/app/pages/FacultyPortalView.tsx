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
} from "lucide-react";
import { toast } from "sonner";
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
import { FacultyMessagingView } from "./FacultyMessagingView";
import { io } from "socket.io-client";

interface FacultyPortalViewProps {
  user: any;
  session: any;
  handleLogout: () => void;
}

export default function FacultyPortalView({ user, session, handleLogout }: FacultyPortalViewProps) {
  const [activeTab, setActiveTab] = useState("Overview");
  
  // State for assessments list
  const [assessments, setAssessments] = useState<any[]>([]);
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

  // Shield integrity controls
  const [shieldWebcam, setShieldWebcam] = useState(true);
  const [shieldMic, setShieldMic] = useState(false);
  const [shieldLockdown, setShieldLockdown] = useState(true);
  const [shieldFace, setShieldFace] = useState(true);
  const [shieldGaze, setShieldGaze] = useState(true);
  const [shieldTab, setShieldTab] = useState(true);
  const [shieldBehavior, setShieldBehavior] = useState(false);

  // Resume & Attempt controls states
  const [shieldAllowResume, setShieldAllowResume] = useState(true);
  const [shieldMaxResumeCount, setShieldMaxResumeCount] = useState("3");
  const [shieldResumeTimeWindow, setShieldResumeTimeWindow] = useState("15");
  const [shieldResumeAfterDisconnect, setShieldResumeAfterDisconnect] = useState(true);
  const [shieldResumeAfterCrash, setShieldResumeAfterCrash] = useState(true);
  const [shieldResumeAfterLogout, setShieldResumeAfterLogout] = useState(false);
  const [shieldRetakeAllowed, setShieldRetakeAllowed] = useState(false);
  const [shieldRetakeDate, setShieldRetakeDate] = useState("");
  const [shieldAttemptLock, setShieldAttemptLock] = useState(false);
  const [shieldLateSubmission, setShieldLateSubmission] = useState(false);

  // Active proctoring selection
  const [proctorId, setProctorId] = useState<string | null>(null);
  const [proctorAttempts, setProctorAttempts] = useState<any[]>([]);
  
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

  // Listen for real-time WebSocket proctor updates
  useEffect(() => {
    const socket = io();

    if (proctorId) {
      socket.emit("join-room", `assessment-proctoring-${proctorId}`);
    }

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
      setProctorAttempts((prev) => {
        const idx = prev.findIndex((att) => att.id === telemetry.attemptId);
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = {
            ...next[idx],
            integrityScore: telemetry.integrityScore,
            breakdown: telemetry.breakdown,
            warningCount: telemetry.warningCount,
            proctoringStatus: telemetry.proctoringStatus,
            activeViolations: telemetry.activeViolations,
            correlatedIncidents: telemetry.correlatedIncidents,
          };
          return next;
        }
        return prev;
      });
    });

    socket.on("student-online", (data: any) => {
      toast.info(`Candidate ${data.studentName} is online in proctored session.`);
    });

    socket.on("student-offline", (data: any) => {
      toast.warning(`Candidate ${data.studentName} has disconnected.`);
    });

    return () => {
      if (proctorId) {
        socket.emit("leave-room", `assessment-proctoring-${proctorId}`);
      }
      socket.disconnect();
    };
  }, [proctorId]);

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
    <div className="min-h-screen bg-[#F5EEDC] text-[#1a1917] flex font-sans w-full overflow-x-hidden">
      {/* Sidebar Panel */}
      <aside className="w-[260px] bg-white border-r border-[#ebdcc9] shrink-0 hidden md:flex flex-col justify-between select-none">
        <div>
          <div className="flex items-center gap-3 px-6 py-5 border-b border-[#ebdcc9]/40">
            <img src={imgAssessmentIntegrityLogo} alt="Logo" className="h-8 w-auto object-contain" />
            <h2 className="text-[18px] font-extrabold tracking-tight text-[#1a1917]">IntegrityOS</h2>
          </div>

          <div className="px-6 pt-6 pb-2">
            <span className="text-[10px] font-bold text-[#8e8a80] uppercase tracking-wider">Faculty Portal</span>
          </div>

          <nav className="px-3 space-y-1">
            {[
              { name: "Overview", icon: LayoutDashboard },
              { name: "Messages", icon: MessageSquare },
              { name: "Assessment Builder", icon: PlusCircle },
              { name: "Proctoring", icon: Video },
              { name: "Evaluation Queue", icon: FileCheck },
              { name: "Analytics Hub", icon: BarChart3 },
              { name: "Audit Trails", icon: Shield }
            ].map((link) => {
              const Icon = link.icon;
              const isActive = activeTab === link.name;
              return (
                <button
                  key={link.name}
                  type="button"
                  onClick={() => setActiveTab(link.name)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer ${
                    isActive
                      ? "bg-[#F5EEDC] text-[#1a1917] font-semibold"
                      : "text-[#6b6760] hover:bg-[#FAF6EE] hover:text-[#1a1917]"
                  }`}
                >
                  <Icon className={`size-4.5 shrink-0 ${isActive ? "text-[#1a1917]" : "text-[#8e8a80]"}`} />
                  {link.name}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-[#ebdcc9]/40">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-[#6b6760] hover:bg-rose-50 hover:text-rose-600 transition-all cursor-pointer border border-transparent hover:border-rose-100"
          >
            <LogOut className="size-4.5 text-[#8e8a80] group-hover:text-rose-600" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Workspace Frame */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-[#ebdcc9] bg-white/70 backdrop-blur-md px-6 md:px-8 flex items-center justify-between sticky top-0 z-20">
          <div className="text-[13.5px] font-semibold text-[#6b6760]">
            University: <span className="text-[#1a1917] font-bold">{user.institutionName || "SRM University AP"}</span>
          </div>

          <div className="flex items-center gap-4">
            <NotificationCenter />
            <div 
              className="flex items-center gap-3 border-l border-[#ebdcc9] pl-4 cursor-pointer group"
              onClick={() => window.dispatchEvent(new CustomEvent("open-profile-drawer"))}
            >
              <div className="text-right hidden sm:block">
                <div className="text-[13.5px] font-bold leading-tight text-[#1a1917] group-hover:text-zinc-600 transition-colors">{user.name}</div>
                <div className="text-[11px] font-semibold text-[#8e8a80] leading-none mt-0.5">Faculty Administrator</div>
              </div>
              <div className="w-9 h-9 rounded-full bg-[#1a1917] border border-[#c5af8a] text-white flex items-center justify-center font-bold text-sm group-hover:scale-105 transition-all">
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
                  <p className="text-xs text-[#8e8a80]">Manage exams, proctor live sessions, and review submissions.</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleLoadSample}
                    className="bg-[#FAF6EE] border border-[#ebdcc9] text-[#1a1917] hover:bg-[#eae6db] px-4 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all cursor-pointer flex items-center gap-2"
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
                  { title: "Active Exams", value: assessments.filter((a) => a.published).length, footer: "Published and open", valueColor: "text-emerald-600" },
                  { title: "Draft Exams", value: assessments.filter((a) => !a.published).length, footer: "In creation phase", valueColor: "text-amber-500" },
                  { title: "University Matches", value: "SRM AP", footer: "Connected with matching students", valueColor: "text-[#c5af8a]" }
                ].map((stat, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.05 }}
                    whileHover={{ y: -4, scale: 1.025, boxShadow: "0 10px 20px -5px rgba(142,126,98,0.12), 0 0 0 1px rgba(197, 175, 138, 0.3)", borderColor: "rgba(197, 175, 138, 0.5)" }}
                    className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-sm transition-all duration-300"
                  >
                    <span className="text-[11px] font-bold text-[#8e8a80] uppercase tracking-wider">{stat.title}</span>
                    <div className={`text-3xl font-extrabold mt-1 ${stat.valueColor || "text-zinc-950"}`}>{stat.value}</div>
                    <span className="text-[11.5px] text-[#6b6760] mt-1.5 block">{stat.footer}</span>
                  </motion.div>
                ))}
              </div>

              {/* Assessments List Table */}
              <div className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-sm">
                <h3 className="text-base font-bold mb-4">Assessments Inventory</h3>
                {isLoading ? (
                  <div className="py-10 text-center text-[#8e8a80]">Loading...</div>
                ) : assessments.length === 0 ? (
                  <div className="py-12 text-center text-[#8e8a80] border border-dashed border-[#ebdcc9] rounded-xl flex flex-col items-center justify-center gap-4 bg-[#FAF6EE]/30">
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
                        <tr className="border-b border-[#ebdcc9]/50 text-left text-xs font-bold text-[#8e8a80] uppercase">
                          <th className="pb-3">Title</th>
                          <th className="pb-3">Duration</th>
                          <th className="pb-3">Questions</th>
                          <th className="pb-3">Attempts</th>
                          <th className="pb-3">Status</th>
                          <th className="pb-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#ebdcc9]/30">
                        {assessments.map((a) => (
                          <tr key={a.id} className="hover:bg-[#FAF6EE]/30 transition-colors">
                            <td className="py-4 text-sm font-bold text-[#1a1917]">
                              {a.title}
                              {a.description && <span className="block text-xs font-normal text-[#8e8a80] mt-0.5">{a.description}</span>}
                            </td>
                            <td className="py-4 text-xs font-semibold">{a.duration} mins</td>
                            <td className="py-4 text-xs font-semibold">{a._count?.questions || 0} items</td>
                            <td className="py-4 text-xs font-semibold">{a._count?.attempts || 0} submitted</td>
                            <td className="py-4">
                              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                a.published 
                                  ? "text-emerald-600 bg-emerald-50 border-emerald-100" 
                                  : "text-amber-600 bg-amber-50 border-amber-100"
                              }`}>
                                {a.published ? "Published" : "Draft"}
                              </span>
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
                <p className="text-xs text-[#8e8a80]">Design a secure, proctored assessment with custom grading configurations.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Form: Parameters */}
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-sm space-y-4">
                    <h3 className="text-base font-bold border-b pb-2">1. Exam Information</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-[#6b6760]">Assessment Title</label>
                        <input
                          type="text"
                          value={newTitle}
                          onChange={(e) => setNewTitle(e.target.value)}
                          placeholder="e.g. Midterm Algorithms Design"
                          className="bg-[#FAF6EE] border border-[#ebdcc9]/60 rounded-xl py-2 px-3 text-[13.5px] placeholder:text-[#a7a297]"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-[#6b6760]">Duration (minutes)</label>
                        <input
                          type="number"
                          value={newDuration}
                          onChange={(e) => setNewDuration(e.target.value)}
                          placeholder="60"
                          className="bg-[#FAF6EE] border border-[#ebdcc9]/60 rounded-xl py-2 px-3 text-[13.5px]"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-[#6b6760]">Grading Scheme</label>
                        <select
                          value={newGrading}
                          onChange={(e) => setNewGrading(e.target.value)}
                          className="bg-[#FAF6EE] border border-[#ebdcc9]/60 rounded-xl py-2 px-3 text-[13.5px]"
                        >
                          <option value="points">Points System</option>
                          <option value="percentage">Percentage Scale</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-[#6b6760]">Attempts Allowed</label>
                        <input
                          type="number"
                          value={newLimit}
                          onChange={(e) => setNewLimit(e.target.value)}
                          placeholder="1"
                          className="bg-[#FAF6EE] border border-[#ebdcc9]/60 rounded-xl py-2 px-3 text-[13.5px]"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-[#6b6760]">Availability Start</label>
                        <input
                          type="datetime-local"
                          value={newStart}
                          onChange={(e) => setNewStart(e.target.value)}
                          className="bg-[#FAF6EE] border border-[#ebdcc9]/60 rounded-xl py-2 px-3 text-[13.5px]"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-[#6b6760]">Availability End</label>
                        <input
                          type="datetime-local"
                          value={newEnd}
                          onChange={(e) => setNewEnd(e.target.value)}
                          className="bg-[#FAF6EE] border border-[#ebdcc9]/60 rounded-xl py-2 px-3 text-[13.5px]"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-[#6b6760]">Description / Instructions</label>
                      <textarea
                        rows={2}
                        value={newDesc}
                        onChange={(e) => setNewDesc(e.target.value)}
                        placeholder="Provide dynamic information or instructions..."
                        className="bg-[#FAF6EE] border border-[#ebdcc9]/60 rounded-xl py-2 px-3 text-[13.5px]"
                      />
                    </div>
                  </div>

                  {/* Question Builder */}
                  <div className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-sm space-y-4">
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
                      <div className="py-8 text-center text-xs text-[#8e8a80] border border-dashed rounded-xl">
                        No questions added yet. Choose a question format above.
                      </div>
                    ) : (
                      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
                        {questions.map((q, idx) => (
                          <div key={q.id} className="border border-[#ebdcc9]/60 rounded-xl p-4 bg-[#FAF6EE]/20 relative space-y-3">
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
                              <label className="text-[11px] font-bold text-[#8e8a80]">Question Text</label>
                              <input
                                type="text"
                                value={q.text}
                                onChange={(e) => updateQuestionField(idx, "text", e.target.value)}
                                placeholder="Enter question content..."
                                className="bg-white border border-[#ebdcc9]/60 rounded-lg py-1.5 px-3 text-[13px]"
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
                                <label className="text-[10px] font-bold text-[#8e8a80]">Correct Answer / Verification Key</label>
                                <input
                                  type="text"
                                  value={q.correctAnswer}
                                  onChange={(e) => updateQuestionField(idx, "correctAnswer", e.target.value)}
                                  placeholder="Answer text/option..."
                                  className="bg-white border border-[#ebdcc9]/60 rounded-lg py-1 px-2 text-[12px]"
                                />
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-[#8e8a80]">Points</label>
                                <input
                                  type="number"
                                  value={q.points}
                                  onChange={(e) => updateQuestionField(idx, "points", e.target.value)}
                                  className="bg-white border border-[#ebdcc9]/60 rounded-lg py-1 px-2 text-[12px]"
                                />
                              </div>
                              <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold text-[#8e8a80]">Difficulty</label>
                                <select
                                  value={q.difficulty}
                                  onChange={(e) => updateQuestionField(idx, "difficulty", e.target.value)}
                                  className="bg-white border border-[#ebdcc9]/60 rounded-lg py-1 px-2 text-[12px]"
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
                  <div className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-sm space-y-4">
                    <h3 className="text-base font-bold border-b pb-2 flex items-center gap-2">
                      <Shield className="size-5 text-[#c5af8a]" /> Integrity Controls
                    </h3>
                    <p className="text-xs text-[#8e8a80]">Configure advanced AI security settings for students during this examination.</p>

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
                        <div key={idx} className="flex items-start justify-between gap-3 p-2 border rounded-xl hover:bg-[#FAF6EE]/50 transition">
                          <div>
                            <span className="text-xs font-bold text-[#1a1917] block">{item.title}</span>
                            <span className="text-[10px] text-[#8e8a80] leading-none mt-0.5">{item.desc}</span>
                          </div>
                          <input
                            type="checkbox"
                            checked={item.state}
                            onChange={(e) => item.setter(e.target.checked)}
                            className="size-4.5 rounded text-[#1a1917] border-gray-300 focus:ring-[#c5af8a] mt-1 cursor-pointer"
                          />
                        </div>
                      ))}
                    </div>

                    <h3 className="text-base font-bold border-b pb-2 pt-4 flex items-center gap-2">
                      <Clock className="size-5 text-[#c5af8a]" /> Resume & Attempt Rules
                    </h3>
                    <div className="space-y-3.5 pt-2 text-xs">
                      {/* Allow Resume */}
                      <div className="flex items-start justify-between gap-3 p-2 border rounded-xl hover:bg-[#FAF6EE]/50 transition">
                        <div>
                          <span className="font-bold text-[#1a1917] block">Allow Resume</span>
                          <span className="text-[10px] text-[#8e8a80] leading-none mt-0.5">Allow candidates to resume exam if disconnected</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={shieldAllowResume}
                          onChange={(e) => setShieldAllowResume(e.target.checked)}
                          className="size-4.5 rounded text-[#1a1917] border-gray-300 focus:ring-[#c5af8a] mt-1 cursor-pointer"
                        />
                      </div>

                      {shieldAllowResume && (
                        <div className="pl-4 space-y-3 border-l-2 border-[#ebdcc9] ml-2">
                          <div className="flex flex-col gap-1">
                            <label className="font-bold text-[#6b6760]">Maximum Resume Count</label>
                            <input
                              type="number"
                              value={shieldMaxResumeCount}
                              onChange={(e) => setShieldMaxResumeCount(e.target.value)}
                              className="bg-[#FAF6EE] border border-[#ebdcc9]/60 rounded-xl py-1.5 px-3 text-[12px] focus:outline-none"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="font-bold text-[#6b6760]">Resume Time Window (minutes)</label>
                            <input
                              type="number"
                              value={shieldResumeTimeWindow}
                              onChange={(e) => setShieldResumeTimeWindow(e.target.value)}
                              className="bg-[#FAF6EE] border border-[#ebdcc9]/60 rounded-xl py-1.5 px-3 text-[12px] focus:outline-none"
                            />
                          </div>

                          <div className="flex items-start justify-between gap-3 hover:bg-[#FAF6EE]/30 p-1.5 rounded-lg">
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

                          <div className="flex items-start justify-between gap-3 hover:bg-[#FAF6EE]/30 p-1.5 rounded-lg">
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

                          <div className="flex items-start justify-between gap-3 hover:bg-[#FAF6EE]/30 p-1.5 rounded-lg">
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
                      <div className="flex items-start justify-between gap-3 p-2 border rounded-xl hover:bg-[#FAF6EE]/50 transition">
                        <div>
                          <span className="font-bold text-[#1a1917] block">Retake Allowed</span>
                          <span className="text-[10px] text-[#8e8a80] leading-none mt-0.5">Allows student to start a new attempt if failed</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={shieldRetakeAllowed}
                          onChange={(e) => setShieldRetakeAllowed(e.target.checked)}
                          className="size-4.5 rounded text-[#1a1917] border-gray-300 focus:ring-[#c5af8a] mt-1 cursor-pointer"
                        />
                      </div>

                      {shieldRetakeAllowed && (
                        <div className="pl-4 space-y-3 border-l-2 border-[#ebdcc9] ml-2">
                          <div className="flex flex-col gap-1">
                            <label className="font-bold text-[#6b6760]">Retake Date</label>
                            <input
                              type="datetime-local"
                              value={shieldRetakeDate}
                              onChange={(e) => setShieldRetakeDate(e.target.value)}
                              className="bg-[#FAF6EE] border border-[#ebdcc9]/60 rounded-xl py-1.5 px-3 text-[12px] focus:outline-none"
                            />
                          </div>
                        </div>
                      )}

                      {/* Attempt Lock */}
                      <div className="flex items-start justify-between gap-3 p-2 border rounded-xl hover:bg-[#FAF6EE]/50 transition">
                        <div>
                          <span className="font-bold text-[#1a1917] block">Attempt Lock</span>
                          <span className="text-[10px] text-[#8e8a80] leading-none mt-0.5">Instantly lock all active/new exam entries</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={shieldAttemptLock}
                          onChange={(e) => setShieldAttemptLock(e.target.checked)}
                          className="size-4.5 rounded text-[#1a1917] border-gray-300 focus:ring-[#c5af8a] mt-1 cursor-pointer"
                        />
                      </div>

                      {/* Late Submission */}
                      <div className="flex items-start justify-between gap-3 p-2 border rounded-xl hover:bg-[#FAF6EE]/50 transition">
                        <div>
                          <span className="font-bold text-[#1a1917] block">Late Submission Allowed</span>
                          <span className="text-[10px] text-[#8e8a80] leading-none mt-0.5">Allow submissions after availability date ends</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={shieldLateSubmission}
                          onChange={(e) => setShieldLateSubmission(e.target.checked)}
                          className="size-4.5 rounded text-[#1a1917] border-gray-300 focus:ring-[#c5af8a] mt-1 cursor-pointer"
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
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">Real-Time Proctoring</h1>
                  <p className="text-xs text-[#8e8a80]">Continuously monitors student streams, integrity indexes, and alerts.</p>
                </div>
                {/* Selector */}
                <select
                  value={proctorId || ""}
                  onChange={(e) => {
                    setProctorId(e.target.value || null);
                    setProctorAttempts([]);
                  }}
                  className="bg-white border border-[#ebdcc9] rounded-xl py-2 px-4 text-xs font-bold shadow-sm"
                >
                  <option value="">Select Assessment to Proctor</option>
                  {assessments.map((a) => (
                    <option key={a.id} value={a.id}>{a.title}</option>
                  ))}
                </select>
              </div>

              {!proctorId ? (
                <div className="bg-white border border-[#ebdcc9] rounded-2xl p-10 text-center text-sm text-[#8e8a80] shadow-sm">
                  Please select an assessment from the dropdown to start live monitoring.
                </div>
              ) : proctorAttempts.length === 0 ? (
                <div className="bg-white border border-[#ebdcc9] rounded-2xl p-10 text-center text-sm text-[#8e8a80] shadow-sm">
                  No students currently online for this assessment. Live streams will load once candidates join.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {proctorAttempts.map((att) => {
                    const isHighRisk = att.integrityScore < 60;
                    const isMedRisk = att.integrityScore >= 60 && att.integrityScore < 85;
                    const lastAlert = att.violations?.[att.violations.length - 1];

                    return (
                      <div
                        key={att.id}
                        className={`bg-white border rounded-2xl overflow-hidden shadow-md flex flex-col justify-between transition-all duration-300 ${
                          isHighRisk 
                            ? "border-red-400 ring-2 ring-red-100" 
                            : isMedRisk 
                            ? "border-amber-400" 
                            : "border-[#ebdcc9]"
                        }`}
                      >
                        {/* Video Header Card */}
                        <div className="p-4 border-b border-[#ebdcc9]/40 bg-[#fafcf7] flex justify-between items-center">
                          <div>
                            <span className="font-extrabold text-xs text-[#1a1917] block">{att.studentName}</span>
                            <span className="text-[10px] text-[#8e8a80] font-mono">{att.id.slice(-8).toUpperCase()}</span>
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

                          {/* Visual AI box overlay */}
                          {att.status === "started" && (att.faceStatus === "Detected" || !att.faceStatus) && (
                            <div className="absolute border border-dashed border-emerald-500 rounded px-2 py-0.5 text-[9px] text-emerald-400 font-bold bg-emerald-950/20 top-[30%] left-[20%]">
                              Verified Student • Match: 98%
                            </div>
                          )}
                          
                          {att.status === "started" && att.faceStatus && att.faceStatus !== "Detected" && (
                            <div className="absolute border border-dashed border-red-500 rounded px-2 py-0.5 text-[9px] text-red-400 font-bold bg-red-950/20 top-[30%] left-[20%] animate-pulse">
                              WARNING: {att.faceStatus}
                            </div>
                          )}
                        </div>

                        {/* Live Telemetry HUD inside Card */}
                        <div className="p-4 grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs border-b border-[#ebdcc9]/40 bg-zinc-50/50">
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
                            <span className="font-semibold text-amber-600">{(att.violations?.length || 0)}</span>
                          </div>

                          <div className="flex justify-between items-center">
                            <span className="text-zinc-500">Resume Count</span>
                            <span className="font-semibold text-zinc-700">{att.resumeCount || 0}</span>
                          </div>

                          <div className="flex justify-between items-center col-span-2 border-t border-[#ebdcc9]/50 pt-2">
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
                        <div className="p-3.5 bg-white border-t border-b border-[#ebdcc9]/40 space-y-2">
                          <span className="text-[10px] font-extrabold text-[#8e8a80] uppercase tracking-wider block">
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
                        <div className="p-4 bg-[#FAF6EE]/30 flex-1 border-b border-[#ebdcc9]/40 max-h-36 overflow-y-auto space-y-2">
                          <span className="text-[10px] font-bold text-[#8e8a80] uppercase tracking-wider block">Real-Time Violation Alerts</span>
                          {att.violations && att.violations.length > 0 ? (
                            att.violations.map((v: any, vIdx: number) => (
                              <div key={vIdx} className="flex gap-1.5 items-start text-xs border-b border-[#ebdcc9]/20 pb-1.5 last:border-0 last:pb-0">
                                <AlertTriangle className={`size-3.5 shrink-0 mt-0.5 ${v.severity === "high" ? "text-red-500" : "text-amber-500"}`} />
                                <div>
                                  <span className="font-bold capitalize">{v.type.replace("-", " ")}</span>
                                  <p className="text-[10px] text-[#6b6760] leading-tight">{v.description}</p>
                                </div>
                              </div>
                            ))
                          ) : att.activeViolations && att.activeViolations.length > 0 ? (
                            att.activeViolations.map((msg: string, vIdx: number) => (
                              <div key={vIdx} className="flex gap-1.5 items-start text-xs border-b border-[#ebdcc9]/20 pb-1.5 last:border-0 last:pb-0">
                                <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-amber-500" />
                                <p className="text-[10px] text-[#6b6760] leading-tight font-medium">{msg}</p>
                              </div>
                            ))
                          ) : (
                            <p className="text-[11px] text-emerald-600 font-semibold">No anomalous behavior detected.</p>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="p-3 bg-white flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await fetch("/api/ai-proctoring/faculty/warning", {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                    "x-user-id": user.id,
                                    "x-user-role": "faculty",
                                  },
                                  body: JSON.stringify({
                                    attemptId: att.id,
                                    message: "Faculty Invigilator Notice: Please keep your attention focused on the test monitor.",
                                  }),
                                });
                                toast.success(`Warning dispatched to ${att.studentName}`);
                              } catch {
                                toast.error("Failed to send warning.");
                              }
                            }}
                            className="bg-amber-50 hover:bg-amber-100 text-amber-700 text-[10px] font-extrabold px-3 py-1.5 rounded-lg border border-amber-200 transition cursor-pointer"
                          >
                            Send Warning
                          </button>

                          {att.proctoringStatus === "PAUSED" ? (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await fetch("/api/ai-proctoring/faculty/resume", {
                                    method: "POST",
                                    headers: {
                                      "Content-Type": "application/json",
                                      "x-user-id": user.id,
                                      "x-user-role": "faculty",
                                    },
                                    body: JSON.stringify({ attemptId: att.id }),
                                  });
                                  toast.success(`${att.studentName}'s exam has been resumed.`);
                                } catch {
                                  toast.error("Failed to resume exam.");
                                }
                              }}
                              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-extrabold px-3 py-1.5 rounded-lg border border-emerald-200 transition cursor-pointer"
                            >
                              Resume Exam
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await fetch("/api/ai-proctoring/faculty/pause", {
                                    method: "POST",
                                    headers: {
                                      "Content-Type": "application/json",
                                      "x-user-id": user.id,
                                      "x-user-role": "faculty",
                                    },
                                    body: JSON.stringify({ attemptId: att.id }),
                                  });
                                  toast.warning(`${att.studentName}'s exam has been temporarily suspended.`);
                                } catch {
                                  toast.error("Failed to suspend exam.");
                                }
                              }}
                              className="bg-red-50 hover:bg-red-100 text-red-700 text-[10px] font-extrabold px-3 py-1.5 rounded-lg border border-red-200 transition cursor-pointer"
                            >
                              Suspend Exam
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: EVALUATION QUEUE */}
          {activeTab === "Evaluation Queue" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">AI-Assisted Evaluation</h1>
                  <p className="text-xs text-[#8e8a80]">Grade and evaluate objective answers, review AI suggestions, and finalize marks.</p>
                </div>
                
                <select
                  value={evalId || ""}
                  onChange={(e) => {
                    setEvalId(e.target.value || null);
                    setEvalAttempts([]);
                    setSelectedAttempt(null);
                  }}
                  className="bg-white border border-[#ebdcc9] rounded-xl py-2 px-4 text-xs font-bold shadow-sm"
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
                <div className="bg-white border border-[#ebdcc9] rounded-2xl p-10 text-center text-sm text-[#8e8a80] shadow-sm">
                  Please select an assessment to load student submission attempts.
                </div>
              ) : !selectedAttempt ? (
                /* Attempts list */
                <div className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-sm">
                  <h3 className="text-base font-bold mb-4">Submission Queue</h3>
                  {evalAttempts.length === 0 ? (
                    <div className="py-10 text-center text-[#8e8a80]">No submissions found for this assessment.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b border-[#ebdcc9]/50 text-left text-xs font-bold text-[#8e8a80] uppercase">
                            <th className="pb-3">Candidate</th>
                            <th className="pb-3">Submitted At</th>
                            <th className="pb-3">Auto Grade Score</th>
                            <th className="pb-3">Integrity Score</th>
                            <th className="pb-3">Status</th>
                            <th className="pb-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#ebdcc9]/30">
                          {evalAttempts.map((att) => (
                            <tr key={att.id} className="hover:bg-[#FAF6EE]/30 transition-colors">
                              <td className="py-4 text-sm font-bold text-[#1a1917]">{att.studentName}</td>
                              <td className="py-4 text-xs text-[#6b6760]">{att.submittedAt ? new Date(att.submittedAt).toLocaleString() : "Not submitted"}</td>
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
                      className="text-xs font-bold text-[#6b6760] hover:text-[#1a1917] transition cursor-pointer"
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
                          <div key={ans.id} className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-sm space-y-4">
                            {/* Question Header */}
                            <div className="flex items-start justify-between border-b pb-2">
                              <div>
                                <span className="text-xs font-bold text-[#8e8a80] block">Question {aIdx + 1} ({question.type})</span>
                                <p className="text-sm font-bold mt-1 text-[#1a1917]">{question.text}</p>
                              </div>
                              <span className="text-xs font-extrabold text-[#c5af8a] bg-[#fffbf2] border px-3 py-1 rounded-full">
                                {question.points} Points Max
                              </span>
                            </div>

                            {/* Reference / Rubric Answer */}
                            {question.correctAnswer && (
                              <div className="bg-[#fffdf9] border border-dashed border-[#c5af8a]/35 rounded-xl p-3 text-xs">
                                <span className="font-bold text-[#c5af8a] block">Expected Answer / Rubric:</span>
                                <p className="mt-1 text-[#6b6760] whitespace-pre-wrap">{question.correctAnswer}</p>
                              </div>
                            )}

                            {/* Student Answer */}
                            <div className="bg-[#FAF6EE]/30 border rounded-xl p-3">
                              <span className="text-[10px] font-bold text-[#8e8a80] uppercase tracking-wider block">Student Response</span>
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
                                  <label className="text-[11px] font-bold text-[#6b6760]">Final Grade Score</label>
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
                                    className="bg-[#FAF6EE] border rounded-lg py-1.5 px-3 text-[13px]"
                                  />
                                </div>
                                <div className="flex flex-col gap-1 sm:col-span-2">
                                  <label className="text-[11px] font-bold text-[#6b6760]">Feedback Comments</label>
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
                                    className="bg-[#FAF6EE] border rounded-lg py-1.5 px-3 text-[13px]"
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
                                  className="bg-[#FAF6EE] hover:bg-[#eae6db] text-[#1a1917] text-[10px] font-bold px-3 py-2 rounded-lg border border-[#ebdcc9] transition cursor-pointer"
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
                      <div className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-sm space-y-4">
                        <h4 className="text-sm font-bold border-b pb-2">Integrity Summary</h4>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-[#8e8a80]">Integrity Index</span>
                          <span className={`text-base font-extrabold ${selectedAttempt.integrityScore < 70 ? "text-red-500" : "text-emerald-500"}`}>
                            {selectedAttempt.integrityScore}%
                          </span>
                        </div>

                        <div className="space-y-3 pt-2">
                          <span className="text-xs font-bold text-[#6b6760] block">Integrity Violation Logs</span>
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
          {activeTab === "Analytics Hub" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">Assessment Analytics</h1>
                  <p className="text-xs text-[#8e8a80]">Performance statistics, integrity indices, and question level metrics.</p>
                </div>
                
                <select
                  value={analyticsId || ""}
                  onChange={(e) => {
                    setAnalyticsId(e.target.value || null);
                    setAnalyticsData(null);
                  }}
                  className="bg-white border border-[#ebdcc9] rounded-xl py-2 px-4 text-xs font-bold shadow-sm"
                >
                  <option value="">Select Assessment to Analyze</option>
                  {assessments.map((a) => (
                    <option key={a.id} value={a.id}>{a.title}</option>
                  ))}
                </select>
              </div>

              {!analyticsId ? (
                <div className="bg-white border border-[#ebdcc9] rounded-2xl p-10 text-center text-sm text-[#8e8a80] shadow-sm">
                  Please select an assessment to generate performance analytics.
                </div>
              ) : !analyticsData ? (
                <div className="py-10 text-center text-[#8e8a80]">Generating report stats...</div>
              ) : (
                <div className="space-y-6">
                  {/* Stats Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    {[
                      { title: "Total Attempts", value: analyticsData.totalAttempts, footer: "Completed submissions" },
                      { title: "Average Score", value: analyticsData.averageScore, footer: "Out of maximum points", valueColor: "text-[#c5af8a]" },
                      { title: "Average Integrity Index", value: `${analyticsData.averageIntegrity}%`, footer: "Consistent candidate behavior", valueColor: "text-emerald-600" },
                      { title: "Total Violations", value: analyticsData.totalViolations, footer: "Flagged security alerts", valueColor: "text-red-500" }
                    ].map((card, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: i * 0.05 }}
                        whileHover={{ y: -4, scale: 1.025, boxShadow: "0 10px 20px -5px rgba(142,126,98,0.12), 0 0 0 1px rgba(197, 175, 138, 0.3)", borderColor: "rgba(197, 175, 138, 0.5)" }}
                        className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-sm transition-all duration-300"
                      >
                        <span className="text-[11px] font-bold text-[#8e8a80] uppercase tracking-wider">{card.title}</span>
                        <div className={`text-3xl font-extrabold mt-1 ${card.valueColor || "text-zinc-950"}`}>{card.value}</div>
                        <span className="text-[11.5px] text-[#6b6760] mt-1.5 block">{card.footer}</span>
                      </motion.div>
                    ))}
                  </div>

                  {/* Graphs Row */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Score distribution chart */}
                    <div className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-sm">
                      <h3 className="text-sm font-bold mb-4">Score Distribution Profile</h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={analyticsData.scoreDistribution}>
                            <defs>
                              <linearGradient id="scoreColor" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#c5af8a" stopOpacity={0.4}/>
                                <stop offset="95%" stopColor="#c5af8a" stopOpacity={0.0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ebdcc9" opacity={0.3} />
                            <XAxis dataKey="range" fontSize={11} stroke="#8e8a80" />
                            <YAxis fontSize={11} stroke="#8e8a80" />
                            <Tooltip 
                              contentStyle={{
                                backgroundColor: "#ffffff",
                                borderColor: "#ebdcc9",
                                borderRadius: "12px",
                                boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.05)",
                                fontSize: "11px",
                                fontFamily: "Inter, sans-serif"
                              }}
                              itemStyle={{ color: "#1a1917" }}
                              labelStyle={{ fontWeight: "bold", color: "#8e8a80" }}
                            />
                            <Area type="monotone" dataKey="count" stroke="#c5af8a" strokeWidth={2} fillOpacity={1} fill="url(#scoreColor)" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Violation breakdown */}
                    <div className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-sm">
                      <h3 className="text-sm font-bold mb-4">Violation Alerts Categorization</h3>
                      {analyticsData.violationBreakdown.length === 0 ? (
                        <div className="h-64 flex items-center justify-center text-xs text-[#8e8a80] border border-dashed rounded-xl">
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
                  <div className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-sm">
                    <h3 className="text-sm font-bold mb-4">Item Difficulty & Learning Outcome Success Rate</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b border-[#ebdcc9]/50 text-left text-xs font-bold text-[#8e8a80] uppercase">
                            <th className="pb-3">Question Text</th>
                            <th className="pb-3">Type</th>
                            <th className="pb-3">Outcome</th>
                            <th className="pb-3">Difficulty</th>
                            <th className="pb-3 text-right">Attainment Rate</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#ebdcc9]/30">
                          {analyticsData.questionStats.map((qs: any, idx: number) => (
                            <tr key={idx} className="hover:bg-[#FAF6EE]/30 transition-colors">
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
                                  <div className="w-20 bg-[#FAF6EE] h-1.5 rounded-full overflow-hidden hidden sm:block">
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
                  <p className="text-xs text-[#8e8a80]">Immutable records of AI grading decisions, similarity checks, risk ratings, and faculty overrides.</p>
                </div>
                
                <select
                  value={auditId || ""}
                  onChange={(e) => {
                    setAuditId(e.target.value || null);
                    setAuditLogs([]);
                  }}
                  className="bg-white border border-[#ebdcc9] rounded-xl py-2 px-4 text-xs font-bold shadow-sm cursor-pointer"
                >
                  <option value="">Select Assessment to Audit</option>
                  {assessments.map((a) => (
                    <option key={a.id} value={a.id}>{a.title}</option>
                  ))}
                </select>
              </div>

              {!auditId ? (
                <div className="bg-white border border-[#ebdcc9] rounded-2xl p-10 text-center text-sm text-[#8e8a80] shadow-sm">
                  Please select an assessment to load its compliance audit log.
                </div>
              ) : isAuditLoading ? (
                <div className="py-10 text-center text-[#8e8a80]">Fetching audit records...</div>
              ) : auditLogs.length === 0 ? (
                <div className="bg-white border border-[#ebdcc9] rounded-2xl p-10 text-center text-sm text-[#8e8a80] shadow-sm">
                  No evaluation audit records found for this assessment yet.
                </div>
              ) : (
                <div className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-sm space-y-4">
                  <h3 className="text-base font-bold">Immutable Audit Logs ({auditLogs.length})</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b border-[#ebdcc9]/50 text-left text-xs font-bold text-[#8e8a80] uppercase">
                          <th className="pb-3 pr-4">Timestamp</th>
                          <th className="pb-3 px-4">Evaluator Agent</th>
                          <th className="pb-3 px-4 text-center">AI Score</th>
                          <th className="pb-3 px-4 text-center">Final Score</th>
                          <th className="pb-3 px-4 text-center">Override Status</th>
                          <th className="pb-3 px-4">Faculty Reviewer</th>
                          <th className="pb-3 pl-4">Student Answer</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#ebdcc9]/30 text-xs">
                        {auditLogs.map((log) => {
                          let mods: any = {};
                          try {
                            mods = log.facultyModifications ? JSON.parse(log.facultyModifications) : {};
                          } catch (e) {}
                          
                          return (
                            <tr key={log.id} className="hover:bg-[#FAF6EE]/30 transition-colors">
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
                                {log.facultyId && <span className="block text-[9px] text-[#8e8a80] font-mono leading-none mt-0.5">{log.facultyId.slice(-8)}</span>}
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
        </main>
      </div>
    </div>
  );
}
