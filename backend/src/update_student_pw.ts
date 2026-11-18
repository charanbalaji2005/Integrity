import { hashPassword } from "better-auth/crypto";
import { prisma } from "./database";

async function main() {
	const email = "student.test@srmap.edu.in";
	const password = "TestPassword123!";
	const hash = await hashPassword(password);

	console.log(`[Update Password] Hashing password for ${email}...`);
	console.log(`New Hash: ${hash}`);

	const account = await prisma.account.findFirst({
		where: { accountId: email },
	});

	if (account) {
		await prisma.account.update({
			where: { id: account.id },
			data: { password: hash },
		});
		console.log("[Update Password] Success! Password updated in the database.");
	} else {
		console.log("[Update Password] Account not found!");
	}
}

main()
	.catch(console.error)
	.finally(() => prisma.$disconnect());
