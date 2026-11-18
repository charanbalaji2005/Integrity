import { getRule } from "../agent-control/agent-config";
import { type EvidenceEvent, PAUSE_WORTHY_OBJECTS } from "../evidence/evidence-builder";
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
	// - Phone or secondary screen confirmed
	// - Face absent for > 8 seconds
	// - Multiple individuals confirmed for > 5 seconds
	// - Face no longer matches the enrolled candidate
	const isSevere = (e: EvidenceEvent) =>
		(e.type === "PROHIBITED_OBJECT" && PAUSE_WORTHY_OBJECTS.has(e.signals?.objectLabel)) ||
		e.type === "IDENTITY_MISMATCH" ||
		(e.type === "ABSENT_CANDIDATE" &&
			e.durationMs >= (getRule("ABSENT_CANDIDATE").pauseAfterMs ?? 8000)) ||
		(e.type === "MULTIPLE_INDIVIDUALS" &&
			e.durationMs >= (getRule("MULTIPLE_INDIVIDUALS").pauseAfterMs ?? 5000));

	const severeEvent = newEvents.find(isSevere);

	if (severeEvent || currentStatus === "PAUSED") {
		return {
			action: severeEvent ? "pause" : "none",
			status: "PAUSED",
			requiresHumanReview: true,
			primaryMessage:
				severeEvent?.narrativeExplanation ||
				"Exam paused pending faculty review of integrity telemetry.",
			recommendedFacultyAction: "review_footage",
		};
	}

	// Natural downward glances at a scratch-pad/keyboard are not misconduct.
	const actionableEvents = newEvents.filter(
		(e) =>
			!(e.type === "SUSTAINED_HEAD_DEVIATION" && behaviorAnalysis.pattern === "scratchpad_work"),
	);

	// 2. Warning conditions:
	// New confirmed events or multi-modal correlated incident
	if (
		actionableEvents.length > 0 ||
		(newEvents.length > 0 && metrics.correlatedIncidents.length > 0)
	) {
		const firstEvent = actionableEvents[0] ?? newEvents[0];
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
