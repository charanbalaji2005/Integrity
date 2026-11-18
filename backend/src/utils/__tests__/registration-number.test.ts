import { describe, expect, it } from "vitest";
import { parseRegistrationNumber } from "../registration-number";

describe("parseRegistrationNumber", () => {
	it("splits AP + batch year + 9-digit serial", () => {
		expect(parseRegistrationNumber("AP24110010895")).toEqual({
			normalized: "AP24110010895",
			valid: true,
			regCode: "AP",
			batchYear: 2024,
			serial: "110010895",
		});
	});

	it("normalises case and spacing", () => {
		expect(parseRegistrationNumber(" ap 24 110010895 ").normalized).toBe("AP24110010895");
	});

	it("keeps unrecognised numbers as stored and marks them invalid", () => {
		expect(parseRegistrationNumber("AP-MULTI-0001")).toMatchObject({
			normalized: "AP-MULTI-0001",
			valid: false,
			batchYear: null,
		});
		expect(parseRegistrationNumber("AP2411001089").valid).toBe(false); // 8-digit serial
		expect(parseRegistrationNumber(null).valid).toBe(false);
	});
});
