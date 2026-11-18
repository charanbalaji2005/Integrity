import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import pg from "pg";
import { env } from "../config/env";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// Clean connection string (e.g. strip channel_binding=require if present since pg driver handles TLS directly)
function sanitizeConnectionString(rawUrl: string): string {
	return rawUrl.replace(/&channel_binding=[^&]+/g, "").replace(/\?channel_binding=[^&]+&?/g, "?").replace(/\?$/, "");
}

function createPrismaClient() {
	const targetUrl = sanitizeConnectionString(env.DATABASE_URL);
	const isLocal = targetUrl.includes("localhost") || targetUrl.includes("127.0.0.1");

	const pool = new pg.Pool({
		connectionString: targetUrl,
		ssl: isLocal ? false : { rejectUnauthorized: false },
	});
	const adapter = new PrismaPg(pool);
	return new PrismaClient({
		adapter,
		log: env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
	});
}

export const isCloudNeon = env.DATABASE_URL.includes("neon.tech");
export const databaseDetails = {
	provider: isCloudNeon ? "Neon Cloud Serverless PostgreSQL" : "Local PostgreSQL",
	endpoint: isCloudNeon
		? "ep-autumn-rain-bbbc2wdc-pooler.c-15.us-east-1.aws.neon.tech"
		: "localhost:5432/integrity",
	database: "neondb",
	aiMemoryStore: "Cloud pgvector & PostgreSQL Timeline",
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
	globalForPrisma.prisma = prisma;
}