import { hashPassword } from "better-auth/crypto";
import { prisma } from "../../database";

/**
 * Public demo accounts shown on the login page so judges/visitors can try the
 * Student, Faculty and Support portals. One shared password, one account per
 * portal (a single shared account would have its role flipped under another
 * visitor's feet). Never usable on the admin portal.
 *
 * Isolation: demo users live in their own section (DEM-A), so demo faculty only
 * ever see the demo student, never real students. The accounts are recreated
 * and their password reset on every start, cannot change password/email/2FA,
 * and are exempt from lockout so nobody can lock judges out.
 */

export const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "DemoPortal@2026";
export const DEMO_SECTION = "DEM-A";
const INSTITUTION = "SRM University AP";

export const DEMO_ACCOUNTS = {
	student: { email: "demo.student@integrityos.app", name: "Demo Student", role: "user" },
	faculty: { email: "demo.faculty@integrityos.app", name: "Demo Faculty", role: "faculty" },
	support: { email: "demo.support@integrityos.app", name: "Demo Support", role: "support" },
} as const;

export type DemoPortal = keyof typeof DEMO_ACCOUNTS;

const DEMO_EMAILS: string[] = Object.values(DEMO_ACCOUNTS).map((a) => a.email);

export const demoEnabled = () => process.env.DEMO_ACCOUNTS_ENABLED !== "false";

export function isDemoEmail(email: string | null | undefined): boolean {
	return !!email && DEMO_EMAILS.includes(email.trim().toLowerCase());
}

/** Portal a demo email belongs to (for the "wrong portal" message). */
export function demoPortalOf(email: string): DemoPortal | null {
	const e = email.trim().toLowerCase();
	return (Object.keys(DEMO_ACCOUNTS) as DemoPortal[]).find((p) => DEMO_ACCOUNTS[p].email === e) ?? null;
}

async function upsertDemoUser(acc: (typeof DEMO_ACCOUNTS)[DemoPortal], passwordHash: string) {
	const profile = {
		name: acc.name,
		role: acc.role,
		status: "active",
		emailVerified: true,
		twoFactorEnabled: false,
		failedLoginAttempts: 0,
		lockedUntil: null,
		suspendedUntil: null,
		changePasswordAtNextLogin: false,
		verificationStatus: "approved",
		verifiedAt: new Date(),
		institutionName: INSTITUTION,
		department: "Computer Science & Engineering",
		section: DEMO_SECTION,
		...(acc.role === "user"
			? { semester: "Semester 5", branch: "CSE", rollNumber: "DEMO-STUDENT-0001", academicId: "DEMO-STUDENT-0001" }
			: { designation: acc.role === "faculty" ? "Demo Faculty" : "Demo Support Engineer", academicId: `DEMO-${acc.role.toUpperCase()}` }),
	};
	const user = await prisma.user.upsert({ where: { email: acc.email }, update: profile, create: { email: acc.email, ...profile } });
	const cred = await prisma.account.findFirst({ where: { userId: user.id, providerId: "credential" } });
	if (cred) await prisma.account.update({ where: { id: cred.id }, data: { password: passwordHash, accountId: acc.email } });
	else await prisma.account.create({ data: { userId: user.id, accountId: acc.email, providerId: "credential", password: passwordHash } });
	return user;
}

const DEMO_EXAM_ID = "demo-live-ai-proctored-exam";

/** One live, AI-proctored exam owned by demo faculty (MCQ, written and coding). */
async function ensureDemoExam(facultyId: string, facultyName: string) {
	const now = new Date();
	const window = {
		facultyId,
		facultyName,
		published: true,
		availabilityStart: new Date(now.getTime() - 60 * 60 * 1000),
		availabilityEnd: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
	};
	await prisma.assessment.upsert({
		where: { id: DEMO_EXAM_ID },
		update: window,
		create: {
			id: DEMO_EXAM_ID,
			title: "Demo: Live AI-Proctored Assessment",
			description:
				"Try the full exam flow: identity check, live webcam AI proctoring (face, gaze, tab-switch, behaviour), MCQ, written and coding questions, then AI evaluation.",
			duration: 30,
			attemptLimit: 1000,
			institutionName: INSTITUTION,
			webcamMonitoring: true,
			faceVerification: true,
			gazeTracking: true,
			tabSwitchDetection: true,
			behavioralAnalysis: true,
			browserLockdown: true,
			allowResume: true,
			maxResumeCount: 10,
			attemptResetAllowed: true,
			...window,
		},
	});
	if ((await prisma.question.count({ where: { assessmentId: DEMO_EXAM_ID } })) > 0) return;
	await prisma.question.createMany({
		data: [
			{
				assessmentId: DEMO_EXAM_ID,
				order: 0,
				type: "multiple-choice",
				text: "Which data structure gives O(1) average-time lookup by key?",
				options: JSON.stringify(["Linked list", "Hash table", "Binary heap", "Stack"]),
				correctAnswer: "Hash table",
				points: 2,
				difficulty: "easy",
			},
			{
				assessmentId: DEMO_EXAM_ID,
				order: 1,
				type: "descriptive",
				text: "Explain the difference between a process and a thread, with one example of when you would prefer each.",
				correctAnswer:
					"A process has its own address space; threads share their process's memory. Use processes for isolation (e.g. browser tabs), threads for lightweight concurrency sharing data (e.g. a web server handling requests).",
				points: 5,
				difficulty: "medium",
			},
			{
				assessmentId: DEMO_EXAM_ID,
				order: 2,
				type: "coding",
				text: "Write a program that reads an integer N and prints N! (factorial).\n\nInput: one integer 0 ≤ N ≤ 20\nOutput: N!",
				correctAnswer: "Read n, multiply 1..n into a 64-bit integer, print it.",
				points: 10,
				difficulty: "easy",
				config: JSON.stringify({
					language: "python",
					sampleInput: "5",
					sampleOutput: "120",
					testCases: [
						{ input: "5", output: "120", hidden: false },
						{ input: "0", output: "1", hidden: true },
						{ input: "10", output: "3628800", hidden: true },
						{ input: "20", output: "2432902008176640000", hidden: true },
					],
					timeLimitMs: 2000,
					memoryLimitMb: 256,
				}),
			},
		],
	});
}

/** Creates/refreshes the demo accounts and the demo exam. Safe to run on every start. */
export async function ensureDemoAccounts(): Promise<void> {
	if (!demoEnabled()) return;
	const hash = await hashPassword(DEMO_PASSWORD);
	const users = await Promise.all((Object.keys(DEMO_ACCOUNTS) as DemoPortal[]).map((p) => upsertDemoUser(DEMO_ACCOUNTS[p], hash)));
	const faculty = users[1]!;
	await ensureDemoExam(faculty.id, faculty.name);
	console.log("[Demo] Demo accounts ready (student / faculty / support).");
}

let demoIdCache: { at: number; ids: string[] } | null = null;
/** User ids of the demo accounts (cached for a minute). */
export async function demoUserIds(): Promise<string[]> {
	if (demoIdCache && Date.now() - demoIdCache.at < 60000) return demoIdCache.ids;
	const rows = await prisma.user.findMany({ where: { email: { in: DEMO_EMAILS } }, select: { id: true } });
	demoIdCache = { at: Date.now(), ids: rows.map((r) => r.id) };
	return demoIdCache.ids;
}

/** True when a support ticket was raised by a demo account (the only tickets demo support may see). */
export async function isDemoTicket(ticketId: string): Promise<boolean> {
	const t = await prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { studentId: true } });
	return !!t && (await demoUserIds()).includes(t.studentId);
}
