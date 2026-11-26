import { describe, expect, it } from "vitest";
import { isLockExempt, MULTI_PORTAL_EMAILS } from "../multi-portal";

describe("isLockExempt", () => {
	it("exempts the default owner account (case and whitespace insensitive)", () => {
		const owner = MULTI_PORTAL_EMAILS[0] as string;
		expect(isLockExempt(owner)).toBe(true);
		expect(isLockExempt(`  ${owner.toUpperCase()} `)).toBe(true);
	});

	it("does not exempt anyone else, so lockouts still protect normal users", () => {
		expect(isLockExempt("student@example.edu")).toBe(false);
		expect(isLockExempt(`x${MULTI_PORTAL_EMAILS[0]}`)).toBe(false);
	});

	it("handles missing emails", () => {
		expect(isLockExempt(null)).toBe(false);
		expect(isLockExempt(undefined)).toBe(false);
		expect(isLockExempt("")).toBe(false);
	});
});
