import type { EvidenceEvent } from "./evidence-builder";

export interface MultiDimensionalIntegrityMetrics {
	compositeScore: number; // 0 to 100 overall composite score
	identityScore: number; // 0 to 100 (biometric consistency & face presence)
	cameraQualityScore: number; // 0 to 100 (lighting, focus, usable visibility)
	environmentScore: number; // 0 to 100 (workspace cleanliness, no prohibited objects)
	browserScore: number; // 0 to 100 (fullscreen & focus compliance)
	behaviorScore: number; // 0 to 100 (attention alignment, natural exam posture)
	activeEventCount: number;
	correlatedIncidents: string[];
}

export class EvidenceFusionEngine {
	private attemptId: string;
	private identityDeductions = 0;
	private environmentDeductions = 0;
	private browserDeductions = 0;
	private behaviorDeductions = 0;
	private recentEvents: EvidenceEvent[] = [];

	constructor(attemptId: string) {
		this.attemptId = attemptId;
	}

	public registerEvent(event: EvidenceEvent): void {
		this.recentEvents.push(event);
		if (this.recentEvents.length > 50) {
			this.recentEvents.shift();
		}

		// Apply deductions according to dimension
		switch (event.type) {
			case "ABSENT_CANDIDATE":
				this.identityDeductions = Math.min(60, this.identityDeductions + 10);
				break;
			case "MULTIPLE_INDIVIDUALS":
				this.identityDeductions = Math.min(70, this.identityDeductions + 25);
				break;
			case "PROHIBITED_OBJECT":
				this.environmentDeductions = Math.min(80, this.environmentDeductions + 20);
				break;
			case "BROWSER_UNFOCUSED":
				this.browserDeductions = Math.min(80, this.browserDeductions + 8);
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
		}
	}

	public computeMetrics(latestCameraQuality = 85): MultiDimensionalIntegrityMetrics {
		const identityScore = Math.max(0, 100 - this.identityDeductions);
		const environmentScore = Math.max(0, 100 - this.environmentDeductions);
		const browserScore = Math.max(0, 100 - this.browserDeductions);
		const behaviorScore = Math.max(0, 100 - this.behaviorDeductions);
		const cameraQualityScore = Math.max(10, Math.min(100, latestCameraQuality));

		// Weighted calculation:
		// Identity: 25%, Environment: 30%, Browser: 25%, Behavior: 20%
		// (Camera Quality modulates certainty, does not unfairly dock the student's integrity)
		const composite = Math.round(
			identityScore * 0.25 + environmentScore * 0.3 + browserScore * 0.25 + behaviorScore * 0.2,
		);

		// Multi-Signal Correlation Detection
		const correlatedIncidents: string[] = [];
		const now = Date.now();
		const last60sEvents = this.recentEvents.filter((e) => now - e.endTime < 60000);

		const hasObject = last60sEvents.some((e) => e.type === "PROHIBITED_OBJECT");
		const hasTabSwitch = last60sEvents.some((e) => e.type === "BROWSER_UNFOCUSED");
		const hasHeadDeviation = last60sEvents.some((e) => e.type === "SUSTAINED_HEAD_DEVIATION");

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

		return {
			compositeScore: Math.max(0, Math.min(100, composite)),
			identityScore,
			cameraQualityScore,
			environmentScore,
			browserScore,
			behaviorScore,
			activeEventCount: last60sEvents.length,
			correlatedIncidents,
		};
	}

	public getRecentEvents(): EvidenceEvent[] {
		return [...this.recentEvents];
	}
}
