/**
 * Statistical analysis and scoring triggers thresholds.
 */
export const STATS_THRESHOLDS = {
	/** AI texts have extremely low sentence length variance */
	sentenceLengthStdDev: 5.0,

	/** AI paragraphs are constructed uniformly (low variance of sentence counts) */
	paragraphVariance: 1.0,

	/** AI has lower vocabulary richness (tends to use standard words) */
	vocabularyRichness: 0.85,

	/** AI has lower Type Token Ratio (more repetitive vocabulary) */
	typeTokenRatio: 0.5,

	/** AI tends to have high bigram repetition */
	bigramRepetition: 0.12,

	/** AI has lower rare word frequency (fewer Hapax Legomena) */
	rareWordFrequency: 0.45,

	/** AI character variety representation boundary */
	characterEntropy: 4.0,

	/** Boundary ratio of repeated sentence starts */
	repeatedSentenceOpenings: 0.2,
} as const;

/**
 * Heuristics rule engine classification thresholds.
 */
export const RULE_THRESHOLDS = {
	/** Counts of academic connectors matching severities */
	academicConnectors: {
		medium: 3,
		low: 1,
	},

	/** Adjacent sentences with matching starting phrases counts */
	repetitiveSentenceStructures: {
		medium: 3,
		low: 1,
	},

	/** Passive sentence counts relative density threshold */
	passiveVoice: {
		mediumDensity: 0.3,
		lowDensity: 0.15,
	},

	/** Paragraph length balance parameters */
	balancedParagraphLengths: {
		maxStdDev: 15.0,
		maxCv: 0.2,
		minParagraphs: 3,
	},

	/** Minimum words requirement before scanning for grammar quality */
	perfectGrammar: {
		minWords: 100,
	},

	/** Minimum words requirement before scanning spelling dialect standard check */
	spellingConsistency: {
		minWords: 100,
	},

	/** Minimum full form expressions usage triggers contraction absence rule */
	noContractions: {
		minFullForms: 2,
	},

	/** Density of transition words initiating sentences */
	excessiveTransitions: {
		mediumDensity: 0.3,
		lowDensity: 0.15,
	},

	/** Common AI adjectives repetition counts */
	repetitiveAdjectives: {
		medium: 3,
		low: 1,
	},
} as const;
