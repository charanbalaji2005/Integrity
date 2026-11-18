import { OVERALL_INTEGRITY_WEIGHTS } from "../constants/scoring-config";

export interface IntegrityInputScores {
	aiDetection?: number | null;
	answerSimilarity?: number | null;
	liveProctoring?: number | null;
	faceVerification?: number | null;
	facultyOverride?: number | null;
}

export interface OverallIntegrityResult {
	overallIntegrityScore: number;
	contributions: {
		aiDetection: number;
		answerSimilarity: number;
		liveProctoring: number;
		faceVerification: number;
		facultyOverride: number;
	};
	normalizedWeights: {
		aiDetection: number;
		answerSimilarity: number;
		liveProctoring: number;
		faceVerification: number;
		facultyOverride: number;
	};
	missingAgents: string[];
	confidenceLevel: number;
}

/**
 * Combines available agent scores into a single overall integrity score (0 to 100).
 * Handles missing scores by normalizing the weights of active agents.
 */
export function calculateOverallIntegrityScore(
	scores: IntegrityInputScores,
): OverallIntegrityResult {
	const missingAgents: string[] = [];
	const normalizedWeights = {
		aiDetection: 0,
		answerSimilarity: 0,
		liveProctoring: 0,
		faceVerification: 0,
		facultyOverride: 0,
	};
	const contributions = {
		aiDetection: 0,
		answerSimilarity: 0,
		liveProctoring: 0,
		faceVerification: 0,
		facultyOverride: 0,
	};

	// Determine active agents and calculate available weight sum
	let totalAvailableWeight = 0;
	const activeScores: Record<string, number> = {};

	for (const [agent, weight] of Object.entries(OVERALL_INTEGRITY_WEIGHTS)) {
		const scoreValue = scores[agent as keyof IntegrityInputScores];

		if (scoreValue !== undefined && scoreValue !== null) {
			const clamped = Math.max(0, Math.min(100, scoreValue));
			activeScores[agent] = clamped;
			totalAvailableWeight += weight;
		} else {
			missingAgents.push(agent);
		}
	}

	let overallIntegrityScore = 0;

	if (totalAvailableWeight > 0) {
		for (const [agent, score] of Object.entries(activeScores)) {
			const baseWeight = OVERALL_INTEGRITY_WEIGHTS[agent as keyof typeof OVERALL_INTEGRITY_WEIGHTS];
			const normWeight = baseWeight / totalAvailableWeight;

			normalizedWeights[agent as keyof typeof normalizedWeights] =
				Math.round(normWeight * 10000) / 10000;

			const contribution = score * normWeight;
			contributions[agent as keyof typeof contributions] = Math.round(contribution * 100) / 100;

			overallIntegrityScore += contribution;
		}
	}

	return {
		overallIntegrityScore: Math.round(overallIntegrityScore * 100) / 100,
		contributions,
		normalizedWeights,
		missingAgents,
		confidenceLevel: Math.round(totalAvailableWeight * 100) / 100,
	};
}
