export interface TextStatistics {
	typeTokenRatio: number;
	vocabularyRichness: number;
	averageSentenceLength: number;
	sentenceLengthStdDev: number;
	wordFrequencyDistribution: Record<string, number>;
	stopWordRatio: number;
	averageSyllablesPerWord: number;
	fleschReadingEase: number;
	fleschKincaidGrade: number;
	characterEntropy: number;
	paragraphVariance: number;
	averagePunctuationDensity: number;
	nGramRepetition: {
		bigram: number;
		trigram: number;
	};
	rareWordFrequency: number;
	repeatedSentenceOpenings: number;
}

const ENGLISH_STOP_WORDS = new Set([
	"i",
	"me",
	"my",
	"myself",
	"we",
	"our",
	"ours",
	"ourselves",
	"you",
	"your",
	"yours",
	"yourself",
	"yourselves",
	"he",
	"him",
	"his",
	"himself",
	"she",
	"her",
	"hers",
	"herself",
	"it",
	"its",
	"itself",
	"they",
	"them",
	"their",
	"theirs",
	"themselves",
	"what",
	"which",
	"who",
	"whom",
	"this",
	"that",
	"these",
	"those",
	"am",
	"is",
	"are",
	"was",
	"were",
	"be",
	"been",
	"being",
	"have",
	"has",
	"had",
	"having",
	"do",
	"does",
	"did",
	"doing",
	"a",
	"an",
	"the",
	"and",
	"but",
	"if",
	"or",
	"because",
	"as",
	"until",
	"while",
	"of",
	"at",
	"by",
	"for",
	"with",
	"about",
	"against",
	"between",
	"into",
	"through",
	"during",
	"before",
	"after",
	"above",
	"below",
	"to",
	"from",
	"up",
	"down",
	"in",
	"out",
	"on",
	"off",
	"over",
	"under",
	"again",
	"further",
	"then",
	"once",
	"here",
	"there",
	"when",
	"where",
	"why",
	"how",
	"all",
	"any",
	"both",
	"each",
	"few",
	"more",
	"most",
	"other",
	"some",
	"such",
	"no",
	"nor",
	"not",
	"only",
	"own",
	"same",
	"so",
	"than",
	"too",
	"very",
	"s",
	"t",
	"can",
	"will",
	"just",
	"don",
	"should",
	"now",
]);

/**
 * Splits text into sentences.
 */
export function splitIntoSentences(text: string): string[] {
	if (!text || text.trim() === "") return [];
	const cleaned = text.replace(/\s+/g, " ");
	const sentences = cleaned.split(/(?<=[.!?])\s+/);
	return sentences.map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Tokenizes text into lowercase words, keeping only alphanumeric chars, apostrophes, and hyphens.
 */
export function tokenizeWords(text: string): string[] {
	if (!text || text.trim() === "") return [];
	return text
		.toLowerCase()
		.replace(/[^a-z0-9'\s-]/g, "")
		.split(/\s+/)
		.filter((w) => w.length > 0);
}

/**
 * 1. Type Token Ratio (TTR)
 */
export function getTypeTokenRatio(words: string[]): number {
	if (words.length === 0) return 0;
	const uniqueWords = new Set(words);
	return uniqueWords.size / words.length;
}

/**
 * 2. Vocabulary Richness (Simpson's Diversity Index)
 */
export function getVocabularyRichness(words: string[]): number {
	const totalWords = words.length;
	if (totalWords <= 1) return 0;

	const counts: Record<string, number> = {};
	for (const word of words) {
		counts[word] = (counts[word] || 0) + 1;
	}

	let sum = 0;
	for (const count of Object.values(counts)) {
		sum += count * (count - 1);
	}

	const simpsonIndex = sum / (totalWords * (totalWords - 1));
	return 1 - simpsonIndex;
}

/**
 * 3. Average Sentence Length
 */
export function getAverageSentenceLength(sentences: string[]): number {
	if (sentences.length === 0) return 0;
	let totalWords = 0;
	for (const sentence of sentences) {
		totalWords += tokenizeWords(sentence).length;
	}
	return totalWords / sentences.length;
}

/**
 * 4. Sentence Length Standard Deviation
 */
export function getSentenceLengthStdDev(sentences: string[]): number {
	if (sentences.length <= 1) return 0;
	const counts = sentences.map((s) => tokenizeWords(s).length);
	const totalWords = counts.reduce((sum, count) => sum + count, 0);
	const mean = totalWords / sentences.length;

	const squaredDiffsSum = counts.reduce((sum, count) => sum + (count - mean) ** 2, 0);
	const variance = squaredDiffsSum / sentences.length;
	return Math.sqrt(variance);
}

/**
 * 5. Word Frequency Distribution
 */
export function getWordFrequencyDistribution(words: string[]): Record<string, number> {
	const distribution: Record<string, number> = {};
	for (const word of words) {
		distribution[word] = (distribution[word] || 0) + 1;
	}
	return distribution;
}

/**
 * 6. Stop-word Ratio
 */
export function getStopWordRatio(words: string[]): number {
	if (words.length === 0) return 0;
	let stopWordCount = 0;
	for (const word of words) {
		if (ENGLISH_STOP_WORDS.has(word)) {
			stopWordCount++;
		}
	}
	return stopWordCount / words.length;
}

/**
 * Counts syllables in a word using a standard English heuristic.
 */
export function countSyllables(word: string): number {
	const cleaned = word.toLowerCase().replace(/[^a-z]/g, "");
	if (cleaned.length === 0) return 0;
	if (cleaned.length <= 3) return 1;

	const vowelRuns = cleaned.match(/[aeiouy]+/g);
	let count = vowelRuns ? vowelRuns.length : 0;

	if (cleaned.endsWith("e")) {
		const beforeE = cleaned.slice(-3);
		const isSyllabicL = /[^aeiouy]le$/.test(beforeE);
		if (!isSyllabicL) {
			count--;
		}
	}

	if (cleaned.endsWith("es") || cleaned.endsWith("ed")) {
		const ending = cleaned.slice(-2);
		const rootChar = cleaned.charAt(cleaned.length - 3);

		if (ending === "ed" && rootChar !== "t" && rootChar !== "d") {
			count--;
		}
		if (ending === "es") {
			const isSeparateSyllable = /[sxz]|ch|sh/.test(cleaned.slice(-4, -2));
			if (!isSeparateSyllable) {
				count--;
			}
		}
	}

	return Math.max(1, count);
}

/**
 * 7. Average Syllables per Word
 */
export function getAverageSyllablesPerWord(words: string[]): number {
	if (words.length === 0) return 0;
	let totalSyllables = 0;
	for (const word of words) {
		totalSyllables += countSyllables(word);
	}
	return totalSyllables / words.length;
}

/**
 * 8. Flesch Reading Ease
 */
export function getFleschReadingEase(asl: number, asw: number): number {
	if (asl === 0 || asw === 0) return 100;
	const score = 206.835 - 1.015 * asl - 84.6 * asw;
	return Math.round(score * 100) / 100;
}

/**
 * 9. Flesch-Kincaid Grade
 */
export function getFleschKincaidGrade(asl: number, asw: number): number {
	if (asl === 0 || asw === 0) return 0;
	const score = 0.39 * asl + 11.8 * asw - 15.59;
	return Math.round(score * 100) / 100;
}

/**
 * 10. Character Entropy (Shannon Entropy of chars)
 */
export function getCharacterEntropy(text: string): number {
	if (text.length === 0) return 0;
	const counts: Record<string, number> = {};
	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		counts[char] = (counts[char] || 0) + 1;
	}

	let entropy = 0;
	const totalChars = text.length;
	for (const count of Object.values(counts)) {
		const p = count / totalChars;
		entropy -= p * Math.log2(p);
	}
	return Math.round(entropy * 10000) / 10000;
}

/**
 * 11. Paragraph Variance (variance of sentence counts across paragraphs)
 */
export function getParagraphVariance(text: string): number {
	const paragraphs = text
		.split(/\n\s*\n/)
		.map((p) => p.trim())
		.filter((p) => p.length > 0);

	if (paragraphs.length <= 1) return 0;

	const sentenceCounts = paragraphs.map((p) => splitIntoSentences(p).length);
	const totalSentences = sentenceCounts.reduce((sum, c) => sum + c, 0);
	const mean = totalSentences / paragraphs.length;

	const squaredDiffsSum = sentenceCounts.reduce((sum, c) => sum + (c - mean) ** 2, 0);
	const variance = squaredDiffsSum / paragraphs.length;
	return Math.round(variance * 100) / 100;
}

/**
 * 12. Average Punctuation Density
 */
export function getAveragePunctuationDensity(text: string): number {
	if (text.length === 0) return 0;
	const matches = text.match(/[.,/#!$%^&*;:{}=\-_`~()?"'[\]]/g);
	const punctuationCount = matches ? matches.length : 0;
	return punctuationCount / text.length;
}

/**
 * 13. N-gram Repetition Helper
 */
export function getNGramRepetition(words: string[], n: number): number {
	if (words.length < n) return 0;
	const nGrams: string[] = [];
	for (let i = 0; i <= words.length - n; i++) {
		const nGram = words.slice(i, i + n).join(" ");
		nGrams.push(nGram);
	}
	const uniqueNGrams = new Set(nGrams);
	return 1 - uniqueNGrams.size / nGrams.length;
}

/**
 * 14. Rare Word Frequency (Hapax Legomena Ratio)
 */
export function getRareWordFrequency(words: string[]): number {
	if (words.length === 0) return 0;
	const counts: Record<string, number> = {};
	for (const word of words) {
		counts[word] = (counts[word] || 0) + 1;
	}
	let hapaxCount = 0;
	for (const count of Object.values(counts)) {
		if (count === 1) {
			hapaxCount++;
		}
	}
	return hapaxCount / words.length;
}

/**
 * 15. Repeated Sentence Openings
 */
export function getRepeatedSentenceOpenings(sentences: string[]): number {
	if (sentences.length <= 1) return 0;
	const openings: string[] = [];

	for (const sentence of sentences) {
		const words = tokenizeWords(sentence);
		if (words.length > 0) {
			const opening = words.slice(0, 2).join(" ");
			openings.push(opening);
		}
	}

	if (openings.length <= 1) return 0;

	const uniqueOpenings = new Set(openings);
	return (openings.length - uniqueOpenings.size) / openings.length;
}

/**
 * Computes all statistical metrics for the given text.
 */
export function calculateTextStatistics(text: string): TextStatistics {
	const sentences = splitIntoSentences(text);
	const words = tokenizeWords(text);

	const typeTokenRatio = getTypeTokenRatio(words);
	const vocabularyRichness = getVocabularyRichness(words);
	const averageSentenceLength = getAverageSentenceLength(sentences);
	const sentenceLengthStdDev = getSentenceLengthStdDev(sentences);
	const wordFrequencyDistribution = getWordFrequencyDistribution(words);
	const stopWordRatio = getStopWordRatio(words);
	const averageSyllablesPerWord = getAverageSyllablesPerWord(words);

	const fleschReadingEase = getFleschReadingEase(averageSentenceLength, averageSyllablesPerWord);
	const fleschKincaidGrade = getFleschKincaidGrade(averageSentenceLength, averageSyllablesPerWord);

	const characterEntropy = getCharacterEntropy(text);
	const paragraphVariance = getParagraphVariance(text);
	const averagePunctuationDensity = getAveragePunctuationDensity(text);

	const bigramRepetition = getNGramRepetition(words, 2);
	const trigramRepetition = getNGramRepetition(words, 3);

	const rareWordFrequency = getRareWordFrequency(words);
	const repeatedSentenceOpenings = getRepeatedSentenceOpenings(sentences);

	return {
		typeTokenRatio,
		vocabularyRichness,
		averageSentenceLength,
		sentenceLengthStdDev,
		wordFrequencyDistribution,
		stopWordRatio,
		averageSyllablesPerWord,
		fleschReadingEase,
		fleschKincaidGrade,
		characterEntropy,
		paragraphVariance,
		averagePunctuationDensity,
		nGramRepetition: {
			bigram: bigramRepetition,
			trigram: trigramRepetition,
		},
		rareWordFrequency,
		repeatedSentenceOpenings,
	};
}
