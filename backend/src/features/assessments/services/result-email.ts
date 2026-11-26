import { env } from "../../../config/env";
import { prisma } from "../../../database";
import { mailConfigured, sendEmail } from "../../../services/mail";
import { buildResultPdf } from "./result-pdf";

/**
 * Emails a student their results and completion certificate (one PDF attachment)
 * once their attempt has been evaluated.
 *
 * Exactly once per attempt: the send is claimed atomically by setting
 * assessment_attempts.resultEmailSentAt (only one worker/instance can win), and the
 * claim is released only if the mail server rejects the message. Never throws: a
 * mail outage must not fail the evaluation job.
 */

const SENT_EVENT = "Results Emailed";

const esc = (v: unknown) =>
	String(v ?? "").replace(
		/[&<>"']/g,
		(c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
	);

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

function outcomeOf(score: number, riskLevel?: string | null) {
	const risk = String(riskLevel || "").toLowerCase();
	const key =
		risk.includes("high") || risk.includes("critical")
			? "review"
			: risk.includes("medium") || risk.includes("moderate")
				? "observations"
				: risk.includes("low")
					? score >= 60
						? "verified"
						: "observations"
					: score >= 85
						? "verified"
						: score >= 60
							? "observations"
							: "review";
	return {
		verified: { label: "Integrity Verified", color: "#0f766e", tint: "#ecfdf5" },
		observations: { label: "Observations Noted", color: "#b45309", tint: "#fffbeb" },
		review: { label: "Under Faculty Review", color: "#b91c1c", tint: "#fef2f2" },
	}[key];
}

function letterGrade(pct: number) {
	if (pct >= 90) return "A";
	if (pct >= 80) return "B";
	if (pct >= 70) return "C";
	if (pct >= 60) return "D";
	return "F";
}

const round = (n: number) => Math.round(n * 100) / 100;

export interface ResultEmailContent {
	subject: string;
	html: string;
	text: string;
	/** File name for the attached results + certificate PDF. */
	attachmentName: string;
}

/** Builds the email (pure; exported for tests and previews). */
export function buildResultEmail(input: {
	studentName: string;
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
	questions: {
		order: number;
		type: string;
		points: number;
		awarded: number | null;
		underReview: boolean;
	}[];
	portalUrl: string;
}): ResultEmailContent {
	const { studentName, assessment: a, attempt: t, questions, portalUrl } = input;
	const total = a.totalMarks ?? questions.reduce((s, q) => s + q.points, 0);
	const scored = Math.max(
		0,
		questions.reduce((s, q) => s + (q.awarded ?? 0), 0),
	);
	const pct = total > 0 ? Math.round((scored / total) * 100) : 0;
	const pending = questions.filter((q) => q.underReview).length;
	const passed = a.passingMarks != null ? scored >= a.passingMarks : null;
	const integrity = Math.round(t.integrityScore);
	const outcome = outcomeOf(integrity, t.riskLevel);
	const first = studentName.split(" ")[0] || studentName;
	const submitted = (t.submittedAt ?? new Date()).toLocaleDateString("en-GB", {
		day: "numeric",
		month: "long",
		year: "numeric",
	});
	const gradeLine =
		a.gradingScheme === "letter"
			? `Grade ${letterGrade(pct)}`
			: a.gradingScheme === "pass-fail" && passed != null
				? passed
					? "Pass"
					: "Not passed"
				: `${pct}%`;
	const certNo = t.certificateNumber ?? "Pending";
	const code = t.verificationCode ?? "Pending";

	const badge = (label: string, color: string, tint: string) =>
		`<span style="display:inline-block;padding:4px 12px;border-radius:999px;background:${tint};color:${color};font:700 12px Arial,Helvetica,sans-serif;border:1px solid ${color}33">${esc(label)}</span>`;

	const rows = questions
		.slice(0, 60)
		.map(
			(q, i) => `<tr style="background:${i % 2 ? "#fafaf9" : "#ffffff"}">
  <td style="padding:9px 12px;font:600 13px Arial,Helvetica,sans-serif;color:#1c1917">Q${q.order + 1}</td>
  <td style="padding:9px 12px;font:13px Arial,Helvetica,sans-serif;color:#57534e">${esc(TYPE_LABEL[q.type] ?? q.type)}</td>
  <td align="right" style="padding:9px 12px;font:600 13px Arial,Helvetica,sans-serif;color:#1c1917;white-space:nowrap">${q.underReview || q.awarded == null ? "—" : round(Math.max(0, q.awarded))} / ${round(q.points)}</td>
  <td align="right" style="padding:9px 12px;font:12px Arial,Helvetica,sans-serif;color:${q.underReview ? "#b45309" : "#0f766e"};white-space:nowrap">${q.underReview ? "Under review" : "Graded"}</td>
</tr>`,
		)
		.join("");

	const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your results</title></head>
<body style="margin:0;padding:0;background:#f5f5f4">
<div style="display:none;max-height:0;overflow:hidden">Your results for ${esc(a.title)}: ${round(scored)} / ${round(total)} (${pct}%). Certificate ${esc(certNo)} attached.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e7e5e4;border-radius:16px;overflow:hidden">
  <tr><td style="background:#1c1917;padding:22px 28px">
    <div style="font:700 15px Arial,Helvetica,sans-serif;color:#ffffff;letter-spacing:.3px">IntegrityOS</div>
    <div style="font:12px Arial,Helvetica,sans-serif;color:#a8a29e;margin-top:2px">${esc(a.institutionName)}</div>
  </td></tr>
  <tr><td style="padding:28px 28px 8px">
    <div style="font:700 22px Arial,Helvetica,sans-serif;color:#1c1917">Your results are ready, ${esc(first)} 🎓</div>
    <div style="font:14px/1.6 Arial,Helvetica,sans-serif;color:#57534e;margin-top:8px">
      Your submission for <strong style="color:#1c1917">${esc(a.title)}</strong> on ${esc(submitted)} has been evaluated. Here is your summary and your completion certificate.
    </div>
  </td></tr>
  <tr><td style="padding:16px 28px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e7e5e4;border-radius:12px">
      <tr>
        <td width="50%" valign="top" style="padding:18px 20px;border-right:1px solid #e7e5e4">
          <div style="font:700 11px Arial,Helvetica,sans-serif;letter-spacing:1.2px;color:#a8a29e;text-transform:uppercase">Score</div>
          <div style="font:700 30px Arial,Helvetica,sans-serif;color:#1c1917;margin-top:6px">${round(scored)}<span style="font-size:16px;color:#a8a29e"> / ${round(total)}</span></div>
          <div style="margin-top:6px">${badge(gradeLine, "#1c1917", "#f5f5f4")}${passed != null ? `&nbsp;${passed ? badge("Passed", "#0f766e", "#ecfdf5") : badge("Below pass mark", "#b91c1c", "#fef2f2")}` : ""}</div>
          ${a.passingMarks != null ? `<div style="font:12px Arial,Helvetica,sans-serif;color:#78716c;margin-top:8px">Pass mark: ${round(a.passingMarks)}</div>` : ""}
        </td>
        <td width="50%" valign="top" style="padding:18px 20px">
          <div style="font:700 11px Arial,Helvetica,sans-serif;letter-spacing:1.2px;color:#a8a29e;text-transform:uppercase">Integrity index</div>
          <div style="font:700 30px Arial,Helvetica,sans-serif;color:${outcome.color};margin-top:6px">${integrity}<span style="font-size:16px">%</span></div>
          <div style="margin-top:6px">${badge(outcome.label, outcome.color, outcome.tint)}</div>
        </td>
      </tr>
    </table>
  </td></tr>
  ${
		pending > 0
			? `<tr><td style="padding:0 28px 8px"><div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 14px;font:13px/1.5 Arial,Helvetica,sans-serif;color:#92400e">
    ${pending} answer${pending === 1 ? " is" : "s are"} still under faculty review. Your final score may change once review is complete.</div></td></tr>`
			: ""
	}
  <tr><td style="padding:12px 28px">
    <div style="font:700 13px Arial,Helvetica,sans-serif;color:#1c1917;margin-bottom:8px">Question breakdown</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e7e5e4;border-radius:10px;overflow:hidden;border-collapse:separate">
      <tr style="background:#f5f5f4">
        <th align="left" style="padding:9px 12px;font:700 11px Arial,Helvetica,sans-serif;color:#78716c;text-transform:uppercase;letter-spacing:.8px">#</th>
        <th align="left" style="padding:9px 12px;font:700 11px Arial,Helvetica,sans-serif;color:#78716c;text-transform:uppercase;letter-spacing:.8px">Type</th>
        <th align="right" style="padding:9px 12px;font:700 11px Arial,Helvetica,sans-serif;color:#78716c;text-transform:uppercase;letter-spacing:.8px">Marks</th>
        <th align="right" style="padding:9px 12px;font:700 11px Arial,Helvetica,sans-serif;color:#78716c;text-transform:uppercase;letter-spacing:.8px">Status</th>
      </tr>
      ${rows}
    </table>
  </td></tr>
  <tr><td style="padding:16px 28px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${outcome.tint};border:1px solid ${outcome.color}33;border-radius:12px">
      <tr><td style="padding:16px 18px">
        <div style="font:700 14px Arial,Helvetica,sans-serif;color:#1c1917">📜 Your completion certificate is attached</div>
        <div style="font:13px/1.6 Arial,Helvetica,sans-serif;color:#57534e;margin-top:4px">
          Your certificate and full results are attached as a PDF.<br>
          Certificate No. <strong style="font-family:Consolas,monospace;color:#1c1917">${esc(certNo)}</strong> · Verification code <strong style="font-family:Consolas,monospace;color:#1c1917">${esc(code)}</strong>
        </div>
      </td></tr>
    </table>
  </td></tr>
  <tr><td align="center" style="padding:8px 28px 26px">
    <a href="${esc(portalUrl)}" style="display:inline-block;background:#1c1917;color:#ffffff;text-decoration:none;font:700 14px Arial,Helvetica,sans-serif;padding:12px 22px;border-radius:10px">View full results in IntegrityOS</a>
  </td></tr>
  <tr><td style="padding:16px 28px 22px;border-top:1px solid #f0efee">
    <div style="font:11px/1.6 Arial,Helvetica,sans-serif;color:#a8a29e">
      Integrity indicators are AI-assisted observations reviewed by faculty and do not by themselves constitute a finding of academic misconduct.
      Questions about your result? Contact ${esc(a.facultyName || "your instructor")} through the IntegrityOS portal.
    </div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

	const text = [
		`Hi ${first},`,
		"",
		`Your results for "${a.title}" (${submitted}) are ready.`,
		`Score: ${round(scored)} / ${round(total)} (${gradeLine})${passed != null ? ` — ${passed ? "Passed" : "Below pass mark"}` : ""}`,
		`Integrity index: ${integrity}% — ${outcome.label}`,
		pending > 0
			? `${pending} answer(s) are still under faculty review; your final score may change.`
			: "",
		"",
		`Certificate No. ${certNo} · Verification code ${code} (certificate and results attached as PDF)`,
		`View full results: ${portalUrl}`,
	]
		.filter((l, i, arr) => l !== "" || arr[i - 1] !== "")
		.join("\n");

	const safe = (s: string) =>
		s
			.replace(/[^\w-]+/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-|-$/g, "")
			.slice(0, 60);

	return {
		subject: `Your results & certificate — ${a.title}`,
		html,
		text,
		attachmentName: `IntegrityOS-Results-Certificate-${safe(certNo) || "pending"}.pdf`,
	};
}

export async function sendResultEmail(attemptId: string): Promise<"sent" | "skipped" | "failed"> {
	if (!mailConfigured()) {
		console.warn("[ResultEmail] SMTP is not configured; skipping results email.");
		return "skipped";
	}

	// 1. Load and check eligibility before claiming.
	const attempt = await prisma.assessmentAttempt
		.findUnique({
			where: { id: attemptId },
			include: {
				student: { select: { email: true, name: true, rollNumber: true } },
				assessment: {
					select: {
						title: true,
						institutionName: true,
						facultyName: true,
						passingMarks: true,
						totalMarks: true,
						gradingScheme: true,
						questions: {
							orderBy: { order: "asc" },
							select: { id: true, order: true, type: true, points: true },
						},
					},
				},
				answers: {
					select: { questionId: true, aiGrade: true, manualGrade: true, isFlagged: true },
				},
			},
		})
		.catch(() => null);
	if (
		!attempt ||
		attempt.status === "reset" ||
		!attempt.student?.email ||
		!attempt.certificateNumber
	)
		return "skipped";
	if (attempt.resultEmailSentAt) return "skipped";

	// 2. Atomic claim: only one caller (across workers and server instances) gets count === 1.
	const claim = await prisma.assessmentAttempt.updateMany({
		where: { id: attemptId, resultEmailSentAt: null },
		data: { resultEmailSentAt: new Date() },
	});
	if (claim.count !== 1) return "skipped";

	try {
		const byQuestion = new Map(attempt.answers.map((x) => [x.questionId, x]));
		const questions = attempt.assessment.questions.map((q, i) => {
			const ans = byQuestion.get(q.id);
			const awarded = ans ? (ans.manualGrade ?? ans.aiGrade) : 0; // unanswered questions score 0
			return {
				order: q.order ?? i,
				type: q.type,
				points: q.points,
				awarded,
				underReview: Boolean(
					ans && (awarded == null || (ans.isFlagged && ans.manualGrade == null)),
				),
			};
		});
		const studentName = attempt.studentName || attempt.student.name;

		const content = buildResultEmail({
			studentName,
			assessment: attempt.assessment,
			attempt,
			questions,
			portalUrl: env.FRONTEND_URL,
		});
		const pdf = await buildResultPdf({
			studentName,
			rollNumber: attempt.student.rollNumber,
			assessment: attempt.assessment,
			attempt,
			questions,
		});

		await sendEmail({
			to: attempt.student.email,
			subject: content.subject,
			html: content.html,
			text: content.text,
			attachments: [
				{
					filename: content.attachmentName,
					content: Buffer.from(pdf),
					contentType: "application/pdf",
				},
			],
		});
		await prisma.proctoringTimelineEvent
			.create({
				data: {
					attemptId,
					event: SENT_EVENT,
					details: JSON.stringify({ certificateNumber: attempt.certificateNumber, format: "pdf" }),
				},
			})
			.catch(() => {});
		return "sent";
	} catch (err) {
		// Not delivered — release the claim so a later evaluation can retry.
		await prisma.assessmentAttempt
			.update({ where: { id: attemptId }, data: { resultEmailSentAt: null } })
			.catch(() => {});
		console.error(
			"[ResultEmail] Could not send results email:",
			err instanceof Error ? err.message : err,
		);
		return "failed";
	}
}
