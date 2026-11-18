/**
 * Weights for the AI Content Detection sub-scores.
 */
export const AI_DETECTION_WEIGHTS = {
	statistics: 0.4,
	rules: 0.35,
	llm: 0.25,
} as const;

/**
 * Weights for compiling the overall integrity score across multiple agent engines.
 */
export const OVERALL_INTEGRITY_WEIGHTS = {
	aiDetection: 0.25,
	answerSimilarity: 0.3,
	liveProctoring: 0.25,
	faceVerification: 0.1,
	facultyOverride: 0.1,
} as const;
