import { env } from "../../../config/env";
import type { MultiDimensionalIntegrityMetrics } from "../evidence/evidence-fusion";
import type { EvidenceInvestigationReport } from "./evidence-agent";

/**
 * Facts the report is allowed to state. Every sentence in the fallback is
 * derived from these; nothing is claimed as verified unless telemetry proves it.
 */
function describeTelemetry(metrics: MultiDimensionalIntegrityMetrics) {
	const t = metrics.telemetry;
	const expected = t.framesReceived + t.framesMissing;
	const coveragePct = expected === 0 ? 0 : Math.round((t.framesReceived / expected) * 100);

	const lines: string[] = [];
	if (expected === 0) {
		lines.push(
			"No camera telemetry was received, so no biometric or environment checks were performed.",
		);
	} else {
		lines.push(
			`${t.framesReceived} of ${expected} expected camera frames were analysed (${coveragePct}% coverage); ${metrics.cameraReliability}% of analysed frames were of usable quality.`,
		);
	}
	if (t.faceDetectorFailures > 0 || t.objectDetectorFailures > 0) {
		lines.push(
			`Detector failures occurred (face: ${t.faceDetectorFailures}, object: ${t.objectDetectorFailures}); those intervals are inconclusive, not compliant.`,
		);
	}
	switch (metrics.identityVerification) {
		case "verified":
			lines.push(
				`Identity was re-verified against the calibration enrolment in ${t.identityMatches} checks with no mismatches.`,
			);
			break;
		case "failed":
			lines.push(
				`Identity re-verification reported ${t.identityMismatches} mismatches against the calibration enrolment.`,
			);
			break;
		case "not_enrolled":
			lines.push(
				"No face enrolment was captured at calibration, so identity continuity was not verified.",
			);
			break;
		default:
			lines.push(
				`Identity continuity is inconclusive (${t.identityMatches} matches, ${t.identityMismatches} mismatches).`,
			);
	}
	return { lines, coveragePct };
}

function recommendation(metrics: MultiDimensionalIntegrityMetrics): string {
	switch (metrics.decision) {
		case "accept":
			return "No anomalies were detected with high evidence confidence; the attempt can be accepted after routine review.";
		case "monitor":
			return "Routine faculty review of flagged intervals is recommended before finalising the grade.";
		default:
			return "Manual faculty review is required before any decision; automated evidence alone is not sufficient.";
	}
}

/**
 * Specialized Report Agent.
 * Uses Ollama when available, with a deterministic, evidence-bound fallback.
 */
export async function generateProctoringReport(params: {
	attemptId: string;
	studentName: string;
	metrics: MultiDimensionalIntegrityMetrics;
	warningCount: number;
	timelineText: string;
	investigation?: EvidenceInvestigationReport;
}): Promise<string> {
	const { attemptId, studentName, metrics, warningCount, timelineText, investigation } = params;
	const { lines: telemetryFacts } = describeTelemetry(metrics);

	const prompt = `
You are the Proctor AI Assistant for the Assessment Integrity platform.
Review the following multi-dimensional proctoring telemetry for a candidate:
Attempt ID: ${attemptId}
Student Name: ${studentName}
Composite Integrity Score: ${metrics.compositeScore}/100
Evidence Confidence: ${metrics.evidenceConfidence}/100 (how trustworthy the score is)
Camera Reliability: ${metrics.cameraReliability}%
Identity Verification: ${metrics.identityVerification}
System decision: ${metrics.decision}
- Identity Score: ${metrics.identityScore}/100
- Environment Score: ${metrics.environmentScore}/100
- Browser Compliance: ${metrics.browserScore}/100
- Behavior Posture: ${metrics.behaviorScore}/100
Total Warnings: ${warningCount}

Verified telemetry facts (ONLY these may be stated as verified):
${telemetryFacts.join("\n")}

Evidence investigation: ${investigation?.investigationSummary ?? "n/a"}

Timeline Logs:
${timelineText || "No violations or telemetry alerts recorded."}

Correlated Incidents:
${metrics.correlatedIncidents.join("\n") || "None"}

Write a professional, objective summary under 150 words for the faculty dashboard.
Rules: do not accuse the candidate; never claim a check was verified unless listed above as verified;
explicitly call out missing telemetry, detector failures or inconclusive identity;
end with a recommendation consistent with the system decision.
Provide a single neutral paragraph without bullet points or headers.
`;

	// 1. Try Groq LLM first when configured (ultra-low latency & high accuracy)
	const groqApiKey = env.GROQ_API_KEY || process.env.GROQ_API_KEY;
	if (groqApiKey) {
		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 6500);
			const groqModel = env.GROQ_CHAT_MODEL || process.env.GROQ_CHAT_MODEL || "openai/gpt-oss-120b";

			const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${groqApiKey}`,
				},
				body: JSON.stringify({
					model: groqModel,
					messages: [{ role: "user", content: prompt }],
					temperature: 0.1,
				}),
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			if (res.ok) {
				const data = (await res.json()) as any;
				const content = data.choices?.[0]?.message?.content;
				if (content && typeof content === "string") {
					return content.trim();
				}
			}
		} catch (err: unknown) {
			console.warn(
				"[ReportAgent] Groq LLM call failed, attempting Ollama fallback:",
				err instanceof Error ? err.message : err,
			);
		}
	}

	// 2. Try Ollama if Groq is not available or failed
	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 6500);

		const url = `${env.OLLAMA_BASE_URL.replace(/\/$/, "")}/api/chat`;
		const res = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: env.OLLAMA_CHAT_MODEL,
				messages: [{ role: "user", content: prompt }],
				stream: false,
			}),
			signal: controller.signal,
		});

		clearTimeout(timeoutId);

		if (res.ok) {
			const data = (await res.json()) as { message?: { content?: unknown } };
			const content = data.message?.content;
			if (content && typeof content === "string") {
				return content.trim();
			}
		}
	} catch (err: unknown) {
		console.warn(
			"[ReportAgent] Ollama unavailable, using deterministic report fallback:",
			err instanceof Error ? err.message : err,
		);
	}

	// Deterministic, evidence-bound fallback.
	const parts: string[] = [];
	parts.push(
		`The candidate completed the assessment with a composite integrity score of ${metrics.compositeScore}/100 at ${metrics.evidenceConfidence}% evidence confidence, with ${warningCount} warning${warningCount === 1 ? "" : "s"} issued.`,
	);
	parts.push(...telemetryFacts);

	if (investigation && investigation.totalEvents > 0) {
		parts.push(investigation.investigationSummary);
	} else if (metrics.telemetry.framesReceived > 0) {
		parts.push("No integrity events were confirmed during the analysed intervals.");
	}
	if (metrics.environmentScore < 70) {
		parts.push("Prohibited items or secondary devices were detected in the workspace.");
	}
	if (metrics.browserScore < 75) {
		parts.push("Multiple browser focus losses or developer-tools events were recorded.");
	}
	if (metrics.correlatedIncidents.length > 0) {
		parts.push(`Correlated incidents: ${metrics.correlatedIncidents.join("; ")}.`);
	}
	parts.push(recommendation(metrics));

	return parts.join(" ");
}

/**
 * Real-time Groq LLM Live Session Monitor & Telemetry Evaluator.
 * Analyzes candidate biometric telemetry, gaze deviations, browser anomalies,
 * and violation history during active live exam sessions.
 */
export async function analyzeLiveSessionTelemetryWithGroq(params: {
	candidateName: string;
	examTitle: string;
	integrityScore: number;
	faceStatus?: string;
	alertsCount: number;
	violations?: string[];
	breakdown?: {
		identityScore?: number;
		cameraQualityScore?: number;
		environmentScore?: number;
		behaviorScore?: number;
	};
}): Promise<{
	assessment: string;
	threatLevel: "LOW" | "ELEVATED" | "CRITICAL";
	recommendedAction: string;
	confidence: number;
}> {
	const groqApiKey = env.GROQ_API_KEY || process.env.GROQ_API_KEY;
	const groqModel = env.GROQ_CHAT_MODEL || process.env.GROQ_CHAT_MODEL || "openai/gpt-oss-120b";

	const prompt = `
You are the Real-Time AI Proctor Copilot for IntegrityOS.
Evaluate the following LIVE ongoing examination session telemetry:

Candidate: ${params.candidateName}
Assessment: ${params.examTitle}
Current Integrity Index: ${params.integrityScore}/100
Face Detection Status: ${params.faceStatus || "Detected"}
Recent Violation Count: ${params.alertsCount}
Active Violations: ${(params.violations || []).join(", ") || "None"}
Telemetry Dimensions:
- Identity Match: ${params.breakdown?.identityScore ?? 100}%
- Camera Reliability: ${params.breakdown?.cameraQualityScore ?? 95}%
- Environment Safety: ${params.breakdown?.environmentScore ?? 100}%
- Behavioral Focus: ${params.breakdown?.behaviorScore ?? 100}%

Return a JSON object in this exact schema:
{
  "assessment": "<2 sentence clear objective evaluation of candidate behavior and risk>",
  "threatLevel": "<LOW | ELEVATED | CRITICAL>",
  "recommendedAction": "<specific immediate instruction for the faculty proctor>",
  "confidence": <number between 0.70 and 0.99>
}
`;

	if (groqApiKey) {
		try {
			const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${groqApiKey}`,
				},
				body: JSON.stringify({
					model: groqModel,
					messages: [{ role: "user", content: prompt }],
					response_format: { type: "json_object" },
					temperature: 0.1,
				}),
			});

			if (res.ok) {
				const data = (await res.json()) as any;
				const content = data.choices?.[0]?.message?.content;
				if (content) {
					const parsed = JSON.parse(content);
					return {
						assessment: parsed.assessment,
						threatLevel: parsed.threatLevel,
						recommendedAction: parsed.recommendedAction,
						confidence: Number(parsed.confidence) || 0.9,
					};
				}
			}
		} catch (err) {
			console.warn("[analyzeLiveSessionTelemetryWithGroq] Groq error:", err);
		}
	}

	// Heuristic fallback
	const isCritical = params.integrityScore < 60 || params.alertsCount >= 3;
	const isElevated = params.integrityScore < 80 || params.alertsCount >= 1;
	return {
		assessment: isCritical
			? `Candidate ${params.candidateName} exhibits anomalous behaviors with multiple integrity deviations (${params.alertsCount} alerts, score ${params.integrityScore}%).`
			: isElevated
				? `Intermittent behavioral or gaze telemetry warnings logged for ${params.candidateName}. Overall focus remains largely consistent.`
				: `Candidate ${params.candidateName} displays centered focus and normal exam compliance with no active cheating indicators.`,
		threatLevel: isCritical ? "CRITICAL" : isElevated ? "ELEVATED" : "LOW",
		recommendedAction: isCritical
			? "Inspect candidate webcam stream immediately and issue formal proctor warning."
			: isElevated
				? "Monitor candidate gaze and browser switches closely."
				: "Allow examination to proceed normally.",
		confidence: 0.88,
	};
}
