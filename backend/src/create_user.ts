import { hashPassword } from "better-auth/crypto";
import { prisma } from "./database";

async function main() {
	const usersToCreate = [
		{
			email: "student.test@srmap.edu.in",
			password: "TestPassword123!",
			name: "Student Test",
			role: "user",
		},
		{
			email: "faculty.test@srmap.edu.in",
			password: "TestPassword123!",
			name: "Faculty Test",
			role: "faculty",
		},
	];

	for (const item of usersToCreate) {
		console.log(
			`[Create User] Creating user "${item.name}" (${item.email}) with role "${item.role}"...`,
		);

		// Delete existing if any
		const existingUser = await prisma.user.findUnique({
			where: { email: item.email },
		});

		if (existingUser) {
			console.log(`[Create User] User ${item.email} already exists. Deleting...`);
			await prisma.user.delete({
				where: { id: existingUser.id },
			});
		}

		// Create User
		const newUser = await prisma.user.create({
			data: {
				name: item.name,
				email: item.email,
				role: item.role,
				status: "active",
				emailVerified: true,
			},
		});

		// Hash Password
		const hashedPassword = await hashPassword(item.password);

		// Create Account
		await prisma.account.create({
			data: {
				userId: newUser.id,
				accountId: item.email,
				providerId: "credential",
				password: hashedPassword,
			},
		});

		console.log(`[Create User] Success! User and Account created.`);
		console.log(`Email: ${item.email}`);
		console.log(`Password: ${item.password}\n`);
	}
}

main()
	.catch(console.error)
	.finally(() => prisma.$disconnect());
