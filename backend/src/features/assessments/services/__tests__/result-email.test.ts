import { describe, expect, it } from "vitest";
import { buildResultEmail } from "../result-email";

const base = {
	studentName: "Asha <Rao>",
	assessment: { title: "OS Midterm", institutionName: "SRM University AP", facultyName: "Dr. Iyer", passingMarks: 6, totalMarks: null, gradingScheme: "points" },
	attempt: { submittedAt: new Date("2026-11-18T10:00:00Z"), integrityScore: 92.4, riskLevel: "low", certificateNumber: "IOS-AB12-123456", verificationCode: "XK29QZ7P" },
	portalUrl: "https://integrity.example.edu",
};

describe("buildResultEmail", () => {
	it("summarises score, pass status, integrity and certificate", () => {
		const r = buildResultEmail({
			...base,
			questions: [
				{ order: 0, type: "multiple-choice", points: 2, awarded: 2, underReview: false },
				{ order: 1, type: "descriptive", points: 6, awarded: 4.5, underReview: false },
			],
		});
		expect(r.subject).toBe("Your results & certificate — OS Midterm");
		expect(r.html).toContain("6.5");
		expect(r.html).toContain("Passed");
		expect(r.html).toContain("Integrity Verified");
		expect(r.html).toContain("IOS-AB12-123456");
		expect(r.text).toContain("Score: 6.5 / 8 (81%) — Passed");
		expect(r.certificateFile).toBe("IntegrityOS-Certificate-IOS-AB12-123456.html");
		expect(r.certificateHtml).toContain("Certificate of Completion");
		expect(r.certificateHtml).not.toContain("PROVISIONAL</div>");
		expect(r.certificateHtml).not.toContain("window.print(); }, 250");
	});

	it("escapes names and flags answers still under review", () => {
		const r = buildResultEmail({
			...base,
			questions: [
				{ order: 0, type: "multiple-choice", points: 2, awarded: 0, underReview: false },
				{ order: 1, type: "descriptive", points: 6, awarded: null, underReview: true },
			],
		});
		expect(r.html).not.toContain("<Rao>");
		expect(r.html).toContain("Asha &lt;Rao&gt;".split(" ")[0]);
		expect(r.html).toContain("1 answer is still under faculty review");
		expect(r.html).toContain("Below pass mark");
		expect(r.certificateHtml).toContain('class="provisional">PROVISIONAL');
	});

	it("never certifies a high-risk attempt as verified", () => {
		const r = buildResultEmail({ ...base, attempt: { ...base.attempt, integrityScore: 95, riskLevel: "high" }, questions: [] });
		expect(r.html).toContain("Under Faculty Review");
		expect(r.html).not.toContain("Integrity Verified");
	});
});
