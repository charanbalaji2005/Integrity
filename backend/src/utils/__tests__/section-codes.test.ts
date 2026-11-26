import { describe, expect, it } from "vitest";
import {
	canonicalSection,
	canonicalSectionList,
	departmentPrefix,
	resolveStudentSection,
} from "../section-codes";

describe("section codes", () => {
	it("maps department codes and full names to prefixes", () => {
		expect(departmentPrefix("CSE")).toBe("CSE");
		expect(departmentPrefix("Computer Science & Engineering")).toBe("CSE");
		expect(departmentPrefix("electronics & communications")).toBe("ECE");
		expect(departmentPrefix("Biology")).toBeNull();
	});

	it("keeps canonical codes and fixes common spellings", () => {
		expect(canonicalSection("CSE-A")).toBe("CSE-A");
		expect(canonicalSection(" cse-b ")).toBe("CSE-B");
		expect(canonicalSection("CSE A")).toBe("CSE-A");
		expect(canonicalSection("ece_c")).toBe("ECE-C");
		expect(canonicalSection("CSEA")).toBe("CSE-A");
	});

	it("resolves a bare letter from the department", () => {
		expect(canonicalSection("A", "CSE")).toBe("CSE-A");
		expect(canonicalSection("b", "Mechanical Engineering")).toBe("MEC-B");
		expect(canonicalSection("A", null)).toBeNull();
		expect(canonicalSection("A", "Biology")).toBeNull();
	});

	it("student save: empty → null, unresolvable → 400", () => {
		expect(resolveStudentSection("", "CSE")).toBeNull();
		expect(resolveStudentSection(undefined, "CSE")).toBeNull();
		expect(resolveStudentSection("A", "CSE")).toBe("CSE-A");
		expect(() => resolveStudentSection("Section 9", "CSE")).toThrow(/CSE-A/);
	});

	it("faculty lists resolve each entry", () => {
		expect(canonicalSectionList("A, CSE-B", "CSE")).toEqual(["CSE-A", "CSE-B"]);
		expect(canonicalSectionList(["a"], "ECE")).toEqual(["ECE-A"]);
	});
});
