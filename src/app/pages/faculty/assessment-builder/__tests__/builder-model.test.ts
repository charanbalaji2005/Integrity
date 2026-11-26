import { describe, expect, it } from "vitest";
import { isCodingLanguage, newQuestion, questionIssues, summarize, type QuestionForm } from "../builder-model";

const q = (type: Parameters<typeof newQuestion>[0], patch: Partial<QuestionForm> = {}): QuestionForm => ({
  ...newQuestion(type),
  text: "A sufficiently long question text?",
  ...patch,
});

describe("builder-model: new questions", () => {
  it("uses sensible default marks per type", () => {
    expect(newQuestion("coding").points).toBe(10);
    expect(newQuestion("descriptive").points).toBe(5);
    expect(newQuestion("short-answer").points).toBe(3);
    expect(newQuestion("multiple-choice").points).toBe(1);
  });

  it("pre-fills options for choice questions and gives unique keys", () => {
    expect(newQuestion("multiple-choice").options).toHaveLength(4);
    expect(newQuestion("true-false").options).toEqual(["True", "False"]);
    expect(newQuestion("coding").key).not.toBe(newQuestion("coding").key);
  });

  it("applies the faculty's negative-marking default", () => {
    expect(newQuestion("multiple-choice", { negativeMarks: 0.25 }).negativeMarks).toBe(0.25);
  });
});

describe("builder-model: publish validation", () => {
  it("rejects too-short text and zero marks", () => {
    const issues = questionIssues(q("descriptive", { text: "Hi", points: 0, modelAnswer: "x" }));
    expect(issues).toContain("Question text is too short.");
    expect(issues).toContain("Marks must be greater than 0.");
  });

  it("validates multiple-choice options and the correct answer", () => {
    expect(questionIssues(q("multiple-choice", { options: ["A", "a"], correct: [] }))).toEqual(
      expect.arrayContaining(["Options must be unique.", "Mark the correct option."]),
    );
    expect(questionIssues(q("multiple-choice", { options: ["A", ""], correct: ["A"] }))).toContain("Options cannot be empty.");
    expect(questionIssues(q("multiple-choice", { options: ["A", "B"], correct: ["B"] }))).toEqual([]);
  });

  it("requires True or False to be chosen", () => {
    expect(questionIssues(q("true-false", { correct: [] }))).toContain("Choose True or False.");
    expect(questionIssues(q("true-false", { correct: ["False"] }))).toEqual([]);
  });

  it("requires a blank and an answer for each blank", () => {
    expect(questionIssues(q("fill-blank", { text: "No blanks in this sentence" }))[0]).toMatch(/Add a blank/);
    expect(questionIssues(q("fill-blank", { text: "The ___ of India is ___", blanks: ["Capital"] }))[0]).toMatch(/2 blank/);
    expect(questionIssues(q("fill-blank", { text: "The ___ of India is ___", blanks: ["capital", "Delhi"] }))).toEqual([]);
  });

  it("requires a model answer for written questions", () => {
    expect(questionIssues(q("short-answer"))).toContain("Add a model answer or rubric for grading.");
  });

  it("coding: only C, C++, Java or Python, consistent allowed languages, tests or reference", () => {
    expect(questionIssues(q("coding", { language: "javascript", modelAnswer: "x" }))).toContain("Choose C, C++, Java or Python as the language.");
    expect(questionIssues(q("coding", { language: "java", allowedLanguages: ["python"], modelAnswer: "x" }))).toContain(
      "The default language must be one of the allowed languages.",
    );
    expect(questionIssues(q("coding", { language: "cpp" }))).toContain("Add a reference solution or a test case.");
    expect(questionIssues(q("coding", { language: "cpp", rubric: [], testWeightPercent: 70, modelAnswer: "x" }))).toContain(
      "Add at least one rubric criterion, or set the test weight to 100%.",
    );
    expect(
      questionIssues(q("coding", { language: "cpp", testCases: [{ input: "5", output: "120", hidden: true }] as QuestionForm["testCases"] })),
    ).toEqual([]);
  });

  it("isCodingLanguage accepts exactly the four supported languages", () => {
    expect(["c", "cpp", "java", "python"].every(isCodingLanguage)).toBe(true);
    expect(isCodingLanguage("go")).toBe(false);
  });
});

describe("builder-model: summary", () => {
  it("totals marks, counts types/difficulty and estimates time", () => {
    const s = summarize([q("coding", { difficulty: "hard" }), q("multiple-choice"), q("multiple-choice", { difficulty: "easy" })]);
    expect(s.totalQuestions).toBe(3);
    expect(s.totalMarks).toBe(12);
    expect(s.byDifficulty).toEqual({ easy: 1, medium: 1, hard: 1 });
    expect(s.byType.find((t) => t.type === "multiple-choice")?.count).toBe(2);
    expect(s.estimatedMinutes).toBeGreaterThan(0);
  });
});
