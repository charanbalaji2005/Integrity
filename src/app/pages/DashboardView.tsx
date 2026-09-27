import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
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
import { PlagiarismAnalysis } from "../components/PlagiarismAnalysis";
import { IntegrityReports } from "../components/IntegrityReports";
import { StudentMessagingView } from "./StudentMessagingView";

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
  const [activeTab, setActiveTab] = useState("Overview");
  const [chartPeriod, setChartPeriod] = useState<"weekly" | "monthly">("weekly");
  const [showHistoryFilter, setShowHistoryFilter] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("All Assessments");
  const [expandHistory, setExpandHistory] = useState(false);
  const [hoveredRadarIdx, setHoveredRadarIdx] = useState<number | null>(null);
  const [dbAssessments, setDbAssessments] = useState<any[]>([]);

  // Dynamic stats calculation based on database assessments and user risk score
  const totalAssessmentsCount = dbAssessments.length;
  const completedAssessments = dbAssessments.filter(
    (a) => a.attemptStatus === "submitted" || a.attemptStatus === "graded"
  );
  const completedCount = completedAssessments.length;

  // 1. Integrity Score: average attemptIntegrity of completed attempts, falling back to 100 - user.riskScore
  let avgIntegrity = 100 - (user?.riskScore || 0);
  const attemptsWithIntegrity = completedAssessments.filter(
    (a) => typeof a.attemptIntegrity === "number" && a.attemptIntegrity !== null
  );
  if (attemptsWithIntegrity.length > 0) {
    const sum = attemptsWithIntegrity.reduce((acc, a) => acc + a.attemptIntegrity, 0);
    avgIntegrity = Math.round(sum / attemptsWithIntegrity.length);
  }
  const integrityLabel = avgIntegrity >= 90 ? "Excellent" : avgIntegrity >= 75 ? "Good" : avgIntegrity >= 50 ? "Slow" : "Poor";
  const integrityColor = avgIntegrity >= 90 ? "text-emerald-600 bg-emerald-50 border-emerald-100" : avgIntegrity >= 75 ? "text-amber-600 bg-amber-50 border-amber-100" : "text-red-600 bg-red-50 border-red-100";

  // 2. Academic GPA: average score of graded attempts relative to a nominal max (we map percentage to 10.0 scale)
  const gradedAttempts = dbAssessments.filter((a) => a.attemptStatus === "graded");
  let calculatedGPA = 10.0;
  if (gradedAttempts.length > 0) {
    const sum = gradedAttempts.reduce((acc, a) => acc + (a.attemptScore || 0), 0);
    const avg = sum / gradedAttempts.length;
    calculatedGPA = Math.min(10.0, Math.max(5.0, Number((5.0 + (avg / 15) * 5.0).toFixed(1))));
  } else if (totalAssessmentsCount > 0) {
    calculatedGPA = 9.2; // default active student GPA
  }
  const gpaLabel = calculatedGPA >= 9.0 ? "Scholar" : calculatedGPA >= 7.5 ? "Good" : "Average";
  const gpaColor = calculatedGPA >= 9.0 ? "text-[#c5af8a] bg-[#fffbf2] border-[#ebdcc9]" : "text-zinc-600 bg-zinc-50 border-zinc-200";

  // 3. Attendance Rate: completed assessments / total assessments
  const attendanceRateVal = totalAssessmentsCount > 0 
    ? Number(((completedCount / totalAssessmentsCount) * 100).toFixed(1)) 
    : 100.0;
  const attendanceLabel = attendanceRateVal >= 90 ? "Consistent" : attendanceRateVal >= 75 ? "Regular" : "Low";
  const attendanceColor = attendanceRateVal >= 90 ? "text-emerald-600 bg-emerald-50 border-emerald-100" : "text-amber-600 bg-amber-50 border-amber-100";

  // 4. Course Modules Completion: completed / total assessments
  const completionPercent = totalAssessmentsCount > 0
    ? Math.round((completedCount / totalAssessmentsCount) * 100)
    : 0;
  const completionLabel = completionPercent >= 80 ? "On Track" : completionPercent >= 50 ? "Needs Focus" : "Behind";
  const completionColor = completionPercent >= 80 ? "text-[#c25f3c] bg-[#fdf6f2] border-[#ebdcc9]" : "text-amber-600 bg-amber-50 border-amber-100";

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

  const [supportTickets, setSupportTickets] = useState<any[]>([]);
  const [activeSupportTicket, setActiveSupportTicket] = useState<any | null>(null);
  const [ticketCategory, setTicketCategory] = useState("technical");
  const [ticketDescription, setTicketDescription] = useState("");
  const [ticketPriority, setTicketPriority] = useState("medium");
  const [supportMessage, setSupportMessage] = useState("");

  const fetchStudentTickets = async () => {
    try {
      const res = await fetch("/api/support/tickets", {
        headers: { "x-user-id": user.id, "x-user-role": "user" }
      });
      if (res.ok) {
        const data = await res.json();
        setSupportTickets(data.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch student support tickets:", err);
    }
  };

  useEffect(() => {
    if (activeTab === "Support") {
      fetchStudentTickets();
      const interval = setInterval(fetchStudentTickets, 3000);
      return () => clearInterval(interval);
    }
  }, [activeTab, user.id]);

  useEffect(() => {
    if (activeSupportTicket) {
      const updated = supportTickets.find(t => t.id === activeSupportTicket.id);
      if (updated) {
        setActiveSupportTicket(updated);
      }
    }
  }, [supportTickets, activeSupportTicket]);

  const handleSubmitTicket = async () => {
    if (!ticketDescription.trim()) {
      toast.error("Please describe your issue.");
      return;
    }

    try {
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id,
          "x-user-role": "user"
        },
        body: JSON.stringify({
          category: ticketCategory,
          description: ticketDescription,
          priority: ticketPriority
        })
      });

      if (res.ok) {
        const data = await res.json();
        toast.success("Support ticket submitted! AI Support is analyzing your issue.");
        setTicketDescription("");
        fetchStudentTickets();
        setActiveSupportTicket(data.data);
      } else {
        toast.error("Failed to submit support ticket.");
      }
    } catch {
      toast.error("An error occurred.");
    }
  };

  const handleSendSupportMessage = async () => {
    if (!activeSupportTicket || !supportMessage.trim()) return;

    try {
      const res = await fetch(`/api/support/tickets/${activeSupportTicket.id}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.id,
          "x-user-role": "user"
        },
        body: JSON.stringify({ content: supportMessage })
      });

      if (res.ok) {
        setSupportMessage("");
        fetchStudentTickets();
      } else {
        toast.error("Failed to send message.");
      }
    } catch {
      toast.error("An error occurred.");
    }
  };

  // Countdown timer: 2 hours, 45 mins, 12 secs
  const countdown = useCountdown(2, 45, 12);

  const formattedHours = String(countdown.hours).padStart(2, "0");
  const formattedMinutes = String(countdown.minutes).padStart(2, "0");
  const formattedSeconds = String(countdown.seconds).padStart(2, "0");

  const sidebarLinks = [
    { name: "Overview", icon: LayoutDashboard },
    { name: "Messages", icon: MessageSquare },
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
    <div className="min-h-screen bg-[#F5EEDC] text-[#1a1917] flex font-sans w-full overflow-x-hidden">
      {/* Sidebar Panel */}
      <aside className="w-[260px] bg-white border-r border-[#ebdcc9] shrink-0 hidden md:flex flex-col justify-between select-none">
        <div>
          {/* Logo Brand Header */}
          <div className="flex items-center gap-3 px-6 py-5 border-b border-[#ebdcc9]/40">
            <img
              src={imgAssessmentIntegrityLogo}
              alt="IntegrityOS Logo"
              className="h-8 w-auto object-contain"
            />
            <h2 className="text-[18px] font-extrabold tracking-tight text-[#1a1917]">
              IntegrityOS
            </h2>
          </div>

          {/* Sidebar Section Title */}
          <div className="px-6 pt-6 pb-2">
            <span className="text-[10px] font-bold text-[#8e8a80] uppercase tracking-wider">
              Student Workspace
            </span>
          </div>

          {/* Links list */}
          <nav className="px-3 space-y-1">
            {sidebarLinks.map((link) => {
              const Icon = link.icon;
              const isActive = activeTab === link.name;
              return (
                <button
                  key={link.name}
                  type="button"
                  onClick={() => {
                    setActiveTab(link.name);
                    if (
                      link.name !== "Overview" &&
                      link.name !== "Live Sessions" &&
                      link.name !== "Support" &&
                      link.name !== "Plagiarism Analysis" &&
                      link.name !== "Integrity Reports"
                    ) {
                      toast.info(`${link.name} is a demonstration section for this portal.`);
                    }
                  }}
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

        {/* Bottom Area - Logout button */}
        <div className="p-4 border-t border-[#ebdcc9]/40">
          <Button
            variant="ghost"
            onClick={() => {
              toast.promise(
                new Promise((resolve) => setTimeout(resolve, 800)),
                {
                  loading: "Logging out...",
                  success: () => {
                    handleLogout();
                    return "Logged out successfully";
                  },
                  error: "Logout failed",
                }
              );
            }}
            className="w-full justify-start gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-[#6b6760] hover:bg-rose-50 hover:text-rose-600 border border-transparent hover:border-rose-100 transition-all duration-300 cursor-pointer"
          >
            <LogOut className="size-4.5 text-[#8e8a80] group-hover:text-rose-600" />
            <span>Sign Out</span>
          </Button>
        </div>
      </aside>

      {/* Main Workspace Frame */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Section */}
        <header className="h-16 border-b border-[#ebdcc9] bg-white/70 backdrop-blur-md px-6 md:px-8 flex items-center justify-between sticky top-0 z-20">
          {/* Header Left - Search Input */}
          <div className="flex-1 max-w-md hidden sm:block">
            <div className="relative flex items-center">
              <Search className="absolute left-3.5 size-4 text-[#8e8a80] pointer-events-none" />
              <input
                type="text"
                placeholder="Search assessments, logs, or metrics..."
                className="w-full bg-[#FAF6EE] border border-[#ebdcc9]/60 rounded-xl py-2 pl-10 pr-4 text-[13.5px] placeholder:text-[#a7a297] text-[#1a1917] focus:outline-none focus:border-[#c5af8a] focus:ring-1 focus:ring-[#c5af8a] transition-all"
              />
            </div>
          </div>

          <div className="flex items-center gap-4 ml-auto">
            {/* Action Buttons */}
            <NotificationCenter />
            <motion.button
              type="button"
              whileHover={{ scale: 1.05, rotate: 15 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => window.dispatchEvent(new CustomEvent("open-profile-drawer"))}
              className="p-2 rounded-xl text-[#6b6760] hover:bg-[#FAF6EE] hover:text-[#1a1917] transition-colors cursor-pointer focus:outline-none"
            >
              <Settings className="size-5" />
            </motion.button>

            {/* Profile Avatar Widget */}
            <motion.div 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center gap-3 border-l border-[#ebdcc9] pl-4 cursor-pointer group select-none"
              onClick={() => window.dispatchEvent(new CustomEvent("open-profile-drawer"))}
            >
              <div className="text-right hidden sm:block">
                <div className="text-[13.5px] font-bold leading-tight text-[#1a1917] group-hover:text-[#6b6760] transition-colors">
                  {user.name || "Student"}
                </div>
                <div className="text-[11px] font-semibold text-[#8e8a80] leading-none mt-0.5">
                  Level 2 Scholar
                </div>
              </div>
              <motion.div 
                whileHover={{ rotate: 5 }}
                className="w-9 h-9 rounded-full bg-[#1a1917] border border-[#c5af8a] text-white flex items-center justify-center font-bold text-sm select-none shadow-sm"
              >
                {user.name ? user.name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
              </motion.div>
            </motion.div>
          </div>
        </header>

        {/* Dashboard Content Container */}
        <main className="flex-1 p-6 md:p-8 space-y-6 overflow-y-auto">
          {activeTab === "Live Sessions" ? (
            <div className="space-y-6">
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-bold tracking-tight">Live Secure Sessions</h2>
                <p className="text-xs text-[#8e8a80]">Active proctored exams assigned to your profile at {user.institutionName || "SRM University AP"}.</p>
              </div>

              {/* Institution Assessments */}
              <div className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-[0_4px_20px_rgba(142,126,98,0.04)]">
                <div>
                  <h3 className="text-base font-bold text-[#1a1917]">Institution Assessments</h3>
                  <p className="text-xs text-[#8e8a80]">Assessments assigned to your profile at {user.institutionName || "Unlinked University"}</p>
                </div>
                <div className="mt-4 space-y-3">
                  {dbAssessments.length === 0 ? (
                    <div className="py-6 text-center text-xs text-[#8e8a80] border border-dashed rounded-xl">
                      No active assessments available for your institution at this moment.
                    </div>
                  ) : (
                    dbAssessments.map((ass) => {
                      return (
                        <div key={ass.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-[#FAF6EE]/55 border border-[#ebdcc9]/40 gap-4">
                          <div>
                            <span className="text-sm font-bold text-[#1a1917] block">{ass.title}</span>
                            <span className="text-xs text-[#8e8a80] mt-0.5 block">
                              Duration: {ass.duration} mins • {ass.questionsCount} Questions • Faculty: {ass.facultyName}
                            </span>
                          </div>

                          <div>
                            {ass.attemptStatus === "not_started" && (
                              <button
                                type="button"
                                onClick={() => onStartAssessment(ass.id)}
                                className="bg-[#1a1917] text-white hover:bg-black px-4 py-2 rounded-xl text-xs font-semibold shadow-sm transition cursor-pointer"
                              >
                                Start Secure Exam
                              </button>
                            )}
                            {ass.attemptStatus === "started" && (
                              <button
                                type="button"
                                onClick={() => onStartAssessment(ass.id)}
                                className="bg-amber-500 text-white hover:bg-amber-600 px-4 py-2 rounded-xl text-xs font-semibold shadow-sm transition cursor-pointer animate-pulse"
                              >
                                Resume Exam
                              </button>
                            )}
                            {ass.attemptStatus === "submitted" && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-100">
                                Submitted for Evaluation
                              </span>
                            )}
                            {ass.attemptStatus === "graded" && (
                              <div className="text-right">
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
                                  Score: {ass.attemptScore} pts
                                </span>
                                <span className="block text-[9px] text-[#8e8a80] mt-1 font-semibold">Integrity Index: {ass.attemptIntegrity}%</span>
                              </div>
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
              {/* Top Row Grid of 4 KPI Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {/* Card 1: Integrity Score */}
                <motion.div
                  whileHover={{ y: -5, scale: 1.03, boxShadow: "0 10px 20px -5px rgba(142,126,98,0.12), 0 0 0 1px rgba(197, 175, 138, 0.3)" }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-[0_4px_20px_rgba(142,126,98,0.04)] flex flex-col justify-between transition-all duration-300"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-bold text-[#8e8a80] uppercase tracking-wider">Integrity Score</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${integrityColor}`}>{integrityLabel}</span>
                    </div>
                    <div className="mt-2.5 flex items-baseline gap-1">
                      <span className="text-3xl font-extrabold text-[#1a1917]">{avgIntegrity}</span>
                      <span className="text-sm font-medium text-[#8e8a80]">/100</span>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="w-full bg-[#FAF6EE] h-1.5 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${avgIntegrity}%` }} />
                    </div>
                    <span className="text-[11.5px] text-[#6b6760] mt-2 block">Calculated from AI Proctoring alerts</span>
                  </div>
                </motion.div>

                {/* Card 2: Academic GPA */}
                <motion.div
                  whileHover={{ y: -5, scale: 1.03, boxShadow: "0 10px 20px -5px rgba(142,126,98,0.12), 0 0 0 1px rgba(197, 175, 138, 0.3)" }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-[0_4px_20px_rgba(142,126,98,0.04)] flex flex-col justify-between transition-all duration-300"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-bold text-[#8e8a80] uppercase tracking-wider">Academic GPA</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${gpaColor}`}>{gpaLabel}</span>
                    </div>
                    <div className="mt-2.5 flex items-baseline gap-1">
                      <span className="text-3xl font-extrabold text-[#1a1917]">{calculatedGPA.toFixed(1)}</span>
                      <span className="text-sm font-medium text-[#8e8a80]">/10.0</span>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="w-full bg-[#FAF6EE] h-1.5 rounded-full overflow-hidden">
                      <div className="bg-[#c5af8a] h-full rounded-full" style={{ width: `${calculatedGPA * 10}%` }} />
                    </div>
                    <span className="text-[11.5px] text-[#6b6760] mt-2 block">Derived from graded assessments</span>
                  </div>
                </motion.div>

                {/* Card 3: Attendance */}
                <motion.div
                  whileHover={{ y: -5, scale: 1.03, boxShadow: "0 10px 20px -5px rgba(142,126,98,0.12), 0 0 0 1px rgba(197, 175, 138, 0.3)" }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-[0_4px_20px_rgba(142,126,98,0.04)] flex flex-col justify-between transition-all duration-300"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-bold text-[#8e8a80] uppercase tracking-wider">Attendance Rate</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${attendanceColor}`}>{attendanceLabel}</span>
                    </div>
                    <div className="mt-2.5 flex items-baseline gap-1">
                      <span className="text-3xl font-extrabold text-[#1a1917]">{attendanceRateVal}%</span>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="w-full bg-[#FAF6EE] h-1.5 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${attendanceRateVal}%` }} />
                    </div>
                    <span className="text-[11.5px] text-[#6b6760] mt-2 block">{completedCount}/{totalAssessmentsCount} Assessments completed</span>
                  </div>
                </motion.div>

                {/* Card 4: Completion */}
                <motion.div
                  whileHover={{ y: -5, scale: 1.03, boxShadow: "0 10px 20px -5px rgba(142,126,98,0.12), 0 0 0 1px rgba(197, 175, 138, 0.3)" }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-[0_4px_20px_rgba(142,126,98,0.04)] flex flex-col justify-between transition-all duration-300"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-bold text-[#8e8a80] uppercase tracking-wider">Course Modules</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${completionColor}`}>{completionLabel}</span>
                    </div>
                    <div className="mt-2.5 flex items-baseline gap-1">
                      <span className="text-3xl font-extrabold text-[#1a1917]">{completionPercent}%</span>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="w-full bg-[#FAF6EE] h-1.5 rounded-full overflow-hidden">
                      <div className="bg-amber-500 h-full rounded-full" style={{ width: `${completionPercent}%` }} />
                    </div>
                    <span className="text-[11.5px] text-[#6b6760] mt-2 block">{completedCount}/{totalAssessmentsCount} Modules completed</span>
                  </div>
                </motion.div>
              </div>

              {/* Main workspace layout grid (split 2:1 column structure) */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* COLUMN 1 & 2: LEFT BLOCK (Main metrics & lists) */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Institution Assessments */}
                  <div className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-[0_4px_20px_rgba(142,126,98,0.04)]">
                    <div>
                      <h3 className="text-base font-bold text-[#1a1917]">Institution Assessments</h3>
                      <p className="text-xs text-[#8e8a80]">Assessments assigned to your profile at {user.institutionName || "Unlinked University"}</p>
                    </div>
                    <div className="mt-4 space-y-3">
                      {dbAssessments.length === 0 ? (
                        <div className="py-6 text-center text-xs text-[#8e8a80] border border-dashed rounded-xl">
                          No active assessments available for your institution at this moment.
                        </div>
                      ) : (
                        dbAssessments.map((ass) => {
                          return (
                            <div key={ass.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-[#FAF6EE]/55 border border-[#ebdcc9]/40 gap-4">
                              <div>
                                <span className="text-sm font-bold text-[#1a1917] block">{ass.title}</span>
                                <span className="text-xs text-[#8e8a80] mt-0.5 block">
                                  Duration: {ass.duration} mins • {ass.questionsCount} Questions • Faculty: {ass.facultyName}
                                </span>
                              </div>

                              <div>
                                {ass.attemptStatus === "not_started" && (
                                  <button
                                    type="button"
                                    onClick={() => onStartAssessment(ass.id)}
                                    className="bg-[#1a1917] text-white hover:bg-black px-4 py-2 rounded-xl text-xs font-semibold shadow-sm transition cursor-pointer"
                                  >
                                    Start Secure Exam
                                  </button>
                                )}
                                {ass.attemptStatus === "started" && (
                                  <button
                                    type="button"
                                    onClick={() => onStartAssessment(ass.id)}
                                    className="bg-amber-500 text-white hover:bg-amber-600 px-4 py-2 rounded-xl text-xs font-semibold shadow-sm transition cursor-pointer animate-pulse"
                                  >
                                    Resume Exam
                                  </button>
                                )}
                                {ass.attemptStatus === "submitted" && (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-100">
                                    Submitted for Evaluation
                                  </span>
                                )}
                                {ass.attemptStatus === "graded" && (
                                  <div className="text-right">
                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
                                      Score: {ass.attemptScore} pts
                                    </span>
                                    <span className="block text-[9px] text-[#8e8a80] mt-1 font-semibold">Integrity Index: {ass.attemptIntegrity}%</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Performance Velocity BarChart Card */}
                  <div className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-[0_4px_20px_rgba(142,126,98,0.04)]">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h3 className="text-base font-bold text-[#1a1917]">Performance Velocity</h3>
                        <p className="text-xs text-[#8e8a80]">Academic activity and check ratings over time</p>
                      </div>

                      {/* Period Toggle Switch */}
                      <div className="bg-[#FAF6EE] border border-[#ebdcc9]/50 rounded-xl p-1 flex">
                        <button
                          type="button"
                          onClick={() => setChartPeriod("weekly")}
                          className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                            chartPeriod === "weekly"
                              ? "bg-white text-[#1a1917] shadow-sm"
                              : "text-[#8e8a80] hover:text-[#1a1917]"
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
                              : "text-[#8e8a80] hover:text-[#1a1917]"
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
                            stroke="#8e8a80"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis
                            stroke="#8e8a80"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                            domain={[0, 100]}
                          />
                          <Tooltip
                            cursor={{ fill: "#FAF6EE", opacity: 0.5 }}
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                return (
                                  <div className="bg-white border border-[#ebdcc9] rounded-xl p-3 shadow-md">
                                    <p className="text-xs font-bold text-[#1a1917]">{payload[0].payload.name}</p>
                                    <p className="text-sm font-extrabold text-[#c5af8a] mt-0.5">
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
                                fill={entry.isCurrent ? "#1a1917" : "#c5af8a"}
                                opacity={entry.isCurrent ? 1.0 : 0.45}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Academic Assessment History Table Card */}
                  <div className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-[0_4px_20px_rgba(142,126,98,0.04)]">
                    <div className="flex items-center justify-between mb-5">
                      <div>
                        <h3 className="text-base font-bold text-[#1a1917]">Academic History</h3>
                        <p className="text-xs text-[#8e8a80]">Historical record of verified exam sessions</p>
                      </div>

                      {/* Dropdown Filters */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setShowHistoryFilter(!showHistoryFilter)}
                          className="flex items-center gap-2 bg-[#FAF6EE] border border-[#ebdcc9] rounded-xl px-3.5 py-1.5 text-xs font-semibold text-[#6b6760] hover:text-[#1a1917] hover:bg-[#eae6db] transition-colors cursor-pointer"
                        >
                          <Filter className="size-3.5" />
                          <span>{historyFilter}</span>
                          <ChevronDown className="size-3.5" />
                        </button>

                        {showHistoryFilter && (
                          <div className="absolute right-0 mt-1.5 w-44 rounded-xl border border-[#ebdcc9] bg-[#fffbf2] shadow-lg z-10">
                            {["All Assessments", "Quizzes Only", "Exams Only"].map((filter) => (
                              <button
                                type="button"
                                onClick={() => {
                                  setHistoryFilter(filter);
                                  setShowHistoryFilter(false);
                                  toast.info(`Filtered history list by: ${filter}`);
                                }}
                                className="w-full px-4 py-2 text-left text-xs text-[#6b6760] hover:bg-[#F5EEDC] hover:text-[#1a1917] transition-colors font-medium first:rounded-t-xl last:rounded-b-xl"
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
                          <tr className="border-b border-[#ebdcc9]/50 text-left">
                            <th className="pb-3 text-xs font-bold text-[#8e8a80] uppercase tracking-wider">Assessment</th>
                            <th className="pb-3 text-xs font-bold text-[#8e8a80] uppercase tracking-wider">Date</th>
                            <th className="pb-3 text-xs font-bold text-[#8e8a80] uppercase tracking-wider">Integrity</th>
                            <th className="pb-3 text-xs font-bold text-[#8e8a80] uppercase tracking-wider text-right">Score</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#ebdcc9]/30">
                          {academicHistory.map((item, idx) => (
                            <tr key={idx} className="group hover:bg-[#FAF6EE]/30 transition-colors">
                              <td className="py-3.5 text-sm font-bold text-[#1a1917]">{item.name}</td>
                              <td className="py-3.5 text-xs text-[#6b6760]">{item.date}</td>
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
                    <div className="mt-4 pt-3 border-t border-[#ebdcc9]/30 flex justify-center">
                      <button
                        type="button"
                        onClick={() => setExpandHistory(!expandHistory)}
                        className="flex items-center gap-1.5 text-xs font-bold text-[#c5af8a] hover:text-[#1a1917] transition-colors cursor-pointer"
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
                  <div className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-[0_4px_20px_rgba(142,126,98,0.04)]">
                    <div>
                      <h3 className="text-base font-bold text-[#1a1917]">Radar Profile</h3>
                      <p className="text-xs text-[#8e8a80]">Biometric & behavioral category metrics</p>
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
                              stroke="#ebdcc9"
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
                              stroke={isHovered ? "#1a1917" : "#ebdcc9"}
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
                              fill="rgba(197,175,138,0.22)"
                              stroke="#c5af8a"
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
                                fill={isHovered ? "#fff" : "#c5af8a"}
                                stroke="#c5af8a"
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
                                fill={hoveredRadarIdx === null ? "#1a1917" : isHovered ? "#1a1917" : "#8e8a80"}
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
                            className="absolute z-10 bg-white/95 backdrop-blur-md border border-[#ebdcc9] shadow-lg px-2.5 py-1.5 rounded-xl pointer-events-none text-left select-none text-[10px] font-bold text-[#1a1917]"
                            style={{
                              left: `${(px / 300) * 100 + 4}%`,
                              top: `${(py / 220) * 100 - 15}%`,
                            }}
                          >
                            <div className="font-extrabold">{m.name}</div>
                            <div className="text-[#c5af8a] mt-0.5">{m.val}% Rating</div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Plagiarism Analysis Card */}
                  <motion.div
                    whileHover={{ y: -5, scale: 1.03, boxShadow: "0 10px 20px -5px rgba(142,126,98,0.12), 0 0 0 1px rgba(197, 175, 138, 0.3)" }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-[0_4px_20px_rgba(142,126,98,0.04)] flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Search className="size-4.5 text-[#c5af8a]" />
                          <span className="text-[12px] font-bold text-[#8e8a80] uppercase tracking-wider">Integrity Tools</span>
                        </div>
                        <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">Ready</span>
                      </div>
                      <h3 className="text-base font-bold text-[#1a1917] mt-3">Text Plagiarism Analysis</h3>
                      <p className="text-xs text-[#8e8a80] mt-1.5 leading-relaxed">
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
                  <div className="bg-[#FAF6EE] border border-[#ebdcc9] rounded-2xl p-5 shadow-[0_4px_16px_rgba(0,0,0,0.01)] flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Sparkles className="size-4 text-[#c5af8a]" />
                          <span className="text-xs font-bold text-[#1a1917]">Integrity Copilot</span>
                        </div>
                        {/* Active green status indicator */}
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200">
                          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-[10px] font-bold text-emerald-700">Active</span>
                        </div>
                      </div>
                      <p className="text-[12.5px] leading-relaxed text-[#6b6760] mt-3">
                        AI verification Shield has validated your student credentials. Identity checking is running in the background. No anomalies detected.
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-[#ebdcc9]/40 flex justify-end">
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
                  <div className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-[0_4px_20px_rgba(142,126,98,0.04)]">
                    <div>
                      <span className="text-[10px] font-bold text-[#c5af8a] uppercase tracking-wider">Next Up</span>
                      <h3 className="text-base font-bold text-[#1a1917] mt-0.5">Algorithms Midterm</h3>
                      <p className="text-xs text-[#8e8a80] mt-0.5">Prof. Robert Chen • CSE-302</p>
                    </div>

                    {/* Countdown display */}
                    <div className="mt-5 flex items-center justify-center gap-3">
                      <div className="flex flex-col items-center">
                        <div className="bg-[#FAF6EE] border border-[#ebdcc9] rounded-xl size-12 flex items-center justify-center text-[18px] font-extrabold text-[#1a1917] font-mono">
                          {formattedHours}
                        </div>
                        <span className="text-[10px] font-bold text-[#8e8a80] mt-1 uppercase">Hrs</span>
                      </div>
                      <span className="text-xl font-bold text-[#ebdcc9] mb-4">:</span>
                      <div className="flex flex-col items-center">
                        <div className="bg-[#FAF6EE] border border-[#ebdcc9] rounded-xl size-12 flex items-center justify-center text-[18px] font-extrabold text-[#1a1917] font-mono">
                          {formattedMinutes}
                        </div>
                        <span className="text-[10px] font-bold text-[#8e8a80] mt-1 uppercase">Min</span>
                      </div>
                      <span className="text-xl font-bold text-[#ebdcc9] mb-4">:</span>
                      <div className="flex flex-col items-center">
                        <div className="bg-[#FAF6EE] border border-[#ebdcc9] rounded-xl size-12 flex items-center justify-center text-[18px] font-extrabold text-[#1a1917] font-mono">
                          {formattedSeconds}
                        </div>
                        <span className="text-[10px] font-bold text-[#8e8a80] mt-1 uppercase">Sec</span>
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
                  <div className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-[0_4px_20px_rgba(142,126,98,0.04)]">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-base font-bold text-[#1a1917]">Live Groups</h3>
                        <p className="text-xs text-[#8e8a80]">Online student circles in your cohort</p>
                      </div>
                      <Users className="size-4.5 text-[#8e8a80]" />
                    </div>

                    <div className="space-y-3">
                      {/* Circle 1 */}
                      <div className="flex items-center justify-between p-3 rounded-xl bg-[#FAF6EE]/55 border border-[#ebdcc9]/40">
                        <div className="flex items-center gap-2">
                          {/* pulsing dot */}
                          <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-xs font-bold text-[#1a1917]">Algo-Wizards</span>
                        </div>
                        <span className="text-[10.5px] font-bold text-[#8e8a80]">8 Online</span>
                      </div>

                      {/* Circle 2 */}
                      <div className="flex items-center justify-between p-3 rounded-xl bg-[#FAF6EE]/55 border border-[#ebdcc9]/40">
                        <div className="flex items-center gap-2">
                          <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-xs font-bold text-[#1a1917]">Ethics Debate Circle</span>
                        </div>
                        <span className="text-[10.5px] font-bold text-[#8e8a80]">5 Online</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : activeTab === "Support" ? (
            <div className="space-y-6">
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-bold tracking-tight">Support Center Hub</h2>
                <p className="text-xs text-[#8e8a80]">Get real-time AI assistance, connect with a support representative, or manage your active tickets.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Side: Ticket Triage / Chat Workspace */}
                <div className="lg:col-span-2 flex flex-col gap-4">
                  {activeSupportTicket ? (
                    <div className="bg-white border border-[#ebdcc9] rounded-2xl flex flex-col h-[520px] overflow-hidden shadow-sm">
                      {/* Header */}
                      <div className="p-4 border-b border-[#ebdcc9]/40 flex justify-between items-center bg-[#FAF6EE]/30">
                        <div>
                          <span className="text-[10px] font-mono font-bold text-[#8e8a80]">{activeSupportTicket.referenceNumber}</span>
                          <h3 className="text-sm font-bold text-[#1a1917]">Integrity Assistant Chat</h3>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border capitalize ${
                            activeSupportTicket.status === "resolved"
                              ? "bg-zinc-50 border-zinc-200 text-zinc-500"
                              : activeSupportTicket.status === "active"
                              ? "bg-emerald-50 border-emerald-100 text-emerald-600 animate-pulse"
                              : "bg-[#FAF0DD] border-[#e3d5ba] text-[#9a7b4f]"
                          }`}>
                            {activeSupportTicket.status}
                          </span>
                        </div>
                      </div>

                      {/* Queue Status / Live Triage */}
                      {activeSupportTicket.status !== "resolved" && (
                        <div className="p-3 border-b border-[#ebdcc9]/30 bg-[#FAF0DD]/50 flex flex-col gap-2">
                          <div className="flex items-center justify-between text-xs font-semibold text-amber-800">
                            <span>Connecting to Support Queue...</span>
                            <span>Queue Position: #{activeSupportTicket.queuePosition || 1}</span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-[#8e8a80] font-semibold">
                            <span>Estimated Wait Time: {activeSupportTicket.estimatedWait || 3} mins</span>
                            <span>Assigned: {activeSupportTicket.assignedAgentName || "Waiting for representative"}</span>
                          </div>
                          {/* Pulsing connection bar */}
                          <div className="w-full bg-[#FAF6EE] h-1.5 rounded-full overflow-hidden mt-1 border border-[#ebdcc9]/20">
                            <div className="bg-[#9a7b4f] h-full rounded-full animate-pulse" style={{ width: activeSupportTicket.assignedAgentId ? "100%" : "35%" }} />
                          </div>
                        </div>
                      )}

                      {/* Messages Area */}
                      <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-zinc-950 text-white">
                        <div className="rounded-xl p-3 bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 leading-relaxed">
                          <span className="font-bold text-white block mb-1">Your Submission Summary:</span>
                          {activeSupportTicket.description}
                        </div>

                        {activeSupportTicket.messages?.map((msg: any) => {
                          const isMe = msg.senderId === user.id;
                          const isAI = msg.senderRole === "ai";
                          return (
                            <div
                              key={msg.id}
                              className={`flex gap-2.5 max-w-[80%] items-start ${
                                isMe ? "ml-auto" : "mr-auto"
                              }`}
                            >
                              {isAI && <ChatbotIcon className="size-6 mt-0.5" />}
                              <div
                                className={`flex flex-col rounded-2xl p-3 text-xs leading-relaxed ${
                                  isMe
                                    ? "bg-zinc-200 text-zinc-900 border border-zinc-300"
                                    : isAI
                                    ? "bg-white text-zinc-900 border border-zinc-200 shadow-[0_0_12px_rgba(255,255,255,0.15)]"
                                    : "bg-white border border-zinc-200 text-zinc-900"
                                }`}
                              >
                                <span className="font-bold block mb-1 text-[10px] text-zinc-400">
                                  {isAI ? "Integrity Assistant" : msg.senderName}
                                </span>
                                <span className="font-medium text-zinc-900">{msg.content}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Send input */}
                      {activeSupportTicket.status !== "resolved" && (
                        <div className="p-3 border-t border-[#ebdcc9]/40 flex gap-2">
                          <input
                            type="text"
                            value={supportMessage}
                            onChange={(e) => setSupportMessage(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSendSupportMessage()}
                            placeholder="Type a message or response details..."
                            className="flex-1 bg-[#FAF6EE] border border-[#ebdcc9]/60 rounded-xl px-4 py-2 text-xs placeholder:text-[#a7a297] text-[#1a1917] focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={handleSendSupportMessage}
                            className="bg-[#1a1917] text-white p-2 rounded-xl hover:bg-black transition flex items-center justify-center cursor-pointer"
                          >
                            <Send className="size-4" />
                          </button>
                        </div>
                      )}

                      {activeSupportTicket.status === "resolved" && (
                        <div className="p-4 bg-zinc-50 border-t border-[#ebdcc9]/40 text-center flex flex-col items-center justify-center gap-2">
                          <span className="text-xs font-bold text-zinc-600">This conversation has been resolved.</span>
                          <button
                            type="button"
                            onClick={() => setActiveSupportTicket(null)}
                            className="bg-black hover:bg-zinc-800 text-white text-xs font-bold px-4 py-1.5 rounded-xl transition cursor-pointer"
                          >
                            File New Ticket
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Ticket Submission Form */
                    <div className="bg-white border border-[#ebdcc9] rounded-2xl p-6 shadow-[0_4px_20px_rgba(142,126,98,0.04)] space-y-4">
                      <div>
                        <h3 className="text-base font-bold text-[#1a1917]">Submit Support Request</h3>
                        <p className="text-xs text-[#8e8a80] mt-0.5">Please fill out details to raise a support ticket and connect to our triage queue.</p>
                      </div>

                      <div className="space-y-3">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-semibold text-[#6b6760]">Support Category</label>
                          <select
                            value={ticketCategory}
                            onChange={(e) => setTicketCategory(e.target.value)}
                            className="h-10 bg-[#FAF6EE] border border-[#ebdcc9] rounded-xl px-3 text-xs outline-none focus:ring-1 focus:ring-[#c5af8a]"
                          >
                            <option value="technical">Technical Assistance</option>
                            <option value="assessment">Assessment Assistance</option>
                            <option value="account-recovery">Account Recovery</option>
                            <option value="integrity-clarifications">Integrity Report Clarification</option>
                          </select>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-semibold text-[#6b6760]">Priority Level</label>
                          <select
                            value={ticketPriority}
                            onChange={(e) => setTicketPriority(e.target.value)}
                            className="h-10 bg-[#FAF6EE] border border-[#ebdcc9] rounded-xl px-3 text-xs outline-none focus:ring-1 focus:ring-[#c5af8a]"
                          >
                            <option value="low">Low Priority</option>
                            <option value="medium">Medium Priority</option>
                            <option value="high">High Priority (Exam Blocker)</option>
                          </select>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-semibold text-[#6b6760]">Describe your Issue</label>
                          <textarea
                            value={ticketDescription}
                            onChange={(e) => setTicketDescription(e.target.value)}
                            rows={4}
                            placeholder="Explain the technical issue or exam obstacle you've encountered..."
                            className="bg-[#FAF6EE] border border-[#ebdcc9] rounded-xl p-3 text-xs outline-none focus:ring-1 focus:ring-[#c5af8a] placeholder:text-[#a7a297]"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={handleSubmitTicket}
                          className="w-full bg-[#1a1917] text-white hover:bg-black py-2.5 rounded-xl text-xs font-semibold shadow-sm transition cursor-pointer"
                        >
                          Submit Support Ticket & Connect AI
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Side: Support Ticket History Tracker */}
                <div className="space-y-4">
                  <div className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-sm flex flex-col gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-[#1a1917]">Ticket Tracker</h4>
                      <p className="text-[11px] text-[#8e8a80] mt-0.5">Manage and track live ticket status and responses.</p>
                    </div>

                    <div className="space-y-2 mt-2">
                      {supportTickets.length === 0 ? (
                        <div className="py-8 text-center text-xs text-[#8e8a80] border border-dashed rounded-xl">
                          No historical support tickets filed.
                        </div>
                      ) : (
                        supportTickets.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setActiveSupportTicket(t)}
                            className="w-full flex items-center justify-between p-3 rounded-xl bg-[#FAF6EE]/55 border border-[#ebdcc9]/40 hover:bg-[#FAF6EE] transition cursor-pointer text-left"
                          >
                            <div>
                              <span className="text-[10px] font-mono text-[#8e8a80] block">{t.referenceNumber}</span>
                              <span className="text-xs font-bold text-[#1a1917] truncate max-w-[140px] block mt-0.5 capitalize">{t.category.replace("-", " ")}</span>
                            </div>
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border capitalize ${
                              t.status === "resolved"
                                ? "bg-zinc-50 border-zinc-200 text-zinc-500"
                                : t.status === "active"
                                ? "bg-emerald-50 border-emerald-100 text-emerald-600 animate-pulse"
                                : "bg-[#FAF0DD] border-[#e3d5ba] text-[#9a7b4f]"
                            }`}>
                              {t.status}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  {activeSupportTicket && (
                    <button
                      type="button"
                      onClick={() => setActiveSupportTicket(null)}
                      className="w-full bg-[#FAF6EE] hover:bg-[#eae6db] text-[#1a1917] border border-[#ebdcc9] py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer"
                    >
                      Create Another Ticket
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : activeTab === "Plagiarism Analysis" ? (
            <PlagiarismAnalysis user={user} />
          ) : activeTab === "Messages" ? (
            <StudentMessagingView />
          ) : activeTab === "Integrity Reports" ? (
            <IntegrityReports user={user} dbAssessments={dbAssessments} />
          ) : (
            <div className="bg-white border border-[#ebdcc9] rounded-2xl p-10 text-center text-sm text-[#8e8a80] shadow-sm">
              <span className="text-lg font-bold block mb-2">{activeTab}</span>
              This section is a visual simulation layout for testing proctor dashboards.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
