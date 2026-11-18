import { describe, expect, it } from "vitest";
import { calculateOverallIntegrityScore } from "../utils/overall-integrity-score";

describe("Overall Integrity Score Module", () => {
	// Case 1: All five agents present
	it("should calculate correct score and weights when all 5 agents are present", () => {
		const scores = {
			aiDetection: 80, // 80 * 0.25 = 20
			answerSimilarity: 70, // 70 * 0.30 = 21
			liveProctoring: 90, // 90 * 0.25 = 22.5
			faceVerification: 50, // 50 * 0.10 = 5
			facultyOverride: 60, // 60 * 0.10 = 6
		};
		// Expected sum = 20 + 21 + 22.5 + 5 + 6 = 74.5

		const result = calculateOverallIntegrityScore(scores);
		expect(result.overallIntegrityScore).toBe(74.5);
		expect(result.confidenceLevel).toBe(1.0);
		expect(result.missingAgents).toEqual([]);
		expect(result.normalizedWeights.aiDetection).toBe(0.25);
		expect(result.contributions.aiDetection).toBe(20);
	});

	// Case 2: Missing optional agents
	it("should normalize weights when faceVerification and facultyOverride are missing", () => {
		const scores = {
			aiDetection: 80,
			answerSimilarity: 70,
			liveProctoring: 90,
			// missing optional ones
		};
		// Total available weight = 0.25 + 0.30 + 0.25 = 0.80
		// Normalized weights:
		// aiDetection: 0.25 / 0.8 = 0.3125
		// answerSimilarity: 0.30 / 0.8 = 0.375
		// liveProctoring: 0.25 / 0.8 = 0.3125
		// Expected score: 80 * 0.3125 + 70 * 0.375 + 90 * 0.3125 = 25 + 26.25 + 28.125 = 79.375 -> 79.38

		const result = calculateOverallIntegrityScore(scores);
		expect(result.overallIntegrityScore).toBe(79.38);
		expect(result.confidenceLevel).toBe(0.8);
		expect(result.missingAgents).toEqual(["faceVerification", "facultyOverride"]);
	});

	// Case 3: Only AI detection present
	it("should calculate score and normalize weight when only AI detection is present", () => {
		const scores = {
			aiDetection: 80,
		};
		// Available weight = 0.25. Normalized weight = 1.0. Expected score = 80.

		const result = calculateOverallIntegrityScore(scores);
		expect(result.overallIntegrityScore).toBe(80.0);
		expect(result.confidenceLevel).toBe(0.25);
		expect(result.normalizedWeights.aiDetection).toBe(1.0);
		expect(result.missingAgents).toContain("answerSimilarity");
		expect(result.missingAgents).toContain("liveProctoring");
		expect(result.missingAgents).toContain("faceVerification");
		expect(result.missingAgents).toContain("facultyOverride");
	});

	// Case 4: Scores below 0 or above 100 are clamped
	it("should clamp individual agent scores below 0 or above 100", () => {
		const scores = {
			aiDetection: 150, // clamped to 100 -> 100 * 0.25 = 25
			answerSimilarity: -50, // clamped to 0 -> 0 * 0.30 = 0
			liveProctoring: 90, // 90 * 0.25 = 22.5
			faceVerification: 50, // 50 * 0.10 = 5
			facultyOverride: 60, // 60 * 0.10 = 6
		};
		// Expected sum = 25 + 0 + 22.5 + 5 + 6 = 58.5

		const result = calculateOverallIntegrityScore(scores);
		expect(result.overallIntegrityScore).toBe(58.5);
	});

	// Case 5: Confidence changes based on available signals
	it("should adjust confidence level precisely matching sum of available agent weights", () => {
		const resultAll = calculateOverallIntegrityScore({
			aiDetection: 50,
			answerSimilarity: 50,
			liveProctoring: 50,
			faceVerification: 50,
			facultyOverride: 50,
		});
		expect(resultAll.confidenceLevel).toBe(1.0);

		const resultSome = calculateOverallIntegrityScore({
			aiDetection: 50,
			liveProctoring: 50,
		});
		expect(resultSome.confidenceLevel).toBe(0.5); // 0.25 + 0.25
	});
});
