import { hashPassword } from "better-auth/crypto";
import { prisma } from "./prisma";
import { seedLiveAssessments } from "./seed-live-assessments";

/**
 * Idempotent development seed.
 *
 *   pnpm seed            (or: npx tsx src/database/seed.ts)
 *
 * Creates/updates the standard IntegrityOS accounts and one proctored demo
 * assessment. Existing users are updated in place (never deleted), so their
 * attempts and messages survive re-seeding. Passwords can be overridden with
 * ADMIN_PASSWORD / SEED_FACULTY_PASSWORD / SEED_STUDENT_PASSWORD / SEED_SUPPORT_PASSWORD.
 */

interface SeedAccount {
	email: string;
	password: string;
	name: string;
	role: "admin" | "faculty" | "user" | "support";
	/** Pre-approve student verification even when not seeded as a student. */
	preApproved?: boolean;
	profile: Record<string, string>;
}

const INSTITUTION = "SRM University AP";

const ACCOUNTS: SeedAccount[] = [
	{
		email: (process.env.ADMIN_EMAIL || "admin@srmap.edu.in").toLowerCase(),
		password: process.env.ADMIN_PASSWORD || "AdminSecurePass2026!",
		name: "System Admin",
		role: "admin",
		profile: {
			institutionName: INSTITUTION,
			designation: "Platform Administrator",
			accessLevel: "full",
		},
	},
	{
		email: "faculty.test@srmap.edu.in",
		password: process.env.SEED_FACULTY_PASSWORD || "TestPassword123!",
		name: "Faculty Test",
		role: "faculty",
		profile: {
			institutionName: INSTITUTION,
			department: "CSE",
			designation: "Assistant Professor",
			academicId: "FAC-1001",
			subjects: JSON.stringify(["Data Structures", "Operating Systems"]),
		},
	},
	{
		email: "student.test@srmap.edu.in",
		password: process.env.SEED_STUDENT_PASSWORD || "TestPassword123!",
		name: "Student Test",
		role: "user",
		profile: {
			institutionName: INSTITUTION,
			department: "CSE",
			branch: "CSE",
			semester: "5",
			section: "A",
			rollNumber: "AP23110010001",
			academicId: "AP23110010001",
		},
	},
	{
		email: "consolesupport@integrityos.in",
		password: process.env.SEED_SUPPORT_PASSWORD || "ConsoleSupport@password",
		name: "Console Support",
		role: "support",
		profile: {
			institutionName: "IntegrityOS",
			designation: "Support Engineer",
		},
	},
	{
		// Default multi-portal account: same credentials work on the admin, faculty,
		// support and student portals. Its role switches to match the portal at login
		// (see MULTI_PORTAL_EMAILS in authentication-service.ts). Seeded as admin.
		email: "charanbalajineelampalli752005@gmail.com",
		password: process.env.SEED_MULTI_PORTAL_PASSWORD || "752006",
		name: "Charan Balaji",
		role: "admin",
		preApproved: true,
		profile: {
			institutionName: INSTITUTION,
			department: "CSE",
			branch: "CSE",
			semester: "5",
			section: "A",
			designation: "Platform Administrator",
			accessLevel: "full",
			academicId: "AP-MULTI-0001",
			rollNumber: "AP-MULTI-0001",
			subjects: JSON.stringify(["Data Structures", "Operating Systems"]),
		},
	},
];

async function upsertAccount(acc: SeedAccount) {
	const passwordHash = await hashPassword(acc.password);
	// The seeded demo student is pre-approved so the demo exam works out of the box.
	// Newly registered students must upload a college ID / fee receipt for admin approval.
	const verification =
		acc.role === "user" || acc.preApproved ? { verificationStatus: "approved", verifiedAt: new Date() } : {};

	const user = await prisma.user.upsert({
		where: { email: acc.email },
		update: {
			name: acc.name,
			role: acc.role,
			status: "active",
			emailVerified: true,
			failedLoginAttempts: 0,
			lockedUntil: null,
			suspendedUntil: null,
			changePasswordAtNextLogin: false,
			...verification,
			...acc.profile,
		},
		create: {
			name: acc.name,
			email: acc.email,
			role: acc.role,
			status: "active",
			emailVerified: true,
			...verification,
			...acc.profile,
		},
	});

	const existingCredential = await prisma.account.findFirst({
		where: { userId: user.id, providerId: "credential" },
	});

	if (existingCredential) {
		await prisma.account.update({
			where: { id: existingCredential.id },
			data: { password: passwordHash, accountId: acc.email },
		});
	} else {
		await prisma.account.create({
			data: {
				userId: user.id,
				accountId: acc.email,
				providerId: "credential",
				password: passwordHash,
			},
		});
	}

	return user;
}

const DEMO_ASSESSMENT_ID = "seed-demo-proctored-assessment";

async function seedDemoAssessment(facultyId: string, facultyName: string) {
	const now = new Date();
	const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

	await prisma.assessment.upsert({
		where: { id: DEMO_ASSESSMENT_ID },
		update: {
			facultyId,
			facultyName,
			published: true,
			availabilityStart: now,
			availabilityEnd: end,
		},
		create: {
			id: DEMO_ASSESSMENT_ID,
			title: "Demo: Proctored Data Structures Quiz",
			description:
				"Seeded assessment for testing live AI proctoring (webcam, face, gaze, tab-switch and behaviour monitoring).",
			duration: 30,
			availabilityStart: now,
			availabilityEnd: end,
			attemptLimit: 3,
			institutionName: INSTITUTION,
			facultyName,
			facultyId,
			published: true,
			webcamMonitoring: true,
			microphoneAnalysis: false,
			browserLockdown: true,
			faceVerification: true,
			gazeTracking: true,
			tabSwitchDetection: true,
			behavioralAnalysis: true,
			allowResume: true,
			maxResumeCount: 3,
		},
	});

	const questionCount = await prisma.question.count({
		where: { assessmentId: DEMO_ASSESSMENT_ID },
	});
	if (questionCount > 0) return;

	await prisma.question.createMany({
		data: [
			{
				assessmentId: DEMO_ASSESSMENT_ID,
				type: "multiple-choice",
				text: "What is the worst-case time complexity of searching in a balanced binary search tree?",
				options: JSON.stringify(["O(1)", "O(log n)", "O(n)", "O(n log n)"]),
				correctAnswer: "O(log n)",
				points: 2,
				difficulty: "easy",
			},
			{
				assessmentId: DEMO_ASSESSMENT_ID,
				type: "multiple-choice",
				text: "Which data structure is used to implement breadth-first search?",
				options: JSON.stringify(["Stack", "Queue", "Heap", "Hash table"]),
				correctAnswer: "Queue",
				points: 2,
				difficulty: "easy",
			},
			{
				assessmentId: DEMO_ASSESSMENT_ID,
				type: "descriptive",
				text: "Explain the difference between a process and a thread, with one example of when you would prefer each.",
				points: 5,
				difficulty: "medium",
			},
			{
				assessmentId: DEMO_ASSESSMENT_ID,
				type: "coding",
				text: "Write a function that reverses a singly linked list in place and returns the new head.",
				points: 6,
				difficulty: "medium",
			},
		],
	});
}

export async function seedDatabase(shouldExit = false) {
	try {
		console.log("[Seed] Seeding IntegrityOS accounts...");
		const users: Record<string, { id: string; name: string }> = {};
		for (const acc of ACCOUNTS) {
			const user = await upsertAccount(acc);
			users[acc.role] = user;
			console.log(`  ✓ ${acc.role.padEnd(8)} ${acc.email}`);
		}

		console.log("[Seed] Seeding demo proctored assessment...");
		await seedDemoAssessment(users.faculty.id, users.faculty.name);
		console.log(`  ✓ ${DEMO_ASSESSMENT_ID}`);

		console.log("[Seed] Seeding live proctored assessments...");
		for (const id of await seedLiveAssessments(users.faculty.id, users.faculty.name)) {
			console.log(`  ✓ ${id}`);
		}

		console.log("\n[Seed] Done. Login credentials:");
		for (const acc of ACCOUNTS) {
			console.log(`  ${acc.role.padEnd(8)} ${acc.email.padEnd(34)} ${acc.password}`);
		}
		await prisma.$disconnect();
		process.exit(0);
	} catch (error) {
		console.error("[Seed] Failed:", error);
		await prisma.$disconnect();
		process.exit(1);
	}
}

seedDatabase(true);
