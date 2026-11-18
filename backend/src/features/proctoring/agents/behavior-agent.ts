import type { DetectedSpatialObject } from "../perception/object-detector";
import type { TemporalSummary } from "../temporal/signal-buffer";
import type { FaceAgentAnalysis } from "./face-agent";

export interface BehaviorAnalysis {
	pattern:
		| "focused"
		| "scratchpad_work"
		| "anomalous_distraction"
		| "unauthorized_collaboration"
		| "inactive";
	explanation: string;
	riskLevel: "none" | "low" | "medium" | "high";
}

/**
 * Specialized Behavior Agent.
 * Differentiates natural candidate habits (scratchpad note-taking, contemplation)
 * from deceptive behaviors using contextual evidence.
 */
export function runBehaviorAgent(
	faceAnalysis: FaceAgentAnalysis,
	objects: DetectedSpatialObject[],
	temporal: TemporalSummary,
	browserEvent?: string,
): BehaviorAnalysis {
	// 1. Check for unauthorized collaboration
	if (faceAnalysis.status === "MULTIPLE_FACES") {
		return {
			pattern: "unauthorized_collaboration",
			explanation: "Multiple persons observed in the candidate testing environment.",
			riskLevel: "high",
		};
	}

	// 2. Check for device / secondary screen interaction
	const device = objects.find((o) => o.label === "Mobile Phone" || o.label === "Secondary Screen");
	if (device) {
		return {
			pattern: "anomalous_distraction",
			explanation: `${device.label} detected in ${device.relativePosition || "workspace"}.`,
			riskLevel: "high",
		};
	}

	const material = objects.find((o) => o.label === "Book" || o.label === "Audio Earphones");
	if (material) {
		return {
			pattern: "anomalous_distraction",
			explanation: `${material.label} visible in ${material.relativePosition || "workspace"}.`,
			riskLevel: "medium",
		};
	}

	// 3. Natural Scratchpad Work vs Off-Screen Cheating
	// If pitch is down, but yaw is centered, candidate is likely looking at their keyboard or physical scratchpad
	if (faceAnalysis.status === "ATTENTION_DIVERTED") {
		if (faceAnalysis.gazeDirection === "down" && Math.abs(temporal.avgYaw) < 12) {
			return {
				pattern: "scratchpad_work",
				explanation: "Downward gaze consistent with physical scratch-pad or keyboard input.",
				riskLevel: "low",
			};
		}

		return {
			pattern: "anomalous_distraction",
			explanation: `Sustained off-screen gaze (${faceAnalysis.gazeDirection}) for ${faceAnalysis.sustainedDeviationSeconds}s.`,
			riskLevel: faceAnalysis.sustainedDeviationSeconds > 7 ? "medium" : "low",
		};
	}

	// 4. Browser Navigation behavior
	if (browserEvent === "tab-switch" || browserEvent === "window-minimize") {
		return {
			pattern: "anomalous_distraction",
			explanation: "Candidate navigated away from the assessment interface.",
			riskLevel: "medium",
		};
	}

	// 5. Normal focused behavior
	return {
		pattern: "focused",
		explanation: "Candidate behavior is consistent with standard academic examination environment.",
		riskLevel: "none",
	};
}
