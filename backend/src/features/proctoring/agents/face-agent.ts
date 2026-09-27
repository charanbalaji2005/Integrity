import type { CameraQualityMetrics } from "../perception/camera-quality";
import type { FacePerceptionResult } from "../perception/face-detector";
import type { TemporalSummary } from "../temporal/signal-buffer";

export interface FaceAgentAnalysis {
	status: "OPTIMAL" | "ATTENTION_DIVERTED" | "ABSENT" | "MULTIPLE_FACES" | "CAMERA_ISSUE";
	gazeDirection: string;
	sustainedDeviationSeconds: number;
	speechDetected: boolean;
	prolongedEyeClosure: boolean;
	summaryMessage: string;
	requiresAlert: boolean;
	alertType?: string;
	severity?: "low" | "medium" | "high";
}

/**
 * Specialized Face Analysis Agent.
 * Interprets facial pose, presence, and micro-movements in the context of temporal duration and camera quality.
 */
export function runFaceAgent(
	faceResult: FacePerceptionResult,
	quality: CameraQualityMetrics,
	temporal: TemporalSummary,
): FaceAgentAnalysis {
	// If camera quality is critically degraded, report camera issue rather than cheating
	if (!quality.usable) {
		return {
			status: "CAMERA_ISSUE",
			gazeDirection: "unknown",
			sustainedDeviationSeconds: 0,
			speechDetected: false,
			prolongedEyeClosure: false,
			summaryMessage:
				quality.warningMessage || "Camera quality insufficient for biometric verification.",
			requiresAlert: false,
		};
	}

	// 1. Check face presence
	if (!faceResult.detected || faceResult.faceCount === 0) {
		const absentSec = Number((temporal.sustainedNoFaceMs / 1000).toFixed(1));
		const requiresAlert = temporal.sustainedNoFaceMs >= 3500;
		return {
			status: "ABSENT",
			gazeDirection: "missing",
			sustainedDeviationSeconds: absentSec,
			speechDetected: false,
			prolongedEyeClosure: false,
			summaryMessage: requiresAlert
				? `Candidate face missing from camera frame for ${absentSec} seconds.`
				: "Candidate face momentarily not detected.",
			requiresAlert,
			alertType: "ABSENT_CANDIDATE",
			severity: temporal.sustainedNoFaceMs >= 6000 ? "high" : "medium",
		};
	}

	// 2. Check multiple faces
	if (faceResult.faceCount > 1) {
		const multSec = Number((temporal.sustainedMultipleFacesMs / 1000).toFixed(1));
		const requiresAlert = temporal.sustainedMultipleFacesMs >= 2000;
		return {
			status: "MULTIPLE_FACES",
			gazeDirection: "center",
			sustainedDeviationSeconds: multSec,
			speechDetected: false,
			prolongedEyeClosure: false,
			summaryMessage: `Multiple individuals (${faceResult.faceCount} faces) observed in camera stream.`,
			requiresAlert,
			alertType: "MULTIPLE_INDIVIDUALS",
			severity: "high",
		};
	}

	// 3. Single face: Head Pose & Attention
	const pose = faceResult.pose;
	const deviationSec = Number((temporal.sustainedLookingAwayMs / 1000).toFixed(1));

	// Fleeting glances (< 2.5s) are normal human behavior during exams; sustained (> 3.5s) triggers alert
	if (pose && pose.isLookingAway && temporal.sustainedLookingAwayMs >= 3500) {
		return {
			status: "ATTENTION_DIVERTED",
			gazeDirection: pose.gazeDirection,
			sustainedDeviationSeconds: deviationSec,
			speechDetected: !!faceResult.mouth?.possibleSpeech,
			prolongedEyeClosure: !!faceResult.eyes?.eyesClosed,
			summaryMessage: `Sustained attention diversion (${pose.gazeDirection}) for ${deviationSec}s (Yaw: ${pose.yaw}°, Pitch: ${pose.pitch}°).`,
			requiresAlert: true,
			alertType: "SUSTAINED_HEAD_DEVIATION",
			severity: temporal.sustainedLookingAwayMs >= 8000 ? "medium" : "low",
		};
	}

	// 4. Suspected Speech / Vocalization
	if (temporal.sustainedTalkingMs >= 3500) {
		const speechSec = Number((temporal.sustainedTalkingMs / 1000).toFixed(1));
		return {
			status: "OPTIMAL",
			gazeDirection: pose?.gazeDirection || "center",
			sustainedDeviationSeconds: 0,
			speechDetected: true,
			prolongedEyeClosure: false,
			summaryMessage: `Continuous speech activity or mouth movement observed for ${speechSec}s.`,
			requiresAlert: true,
			alertType: "SUSPECTED_SPEECH",
			severity: "medium",
		};
	}

	// 5. Prolonged Eye Closure (Drowsiness or hidden audio prompt)
	if (temporal.sustainedEyesClosedMs >= 4000) {
		const eyeSec = Number((temporal.sustainedEyesClosedMs / 1000).toFixed(1));
		return {
			status: "OPTIMAL",
			gazeDirection: "center",
			sustainedDeviationSeconds: 0,
			speechDetected: false,
			prolongedEyeClosure: true,
			summaryMessage: `Candidate eyes closed continuously for ${eyeSec}s.`,
			requiresAlert: true,
			alertType: "PROLONGED_EYE_CLOSURE",
			severity: "low",
		};
	}

	// Normal, optimal focus
	return {
		status: "OPTIMAL",
		gazeDirection: pose?.gazeDirection || "center",
		sustainedDeviationSeconds: 0,
		speechDetected: false,
		prolongedEyeClosure: false,
		summaryMessage: "Candidate is attentive and aligned with assessment screen.",
		requiresAlert: false,
	};
}
