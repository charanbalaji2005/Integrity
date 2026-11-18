import { describe, expect, it } from "vitest";
import { generateEvidence } from "../utils/evidence";
import type { RuleResult } from "../utils/rules";
import type { TextStatistics } from "../utils/statistics";

describe("Evidence Generator Module", () => {
	it("should generate evidence items indicating AI-like style with correct contributions and categories", () => {
		const stats: TextStatistics = {
			typeTokenRatio: 0.4, // low -> positive
			vocabularyRichness: 0.7,
			averageSentenceLength: 12.0,
			sentenceLengthStdDev: 3.5, // low -> positive
			wordFrequencyDistribution: {},
			stopWordRatio: 0.45,
			averageSyllablesPerWord: 1.5,
			fleschReadingEase: 65,
			fleschKincaidGrade: 8,
			characterEntropy: 3.8, // low -> positive
			paragraphVariance: 0.5, // low -> positive
			averagePunctuationDensity: 0.05,
			nGramRepetition: { bigram: 0.15, trigram: 0.05 },
			rareWordFrequency: 0.35,
			repeatedSentenceOpenings: 0.25, // high -> positive
		};

		const rules: RuleResult[] = [
			{
				name: "Excessive Transitions",
				count: 3,
				severity: "medium",
				explanation: "",
				matchedExamples: [],
			}, // -> positive
			{
				name: "Passive Voice Usage",
				count: 2,
				severity: "low",
				explanation: "",
				matchedExamples: [],
			}, // -> positive
			{
				name: "No Contractions",
				count: 1,
				severity: "medium",
				explanation: "",
				matchedExamples: [],
			}, // -> positive
		];

		const items = generateEvidence(stats, rules);
		expect(items.length).toBeGreaterThan(5);

		// Assert Sentence Length Std Dev
		const slItem = items.find((i) => i.feature === "Sentence Length Standard Deviation");
		expect(slItem).toBeDefined();
		expect(slItem?.impact).toBe("HIGH");
		expect(slItem?.measuredValue).toBe("3.50");
		expect(slItem?.threshold).toBe("< 5.0");
		expect(slItem?.category).toBe("Statistics");
		expect(slItem?.contribution).toBeGreaterThan(0);

		// Assert Transition Frequency
		const transItem = items.find((i) => i.feature === "Transition Frequency");
		expect(transItem).toBeDefined();
		expect(transItem?.impact).toBe("MEDIUM");
		expect(transItem?.measuredValue).toBe("3 transitions");
		expect(transItem?.threshold).toBe("0 matches");
		expect(transItem?.category).toBe("Language");
		expect(transItem?.contribution).toBeGreaterThan(0);
	});

	it("should generate negative/human-like evidence when text variance is natural", () => {
		const stats: TextStatistics = {
			typeTokenRatio: 0.6, // normal/high -> negative
			vocabularyRichness: 0.9,
			averageSentenceLength: 15.0,
			sentenceLengthStdDev: 8.5, // normal/high -> negative
			wordFrequencyDistribution: {},
			stopWordRatio: 0.35,
			averageSyllablesPerWord: 1.3,
			fleschReadingEase: 70,
			fleschKincaidGrade: 7,
			characterEntropy: 4.5, // normal/high -> negative
			paragraphVariance: 3.5, // normal/high -> negative
			averagePunctuationDensity: 0.05,
			nGramRepetition: { bigram: 0.02, trigram: 0.0 },
			rareWordFrequency: 0.55,
			repeatedSentenceOpenings: 0.05, // normal/low -> negative
		};

		const rules: RuleResult[] = [
			{
				name: "Excessive Transitions",
				count: 0,
				severity: "info",
				explanation: "",
				matchedExamples: [],
			}, // -> negative
		];

		const items = generateEvidence(stats, rules);
		const slItem = items.find((i) => i.feature === "Sentence Length Standard Deviation");
		expect(slItem).toBeDefined();
		expect(slItem?.impact).toBe("LOW");
		expect(slItem?.contribution).toBeLessThan(0);
	});
});
