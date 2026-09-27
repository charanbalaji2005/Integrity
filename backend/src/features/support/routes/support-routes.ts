import { type IRouter, Router } from "express";
import { requireAuth, requireRole } from "@/middleware/auth-middleware";
import {
	createTicket,
	getSupportAnalytics,
	getTickets,
	postMessage,
	sendSupportRegisterOtp,
	updateTicketStatus,
	verifySupportRegisterOtp,
} from "../controllers/support-controller";

const router: IRouter = Router();

// Public Support Registration OTP endpoints
// POST /api/support/send-otp
router.post("/send-otp", sendSupportRegisterOtp);

// POST /api/support/verify-otp
router.post("/verify-otp", verifySupportRegisterOtp);

// Protected Support endpoints
// GET /api/support/tickets
router.get("/tickets", requireAuth, getTickets);

// POST /api/support/tickets
router.post("/tickets", requireAuth, createTicket);

// POST /api/support/tickets/:ticketId/messages
router.post("/tickets/:ticketId/messages", requireAuth, postMessage);

// POST /api/support/tickets/:ticketId/status
router.post(
	"/tickets/:ticketId/status",
	requireAuth,
	requireRole("support", "admin"),
	updateTicketStatus,
);

// GET /api/support/analytics
router.get("/analytics", requireAuth, requireRole("support", "admin"), getSupportAnalytics);

export { router as supportRouter };
