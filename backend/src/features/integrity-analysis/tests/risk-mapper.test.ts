import { describe, expect, it } from "vitest";
import { mapIntegrityRisk } from "../utils/risk-mapper";

describe("Risk Mapper Module", () => {
	it("should map scores to correct risk levels and actions", () => {
		// Very Low
		const rl1 = mapIntegrityRisk(10);
		expect(rl1.riskLevel).toBe("Very Low");
		expect(rl1.action).toBe("No action");
		expect(rl1.range).toBe("0–20");

		// Low
		const rl2 = mapIntegrityRisk(30);
		expect(rl2.riskLevel).toBe("Low");
		expect(rl2.action).toBe("Store result");
		expect(rl2.range).toBe("21–40");

		// Medium
		const rl3 = mapIntegrityRisk(50);
		expect(rl3.riskLevel).toBe("Medium");
		expect(rl3.action).toBe("Flag for review if combined with other signals");
		expect(rl3.range).toBe("41–60");

		// High
		const rl4 = mapIntegrityRisk(75);
		expect(rl4.riskLevel).toBe("High");
		expect(rl4.action).toBe("Recommend faculty review");
		expect(rl4.range).toBe("61–80");

		// Critical
		const rl5 = mapIntegrityRisk(95);
		expect(rl5.riskLevel).toBe("Critical");
		expect(rl5.action).toBe("Strong recommendation for manual review");
		expect(rl5.range).toBe("81–100");
	});

	it("should clamp values correctly", () => {
		const tooLow = mapIntegrityRisk(-50);
		expect(tooLow.clampedScore).toBe(0);
		expect(tooLow.riskLevel).toBe("Very Low");

		const tooHigh = mapIntegrityRisk(150);
		expect(tooHigh.clampedScore).toBe(100);
		expect(tooHigh.riskLevel).toBe("Critical");
	});
});
