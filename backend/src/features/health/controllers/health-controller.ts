import type { Request, Response } from "express";
import { getPlatformState } from "../../../admin/services/platform-state";
import { env } from "../../../config/env";
import { prisma } from "../../../database";

export async function getHealth(req: Request, res: Response) {
	const uptime = process.uptime();

	let dbStatus: "healthy" | "unhealthy" = "unhealthy";
	try {
		await prisma.$queryRaw`SELECT 1`;
		dbStatus = "healthy";
	} catch {
		dbStatus = "unhealthy";
	}

	const status = dbStatus === "healthy" ? "healthy" : "degraded";

	const ip = (req.headers["x-forwarded-for"] as string) ?? req.socket.remoteAddress ?? "127.0.0.1";

	const userAgent = req.headers["user-agent"] ?? "Unknown";

	const platformState = getPlatformState();

	res.status(200).json({
		success: true,
		status,
		timestamp: new Date().toISOString(),
		environment: env.NODE_ENV,
		uptime: Math.floor(uptime),
		services: {
			database: dbStatus,
		},
		client: {
			ip,
			userAgent,
		},
		maintenanceMode: platformState.maintenanceMode,
		emergencyShutdown: platformState.emergencyShutdown,
		studentPortalEnabled: platformState.studentPortalEnabled,
		facultyPortalEnabled: platformState.facultyPortalEnabled,
		adminPortalEnabled: platformState.adminPortalEnabled,
	});
}
