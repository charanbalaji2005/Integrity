import { prisma } from "./database";

async function main() {
	console.log("Checking DB connection and extensions...");
	try {
		// Check if we can run raw SQL query
		const extensions = (await prisma.$queryRaw`SELECT extname FROM pg_extension;`) as any[];
		console.log(
			"Existing extensions:",
			extensions.map((e) => e.extname),
		);

		// Try creating vector extension
		console.log("Testing vector extension creation...");
		await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS vector;`;
		console.log("Extension 'vector' is successfully enabled!");

		const extensionsAfter = (await prisma.$queryRaw`SELECT extname FROM pg_extension;`) as any[];
		console.log(
			"Extensions after check:",
			extensionsAfter.map((e) => e.extname),
		);

		// Test creating a dummy table with vector
		console.log("Testing temporary table with vector column...");
		await prisma.$executeRaw`CREATE TEMP TABLE temp_vector_test (id serial PRIMARY KEY, val vector(3));`;
		await prisma.$executeRaw`INSERT INTO temp_vector_test (val) VALUES ('[0.1, 0.2, 0.3]');`;
		const res = (await prisma.$queryRaw`SELECT id, val::text FROM temp_vector_test;`) as any[];
		console.log("Inserted vector successfully:", res);
	} catch (err) {
		console.error("Database check failed:", err);
	} finally {
		process.exit(0);
	}
}

main();
