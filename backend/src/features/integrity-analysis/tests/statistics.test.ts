import { describe, expect, it } from "vitest";
import {
	calculateTextStatistics,
	countSyllables,
	getAveragePunctuationDensity,
	getAverageSentenceLength,
	getAverageSyllablesPerWord,
	getCharacterEntropy,
	getFleschKincaidGrade,
	getFleschReadingEase,
	getNGramRepetition,
	getParagraphVariance,
	getRareWordFrequency,
	getRepeatedSentenceOpenings,
	getSentenceLengthStdDev,
	getStopWordRatio,
	getTypeTokenRatio,
	getVocabularyRichness,
	getWordFrequencyDistribution,
	splitIntoSentences,
	tokenizeWords,
} from "../utils/statistics";

describe("Statistics Helper Functions", () => {
	it("should split text into sentences", () => {
		const text = "Hello world! This is a test. Is this correct? Yes, it is.";
		const sentences = splitIntoSentences(text);
		expect(sentences).toEqual([
			"Hello world!",
			"This is a test.",
			"Is this correct?",
			"Yes, it is.",
		]);
	});

	it("should return empty array for empty sentence input", () => {
		expect(splitIntoSentences("")).toEqual([]);
		expect(splitIntoSentences("   ")).toEqual([]);
	});

	it("should tokenize words", () => {
		const text = "Hello, world! This is-a test's tokenization.";
		const tokens = tokenizeWords(text);
		expect(tokens).toEqual(["hello", "world", "this", "is-a", "test's", "tokenization"]);
	});

	it("should return empty array for empty token input", () => {
		expect(tokenizeWords("")).toEqual([]);
	});

	it("should compute Type Token Ratio (TTR)", () => {
		expect(getTypeTokenRatio([])).toBe(0);
		expect(getTypeTokenRatio(["hello", "world"])).toBe(1.0);
		expect(getTypeTokenRatio(["hello", "hello"])).toBe(0.5);
	});

	it("should compute Vocabulary Richness (Simpson's Diversity Index)", () => {
		expect(getVocabularyRichness([])).toBe(0);
		expect(getVocabularyRichness(["hello"])).toBe(0);
		// All different words: sum count*(count-1) = 0. Simpson index = 0. 1 - D = 1
		expect(getVocabularyRichness(["hello", "world"])).toBe(1.0);
		// Duplicate words: counts are {hello: 2}. sum = 2 * 1 = 2. Total words = 2.
		// simpson index = 2 / (2 * 1) = 1.0. 1 - D = 0.
		expect(getVocabularyRichness(["hello", "hello"])).toBe(0);
	});

	it("should compute Average Sentence Length", () => {
		expect(getAverageSentenceLength([])).toBe(0);
		expect(getAverageSentenceLength(["One two three.", "Four five."])).toBe(2.5);
	});

	it("should compute Sentence Length Std Dev", () => {
		expect(getSentenceLengthStdDev([])).toBe(0);
		expect(getSentenceLengthStdDev(["One."])).toBe(0);
		// Sentence lengths: 3, 1. Mean = 2. Diffs: (3-2)^2 = 1, (1-2)^2 = 1.
		// Variance = (1 + 1)/2 = 1. Std Dev = 1.
		expect(getSentenceLengthStdDev(["One two three.", "Four."])).toBe(1.0);
	});

	it("should compute Word Frequency Distribution", () => {
		expect(getWordFrequencyDistribution([])).toEqual({});
		expect(getWordFrequencyDistribution(["a", "b", "a"])).toEqual({
			a: 2,
			b: 1,
		});
	});

	it("should compute Stop-word Ratio", () => {
		expect(getStopWordRatio([])).toBe(0);
		expect(getStopWordRatio(["the", "quick", "brown", "fox", "and", "a", "dog"])).toBe(3 / 7);
	});

	it("should count syllables in a word using heuristic", () => {
		expect(countSyllables("")).toBe(0);
		expect(countSyllables("cat")).toBe(1);
		expect(countSyllables("mouse")).toBe(1); // silent e
		expect(countSyllables("syllable")).toBe(3);
		expect(countSyllables("wanted")).toBe(2); // ending ed, d root
		expect(countSyllables("baked")).toBe(1); // ending ed, k root
	});

	it("should compute Average Syllables per Word", () => {
		expect(getAverageSyllablesPerWord([])).toBe(0);
		expect(getAverageSyllablesPerWord(["cat", "mouse", "syllable"])).toBe(5 / 3);
	});

	it("should compute Flesch Reading Ease and Flesch-Kincaid Grade", () => {
		// Test typical formulas
		expect(getFleschReadingEase(0, 0)).toBe(100);
		expect(getFleschKincaidGrade(0, 0)).toBe(0);
		// ASL = 10, ASW = 1.5
		// Ease: 206.835 - 1.015 * 10 - 84.6 * 1.5 = 206.835 - 10.15 - 126.9 = 69.785 -> 69.79
		expect(getFleschReadingEase(10, 1.5)).toBe(69.79);
		// Grade: 0.39 * 10 + 11.8 * 1.5 - 15.59 = 3.9 + 17.7 - 15.59 = 6.01
		expect(getFleschKincaidGrade(10, 1.5)).toBe(6.01);
	});

	it("should compute Character Entropy", () => {
		expect(getCharacterEntropy("")).toBe(0);
		// "aaaa" -> single character, p = 1.0, -1 * log2(1) = 0
		expect(getCharacterEntropy("aaaa")).toBe(0);
		// "ab" -> 2 characters, p = 0.5 each. -2 * (0.5 * -1) = 1.0
		expect(getCharacterEntropy("ab")).toBe(1.0);
	});

	it("should compute Paragraph Variance", () => {
		expect(getParagraphVariance("")).toBe(0);
		expect(getParagraphVariance("Paragraph one.")).toBe(0);
		// Paragraph 1: 2 sentences. Paragraph 2: 4 sentences.
		// Mean = 3. Variance = ((2-3)^2 + (4-3)^2)/2 = 1.
		const text = "S1. S2.\n\nS3. S4. S5. S6.";
		expect(getParagraphVariance(text)).toBe(1.0);
	});

	it("should compute Average Punctuation Density", () => {
		expect(getAveragePunctuationDensity("")).toBe(0);
		expect(getAveragePunctuationDensity("a.b,c!")).toBe(3 / 6);
	});

	it("should compute N-gram Repetition", () => {
		const words = ["the", "dog", "chased", "the", "cat"];
		// Bigrams:
		// 1. the dog
		// 2. dog chased
		// 3. chased the
		// 4. the cat
		// Total bigrams = 4, unique = 4, repetition = 0
		expect(getNGramRepetition(words, 2)).toBe(0);

		const repeatedWords = ["the", "dog", "the", "dog"];
		// Bigrams:
		// 1. the dog
		// 2. dog the
		// 3. the dog
		// Total = 3, unique = 2. Repetition = 1 - 2/3 = 1/3
		expect(getNGramRepetition(repeatedWords, 2)).toBeCloseTo(1 / 3);
	});

	it("should compute Rare Word Frequency (Hapax Legomena Ratio)", () => {
		expect(getRareWordFrequency([])).toBe(0);
		// "the dog chased the cat" -> words = the (2), dog (1), chased (1), cat (1)
		// Hapax words = dog, chased, cat (3 words out of 5 total tokens)
		// Ratio = 3 / 5 = 0.6
		expect(getRareWordFrequency(["the", "dog", "chased", "the", "cat"])).toBe(0.6);
	});

	it("should compute Repeated Sentence Openings", () => {
		expect(getRepeatedSentenceOpenings([])).toBe(0);
		expect(getRepeatedSentenceOpenings(["Hello there."])).toBe(0);

		// Sentence 1: "The dog barked" -> prefix "the dog"
		// Sentence 2: "The dog slept" -> prefix "the dog"
		// Sentence 3: "A cat meowed" -> prefix "a cat"
		// Openings = ["the dog", "the dog", "a cat"]
		// Total = 3, unique = 2. Repeated ratio = (3 - 2) / 3 = 1/3
		const sentences = ["The dog barked.", "The dog slept.", "A cat meowed."];
		expect(getRepeatedSentenceOpenings(sentences)).toBeCloseTo(1 / 3);
	});
});

describe("calculateTextStatistics Integration", () => {
	it("should calculate all text statistics and return structured data", () => {
		const sampleText = `This is the first paragraph. It contains two sentences.

This is the second paragraph. It contains three sentences. This is the third sentence of this paragraph.`;

		const stats = calculateTextStatistics(sampleText);
		expect(stats.typeTokenRatio).toBeGreaterThan(0);
		expect(stats.vocabularyRichness).toBeGreaterThan(0);
		expect(stats.averageSentenceLength).toBeGreaterThan(0);
		expect(stats.sentenceLengthStdDev).toBeGreaterThan(0);
		expect(stats.stopWordRatio).toBeGreaterThan(0);
		expect(stats.averageSyllablesPerWord).toBeGreaterThan(0);
		expect(stats.fleschReadingEase).toBeLessThanOrEqual(100);
		expect(stats.fleschKincaidGrade).toBeGreaterThanOrEqual(0);
		expect(stats.characterEntropy).toBeGreaterThan(0);
		expect(stats.paragraphVariance).toBeGreaterThan(0);
		expect(stats.averagePunctuationDensity).toBeGreaterThan(0);
		expect(stats.nGramRepetition.bigram).toBeDefined();
		expect(stats.nGramRepetition.trigram).toBeDefined();
		expect(stats.rareWordFrequency).toBeGreaterThan(0);
		expect(stats.repeatedSentenceOpenings).toBeDefined();
	});
});
