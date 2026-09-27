import { hashPassword } from "better-auth/crypto";
import { prisma } from "./database";

async function main() {
	console.log("Checking if simulated student exists...");
	const user = await prisma.user.findFirst({
		where: { email: "simulated.student@srmap.edu.in" },
	});

	if (user) {
		console.log("Simulated student found. Updating credential password...");
		const hashedPassword = await hashPassword("SimulatedPassword123");

		// Find credential account
		const account = await prisma.account.findFirst({
			where: {
				userId: user.id,
				providerId: "credential",
			},
		});

		if (account) {
			await prisma.account.update({
				where: { id: account.id },
				data: { password: hashedPassword },
			});
			console.log("Hashed password updated successfully!");
		} else {
			await prisma.account.create({
				data: {
					userId: user.id,
					accountId: "simulated.student@srmap.edu.in",
					providerId: "credential",
					password: hashedPassword,
				},
			});
			console.log("Hashed credential account created successfully!");
		}
	} else {
		console.log("Simulated student not found in DB.");
	}
}

main()
	.catch(console.error)
	.finally(() => prisma.$disconnect());
