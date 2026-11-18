import { describe, expect, it } from "vitest";
import {
	checkAcademicConnectors,
	checkBalancedParagraphLengths,
	checkExcessiveTransitions,
	checkNoContractions,
	checkParagraphTemplates,
	checkPassiveVoice,
	checkPerfectGrammar,
	checkRepetitiveAdjectives,
	checkRepetitiveSentenceStructures,
	checkSpellingVariation,
	runRuleEngine,
} from "../utils/rules";
import { splitIntoSentences, tokenizeWords } from "../utils/statistics";

describe("Rule Engine - Academic Connectors", () => {
	it("should detect academic connectors case-insensitively", () => {
		const text = "Furthermore, this is true. Overall, it works. In conclusion, we are done.";
		const sentences = splitIntoSentences(text);
		const result = checkAcademicConnectors(text, sentences);
		expect(result.count).toBe(3);
		expect(result.severity).toBe("medium");
		expect(result.matchedExamples).toHaveLength(3);
		expect(result.matchedExamples[0]).toContain("Furthermore");
	});

	it("should handle text with no academic connectors", () => {
		const text = "This is a simple sentence with no fancy words.";
		const sentences = splitIntoSentences(text);
		const result = checkAcademicConnectors(text, sentences);
		expect(result.count).toBe(0);
		expect(result.severity).toBe("info");
	});
});

describe("Rule Engine - Paragraph Templates", () => {
	it("should detect paragraphs sharing identical sentence-length structures", () => {
		const paragraph1 = "One two three. Four five six. Seven eight nine ten.";
		const paragraph2 = "Ten nine eight. Seven six five. Four three two one.";
		const text = `${paragraph1}\n\n${paragraph2}`;

		const result = checkParagraphTemplates(text);
		expect(result.count).toBe(1);
		expect(result.severity).toBe("low");
	});
});

describe("Rule Engine - Repetitive Sentence Structures", () => {
	it("should detect adjacent sentences starting with the same 2-word prefixes", () => {
		const sentences = ["It is hot today.", "It is also sunny.", "They go home."];
		const result = checkRepetitiveSentenceStructures(sentences);
		expect(result.count).toBe(1);
		expect(result.matchedExamples[0]).toContain("It is");
	});
});

describe("Rule Engine - Passive Voice", () => {
	it("should detect passive voice constructions", () => {
		const sentences = [
			"The code was written by the agent.",
			"He is baking a cake.",
			"An analysis is conducted.",
		];
		const result = checkPassiveVoice(sentences);
		expect(result.count).toBe(2);
	});
});

describe("Rule Engine - Balanced Paragraph Lengths", () => {
	it("should flag low standard deviation of paragraph word counts", () => {
		// Three paragraphs of identical lengths (12 words each)
		const text =
			"One two three four five six seven eight nine ten eleven twelve.\n\n" +
			"One two three four five six seven eight nine ten eleven twelve.\n\n" +
			"One two three four five six seven eight nine ten eleven twelve.";
		const result = checkBalancedParagraphLengths(text);
		expect(result.count).toBe(1);
		expect(result.severity).toBe("medium");
	});

	it("should allow natural variance in paragraph lengths", () => {
		const text =
			"Short paragraph.\n\n" +
			"This paragraph has many more words because it describes a complex topic in detail.\n\n" +
			"Another somewhat medium length paragraph here.";
		const result = checkBalancedParagraphLengths(text);
		expect(result.count).toBe(0);
		expect(result.severity).toBe("info");
	});
});

describe("Rule Engine - Perfect Grammar", () => {
	it("should not flag short texts", () => {
		const result = checkPerfectGrammar("Short text.");
		expect(result.count).toBe(0);
	});

	it("should flag texts over 100 words with no grammar mistakes", () => {
		const word = "word ";
		const longText = word.repeat(110);
		const result = checkPerfectGrammar(longText);
		expect(result.count).toBe(1);
		expect(result.severity).toBe("low");
	});

	it("should detect common grammar mistakes and not flag perfect grammar", () => {
		const word = "word ";
		const longText = `${word.repeat(100)} He could of gone there. Its a nice day. Their are some issues.`;
		const result = checkPerfectGrammar(longText);
		expect(result.count).toBe(0);
		expect(result.matchedExamples.length).toBeGreaterThan(0);
	});
});

describe("Rule Engine - Spelling Consistency", () => {
	it("should flag strict spelling consistency (e.g. US spelling only and no typos)", () => {
		const word = "word ";
		const text = `${word.repeat(100)} analyze behavior color organize`;
		const result = checkSpellingVariation(text);
		expect(result.count).toBe(1);
		expect(result.severity).toBe("low");
	});

	it("should not flag if US/UK spellings are mixed", () => {
		const word = "word ";
		const text = `${word.repeat(100)} analyze behaviour color colour`;
		const result = checkSpellingVariation(text);
		expect(result.count).toBe(0);
	});

	it("should not flag if typos are detected", () => {
		const word = "word ";
		const text = `${word.repeat(100)} analyze behavior teh color`;
		const result = checkSpellingVariation(text);
		expect(result.count).toBe(0);
	});
});

describe("Rule Engine - No Contractions", () => {
	it("should flag text with zero contractions and multiple full forms", () => {
		const text = "It is important. We do not agree. They cannot see.";
		const result = checkNoContractions(text);
		expect(result.count).toBe(1);
		expect(result.severity).toBe("medium");
	});

	it("should not flag if contractions are present", () => {
		const text = "It's important. We do not agree. They can't see.";
		const result = checkNoContractions(text);
		expect(result.count).toBe(0);
	});
});

describe("Rule Engine - Excessive Transitions", () => {
	it("should track density of transitions", () => {
		const sentences = [
			"However, we must go.",
			"Therefore, it is true.",
			"Subsequently, they left.",
			"This is normal.",
		];
		// 3/4 sentences have transitions = 75% density (>30%)
		const result = checkExcessiveTransitions(sentences);
		expect(result.count).toBe(3);
		expect(result.severity).toBe("medium");
	});
});

describe("Rule Engine - Repetitive Adjectives", () => {
	it("should detect repeats of specific adjectives", () => {
		const words = tokenizeWords("This is crucial and very essential. It is also crucial.");
		const result = checkRepetitiveAdjectives(words);
		expect(result.count).toBe(2); // crucial used 2 times
		expect(result.matchedExamples[0]).toContain("crucial");
	});
});

describe("Rule Engine Integration", () => {
	it("should execute all rules in the engine and return list of results", () => {
		const text =
			"Furthermore, it is crucial to analyze the behavior. Overall, we do not see contractions. It is vital.";
		const results = runRuleEngine(text);
		expect(results).toHaveLength(10);
		for (const rule of results) {
			expect(rule.name).toBeDefined();
			expect(rule.count).toBeDefined();
			expect(rule.severity).toBeDefined();
			expect(rule.explanation).toBeDefined();
			expect(rule.matchedExamples).toBeDefined();
		}
	});
});
