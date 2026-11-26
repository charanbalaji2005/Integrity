import { describe, expect, it } from "vitest";
import {
	attemptSectionWhere,
	canSeeStudentSection,
	parseSections,
	sectionMonitorRoom,
	validateFacultySections,
} from "../faculty-sections";

describe("validateFacultySections", () => {
	it("accepts 1–3 sections as an array or comma string and normalises them", () => {
		expect(validateFacultySections(["cse-a"])).toBe("CSE-A");
		expect(validateFacultySections(" cse-a , CSE-b,ece-c ")).toBe("CSE-A,CSE-B,ECE-C");
	});

	it("rejects none, more than three, duplicates and bad codes", () => {
		expect(() => validateFacultySections([])).toThrow(/at least one/);
		expect(() => validateFacultySections("")).toThrow(/at least one/);
		expect(() => validateFacultySections(["CSE-A", "CSE-B", "CSE-C", "CSE-D"])).toThrow(
			/at most 3/,
		);
		expect(() => validateFacultySections(["CSE-A", "cse-a"])).toThrow(/only be selected once/);
		expect(() => validateFacultySections(["CSE-AB"])).toThrow(/Invalid section code/);
		expect(() => validateFacultySections(["A"])).toThrow(/Invalid section code/);
	});
});

describe("section visibility", () => {
	const faculty = { role: "faculty", section: "CSE-A,CSE-C" };

	it("faculty only see students of their sections", () => {
		expect(canSeeStudentSection(faculty, "CSE-A")).toBe(true);
		expect(canSeeStudentSection(faculty, " cse-c ")).toBe(true);
		expect(canSeeStudentSection(faculty, "CSE-B")).toBe(false);
		expect(canSeeStudentSection(faculty, null)).toBe(false);
	});

	it("admins see everyone; faculty without sections see no one", () => {
		expect(canSeeStudentSection({ role: "admin", section: null }, "ECE-Z")).toBe(true);
		expect(canSeeStudentSection({ role: "faculty", section: "" }, "CSE-A")).toBe(false);
		expect(canSeeStudentSection({ role: "user", section: "CSE-A" }, "CSE-A")).toBe(false);
	});

	it("builds Prisma filters and socket rooms", () => {
		expect(attemptSectionWhere({ role: "admin" })).toEqual({});
		expect(attemptSectionWhere(faculty)).toEqual({
			student: { section: { in: ["CSE-A", "CSE-C"] } },
		});
		expect(parseSections("cse-a, CSE-A ,,ece-b")).toEqual(["CSE-A", "ECE-B"]);
		expect(sectionMonitorRoom("x1", "cse-a")).toBe("assessment-proctoring-x1::CSE-A");
	});
});

describe("all-portal default accounts", () => {
	it("are never limited by faculty section scoping", () => {
		const multi = {
			role: "faculty",
			section: "A",
			email: "CharanBalajiNeelampalli752005@gmail.com",
		};
		expect(canSeeStudentSection(multi, "ECE-Z")).toBe(true);
		expect(attemptSectionWhere(multi)).toEqual({});
		// an ordinary faculty member with the same (invalid) section still sees no one
		expect(
			canSeeStudentSection({ role: "faculty", section: "A", email: "prof@srmap.edu.in" }, "CSE-A"),
		).toBe(false);
	});
});
