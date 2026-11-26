import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Library,
  LayoutDashboard,
  Video,
  ShieldAlert,
  Sparkles,
  History,
  HelpCircle,
  BookOpen,
  Search,
  Bell,
  Settings,
  LogOut,
  ChevronDown,
  ShieldCheck,
  Calendar,
  Clock,
  ArrowRight,
  ChevronRight,
  Filter,
  Users,
  Send,
  LifeBuoy,
  MessageSquare,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Cell,
} from "recharts";
import imgAssessmentIntegrityLogo from "../../imports/LoginPortalIntegrityOs/assessment_integrity_logo.png";
import { ChatbotIcon } from "../components/ChatbotIcon";
import { NotificationCenter } from "../components/NotificationCenter";
import { SidebarProvider, SidebarTrigger } from "../components/ui/sidebar";
import { StudyMaterialsPanel } from "../components/study/StudyMaterialsPanel";
import { CompilerStudio } from "../components/code/CompilerStudio";
import { TerminalSquare } from "lucide-react";
import { PortalSidebar } from "../components/PortalSidebar";
import { openSettings } from "../settings/SettingsCenter";
import { PlagiarismAnalysis } from "../components/PlagiarismAnalysis";
import { IntegrityReports } from "../components/IntegrityReports";
import { StudentMessagingView } from "./StudentMessagingView";
import { openCertificate } from "../utils/certificate";
import { useVerification } from "../components/verification/useVerification";
import { InstitutionBadge, PendingBadge, VerifiedBadge } from "../components/verification/VerificationBadges";
import { VerificationBanner, VerificationModal } from "../components/verification/VerificationDashboardParts";
import { DesktopRequiredNotice } from "../components/student/DesktopRequiredNotice";
import { canTakeExamOnThisDevice } from "../utils/device";
import { Menu as MenuIcon, X as CloseIcon } from "lucide-react";
import { StudentAIInsights } from "../components/student/StudentAIInsights";
import { StudentHistory } from "../components/student/StudentHistory";
import { StudentDocumentation } from "../components/student/StudentDocumentation";
import { StudentSupportCenter } from "../components/student/StudentSupportCenter";
import { StudentGuideCard } from "../components/mascot/StudentGuideCard";

interface DashboardViewProps {
  user: any;
  session: any;
  clientInfo: { ip: string; userAgent: string } | null;
  handleLogout: () => void;
  parseUserAgent: (ua?: string) => string;
  onStartAssessment: (id: string) => void;
}

// Chart Data (Velocity Chart)
const WEEKLY_DATA = [
  { name: "Wk 1", score: 82 },
  { name: "Wk 2", score: 85 },
  { name: "Wk 3", score: 88 },
  { name: "Wk 4", score: 92 },
  { name: "Wk 5", score: 98, isCurrent: true },
  { name: "Wk 6", score: 94 },
];

const MONTHLY_DATA = [
  { name: "Jan", score: 80 },
  { name: "Feb", score: 84 },
  { name: "Mar", score: 86 },
  { name: "Apr", score: 90 },
  { name: "May", score: 94, isCurrent: true },
  { name: "Jun", score: 92 },
];

// Radar Profile Data
const RADAR_DATA = [
  { subject: "Focus", A: 90 },
  { subject: "Integrity", A: 98 },
  { subject: "Collaboration", A: 85 },
  { subject: "Consistency", A: 92 },
  { subject: "Accuracy", A: 88 },
  { subject: "Participation", A: 80 },
];

const RADAR_METRICS = [
  { key: "focus", name: "Focus", val: 90, angle: (0 * Math.PI) / 3 - Math.PI / 2 },
  { key: "integrity", name: "Integrity", val: 98, angle: (1 * Math.PI) / 3 - Math.PI / 2 },
  { key: "collaboration", name: "Collaboration", val: 85, angle: (2 * Math.PI) / 3 - Math.PI / 2 },
  { key: "consistency", name: "Consistency", val: 92, angle: (3 * Math.PI) / 3 - Math.PI / 2 },
  { key: "accuracy", name: "Accuracy", val: 88, angle: (4 * Math.PI) / 3 - Math.PI / 2 },
  { key: "participation", name: "Participation", val: 80, angle: (5 * Math.PI) / 3 - Math.PI / 2 },
];

// Upcoming countdown helper
/** Tabs that use the whole content area edge to edge (chat-style workspaces). */
const FULL_BLEED_TABS = new Set(["Messages", "Support", "Compilers"]);

function useCountdown(initialHours: number, initialMinutes: number, initialSeconds: number) {
  const [time, setTime] = useState({
    hours: initialHours,
    minutes: initialMinutes,
    seconds: initialSeconds,
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setTime((prev) => {
        let { hours, minutes, seconds } = prev;
        if (seconds > 0) {
          seconds--;
        } else {
          seconds = 59;
          if (minutes > 0) {
            minutes--;
          } else {
            minutes = 59;
            if (hours > 0) {
              hours--;
            } else {
              // Reset to simulate continuous count
              hours = 2;
              minutes = 45;
              seconds = 12;
            }
          }
        }
        return { hours, minutes, seconds };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return time;
}

export function DashboardView({
  user,
  session,
  clientInfo,
  handleLogout,
  parseUserAgent,
  onStartAssessment,
}: DashboardViewProps) {
  const [activeTab, setActiveTab] = useState(() =>
    new URLSearchParams(window.location.search).has("material") ? "Study Materials" : "Overview",
  );

  // Enrolment verification: exams unlock once an admin approves the student's
  // college ID / fee receipt (also enforced server-side when starting an exam).
  const verification = useVerification();
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const verificationStatus = verification.data?.status;
  const canTakeExams = verification.data ? verification.data.status === "approved" || !verification.data.required : false;
  const verifiedInstitution = verificationStatus === "approved" ? verification.data?.institutionName || user.institutionName : null;
  // Exams are laptop/desktop only; everything else works on phones/tablets.
  const [examDeviceOk] = useState(() => canTakeExamOnThisDevice());
  const [showDeviceNotice, setShowDeviceNotice] = useState(false);
  const handleStartAssessment = (id: string) => {
    if (!examDeviceOk) {
      setShowDeviceNotice(true);
      return;
    }
    if (!canTakeExams) {
      setShowVerifyModal(true);
      return;
    }
    onStartAssessment(id);
  };
  const [chartPeriod, setChartPeriod] = useState<"weekly" | "monthly">("weekly");
  const [showHistoryFilter, setShowHistoryFilter] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("All Assessments");
  const [expandHistory, setExpandHistory] = useState(false);
  const [hoveredRadarIdx, setHoveredRadarIdx] = useState<number | null>(null);
  const [dbAssessments, setDbAssessments] = useState<any[]>([]);

  // Dynamic stats calculation based on database assessments and user risk score
  const totalAssessmentsCount = dbAssessments.length;
  const completedAssessments = dbAssessments.filter(
    (a) => a.attemptStatus && a.attemptStatus !== "not_started" && a.attemptStatus !== "started"
  );
  const completedCount = completedAssessments.length;

  const NO_DATA_COLOR = "text-zinc-500 bg-zinc-50 border-zinc-200";

  // 1. Integrity Score: average integrity index of the student's completed attempts.
  const attemptsWithIntegrity = completedAssessments.filter((a) => typeof a.attemptIntegrity === "number");
  const hasIntegrity = attemptsWithIntegrity.length > 0;
  const avgIntegrity = hasIntegrity
    ? Math.round(attemptsWithIntegrity.reduce((acc, a) => acc + a.attemptIntegrity, 0) / attemptsWithIntegrity.length)
    : 0;
  const integrityDisplay = hasIntegrity ? String(avgIntegrity) : "—";
  const integrityLabel = !hasIntegrity ? "No data" : avgIntegrity >= 90 ? "Excellent" : avgIntegrity >= 75 ? "Good" : avgIntegrity >= 50 ? "Fair" : "Poor";
  const integrityColor = !hasIntegrity ? NO_DATA_COLOR : avgIntegrity >= 90 ? "text-emerald-600 bg-emerald-50 border-emerald-100" : avgIntegrity >= 75 ? "text-amber-600 bg-amber-50 border-amber-100" : "text-red-600 bg-red-50 border-red-100";

  // 2. Academic GPA: average percentage (score / total marks) across scored attempts, on a 10-point scale.
  const scoredAttempts = completedAssessments.filter((a) => typeof a.attemptScore === "number" && a.totalPoints > 0);
  const hasGPA = scoredAttempts.length > 0;
  const avgScorePercent = hasGPA
    ? scoredAttempts.reduce((acc, a) => acc + Math.min(100, (a.attemptScore / a.totalPoints) * 100), 0) / scoredAttempts.length
    : 0;
  const calculatedGPA = Number((avgScorePercent / 10).toFixed(1));
  const gpaDisplay = hasGPA ? calculatedGPA.toFixed(1) : "—";
  const gpaLabel = !hasGPA ? "Not graded" : calculatedGPA >= 9.0 ? "Scholar" : calculatedGPA >= 7.5 ? "Good" : calculatedGPA >= 5 ? "Average" : "Needs Work";
  const gpaColor = !hasGPA ? NO_DATA_COLOR : calculatedGPA >= 7.5 ? "text-emerald-600 bg-emerald-50 border-emerald-100" : "text-zinc-600 bg-zinc-50 border-zinc-200";

  // 3. Attendance Rate: assessments the student has attempted (started or finished) / assigned.
  const attemptedCount = dbAssessments.filter((a) => a.attemptStatus && a.attemptStatus !== "not_started").length;
  const attendanceRateVal = totalAssessmentsCount > 0 ? Number(((attemptedCount / totalAssessmentsCount) * 100).toFixed(1)) : 0;
  const attendanceLabel = totalAssessmentsCount === 0 ? "No data" : attendanceRateVal >= 90 ? "Consistent" : attendanceRateVal >= 75 ? "Regular" : "Low";
  const attendanceColor = totalAssessmentsCount === 0 ? NO_DATA_COLOR : attendanceRateVal >= 90 ? "text-emerald-600 bg-emerald-50 border-emerald-100" : "text-amber-600 bg-amber-50 border-amber-100";

  // 4. Course Modules Completion: completed (submitted / graded) / assigned.
  const completionPercent = totalAssessmentsCount > 0 ? Math.round((completedCount / totalAssessmentsCount) * 100) : 0;
  const completionLabel = totalAssessmentsCount === 0 ? "No data" : completionPercent >= 80 ? "On Track" : completionPercent >= 50 ? "Needs Focus" : "Behind";
  const completionColor = totalAssessmentsCount === 0 ? NO_DATA_COLOR : completionPercent >= 80 ? "text-emerald-600 bg-emerald-50 border-emerald-100" : "text-amber-600 bg-amber-50 border-amber-100";

  const downloadCertificate = (ass: any) =>
    openCertificate({
      studentName: user.name || user.fullName || user.email,
      integrityScore: ass.attemptIntegrity ?? 0,
      riskLevel: ass.attemptRiskLevel,
      certificateNumber: ass.certificateNumber || (ass.attemptId ? `IOS-${String(ass.attemptId).slice(-8).toUpperCase()}` : null),
      verificationCode: ass.verificationCode,
      issuedAt: ass.attemptSubmittedAt,
      provisional: ass.attemptStatus !== "graded",
      assessment: { title: ass.title, institutionName: ass.institutionName || user.institutionName, facultyName: ass.facultyName },
    });

  useEffect(() => {
    const fetchStudentAssessments = async () => {
      try {
        const res = await fetch("/api/assessments", {
          headers: { "x-user-id": user.id, "x-user-role": "user" }
        });
        if (res.ok) {
          const data = await res.json();
          setDbAssessments(data.data || []);
        }
      } catch (err) {
        console.error("Failed to load assessments:", err);
      }
    };
    fetchStudentAssessments();
  }, [user.id]);

  // Countdown timer: 2 hours, 45 mins, 12 secs
  const countdown = useCountdown(2, 45, 12);

  const formattedHours = String(countdown.hours).padStart(2, "0");
  const formattedMinutes = String(countdown.minutes).padStart(2, "0");
  const formattedSeconds = String(countdown.seconds).padStart(2, "0");

  const sidebarLinks = [
    { name: "Overview", icon: LayoutDashboard },
    { name: "Messages", icon: MessageSquare },
    { name: "Study Materials", icon: Library },
    { name: "Compilers", icon: TerminalSquare },
    { name: "Live Sessions", icon: Video },
    { name: "Integrity Reports", icon: ShieldAlert },
    { name: "AI Insights", icon: Sparkles },
    { name: "Plagiarism Analysis", icon: Search },
    { name: "History", icon: History },
    { name: "Support", icon: HelpCircle },
    { name: "Documentation", icon: BookOpen },
  ];

  const chartData = chartPeriod === "weekly" ? WEEKLY_DATA : MONTHLY_DATA;

  const academicHistory = [
    { name: "Data Structures Quiz 3", date: "Jun 18, 2026", status: "Secure", score: "92/100" },
    { name: "Database Systems Midterm", date: "Jun 14, 2026", status: "Secure", score: "88/100" },
    { name: "Operating Systems Lab 2", date: "Jun 08, 2026", status: "Secure", score: "95/100" },
    ...(expandHistory
      ? [
          { name: "Computer Networks Assignment 1", date: "May 28, 2026", status: "Secure", score: "90/100" },
          { name: "Discrete Mathematics Quiz 2", date: "May 15, 2026", status: "Secure", score: "85/100" },
        ]
      : []),
  ];

  const handlePrecheck = () => {
    toast.success("System pre-check passed! Webcam, screen-sharing, and environment logs are verified.");
  };

  return (
    <SidebarProvider className="min-h-screen bg-[#ffffff] text-[#1a1917] font-sans w-full overflow-x-hidden">
      <PortalSidebar
        portalLabel="Student workspace"
        active={activeTab}
        onSelect={setActiveTab}
        user={{ name: user?.name, email: user?.email, image: user?.image, roleLabel: "Student" }}
        onSignOut={handleLogout}
        groups={[
          { label: "Workspace", items: sidebarLinks.slice(0, 5).map((l) => ({ id: l.name, label: l.name, icon: l.icon })) },
          { label: "Integrity", items: sidebarLinks.slice(5, 9).map((l) => ({ id: l.name, label: l.name, icon: l.icon })) },
          { label: "Help", items: sidebarLinks.slice(9).map((l) => ({ id: l.name, label: l.name, icon: l.icon })) },
        ]}
      />

      {/* Main Workspace Frame */}
      <div className="flex-1 flex flex-col min-w-0">
        <DesktopRequiredNotice open={showDeviceNotice} onClose={() => setShowDeviceNotice(false)} />

        {/* Top Header Section */}
        <header className="h-16 border-b border-[#dedede] bg-white/70 backdrop-blur-md px-4 sm:px-6 md:px-8 flex items-center justify-between gap-3 sticky top-0 z-20">
          <SidebarTrigger className="-ml-1 size-9 shrink-0 rounded-lg" />
          <span className="md:hidden flex-1 truncate text-[15px] font-bold text-[#1a1917]">{activeTab}</span>
          {/* Header Left - Search Input */}
          <div className="flex-1 max-w-md hidden sm:block">
            <div className="relative flex items-center">
              <Search className="absolute left-3.5 size-4 text-[#8a8a8a] pointer-events-none" />
              <input
                type="text"
                placeholder="Search assessments, logs, or metrics..."
                className="w-full bg-[#f6f6f6] border border-[#dedede]/60 rounded-xl py-2 pl-10 pr-4 text-[13.5px] placeholder:text-[#a2a2a2] text-[#1a1917] focus:outline-none focus:border-[#b2b2b2] focus:ring-1 focus:ring-[#b2b2b2] transition-all"
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-4 ml-auto shrink-0">
            {verifiedInstitution && (
              <span className="hidden lg:block"><InstitutionBadge name={verifiedInstitution} className="max-w-[240px]" /></span>
            )}
            {/* Action Buttons */}
            <NotificationCenter />
            <motion.button
              type="button"
              whileHover={{ scale: 1.05, rotate: 15 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => openSettings()}
              aria-label="Open settings"
              title="Settings"
              className="p-2 rounded-xl text-[#676767] hover:bg-[#f6f6f6] hover:text-[#1a1917] transition-colors cursor-pointer focus:outline-none"
            >
              <Settings className="size-5" />
            </motion.button>

            {/* Profile Avatar Widget */}
            <motion.div 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center gap-3 sm:border-l border-[#dedede] sm:pl-4 cursor-pointer group select-none"
              onClick={() => window.dispatchEvent(new CustomEvent("open-profile-drawer"))}
            >
              <div className="text-right hidden sm:block">
                <div className="flex items-center justify-end gap-1.5 text-[13.5px] font-bold leading-tight text-[#1a1917] group-hover:text-[#676767] transition-colors">
                  {user.name || "Student"}
                  {verificationStatus === "approved" && <VerifiedBadge />}
                  {verificationStatus === "pending" && <PendingBadge />}
                </div>
                <div className="text-[11px] font-semibold text-[#8a8a8a] leading-none mt-1 truncate max-w-[220px] ml-auto">
                  {verifiedInstitution || (verificationStatus === "pending" ? "Awaiting admin approval" : "Enrolment not verified")}
                </div>
              </div>
              <motion.div 
                whileHover={{ rotate: 5 }}
                className="w-9 h-9 rounded-full bg-[#1a1917] border border-[#b2b2b2] text-white flex items-center justify-center font-bold text-sm select-none shadow-sm"
              >
                {user.name ? user.name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
              </motion.div>
            </motion.div>
          </div>
        </header>

        {/* Dashboard Content Container */}
        <main
          id="main-content"
          tabIndex={-1}
          key={activeTab}
          className={
            FULL_BLEED_TABS.has(activeTab)
              ? "portal-page-enter portal-full flex-1 h-[calc(100dvh-4rem)] min-h-0 flex flex-col overflow-hidden"
              : "portal-page-enter flex-1 p-4 sm:p-6 md:p-8 space-y-6 overflow-y-auto"
          }
        >
          {!FULL_BLEED_TABS.has(activeTab) && (
            <VerificationBanner verification={verification.data} onOpen={() => setShowVerifyModal(true)} />
          )}
          <VerificationModal
            open={showVerifyModal}
            onClose={() => setShowVerifyModal(false)}
            onSubmitted={() => verification.refresh()}
          />
          {activeTab === "Live Sessions" ? (
            <div className="space-y-6">
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-bold tracking-tight">Live Secure Sessions</h2>
                <p className="text-xs text-[#8a8a8a]">Active proctored exams assigned to your profile at {user.institutionName || "SRM University AP"}.</p>
              </div>

              {/* Institution Assessments */}
              <div className="bg-white border border-[#dedede] rounded-2xl p-5 shadow-[0_4px_20px_rgba(128,128,128,0.04)]">
                <div>
                  <h3 className="text-base font-bold text-[#1a1917]">Institution Assessments</h3>
                  <p className="text-xs text-[#8a8a8a]">Assessments assigned to your profile at {user.institutionName || "Unlinked University"}</p>
                </div>
                <div className="mt-4 space-y-3">
                  {dbAssessments.length === 0 ? (
                    <div className="py-6 text-center text-xs text-[#8a8a8a] border border-dashed rounded-xl">
                      No active assessments available for your institution at this moment.
                    </div>
                  ) : (
                    dbAssessments.map((ass) => {
                      return (
                        <div key={ass.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-[#f6f6f6]/55 border border-[#dedede]/40 gap-4">
                          <div>
                            <span className="text-sm font-bold text-[#1a1917] block">{ass.title}</span>
                            <span className="text-xs text-[#8a8a8a] mt-0.5 block">
                              Duration: {ass.duration} mins • {ass.questionsCount} Questions • Faculty: {ass.facultyName}
                            </span>
                          </div>

                          <div>
                            {ass.attemptStatus === "not_started" && (
                              <button
                                type="button"
                                onClick={() => handleStartAssessment(ass.id)}
                                className="bg-[#1a1917] text-white hover:bg-black px-4 py-2 rounded-xl text-xs font-semibold shadow-sm transition cursor-pointer"
                              >
                                {!examDeviceOk ? "Laptop or desktop required" : canTakeExams ? "Start Secure Exam" : "Verify to start"}
                              </button>
                            )}
                            {ass.attemptStatus === "started" && (
                              <button
                                type="button"
                                onClick={() => handleStartAssessment(ass.id)}
                                className="bg-amber-500 text-white hover:bg-amber-600 px-4 py-2 rounded-xl text-xs font-semibold shadow-sm transition cursor-pointer animate-pulse"
                              >
                                {examDeviceOk ? "Resume Exam" : "Resume on a computer"}
                              </button>
                            )}
                            {!["not_started", "started", "graded"].includes(ass.attemptStatus) && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-100">
                                Submitted for Evaluation
                              </span>
                            )}
                            {ass.attemptStatus === "graded" && (
                              <div className="text-right">
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
                                  Score: {ass.attemptScore}{ass.totalPoints ? ` / ${ass.totalPoints}` : ""} pts
                                </span>
                                <span className="block text-[9px] text-[#8a8a8a] mt-1 font-semibold">Integrity Index: {ass.attemptIntegrity}%</span>
                              </div>
                            )}
                            {!["not_started", "started"].includes(ass.attemptStatus) && (
                              <button
                                type="button"
                                onClick={() => downloadCertificate(ass)}
                                className="mt-2 sm:ml-auto flex w-fit items-center gap-1 text-[11px] font-semibold text-[#1a1917] border border-[#dedede] bg-white hover:bg-[#f6f6f6] px-3 py-1.5 rounded-full transition cursor-pointer"
                              >
                                Download Certificate
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          ) : activeTab === "Overview" ? (
            <>
              {/* Vigil — animated 3D exam guide */}
              <StudentGuideCard name={user?.name} integrityScore={hasIntegrity ? avgIntegrity : undefined} />

              {/* Top Row Grid of 4 KPI Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {/* Card 1: Integrity Score */}
                <motion.div
                  whileHover={{ y: -5, scale: 1.03, boxShadow: "0 10px 20px -5px rgba(128,128,128,0.12), 0 0 0 1px rgba(178, 178, 178, 0.3)" }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="bg-white border border-[#dedede] rounded-2xl p-5 shadow-[0_4px_20px_rgba(128,128,128,0.04)] flex flex-col justify-between transition-all duration-300"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-bold text-[#8a8a8a] uppercase tracking-wider">Integrity Score</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${integrityColor}`}>{integrityLabel}</span>
                    </div>
                    <div className="mt-2.5 flex items-baseline gap-1">
                      <span className="text-3xl font-extrabold text-[#1a1917]">{integrityDisplay}</span>
                      <span className="text-sm font-medium text-[#8a8a8a]">/100</span>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="w-full bg-[#f6f6f6] h-1.5 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${avgIntegrity}%` }} />
                    </div>
                    <span className="text-[11.5px] text-[#676767] mt-2 block">Calculated from AI Proctoring alerts</span>
                  </div>
                </motion.div>

                {/* Card 2: Academic GPA */}
                <motion.div
                  whileHover={{ y: -5, scale: 1.03, boxShadow: "0 10px 20px -5px rgba(128,128,128,0.12), 0 0 0 1px rgba(178, 178, 178, 0.3)" }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="bg-white border border-[#dedede] rounded-2xl p-5 shadow-[0_4px_20px_rgba(128,128,128,0.04)] flex flex-col justify-between transition-all duration-300"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-bold text-[#8a8a8a] uppercase tracking-wider">Academic GPA</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${gpaColor}`}>{gpaLabel}</span>
                    </div>
                    <div className="mt-2.5 flex items-baseline gap-1">
                      <span className="text-3xl font-extrabold text-[#1a1917]">{gpaDisplay}</span>
                      <span className="text-sm font-medium text-[#8a8a8a]">/10.0</span>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="w-full bg-[#f6f6f6] h-1.5 rounded-full overflow-hidden">
                      <div className="bg-[#b2b2b2] h-full rounded-full" style={{ width: `${calculatedGPA * 10}%` }} />
                    </div>
                    <span className="text-[11.5px] text-[#676767] mt-2 block">Derived from graded assessments</span>
                  </div>
                </motion.div>

                {/* Card 3: Attendance */}
                <motion.div
                  whileHover={{ y: -5, scale: 1.03, boxShadow: "0 10px 20px -5px rgba(128,128,128,0.12), 0 0 0 1px rgba(178, 178, 178, 0.3)" }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="bg-white border border-[#dedede] rounded-2xl p-5 shadow-[0_4px_20px_rgba(128,128,128,0.04)] flex flex-col justify-between transition-all duration-300"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-bold text-[#8a8a8a] uppercase tracking-wider">Attendance Rate</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${attendanceColor}`}>{attendanceLabel}</span>
                    </div>
                    <div className="mt-2.5 flex items-baseline gap-1">
                      <span className="text-3xl font-extrabold text-[#1a1917]">{attendanceRateVal}%</span>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="w-full bg-[#f6f6f6] h-1.5 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${attendanceRateVal}%` }} />
                    </div>
                    <span className="text-[11.5px] text-[#676767] mt-2 block">{attemptedCount}/{totalAssessmentsCount} Assessments attempted</span>
                  </div>
                </motion.div>

                {/* Card 4: Completion */}
                <motion.div
                  whileHover={{ y: -5, scale: 1.03, boxShadow: "0 10px 20px -5px rgba(128,128,128,0.12), 0 0 0 1px rgba(178, 178, 178, 0.3)" }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="bg-white border border-[#dedede] rounded-2xl p-5 shadow-[0_4px_20px_rgba(128,128,128,0.04)] flex flex-col justify-between transition-all duration-300"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-bold text-[#8a8a8a] uppercase tracking-wider">Course Modules</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${completionColor}`}>{completionLabel}</span>
                    </div>
                    <div className="mt-2.5 flex items-baseline gap-1">
                      <span className="text-3xl font-extrabold text-[#1a1917]">{completionPercent}%</span>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="w-full bg-[#f6f6f6] h-1.5 rounded-full overflow-hidden">
                      <div className="bg-amber-500 h-full rounded-full" style={{ width: `${completionPercent}%` }} />
                    </div>
                    <span className="text-[11.5px] text-[#676767] mt-2 block">{completedCount}/{totalAssessmentsCount} Modules completed</span>
                  </div>
                </motion.div>
              </div>

              {/* Main workspace layout grid (split 2:1 column structure) */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* COLUMN 1 & 2: LEFT BLOCK (Main metrics & lists) */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Institution Assessments */}
                  <div className="bg-white border border-[#dedede] rounded-2xl p-5 shadow-[0_4px_20px_rgba(128,128,128,0.04)]">
                    <div>
                      <h3 className="text-base font-bold text-[#1a1917]">Institution Assessments</h3>
                      <p className="text-xs text-[#8a8a8a]">Assessments assigned to your profile at {user.institutionName || "Unlinked University"}</p>
                    </div>
                    <div className="mt-4 space-y-3">
                      {dbAssessments.length === 0 ? (
                        <div className="py-6 text-center text-xs text-[#8a8a8a] border border-dashed rounded-xl">
                          No active assessments available for your institution at this moment.
                        </div>
                      ) : (
                        dbAssessments.map((ass) => {
                          return (
                            <div key={ass.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-[#f6f6f6]/55 border border-[#dedede]/40 gap-4">
                              <div>
                                <span className="text-sm font-bold text-[#1a1917] block">{ass.title}</span>
                                <span className="text-xs text-[#8a8a8a] mt-0.5 block">
                                  Duration: {ass.duration} mins • {ass.questionsCount} Questions • Faculty: {ass.facultyName}
                                </span>
                              </div>

                              <div>
                                {ass.attemptStatus === "not_started" && (
                                  <button
                                    type="button"
                                    onClick={() => handleStartAssessment(ass.id)}
                                    className="bg-[#1a1917] text-white hover:bg-black px-4 py-2 rounded-xl text-xs font-semibold shadow-sm transition cursor-pointer"
                                  >
                                    {!examDeviceOk ? "Laptop or desktop required" : canTakeExams ? "Start Secure Exam" : "Verify to start"}
                                  </button>
                                )}
                                {ass.attemptStatus === "started" && (
                                  <button
                                    type="button"
                                    onClick={() => handleStartAssessment(ass.id)}
                                    className="bg-amber-500 text-white hover:bg-amber-600 px-4 py-2 rounded-xl text-xs font-semibold shadow-sm transition cursor-pointer animate-pulse"
                                  >
                                    {examDeviceOk ? "Resume Exam" : "Resume on a computer"}
                                  </button>
                                )}
                                {!["not_started", "started", "graded"].includes(ass.attemptStatus) && (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-100">
                                    Submitted for Evaluation
                                  </span>
                                )}
                                {ass.attemptStatus === "graded" && (
                                  <div className="text-right">
                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
                                      Score: {ass.attemptScore}{ass.totalPoints ? ` / ${ass.totalPoints}` : ""} pts
                                    </span>
                                    <span className="block text-[9px] text-[#8a8a8a] mt-1 font-semibold">Integrity Index: {ass.attemptIntegrity}%</span>
                                  </div>
                                )}
                                {!["not_started", "started"].includes(ass.attemptStatus) && (
                                  <button
                                    type="button"
                                    onClick={() => downloadCertificate(ass)}
                                    className="mt-2 sm:ml-auto flex w-fit items-center gap-1 text-[11px] font-semibold text-[#1a1917] border border-[#dedede] bg-white hover:bg-[#f6f6f6] px-3 py-1.5 rounded-full transition cursor-pointer"
                                  >
                                    Download Certificate
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Performance Velocity BarChart Card */}
                  <div className="bg-white border border-[#dedede] rounded-2xl p-5 shadow-[0_4px_20px_rgba(128,128,128,0.04)]">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h3 className="text-base font-bold text-[#1a1917]">Performance Velocity</h3>
                        <p className="text-xs text-[#8a8a8a]">Academic activity and check ratings over time</p>
                      </div>

                      {/* Period Toggle Switch */}
                      <div className="bg-[#f6f6f6] border border-[#dedede]/50 rounded-xl p-1 flex">
                        <button
                          type="button"
                          onClick={() => setChartPeriod("weekly")}
                          className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                            chartPeriod === "weekly"
                              ? "bg-white text-[#1a1917] shadow-sm"
                              : "text-[#8a8a8a] hover:text-[#1a1917]"
                          }`}
                        >
                          Weekly
                        </button>
                        <button
                          type="button"
                          onClick={() => setChartPeriod("monthly")}
                          className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                            chartPeriod === "monthly"
                              ? "bg-white text-[#1a1917] shadow-sm"
                              : "text-[#8a8a8a] hover:text-[#1a1917]"
                          }`}
                        >
                          Monthly
                        </button>
                      </div>
                    </div>

                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                          <XAxis
                            dataKey="name"
                            stroke="#8a8a8a"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis
                            stroke="#8a8a8a"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                            domain={[0, 100]}
                          />
                          <Tooltip
                            cursor={{ fill: "#f6f6f6", opacity: 0.5 }}
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                return (
                                  <div className="bg-white border border-[#dedede] rounded-xl p-3 shadow-md">
                                    <p className="text-xs font-bold text-[#1a1917]">{payload[0].payload.name}</p>
                                    <p className="text-sm font-extrabold text-[#b2b2b2] mt-0.5">
                                      Score: {payload[0].value}%
                                    </p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar dataKey="score" radius={[5, 5, 0, 0]} barSize={36}>
                            {chartData.map((entry: any, index: number) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={entry.isCurrent ? "#1a1917" : "#b2b2b2"}
                                opacity={entry.isCurrent ? 1.0 : 0.45}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Academic Assessment History Table Card */}
                  <div className="bg-white border border-[#dedede] rounded-2xl p-5 shadow-[0_4px_20px_rgba(128,128,128,0.04)]">
                    <div className="flex items-center justify-between mb-5">
                      <div>
                        <h3 className="text-base font-bold text-[#1a1917]">Academic History</h3>
                        <p className="text-xs text-[#8a8a8a]">Historical record of verified exam sessions</p>
                      </div>

                      {/* Dropdown Filters */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setShowHistoryFilter(!showHistoryFilter)}
                          className="flex items-center gap-2 bg-[#f6f6f6] border border-[#dedede] rounded-xl px-3.5 py-1.5 text-xs font-semibold text-[#676767] hover:text-[#1a1917] hover:bg-[#e6e6e6] transition-colors cursor-pointer"
                        >
                          <Filter className="size-3.5" />
                          <span>{historyFilter}</span>
                          <ChevronDown className="size-3.5" />
                        </button>

                        {showHistoryFilter && (
                          <div className="absolute right-0 mt-1.5 w-44 rounded-xl border border-[#dedede] bg-[#fbfbfb] shadow-lg z-10">
                            {["All Assessments", "Quizzes Only", "Exams Only"].map((filter) => (
                              <button
                                type="button"
                                onClick={() => {
                                  setHistoryFilter(filter);
                                  setShowHistoryFilter(false);
                                  toast.info(`Filtered history list by: ${filter}`);
                                }}
                                className="w-full px-4 py-2 text-left text-xs text-[#676767] hover:bg-[#ffffff] hover:text-[#1a1917] transition-colors font-medium first:rounded-t-xl last:rounded-b-xl"
                              >
                                {filter}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Table implementation */}
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b border-[#dedede]/50 text-left">
                            <th className="pb-3 text-xs font-bold text-[#8a8a8a] uppercase tracking-wider">Assessment</th>
                            <th className="pb-3 text-xs font-bold text-[#8a8a8a] uppercase tracking-wider">Date</th>
                            <th className="pb-3 text-xs font-bold text-[#8a8a8a] uppercase tracking-wider">Integrity</th>
                            <th className="pb-3 text-xs font-bold text-[#8a8a8a] uppercase tracking-wider text-right">Score</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#dedede]/30">
                          {academicHistory.map((item, idx) => (
                            <tr key={idx} className="group hover:bg-[#f6f6f6]/30 transition-colors">
                              <td className="py-3.5 text-sm font-bold text-[#1a1917]">{item.name}</td>
                              <td className="py-3.5 text-xs text-[#676767]">{item.date}</td>
                              <td className="py-3.5">
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                                  <ShieldCheck className="size-3" />
                                  {item.status}
                                </span>
                              </td>
                              <td className="py-3.5 text-sm font-extrabold text-[#1a1917] text-right">{item.score}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Expand controls */}
                    <div className="mt-4 pt-3 border-t border-[#dedede]/30 flex justify-center">
                      <button
                        type="button"
                        onClick={() => setExpandHistory(!expandHistory)}
                        className="flex items-center gap-1.5 text-xs font-bold text-[#b2b2b2] hover:text-[#1a1917] transition-colors cursor-pointer"
                      >
                        <span>{expandHistory ? "Collapse History" : "Expand Full History"}</span>
                        <ChevronRight className={`size-4 transition-transform duration-300 ${expandHistory ? "rotate-90" : ""}`} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* COLUMN 3: RIGHT PANEL (Sidebar actions & notifications) */}
                <div className="space-y-6">
                  {/* Skill Radar Profile card */}
                  <div className="bg-white border border-[#dedede] rounded-2xl p-5 shadow-[0_4px_20px_rgba(128,128,128,0.04)]">
                    <div>
                      <h3 className="text-base font-bold text-[#1a1917]">Radar Profile</h3>
                      <p className="text-xs text-[#8a8a8a]">Biometric & behavioral category metrics</p>
                    </div>
                    <div className="h-56 w-full mt-3 flex items-center justify-center relative">
                      <svg className="w-full h-full overflow-visible" viewBox="0 0 300 220">
                        {/* Concentric hexagons */}
                        {[20, 40, 60, 80, 100].map((level) => {
                          const r = (level / 100) * 70;
                          const points = RADAR_METRICS.map((m) => {
                            const x = 150 + r * Math.cos(m.angle);
                            const y = 110 + r * Math.sin(m.angle);
                            return `${x},${y}`;
                          }).join(" ");
                          return (
                            <polygon
                              key={level}
                              points={points}
                              fill="none"
                              stroke="#dedede"
                              strokeWidth="0.75"
                              strokeDasharray="2 2"
                              opacity="0.5"
                            />
                          );
                        })}

                        {/* Radial lines */}
                        {RADAR_METRICS.map((m, idx) => {
                          const targetX = 150 + 70 * Math.cos(m.angle);
                          const targetY = 110 + 70 * Math.sin(m.angle);
                          const isHovered = hoveredRadarIdx === idx;
                          return (
                            <line
                              key={m.key}
                              x1={150}
                              y1={110}
                              x2={targetX}
                              y2={targetY}
                              stroke={isHovered ? "#1a1917" : "#dedede"}
                              strokeWidth={isHovered ? "1.5" : "0.75"}
                              opacity={hoveredRadarIdx === null ? 0.7 : isHovered ? 1 : 0.3}
                              className="transition-all duration-200"
                            />
                          );
                        })}

                        {/* Polygon Fill */}
                        {(() => {
                          const points = RADAR_METRICS.map((m) => {
                            const r = (m.val / 100) * 70;
                            const x = 150 + r * Math.cos(m.angle);
                            const y = 110 + r * Math.sin(m.angle);
                            return `${x},${y}`;
                          }).join(" ");
                          return (
                            <polygon
                              points={points}
                              fill="rgba(178,178,178,0.22)"
                              stroke="#b2b2b2"
                              strokeWidth="2"
                              className="transition-all duration-300 ease-out"
                            />
                          );
                        })()}

                        {/* Data Points and Axis Text Labels */}
                        {RADAR_METRICS.map((m, idx) => {
                          const isHovered = hoveredRadarIdx === idx;
                          const r = (m.val / 100) * 70;
                          const px = 150 + r * Math.cos(m.angle);
                          const py = 110 + r * Math.sin(m.angle);
                          
                          // Compute label coordinates (with slight offset outward)
                          const labelRadius = 70 + 16;
                          const labelX = 150 + labelRadius * Math.cos(m.angle);
                          const labelY = 110 + labelRadius * Math.sin(m.angle);

                          return (
                            <g key={m.key}>
                              {/* Outer circle interactive trigger (for larger hover area) */}
                              <circle
                                cx={px}
                                cy={py}
                                r="12"
                                fill="transparent"
                                className="cursor-pointer"
                                onMouseEnter={() => setHoveredRadarIdx(idx)}
                                onMouseLeave={() => setHoveredRadarIdx(null)}
                              />

                              {/* Visual Point circle */}
                              <circle
                                cx={px}
                                cy={py}
                                r={isHovered ? 5 : 3}
                                fill={isHovered ? "#fff" : "#b2b2b2"}
                                stroke="#b2b2b2"
                                strokeWidth={isHovered ? 2.5 : 1.5}
                                className="cursor-pointer transition-all duration-200"
                                onMouseEnter={() => setHoveredRadarIdx(idx)}
                                onMouseLeave={() => setHoveredRadarIdx(null)}
                              />

                              {/* Axis Text Label */}
                              <text
                                x={labelX}
                                y={labelY + (m.angle > 0 ? 3 : m.angle < 0 && m.angle > -Math.PI ? -3 : 0)}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fill={hoveredRadarIdx === null ? "#1a1917" : isHovered ? "#1a1917" : "#8a8a8a"}
                                fontSize={isHovered ? "10" : "9"}
                                fontWeight={isHovered ? "bold" : "semibold"}
                                className="cursor-pointer transition-all duration-200 select-none"
                                onMouseEnter={() => setHoveredRadarIdx(idx)}
                                onMouseLeave={() => setHoveredRadarIdx(null)}
                              >
                                {m.name}
                              </text>
                            </g>
                          );
                        })}
                      </svg>

                      {/* Floating Tooltip */}
                      {hoveredRadarIdx !== null && (() => {
                        const m = RADAR_METRICS[hoveredRadarIdx];
                        const r = (m.val / 100) * 70;
                        const px = 150 + r * Math.cos(m.angle);
                        const py = 110 + r * Math.sin(m.angle);
                        return (
                          <div
                            className="absolute z-10 bg-white/95 backdrop-blur-md border border-[#dedede] shadow-lg px-2.5 py-1.5 rounded-xl pointer-events-none text-left select-none text-[10px] font-bold text-[#1a1917]"
                            style={{
                              left: `${(px / 300) * 100 + 4}%`,
                              top: `${(py / 220) * 100 - 15}%`,
                            }}
                          >
                            <div className="font-extrabold">{m.name}</div>
                            <div className="text-[#b2b2b2] mt-0.5">{m.val}% Rating</div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Plagiarism Analysis Card */}
                  <motion.div
                    whileHover={{ y: -5, scale: 1.03, boxShadow: "0 10px 20px -5px rgba(128,128,128,0.12), 0 0 0 1px rgba(178, 178, 178, 0.3)" }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="bg-white border border-[#dedede] rounded-2xl p-5 shadow-[0_4px_20px_rgba(128,128,128,0.04)] flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Search className="size-4.5 text-[#b2b2b2]" />
                          <span className="text-[12px] font-bold text-[#8a8a8a] uppercase tracking-wider">Integrity Tools</span>
                        </div>
                        <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">Ready</span>
                      </div>
                      <h3 className="text-base font-bold text-[#1a1917] mt-3">Text Plagiarism Analysis</h3>
                      <p className="text-xs text-[#8a8a8a] mt-1.5 leading-relaxed">
                        Scan assignments for semantic plagiarism, view matched source chunks, and generate detailed AI summaries.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab("Plagiarism Analysis")}
                      className="w-full mt-5 bg-[#1a1917] text-white hover:bg-black py-2.5 rounded-xl text-xs font-semibold shadow-[0_4px_10px_rgba(26,26,26,0.18)] hover:shadow-[0_6px_16px_rgba(26,26,26,0.24)] transition-all cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <span>Launch Plagiarism Scanner</span>
                      <ArrowRight className="size-3.5" />
                    </button>
                  </motion.div>

                  {/* Integrity Copilot Card */}
                  <div className="bg-[#f6f6f6] border border-[#dedede] rounded-2xl p-5 shadow-[0_4px_16px_rgba(0,0,0,0.01)] flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Sparkles className="size-4 text-[#b2b2b2]" />
                          <span className="text-xs font-bold text-[#1a1917]">Integrity Copilot</span>
                        </div>
                        {/* Active green status indicator */}
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200">
                          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-[10px] font-bold text-emerald-700">Active</span>
                        </div>
                      </div>
                      <p className="text-[12.5px] leading-relaxed text-[#676767] mt-3">
                        AI verification Shield has validated your student credentials. Identity checking is running in the background. No anomalies detected.
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-[#dedede]/40 flex justify-end">
                      <button
                        type="button"
                        onClick={() => toast.info("Copilot analyzes webcam logs, page focus, and device metrics to shield examinations.")}
                        className="text-xs font-bold text-[#1a1917] hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-none"
                      >
                        <span>Learn Why</span>
                        <ArrowRight className="size-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Upcoming Assessment countdown timer Card */}
                  <div className="bg-white border border-[#dedede] rounded-2xl p-5 shadow-[0_4px_20px_rgba(128,128,128,0.04)]">
                    <div>
                      <span className="text-[10px] font-bold text-[#b2b2b2] uppercase tracking-wider">Next Up</span>
                      <h3 className="text-base font-bold text-[#1a1917] mt-0.5">Algorithms Midterm</h3>
                      <p className="text-xs text-[#8a8a8a] mt-0.5">Prof. Robert Chen • CSE-302</p>
                    </div>

                    {/* Countdown display */}
                    <div className="mt-5 flex items-center justify-center gap-3">
                      <div className="flex flex-col items-center">
                        <div className="bg-[#f6f6f6] border border-[#dedede] rounded-xl size-12 flex items-center justify-center text-[18px] font-extrabold text-[#1a1917] font-mono">
                          {formattedHours}
                        </div>
                        <span className="text-[10px] font-bold text-[#8a8a8a] mt-1 uppercase">Hrs</span>
                      </div>
                      <span className="text-xl font-bold text-[#dedede] mb-4">:</span>
                      <div className="flex flex-col items-center">
                        <div className="bg-[#f6f6f6] border border-[#dedede] rounded-xl size-12 flex items-center justify-center text-[18px] font-extrabold text-[#1a1917] font-mono">
                          {formattedMinutes}
                        </div>
                        <span className="text-[10px] font-bold text-[#8a8a8a] mt-1 uppercase">Min</span>
                      </div>
                      <span className="text-xl font-bold text-[#dedede] mb-4">:</span>
                      <div className="flex flex-col items-center">
                        <div className="bg-[#f6f6f6] border border-[#dedede] rounded-xl size-12 flex items-center justify-center text-[18px] font-extrabold text-[#1a1917] font-mono">
                          {formattedSeconds}
                        </div>
                        <span className="text-[10px] font-bold text-[#8a8a8a] mt-1 uppercase">Sec</span>
                      </div>
                    </div>

                    {/* System check / Pre-check Button */}
                    <button
                      type="button"
                      onClick={handlePrecheck}
                      className="w-full mt-6 bg-[#1a1917] text-white hover:bg-black py-2.5 rounded-xl text-xs font-semibold shadow-[0_4px_10px_rgba(26,26,26,0.18)] hover:shadow-[0_6px_16px_rgba(26,26,26,0.24)] transition-all cursor-pointer"
                    >
                      System Precheck
                    </button>
                  </div>

                  {/* Live Groups status list widget */}
                  <div className="bg-white border border-[#dedede] rounded-2xl p-5 shadow-[0_4px_20px_rgba(128,128,128,0.04)]">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-base font-bold text-[#1a1917]">Live Groups</h3>
                        <p className="text-xs text-[#8a8a8a]">Online student circles in your cohort</p>
                      </div>
                      <Users className="size-4.5 text-[#8a8a8a]" />
                    </div>

                    <div className="space-y-3">
                      {/* Circle 1 */}
                      <div className="flex items-center justify-between p-3 rounded-xl bg-[#f6f6f6]/55 border border-[#dedede]/40">
                        <div className="flex items-center gap-2">
                          {/* pulsing dot */}
                          <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-xs font-bold text-[#1a1917]">Algo-Wizards</span>
                        </div>
                        <span className="text-[10.5px] font-bold text-[#8a8a8a]">8 Online</span>
                      </div>

                      {/* Circle 2 */}
                      <div className="flex items-center justify-between p-3 rounded-xl bg-[#f6f6f6]/55 border border-[#dedede]/40">
                        <div className="flex items-center gap-2">
                          <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-xs font-bold text-[#1a1917]">Ethics Debate Circle</span>
                        </div>
                        <span className="text-[10.5px] font-bold text-[#8a8a8a]">5 Online</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : activeTab === "Support" ? (
            <StudentSupportCenter user={user} onOpenDocs={() => setActiveTab("Documentation")} />
          ) : activeTab === "Plagiarism Analysis" ? (
            <PlagiarismAnalysis user={user} />
          ) : activeTab === "Messages" ? (
            <StudentMessagingView />
          ) : activeTab === "Study Materials" ? (
            <StudyMaterialsPanel mode="student" />
          ) : activeTab === "Compilers" ? (
            <CompilerStudio userId={user.id} />
          ) : activeTab === "Integrity Reports" ? (
            <IntegrityReports user={user} dbAssessments={dbAssessments} />
          ) : activeTab === "AI Insights" ? (
            <StudentAIInsights
              dbAssessments={dbAssessments}
              verificationStatus={verificationStatus}
              verificationRequired={verification.data?.required}
              onOpenVerify={() => setShowVerifyModal(true)}
              onNavigate={setActiveTab}
            />
          ) : activeTab === "History" ? (
            <StudentHistory dbAssessments={dbAssessments} onNavigate={setActiveTab} onDownloadCertificate={downloadCertificate} />
          ) : activeTab === "Documentation" ? (
            <StudentDocumentation onNavigate={setActiveTab} onOpenVerify={() => setShowVerifyModal(true)} />
          ) : (
            <div className="bg-white border border-[#dedede] rounded-2xl p-10 text-center text-sm text-[#8a8a8a] shadow-sm">
              <span className="text-lg font-bold block mb-2">{activeTab}</span>
              This section is a visual simulation layout for testing proctor dashboards.
            </div>
          )}
        </main>
      </div>
    </SidebarProvider>
  );
}
