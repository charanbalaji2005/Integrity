import { type IRouter, type NextFunction, type Request, type Response, Router } from "express";
import multer from "multer";
import { HTTP_STATUS } from "@/constants/http-status";
import { requireAuth, requireRole } from "@/middleware/auth-middleware";
import { AppError } from "@/utils/app-error";
import { isDemoEmail, isDemoTicket } from "../../demo/demo-accounts";
import {
	sendSupportRegisterOtp,
	suggestReply,
	verifySupportRegisterOtp,
} from "../controllers/support-controller";
import * as hub from "../controllers/support-hub-controller";

const router: IRouter = Router();
const staffOnly = requireRole("support", "admin");

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 10 * 1024 * 1024, files: 5 },
});
/** Multer with clear 400s; `max` files in the "files" field. */
function filesUpload(max: number) {
	return (req: Request, res: Response, next: NextFunction) => {
		upload.array("files", max)(req, res, (err: unknown) => {
			if (!err) return next();
			if (err instanceof multer.MulterError) {
				const msg =
					err.code === "LIMIT_FILE_SIZE"
						? "Each file must be 10 MB or smaller."
						: err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE"
							? `You can attach up to ${max} files.`
							: "Upload failed.";
				return next(new AppError(msg, HTTP_STATUS.BAD_REQUEST));
			}
			next(err);
		});
	};
}

// ── Public: support staff registration OTP ───────────────────────────────
router.post("/send-otp", sendSupportRegisterOtp);
router.post("/verify-otp", verifySupportRegisterOtp);

// ── Attachments via short-lived signed URL (usable in <img>/<a>) ─────────
router.get("/attachments/:id/download", hub.downloadAttachmentHandler);

// ── Everything below requires a session ──────────────────────────────────
router.use(requireAuth);

// The public demo support account may only work on tickets raised by demo
// accounts, and never sees cross-student data (analytics, staff directory).
async function demoTicketGuard(req: Request, _res: Response, next: NextFunction, id: string) {
	try {
		if (
			isDemoEmail(req.user?.email) &&
			req.path.startsWith("/tickets/") &&
			!(await isDemoTicket(id))
		) {
			return next(new AppError("Ticket not found.", HTTP_STATUS.NOT_FOUND));
		}
		next();
	} catch (err) {
		next(err);
	}
}
router.param("id", demoTicketGuard);
router.param("ticketId", demoTicketGuard);
router.use(["/analytics", "/staff"], (req, _res, next) => {
	if (isDemoEmail(req.user?.email)) {
		return next(
			new AppError(
				"Not available on the demo account (it would show real student data).",
				HTTP_STATUS.FORBIDDEN,
			),
		);
	}
	next();
});

// Knowledge base (students: public articles; staff: + internal)
router.get("/kb", hub.kbListHandler);
router.post("/kb", staffOnly, hub.kbCreateHandler);
router.put("/kb/:id", staffOnly, hub.kbUpdateHandler);
router.delete("/kb/:id", staffOnly, hub.kbDeleteHandler);

// Student Support Center
router.get("/tickets/my", hub.myTicketsHandler);
router.post("/tickets", filesUpload(5), hub.createTicketHandler);
router.get("/tickets", hub.listTicketsHandler); // legacy list (role-aware)

// Staff queue & profile
router.get("/queue", staffOnly, hub.queueHandler);
router.get("/me", staffOnly, hub.meHandler);
router.put("/me/availability", staffOnly, hub.myAvailabilityHandler);

// Ticket detail + conversation (owner or staff; permissions enforced in the service)
router.get("/tickets/:id", hub.getTicketHandler);
router.post("/tickets/:id/messages", filesUpload(3), hub.postMessageHandler);

// Student ticket actions
router.post("/tickets/:id/close", hub.closeHandler);
router.post("/tickets/:id/rate", hub.rateHandler);
router.post("/tickets/:id/reopen", hub.reopenHandler);

// Staff ticket actions
router.post("/tickets/:id/accept", staffOnly, hub.acceptHandler);
router.post("/tickets/:id/reassign", staffOnly, hub.reassignHandler);
router.post("/tickets/:id/escalate", staffOnly, hub.escalateHandler);
router.post("/tickets/:id/resolve", staffOnly, hub.resolveHandler);
router.post("/tickets/:id/priority", staffOnly, hub.priorityHandler);
router.post("/tickets/:id/return-to-ai", staffOnly, hub.returnToAiHandler);
router.post("/tickets/:id/internal-notes", staffOnly, hub.internalNoteHandler);
router.post("/tickets/:id/copilot", staffOnly, hub.copilotHandler);
router.get("/tickets/:id/student-context", staffOnly, hub.studentContextHandler);
router.post("/tickets/:ticketId/ai-suggest", staffOnly, suggestReply);

// Staff management (supervisor checks inside handlers)
router.get("/staff", staffOnly, hub.listStaffHandler);
router.post("/staff", staffOnly, hub.createStaffHandler);
router.put("/staff/:id", staffOnly, hub.updateStaffHandler);
router.put("/staff/:id/availability", staffOnly, hub.staffAvailabilityHandler);

// Settings & analytics
router.get("/settings", staffOnly, hub.getSettingsHandler);
router.put("/settings", staffOnly, hub.updateSettingsHandler);
router.get("/analytics", staffOnly, hub.analyticsHandler);
router.get("/analytics/export", staffOnly, hub.analyticsExportHandler);

export { router as supportRouter };
