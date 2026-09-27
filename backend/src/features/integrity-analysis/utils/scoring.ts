import { AI_DETECTION_WEIGHTS } from "../constants/scoring-config";
import { STATS_THRESHOLDS } from "../constants/thresholds";
import type { RuleResult } from "./rules";
import type { TextStatistics } from "./statistics";

export interface IntegratedScoringResult {
	statisticsScore: number;
	rulesScore: number;
	llmScore?: number;
	finalScore: number;
}

/**
 * Computes an AI likelihood score (0 to 100) based on statistical metrics.
 */
export function calculateStatisticsScore(stats: TextStatistics): number {
	const indicators = [
		{
			// AI texts have extremely low sentence length variance
			check: () => stats.sentenceLengthStdDev < STATS_THRESHOLDS.sentenceLengthStdDev,
			weight: 20,
		},
		{
			// AI paragraphs are constructed uniformly (low variance of sentence counts)
			check: () => stats.paragraphVariance < STATS_THRESHOLDS.paragraphVariance,
			weight: 20,
		},
		{
			// AI has lower vocabulary richness (tends to use standard words)
			check: () => stats.vocabularyRichness < STATS_THRESHOLDS.vocabularyRichness,
			weight: 15,
		},
		{
			// AI has lower Type Token Ratio (more repetitive vocabulary)
			check: () => stats.typeTokenRatio < STATS_THRESHOLDS.typeTokenRatio,
			weight: 15,
		},
		{
			// AI tends to have high bigram repetition
			check: () => stats.nGramRepetition.bigram > STATS_THRESHOLDS.bigramRepetition,
			weight: 15,
		},
		{
			// AI has lower rare word frequency (fewer Hapax Legomena)
			check: () => stats.rareWordFrequency < STATS_THRESHOLDS.rareWordFrequency,
			weight: 15,
		},
	];

	let activeScore = 0;
	let totalWeight = 0;

	for (const indicator of indicators) {
		totalWeight += indicator.weight;
		if (indicator.check()) {
			activeScore += indicator.weight;
		}
	}

	if (totalWeight === 0) return 0;
	return Math.round((activeScore / totalWeight) * 100);
}

/**
 * Computes an AI likelihood score (0 to 100) based on matched rules.
 */
export function calculateRulesScore(ruleResults: RuleResult[]): number {
	let score = 0;
	for (const rule of ruleResults) {
		if (rule.count > 0) {
			if (rule.severity === "low") {
				score += 10;
			} else if (rule.severity === "medium") {
				score += 25;
			} else if (rule.severity === "high") {
				score += 50;
			}
		}
	}
	return Math.min(100, score);
}

/**
 * Combines scores using configured weights.
 * If LLM is missing, normalizes using active sub-weights.
 */
export function calculateIntegratedScore(
	statsScore: number,
	rulesScore: number,
	llmScore?: number,
): number {
	const wStats = AI_DETECTION_WEIGHTS.statistics;
	const wRules = AI_DETECTION_WEIGHTS.rules;
	const wLlm = AI_DETECTION_WEIGHTS.llm;

	if (llmScore !== undefined && llmScore !== null) {
		const score = statsScore * wStats + rulesScore * wRules + llmScore * wLlm;
		return Math.round(score * 100) / 100;
	}

	const totalWeight = wStats + wRules;
	if (totalWeight === 0) return 0;
	const score = (statsScore * wStats + rulesScore * wRules) / totalWeight;
	return Math.round(score * 100) / 100;
}
