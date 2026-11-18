import type { EvidenceEvent } from "./evidence-builder";

export type IdentityVerificationState = "verified" | "inconclusive" | "failed" | "not_enrolled";
export type IntegrityDecision = "accept" | "monitor" | "manual_review";

export interface MultiDimensionalIntegrityMetrics {
	compositeScore: number; // 0 to 100 overall composite score
	identityScore: number; // 0 to 100 (biometric consistency & face presence)
	cameraQualityScore: number; // 0 to 100 (lighting, focus, usable visibility)
	environmentScore: number; // 0 to 100 (workspace cleanliness, no prohibited objects)
	browserScore: number; // 0 to 100 (fullscreen & focus compliance)
	behaviorScore: number; // 0 to 100 (attention alignment, natural exam posture)
	activeEventCount: number;
	correlatedIncidents: string[];

	/**
	 * How much the score can be trusted (0-100). A clean score built on
	 * missing or failed telemetry is NOT a clean exam.
	 */
	evidenceConfidence: number;
	/** Share of frames whose camera quality was usable (0-100). */
	cameraReliability: number;
	identityVerification: IdentityVerificationState;
	decision: IntegrityDecision;
	telemetry: TelemetryCoverage;
}

export interface TelemetryCoverage {
	framesReceived: number;
	framesMissing: number; // process-frame calls that carried no image
	framesUsable: number;
	faceDetectorFailures: number;
	objectDetectorFailures: number;
	identityChecks: number;
	identityMatches: number;
	identityMismatches: number;
}

export interface FusionSnapshot {
	identityDeductions: number;
	environmentDeductions: number;
	browserDeductions: number;
	behaviorDeductions: number;
	recentEvents: EvidenceEvent[];
	telemetry: TelemetryCoverage;
	identityEnrolled: boolean;
}

function emptyTelemetry(): TelemetryCoverage {
	return {
		framesReceived: 0,
		framesMissing: 0,
		framesUsable: 0,
		faceDetectorFailures: 0,
		objectDetectorFailures: 0,
		identityChecks: 0,
		identityMatches: 0,
		identityMismatches: 0,
	};
}

export class EvidenceFusionEngine {
	private attemptId: string;
	private identityDeductions = 0;
	private environmentDeductions = 0;
	private browserDeductions = 0;
	private behaviorDeductions = 0;
	private recentEvents: EvidenceEvent[] = [];
	private telemetry: TelemetryCoverage = emptyTelemetry();
	private identityEnrolled = false;

	constructor(attemptId: string, snapshot?: FusionSnapshot | null) {
		this.attemptId = attemptId;
		if (snapshot) this.restore(snapshot);
	}

	public get id(): string {
		return this.attemptId;
	}

	public setIdentityEnrolled(enrolled: boolean): void {
		this.identityEnrolled = enrolled;
	}

	/** Record per-frame telemetry health so the score carries an honest confidence. */
	public recordFrame(params: {
		hadFrame: boolean;
		usable: boolean;
		faceDetectorFailed: boolean;
		objectDetectorFailed: boolean;
		identityCheck?: "match" | "mismatch" | null;
	}): void {
		const t = this.telemetry;
		if (!params.hadFrame) {
			t.framesMissing += 1;
			return;
		}
		t.framesReceived += 1;
		if (params.usable) t.framesUsable += 1;
		if (params.faceDetectorFailed) t.faceDetectorFailures += 1;
		if (params.objectDetectorFailed) t.objectDetectorFailures += 1;
		if (params.identityCheck) {
			t.identityChecks += 1;
			if (params.identityCheck === "match") t.identityMatches += 1;
			else t.identityMismatches += 1;
		}
	}

	public registerEvent(event: EvidenceEvent): void {
		this.recentEvents.push(event);
		if (this.recentEvents.length > 50) {
			this.recentEvents.shift();
		}

		switch (event.type) {
			case "ABSENT_CANDIDATE":
				this.identityDeductions = Math.min(60, this.identityDeductions + 10);
				break;
			case "MULTIPLE_INDIVIDUALS":
				this.identityDeductions = Math.min(70, this.identityDeductions + 25);
				break;
			case "IDENTITY_MISMATCH":
				this.identityDeductions = Math.min(90, this.identityDeductions + 35);
				break;
			case "LIVENESS_FAILURE":
				this.identityDeductions = Math.min(80, this.identityDeductions + 20);
				break;
			case "PROHIBITED_OBJECT":
				this.environmentDeductions = Math.min(
					80,
					this.environmentDeductions +
						(event.signals?.objectLabel === "Mobile Phone" ||
						event.signals?.objectLabel === "Secondary Screen"
							? 20
							: 10),
				);
				break;
			case "BROWSER_UNFOCUSED":
				this.browserDeductions = Math.min(80, this.browserDeductions + 8);
				break;
			case "DEVTOOLS_OPENED":
				this.browserDeductions = Math.min(80, this.browserDeductions + 15);
				break;
			case "FULLSCREEN_EXITED":
				this.browserDeductions = Math.min(80, this.browserDeductions + 6);
				break;
			case "WINDOW_BLUR":
				this.browserDeductions = Math.min(80, this.browserDeductions + 4);
				break;
			case "CLIPBOARD_ATTEMPT":
				this.browserDeductions = Math.min(80, this.browserDeductions + 3);
				break;
			case "SUSTAINED_HEAD_DEVIATION":
				this.behaviorDeductions = Math.min(60, this.behaviorDeductions + 5);
				break;
			case "SUSPECTED_SPEECH":
				this.behaviorDeductions = Math.min(40, this.behaviorDeductions + 6);
				break;
			case "PROLONGED_EYE_CLOSURE":
				this.behaviorDeductions = Math.min(30, this.behaviorDeductions + 5);
				break;
			// CAMERA_DEGRADATION lowers confidence, not the integrity score.
		}
	}

	private computeConfidence(latestCameraQuality: number) {
		const t = this.telemetry;
		const expected = t.framesReceived + t.framesMissing;
		const cameraReliability =
			t.framesReceived === 0 ? 0 : Math.round((t.framesUsable / t.framesReceived) * 100);

		if (expected === 0) {
			return { cameraReliability: 0, evidenceConfidence: 0 };
		}

		const coverage = t.framesReceived / expected; // frames actually delivered
		const faceHealth = t.framesReceived === 0 ? 0 : 1 - t.faceDetectorFailures / t.framesReceived;
		const objectHealth =
			t.framesReceived === 0 ? 0 : 1 - t.objectDetectorFailures / t.framesReceived;
		const usability = cameraReliability / 100;
		const quality = Math.max(0, Math.min(100, latestCameraQuality)) / 100;

		// Small sample sizes cannot produce high confidence.
		const sampleFactor = Math.min(1, t.framesReceived / 12);

		// Coverage and usability gate everything: evidence from frames that never
		// arrived or were unusable cannot be trusted no matter how healthy the
		// detectors are. Detector health then weights what was actually analysed.
		const confidence =
			coverage *
			usability *
			(faceHealth * 0.55 + objectHealth * 0.3 + quality * 0.15) *
			sampleFactor;

		return {
			cameraReliability,
			evidenceConfidence: Math.round(Math.max(0, Math.min(1, confidence)) * 100),
		};
	}

	private computeIdentityState(): IdentityVerificationState {
		const t = this.telemetry;
		if (!this.identityEnrolled) return "not_enrolled";
		if (t.identityMismatches >= 2 && t.identityMismatches > t.identityMatches * 0.25) {
			return "failed";
		}
		if (t.identityMatches >= 2 && t.identityMismatches === 0) return "verified";
		if (t.identityMatches >= 3 && t.identityMismatches <= t.identityMatches * 0.1) {
			return "verified";
		}
		return "inconclusive";
	}

	public computeMetrics(latestCameraQuality = 85): MultiDimensionalIntegrityMetrics {
		const identityScore = Math.max(0, 100 - this.identityDeductions);
		const environmentScore = Math.max(0, 100 - this.environmentDeductions);
		const browserScore = Math.max(0, 100 - this.browserDeductions);
		const behaviorScore = Math.max(0, 100 - this.behaviorDeductions);
		const cameraQualityScore = Math.max(0, Math.min(100, latestCameraQuality));

		// Identity: 25%, Environment: 30%, Browser: 25%, Behavior: 20%.
		// Camera quality modulates confidence, it does not dock the student.
		const composite = Math.round(
			identityScore * 0.25 + environmentScore * 0.3 + browserScore * 0.25 + behaviorScore * 0.2,
		);

		const correlatedIncidents: string[] = [];
		const now = Date.now();
		const last60sEvents = this.recentEvents.filter((e) => now - e.endTime < 60000);

		const hasObject = last60sEvents.some((e) => e.type === "PROHIBITED_OBJECT");
		const hasTabSwitch = last60sEvents.some(
			(e) => e.type === "BROWSER_UNFOCUSED" || e.type === "FULLSCREEN_EXITED",
		);
		const hasHeadDeviation = last60sEvents.some((e) => e.type === "SUSTAINED_HEAD_DEVIATION");
		const hasSpeech = last60sEvents.some((e) => e.type === "SUSPECTED_SPEECH");
		const hasMultiple = last60sEvents.some((e) => e.type === "MULTIPLE_INDIVIDUALS");

		if (hasObject && hasHeadDeviation) {
			correlatedIncidents.push(
				"Concurrent Head Deviation and Prohibited Device presence detected in workspace",
			);
		}
		if (hasTabSwitch && hasHeadDeviation) {
			correlatedIncidents.push(
				"Simultaneous Browser Tab Switch and Sustained Attention Deviation observed",
			);
		}
		if (hasSpeech && hasMultiple) {
			correlatedIncidents.push("Speech activity observed while another person was present");
		}

		const { cameraReliability, evidenceConfidence } = this.computeConfidence(latestCameraQuality);
		const identityVerification = this.computeIdentityState();
		const compositeScore = Math.max(0, Math.min(100, composite));

		let decision: IntegrityDecision = "accept";
		if (
			compositeScore < 70 ||
			evidenceConfidence < 60 ||
			identityVerification === "failed" ||
			this.recentEvents.some((e) => e.humanReviewRecommended)
		) {
			decision = "manual_review";
		} else if (
			compositeScore < 90 ||
			evidenceConfidence < 80 ||
			identityVerification !== "verified"
		) {
			decision = "monitor";
		}

		return {
			compositeScore,
			identityScore,
			cameraQualityScore,
			environmentScore,
			browserScore,
			behaviorScore,
			activeEventCount: last60sEvents.length,
			correlatedIncidents,
			evidenceConfidence,
			cameraReliability,
			identityVerification,
			decision,
			telemetry: { ...this.telemetry },
		};
	}

	public getRecentEvents(): EvidenceEvent[] {
		return [...this.recentEvents];
	}

	public snapshot(): FusionSnapshot {
		return {
			identityDeductions: this.identityDeductions,
			environmentDeductions: this.environmentDeductions,
			browserDeductions: this.browserDeductions,
			behaviorDeductions: this.behaviorDeductions,
			recentEvents: this.recentEvents.slice(-50),
			telemetry: { ...this.telemetry },
			identityEnrolled: this.identityEnrolled,
		};
	}

	private restore(s: FusionSnapshot): void {
		this.identityDeductions = Number(s.identityDeductions) || 0;
		this.environmentDeductions = Number(s.environmentDeductions) || 0;
		this.browserDeductions = Number(s.browserDeductions) || 0;
		this.behaviorDeductions = Number(s.behaviorDeductions) || 0;
		this.recentEvents = Array.isArray(s.recentEvents) ? s.recentEvents.slice(-50) : [];
		this.telemetry = { ...emptyTelemetry(), ...(s.telemetry || {}) };
		this.identityEnrolled = Boolean(s.identityEnrolled);
	}
}
