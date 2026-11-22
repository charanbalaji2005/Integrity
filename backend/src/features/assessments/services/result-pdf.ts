import { degrees, type PDFFont, type PDFPage, PDFDocument, rgb, StandardFonts } from "pdf-lib";

/**
 * Builds the student's results + completion certificate as a PDF:
 *   page 1 — landscape A4 certificate
 *   page 2 — portrait A4 results summary with the per-question breakdown
 * Uses only the standard PDF fonts, so no font files are needed at runtime.
 */

export interface ResultPdfInput {
	studentName: string;
	rollNumber?: string | null;
	assessment: {
		title: string;
		institutionName: string;
		facultyName: string;
		passingMarks: number | null;
		totalMarks: number | null;
		gradingScheme: string;
	};
	attempt: {
		submittedAt: Date | null;
		integrityScore: number;
		riskLevel: string | null;
		certificateNumber: string | null;
		verificationCode: string | null;
	};
	questions: { order: number; type: string; points: number; awarded: number | null; underReview: boolean }[];
}

type Rgb = ReturnType<typeof rgb>;
const hex = (h: string): Rgb => {
	const n = Number.parseInt(h.replace("#", ""), 16);
	return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
const INK = hex("#1c1917");
const MUTED = hex("#57534e");
const FAINT = hex("#a8a29e");
const LINE = hex("#d6d3d1");
const PAPER = hex("#fffdf9");

const OUTCOMES = {
	verified: { label: "Integrity Verified", risk: "Low risk", color: "#0f766e", tint: "#ecfdf5" },
	observations: { label: "Observations Noted", risk: "Medium risk", color: "#b45309", tint: "#fffbeb" },
	review: { label: "Under Faculty Review", risk: "High risk", color: "#b91c1c", tint: "#fef2f2" },
} as const;

/** The certificate must never claim full compliance for a flagged attempt. */
export function resolveOutcome(score: number, riskLevel?: string | null) {
	const risk = String(riskLevel || "").toLowerCase();
	if (risk.includes("high") || risk.includes("critical")) return OUTCOMES.review;
	if (risk.includes("medium") || risk.includes("moderate")) return OUTCOMES.observations;
	if (risk.includes("low")) return score >= 60 ? OUTCOMES.verified : OUTCOMES.observations;
	return score >= 85 ? OUTCOMES.verified : score >= 60 ? OUTCOMES.observations : OUTCOMES.review;
}

export function letterGrade(pct: number) {
	if (pct >= 90) return "A";
	if (pct >= 80) return "B";
	if (pct >= 70) return "C";
	if (pct >= 60) return "D";
	return "F";
}

const TYPE_LABEL: Record<string, string> = {
	"multiple-choice": "Multiple choice",
	"multiple-select": "Multiple select",
	"true-false": "True / False",
	"fill-blank": "Fill in the blanks",
	"short-answer": "Short answer",
	descriptive: "Descriptive",
	coding: "Programming",
	"file-upload": "File upload",
};

const round = (n: number) => Math.round(n * 100) / 100;

/** Standard PDF fonts only cover WinAnsi; replace anything else so drawing never throws. */
function safe(font: PDFFont, text: string): string {
	let out = "";
	for (const ch of String(text ?? "")) {
		try {
			font.encodeText(ch);
			out += ch;
		} catch {
			out += ch.normalize("NFD").replace(/[^\x20-\x7e]/g, "") || "?";
		}
	}
	return out;
}

function fitSize(font: PDFFont, text: string, maxWidth: number, size: number, min = 9) {
	let s = size;
	while (s > min && font.widthOfTextAtSize(text, s) > maxWidth) s -= 0.5;
	return s;
}

function centered(page: PDFPage, font: PDFFont, text: string, y: number, size: number, color: Rgb, maxWidth?: number, spacing = 0) {
	const t = safe(font, text);
	const s = maxWidth ? fitSize(font, t, maxWidth, size) : size;
	const width = font.widthOfTextAtSize(t, s) + spacing * Math.max(0, t.length - 1);
	if (!spacing) {
		page.drawText(t, { x: (page.getWidth() - width) / 2, y, size: s, font, color });
		return;
	}
	let x = (page.getWidth() - width) / 2;
	for (const ch of t) {
		page.drawText(ch, { x, y, size: s, font, color });
		x += font.widthOfTextAtSize(ch, s) + spacing;
	}
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
	const words = safe(font, text).split(/\s+/);
	const lines: string[] = [];
	let line = "";
	for (const w of words) {
		const next = line ? `${line} ${w}` : w;
		if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
			lines.push(line);
			line = w;
		} else line = next;
	}
	if (line) lines.push(line);
	return lines;
}

const SHIELD = "M24 3 6 10v12c0 11.5 7.7 20.6 18 23 10.3-2.4 18-11.5 18-23V10L24 3Z";
const CHECK = "m16 24 6 6 11-12";

export async function buildResultPdf(input: ResultPdfInput): Promise<Uint8Array> {
	const { assessment: a, attempt: t, questions } = input;
	const total = a.totalMarks ?? questions.reduce((s, q) => s + q.points, 0);
	const scored = Math.max(0, questions.reduce((s, q) => s + (q.awarded ?? 0), 0));
	const pct = total > 0 ? Math.round((scored / total) * 100) : 0;
	const pending = questions.filter((q) => q.underReview).length;
	const passed = a.passingMarks != null ? scored >= a.passingMarks : null;
	const integrity = Math.round(t.integrityScore);
	const outcome = resolveOutcome(integrity, t.riskLevel);
	const accent = hex(outcome.color);
	const issued = (t.submittedAt ?? new Date()).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
	const certNo = t.certificateNumber ?? "Pending";
	const code = t.verificationCode ?? "Pending";
	const provisional = pending > 0;
	const gradeLine =
		a.gradingScheme === "letter" ? `Grade ${letterGrade(pct)}` : a.gradingScheme === "pass-fail" && passed != null ? (passed ? "Pass" : "Not passed") : `${pct}%`;

	const pdf = await PDFDocument.create();
	pdf.setTitle(`Certificate & Results — ${input.studentName} — ${a.title}`);
	pdf.setAuthor("IntegrityOS");
	pdf.setSubject(`Certificate No. ${certNo}`);
	pdf.setCreator("IntegrityOS");
	pdf.setCreationDate(new Date());

	const serif = await pdf.embedFont(StandardFonts.TimesRoman);
	const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
	const serifItalic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
	const serifBoldItalic = await pdf.embedFont(StandardFonts.TimesRomanBoldItalic);
	const sans = await pdf.embedFont(StandardFonts.Helvetica);
	const sansBold = await pdf.embedFont(StandardFonts.HelveticaBold);
	const mono = await pdf.embedFont(StandardFonts.Courier);

	/* ───────────── Page 1: certificate (A4 landscape) ───────────── */
	const W = 841.89;
	const H = 595.28;
	const c = pdf.addPage([W, H]);
	c.drawRectangle({ x: 0, y: 0, width: W, height: H, color: PAPER });
	// Frame: outer rule, inner double rule, accent corners
	c.drawRectangle({ x: 26, y: 26, width: W - 52, height: H - 52, borderColor: INK, borderWidth: 1.1 });
	c.drawRectangle({ x: 33, y: 33, width: W - 66, height: H - 66, borderColor: FAINT, borderWidth: 0.5 });
	c.drawRectangle({ x: 37, y: 37, width: W - 74, height: H - 74, borderColor: FAINT, borderWidth: 0.5 });
	for (const [x, y, dx, dy] of [
		[20, H - 20, 1, -1],
		[W - 20, H - 20, -1, -1],
		[20, 20, 1, 1],
		[W - 20, 20, -1, 1],
	] as const) {
		c.drawLine({ start: { x, y }, end: { x: x + dx * 34, y }, thickness: 2, color: accent });
		c.drawLine({ start: { x, y }, end: { x, y: y + dy * 34 }, thickness: 2, color: accent });
	}
	// Watermarks
	c.drawSvgPath(SHIELD, { x: W / 2 - 150, y: H / 2 + 175, scale: 6.25, borderColor: INK, borderWidth: 0.4, opacity: 0.035, borderOpacity: 0.05 });
	if (provisional) {
		c.drawText("PROVISIONAL", { x: 180, y: 150, size: 92, font: serifBold, color: INK, opacity: 0.05, rotate: degrees(22) });
	}

	// Top bar
	c.drawSvgPath(SHIELD, { x: 60, y: H - 54, scale: 0.42, borderColor: accent, borderWidth: 2 });
	c.drawSvgPath(CHECK, { x: 60, y: H - 54, scale: 0.42, borderColor: accent, borderWidth: 2.4 });
	c.drawText("IntegrityOS", { x: 84, y: H - 70, size: 11, font: sansBold, color: INK });
	const ref1 = `Certificate No. ${certNo}`;
	const ref2 = `Issued ${issued}${provisional ? " · Provisional" : ""}`;
	c.drawText(safe(mono, ref1), { x: W - 60 - mono.widthOfTextAtSize(safe(mono, ref1), 8.5), y: H - 62, size: 8.5, font: mono, color: MUTED });
	c.drawText(safe(mono, ref2), { x: W - 60 - mono.widthOfTextAtSize(safe(mono, ref2), 8.5), y: H - 74, size: 8.5, font: mono, color: MUTED });

	centered(c, sansBold, "CERTIFICATE OF COMPLETION", H - 118, 10, accent, undefined, 4.2);
	centered(c, serifBold, a.institutionName.toUpperCase(), H - 152, 26, INK, W - 200, 1.5);
	// Divider
	c.drawLine({ start: { x: W / 2 - 110, y: H - 170 }, end: { x: W / 2 - 12, y: H - 170 }, thickness: 0.6, color: LINE });
	c.drawLine({ start: { x: W / 2 + 12, y: H - 170 }, end: { x: W / 2 + 110, y: H - 170 }, thickness: 0.6, color: LINE });
	c.drawRectangle({ x: W / 2 - 3, y: H - 173, width: 6, height: 6, color: accent, rotate: degrees(45) });

	centered(c, serifItalic, "This is to certify that", H - 200, 15, MUTED);
	centered(c, serifBoldItalic, input.studentName, H - 245, 40, INK, W - 260);
	c.drawLine({ start: { x: W / 2 - 190, y: H - 257 }, end: { x: W / 2 + 190, y: H - 257 }, thickness: 0.6, color: LINE });
	const statement = `has completed ${a.title} under continuous AI-assisted proctoring on ${issued}${
		outcome === OUTCOMES.verified
			? ", and met the academic integrity requirements of the assessment."
			: outcome === OUTCOMES.observations
				? ". Integrity observations were recorded during the session for faculty review."
				: ". Integrity findings were recorded during the session and are subject to faculty review."
	}`;
	wrap(serif, statement, 14, 560).forEach((line, i) => centered(c, serif, line, H - 285 - i * 19, 14, hex("#44403c")));

	// Metrics strip
	const mTop = 228;
	const mX = 110;
	const mW = W - 220;
	c.drawLine({ start: { x: mX, y: mTop }, end: { x: mX + mW, y: mTop }, thickness: 0.6, color: LINE });
	c.drawLine({ start: { x: mX, y: mTop - 62 }, end: { x: mX + mW, y: mTop - 62 }, thickness: 0.6, color: LINE });
	const cells = [
		{ label: "INTEGRITY INDEX", value: `${integrity}%`, sub: outcome.risk, big: true },
		{ label: "INTEGRITY OUTCOME", value: outcome.label, sub: "AI-assisted, faculty reviewed" },
		{ label: "SCORE", value: `${round(scored)} / ${round(total)}`, sub: gradeLine },
		{ label: "RESULT", value: passed == null ? "Completed" : passed ? "Passed" : "Below pass mark", sub: provisional ? "Final grading pending" : "Graded" },
	];
	const cw = mW / cells.length;
	cells.forEach((cell, i) => {
		const cx = mX + cw * i + cw / 2;
		if (i > 0) c.drawLine({ start: { x: mX + cw * i, y: mTop - 8 }, end: { x: mX + cw * i, y: mTop - 54 }, thickness: 0.6, color: LINE });
		const lab = safe(sansBold, cell.label);
		c.drawText(lab, { x: cx - sansBold.widthOfTextAtSize(lab, 7.5) / 2, y: mTop - 19, size: 7.5, font: sansBold, color: FAINT });
		const vf = cell.big ? sansBold : sansBold;
		const vs = fitSize(vf, safe(vf, cell.value), cw - 16, cell.big ? 20 : 12);
		const v = safe(vf, cell.value);
		c.drawText(v, { x: cx - vf.widthOfTextAtSize(v, vs) / 2, y: mTop - (cell.big ? 41 : 38), size: vs, font: vf, color: i < 2 ? accent : INK });
		const sub = safe(sans, cell.sub);
		c.drawText(sub, { x: cx - sans.widthOfTextAtSize(sub, 8) / 2, y: mTop - 53, size: 8, font: sans, color: MUTED });
	});

	// Footer: signature · seal · verification
	const fy = 112;
	const sig = safe(serifBoldItalic, a.facultyName || "Authorized Faculty");
	c.drawText(sig, { x: 150 - serifBoldItalic.widthOfTextAtSize(sig, fitSize(serifBoldItalic, sig, 200, 20)) / 2, y: fy + 12, size: fitSize(serifBoldItalic, sig, 200, 20), font: serifBoldItalic, color: INK });
	c.drawLine({ start: { x: 60, y: fy }, end: { x: 240, y: fy }, thickness: 0.8, color: INK });
	const who = safe(sansBold, a.facultyName || "Authorized Faculty");
	c.drawText(who, { x: 150 - sansBold.widthOfTextAtSize(who, 9) / 2, y: fy - 13, size: 9, font: sansBold, color: INK });
	c.drawText("AUTHORIZED FACULTY", { x: 150 - sansBold.widthOfTextAtSize("AUTHORIZED FACULTY", 6.5) / 2, y: fy - 24, size: 6.5, font: sansBold, color: FAINT });

	c.drawCircle({ x: W / 2, y: fy - 2, size: 40, borderColor: hex("#44403c"), borderWidth: 1.2 });
	c.drawCircle({ x: W / 2, y: fy - 2, size: 35, borderColor: hex("#44403c"), borderWidth: 0.5 });
	c.drawCircle({ x: W / 2, y: fy - 2, size: 22, borderColor: hex("#44403c"), borderWidth: 0.6 });
	c.drawSvgPath(SHIELD, { x: W / 2 - 13, y: fy + 12, scale: 0.55, borderColor: hex("#44403c"), borderWidth: 1.8, color: hex("#44403c"), opacity: 0.08 });
	c.drawSvgPath(CHECK, { x: W / 2 - 13, y: fy + 12, scale: 0.55, borderColor: hex("#44403c"), borderWidth: 2.2 });
	centered(c, sansBold, "VERIFIED RECORD", fy - 53, 6.5, hex("#44403c"), undefined, 1.2);

	const codeW = mono.widthOfTextAtSize(safe(mono, code), 13) + 22;
	c.drawRectangle({ x: W - 150 - codeW / 2, y: fy + 4, width: codeW, height: 24, borderColor: FAINT, borderWidth: 0.8, borderDashArray: [3, 2] });
	c.drawText(safe(mono, code), { x: W - 150 - mono.widthOfTextAtSize(safe(mono, code), 13) / 2, y: fy + 11, size: 13, font: mono, color: INK });
	c.drawLine({ start: { x: W - 240, y: fy }, end: { x: W - 60, y: fy }, thickness: 0.8, color: INK });
	c.drawText("Verification Code", { x: W - 150 - sansBold.widthOfTextAtSize("Verification Code", 9) / 2, y: fy - 13, size: 9, font: sansBold, color: INK });
	const quote = safe(sansBold, `QUOTE TO ${a.institutionName.toUpperCase()} TO VERIFY`);
	const qs = fitSize(sansBold, quote, 190, 6.5, 5);
	c.drawText(quote, { x: W - 150 - sansBold.widthOfTextAtSize(quote, qs) / 2, y: fy - 24, size: qs, font: sansBold, color: FAINT });

	centered(
		c,
		sans,
		"Integrity indicators are AI-assisted observations from webcam, browser and similarity analysis. They are reviewed by faculty and do not by themselves constitute a finding of academic misconduct.",
		44,
		6.8,
		FAINT,
		W - 140,
	);

	/* ───────────── Page 2: results (A4 portrait) ───────────── */
	const PW = 595.28;
	const PH = 841.89;
	let r = pdf.addPage([PW, PH]);
	const margin = 48;
	r.drawRectangle({ x: 0, y: PH - 92, width: PW, height: 92, color: INK });
	r.drawText("IntegrityOS", { x: margin, y: PH - 44, size: 15, font: sansBold, color: rgb(1, 1, 1) });
	r.drawText(safe(sans, a.institutionName), { x: margin, y: PH - 62, size: 10, font: sans, color: FAINT });
	const hdr = "RESULTS SUMMARY";
	r.drawText(hdr, { x: PW - margin - sansBold.widthOfTextAtSize(hdr, 10), y: PH - 52, size: 10, font: sansBold, color: rgb(1, 1, 1) });

	let y = PH - 130;
	r.drawText(safe(sansBold, a.title), { x: margin, y, size: fitSize(sansBold, safe(sansBold, a.title), PW - 2 * margin, 18), font: sansBold, color: INK });
	y -= 20;
	const meta = `${input.studentName}${input.rollNumber ? ` · ${input.rollNumber}` : ""} · Submitted ${issued}`;
	r.drawText(safe(sans, meta), { x: margin, y, size: 10, font: sans, color: MUTED });
	y -= 28;

	// Summary boxes
	const boxes = [
		{ label: "SCORE", value: `${round(scored)} / ${round(total)}`, sub: gradeLine },
		{ label: "RESULT", value: passed == null ? "Completed" : passed ? "Passed" : "Below pass mark", sub: a.passingMarks != null ? `Pass mark ${round(a.passingMarks)}` : "No pass mark set" },
		{ label: "INTEGRITY INDEX", value: `${integrity}%`, sub: outcome.label },
	];
	const bw = (PW - 2 * margin - 2 * 12) / 3;
	boxes.forEach((b, i) => {
		const bx = margin + i * (bw + 12);
		r.drawRectangle({ x: bx, y: y - 64, width: bw, height: 64, borderColor: LINE, borderWidth: 0.8, color: i === 2 ? hex(outcome.tint) : rgb(1, 1, 1) });
		r.drawText(b.label, { x: bx + 12, y: y - 18, size: 7.5, font: sansBold, color: FAINT });
		const v = safe(sansBold, b.value);
		r.drawText(v, { x: bx + 12, y: y - 40, size: fitSize(sansBold, v, bw - 24, 17), font: sansBold, color: i === 2 ? accent : i === 1 && passed === false ? hex("#b91c1c") : INK });
		r.drawText(safe(sans, b.sub), { x: bx + 12, y: y - 55, size: 8.5, font: sans, color: MUTED });
	});
	y -= 88;

	if (pending > 0) {
		const msg = `${pending} answer${pending === 1 ? " is" : "s are"} still under faculty review. Your final score may change once review is complete.`;
		r.drawRectangle({ x: margin, y: y - 30, width: PW - 2 * margin, height: 30, color: hex("#fffbeb"), borderColor: hex("#fde68a"), borderWidth: 0.8 });
		r.drawText(safe(sans, msg), { x: margin + 10, y: y - 19, size: 9, font: sans, color: hex("#92400e") });
		y -= 46;
	}

	r.drawText("Question breakdown", { x: margin, y, size: 12, font: sansBold, color: INK });
	y -= 14;
	const cols = [
		{ title: "#", x: margin + 10, w: 40, align: "left" as const },
		{ title: "TYPE", x: margin + 60, w: 220, align: "left" as const },
		{ title: "MARKS", x: PW - margin - 150, w: 70, align: "right" as const },
		{ title: "STATUS", x: PW - margin - 10, w: 80, align: "right" as const },
	];
	const header = () => {
		r.drawRectangle({ x: margin, y: y - 22, width: PW - 2 * margin, height: 22, color: hex("#f5f5f4") });
		for (const col of cols) {
			const tx = col.align === "right" ? col.x - sansBold.widthOfTextAtSize(col.title, 7.5) : col.x;
			r.drawText(col.title, { x: tx, y: y - 14.5, size: 7.5, font: sansBold, color: MUTED });
		}
		y -= 22;
	};
	header();
	questions.forEach((q, i) => {
		if (y < 90) {
			r = pdf.addPage([PW, PH]);
			y = PH - 60;
			header();
		}
		if (i % 2 === 1) r.drawRectangle({ x: margin, y: y - 20, width: PW - 2 * margin, height: 20, color: hex("#fafaf9") });
		const marks = `${q.underReview || q.awarded == null ? "—" : round(Math.max(0, q.awarded))} / ${round(q.points)}`;
		const cellsRow = [`Q${q.order + 1}`, TYPE_LABEL[q.type] ?? q.type, marks, q.underReview ? "Under review" : "Graded"];
		cellsRow.forEach((text, k) => {
			const col = cols[k];
			const f = k === 0 || k === 2 ? sansBold : sans;
			const tt = safe(f, text);
			const tx = col.align === "right" ? col.x - f.widthOfTextAtSize(tt, 9.5) : col.x;
			r.drawText(tt, { x: tx, y: y - 13.5, size: 9.5, font: f, color: k === 3 ? (q.underReview ? hex("#b45309") : hex("#0f766e")) : INK });
		});
		r.drawLine({ start: { x: margin, y: y - 20 }, end: { x: PW - margin, y: y - 20 }, thickness: 0.4, color: hex("#eeeceb") });
		y -= 20;
	});
	y -= 26;

	const certLines = [
		`Certificate No. ${certNo}    Verification code ${code}`,
		`Assessed by ${a.facultyName || "your instructor"} · ${a.institutionName}`,
	];
	for (const l of certLines) {
		if (y < 60) {
			r = pdf.addPage([PW, PH]);
			y = PH - 60;
		}
		r.drawText(safe(sans, l), { x: margin, y, size: 9, font: sans, color: MUTED });
		y -= 14;
	}
	wrap(
		sans,
		"Integrity indicators are AI-assisted observations reviewed by faculty and do not by themselves constitute a finding of academic misconduct. Questions about your result? Contact your instructor through the IntegrityOS portal.",
		7.5,
		PW - 2 * margin,
	).forEach((l, i) => r.drawText(l, { x: margin, y: 40 - i * 10 + 10, size: 7.5, font: sans, color: FAINT }));

	return pdf.save();
}
