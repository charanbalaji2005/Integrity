import { describe, expect, it } from "vitest";
import type { BehaviorAnalysis } from "../agents/behavior-agent";
import type { FaceAgentAnalysis } from "../agents/face-agent";
import { orchestrateProctoringPolicy } from "../agents/proctor-orchestrator";
import { buildEvidenceEvent, severityForEvent } from "../evidence/evidence-builder";
import { EvidenceFusionEngine } from "../evidence/evidence-fusion";

const face: FaceAgentAnalysis = {
	status: "OPTIMAL",
	gazeDirection: "center",
	sustainedDeviationSeconds: 0,
	speechDetected: false,
	prolongedEyeClosure: false,
	summaryMessage: "ok",
	requiresAlert: false,
};
const focused: BehaviorAnalysis = { pattern: "focused", explanation: "ok", riskLevel: "none" };

function objectEvent(label: string) {
	return buildEvidenceEvent({
		attemptId: "a1",
		type: "PROHIBITED_OBJECT",
		startTime: 0,
		endTime: 3000,
		confidence: 0.9,
		cameraQuality: 90,
		signals: { objectLabel: label },
	});
}

describe("Confidence-aware integrity scoring", () => {
	it("reports zero confidence and manual review when no telemetry arrived", () => {
		const engine = new EvidenceFusionEngine("a1");
		const m = engine.computeMetrics();
		expect(m.compositeScore).toBe(100);
		expect(m.evidenceConfidence).toBe(0);
		expect(m.decision).toBe("manual_review");
		expect(m.identityVerification).toBe("not_enrolled");
	});

	it("does not treat detector failures as a clean environment", () => {
		const engine = new EvidenceFusionEngine("a1");
		for (let i = 0; i < 20; i++) {
			engine.recordFrame({
				hadFrame: true,
				usable: true,
				faceDetectorFailed: true,
				objectDetectorFailed: true,
			});
		}
		const m = engine.computeMetrics(90);
		expect(m.compositeScore).toBe(100);
		expect(m.evidenceConfidence).toBeLessThan(60);
		expect(m.decision).toBe("manual_review");
	});

	it("verifies identity only after real matches", () => {
		const engine = new EvidenceFusionEngine("a1");
		engine.setIdentityEnrolled(true);
		expect(engine.computeMetrics().identityVerification).toBe("inconclusive");
		for (let i = 0; i < 3; i++) {
			engine.recordFrame({
				hadFrame: true,
				usable: true,
				faceDetectorFailed: false,
				objectDetectorFailed: false,
				identityCheck: "match",
			});
		}
		expect(engine.computeMetrics().identityVerification).toBe("verified");
	});

	it("restores deductions and telemetry from a persisted snapshot", () => {
		const engine = new EvidenceFusionEngine("a1");
		engine.registerEvent(objectEvent("Mobile Phone"));
		engine.recordFrame({
			hadFrame: true,
			usable: true,
			faceDetectorFailed: false,
			objectDetectorFailed: false,
		});
		const restored = new EvidenceFusionEngine("a1", JSON.parse(JSON.stringify(engine.snapshot())));
		expect(restored.computeMetrics().environmentScore).toBe(80);
		expect(restored.computeMetrics().telemetry.framesReceived).toBe(1);
	});
});

describe("Evidence severity", () => {
	it("treats phones and screens as high, books and earphones as medium", () => {
		expect(severityForEvent(objectEvent("Mobile Phone"))).toBe("high");
		expect(severityForEvent(objectEvent("Secondary Screen"))).toBe("high");
		expect(severityForEvent(objectEvent("Book"))).toBe("medium");
		expect(severityForEvent(objectEvent("Audio Earphones"))).toBe("medium");
	});
});

describe("Proctor orchestrator policy", () => {
	const metrics = new EvidenceFusionEngine("a1").computeMetrics();

	it("pauses for a phone but only warns for a book", () => {
		const phone = orchestrateProctoringPolicy({
			faceAnalysis: face,
			behaviorAnalysis: focused,
			newEvents: [objectEvent("Mobile Phone")],
			metrics,
			currentStatus: "NORMAL",
			warningCount: 0,
		});
		expect(phone.action).toBe("pause");

		const book = orchestrateProctoringPolicy({
			faceAnalysis: face,
			behaviorAnalysis: focused,
			newEvents: [objectEvent("Book")],
			metrics,
			currentStatus: "NORMAL",
			warningCount: 0,
		});
		expect(book.action).toBe("warning");
	});

	it("does not re-emit pause every frame while already paused", () => {
		const d = orchestrateProctoringPolicy({
			faceAnalysis: face,
			behaviorAnalysis: focused,
			newEvents: [],
			metrics,
			currentStatus: "PAUSED",
			warningCount: 1,
		});
		expect(d.status).toBe("PAUSED");
		expect(d.action).toBe("none");
	});

	it("does not warn for natural scratch-pad glances", () => {
		const deviation = buildEvidenceEvent({
			attemptId: "a1",
			type: "SUSTAINED_HEAD_DEVIATION",
			startTime: 0,
			endTime: 4000,
			confidence: 0.9,
			cameraQuality: 90,
			signals: { gazeDirection: "down" },
		});
		const d = orchestrateProctoringPolicy({
			faceAnalysis: face,
			behaviorAnalysis: { pattern: "scratchpad_work", explanation: "", riskLevel: "low" },
			newEvents: [deviation],
			metrics,
			currentStatus: "NORMAL",
			warningCount: 0,
		});
		expect(d.action).toBe("none");
	});
});
