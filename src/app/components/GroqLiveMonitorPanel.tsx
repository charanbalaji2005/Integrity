import React, { useState, useEffect } from "react";
import {
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  Zap,
  Activity,
  Send,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  HelpCircle,
  Eye,
  Sliders,
} from "lucide-react";
import {
  analyzeLiveSessionWithGroq,
  queryLiveProctorCopilot,
  checkGroqLiveHealth,
  GROQ_MODEL,
  type LiveSessionTelemetry,
  type LiveSessionGroqAnalysis,
} from "../services/groq-service";

interface GroqLiveMonitorPanelProps {
  sessions: LiveSessionTelemetry[];
  onSelectSession?: (session: LiveSessionTelemetry) => void;
  className?: string;
}

export const GroqLiveMonitorPanel: React.FC<GroqLiveMonitorPanelProps> = ({
  sessions,
  className = "",
}) => {
  const [selectedSession, setSelectedSession] = useState<LiveSessionTelemetry | null>(
    sessions[0] || null
  );
  const [analysis, setAnalysis] = useState<LiveSessionGroqAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [copilotQuery, setCopilotQuery] = useState("");
  const [copilotResponse, setCopilotResponse] = useState<string | null>(null);
  const [isQueryingCopilot, setIsQueryingCopilot] = useState(false);
  const [groqStatus, setGroqStatus] = useState<{
    connected: boolean;
    latencyMs: number;
    model: string;
  }>({
    connected: true,
    latencyMs: 240,
    model: GROQ_MODEL,
  });

  useEffect(() => {
    checkGroqLiveHealth().then((status) => {
      setGroqStatus(status);
    });
  }, []);

  useEffect(() => {
    if (sessions.length > 0 && !selectedSession) {
      setSelectedSession(sessions[0]);
    }
  }, [sessions, selectedSession]);

  const handleRunAnalysis = async (sessionToAnalyze?: LiveSessionTelemetry) => {
    const target = sessionToAnalyze || selectedSession;
    if (!target) return;
    setIsAnalyzing(true);
    try {
      const res = await analyzeLiveSessionWithGroq(target);
      setAnalysis(res);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAskCopilot = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!copilotQuery.trim()) return;
    setIsQueryingCopilot(true);
    try {
      const res = await queryLiveProctorCopilot(
        copilotQuery,
        selectedSession || undefined
      );
      setCopilotResponse(res);
    } finally {
      setIsQueryingCopilot(false);
    }
  };

  return (
    <div
      className={`bg-white border border-[#dedede] rounded-2xl p-5 shadow-sm space-y-5 ${className}`}
    >
      {/* Header with Groq LPU Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#dedede]/50 pb-4">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-[#1a1917] text-amber-400 flex items-center justify-center shadow-sm">
            <Zap className="size-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-extrabold text-[#1a1917]">
                Groq LLM Live Proctor Copilot
              </h3>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                LPU Accelerated
              </span>
            </div>
            <p className="text-xs text-[#8a8a8a]">
              Real-time multi-modal candidate reasoning, gaze diversion forensics, and threat classification.
            </p>
          </div>
        </div>

        {/* Model Badge */}
        <div className="flex items-center gap-2 bg-[#f6f6f6] px-3 py-1.5 rounded-xl border border-[#dedede] text-xs">
          <Cpu className="size-3.5 text-zinc-600" />
          <span className="font-mono font-bold text-zinc-800 text-[11px]">
            {groqStatus.model}
          </span>
          <span className="text-[10px] text-zinc-400">
            • {groqStatus.latencyMs > 0 ? `${groqStatus.latencyMs}ms` : "online"}
          </span>
        </div>
      </div>

      {/* Main Grid: Live Session Selection & AI Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Monitored Candidate Selector & Quick Controls */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-600 uppercase tracking-wider">
              Active Monitored Streams ({sessions.length})
            </span>
            {selectedSession && (
              <button
                type="button"
                onClick={() => handleRunAnalysis(selectedSession)}
                disabled={isAnalyzing}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#1a1917] hover:bg-black px-3 py-1.5 rounded-lg shadow-sm transition disabled:opacity-50 cursor-pointer"
              >
                <Sparkles className="size-3 text-amber-300" />
                {isAnalyzing ? "Analyzing..." : "Audit With Groq"}
              </button>
            )}
          </div>

          {sessions.length === 0 ? (
            <div className="p-6 text-center border border-dashed border-[#dedede] rounded-xl bg-[#f6f6f6]/40 text-xs text-[#8a8a8a] space-y-2">
              <Eye className="size-6 mx-auto text-zinc-400" />
              <p className="font-semibold text-zinc-700">No active students on stream</p>
              <p className="text-[11px]">
                Live camera and telemetry streams will populate automatically when candidate assessments start.
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
              {sessions.map((sess) => {
                const isSelected = selectedSession?.id === sess.id;
                return (
                  <div
                    key={sess.id}
                    onClick={() => {
                      setSelectedSession(sess);
                      handleRunAnalysis(sess);
                    }}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex items-center justify-between ${
                      isSelected
                        ? "border-[#b2b2b2] bg-amber-50/40 ring-1 ring-[#b2b2b2]"
                        : "border-[#dedede]/60 bg-white hover:bg-zinc-50"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-zinc-900">
                          {sess.studentName}
                        </span>
                        <span
                          className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded border ${
                            sess.score >= 75
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-rose-50 text-rose-700 border-rose-200 animate-pulse"
                          }`}
                        >
                          {sess.score}% Integrity
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-500 block mt-0.5">
                        {sess.exam}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] font-bold text-rose-600 block">
                        {sess.alerts} alert(s)
                      </span>
                      <span className="text-[9px] text-zinc-400 font-mono">
                        {sess.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Copilot Natural Language Prompt */}
          <div className="pt-2 border-t border-[#dedede]/40 space-y-2">
            <span className="text-xs font-bold text-zinc-700 flex items-center gap-1.5">
              <HelpCircle className="size-3.5 text-zinc-500" />
              Ask Groq Invigilator Copilot
            </span>
            <form onSubmit={handleAskCopilot} className="flex gap-2">
              <input
                type="text"
                value={copilotQuery}
                onChange={(e) => setCopilotQuery(e.target.value)}
                placeholder="e.g. Is frequent gaze diversion to top-right suspicious?"
                className="flex-1 bg-[#f6f6f6]/60 border border-[#dedede] rounded-xl px-3 py-2 text-xs text-zinc-800 placeholder-zinc-400 outline-none focus:border-[#b2b2b2]"
              />
              <button aria-label="Send"
                type="submit"
                disabled={isQueryingCopilot || !copilotQuery.trim()}
                className="bg-[#1a1917] hover:bg-black text-white p-2 rounded-xl transition disabled:opacity-50 cursor-pointer"
              >
                <Send className="size-3.5" />
              </button>
            </form>

            {copilotResponse && (
              <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl text-xs text-zinc-800 space-y-1">
                <span className="text-[10px] font-extrabold text-amber-800 uppercase tracking-wider block">
                  Groq Copilot Verdict:
                </span>
                <p className="leading-relaxed text-[11.5px]">{copilotResponse}</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Groq Live Telemetry Analysis Card */}
        <div className="lg:col-span-7 flex flex-col justify-between p-4 bg-[#f6f6f6]/50 border border-[#dedede] rounded-xl space-y-4">
          <div className="flex items-center justify-between border-b border-[#dedede]/50 pb-2.5">
            <div className="flex items-center gap-2">
              <Activity className="size-4 text-amber-600" />
              <span className="text-xs font-bold text-zinc-800">
                {selectedSession
                  ? `Live Telemetry Evaluation: ${selectedSession.studentName}`
                  : "Live Stream Diagnostics"}
              </span>
            </div>
            {analysis && (
              <span className="text-[10px] font-mono text-zinc-400">
                Evaluated at {analysis.timestamp}
              </span>
            )}
          </div>

          {isAnalyzing ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="size-7 text-[#b2b2b2] animate-spin" />
              <p className="text-xs font-bold text-zinc-700">
                Groq LLM is evaluating candidate telemetry and multi-modal signals...
              </p>
              <span className="text-[10px] text-zinc-400 font-mono">
                Model: {groqStatus.model}
              </span>
            </div>
          ) : analysis ? (
            <div className="space-y-4">
              {/* Threat Level Banner */}
              <div
                className={`p-3.5 rounded-xl border flex items-center justify-between ${
                  analysis.threatLevel === "CRITICAL"
                    ? "bg-rose-50 border-rose-200 text-rose-800"
                    : analysis.threatLevel === "ELEVATED"
                    ? "bg-amber-50 border-amber-200 text-amber-800"
                    : "bg-emerald-50 border-emerald-200 text-emerald-800"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {analysis.threatLevel === "CRITICAL" ? (
                    <AlertTriangle className="size-5 text-rose-600 shrink-0" />
                  ) : analysis.threatLevel === "ELEVATED" ? (
                    <ShieldAlert className="size-5 text-amber-600 shrink-0" />
                  ) : (
                    <ShieldCheck className="size-5 text-emerald-600 shrink-0" />
                  )}
                  <div>
                    <span className="text-xs font-extrabold uppercase tracking-wide">
                      Threat Classification: {analysis.threatLevel}
                    </span>
                    <p className="text-[11px] leading-tight mt-0.5 opacity-90">
                      Cheating Probability Index: {analysis.riskPercentage}% (Certainty: {Math.round(analysis.confidence * 100)}%)
                    </p>
                  </div>
                </div>
              </div>

              {/* Assessment Narrative */}
              <div className="bg-white p-3.5 rounded-xl border border-[#dedede]/60 space-y-1.5 shadow-2xs">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                  AI Behavior Assessment
                </span>
                <p className="text-xs text-zinc-800 leading-relaxed font-medium">
                  {analysis.assessment}
                </p>
              </div>

              {/* Tactical Recommendations */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="bg-white p-3 rounded-xl border border-[#dedede]/60 space-y-1">
                  <span className="text-[10px] font-extrabold text-zinc-500 uppercase block">
                    Recommended Action
                  </span>
                  <p className="text-zinc-800 font-semibold text-[11px]">
                    {analysis.recommendedAction}
                  </p>
                </div>
                <div className="bg-white p-3 rounded-xl border border-[#dedede]/60 space-y-1">
                  <span className="text-[10px] font-extrabold text-zinc-500 uppercase block">
                    Proctoring Guidance
                  </span>
                  <p className="text-zinc-800 text-[11px]">
                    {analysis.proctorGuidance}
                  </p>
                </div>
              </div>

              {/* Anomalies Detected */}
              {analysis.anomaliesDetected && analysis.anomaliesDetected.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {analysis.anomaliesDetected.map((item, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-zinc-100 text-zinc-700 rounded-md border"
                    >
                      <CheckCircle2 className="size-2.5 text-zinc-500" />
                      {item}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="py-10 text-center space-y-3">
              <Sparkles className="size-8 mx-auto text-[#b2b2b2]" />
              <div className="space-y-1">
                <p className="text-xs font-bold text-zinc-700">
                  Select a candidate session to run Groq live telemetry diagnostics
                </p>
                <p className="text-[11px] text-zinc-400 max-w-sm mx-auto">
                  Groq evaluates facial gaze variance, multi-object detection, keyboard telemetry, and browser unfocus events instantaneously.
                </p>
              </div>
              {selectedSession && (
                <button
                  type="button"
                  onClick={() => handleRunAnalysis(selectedSession)}
                  className="bg-[#1a1917] hover:bg-black text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition cursor-pointer"
                >
                  Audit {selectedSession.studentName} with Groq
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
