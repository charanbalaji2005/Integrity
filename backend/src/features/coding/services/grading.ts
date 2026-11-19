/**
 * Pure grading rules for coding answers. Test-case execution is the primary
 * correctness evidence; the AI only scores the faculty rubric criteria that
 * tests cannot measure (logic, efficiency, quality), within faculty-set marks.
 * Confidence is derived from the evidence, and uncertain results are flagged.
 */

export type OutputMatch = "trim" | "exact" | "tokens";

export function normalizeOutput(s: string, mode: OutputMatch): string {
	const unix = s.replace(/\r\n?/g, "\n");
	if (mode === "exact") return unix;
	if (mode === "tokens") return unix.split(/\s+/).filter(Boolean).join(" ");
	const lines = unix.split("\n").map((l) => l.replace(/[ \t]+$/, ""));
	while (lines.length && lines[lines.length - 1] === "") lines.pop();
	return lines.join("\n");
}

export function outputsMatch(actual: string, expected: string, mode: OutputMatch = "trim"): boolean {
	return normalizeOutput(actual, mode) === normalizeOutput(expected, mode);
}

export interface RubricCriterion {
	criterion: string;
	/** Relative weight within the non-test share of the marks. */
	marks: number;
	description?: string;
}

export const DEFAULT_TEST_WEIGHT = 70;
export const DEFAULT_RUBRIC: RubricCriterion[] = [
	{ criterion: "Logic & approach", marks: 1, description: "Algorithm is correct in principle and handles edge cases." },
	{ criterion: "Efficiency", marks: 1, description: "Time/space complexity appropriate for the constraints." },
	{ criterion: "Code quality", marks: 1, description: "Readable, well-structured, sensible names, no dead code." },
];

export interface AiCriterionScore {
	criterion: string;
	awarded: number;
	max: number;
	reason?: string;
}

export interface AiAnalysis {
	criteria: AiCriterionScore[];
	/** Model's judgement of whether the algorithm is correct, independent of tests. */
	logicCorrect: boolean | null;
	suspectedHardcoding: boolean;
	/** Non-empty when the question/rubric is unclear enough to need a human. */
	ambiguity: string | null;
	feedback: string;
	/** Model self-reported confidence 0–1. */
	confidence: number;
}

export interface GradeInput {
	maxMarks: number;
	testWeightPercent: number;
	rubric: RubricCriterion[];
	compileStatus: "ok" | "compilation_error";
	testsPassed: number;
	testsTotal: number;
	hiddenTests: number;
	ai: AiAnalysis | null;
	threshold: number;
}

export interface BreakdownRow {
	criterion: string;
	awarded: number;
	max: number;
	source: "tests" | "ai";
	reason?: string;
}

export interface FlagReason {
	code: "low_confidence" | "contradictory_evidence" | "no_test_cases" | "suspected_hardcoding" | "ambiguous_question" | "ai_unavailable";
	detail: string;
}

export interface GradeOutput {
	testMarks: number | null;
	aiMarks: number | null;
	suggestedMarks: number | null;
	breakdown: BreakdownRow[];
	confidence: number;
	flagReasons: FlagReason[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function grade(input: GradeInput): GradeOutput {
	const max = Math.max(0, input.maxMarks);
	const tw = clamp(input.testWeightPercent, 0, 100) / 100;
	const rubric = input.rubric.length ? input.rubric : DEFAULT_RUBRIC;
	const rubricTotal = rubric.reduce((s, r) => s + Math.max(0, r.marks), 0) || 1;
	const aiShare = max * (1 - tw);
	const testShare = max * tw;
	const breakdown: BreakdownRow[] = [];
	const flags: FlagReason[] = [];

	// ── Tests (primary evidence) ──
	let testMarks: number | null = null;
	const ratio = input.testsTotal > 0 ? input.testsPassed / input.testsTotal : 0;
	if (input.testsTotal > 0) {
		testMarks = input.compileStatus === "compilation_error" ? 0 : round2(testShare * ratio);
		breakdown.push({
			criterion: "Correctness (test cases)",
			awarded: testMarks,
			max: round2(testShare),
			source: "tests",
			reason:
				input.compileStatus === "compilation_error"
					? "Program did not compile, so no test case could pass."
					: `${input.testsPassed} of ${input.testsTotal} test cases passed.`,
		});
	} else if (testShare > 0) {
		flags.push({ code: "no_test_cases", detail: "The question has no test cases, so correctness cannot be verified automatically." });
	}

	// ── AI rubric (secondary evidence, clamped to faculty marks) ──
	let aiMarks: number | null = null;
	if (input.ai) {
		aiMarks = 0;
		for (const r of rubric) {
			const rowMax = (aiShare * Math.max(0, r.marks)) / rubricTotal;
			const found = input.ai.criteria.find((c) => c.criterion.trim().toLowerCase() === r.criterion.trim().toLowerCase());
			let fraction = found && found.max > 0 ? clamp(found.awarded / found.max, 0, 1) : 0;
			// Code that does not compile cannot earn more than half of the rubric marks.
			if (input.compileStatus === "compilation_error") fraction = Math.min(fraction, 0.5);
			const awarded = round2(rowMax * fraction);
			aiMarks += awarded;
			breakdown.push({ criterion: r.criterion, awarded, max: round2(rowMax), source: "ai", reason: found?.reason ?? (found ? undefined : "Not assessed by the AI.") });
		}
		aiMarks = round2(aiMarks);
	} else if (aiShare > 0) {
		flags.push({ code: "ai_unavailable", detail: "Vigil AI was unavailable, so rubric criteria (logic, efficiency, quality) were not scored." });
	}

	// ── Evidence checks ──
	let confidence = 0.95;
	if (input.testsTotal === 0) confidence = 0.3;
	else if (input.testsTotal < 3) confidence -= 0.15;
	if (input.testsTotal > 0 && input.hiddenTests === 0) confidence -= 0.05;

	if (input.ai) {
		const compiled = input.compileStatus === "ok";
		if (compiled && input.testsTotal > 0 && input.ai.logicCorrect === true && ratio < 0.5) {
			flags.push({ code: "contradictory_evidence", detail: `AI judged the logic correct, but only ${input.testsPassed}/${input.testsTotal} test cases passed.` });
			confidence -= 0.4;
		}
		if (compiled && input.testsTotal >= 2 && input.ai.logicCorrect === false && ratio === 1) {
			flags.push({ code: "contradictory_evidence", detail: "All test cases passed, but the AI judged the algorithm incorrect (tests may be too weak)." });
			confidence -= 0.4;
		}
		if (input.ai.suspectedHardcoding) {
			flags.push({ code: "suspected_hardcoding", detail: "The program appears to print expected outputs directly instead of computing them." });
			confidence -= 0.3;
		}
		if (input.ai.ambiguity?.trim()) {
			flags.push({ code: "ambiguous_question", detail: input.ai.ambiguity.trim().slice(0, 500) });
			confidence -= 0.25;
		}
		confidence = Math.min(confidence, 0.5 + clamp(input.ai.confidence, 0, 1) * 0.5);
	} else {
		confidence = Math.min(confidence, 0.6);
	}
	confidence = round2(clamp(confidence, 0, 1));

	if (confidence < input.threshold && flags.length === 0) {
		flags.push({ code: "low_confidence", detail: `Evaluation confidence ${Math.round(confidence * 100)}% is below the ${Math.round(input.threshold * 100)}% threshold.` });
	}

	const parts = [testMarks, aiMarks].filter((x): x is number => x != null);
	const suggestedMarks = parts.length ? round2(clamp(parts.reduce((a, b) => a + b, 0), 0, max)) : null;

	// De-duplicate reason codes (keep first detail).
	const seen = new Set<string>();
	const flagReasons = flags.filter((f) => (seen.has(f.code) ? false : (seen.add(f.code), true)));

	return { testMarks, aiMarks, suggestedMarks, breakdown, confidence, flagReasons };
}
