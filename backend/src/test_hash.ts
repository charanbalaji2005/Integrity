import { hashPassword } from "better-auth/crypto";

async function run() {
	const password = "TestPassword123!";
	const hash = await hashPassword(password);
	console.log("Password:", password);
	console.log("Hash:", hash);
}

run();
