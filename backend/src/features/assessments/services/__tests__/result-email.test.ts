import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildResultEmail } from "../result-email";
import { buildResultPdf } from "../result-pdf";

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
		expect(r.attachmentName).toBe("IntegrityOS-Results-Certificate-IOS-AB12-123456.pdf");
		expect(r.html).toContain("attached as a PDF");
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

	});

	it("never certifies a high-risk attempt as verified", () => {
		const r = buildResultEmail({ ...base, attempt: { ...base.attempt, integrityScore: 95, riskLevel: "high" }, questions: [] });
		expect(r.html).toContain("Under Faculty Review");
		expect(r.html).not.toContain("Integrity Verified");
	});
});

describe("buildResultPdf", () => {
	const input = {
		studentName: "Asha Rao",
		rollNumber: "AP23110010001",
		assessment: { ...base.assessment },
		attempt: base.attempt,
		questions: [
			{ order: 0, type: "multiple-choice", points: 2, awarded: 2, underReview: false },
			{ order: 1, type: "coding", points: 6, awarded: null, underReview: true },
		],
	};

	it("produces a 2-page PDF (certificate + results)", async () => {
		const bytes = await buildResultPdf(input);
		expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");
		const doc = await PDFDocument.load(bytes);
		expect(doc.getPageCount()).toBe(2);
		const [cert, results] = doc.getPages();
		expect(cert.getWidth()).toBeGreaterThan(cert.getHeight()); // landscape certificate
		expect(results.getHeight()).toBeGreaterThan(results.getWidth()); // portrait results
		expect(doc.getTitle()).toContain("Asha Rao");
	});

	it("handles names outside the Latin alphabet and long question lists", async () => {
		const many = Array.from({ length: 70 }, (_, i) => ({ order: i, type: "descriptive", points: 1, awarded: 1, underReview: false }));
		const bytes = await buildResultPdf({ ...input, studentName: "చరణ్ బాలాజీ Neelampalli", questions: many });
		const doc = await PDFDocument.load(bytes);
		expect(doc.getPageCount()).toBeGreaterThanOrEqual(3); // results continue on another page
	});
});
