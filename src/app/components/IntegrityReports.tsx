import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Shield,
  CheckCircle,
  AlertTriangle,
  Clock,
  ArrowLeft,
  Loader2,
  Calendar,
  AlertCircle,
  BookOpen,
  ChevronRight,
  Eye,
  Award
} from "lucide-react";
import { toast } from "sonner";
import { io } from "socket.io-client";
import { IntegrityRadarProfile } from "./IntegrityRadarProfile";

interface IntegrityReportsProps {
  user: any;
  dbAssessments: any[];
}

export function IntegrityReports({ user, dbAssessments }: IntegrityReportsProps) {
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [attemptDetails, setAttemptDetails] = useState<any | null>(null);

  // Filter for completed assessments (status is submitted, graded, or Faculty Review Required)
  const completedAssessments = dbAssessments.filter(
    (ass) =>
      ass.attemptStatus === "submitted" ||
      ass.attemptStatus === "graded" ||
      ass.attemptStatus === "Faculty Review Required"
  );

  const handleDownloadCertificate = () => {
    if (!attemptDetails) return;
    
    const win = window.open("", "_blank");
    if (!win) {
      toast.error("Failed to open print window. Please allow popups.");
      return;
    }

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Assessment Integrity Certificate - ${attemptDetails.studentName}</title>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=Montserrat:wght@400;600;800&family=Great+Vibes&display=swap" rel="stylesheet">
  <style>
    body {
      background: #FAF9F5;
      font-family: 'Montserrat', sans-serif;
      margin: 0;
      padding: 40px;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }
    .cert-card {
      width: 800px;
      background: white;
      border: 12px double #c5af8a;
      padding: 50px;
      position: relative;
      box-shadow: 0 10px 30px rgba(0,0,0,0.05);
      border-radius: 8px;
    }
    .cert-header {
      text-align: center;
      margin-bottom: 30px;
    }
    .cert-title {
      font-family: 'Cinzel', serif;
      font-size: 28px;
      color: #1a1917;
      letter-spacing: 2px;
      margin-top: 10px;
    }
    .cert-subtitle {
      font-size: 11px;
      font-weight: 800;
      color: #c5af8a;
      letter-spacing: 3px;
      text-transform: uppercase;
    }
    .cert-logo {
      font-size: 40px;
      margin-bottom: 10px;
    }
    .cert-body {
      text-align: center;
      color: #6b6760;
      font-size: 14px;
      line-height: 1.8;
    }
    .student-name {
      font-family: 'Great Vibes', cursive;
      font-size: 45px;
      color: #1a1917;
      margin: 20px 0;
    }
    .highlight-box {
      display: flex;
      justify-content: center;
      gap: 50px;
      margin: 30px 0;
      padding: 20px;
      background: #FAF6EE;
      border-radius: 16px;
      border: 1px solid #ebdcc9;
    }
    .highlight-item {
      text-align: center;
    }
    .highlight-label {
      font-size: 9px;
      font-weight: 800;
      color: #8e8a80;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .highlight-val {
      font-size: 20px;
      font-weight: 800;
      color: #1a1917;
      margin-top: 5px;
    }
    .cert-footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 50px;
      border-top: 1px solid rgba(235, 220, 201, 0.4);
      padding-top: 30px;
    }
    .signature-area {
      text-align: center;
      width: 200px;
    }
    .signature {
      font-family: 'Great Vibes', cursive;
      font-size: 32px;
      color: #1a1917;
      margin-bottom: 5px;
    }
    .signature-title {
      font-size: 10px;
      font-weight: 600;
      color: #8e8a80;
      border-top: 1px solid #ebdcc9;
      padding-top: 5px;
      text-transform: uppercase;
    }
    .serial-box {
      position: absolute;
      bottom: 20px;
      left: 30px;
      font-size: 9px;
      font-family: monospace;
      color: #8e8a80;
    }
    .verify-box {
      position: absolute;
      bottom: 20px;
      right: 30px;
      font-size: 9px;
      font-family: monospace;
      color: #8e8a80;
    }
    .watermark {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 150px;
      opacity: 0.03;
      pointer-events: none;
      color: #1a1917;
      font-family: 'Cinzel', serif;
    }
  </style>
</head>
<body onload="window.print();">
  <div class="cert-card">
    <div class="watermark">IOS</div>
    <div class="cert-header">
      <div class="cert-logo">🛡️</div>
      <div class="cert-subtitle">Certificate of Academic Integrity</div>
      <div class="cert-title">${attemptDetails.assessment?.institutionName || "IntegrityOS University"}</div>
    </div>
    
    <div class="cert-body">
      This certifies that the examination attempt submitted for evaluation by
      <div class="student-name">${attemptDetails.studentName}</div>
      has been audited by the IntegrityOS automated Multi-Agent verification protocols. The assessment has successfully complied with all guidelines and security constraints.
      
      <div class="highlight-box">
        <div class="highlight-item">
          <div class="highlight-label">Assessment Attempted</div>
          <div class="highlight-val">${attemptDetails.assessment?.title}</div>
        </div>
        <div class="highlight-item">
          <div class="highlight-label">Integrity Index</div>
          <div class="highlight-val" style="color: ${attemptDetails.integrityScore >= 90 ? "#10b981" : attemptDetails.integrityScore >= 75 ? "#f59e0b" : "#f43f5e"}">${attemptDetails.integrityScore}%</div>
        </div>
        <div class="highlight-item">
          <div class="highlight-label">Compliance Level</div>
          <div class="highlight-val" style="text-transform: capitalize;">${attemptDetails.riskLevel || "Low"} Risk</div>
        </div>
      </div>
      
      Verified elements include continuous webcam tracking, tab focus state logs, semantic similarity projections, and duplication indices.
    </div>
    
    <div class="cert-footer">
      <div class="signature-area">
        <div class="signature">${attemptDetails.assessment?.facultyName || "Auditor Proct"}</div>
        <div class="signature-title">Authorized Faculty</div>
      </div>
      
      <div style="text-align: center;">
        <div style="font-size: 18px; margin-bottom: 5px;">💮</div>
        <div class="signature-title">Official Seal</div>
      </div>
      
      <div class="signature-area">
        <div class="signature" style="font-size: 24px; font-family: sans-serif; font-weight: bold; color: #c5af8a;">IntegrityOS</div>
        <div class="signature-title">Verification System</div>
      </div>
    </div>
    
    <div class="serial-box">
      CERT ID: ${attemptDetails.certificateNumber || "IOS-PENDING"}
    </div>
    
    <div class="verify-box">
      DIGITAL CODE: ${attemptDetails.verificationCode || "PENDING"}
    </div>
  </div>
</body>
</html>
    `;

    win.document.write(htmlContent);
    win.document.close();
  };

  const fetchAttemptDetails = async (attemptId: string) => {
    setIsLoadingDetails(true);
    try {
      const res = await fetch(`/api/assessments/attempts/${attemptId}`, {
        headers: {
          "x-user-id": user.id,
          "x-user-role": "user"
        }
      });
      if (res.ok) {
        const result = await res.json();
        setAttemptDetails(result.data);
        setSelectedAttemptId(attemptId);
      } else {
        toast.error("Failed to load integrity report details.");
      }
    } catch (err) {
      console.error(err);
      toast.error("An error occurred while loading details.");
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // Real-time WebSocket synchronizer for new integrity reports
  useEffect(() => {
    if (!user) return;
    const socket = io("http://localhost:5050", {
      auth: { userId: user.id, userRole: "user" }
    });

    socket.on("integrity-report-created", (data: any) => {
      if (selectedAttemptId === data.attemptId) {
        fetchAttemptDetails(data.attemptId);
        toast.info("Integrity analysis profile updated in real-time.");
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [user?.id, selectedAttemptId]);

  const getSeverityColor = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case "high":
        return "bg-rose-50 border-rose-200 text-rose-700";
      case "medium":
        return "bg-amber-50 border-amber-200 text-amber-700";
      default:
        return "bg-yellow-50 border-yellow-200 text-yellow-700";
    }
  };

  const getViolationBadgeLabel = (type: string) => {
    switch (type) {
      case "tab-switch":
        return "Tab Switch";
      case "gaze-away":
        return "Gaze Away";
      case "multiple-faces":
        return "Multiple Faces";
      case "no-face":
        return "Face Not Detected";
      case "talking":
        return "Talking Detected";
      default:
        return type;
    }
  };

  const getIntegrityColor = (score: number) => {
    if (score >= 90) return "text-emerald-600 stroke-emerald-500 bg-emerald-50/50 border-emerald-100";
    if (score >= 75) return "text-amber-600 stroke-amber-500 bg-amber-50/50 border-amber-100";
    return "text-rose-600 stroke-rose-500 bg-rose-50/50 border-rose-100";
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight text-[#1a1917]">Integrity Reports</h2>
        <p className="text-xs text-[#8e8a80]">
          Review behavioral compliance, webcam checks, and grading status of completed assessments.
        </p>
      </div>

      <AnimatePresence mode="wait">
        {!selectedAttemptId ? (
          /* LIST VIEW */
          <motion.div
            key="list"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {isLoadingDetails ? (
              <div className="bg-white border border-[#ebdcc9] rounded-2xl p-16 flex flex-col items-center justify-center gap-3 shadow-[0_4px_20px_rgba(142,126,98,0.04)]">
                <Loader2 className="size-8 text-[#c5af8a] animate-spin" />
                <span className="text-xs font-semibold text-[#8e8a80]">Loading integrity report...</span>
              </div>
            ) : completedAssessments.length === 0 ? (
              <div className="bg-white border border-[#ebdcc9] rounded-2xl p-16 text-center text-sm text-[#8e8a80] shadow-[0_4px_20px_rgba(142,126,98,0.04)] flex flex-col items-center justify-center gap-3">
                <div className="size-12 bg-[#FAF6EE] rounded-full flex items-center justify-center border border-[#ebdcc9]/50 text-[#c5af8a]">
                  <Shield className="size-6" />
                </div>
                <h3 className="font-bold text-[#1a1917] mt-2">No Reports Available</h3>
                <p className="max-w-xs text-xs text-[#8e8a80] leading-relaxed">
                  You do not have any completed assessments. Complete a secure exam to generate and view an integrity report.
                </p>
              </div>
            ) : (
              <div className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-[0_4px_20px_rgba(142,126,98,0.04)]">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-[#ebdcc9]/50 text-left">
                        <th className="pb-3 text-xs font-bold text-[#8e8a80] uppercase tracking-wider">Assessment Title</th>
                        <th className="pb-3 text-xs font-bold text-[#8e8a80] uppercase tracking-wider">Status</th>
                        <th className="pb-3 text-xs font-bold text-[#8e8a80] uppercase tracking-wider">Integrity Score</th>
                        <th className="pb-3 text-xs font-bold text-[#8e8a80] uppercase tracking-wider">Grade</th>
                        <th className="pb-3 text-xs font-bold text-[#8e8a80] uppercase tracking-wider text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#ebdcc9]/30">
                      {completedAssessments.map((ass) => {
                        const styleClass = getIntegrityColor(ass.attemptIntegrity || 100);
                        return (
                          <tr key={ass.id} className="group hover:bg-[#FAF6EE]/30 transition-colors">
                            <td className="py-4">
                              <div className="font-bold text-sm text-[#1a1917]">{ass.title}</div>
                              <div className="text-[11px] text-[#8e8a80] mt-0.5 font-medium">
                                Duration: {ass.duration} mins • Faculty: {ass.facultyName}
                              </div>
                            </td>
                            <td className="py-4">
                              <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border capitalize ${
                                ass.attemptStatus === "graded"
                                  ? "bg-emerald-50 border-emerald-150 text-emerald-600"
                                  : "bg-amber-50 border-amber-150 text-amber-600"
                              }`}>
                                {ass.attemptStatus === "graded"
                                  ? "Graded"
                                  : ass.attemptStatus === "Faculty Review Required"
                                  ? "Review Pending"
                                  : "Submitted"}
                              </span>
                            </td>
                            <td className="py-4">
                              <span className={`inline-flex items-center gap-1 text-xs font-extrabold px-2.5 py-1 rounded-lg border ${styleClass}`}>
                                <Shield className="size-3.5" />
                                {ass.attemptIntegrity}%
                              </span>
                            </td>
                            <td className="py-4 text-sm font-bold text-[#6b6760]">
                              {ass.attemptScore !== null ? `${ass.attemptScore} pts` : "Pending Eval"}
                            </td>
                            <td className="py-4 text-right">
                              <button
                                type="button"
                                onClick={() => fetchAttemptDetails(ass.attemptId)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-[#FAF6EE] border border-[#ebdcc9] text-[#1a1917] hover:bg-[#eae6db] transition-colors cursor-pointer"
                              >
                                <Eye className="size-3.5" />
                                <span>View Report</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </motion.div>
        ) : (
          /* DETAILS VIEW */
          <motion.div
            key="details"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Header / Navigation bar */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setSelectedAttemptId(null);
                  setAttemptDetails(null);
                }}
                className="inline-flex items-center gap-1 text-xs font-bold text-[#c5af8a] hover:text-[#1a1917] transition-colors cursor-pointer bg-transparent border-none"
              >
                <ArrowLeft className="size-4" />
                <span>Back to Integrity Reports</span>
              </button>

              <span className="text-xs font-medium text-[#8e8a80]">
                Attempt ID: <code className="font-mono bg-[#FAF6EE] px-1.5 py-0.5 rounded text-[11px] border border-[#ebdcc9]/50">{attemptDetails.id}</code>
              </span>
            </div>

            {/* Overview KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Card 1: Score & Grade details */}
              <div className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-[0_4px_20px_rgba(142,126,98,0.04)] flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold text-[#8e8a80] uppercase tracking-wider block">Evaluation Status</span>
                  <h3 className="text-lg font-bold text-[#1a1917] mt-1">{attemptDetails.assessment?.title}</h3>
                  <div className="mt-3 flex items-center gap-2">
                    <Award className="size-5 text-[#c5af8a]" />
                    <span className="text-sm font-semibold text-[#6b6760]">
                      Score: <strong className="text-base text-[#1a1917]">{attemptDetails.score !== null ? `${attemptDetails.score} pts` : "Pending Evaluation"}</strong>
                    </span>
                  </div>
                  {attemptDetails.status === "graded" && attemptDetails.certificateNumber && (
                    <button
                      type="button"
                      onClick={() => handleDownloadCertificate()}
                      className="w-full mt-4 py-2.5 bg-zinc-950 text-white rounded-xl text-xs font-bold hover:bg-zinc-800 transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer border-none shadow-sm"
                    >
                      <Award className="size-4 text-[#c5af8a]" />
                      Download Integrity Certificate
                    </button>
                  )}
                </div>
                <div className="mt-4 pt-3 border-t border-[#ebdcc9]/30 flex items-center justify-between text-xs text-[#8e8a80] font-medium">
                  <span className="flex items-center gap-1"><Clock className="size-3.5" /> Duration: {attemptDetails.assessment?.duration} mins</span>
                  <span>{attemptDetails.assessment?.gradingScheme === "points" ? "Point Scale" : "Percentile"}</span>
                </div>
              </div>

              {/* Card 2: Integrity Circle */}
              <div className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-[0_4px_20px_rgba(142,126,98,0.04)] flex items-center gap-5">
                {/* SVG Circular Ring */}
                <div className="relative size-24 shrink-0">
                  <svg className="size-full -rotate-90">
                    <circle
                      cx="48"
                      cy="48"
                      r="40"
                      fill="transparent"
                      stroke="#FAF6EE"
                      strokeWidth="8"
                    />
                    <circle
                      cx="48"
                      cy="48"
                      r="40"
                      fill="transparent"
                      stroke={attemptDetails.integrityScore >= 90 ? "#10b981" : attemptDetails.integrityScore >= 75 ? "#f59e0b" : "#f43f5e"}
                      strokeWidth="8"
                      strokeDasharray={2 * Math.PI * 40}
                      strokeDashoffset={2 * Math.PI * 40 * (1 - attemptDetails.integrityScore / 100)}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-xl font-extrabold text-[#1a1917]">{attemptDetails.integrityScore}%</span>
                    <span className="text-[9px] font-bold text-[#8e8a80] uppercase tracking-tight">Index</span>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-[#1a1917]">Integrity Score</h4>
                  <p className="text-xs text-[#8e8a80] mt-1 leading-normal">
                    {attemptDetails.integrityScore >= 90
                      ? "Excellent compliance. High environmental integrity detected."
                      : attemptDetails.integrityScore >= 75
                      ? "Moderate compliance. Minor distraction logs found."
                      : "Low compliance. Critical environmental anomalies flagged."}
                  </p>
                </div>
              </div>

              {/* Card 3: Timeline Summary */}
              <div className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-[0_4px_20px_rgba(142,126,98,0.04)] flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold text-[#8e8a80] uppercase tracking-wider block">Submission Timeline</span>
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-[#6b6760]">
                      <Calendar className="size-4 text-[#8e8a80]" />
                      <span>Started: <strong>{formatDate(attemptDetails.startedAt)}</strong></span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[#6b6760]">
                      <CheckCircle className="size-4 text-[#8e8a80]" />
                      <span>Submitted: <strong>{formatDate(attemptDetails.submittedAt)}</strong></span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 text-[11px] text-[#8e8a80] font-medium italic">
                  * All logs are cryptographic hashes synced to the local node.
                </div>
              </div>
            </div>

            {/* Integrity Radar Profile Area */}
            <IntegrityRadarProfile attemptDetails={attemptDetails} />

            {/* Split layout: Integrity Violations Timeline (Left) & Q&As Review (Right) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Column 1: Proctored Violations Log */}
              <div className="lg:col-span-1 space-y-4">
                <div className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-[0_4px_20px_rgba(142,126,98,0.04)] h-full flex flex-col">
                  <div>
                    <h3 className="text-base font-bold text-[#1a1917]">Proctoring Logs</h3>
                    <p className="text-xs text-[#8e8a80] mt-0.5">Real-time alerts generated by the webcam & browser environment</p>
                  </div>

                  <div className="mt-5 flex-1 space-y-4 overflow-y-auto max-h-[420px] pr-1">
                    {!attemptDetails.violations || attemptDetails.violations.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center py-8 px-4 border border-dashed border-[#ebdcc9] rounded-xl bg-[#FAF6EE]/20 gap-2">
                        <CheckCircle className="size-10 text-emerald-500" />
                        <h4 className="text-xs font-bold text-emerald-700">Perfect Proctor Log</h4>
                        <p className="text-[10.5px] text-[#8e8a80] leading-relaxed max-w-[180px]">No environment anomalies, tab switches, or gaze alerts were flagged.</p>
                      </div>
                    ) : (
                      attemptDetails.violations.map((alert: any, idx: number) => {
                        const badgClass = getSeverityColor(alert.severity);
                        return (
                          <div key={alert.id} className="relative pl-6 pb-2 last:pb-0">
                            {/* vertical timeline connector line */}
                            {idx < attemptDetails.violations.length - 1 && (
                              <div className="absolute left-2.5 top-6 bottom-0 w-0.5 bg-[#ebdcc9]/40" />
                            )}
                            
                            {/* dot indicator */}
                            <span className={`absolute left-1.5 top-1.5 size-2.5 rounded-full border-2 ${
                              alert.severity === "high" ? "bg-rose-500 border-rose-300" : alert.severity === "medium" ? "bg-amber-500 border-amber-300" : "bg-yellow-500 border-yellow-300"
                            }`} />

                            <div className="p-3.5 bg-[#FAF6EE]/50 border border-[#ebdcc9]/30 rounded-xl space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${badgClass}`}>
                                  {getViolationBadgeLabel(alert.type)}
                                </span>
                                <span className="text-[9px] font-bold text-[#8e8a80] font-mono">
                                  {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                              </div>
                              <p className="text-[11.5px] text-[#6b6760] font-medium leading-relaxed">
                                {alert.description}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* Column 2 & 3: Questions & Graded Review */}
              <div className="lg:col-span-2 space-y-4">
                <div className="bg-white border border-[#ebdcc9] rounded-2xl p-5 shadow-[0_4px_20px_rgba(142,126,98,0.04)]">
                  <div>
                    <h3 className="text-base font-bold text-[#1a1917]">Answer Script & Evaluations</h3>
                    <p className="text-xs text-[#8e8a80] mt-0.5">Submitted student responses along with automated grading reviews</p>
                  </div>

                  <div className="mt-5 space-y-4">
                    {!attemptDetails.answers || attemptDetails.answers.length === 0 ? (
                      <div className="py-12 text-center text-xs text-[#8e8a80] border border-dashed rounded-xl">
                        No responses logged for this attempt.
                      </div>
                    ) : (
                      attemptDetails.answers.map((ans: any, idx: number) => {
                        const question = ans.question || {};
                        const grade = ans.manualGrade !== null && ans.manualGrade !== undefined ? ans.manualGrade : ans.aiGrade;
                        const hasGrade = grade !== null && grade !== undefined;

                        return (
                          <div key={ans.id} className="border border-[#ebdcc9]/40 rounded-xl overflow-hidden bg-[#FAF6EE]/15">
                            {/* Question Header */}
                            <div className="p-4 bg-[#FAF6EE]/45 border-b border-[#ebdcc9]/30 flex justify-between items-start gap-4">
                              <div className="space-y-1">
                                <span className="text-[10px] font-bold text-[#c5af8a] uppercase tracking-wider">Question #{idx + 1}</span>
                                <h4 className="text-xs font-bold text-[#1a1917] leading-relaxed">{question.text}</h4>
                              </div>
                              <span className="text-[11px] font-bold text-[#8e8a80] shrink-0">
                                Points: {question.points || 1}
                              </span>
                            </div>

                            {/* Response content */}
                            <div className="p-4 space-y-3.5">
                              <div>
                                <span className="text-[10px] font-bold text-[#8e8a80] uppercase tracking-wider block mb-1.5">Submitted Response:</span>
                                <div className="p-3 bg-white border border-[#ebdcc9]/30 rounded-xl text-xs font-medium text-[#1a1917] leading-relaxed whitespace-pre-wrap">
                                  {ans.response}
                                </div>
                              </div>

                              {/* Evaluation Details */}
                              {hasGrade ? (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-2 border-t border-[#ebdcc9]/25">
                                  <div className="p-3 bg-zinc-950 text-white rounded-xl flex flex-col justify-center">
                                    <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Assigned Score</span>
                                    <span className="text-base font-extrabold text-[#c5af8a] mt-1">{grade} / {question.points}</span>
                                    <span className="text-[9.5px] text-zinc-500 font-semibold mt-0.5">
                                      {ans.manualGrade !== null ? "Manually Graded" : `AI Evaluated (Conf: ${Math.round((ans.aiConfidence || 1) * 100)}%)`}
                                    </span>
                                  </div>

                                  <div className="md:col-span-2 p-3 bg-white border border-[#ebdcc9]/30 rounded-xl flex flex-col justify-center">
                                    <span className="text-[9px] font-bold text-[#8e8a80] uppercase tracking-wider">Evaluation Comments</span>
                                    <p className="text-[11.5px] font-medium text-[#6b6760] leading-relaxed mt-1">
                                      {ans.feedback || "Standard evaluation completed. Compliance and correctness parameters are within normal expectations."}
                                    </p>
                                  </div>
                                </div>
                              ) : (
                                <div className="p-3.5 bg-yellow-50/50 border border-yellow-100 rounded-xl flex items-center gap-2 text-xs text-yellow-800 font-semibold">
                                  <Clock className="size-4 text-yellow-600 animate-pulse" />
                                  <span>Automated AI evaluation is in progress. Check back soon.</span>
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
