import { auth } from "../providers/auth";
import { prisma } from "./prisma";

async function seed() {
	try {
		console.log("Seeding admin user...");
		const email = (process.env.ADMIN_EMAIL || "admin@srmap.edu.in").toLowerCase();
		const password = process.env.ADMIN_PASSWORD || "AdminSecurePass2026!";

		const existing = await prisma.user.findUnique({
			where: { email },
		});

		if (existing) {
			await prisma.user.delete({
				where: { email },
			});
			console.log("Deleted old admin user to update credentials...");
		}

		// Pre-create verification record to satisfy registration security requirement
		await prisma.verification.upsert({
			where: { id: `seed-admin-${email}` },
			update: {
				identifier: `verified-register-email:${email}`,
				value: "SEED_VERIFIED",
				expiresAt: new Date(Date.now() + 10 * 60 * 1000),
			},
			create: {
				id: `seed-admin-${email}`,
				identifier: `verified-register-email:${email}`,
				value: "SEED_VERIFIED",
				expiresAt: new Date(Date.now() + 10 * 60 * 1000),
			},
		});

		const user = await auth.api.signUpEmail({
			body: {
				email,
				password,
				name: "System Admin",
			},
		});
		console.log("Created base user with updated credentials:", user);

		const updated = await prisma.user.update({
			where: { email },
			data: { role: "admin" },
		});

		console.log("Seed successful! Admin role updated for user:", updated.email);
		process.exit(0);
	} catch (error) {
		console.error("Seed failed:", error);
		process.exit(1);
	}
}

seed();
