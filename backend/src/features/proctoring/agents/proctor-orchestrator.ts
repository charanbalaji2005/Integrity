import type { EvidenceEvent } from "../evidence/evidence-builder";
import type { MultiDimensionalIntegrityMetrics } from "../evidence/evidence-fusion";
import type { BehaviorAnalysis } from "./behavior-agent";
import type { FaceAgentAnalysis } from "./face-agent";

export interface OrchestratorDecision {
	action: "none" | "warning" | "pause";
	status: "NORMAL" | "WARNING" | "PAUSED" | "UNDER_REVIEW";
	requiresHumanReview: boolean;
	primaryMessage: string;
	recommendedFacultyAction: "accept" | "monitor" | "review_footage" | "interview_candidate";
}

/**
 * Proctor Orchestrator Agent.
 * Evaluates multi-agent specialist outputs, state machines, and multi-dimensional metrics
 * to make reasoned policy decisions without blindly penalizing students.
 */
export function orchestrateProctoringPolicy(params: {
	faceAnalysis: FaceAgentAnalysis;
	behaviorAnalysis: BehaviorAnalysis;
	newEvents: EvidenceEvent[];
	metrics: MultiDimensionalIntegrityMetrics;
	currentStatus: "NORMAL" | "WARNING" | "PAUSED" | "UNDER_REVIEW";
	warningCount: number;
}): OrchestratorDecision {
	const { faceAnalysis, behaviorAnalysis, newEvents, metrics, currentStatus } = params;

	// 1. High-severity pause conditions:
	// - Face absent for > 8 seconds
	// - Multiple individuals confirmed for > 5 seconds
	// - Active unauthorized screen or phone confirmed
	const hasSevereEvent = newEvents.some(
		(e) =>
			e.type === "PROHIBITED_OBJECT" ||
			(e.type === "ABSENT_CANDIDATE" && e.durationMs >= 8000) ||
			(e.type === "MULTIPLE_INDIVIDUALS" && e.durationMs >= 5000),
	);

	if (hasSevereEvent || currentStatus === "PAUSED") {
		const severeEvent = newEvents.find(
			(e) =>
				e.type === "PROHIBITED_OBJECT" ||
				e.type === "ABSENT_CANDIDATE" ||
				e.type === "MULTIPLE_INDIVIDUALS",
		);
		return {
			action: "pause",
			status: "PAUSED",
			requiresHumanReview: true,
			primaryMessage:
				severeEvent?.narrativeExplanation || "Exam paused due to multiple integrity violations.",
			recommendedFacultyAction: "review_footage",
		};
	}

	// 2. Warning conditions:
	// New confirmed events or multi-modal correlated incident
	if (newEvents.length > 0 || metrics.correlatedIncidents.length > 0) {
		const firstEvent = newEvents[0];
		const message =
			metrics.correlatedIncidents[0] ||
			firstEvent?.narrativeExplanation ||
			faceAnalysis.summaryMessage ||
			behaviorAnalysis.explanation;

		return {
			action: "warning",
			status: "WARNING",
			requiresHumanReview: metrics.compositeScore < 70,
			primaryMessage: message,
			recommendedFacultyAction: metrics.compositeScore < 70 ? "review_footage" : "monitor",
		};
	}

	// 3. Normal conditions
	return {
		action: "none",
		status: currentStatus === "WARNING" ? "WARNING" : "NORMAL",
		requiresHumanReview: false,
		primaryMessage: "Assessment progressing normally under continuous AI proctoring.",
		recommendedFacultyAction: "accept",
	};
}
