import { prisma } from "../../../database";

/**
 * Knowledge base: approved institutional documentation the AI must prefer.
 * Built-in articles describe how this platform actually behaves; staff can
 * add or edit articles (public = visible to students and the AI's student
 * replies; internal = staff-only, used by the copilot).
 */

interface SeedArticle {
	title: string;
	category: string;
	summary: string;
	body: string;
	visibility: "public" | "internal";
	tags: string[];
}

const BUILT_IN: SeedArticle[] = [
	{
		title: "Allowing camera and microphone access",
		category: "camera_microphone",
		summary: "Fix 'camera not detected' or blocked permission errors before or during an exam.",
		tags: ["camera", "webcam", "microphone", "permission", "blocked", "not detected", "black screen"],
		visibility: "public",
		body: "1. Click the camera/lock icon in the browser address bar and set Camera and Microphone to Allow, then reload the page.\n2. Close other apps that use the camera (Zoom, Teams, Meet, the Windows Camera app) — only one app can use it at a time.\n3. On Windows: Settings > Privacy & security > Camera (and Microphone) > allow access for desktop apps and your browser.\n4. On macOS: System Settings > Privacy & Security > Camera/Microphone > enable your browser, then restart the browser.\n5. If you use an external webcam, reconnect it and pick it in Settings > Camera & Face ID inside IntegrityOS.\n6. Run the webcam check again from the exam start screen.",
	},
	{
		title: "Supported browsers and devices",
		category: "browser_compat",
		summary: "Which browsers work and why exams need a laptop or desktop.",
		tags: ["browser", "chrome", "edge", "firefox", "safari", "mobile", "tablet", "phone", "laptop"],
		visibility: "public",
		body: "Use the latest Google Chrome, Microsoft Edge or Firefox on a laptop or desktop computer with a webcam. Proctored assessments cannot be started on phones or tablets — you can still use the dashboard, messages and support on mobile. Disable ad-blockers or privacy extensions for this site if pages fail to load, keep the exam window in full screen, and avoid private/incognito windows if your institution's single sign-on fails there.",
	},
	{
		title: "Can't sign in or forgot your password",
		category: "login_auth",
		summary: "Password resets, OTP codes and locked accounts.",
		tags: ["login", "password", "reset", "otp", "locked", "sign in", "code", "email"],
		visibility: "public",
		body: "Use 'Forgot password' on the login page; a 6-digit code is emailed to your institutional address and expires after a few minutes. Check spam/junk folders. Registration only accepts your institutional email (for example @srmap.edu.in), so make sure the address has no typos. After several failed attempts an account is temporarily locked — wait for the lock to expire or contact support to verify your identity.",
	},
	{
		title: "Google sign-in problems",
		category: "login_auth",
		summary: "What to do if 'Continue with Google' fails or returns to the login page.",
		tags: ["google", "oauth", "sign in", "redirect", "landing page"],
		visibility: "public",
		body: "Google sign-in only works with an institutional Google account that is already registered. If you return to the login page with an error, allow third-party cookies for this site, try again in a normal (not private) window, or sign in with your email and password. If the message says your account couldn't be linked, register with email first and then use Google.",
	},
	{
		title: "My exam won't start",
		category: "examination",
		summary: "Common reasons the Start button is locked or the exam refuses to open.",
		tags: ["exam", "start", "locked", "verify", "verification", "desktop", "cannot start", "availability"],
		visibility: "public",
		body: "1. Enrolment verification: exams unlock only after an administrator approves your college ID card or fee receipt (Dashboard banner shows the status).\n2. Device: proctored exams can only be started on a laptop or desktop computer.\n3. Availability window: the exam may not have opened yet, may have ended, or may be locked by the instructor.\n4. Camera: the webcam check and calibration must succeed before the exam opens.\nIf none of these apply, include the exam name and the exact error message in your ticket.",
	},
	{
		title: "My exam was paused or I received a warning",
		category: "ai_proctoring",
		summary: "How AI proctoring warnings and automatic pauses work.",
		tags: ["paused", "warning", "proctor", "suspended", "flag", "phone detected", "face not detected", "multiple faces"],
		visibility: "public",
		body: "The AI proctor warns you about sustained look-aways, tab switches, a face leaving the frame, possible speech and objects such as books or earphones. It pauses the exam for serious events such as a phone or second screen in view, being out of frame for several seconds, another person in the camera, or a face that doesn't match the one enrolled at calibration. A paused exam can only be resumed by your faculty proctor — stay at your seat with the camera on. Warnings are reviewed by faculty; they are not an automatic finding of misconduct.",
	},
	{
		title: "I got disconnected during an exam",
		category: "network",
		summary: "Resuming an attempt after a crash or network drop.",
		tags: ["disconnect", "internet", "network", "offline", "resume", "crash", "refresh", "lost"],
		visibility: "public",
		body: "Your answers are saved continuously and also kept on your device while offline. Reconnect, return to the dashboard and click 'Resume Exam' for the same assessment (if your instructor allows resuming). The timer, your answers and your position are restored. Use a stable connection, avoid switching networks mid-exam, and keep the laptop plugged in.",
	},
	{
		title: "Face verification and calibration fail",
		category: "face_verification",
		summary: "Getting the face check and the 3-second calibration to succeed.",
		tags: ["face", "verification", "calibration", "identity", "selfie", "not matching"],
		visibility: "public",
		body: "Sit facing the screen in a well-lit room with light in front of you (not behind), remove caps or masks, and make sure only you are in frame. Hold still during the 3-second calibration. If it keeps failing, clean the camera lens, try a different browser, or upload a clearer photo in your profile settings.",
	},
	{
		title: "Enrolment verification (college ID / fee receipt)",
		category: "account_profile",
		summary: "Uploading your proof of enrolment and getting the verified badge.",
		tags: ["verification", "college id", "fee receipt", "verified badge", "approval", "rejected"],
		visibility: "public",
		body: "Upload a clear JPG, PNG or PDF (up to 10 MB) of your college ID card or current fee receipt from the dashboard banner or registration step 3. An administrator reviews it; you get a notification when it's approved (exams unlock and the verified badge appears) or rejected with a reason (upload a new document).",
	},
	{
		title: "Questions about results and grading",
		category: "results_grading",
		summary: "Where to see scores and how to query a grade.",
		tags: ["result", "grade", "score", "marks", "evaluation", "integrity score"],
		visibility: "public",
		body: "Scores appear under Live Sessions and History once your faculty publishes or finishes evaluating the attempt. Integrity reports show flagged proctoring events with timestamps. Grade disputes are decided by your faculty — raise the ticket with the assessment name and the specific question or flag you are querying.",
	},
	{
		title: "Course materials and syllabus",
		category: "syllabus_materials",
		summary: "Missing or broken course materials and syllabus files.",
		tags: ["material", "syllabus", "download", "upload", "pdf", "course", "notes"],
		visibility: "public",
		body: "Materials are published by your faculty. If a file won't open, download it again and try a different browser or PDF viewer. If an item is missing, include the course name and topic in your ticket so it can be passed to the course faculty.",
	},
	{
		title: "Triage and priority guidelines",
		category: "other",
		summary: "How P1–P4 priorities are assigned and when to escalate (staff only).",
		tags: ["priority", "triage", "p1", "escalation", "sla"],
		visibility: "internal",
		body: "P1 Critical: exams cannot start for many students, platform outage, widespread authentication failure — respond within 15 minutes and escalate to the technical team immediately.\nP2 High: one student blocked from an active exam, camera/mic preventing participation, major feature failure — respond within 30 minutes; coordinate with the exam's faculty proctor if the attempt is paused.\nP3 Medium: materials, dashboard data, course issues — respond within 4 hours.\nP4 Low: questions and guidance — respond within 1 business day.\nNever promise grade changes or exam extensions; those are faculty decisions.",
	},
	{
		title: "Verifying a student's exam issue",
		category: "examination",
		summary: "What to check in the Student Portal Details panel (staff only).",
		tags: ["diagnostics", "verify", "heartbeat", "attempt", "proctoring events"],
		visibility: "internal",
		body: "Open View Student Portal Details: compare the reported time with the attempt's last heartbeat and last camera frame, check proctoring events around that time (pause, warnings, disconnects), and review the client diagnostics (camera/mic permission, browser, connection). Record what you confirmed as a verified finding. Do not share other students' data or the student's answers. Paused/terminated attempts can only be resumed by the faculty proctor — escalate to Examination Support with the attempt ID.",
	},
];

export async function ensureDefaultKnowledgeBase(): Promise<void> {
	const count = await prisma.knowledgeArticle.count({ where: { builtIn: true } });
	if (count > 0) return;
	await prisma.knowledgeArticle.createMany({
		data: BUILT_IN.map((a) => ({ ...a, tags: JSON.stringify(a.tags), builtIn: true })),
	});
}

export interface KbArticle {
	id: string;
	title: string;
	category: string;
	summary: string;
	body: string;
	visibility: "public" | "internal";
	tags: string[];
	updatedAt: string;
}

function toArticle(a: { id: string; title: string; category: string; summary: string; body: string; visibility: string; tags: string; updatedAt: Date }): KbArticle {
	let tags: string[] = [];
	try {
		tags = JSON.parse(a.tags);
	} catch {
		/* ignore */
	}
	return { id: a.id, title: a.title, category: a.category, summary: a.summary, body: a.body, visibility: a.visibility === "internal" ? "internal" : "public", tags, updatedAt: a.updatedAt.toISOString() };
}

const STOP = new Set("a an the and or to of in on for is it my i me we you can't cant not with this that from at be when what how why".split(" "));
function terms(s: string): string[] {
	return s
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((w) => w.length > 2 && !STOP.has(w));
}

/** Keyword retrieval (title ×3, tags ×2, summary/body ×1, category boost). */
export async function searchKnowledgeBase(params: { q?: string; category?: string; includeInternal: boolean; limit?: number }): Promise<KbArticle[]> {
	const rows = await prisma.knowledgeArticle.findMany({
		where: params.includeInternal ? {} : { visibility: "public" },
		orderBy: { updatedAt: "desc" },
	});
	const articles = rows.map(toArticle);
	const q = terms(params.q ?? "");
	if (q.length === 0 && !params.category) return articles.slice(0, params.limit ?? 100);
	const scored = articles
		.map((a) => {
			const title = terms(a.title);
			const tags = a.tags.flatMap(terms);
			const text = terms(`${a.summary} ${a.body}`);
			let score = 0;
			for (const t of q) {
				if (title.includes(t)) score += 3;
				if (tags.some((g) => g.startsWith(t) || t.startsWith(g))) score += 2;
				if (text.includes(t)) score += 1;
			}
			if (params.category && a.category === params.category) score += 2.5;
			return { a, score };
		})
		.filter((x) => x.score > 0)
		.sort((x, y) => y.score - x.score);
	return scored.slice(0, params.limit ?? 20).map((x) => x.a);
}

export async function createArticle(data: Omit<KbArticle, "id" | "updatedAt">, authorId: string): Promise<KbArticle> {
	const row = await prisma.knowledgeArticle.create({ data: { ...data, tags: JSON.stringify(data.tags), authorId } });
	return toArticle(row);
}
export async function updateArticle(id: string, data: Partial<Omit<KbArticle, "id" | "updatedAt">>): Promise<KbArticle> {
	const { tags, ...rest } = data;
	const row = await prisma.knowledgeArticle.update({
		where: { id },
		data: { ...rest, ...(tags ? { tags: JSON.stringify(tags) } : {}) },
	});
	return toArticle(row);
}
export async function deleteArticle(id: string): Promise<void> {
	await prisma.knowledgeArticle.delete({ where: { id } });
}
