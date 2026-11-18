/**
 * Groq LLM Client & Service for Live Sessions Monitoring
 * Powered by Groq's LPUs for ultra-low latency real-time examination invigilation.
 */

export const GROQ_API_KEY =
  import.meta.env.VITE_GROQ_API_KEY || "";

export const GROQ_MODEL =
  import.meta.env.VITE_GROQ_MODEL || "openai/gpt-oss-120b";

export interface LiveSessionTelemetry {
  id: string;
  studentName: string;
  exam: string;
  score: number;
  status: string;
  alerts: number;
  cam?: boolean;
  faceStatus?: string;
  violations?: string[];
  breakdown?: {
    identityScore?: number;
    cameraQualityScore?: number;
    environmentScore?: number;
    behaviorScore?: number;
  };
}

export interface LiveSessionGroqAnalysis {
  assessment: string;
  threatLevel: "LOW" | "ELEVATED" | "CRITICAL";
  riskPercentage: number;
  anomaliesDetected: string[];
  recommendedAction: string;
  proctorGuidance: string;
  confidence: number;
  modelUsed: string;
  timestamp: string;
}

/**
 * Evaluates active live session candidate telemetry via Groq LLM.
 */
export async function analyzeLiveSessionWithGroq(
  session: LiveSessionTelemetry
): Promise<LiveSessionGroqAnalysis> {
  const prompt = `
You are the Real-Time AI Proctor Copilot for IntegrityOS.
Analyze the following LIVE candidate session in real time:

- Student Name: ${session.studentName}
- Assessment: ${session.exam}
- Current Integrity Score: ${session.score}%
- Status: ${session.status}
- Cumulative Alerts / Warnings: ${session.alerts}
- Face Telemetry Status: ${session.faceStatus || "Normal Detection"}
- Recent Violation Events: ${(session.violations || []).join(", ") || "None"}
- Multi-Agent Dimensions:
  * Identity Continuity: ${session.breakdown?.identityScore ?? 100}%
  * Camera Stability: ${session.breakdown?.cameraQualityScore ?? 95}%
  * Environment & Secondary Devices: ${session.breakdown?.environmentScore ?? 100}%
  * Focus & Attention Posture: ${session.breakdown?.behaviorScore ?? 100}%

Evaluate the session objectively without bias.
Return a STRICT JSON response adhering to this format:
{
  "assessment": "<2-sentence synthesis of candidate behavior and compliance status>",
  "threatLevel": "<LOW or ELEVATED or CRITICAL>",
  "riskPercentage": <number from 0 to 100 representing probability of cheating/irregularity>,
  "anomaliesDetected": ["<anomaly 1>", "<anomaly 2>"],
  "recommendedAction": "<immediate tactical action for the invigilator>",
  "proctorGuidance": "<concise advice on whether to warn, pause, flag, or continue observing>",
  "confidence": <confidence score between 0.70 and 0.99>
}
`;

  const startTime = Date.now();
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content);
        return {
          assessment: parsed.assessment,
          threatLevel: parsed.threatLevel || (session.score < 65 ? "CRITICAL" : session.score < 80 ? "ELEVATED" : "LOW"),
          riskPercentage: parsed.riskPercentage ?? (100 - session.score),
          anomaliesDetected: parsed.anomaliesDetected || [],
          recommendedAction: parsed.recommendedAction || "Monitor video feed.",
          proctorGuidance: parsed.proctorGuidance || "Continue live stream surveillance.",
          confidence: parsed.confidence || 0.92,
          modelUsed: GROQ_MODEL,
          timestamp: new Date().toLocaleTimeString(),
        };
      }
    }
  } catch (err) {
    console.warn("[Groq LLM Service] Direct API call encountered error, using rule-based fallback:", err);
  }

  // Heuristic rule-based fallback if Groq network is unreachable
  const isCrit = session.score < 60 || session.alerts >= 3;
  const isElev = session.score < 80 || session.alerts >= 1;
  return {
    assessment: isCrit
      ? `Candidate ${session.studentName} has accumulated ${session.alerts} alert(s) with an integrity score of ${session.score}%. High anomaly density detected.`
      : isElev
      ? `Intermittent behavioral or gaze variations recorded for ${session.studentName}. Score: ${session.score}%.`
      : `Candidate ${session.studentName} maintains stable posture and consistent gaze focus. Normal examination progress.`,
    threatLevel: isCrit ? "CRITICAL" : isElev ? "ELEVATED" : "LOW",
    riskPercentage: Math.max(0, 100 - session.score),
    anomaliesDetected: session.alerts > 0 ? [`${session.alerts} telemetry alert(s) logged`] : ["No active anomalies"],
    recommendedAction: isCrit
      ? "Issue direct warning or pause examination for verification."
      : isElev
      ? "Monitor attention telemetry over next 60 seconds."
      : "Allow examination to proceed without interruption.",
    proctorGuidance: isCrit
      ? "Recommend reviewing live webcam feed and checking browser switch history."
      : "Exam behavior conforms with standard academic conditions.",
    confidence: 0.88,
    modelUsed: `${GROQ_MODEL} (Fallback)`,
    timestamp: new Date().toLocaleTimeString(),
  };
}

/**
 * Interactive Copilot Query for Invigilators & Admins.
 */
export async function queryLiveProctorCopilot(
  question: string,
  sessionContext?: LiveSessionTelemetry
): Promise<string> {
  const contextStr = sessionContext
    ? `\nActive Candidate Context:\n- Student: ${sessionContext.studentName}\n- Exam: ${sessionContext.exam}\n- Score: ${sessionContext.score}%\n- Alerts: ${sessionContext.alerts}\n- Status: ${sessionContext.status}\n`
    : "";

  const prompt = `
You are the Real-Time AI Proctor Copilot for IntegrityOS powered by Groq LPUs.
${contextStr}
Invigilator Question: "${question}"

Provide a direct, concise, expert proctoring recommendation in 2 to 3 sentences maximum. Be actionable, calm, and objective.
`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content;
      if (text) return text.trim();
    }
  } catch (err) {
    console.warn("[Groq Copilot] Error:", err);
  }

  return "Review candidate webcam stream and verification timeline to corroborate the telemetry signal before issuing any formal penalties.";
}

/**
 * Health check for Groq integration.
 */
export async function checkGroqLiveHealth(): Promise<{
  connected: boolean;
  model: string;
  latencyMs: number;
}> {
  const t0 = Date.now();
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 2,
      }),
    });
    const latency = Date.now() - t0;
    return {
      connected: res.ok,
      model: GROQ_MODEL,
      latencyMs: latency,
    };
  } catch {
    return {
      connected: false,
      model: GROQ_MODEL,
      latencyMs: -1,
    };
  }
}
