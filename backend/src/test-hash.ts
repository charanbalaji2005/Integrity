import { auth } from "./providers/auth";

async function main() {
	console.log("Checking Better Auth password utility...");
	try {
		const hasPasswordApi = auth.api && typeof auth.api.resetPassword === "function";
		console.log("auth.api.resetPassword exists:", hasPasswordApi);

		// Check if we can hash using Better Auth's internal password helper
		const crypto = (auth as any).password;
		console.log("auth.password helper exists:", !!crypto);
		if (crypto && typeof crypto.hash === "function") {
			const hash = await crypto.hash("test-password");
			console.log("Generated hash successfully:", hash);
		}
	} catch (err) {
		console.error("Hash check failed:", err);
	}
	process.exit(0);
}

main();
