import { RULE_REGISTRY } from "../constants/rule-registry";
import { AI_DETECTION_WEIGHTS } from "../constants/scoring-config";
import { STATS_THRESHOLDS } from "../constants/thresholds";
import type { RuleResult } from "./rules";
import type { TextStatistics } from "./statistics";

export interface EvidenceItem {
	feature: string;
	measuredValue: string | number;
	threshold: string;
	contribution: number;
	impact: "LOW" | "MEDIUM" | "HIGH";
	category: "Statistics" | "Rule Engine" | "Language" | "Structure" | "Vocabulary";
	reason: string;
	// Backward compatibility field
	value: string | number;
}

/**
 * Translates text statistics and rule engine findings into a structured evidence list.
 */
export function generateEvidence(stats: TextStatistics, rules: RuleResult[]): EvidenceItem[] {
	const evidence: EvidenceItem[] = [];

	// Normalizing factors if LLM is missing (stateless default behavior)
	const wStats = AI_DETECTION_WEIGHTS.statistics;
	const wRules = AI_DETECTION_WEIGHTS.rules;
	const totalWeight = wStats + wRules;

	const statsFinalWeight = totalWeight > 0 ? wStats / totalWeight : 0;
	const rulesFinalWeight = totalWeight > 0 ? wRules / totalWeight : 0;

	// Helper to resolve rule details from registry
	const getRuleMeta = (name: string) => {
		return Object.values(RULE_REGISTRY).find((r) => r.name === name);
	};

	// 1. Sentence Length Standard Deviation
	const slThreshold = STATS_THRESHOLDS.sentenceLengthStdDev;
	const isSlAi = stats.sentenceLengthStdDev < slThreshold;
	const slContribution = Math.round(20 * statsFinalWeight);
	evidence.push({
		feature: "Sentence Length Standard Deviation",
		measuredValue: stats.sentenceLengthStdDev.toFixed(2),
		threshold: `< ${slThreshold.toFixed(1)}`,
		contribution: isSlAi ? slContribution : -slContribution,
		impact: isSlAi ? "HIGH" : "LOW",
		category: "Statistics",
		reason: isSlAi
			? "Sentence length standard deviation is extremely low, reflecting highly uniform and robotic sentence lengths."
			: "Sentence lengths vary naturally across the text, exhibiting organic styling characteristic of human writing.",
		value: stats.sentenceLengthStdDev.toFixed(2),
	});

	// 2. Type Token Ratio (TTR)
	const ttrThreshold = STATS_THRESHOLDS.typeTokenRatio;
	const isTtrAi = stats.typeTokenRatio < ttrThreshold;
	const ttrContribution = Math.round(15 * statsFinalWeight);
	evidence.push({
		feature: "Type Token Ratio (TTR)",
		measuredValue: stats.typeTokenRatio.toFixed(3),
		threshold: `< ${ttrThreshold.toFixed(2)}`,
		contribution: isTtrAi ? ttrContribution : -ttrContribution,
		impact: isTtrAi ? "MEDIUM" : "LOW",
		category: "Vocabulary",
		reason: isTtrAi
			? "Lexical variety is low, indicating a repetitive vocabulary commonly associated with AI generated content."
			: "Lexical variety is high, showing a rich and diverse vocabulary typical of human authorship.",
		value: stats.typeTokenRatio.toFixed(3),
	});

	// 3. Character Entropy
	const entropyThreshold = STATS_THRESHOLDS.characterEntropy;
	const isEntropyAi = stats.characterEntropy < entropyThreshold;
	evidence.push({
		feature: "Character Entropy",
		measuredValue: stats.characterEntropy.toFixed(3),
		threshold: `< ${entropyThreshold.toFixed(1)}`,
		contribution: 0, // Not used directly in scoring
		impact: "LOW",
		category: "Statistics",
		reason: isEntropyAi
			? "Low character entropy indicates high repetitiveness and simpler structures."
			: "High character entropy demonstrates rich structural variety and natural character variation.",
		value: stats.characterEntropy.toFixed(3),
	});

	// 4. Paragraph Variance
	const pvThreshold = STATS_THRESHOLDS.paragraphVariance;
	const isPvAi = stats.paragraphVariance < pvThreshold;
	const pvContribution = Math.round(20 * statsFinalWeight);
	evidence.push({
		feature: "Paragraph Variance",
		measuredValue: stats.paragraphVariance.toFixed(2),
		threshold: `< ${pvThreshold.toFixed(1)}`,
		contribution: isPvAi ? pvContribution : -pvContribution,
		impact: isPvAi ? "HIGH" : "LOW",
		category: "Structure",
		reason: isPvAi
			? "Sentence count variance across paragraphs is extremely low, demonstrating unnatural structural uniformity."
			: "Paragraph lengths fluctuate naturally, indicating an organic narrative flow.",
		value: stats.paragraphVariance.toFixed(2),
	});

	// 5. Repeated Sentence Openings
	const openingsThreshold = STATS_THRESHOLDS.repeatedSentenceOpenings;
	const isOpeningsAi = stats.repeatedSentenceOpenings > openingsThreshold;
	evidence.push({
		feature: "Repeated Sentence Openings",
		measuredValue: `${(stats.repeatedSentenceOpenings * 100).toFixed(1)}%`,
		threshold: `> ${(openingsThreshold * 100).toFixed(0)}%`,
		contribution: 0, // Not used directly in scoring
		impact: isOpeningsAi ? "MEDIUM" : "LOW",
		category: "Structure",
		reason: isOpeningsAi
			? "Over 20% of sentences begin with identical word prefixes, showing structured style repetition."
			: "Sentence openings are varied and show low repetitive structural templates.",
		value: `${(stats.repeatedSentenceOpenings * 100).toFixed(1)}%`,
	});

	// 6. Transition Frequency
	const transMeta = getRuleMeta("Excessive Transitions");
	const transitionsRule = rules.find(
		(r) => r.name === (transMeta?.name || "Excessive Transitions"),
	);
	const hasTransitions = transitionsRule && transitionsRule.count > 0;
	let transContribution = 0;
	if (hasTransitions && transitionsRule) {
		const ruleScore =
			transitionsRule.severity === "medium" ? 25 : transitionsRule.severity === "low" ? 10 : 0;
		transContribution = Math.round(ruleScore * rulesFinalWeight);
	}
	evidence.push({
		feature: "Transition Frequency",
		measuredValue: hasTransitions ? `${transitionsRule.count} transitions` : "0 matches",
		threshold: "0 matches",
		contribution: transContribution,
		impact: hasTransitions && transitionsRule?.severity === "medium" ? "MEDIUM" : "LOW",
		category: "Language",
		reason:
			hasTransitions && transitionsRule
				? `Contains ${transitionsRule.count} excessive/formal transitions used to bridge arguments.`
				: "Transition words are dispersed naturally without excessive repetition.",
		value: hasTransitions ? `${transitionsRule.count} transitions` : "0 matches",
	});

	// 7. Passive Voice Count
	const passiveMeta = getRuleMeta("Passive Voice Usage");
	const passiveRule = rules.find((r) => r.name === (passiveMeta?.name || "Passive Voice Usage"));
	const hasPassive = passiveRule && passiveRule.count > 0;
	let passiveContribution = 0;
	if (hasPassive && passiveRule) {
		const ruleScore =
			passiveRule.severity === "medium" ? 25 : passiveRule.severity === "low" ? 10 : 0;
		passiveContribution = Math.round(ruleScore * rulesFinalWeight);
	}
	if (hasPassive && passiveRule) {
		evidence.push({
			feature: "Passive Voice Count",
			measuredValue: `${passiveRule.count} uses`,
			threshold: "0 uses",
			contribution: passiveContribution,
			impact: passiveRule.severity === "medium" ? "MEDIUM" : "LOW",
			category: "Language",
			reason: `Contains ${passiveRule.count} passive voice sentences, characteristic of an detached AI tone.`,
			value: `${passiveRule.count} uses`,
		});
	}

	// 8. Contractions check
	const contractionsMeta = getRuleMeta("No Contractions");
	const contractionRule = rules.find(
		(r) => r.name === (contractionsMeta?.name || "No Contractions"),
	);
	const hasNoContractions = contractionRule && contractionRule.count > 0;
	let contractionsContribution = 0;
	if (hasNoContractions && contractionRule) {
		const ruleScore =
			contractionRule.severity === "medium" ? 25 : contractionRule.severity === "low" ? 10 : 0;
		contractionsContribution = Math.round(ruleScore * rulesFinalWeight);
	}
	if (hasNoContractions && contractionRule) {
		evidence.push({
			feature: "Contraction Absence",
			measuredValue: "0 contractions",
			threshold: "> 0 contractions",
			contribution: contractionsContribution,
			impact: "MEDIUM",
			category: "Language",
			reason:
				"The submission contains 0 contractions despite formal structures, indicating a strict AI academic text template.",
			value: "0 contractions",
		});
	}

	return evidence;
}
