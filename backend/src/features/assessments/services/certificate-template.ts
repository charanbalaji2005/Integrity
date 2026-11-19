/**
 * Server copy of the student completion certificate (same design and outcome
 * rules as src/app/utils/certificate.ts). Used for the certificate attached to
 * the results email; opening the file shows the certificate with a
 * "Print / Save as PDF" button.
 */

export interface CertificateData {
  studentName: string;
  integrityScore: number;
  riskLevel?: string | null;
  certificateNumber?: string | null;
  verificationCode?: string | null;
  issuedAt?: string | Date | null;
  provisional?: boolean;
  assessment?: { title?: string; institutionName?: string; facultyName?: string };
}

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c] as string);

type Outcome = "verified" | "observations" | "review";

/** The certificate must never claim full compliance for a flagged attempt. */
function resolveOutcome(score: number, riskLevel?: string | null): Outcome {
  const risk = String(riskLevel || "").toLowerCase();
  if (risk.includes("high") || risk.includes("critical")) return "review";
  if (risk.includes("medium") || risk.includes("moderate")) return "observations";
  if (risk.includes("low")) return score >= 60 ? "verified" : "observations";
  return score >= 85 ? "verified" : score >= 60 ? "observations" : "review";
}

const OUTCOMES: Record<Outcome, { label: string; risk: string; color: string; tint: string; statement: string }> = {
  verified: {
    label: "Integrity Verified",
    risk: "Low risk",
    color: "#0f766e",
    tint: "#ecfdf5",
    statement: ", and met the academic integrity requirements of the assessment.",
  },
  observations: {
    label: "Observations Noted",
    risk: "Medium risk",
    color: "#b45309",
    tint: "#fffbeb",
    statement: ". Integrity observations were recorded during the session for faculty review.",
  },
  review: {
    label: "Under Faculty Review",
    risk: "High risk",
    color: "#b91c1c",
    tint: "#fef2f2",
    statement: ". Integrity findings were recorded during the session and are subject to faculty review.",
  },
};

const shieldSvg = (size: number, color: string) => `
<svg width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true">
  <path d="M24 3 6 10v12c0 11.5 7.7 20.6 18 23 10.3-2.4 18-11.5 18-23V10L24 3Z" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="m16 24 6 6 11-12" fill="none" stroke="${color}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const sealSvg = (color: string) => `
<svg width="112" height="112" viewBox="0 0 120 120" aria-hidden="true">
  <defs><path id="sealArc" d="M60 60 m-41 0 a41 41 0 1 1 82 0 a41 41 0 1 1 -82 0"/></defs>
  <g fill="none" stroke="${color}">
    <circle cx="60" cy="60" r="56" stroke-width="1.2" stroke-dasharray="2 3"/>
    <circle cx="60" cy="60" r="51" stroke-width="1.6"/>
    <circle cx="60" cy="60" r="31" stroke-width="1"/>
  </g>
  <text font-family="Inter, sans-serif" font-size="8.2" font-weight="700" fill="${color}">
    <textPath href="#sealArc" startOffset="0" textLength="252" lengthAdjust="spacing">INTEGRITYOS • PROCTORED • VERIFIED RECORD •</textPath>
  </text>
  <g transform="translate(42 41) scale(0.75)">
    <path d="M24 3 6 10v12c0 11.5 7.7 20.6 18 23 10.3-2.4 18-11.5 18-23V10L24 3Z" fill="${color}" opacity="0.1"/>
    <path d="M24 3 6 10v12c0 11.5 7.7 20.6 18 23 10.3-2.4 18-11.5 18-23V10L24 3Z" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="m16 24 6 6 11-12" fill="none" stroke="${color}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;

const ringSvg = (score: number, color: string) => {
  const r = 22;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  return `
<svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
  <circle cx="28" cy="28" r="${r}" fill="none" stroke="#e7e5e4" stroke-width="5"/>
  <circle cx="28" cy="28" r="${r}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round"
    stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - pct / 100)).toFixed(2)}" transform="rotate(-90 28 28)"/>
</svg>`;
};

export function buildCertificateHtml(d: CertificateData): string {
  const score = Math.round(Number(d.integrityScore) || 0);
  const outcome = OUTCOMES[resolveOutcome(score, d.riskLevel)];
  const issued = new Date(d.issuedAt || Date.now()).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const institution = d.assessment?.institutionName || "IntegrityOS University";
  const title = d.assessment?.title || "Proctored Assessment";
  const faculty = d.assessment?.facultyName || "";
  const certNo = d.certificateNumber || "Pending";
  const code = d.verificationCode || "Pending";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Certificate – ${esc(d.studentName)} – ${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500;1,600&family=Great+Vibes&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  :root {
    --ink: #1c1917; --muted: #57534e; --faint: #a8a29e; --line: #d6d3d1; --paper: #fffdf9;
    --accent: ${outcome.color}; --tint: ${outcome.tint};
  }
  html, body { margin: 0; background: #e7e5e4; }
  body { font-family: 'Inter', system-ui, sans-serif; color: var(--ink); min-height: 100vh; display: flex; flex-direction: column; align-items: center; }

  .toolbar { position: sticky; top: 0; z-index: 2; width: 100%; display: flex; justify-content: center; gap: 8px; padding: 12px; background: rgba(231,229,228,.9); backdrop-filter: blur(6px); }
  .toolbar button { font: 600 13px 'Inter', sans-serif; padding: 9px 16px; border-radius: 8px; border: 1px solid #a8a29e; background: #fff; color: var(--ink); cursor: pointer; }
  .toolbar button.primary { background: var(--ink); border-color: var(--ink); color: #fff; }
  .stage { padding: 8px 16px 40px; }

  .page {
    width: 297mm; height: 210mm; position: relative; overflow: hidden;
    background: var(--paper); box-shadow: 0 20px 50px rgba(28,25,23,.18);
    transform-origin: top center;
  }
  /* Frame: outer hairline + inner double rule + corner ornaments */
  .frame { position: absolute; inset: 9mm; border: 1.2px solid var(--ink); }
  .frame::after { content: ""; position: absolute; inset: 2.2mm; border: 0.6px solid var(--faint); outline: 0.6px solid var(--faint); outline-offset: -1.6mm; }
  .corner { position: absolute; width: 12mm; height: 12mm; border-color: var(--accent); border-style: solid; border-width: 0; }
  .corner.tl { top: 7mm; left: 7mm; border-top-width: 2px; border-left-width: 2px; }
  .corner.tr { top: 7mm; right: 7mm; border-top-width: 2px; border-right-width: 2px; }
  .corner.bl { bottom: 7mm; left: 7mm; border-bottom-width: 2px; border-left-width: 2px; }
  .corner.br { bottom: 7mm; right: 7mm; border-bottom-width: 2px; border-right-width: 2px; }
  .watermark { position: absolute; left: 50%; top: 52%; transform: translate(-50%, -50%); opacity: .035; pointer-events: none; }
  .provisional { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%) rotate(-24deg); font: 700 92px 'Cinzel', serif; letter-spacing: 12px; color: var(--ink); opacity: .05; pointer-events: none; white-space: nowrap; }

  .content { position: absolute; inset: 16mm 24mm 15mm; display: flex; flex-direction: column; align-items: center; text-align: center; }

  .topbar { width: 100%; display: flex; justify-content: space-between; align-items: center; }
  .brand { display: flex; align-items: center; gap: 8px; font: 700 12px 'Inter', sans-serif; letter-spacing: .4px; color: var(--ink); }
  .ref { font: 500 9.5px 'JetBrains Mono', monospace; color: var(--muted); text-align: right; line-height: 1.6; }
  .ref b { color: var(--ink); font-weight: 500; }

  .kicker { margin-top: 9mm; font: 600 10.5px 'Inter', sans-serif; letter-spacing: 5px; text-transform: uppercase; color: var(--accent); }
  .institution { margin-top: 2.5mm; font: 700 30px/1.15 'Cinzel', serif; letter-spacing: 2.5px; color: var(--ink); }
  .divider { display: flex; align-items: center; gap: 10px; margin: 5mm 0 4mm; color: var(--faint); }
  .divider span { width: 34mm; height: 1px; background: linear-gradient(90deg, transparent, var(--line)); }
  .divider span:last-child { background: linear-gradient(90deg, var(--line), transparent); }
  .divider i { width: 6px; height: 6px; transform: rotate(45deg); background: var(--accent); display: block; }

  .lead { font: italic 500 17px 'Cormorant Garamond', serif; color: var(--muted); }
  .name { margin: 1mm 0 0; font: 400 58px/1.1 'Great Vibes', cursive; color: var(--ink); padding: 0 10mm; border-bottom: 1px solid var(--line); min-width: 130mm; }
  .statement { max-width: 205mm; margin-top: 5mm; font: 500 16.5px/1.55 'Cormorant Garamond', serif; color: #44403c; }
  .statement strong { font-weight: 600; color: var(--ink); font-style: italic; }

  .metrics { margin-top: 8mm; width: 100%; max-width: 225mm; display: grid; grid-template-columns: 1.15fr 1fr 1fr 1fr; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .metric { padding: 3.5mm 4mm; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1.5mm; }
  .metric + .metric { border-left: 1px solid var(--line); }
  .label { font: 600 8.5px 'Inter', sans-serif; letter-spacing: 1.6px; text-transform: uppercase; color: var(--faint); }
  .value { font: 600 14px 'Inter', sans-serif; color: var(--ink); }
  .score { display: flex; align-items: center; gap: 3mm; }
  .score .num { font: 700 26px 'Inter', sans-serif; color: var(--accent); letter-spacing: -.5px; }
  .score .num small { font-size: 13px; font-weight: 600; }
  .badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; background: var(--tint); color: var(--accent); border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent); font: 700 11px 'Inter', sans-serif; }
  .badge::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }
  .sub { font: 500 10px 'Inter', sans-serif; color: var(--muted); }

  .footer { margin-top: auto; width: 100%; display: grid; grid-template-columns: 72mm auto 72mm; justify-content: space-between; align-items: end; }
  .sign { text-align: center; }
  .sign .script { font: 400 32px/1 'Great Vibes', cursive; color: var(--ink); min-height: 34px; }
  .sign .rule { margin-top: 2mm; border-top: 1px solid var(--ink); padding-top: 2mm; }
  .sign .who { font: 600 11px 'Inter', sans-serif; color: var(--ink); }
  .seal { display: flex; flex-direction: column; align-items: center; }
  .verify { text-align: center; }
  .verify .codebox { display: inline-block; padding: 2mm 4mm; border: 1px dashed var(--faint); border-radius: 6px; font: 500 15px 'JetBrains Mono', monospace; letter-spacing: 2px; color: var(--ink); }

  .disclaimer { margin-top: 3.5mm; font: 400 8.5px/1.5 'Inter', sans-serif; color: var(--faint); max-width: 230mm; }

  @media print {
    html, body { background: none; }
    .toolbar { display: none; }
    .stage { padding: 0; }
    .page { box-shadow: none; transform: none !important; margin: 0 !important; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button class="primary" onclick="window.print()">Print / Save as PDF</button>
  </div>
  <div class="stage">
  <main class="page" id="page">
    <div class="frame"></div>
    <div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>
    <div class="watermark">${shieldSvg(420, "#1c1917")}</div>
    ${d.provisional ? `<div class="provisional">PROVISIONAL</div>` : ""}

    <section class="content">
      <div class="topbar">
        <div class="brand">${shieldSvg(22, outcome.color)} IntegrityOS</div>
        <div class="ref">Certificate No. <b>${esc(certNo)}</b><br>Issued ${esc(issued)}${d.provisional ? " · Provisional" : ""}</div>
      </div>

      <div class="kicker">Certificate of Completion</div>
      <div class="institution">${esc(institution)}</div>
      <div class="divider"><span></span><i></i><span></span></div>

      <div class="lead">This is to certify that</div>
      <div class="name">${esc(d.studentName)}</div>
      <p class="statement">
        has completed <strong>${esc(title)}</strong> under continuous AI-assisted proctoring
        on ${esc(issued)}${esc(outcome.statement)}
      </p>

      <div class="metrics">
        <div class="metric">
          <div class="label">Integrity Index</div>
          <div class="score">${ringSvg(score, outcome.color)}<div class="num">${score}<small>%</small></div></div>
        </div>
        <div class="metric">
          <div class="label">Integrity Outcome</div>
          <div class="badge">${esc(outcome.label)}</div>
          <div class="sub">${esc(outcome.risk)}</div>
        </div>
        <div class="metric">
          <div class="label">Proctoring</div>
          <div class="value">Webcam · Browser</div>
          <div class="sub">Session recorded &amp; logged</div>
        </div>
        <div class="metric">
          <div class="label">Evaluation</div>
          <div class="value">Similarity &amp; AI-content</div>
          <div class="sub">${d.provisional ? "Final grading pending" : "Faculty graded"}</div>
        </div>
      </div>

      <div class="footer">
        <div class="sign">
          <div class="script">${esc(faculty)}</div>
          <div class="rule">
            <div class="who">${esc(faculty || "Authorized Faculty")}</div>
            <div class="label">Authorized Faculty</div>
          </div>
        </div>
        <div class="seal">${sealSvg("#44403c")}</div>
        <div class="verify">
          <div class="codebox">${esc(code)}</div>
          <div class="rule" style="margin-top:2mm;border-top:1px solid var(--ink);padding-top:2mm">
            <div class="who" style="font:600 11px Inter,sans-serif">Verification Code</div>
            <div class="label">Quote to ${esc(institution)} to verify</div>
          </div>
        </div>
      </div>

      <div class="disclaimer">
        Integrity indicators are AI-assisted observations from webcam, browser and similarity analysis. They are reviewed by
        faculty and do not by themselves constitute a finding of academic misconduct.
      </div>
    </section>
  </main>
  </div>
<script>
  (function () {
    var page = document.getElementById('page');
    function fit() {
      var w = page.offsetWidth, h = page.offsetHeight;
      var s = Math.min(1, (window.innerWidth - 32) / w);
      page.style.transform = 'scale(' + s + ')';
      page.style.marginBottom = (-(1 - s) * h) + 'px';
    }
    window.addEventListener('resize', fit);
    fit();
  })();
</script>
</body>
</html>`;
  return html;
}
