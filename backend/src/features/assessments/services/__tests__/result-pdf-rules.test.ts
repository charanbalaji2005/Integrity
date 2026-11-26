import { describe, expect, it } from "vitest";
import { letterGrade, resolveOutcome } from "../result-pdf";

describe("resolveOutcome (certificate outcome)", () => {
	it("never certifies a high- or critical-risk attempt, whatever the score", () => {
		expect(resolveOutcome(100, "high").label).toBe("Under Faculty Review");
		expect(resolveOutcome(99, "CRITICAL").label).toBe("Under Faculty Review");
	});

	it("notes observations for medium/moderate risk", () => {
		expect(resolveOutcome(95, "medium").label).toBe("Observations Noted");
		expect(resolveOutcome(95, "Moderate").label).toBe("Observations Noted");
	});

	it("verifies low risk from 60 upwards, and notes observations below that", () => {
		expect(resolveOutcome(60, "low").label).toBe("Integrity Verified");
		expect(resolveOutcome(59.9, "low").label).toBe("Observations Noted");
	});

	it("uses the integrity score thresholds when risk is unknown", () => {
		expect(resolveOutcome(85, null).label).toBe("Integrity Verified");
		expect(resolveOutcome(84.9, undefined).label).toBe("Observations Noted");
		expect(resolveOutcome(60, "").label).toBe("Observations Noted");
		expect(resolveOutcome(59, "").label).toBe("Under Faculty Review");
	});
});

describe("letterGrade", () => {
	it.each([
		[100, "A"],
		[90, "A"],
		[89.99, "B"],
		[80, "B"],
		[70, "C"],
		[60, "D"],
		[59.99, "F"],
		[0, "F"],
		[-5, "F"],
	])("%s%% → %s", (pct, grade) => {
		expect(letterGrade(pct)).toBe(grade);
	});
});
