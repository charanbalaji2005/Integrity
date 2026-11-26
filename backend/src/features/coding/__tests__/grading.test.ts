import { describe, expect, it } from "vitest";
import { allowedLanguagesFor } from "../languages";
import { type AiAnalysis, type GradeInput, grade, outputsMatch } from "../services/grading";
import { classify, normalizeResult } from "../services/judge0-client";
import { parseCodingConfig, starterFor } from "../services/question-config";

const ai = (over: Partial<AiAnalysis> = {}): AiAnalysis => ({
	criteria: [
		{ criterion: "Logic & approach", awarded: 1, max: 1 },
		{ criterion: "Efficiency", awarded: 1, max: 1 },
		{ criterion: "Code quality", awarded: 0, max: 1 },
	],
	logicCorrect: true,
	suspectedHardcoding: false,
	ambiguity: null,
	feedback: "ok",
	confidence: 0.95,
	...over,
});

const base: GradeInput = {
	maxMarks: 10,
	testWeightPercent: 70,
	rubric: [],
	compileStatus: "ok",
	testsPassed: 4,
	testsTotal: 4,
	hiddenTests: 3,
	ai: ai(),
	threshold: 0.7,
};

describe("output comparison", () => {
	it("ignores trailing whitespace and CRLF by default", () => {
		expect(outputsMatch("120  \r\n\r\n", "120")).toBe(true);
		expect(outputsMatch("1 2\n3", "1 2\n3\n")).toBe(true);
		expect(outputsMatch("121", "120")).toBe(false);
	});
	it("exact mode is strict, tokens mode ignores layout", () => {
		expect(outputsMatch("120\n", "120", "exact")).toBe(false);
		expect(outputsMatch("1\n2  3", "1 2 3", "tokens")).toBe(true);
	});
});

describe("grading", () => {
	it("all tests pass + rubric → tests decide 70%, AI scores the rest", () => {
		const g = grade(base);
		expect(g.testMarks).toBe(7);
		expect(g.aiMarks).toBe(2); // 2 of 3 rubric criteria, each worth 1 mark
		expect(g.suggestedMarks).toBe(9);
		expect(g.flagReasons).toEqual([]);
		expect(g.confidence).toBeGreaterThanOrEqual(0.7);
	});

	it("AI cannot award more than the faculty max for a criterion", () => {
		const g = grade({
			...base,
			ai: ai({ criteria: [{ criterion: "Logic & approach", awarded: 50, max: 1 }] }),
		});
		expect(g.aiMarks).toBe(1);
	});

	it("compilation error: zero test marks, rubric capped at half, not flagged just for failing to compile", () => {
		const g = grade({
			...base,
			compileStatus: "compilation_error",
			testsPassed: 0,
			ai: ai({ logicCorrect: false }),
		});
		expect(g.testMarks).toBe(0);
		expect(g.aiMarks).toBe(1); // (1+1+0) × 0.5
		expect(g.flagReasons).toEqual([]);
	});

	it("flags contradictory evidence when AI says correct but most tests fail", () => {
		const g = grade({ ...base, testsPassed: 1 });
		expect(g.flagReasons.map((f) => f.code)).toContain("contradictory_evidence");
		expect(g.confidence).toBeLessThan(0.7);
	});

	it("flags when all tests pass but AI says the algorithm is wrong", () => {
		expect(grade({ ...base, ai: ai({ logicCorrect: false }) }).flagReasons[0]!.code).toBe(
			"contradictory_evidence",
		);
	});

	it("flags suspected hard-coded output and ambiguous questions", () => {
		expect(
			grade({ ...base, ai: ai({ suspectedHardcoding: true }) }).flagReasons.map((f) => f.code),
		).toContain("suspected_hardcoding");
		expect(
			grade({ ...base, ai: ai({ ambiguity: "Input format unspecified" }) }).flagReasons.map(
				(f) => f.code,
			),
		).toContain("ambiguous_question");
	});

	it("no test cases → cannot verify correctness → flagged", () => {
		const g = grade({ ...base, testsPassed: 0, testsTotal: 0, hiddenTests: 0 });
		expect(g.testMarks).toBeNull();
		expect(g.flagReasons[0]!.code).toBe("no_test_cases");
	});

	it("AI unavailable → tests-only marks, flagged, never invented rubric marks", () => {
		const g = grade({ ...base, ai: null });
		expect(g.aiMarks).toBeNull();
		expect(g.suggestedMarks).toBe(7);
		expect(g.flagReasons.map((f) => f.code)).toContain("ai_unavailable");
	});

	it("low AI self-confidence alone drops below threshold → low_confidence flag", () => {
		const g = grade({ ...base, ai: ai({ confidence: 0.2 }) });
		expect(g.flagReasons[0]!.code).toBe("low_confidence");
	});

	it("100% test weight ignores AI scores entirely", () => {
		const g = grade({
			...base,
			testWeightPercent: 100,
			testsPassed: 2,
			testsTotal: 4,
			ai: ai({ logicCorrect: null }),
		});
		expect(g.suggestedMarks).toBe(5);
	});

	it("custom rubric weights are respected", () => {
		const g = grade({
			...base,
			rubric: [
				{ criterion: "Logic & approach", marks: 3 },
				{ criterion: "Efficiency", marks: 1 },
			],
			ai: ai({
				criteria: [
					{ criterion: "Logic & approach", awarded: 3, max: 3 },
					{ criterion: "Efficiency", awarded: 0, max: 1 },
				],
			}),
		});
		expect(g.aiMarks).toBe(2.25); // 3 marks × 3/4
	});
});

describe("judge0 status mapping", () => {
	it("maps statuses to verdicts", () => {
		expect(classify(1, "", null, 262144, "cpp")).toBeNull();
		expect(classify(3, "", 1000, 262144, "cpp")).toBe("accepted");
		expect(classify(5, "", 1000, 262144, "cpp")).toBe("time_limit");
		expect(classify(6, "", null, 262144, "cpp")).toBe("compilation_error");
		expect(classify(11, "", 1000, 262144, "java")).toBe("runtime_error");
		expect(classify(13, "", null, 262144, "c")).toBe("infra_error");
	});
	it("python syntax errors count as compile errors; OOM counts as memory limit", () => {
		expect(
			classify(11, '  File "main.py", line 2\nSyntaxError: invalid syntax', 1000, 262144, "python"),
		).toBe("compilation_error");
		expect(classify(11, "java.lang.OutOfMemoryError", 1000, 262144, "java")).toBe("memory_limit");
	});
	it("decodes base64 output", () => {
		const r = normalizeResult(
			{
				token: "t",
				status: { id: 3, description: "Accepted" },
				stdout: Buffer.from("120\n").toString("base64"),
				time: "0.012",
				memory: 3200,
			},
			"cpp",
			256,
		);
		expect(r.stdout).toBe("120\n");
		expect(r.timeMs).toBe(12);
		expect(r.verdict).toBe("accepted");
	});
});

describe("question config", () => {
	it("defaults to all four languages with the faculty language first", () => {
		expect(allowedLanguagesFor({ language: "java" })).toEqual(["java", "c", "cpp", "python"]);
		expect(
			allowedLanguagesFor({ language: "javascript", allowedLanguages: ["python", "go"] }),
		).toEqual(["python"]);
	});
	it("parses limits safely and uses faculty starter only for their language", () => {
		const c = parseCodingConfig(
			JSON.stringify({
				language: "cpp",
				starterCode: "// mine",
				timeLimitMs: 999999,
				testCases: [{ input: "5", output: "120" }],
			}),
		);
		expect(c.timeLimitMs).toBe(10000);
		expect(c.testCases[0]!.hidden).toBe(true);
		expect(starterFor(c, "cpp")).toBe("// mine");
		expect(starterFor(c, "python")).toContain("def main");
	});
});
