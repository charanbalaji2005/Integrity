import { describe, expect, it } from "vitest";
import type { RuleResult } from "../utils/rules";
import {
	calculateIntegratedScore,
	calculateRulesScore,
	calculateStatisticsScore,
} from "../utils/scoring";
import type { TextStatistics } from "../utils/statistics";

describe("Scoring - Statistics Score", () => {
	it("should return 0 when all stats are natural/human-like", () => {
		const stats: TextStatistics = {
			typeTokenRatio: 0.8,
			vocabularyRichness: 0.95,
			averageSentenceLength: 15.0,
			sentenceLengthStdDev: 12.0, // natural variance (> 5)
			wordFrequencyDistribution: {},
			stopWordRatio: 0.35,
			averageSyllablesPerWord: 1.4,
			fleschReadingEase: 60,
			fleschKincaidGrade: 8,
			characterEntropy: 4.5,
			paragraphVariance: 4.0, // natural variance (> 1)
			averagePunctuationDensity: 0.05,
			nGramRepetition: { bigram: 0.02, trigram: 0.0 }, // low repetition (< 0.12)
			rareWordFrequency: 0.6, // high rare words (> 0.45)
			repeatedSentenceOpenings: 0.0,
		};

		const score = calculateStatisticsScore(stats);
		expect(score).toBe(0);
	});

	it("should return 100 when all stats indicate AI generation", () => {
		const stats: TextStatistics = {
			typeTokenRatio: 0.4, // low (< 0.5) -> match
			vocabularyRichness: 0.7, // low (< 0.85) -> match
			averageSentenceLength: 12.0,
			sentenceLengthStdDev: 3.5, // low (< 5.0) -> match
			wordFrequencyDistribution: {},
			stopWordRatio: 0.48,
			averageSyllablesPerWord: 1.5,
			fleschReadingEase: 65,
			fleschKincaidGrade: 8,
			characterEntropy: 4.2,
			paragraphVariance: 0.5, // low (< 1.0) -> match
			averagePunctuationDensity: 0.04,
			nGramRepetition: { bigram: 0.18, trigram: 0.05 }, // high (> 0.12) -> match
			rareWordFrequency: 0.35, // low (< 0.45) -> match
			repeatedSentenceOpenings: 0.0,
		};

		const score = calculateStatisticsScore(stats);
		expect(score).toBe(100);
	});

	it("should calculate partial scores correctly", () => {
		// Only sentenceLengthStdDev (weight 20) and paragraphVariance (weight 20) indicate AI
		// Active weights: 20 + 20 = 40. Total weight: 100. Expected score: 40
		const stats: TextStatistics = {
			typeTokenRatio: 0.8,
			vocabularyRichness: 0.95,
			averageSentenceLength: 15.0,
			sentenceLengthStdDev: 3.0, // match (20)
			wordFrequencyDistribution: {},
			stopWordRatio: 0.35,
			averageSyllablesPerWord: 1.4,
			fleschReadingEase: 60,
			fleschKincaidGrade: 8,
			characterEntropy: 4.5,
			paragraphVariance: 0.5, // match (20)
			averagePunctuationDensity: 0.05,
			nGramRepetition: { bigram: 0.02, trigram: 0.0 },
			rareWordFrequency: 0.6,
			repeatedSentenceOpenings: 0.0,
		};

		const score = calculateStatisticsScore(stats);
		expect(score).toBe(40);
	});
});

describe("Scoring - Rules Score", () => {
	it("should sum up matched rules based on severity", () => {
		const ruleResults: RuleResult[] = [
			{
				name: "Academic Connectors",
				count: 2,
				severity: "low",
				explanation: "",
				matchedExamples: [],
			}, // 10 pts
			{
				name: "Balanced Paragraph Lengths",
				count: 1,
				severity: "medium",
				explanation: "",
				matchedExamples: [],
			}, // 25 pts
			{
				name: "Passive Voice",
				count: 0,
				severity: "info",
				explanation: "",
				matchedExamples: [],
			}, // 0 pts
		];

		const score = calculateRulesScore(ruleResults);
		expect(score).toBe(35);
	});

	it("should clamp the rules score to a maximum of 100", () => {
		const ruleResults: RuleResult[] = [
			{
				name: "Rule A",
				count: 1,
				severity: "high",
				explanation: "",
				matchedExamples: [],
			}, // 50 pts
			{
				name: "Rule B",
				count: 1,
				severity: "high",
				explanation: "",
				matchedExamples: [],
			}, // 50 pts
			{
				name: "Rule C",
				count: 1,
				severity: "medium",
				explanation: "",
				matchedExamples: [],
			}, // 25 pts
		];

		const score = calculateRulesScore(ruleResults);
		expect(score).toBe(100);
	});
});

describe("Scoring - Integrated Score", () => {
	it("should calculate composite score when LLM is present", () => {
		// Stats 40% (40), Rules 35% (60), LLM 25% (80)
		// Expected: 40 * 0.4 + 60 * 0.35 + 80 * 0.25 = 16 + 21 + 20 = 57
		const statsScore = 40;
		const rulesScore = 60;
		const llmScore = 80;

		const integrated = calculateIntegratedScore(statsScore, rulesScore, llmScore);
		expect(integrated).toBe(57);
	});

	it("should normalize composite score when LLM is missing", () => {
		// Stats 40% (40), Rules 35% (60), LLM missing
		// Expected: (40 * 0.4 + 60 * 0.35) / 0.75 = (16 + 21) / 0.75 = 37 / 0.75 = 49.33
		const statsScore = 40;
		const rulesScore = 60;

		const integrated = calculateIntegratedScore(statsScore, rulesScore);
		expect(integrated).toBeCloseTo(49.33);
	});
});
