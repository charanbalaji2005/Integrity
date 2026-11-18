import { hashPassword } from "better-auth/crypto";

async function main() {
	console.log("Checking better-auth/crypto hashPassword...");
	try {
		const hash = await hashPassword("Temporary123!");
		console.log("Generated hash:", hash);
		console.log("Hash type:", typeof hash);
	} catch (err) {
		console.error("Failed to hash password:", err);
	}
	process.exit(0);
}

main();
