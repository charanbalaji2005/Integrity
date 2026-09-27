import { RULE_REGISTRY } from "../constants/rule-registry";
import { RULE_THRESHOLDS } from "../constants/thresholds";
import { splitIntoSentences, tokenizeWords } from "./statistics";

export interface RuleResult {
	name: string;
	count: number;
	severity: "low" | "medium" | "high" | "info";
	explanation: string;
	matchedExamples: string[];
}

/**
 * 1. Detect Academic Connectors
 */
export function checkAcademicConnectors(_text: string, sentences: string[]): RuleResult {
	const academicConnectors = [
		"Furthermore",
		"Moreover",
		"Overall",
		"In conclusion",
		"This highlights",
		"It is important to note",
		"It can therefore be concluded",
	];

	const matchedExamples: string[] = [];
	let count = 0;

	for (const sentence of sentences) {
		for (const connector of academicConnectors) {
			const regex = new RegExp(`\\b${connector}\\b`, "i");
			if (regex.test(sentence)) {
				count++;
				matchedExamples.push(`Found "${connector}" in: "${sentence}"`);
			}
		}
	}

	const meta = RULE_REGISTRY.academicConnectors;

	return {
		name: meta.name,
		count,
		severity:
			count >= RULE_THRESHOLDS.academicConnectors.medium
				? "medium"
				: count >= RULE_THRESHOLDS.academicConnectors.low
					? "low"
					: "info",
		explanation: meta.description,
		matchedExamples,
	};
}

/**
 * 2. Detect Repeated Paragraph Templates
 */
export function checkParagraphTemplates(text: string): RuleResult {
	const paragraphs = text
		.split(/\n\s*\n/)
		.map((p) => p.trim())
		.filter((p) => p.length > 0);

	const matchedExamples: string[] = [];
	let count = 0;

	if (paragraphs.length > 1) {
		const signatures = paragraphs.map((p, index) => {
			const sents = splitIntoSentences(p);
			const sig = sents
				.map((s) => {
					const words = tokenizeWords(s);
					// Round to nearest 3 to tolerate small edits
					return Math.round(words.length / 3) * 3;
				})
				.join("-");
			return { index, sig, text: p };
		});

		const sigGroups: Record<string, typeof signatures> = {};
		for (const item of signatures) {
			if (item.sig.length > 0) {
				sigGroups[item.sig] = sigGroups[item.sig] || [];
				sigGroups[item.sig].push(item);
			}
		}

		for (const [_sig, items] of Object.entries(sigGroups)) {
			if (items.length > 1) {
				count += items.length - 1;
				matchedExamples.push(
					`Paragraphs ${items.map((i) => i.index + 1).join(" and ")} share template signature "${_sig}"`,
				);
			}
		}
	}

	const meta = RULE_REGISTRY.paragraphTemplates;

	return {
		name: meta.name,
		count,
		severity: count > 1 ? "medium" : count > 0 ? "low" : "info",
		explanation: meta.description,
		matchedExamples,
	};
}

/**
 * 3. Detect Repetitive Sentence Structures
 */
export function checkRepetitiveSentenceStructures(sentences: string[]): RuleResult {
	const matchedExamples: string[] = [];
	let count = 0;

	for (let i = 0; i < sentences.length - 1; i++) {
		const w1 = tokenizeWords(sentences[i]);
		const w2 = tokenizeWords(sentences[i + 1]);

		if (w1.length > 1 && w2.length > 1) {
			const prefix1 = w1.slice(0, 2).join(" ");
			const prefix2 = w2.slice(0, 2).join(" ");

			if (prefix1 === prefix2) {
				count++;
				matchedExamples.push(
					`Consecutive sentences starting with "${prefix1}": [S${i + 1}: "${sentences[i]}"] [S${i + 2}: "${sentences[i + 1]}"]`,
				);
			}
		}
	}

	const meta = RULE_REGISTRY.repetitiveSentenceStructures;

	return {
		name: meta.name,
		count,
		severity:
			count >= RULE_THRESHOLDS.repetitiveSentenceStructures.medium
				? "medium"
				: count >= RULE_THRESHOLDS.repetitiveSentenceStructures.low
					? "low"
					: "info",
		explanation: meta.description,
		matchedExamples,
	};
}

/**
 * 4. Detect Excessive Passive Voice
 */
export function checkPassiveVoice(sentences: string[]): RuleResult {
	const matchedExamples: string[] = [];
	let count = 0;

	// Heuristic: form of 'to be' + (optional adverb ending in -ly) + past participle ending in -ed or irregulars
	const passiveRegex =
		/\b(am|is|are|was|were|be|been|being)\s+([a-z]+ly\s+)*(?:[a-z]+ed|done|written|given|taken|seen|known|made|shown|found|chosen|built|held|kept|run|brought|produced|described|conducted|performed|observed|analyzed|created|used|obtained|provided)\b/i;

	for (let i = 0; i < sentences.length; i++) {
		const match = sentences[i].match(passiveRegex);
		if (match) {
			count++;
			matchedExamples.push(
				`Found passive construction "${match[0]}" in sentence ${i + 1}: "${sentences[i]}"`,
			);
		}
	}

	const density = sentences.length > 0 ? count / sentences.length : 0;
	const meta = RULE_REGISTRY.passiveVoice;

	return {
		name: meta.name,
		count,
		severity:
			density > RULE_THRESHOLDS.passiveVoice.mediumDensity
				? "medium"
				: density > RULE_THRESHOLDS.passiveVoice.lowDensity
					? "low"
					: "info",
		explanation: meta.description,
		matchedExamples,
	};
}

/**
 * 5. Balanced Paragraph Lengths
 */
export function checkBalancedParagraphLengths(text: string): RuleResult {
	const paragraphs = text
		.split(/\n\s*\n/)
		.map((p) => p.trim())
		.filter((p) => p.length > 0);

	const matchedExamples: string[] = [];
	let count = 0;
	let severity: "info" | "low" | "medium" = "info";

	const { maxStdDev, maxCv, minParagraphs } = RULE_THRESHOLDS.balancedParagraphLengths;

	if (paragraphs.length >= minParagraphs) {
		const wordCounts = paragraphs.map((p) => tokenizeWords(p).length);
		const totalWords = wordCounts.reduce((sum, c) => sum + c, 0);
		const mean = totalWords / paragraphs.length;

		const variance = wordCounts.reduce((sum, c) => sum + (c - mean) ** 2, 0) / paragraphs.length;
		const stdDev = Math.sqrt(variance);
		const cv = mean > 0 ? stdDev / mean : 0;

		if (stdDev < maxStdDev && cv < maxCv) {
			count = 1;
			severity = "medium";
			matchedExamples.push(
				`Paragraph word counts are highly uniform (mean: ${Math.round(mean)}, stddev: ${stdDev.toFixed(2)}, cv: ${(cv * 100).toFixed(1)}%). Counts: [${wordCounts.join(", ")}]`,
			);
		} else {
			matchedExamples.push(
				`Paragraph lengths variance is natural (stddev: ${stdDev.toFixed(2)}, cv: ${(cv * 100).toFixed(1)}%). Counts: [${wordCounts.join(", ")}]`,
			);
		}
	}

	const meta = RULE_REGISTRY.balancedParagraphLengths;

	return {
		name: meta.name,
		count,
		severity,
		explanation: meta.description,
		matchedExamples,
	};
}

/**
 * 6. Perfect Grammar
 */
export function checkPerfectGrammar(text: string): RuleResult {
	const words = tokenizeWords(text);
	const matchedExamples: string[] = [];
	let count = 0;
	let severity: "info" | "low" | "medium" = "info";

	if (words.length >= RULE_THRESHOLDS.perfectGrammar.minWords) {
		// Common grammatical mistakes to check
		const commonErrors = [
			/\b(could|should|would)\s+of\b/i,
			/\bits\s+(a|an|the|very|so|too)\b/i, // confusion of its vs it's
			/\btheir\s+(is|are|was|were)\b/i, // confusion of their vs there
			/\b(don't|doesn't|didn't|can't|won't)\s+([a-z]+\s+)*no\b/i, // double negative
		];

		let errorCount = 0;
		for (const regex of commonErrors) {
			const match = text.match(regex);
			if (match) {
				errorCount++;
				matchedExamples.push(`Detected typical grammar error: "${match[0]}"`);
			}
		}

		if (errorCount === 0) {
			count = 1;
			severity = "low";
			matchedExamples.push(
				"Checked for common stylistic/grammatical errors and found 0 occurrences.",
			);
		}
	}

	const meta = RULE_REGISTRY.perfectGrammar;

	return {
		name: meta.name,
		count,
		severity,
		explanation: meta.description,
		matchedExamples,
	};
}

/**
 * 7. No Spelling Variation
 */
export function checkSpellingVariation(text: string): RuleResult {
	const words = tokenizeWords(text);
	const matchedExamples: string[] = [];
	let count = 0;
	let severity: "info" | "low" | "medium" = "info";

	if (words.length >= RULE_THRESHOLDS.spellingConsistency.minWords) {
		const usWords = [
			"analyze",
			"behavior",
			"color",
			"defense",
			"organize",
			"center",
			"theater",
			"neighbor",
			"flavor",
		];
		const ukWords = [
			"analyse",
			"behaviour",
			"colour",
			"defence",
			"organise",
			"centre",
			"theatre",
			"neighbour",
			"flavour",
		];

		let usCount = 0;
		let ukCount = 0;

		for (const word of words) {
			if (usWords.includes(word)) usCount++;
			if (ukWords.includes(word)) ukCount++;
		}

		// Common typos check
		const typoRegex =
			/\b(teh|recieve|seperate|untill|alot|accomodate|definately|goverment|occurr)\b/i;
		const typoMatch = text.match(typoRegex);

		const hasTypos = !!typoMatch;
		if (typoMatch) {
			matchedExamples.push(`Detected common typo: "${typoMatch[0]}"`);
		}

		// Strict consistency means only US or only UK words are used (no mixing), and no typos
		const totalRegionalWords = usCount + ukCount;
		const isConsistent = totalRegionalWords > 0 && (usCount === 0 || ukCount === 0) && !hasTypos;

		if (isConsistent) {
			count = 1;
			severity = "low";
			matchedExamples.push(
				`Strict spelling consistency verified. Regional dialect words count: US=${usCount}, UK=${ukUKCount(ukCount)}. Typos: 0.`,
			);
		}
	}

	function ukUKCount(c: number) {
		return c;
	}

	const meta = RULE_REGISTRY.spellingConsistency;

	return {
		name: meta.name,
		count,
		severity,
		explanation: meta.description,
		matchedExamples,
	};
}

/**
 * 8. No Contractions
 */
export function checkNoContractions(text: string): RuleResult {
	const matchedExamples: string[] = [];
	let count = 0;
	let severity: "info" | "low" | "medium" = "info";

	const contractionRegex =
		/\b(don't|doesn't|didn't|can't|won't|isn't|aren't|wasn't|weren't|haven't|hasn't|hadn't|it's|they're|we're|you're|he's|she's|i'm|i've|you've|we've|they've|wouldn't|couldn't|shouldn't)\b/gi;
	const fullFormRegex =
		/\b(do not|does not|did not|cannot|will not|is not|are not|was not|were not|have not|has not|had not|it is|they are|we are|you are|he is|she is|i am|i have|you have|we have|they have|would not|could not|should not)\b/gi;

	const contractions = text.match(contractionRegex) || [];
	const fullForms = text.match(fullFormRegex) || [];

	if (contractions.length === 0 && fullForms.length > RULE_THRESHOLDS.noContractions.minFullForms) {
		count = 1;
		severity = "medium";
		matchedExamples.push(
			`Text contains 0 contractions and ${fullForms.length} full-form equivalents: [${Array.from(new Set(fullForms)).slice(0, 5).join(", ")}]`,
		);
	} else if (contractions.length > 0) {
		matchedExamples.push(
			`Found ${contractions.length} contractions. Example: "${contractions[0]}"`,
		);
	}

	const meta = RULE_REGISTRY.noContractions;

	return {
		name: meta.name,
		count,
		severity,
		explanation: meta.description,
		matchedExamples,
	};
}

/**
 * 9. Excessive Transitions
 */
export function checkExcessiveTransitions(sentences: string[]): RuleResult {
	const transitions = [
		"however",
		"therefore",
		"consequently",
		"additionally",
		"moreover",
		"furthermore",
		"on the other hand",
		"in contrast",
		"as a result",
		"subsequently",
		"in addition",
		"thus",
		"hence",
		"meanwhile",
	];

	const matchedExamples: string[] = [];
	let count = 0;

	for (let i = 0; i < sentences.length; i++) {
		const s = sentences[i].trim().toLowerCase();
		const matchedTransition = transitions.find((t) => s.startsWith(t) || s.includes(`, ${t},`));
		if (matchedTransition) {
			count++;
			matchedExamples.push(
				`Sentence ${i + 1} contains transition "${matchedTransition}": "${sentences[i]}"`,
			);
		}
	}

	const density = sentences.length > 0 ? count / sentences.length : 0;
	const meta = RULE_REGISTRY.excessiveTransitions;

	return {
		name: meta.name,
		count,
		severity:
			density > RULE_THRESHOLDS.excessiveTransitions.mediumDensity
				? "medium"
				: density > RULE_THRESHOLDS.excessiveTransitions.lowDensity
					? "low"
					: "info",
		explanation: meta.description,
		matchedExamples,
	};
}

/**
 * 10. Repetitive Adjective Usage
 */
export function checkRepetitiveAdjectives(words: string[]): RuleResult {
	const targetAdjectives = [
		"crucial",
		"essential",
		"vital",
		"pivotal",
		"key",
		"transformative",
		"profound",
		"intricate",
		"beacon",
		"testament",
		"paramount",
		"indispensable",
	];

	const counts: Record<string, number> = {};
	for (const adjective of targetAdjectives) {
		counts[adjective] = 0;
	}

	for (const word of words) {
		if (counts[word] !== undefined) {
			counts[word]++;
		}
	}

	const matchedExamples: string[] = [];
	let count = 0;

	for (const [adj, cnt] of Object.entries(counts)) {
		if (cnt >= 2) {
			count += cnt;
			matchedExamples.push(`Adjective "${adj}" repeated ${cnt} times`);
		}
	}

	const meta = RULE_REGISTRY.repetitiveAdjectives;

	return {
		name: meta.name,
		count,
		severity:
			count >= RULE_THRESHOLDS.repetitiveAdjectives.medium
				? "medium"
				: count >= RULE_THRESHOLDS.repetitiveAdjectives.low
					? "low"
					: "info",
		explanation: meta.description,
		matchedExamples,
	};
}

/**
 * Runs all rules on the given text and returns the results.
 */
export function runRuleEngine(text: string): RuleResult[] {
	const sentences = splitIntoSentences(text);
	const words = tokenizeWords(text);

	return [
		checkAcademicConnectors(text, sentences),
		checkParagraphTemplates(text),
		checkRepetitiveSentenceStructures(sentences),
		checkPassiveVoice(sentences),
		checkBalancedParagraphLengths(text),
		checkPerfectGrammar(text),
		checkSpellingVariation(text),
		checkNoContractions(text),
		checkExcessiveTransitions(sentences),
		checkRepetitiveAdjectives(words),
	];
}
