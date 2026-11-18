export type EvidenceType =
	| "SUSTAINED_HEAD_DEVIATION"
	| "SUSPECTED_SPEECH"
	| "PROLONGED_EYE_CLOSURE"
	| "ABSENT_CANDIDATE"
	| "MULTIPLE_INDIVIDUALS"
	| "PROHIBITED_OBJECT"
	| "BROWSER_UNFOCUSED"
	| "DEVTOOLS_OPENED"
	| "FULLSCREEN_EXITED"
	| "CLIPBOARD_ATTEMPT"
	| "WINDOW_BLUR"
	| "CAMERA_DEGRADATION"
	| "LIVENESS_FAILURE"
	| "IDENTITY_MISMATCH";

export type EvidenceSeverity = "low" | "medium" | "high";

/** Objects whose presence alone justifies pausing the exam. */
export const PAUSE_WORTHY_OBJECTS = new Set(["Mobile Phone", "Secondary Screen"]);

/** Canonical severity for persisted violations and policy decisions. */
export function severityForEvent(
	event: Pick<EvidenceEvent, "type" | "signals" | "durationMs">,
): EvidenceSeverity {
	switch (event.type) {
		case "PROHIBITED_OBJECT":
			return PAUSE_WORTHY_OBJECTS.has(event.signals?.objectLabel) ? "high" : "medium";
		case "MULTIPLE_INDIVIDUALS":
		case "IDENTITY_MISMATCH":
		case "LIVENESS_FAILURE":
			return "high";
		case "ABSENT_CANDIDATE":
			return event.durationMs >= 6000 ? "high" : "medium";
		case "BROWSER_UNFOCUSED":
		case "DEVTOOLS_OPENED":
		case "FULLSCREEN_EXITED":
		case "SUSPECTED_SPEECH":
		case "CAMERA_DEGRADATION":
			return "medium";
		default:
			return "low";
	}
}

export function riskScoreForEvent(
	event: Pick<EvidenceEvent, "type" | "signals" | "durationMs">,
): number {
	const severity = severityForEvent(event);
	if (event.type === "IDENTITY_MISMATCH") return 30;
	if (event.type === "PROHIBITED_OBJECT") return severity === "high" ? 25 : 12;
	if (event.type === "MULTIPLE_INDIVIDUALS") return 20;
	return severity === "high" ? 15 : severity === "medium" ? 8 : 5;
}

export type EvidenceStatus = "CONFIRMED" | "PROBABLE" | "UNCERTAIN" | "RESOLVED";

export interface EvidenceEvent {
	eventId: string;
	attemptId: string;
	type: EvidenceType;
	status: EvidenceStatus;
	startTime: number;
	endTime: number;
	durationMs: number;
	confidence: number;
	cameraQuality: number;
	signals: Record<string, any>;
	humanReviewRecommended: boolean;
	narrativeExplanation: string;
}

/**
 * Builds standardized, explainable evidence packets for faculty review.
 */
export function buildEvidenceEvent(params: {
	attemptId: string;
	type: EvidenceType;
	startTime: number;
	endTime: number;
	confidence: number;
	cameraQuality: number;
	signals: Record<string, any>;
	status?: EvidenceStatus;
	details?: string;
}): EvidenceEvent {
	const durationMs = Math.max(0, params.endTime - params.startTime);

	// Determine certainty status based on input quality and duration
	let status: EvidenceStatus = params.status || "CONFIRMED";
	if (params.cameraQuality < 45 || params.confidence < 0.6) {
		status = "UNCERTAIN";
	} else if (params.confidence < 0.85) {
		status = "PROBABLE";
	}

	// Human review is recommended if confidence is high and event is severe, OR if uncertain
	const humanReviewRecommended =
		status === "UNCERTAIN" ||
		params.type === "PROHIBITED_OBJECT" ||
		params.type === "MULTIPLE_INDIVIDUALS" ||
		params.type === "IDENTITY_MISMATCH" ||
		params.type === "LIVENESS_FAILURE" ||
		params.type === "CAMERA_DEGRADATION" ||
		durationMs > 10000;

	// Construct neutral, explainable narrative explanation
	let explanation = "";
	switch (params.type) {
		case "SUSTAINED_HEAD_DEVIATION":
			explanation = `Candidate maintained sustained head-pose deviation (${params.signals.gazeDirection || "away"}) for ${(durationMs / 1000).toFixed(1)}s. Yaw: ${params.signals.yaw || 0}°, Pitch: ${params.signals.pitch || 0}°.`;
			break;
		case "PROHIBITED_OBJECT":
			explanation = `Detected ${params.signals.objectLabel || "forbidden device"} in ${params.signals.position || "workspace"} with ${(params.confidence * 100).toFixed(0)}% confidence for ${(durationMs / 1000).toFixed(1)}s.`;
			break;
		case "MULTIPLE_INDIVIDUALS":
			explanation = `Multiple individuals (${params.signals.count || 2}+ faces) detected in camera frame for ${(durationMs / 1000).toFixed(1)}s.`;
			break;
		case "ABSENT_CANDIDATE":
			explanation = `Candidate face absent from video frame for ${(durationMs / 1000).toFixed(1)}s. Camera quality was ${params.cameraQuality}/100.`;
			break;
		case "SUSPECTED_SPEECH":
			explanation = `Continuous mouth motion and potential vocalization observed for ${(durationMs / 1000).toFixed(1)}s.`;
			break;
		case "PROLONGED_EYE_CLOSURE":
			explanation = `Prolonged eye closure signal detected for ${(durationMs / 1000).toFixed(1)}s (EAR: ${params.signals.ear || 0}).`;
			break;
		case "BROWSER_UNFOCUSED":
			explanation = `Assessment window focus lost or navigation away from exam interface (${params.signals.event || "tab switch"}).`;
			break;
		case "DEVTOOLS_OPENED":
			explanation = "Browser developer tools were opened during the assessment.";
			break;
		case "FULLSCREEN_EXITED":
			explanation = `Candidate left the mandatory full-screen exam mode${params.signals.count ? ` (exit #${params.signals.count})` : ""}.`;
			break;
		case "CLIPBOARD_ATTEMPT":
			explanation = `Blocked copy, cut, paste or right-click attempt${Number(params.signals.count) > 1 ? ` (${params.signals.count} attempts)` : ""}.`;
			break;
		case "WINDOW_BLUR":
			explanation = `Exam window lost focus to another application or window${Number(params.signals.count) > 1 ? ` (${params.signals.count} times)` : ""}.`;
			break;
		case "CAMERA_DEGRADATION":
			explanation = `Video capture unusable for ${(durationMs / 1000).toFixed(1)}s: ${params.signals.warning || "insufficient lighting, lens blur or no frames received"}. Monitoring was inconclusive for this interval.`;
			break;
		case "LIVENESS_FAILURE":
			explanation = `Possible static image or frozen camera stream: ${params.signals.reason || "no natural facial micro-motion"} (${(durationMs / 1000).toFixed(1)}s).`;
			break;
		case "IDENTITY_MISMATCH":
			explanation = `Face in camera does not match the face enrolled at calibration (descriptor distance ${params.signals.distance ?? "n/a"}, threshold ${params.signals.threshold ?? "n/a"}).`;
			break;
	}

	if (params.details) {
		explanation = `${explanation} ${params.details}`;
	}

	return {
		eventId: `ev_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
		attemptId: params.attemptId,
		type: params.type,
		status,
		startTime: params.startTime,
		endTime: params.endTime,
		durationMs,
		confidence: Number(params.confidence.toFixed(2)),
		cameraQuality: params.cameraQuality,
		signals: params.signals,
		humanReviewRecommended,
		narrativeExplanation: explanation,
	};
}
