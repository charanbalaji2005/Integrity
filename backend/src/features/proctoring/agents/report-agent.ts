import { env } from "../../../config/env";
import type { MultiDimensionalIntegrityMetrics } from "../evidence/evidence-fusion";

/**
 * Specialized Report Agent.
 * Employs Ollama (Llama 3.2) to synthesize multi-dimensional telemetry into a neutral,
 * explainable narrative evaluation for faculty administrators.
 */
export async function generateProctoringReport(params: {
	attemptId: string;
	studentName: string;
	metrics: MultiDimensionalIntegrityMetrics;
	warningCount: number;
	timelineText: string;
}): Promise<string> {
	const { attemptId, studentName, metrics, warningCount, timelineText } = params;

	const prompt = `
You are the Proctor AI Assistant for the Assessment Integrity platform.
Review the following multi-dimensional proctoring telemetry for a candidate:
Attempt ID: ${attemptId}
Student Name: ${studentName}
Composite Integrity Score: ${metrics.compositeScore}/100
- Identity Score: ${metrics.identityScore}/100
- Environment Score: ${metrics.environmentScore}/100
- Browser Compliance: ${metrics.browserScore}/100
- Behavior Posture: ${metrics.behaviorScore}/100
- Camera Quality: ${metrics.cameraQualityScore}/100
Total Warnings: ${warningCount}

Timeline Logs:
${timelineText || "No violations or telemetry alerts recorded."}

Correlated Incidents:
${metrics.correlatedIncidents.join("\n") || "None"}

Generate a clear, professional, objective narrative summary under 140 words for the faculty dashboard.
Include:
1. Candidate behavior overview: summarize what occurred without accusing of misconduct.
2. Integrity evaluation: assessment based on multi-dimensional evidence.
3. Faculty recommendation: suggest whether to accept attempt, request manual review, or inspect specific timestamps.
Provide only a single neutral paragraph without bullet points or headers.
`;

	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 6500); // 6.5s timeout

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
			const data = (await res.json()) as any;
			const content = data.message?.content;
			if (content && typeof content === "string") {
				return content.trim();
			}
		}
	} catch (err: any) {
		console.warn(
			"[ReportAgent] Ollama unavailable, using deterministic report fallback:",
			err.message,
		);
	}

	// High-fidelity heuristic fallback
	const { compositeScore, environmentScore, browserScore } = metrics;
	if (compositeScore >= 90 && warningCount === 0) {
		return `The candidate completed the examination in compliance with integrity guidelines. Biometric tracking confirmed consistent facial presence and focus throughout the session. No unauthorized materials or browser violations were logged. The attempt is recommended for automatic acceptance.`;
	}

	if (environmentScore < 70) {
		return `Candidate completed the assessment with a composite integrity score of ${compositeScore}/100. Environmental telemetry detected potential unauthorized items or secondary devices in the workspace. A total of ${warningCount} warnings were issued. Manual faculty inspection of workspace event snapshots is recommended.`;
	}

	if (browserScore < 75) {
		return `The examination concluded with a composite integrity score of ${compositeScore}/100. Telemetry recorded multiple browser unfocused events or tab navigations during testing. While physical posture remained centered, faculty review of the browser switching timeline is suggested prior to grade finalization.`;
	}

	return `Candidate concluded the examination with an integrity score of ${compositeScore}/100. A total of ${warningCount} warnings were logged for intermittent off-center gaze or brief telemetry deviations. Camera quality remained acceptable. Routine faculty review of flagged intervals is recommended.`;
}
