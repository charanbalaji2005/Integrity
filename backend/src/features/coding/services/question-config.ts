import { env } from "../../../config/env";
import { allowedLanguagesFor, type CodeLanguage, LANGUAGE_SPECS } from "../languages";
import { DEFAULT_RUBRIC, DEFAULT_TEST_WEIGHT, type OutputMatch, type RubricCriterion } from "./grading";

export interface TestCase {
	input: string;
	output: string;
	hidden: boolean;
}

export interface CodingConfig {
	language?: string;
	starterCode?: string;
	sampleInput?: string;
	sampleOutput?: string;
	testCases: TestCase[];
	timeLimitMs: number;
	memoryLimitMb: number;
	allowedLanguages: CodeLanguage[];
	testWeightPercent: number;
	rubric: RubricCriterion[];
	outputMatch: OutputMatch;
	confidenceThreshold: number;
}

export function parseCodingConfig(raw: string | null | undefined): CodingConfig {
	let c: Record<string, unknown> = {};
	try {
		c = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
	} catch {
		c = {};
	}
	const tests = Array.isArray(c.testCases) ? (c.testCases as Array<Record<string, unknown>>) : [];
	const rubric = Array.isArray(c.rubric)
		? (c.rubric as Array<Record<string, unknown>>)
				.filter((r) => typeof r.criterion === "string" && Number(r.marks) > 0)
				.map((r) => ({ criterion: String(r.criterion), marks: Number(r.marks), description: r.description ? String(r.description) : undefined }))
		: [];
	return {
		language: typeof c.language === "string" ? c.language : undefined,
		starterCode: typeof c.starterCode === "string" ? c.starterCode : undefined,
		sampleInput: typeof c.sampleInput === "string" ? c.sampleInput : undefined,
		sampleOutput: typeof c.sampleOutput === "string" ? c.sampleOutput : undefined,
		testCases: tests.map((t) => ({ input: String(t.input ?? ""), output: String(t.output ?? ""), hidden: t.hidden !== false })),
		timeLimitMs: Math.min(10000, Math.max(500, Number(c.timeLimitMs) || 2000)),
		memoryLimitMb: Math.min(512, Math.max(32, Number(c.memoryLimitMb) || 256)),
		allowedLanguages: allowedLanguagesFor({ language: c.language as string | undefined, allowedLanguages: c.allowedLanguages as string[] | undefined }),
		testWeightPercent: c.testWeightPercent != null ? Math.min(100, Math.max(0, Number(c.testWeightPercent))) : DEFAULT_TEST_WEIGHT,
		rubric: rubric.length ? rubric : DEFAULT_RUBRIC,
		outputMatch: c.outputMatch === "exact" || c.outputMatch === "tokens" ? c.outputMatch : "trim",
		confidenceThreshold: c.confidenceThreshold != null ? Math.min(1, Math.max(0, Number(c.confidenceThreshold))) : env.CODE_EVAL_CONFIDENCE_THRESHOLD,
	};
}

/** Starter code for a language: faculty starter for their language, else the template. */
export function starterFor(config: CodingConfig, language: CodeLanguage): string {
	if (config.starterCode?.trim() && config.language === language) return config.starterCode;
	return LANGUAGE_SPECS[language].template;
}
