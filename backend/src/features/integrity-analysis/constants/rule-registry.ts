export type RuleCategory = "Style" | "Grammar" | "Structure" | "Vocabulary";
export type RuleSeverity = "low" | "medium" | "high" | "info";

export interface RuleMetadata {
	id: string;
	name: string;
	description: string;
	severity: RuleSeverity;
	category: RuleCategory;
}

export const RULE_REGISTRY = {
	academicConnectors: {
		id: "RULE_001",
		name: "Academic Connectors",
		description:
			"Detects formal transition words and connector phrases frequently favored by AI to link thoughts academically.",
		severity: "medium",
		category: "Style",
	},
	paragraphTemplates: {
		id: "RULE_002",
		name: "Repeated Paragraph Templates",
		description:
			"Checks for paragraphs constructed with identical sentence structures and length patterns, indicating template-based AI generation.",
		severity: "medium",
		category: "Structure",
	},
	repetitiveSentenceStructures: {
		id: "RULE_003",
		name: "Repetitive Sentence Structures",
		description:
			"Identifies adjacent sentences starting with the same grammatical prefixes or word sequences.",
		severity: "medium",
		category: "Structure",
	},
	passiveVoice: {
		id: "RULE_004",
		name: "Passive Voice Usage",
		description:
			"Measures passive constructions. High passive voice density is characteristic of impersonal AI styles.",
		severity: "medium",
		category: "Grammar",
	},
	balancedParagraphLengths: {
		id: "RULE_005",
		name: "Balanced Paragraph Lengths",
		description:
			"Flags robotic uniformity where all paragraph lengths (in words) have extremely low standard deviation.",
		severity: "medium",
		category: "Structure",
	},
	perfectGrammar: {
		id: "RULE_006",
		name: "Perfect Grammar",
		description:
			"AI content typically exhibits perfect grammatical structure, lacking the typical slip-ups found in organic human drafts.",
		severity: "low",
		category: "Grammar",
	},
	spellingConsistency: {
		id: "RULE_007",
		name: "No Spelling Variation",
		description:
			"Validates spelling consistency. AI text strictly follows a single regional standard (US or UK) and completely lacks typos.",
		severity: "low",
		category: "Vocabulary",
	},
	noContractions: {
		id: "RULE_008",
		name: "No Contractions",
		description:
			"Flags texts that avoid contractions completely in favor of expanded forms, a key marker of academic/formal AI generation.",
		severity: "medium",
		category: "Style",
	},
	excessiveTransitions: {
		id: "RULE_009",
		name: "Excessive Transitions",
		description:
			"Tracks density of transitional phrases. AI texts often overuse transitions to bridge sentences artificially.",
		severity: "medium",
		category: "Style",
	},
	repetitiveAdjectives: {
		id: "RULE_010",
		name: "Repetitive Adjective Usage",
		description:
			"Detects repetition of favored buzzwords (e.g. 'crucial', 'essential', 'profound') which are highly recurrent in AI content.",
		severity: "medium",
		category: "Vocabulary",
	},
} as const;
