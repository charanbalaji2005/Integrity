import { hashPassword } from "better-auth/crypto";
import { prisma } from "./database";

/**
 * Creates (or resets) the fixed support-console login.
 * Run once after deploying, e.g.:
 *   npx tsx src/create_support_console_user.ts
 */
async function main() {
	const email = "ConsoleSupport@integrityos.in".toLowerCase();
	const password = "ConsoleSupport@password";
	const name = "Console Support";
	const role = "support";

	console.log(`[Create Support User] Creating "${name}" (${email}) with role "${role}"...`);

	const existingUser = await prisma.user.findUnique({ where: { email } });

	if (existingUser) {
		console.log(`[Create Support User] User ${email} already exists. Deleting and recreating...`);
		await prisma.user.delete({ where: { id: existingUser.id } });
	}

	const newUser = await prisma.user.create({
		data: {
			name,
			email,
			role,
			status: "active",
			// Pre-verified: this is a fixed internal support login, not a
			// self-registered account, so there's no email-verification step
			// to complete. This also matters if this account is ever used
			// with Google sign-in — Better Auth won't auto-link an OAuth
			// account to a user whose emailVerified is false.
			emailVerified: true,
		},
	});

	const hashedPassword = await hashPassword(password);

	await prisma.account.create({
		data: {
			userId: newUser.id,
			accountId: email,
			providerId: "credential",
			password: hashedPassword,
		},
	});

	console.log(`[Create Support User] Success!`);
	console.log(`Email: ${email}`);
	console.log(`Password: ${password}`);
	console.log(`Role: ${role}`);
}

main()
	.catch(console.error)
	.finally(() => prisma.$disconnect());