import type { EvidenceEvent } from "../evidence/evidence-builder";

export interface TimelineEntry {
	timestamp: string;
	title: string;
	details: string;
	severity: "info" | "warning" | "alert";
	confidence?: number;
}

export interface EvidenceInvestigationReport {
	attemptId: string;
	totalEvents: number;
	highSeverityCount: number;
	timeline: TimelineEntry[];
	investigationSummary: string;
	requiresHumanReview: boolean;
}

/**
 * Specialized Evidence Agent.
 * Synthesizes chronological multi-modal events into an explainable investigation summary.
 */
export function compileEvidenceInvestigation(
	attemptId: string,
	events: EvidenceEvent[],
): EvidenceInvestigationReport {
	if (events.length === 0) {
		return {
			attemptId,
			totalEvents: 0,
			highSeverityCount: 0,
			timeline: [],
			investigationSummary: "No anomalous integrity signals or violations detected.",
			requiresHumanReview: false,
		};
	}

	const sorted = [...events].sort((a, b) => a.startTime - b.startTime);
	const timeline: TimelineEntry[] = [];
	let highSeverityCount = 0;

	for (const e of sorted) {
		const isHigh =
			e.type === "PROHIBITED_OBJECT" || e.type === "MULTIPLE_INDIVIDUALS" || e.durationMs >= 8000;
		if (isHigh) highSeverityCount++;

		const timeStr = new Date(e.startTime).toLocaleTimeString();
		timeline.push({
			timestamp: timeStr,
			title: e.type.replace(/_/g, " "),
			details: e.narrativeExplanation,
			severity: isHigh ? "alert" : e.durationMs >= 4000 ? "warning" : "info",
			confidence: e.confidence,
		});
	}

	const requiresHumanReview = highSeverityCount > 0 || events.length >= 4;

	let investigationSummary = `Analysis of ${events.length} logged events indicates `;
	if (highSeverityCount > 0) {
		investigationSummary += `${highSeverityCount} high-priority incidents, including prohibited items or persistent absences. Manual review of proctoring footage recommended.`;
	} else if (events.length > 0) {
		investigationSummary += `minor telemetry alerts (brief look-aways or occasional tab switches). General integrity posture remains acceptable.`;
	} else {
		investigationSummary += `full academic integrity compliance.`;
	}

	return {
		attemptId,
		totalEvents: events.length,
		highSeverityCount,
		timeline,
		investigationSummary,
		requiresHumanReview,
	};
}
