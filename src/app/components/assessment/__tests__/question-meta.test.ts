import { describe, expect, it } from "vitest";
import { countBlanks, isAnswered, LANGUAGES, parseJson, typeMeta } from "../question-meta";

describe("question-meta", () => {
  it("counts fill-in blanks of three or more underscores", () => {
    expect(countBlanks("The ___ sat on the _____.")).toBe(2);
    expect(countBlanks("a __ b")).toBe(0);
  });

  it("parseJson returns fallback on bad input and passes objects through", () => {
    expect(parseJson("{bad", { a: 1 })).toEqual({ a: 1 });
    expect(parseJson("", [])).toEqual([]);
    expect(parseJson('{"x":2}', {})).toEqual({ x: 2 });
    const obj = { y: 3 };
    expect(parseJson(obj, {})).toBe(obj);
  });

  it("isAnswered treats blanks and empty selections as unanswered", () => {
    expect(isAnswered(null)).toBe(false);
    expect(isAnswered("   ")).toBe(false);
    expect(isAnswered("[]")).toBe(false);
    expect(isAnswered('["", " "]')).toBe(false);
    expect(isAnswered('["B"]')).toBe(true);
    expect(isAnswered("print(1)")).toBe(true);
  });

  it("labels the four coding languages with their real compiler versions", () => {
    const label = (v: string) => LANGUAGES.find((l) => l.value === v)?.label;
    expect(label("c")).toMatch(/GCC/);
    expect(label("cpp")).toMatch(/C\+\+17/);
    expect(label("java")).toMatch(/OpenJDK/);
    expect(label("python")).toMatch(/Python 3/);
  });

  it("typeMeta resolves known question types", () => {
    expect(typeMeta("coding")?.label).toBeTruthy();
  });
});
