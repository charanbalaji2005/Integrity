import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import pg from "pg";
import { env } from "../config/env";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
	const pool = new pg.Pool({
		connectionString: env.DATABASE_URL,
		// Render Postgres requires TLS for any connection originating outside
		// its own private network (e.g. a backend deployed in a different
		// Render account). Without this, pg either connects unencrypted
		// (rejected by Postgres with error 28000 "SSL/TLS required") or fails
		// certificate verification, since Render's cert isn't in the default
		// trusted CA chain.
		ssl: env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
	});
	const adapter = new PrismaPg(pool);
	return new PrismaClient({
		adapter,
		log: env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
	});
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
	globalForPrisma.prisma = prisma;
}