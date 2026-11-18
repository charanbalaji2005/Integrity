import { hashPassword, verifyPassword } from "better-auth/crypto";

async function main() {
	const password = "Temporary123!";
	const hash = await hashPassword(password);
	console.log("Hashed password:", hash);
	const isMatch = await verifyPassword({
		password,
		hash,
	});
	console.log("Is match:", isMatch);
}

main();
