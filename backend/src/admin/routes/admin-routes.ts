import { fromNodeHeaders } from "better-auth/node";
import { type IRouter, Router } from "express";
import { HTTP_STATUS } from "@/constants/http-status";
import { prisma } from "@/database";
import { auth } from "@/providers/auth";
import { AppError } from "@/utils/app-error";
import {
	createFacultyHandler,
	createStudentHandler,
	deleteUserHandler,
	editUserHandler,
	forceLogoutUserHandler,
	forcePasswordResetHandler,
	getAdminAuditLogsHandler,
	getAgentStatusHandler,
	getAssessmentsComplianceHandler,
	getDashboardStatsHandler,
	getLiveSessionsHandler,
	getSettingsHandler,
	getSocAlertsHandler,
	getSystemHealthHandler,
	getUserLogsHandler,
	getUsersHandler,
	lockUserHandler,
	resetAllStudentRisksHandler,
	resetUserPasswordHandler,
	simulateSecurityEventHandler,
	suspendUserHandler,
	tempSuspendUserHandler,
	toggleTwoFactorHandler,
	triggerSelfHealHandler,
	unlockUserHandler,
	unsuspendUserHandler,
	updateSettingsHandler,
	updateUserRoleHandler,
	verifyEmailHandler,
} from "../controllers/admin-controller";

const router: IRouter = Router();

async function adminMiddleware(req: any, res: any, next: any) {
	try {
		const sessionData = await auth.api.getSession({
			headers: fromNodeHeaders(req.headers),
		});

		if (sessionData?.user) {
			const user = await prisma.user.findUnique({
				where: {
					id: sessionData.user.id,
				},
			});

			if (user && (user.role === "admin" || user.role === "support")) {
				req.user = user;
				req.session = sessionData.session;
				return next();
			}
		}

		throw new AppError("Unauthorized: Administrator privileges required", HTTP_STATUS.UNAUTHORIZED);
	} catch (err: any) {
		if (err instanceof AppError) return next(err);
		return next(new AppError("Unauthorized: Administrator privileges required", HTTP_STATUS.UNAUTHORIZED));
	}
}

// Protect all admin routes
router.use(adminMiddleware);

// Users
router.get("/users", getUsersHandler);
router.get("/users/:id/logs", getUserLogsHandler);
router.post("/users/:id/suspend", suspendUserHandler);
router.post("/users/:id/unsuspend", unsuspendUserHandler);
router.post("/users/:id/temp-suspend", tempSuspendUserHandler);
router.post("/users/:id/role", updateUserRoleHandler);
router.delete("/users/:id", deleteUserHandler);

// Platform settings
router.get("/settings", getSettingsHandler);
router.post("/settings", updateSettingsHandler);

// Security
router.post("/security/reset-risks", resetAllStudentRisksHandler);
router.post("/security/simulate-event", simulateSecurityEventHandler);

// Diagnostics
router.get("/health", getSystemHealthHandler);
router.get("/agents", getAgentStatusHandler);
router.get("/assessments", getAssessmentsComplianceHandler);
router.get("/audit-logs", getAdminAuditLogsHandler);
router.post("/self-heal", triggerSelfHealHandler);
router.get("/dashboard-stats", getDashboardStatsHandler);
router.get("/live-sessions", getLiveSessionsHandler);
router.get("/soc-alerts", getSocAlertsHandler);

// User creation
router.post("/users/student", createStudentHandler);
router.post("/users/faculty", createFacultyHandler);

// User management
router.put("/users/:id", editUserHandler);
router.post("/users/:id/lock", lockUserHandler);
router.post("/users/:id/toggle-2fa", toggleTwoFactorHandler);
router.post("/users/:id/verify-email", verifyEmailHandler);
router.post("/users/:id/force-password-reset", forcePasswordResetHandler);
router.post("/users/:id/reset-password", resetUserPasswordHandler);
router.post("/users/:id/force-logout", forceLogoutUserHandler);
router.post("/users/:id/unlock", unlockUserHandler);

export { router as adminRouter };
