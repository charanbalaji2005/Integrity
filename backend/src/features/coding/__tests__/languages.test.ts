import { describe, expect, it } from "vitest";
import { allowedLanguagesFor, CODE_LANGUAGES, isCodeLanguage, LANGUAGE_SPECS } from "../languages";

describe("isCodeLanguage", () => {
	it("accepts exactly the four supported languages", () => {
		for (const l of ["c", "cpp", "java", "python"]) expect(isCodeLanguage(l)).toBe(true);
	});

	it("rejects other values, casing variants and non-strings", () => {
		for (const v of ["C", "Python", "javascript", "", " c", null, undefined, 42, {}])
			expect(isCodeLanguage(v)).toBe(false);
	});
});

describe("allowedLanguagesFor", () => {
	it("defaults to all four languages", () => {
		expect(allowedLanguagesFor({})).toEqual([...CODE_LANGUAGES]);
	});

	it("puts the faculty's primary language first", () => {
		expect(allowedLanguagesFor({ language: "python" })[0]).toBe("python");
		expect(allowedLanguagesFor({ language: "python" })).toHaveLength(4);
	});

	it("respects an explicit allow-list and drops unknown entries", () => {
		expect(allowedLanguagesFor({ allowedLanguages: ["java", "rust", "c"] })).toEqual(["java", "c"]);
	});

	it("ignores a primary language that is not in the allow-list", () => {
		expect(allowedLanguagesFor({ language: "python", allowedLanguages: ["c", "cpp"] })).toEqual([
			"c",
			"cpp",
		]);
	});

	it("falls back to all languages when the allow-list has nothing valid", () => {
		expect(allowedLanguagesFor({ allowedLanguages: ["go"] })).toEqual([...CODE_LANGUAGES]);
	});
});

describe("LANGUAGE_SPECS", () => {
	it("gives every language a file name, Monaco id and a non-empty starter template", () => {
		for (const k of CODE_LANGUAGES) {
			const s = LANGUAGE_SPECS[k];
			expect(s.key).toBe(k);
			expect(s.fileName).toMatch(/\.(c|cpp|java|py)$/);
			expect(s.template.trim().length).toBeGreaterThan(0);
		}
	});

	it("requires the Java class to be named Main to match its file name", () => {
		expect(LANGUAGE_SPECS.java.fileName).toBe("Main.java");
		expect(LANGUAGE_SPECS.java.template).toContain("public class Main");
	});
});
