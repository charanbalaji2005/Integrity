import { prisma } from "./database";

/**
 * One-off backfill: marks existing users as emailVerified so Google sign-in
 * can auto-link to accounts that were created before this fix went in.
 * Safe to run multiple times.
 *
 *   npx tsx src/backfill_email_verified.ts
 */
async function main() {
	const result = await prisma.user.updateMany({
		where: { emailVerified: false },
		data: { emailVerified: true },
	});

	console.log(`[Backfill] Marked ${result.count} existing user(s) as emailVerified.`);
}

main()
	.catch(console.error)
	.finally(() => prisma.$disconnect());