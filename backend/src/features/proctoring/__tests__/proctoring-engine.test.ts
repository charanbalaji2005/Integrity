import { describe, expect, it } from "vitest";
import { buildEvidenceEvent } from "../evidence/evidence-builder";
import { EvidenceFusionEngine } from "../evidence/evidence-fusion";
import { estimateHeadPose } from "../perception/pose-estimator";
import { ProctorEventDeduplicator } from "../temporal/event-deduplicator";
import { ProctorEventStateMachine } from "../temporal/event-state-machine";
import { TemporalSignalBuffer } from "../temporal/signal-buffer";

describe("Proctoring Perception & Pose Estimator", () => {
	it("should calculate center gaze when landmarks are symmetric", () => {
		// Mock 68 landmark points
		const mockPoints = Array.from({ length: 68 }, (_, i) => ({ x: 100, y: 100 }));
		// Left jaw edge: x = 50, Right jaw edge: x = 150
		mockPoints[0] = { x: 50, y: 100 };
		mockPoints[16] = { x: 150, y: 100 };
		// Nose bridge: (100, 70), Nose tip: (100, 100), Chin: (100, 170)
		mockPoints[27] = { x: 100, y: 70 };
		mockPoints[30] = { x: 100, y: 100 };
		mockPoints[8] = { x: 100, y: 170 };
		// Eyes outer corners: (70, 70) and (130, 70)
		mockPoints[36] = { x: 70, y: 70 };
		mockPoints[45] = { x: 130, y: 70 };

		const pose = estimateHeadPose(mockPoints);
		expect(pose.gazeDirection).toBe("center");
		expect(pose.isLookingAway).toBe(false);
		expect(Math.abs(pose.yaw)).toBeLessThan(5);
	});

	it("should calculate looking left when nose is shifted toward right jaw edge", () => {
		const mockPoints = Array.from({ length: 68 }, () => ({ x: 100, y: 100 }));
		mockPoints[0] = { x: 50, y: 100 };
		mockPoints[16] = { x: 150, y: 100 };
		mockPoints[27] = { x: 100, y: 70 };
		// Nose tip shifted right: x = 125
		mockPoints[30] = { x: 125, y: 100 };
		mockPoints[8] = { x: 100, y: 170 };
		mockPoints[36] = { x: 70, y: 70 };
		mockPoints[45] = { x: 130, y: 70 };

		const pose = estimateHeadPose(mockPoints);
		expect(pose.yaw).toBeGreaterThan(15);
		expect(pose.isLookingAway).toBe(true);
	});

	it("should apply calibration baseline offset subtraction accurately", () => {
		const mockPoints = Array.from({ length: 68 }, () => ({ x: 100, y: 100 }));
		mockPoints[0] = { x: 50, y: 100 };
		mockPoints[16] = { x: 150, y: 100 };
		mockPoints[27] = { x: 100, y: 70 };
		mockPoints[30] = { x: 110, y: 100 };
		mockPoints[8] = { x: 100, y: 170 };
		mockPoints[36] = { x: 70, y: 70 };
		mockPoints[45] = { x: 130, y: 70 };

		// Without baseline: yaw ~ 6.5 deg
		const uncalibrated = estimateHeadPose(mockPoints);
		expect(uncalibrated.deltaYaw).toBe(uncalibrated.yaw);

		// With baseline compensating for candidate sitting slightly angled
		const calibrated = estimateHeadPose(mockPoints, {
			baselineYaw: uncalibrated.yaw,
			baselinePitch: 0,
			baselineRoll: 0,
			calibratedAt: Date.now(),
		});

		expect(calibrated.deltaYaw).toBe(0);
		expect(calibrated.isLookingAway).toBe(false);
	});
});

describe("Temporal Signal Buffer & State Machine", () => {
	it("should not confirm an event on momentary 0.4s glance, but confirm after sustained 3.5s", () => {
		const sm = new ProctorEventStateMachine("SUSTAINED_HEAD_DEVIATION", 3000);
		const t0 = 10000;

		// Frame 1: Glancing away
		const step1 = sm.update(true, 0.9, t0);
		expect(step1.currentState).toBe("SUSPECTED");

		// Frame 2: 400ms later - still looking away
		const step2 = sm.update(true, 0.9, t0 + 400);
		expect(step2.currentState).toBe("SUSPECTED");

		// Candidate glances back to center at t0 + 800ms
		const step3 = sm.update(false, 0.9, t0 + 800);
		expect(step3.currentState).toBe("IDLE"); // Returned to IDLE without false violation!

		// Now simulate sustained looking away for 3.5s
		const t1 = 20000;
		sm.update(true, 0.9, t1); // SUSPECTED
		sm.update(true, 0.9, t1 + 1000); // SUSPECTED (1s)
		sm.update(true, 0.9, t1 + 2000); // SUSPECTED (2s)
		const stepConfirmed = sm.update(true, 0.9, t1 + 3200); // CONFIRMED (3.2s >= 3.0s threshold)

		expect(stepConfirmed.currentState).toBe("CONFIRMED");
	});

	it("should deduplicate continuous detections into a single merged event", () => {
		const deduplicator = new ProctorEventDeduplicator(5000);
		const attemptId = "att_test_123";

		// Second 0: Phone detected
		const r1 = deduplicator.ingest(attemptId, "PROHIBITED_OBJECT", "high", "Phone seen", 0.9, 1000);
		expect(r1.isNewEvent).toBe(true);

		// Second 2: Phone still in frame
		const r2 = deduplicator.ingest(
			attemptId,
			"PROHIBITED_OBJECT",
			"high",
			"Phone seen",
			0.95,
			3000,
		);
		expect(r2.isNewEvent).toBe(false); // Merged!
		expect(r2.event.durationMs).toBe(2000);
		expect(r2.event.peakConfidence).toBe(0.95);

		// Second 5: Phone still in frame
		const r3 = deduplicator.ingest(
			attemptId,
			"PROHIBITED_OBJECT",
			"high",
			"Phone seen",
			0.92,
			6000,
		);
		expect(r3.isNewEvent).toBe(false);
		expect(r3.event.durationMs).toBe(5000);

		// Second 8: Phone removed -> Resolve
		const resolved = deduplicator.resolve(attemptId, "PROHIBITED_OBJECT", 9000);
		expect(resolved?.isOngoing).toBe(false);
		expect(resolved?.durationMs).toBe(8000);
	});
});

describe("Multi-Dimensional Evidence Fusion", () => {
	it("should calculate distinct scores across 5 integrity dimensions", () => {
		const fusion = new EvidenceFusionEngine("att_101");

		const initialMetrics = fusion.computeMetrics(95);
		expect(initialMetrics.compositeScore).toBe(100);
		expect(initialMetrics.identityScore).toBe(100);
		expect(initialMetrics.environmentScore).toBe(100);
		expect(initialMetrics.browserScore).toBe(100);
		expect(initialMetrics.behaviorScore).toBe(100);
		expect(initialMetrics.cameraQualityScore).toBe(95);

		// Register a browser tab switch
		const event = buildEvidenceEvent({
			attemptId: "att_101",
			type: "BROWSER_UNFOCUSED",
			startTime: Date.now() - 1000,
			endTime: Date.now(),
			confidence: 1.0,
			cameraQuality: 90,
			signals: { event: "tab-switch" },
		});
		fusion.registerEvent(event);

		const updatedMetrics = fusion.computeMetrics(90);
		expect(updatedMetrics.browserScore).toBe(92);
		expect(updatedMetrics.identityScore).toBe(100); // Unaffected!
		expect(updatedMetrics.environmentScore).toBe(100); // Unaffected!
		expect(updatedMetrics.compositeScore).toBeLessThan(100);
	});
});
