import { type IRouter, type NextFunction, type Request, type Response, Router } from "express";
import multer from "multer";
import { HTTP_STATUS } from "@/constants/http-status";
import { rateLimiter, requireAuth } from "@/middleware/auth-middleware";
import { AppError } from "@/utils/app-error";
import {
	createConversationHandler,
	deleteConversationHandler,
	getConversationHandler,
	listAssessmentsHandler,
	listConversationsHandler,
	regenerateHandler,
	sendMessageHandler,
	updateConversationHandler,
	uploadAttachmentHandler,
} from "../controllers/copilot-controller";
import {
	chatHandler,
	requireVerifiedFaculty,
	statusHandler,
} from "../controllers/faculty-assistant-controller";
import { MAX_ATTACHMENT_BYTES } from "../services/attachments";

type Handler = (req: Request, res: Response) => Promise<void>;
const wrap = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => {
	fn(req, res).catch(next);
};

const chatLimiter = rateLimiter({
	windowMs: 60 * 1000,
	maxRequests: 20,
	message: "You're sending messages too quickly. Please wait a moment.",
});
const uploadLimiter = rateLimiter({
	windowMs: 60 * 1000,
	maxRequests: 15,
	message: "Too many uploads. Please wait a moment.",
});

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 },
});
function singleFile(req: Request, res: Response, next: NextFunction) {
	upload.single("file")(req, res, (err: unknown) => {
		if (!err) return next();
		if (err instanceof multer.MulterError) {
			return next(
				new AppError(
					err.code === "LIMIT_FILE_SIZE"
						? "Files must be 20 MB or smaller."
						: "Upload one file at a time.",
					HTTP_STATUS.BAD_REQUEST,
				),
			);
		}
		next(err);
	});
}

const router: IRouter = Router();
router.use(requireAuth);

router.get("/status", wrap(statusHandler));
// Legacy single-shot chat (kept for compatibility)
router.post("/chat", requireVerifiedFaculty, chatLimiter, wrap(chatHandler));

// Vigil copilot workspace
router.use(requireVerifiedFaculty);
router.get("/assessments", wrap(listAssessmentsHandler));
router.get("/conversations", wrap(listConversationsHandler));
router.post("/conversations", wrap(createConversationHandler));
router.get("/conversations/:id", wrap(getConversationHandler));
router.patch("/conversations/:id", wrap(updateConversationHandler));
router.delete("/conversations/:id", wrap(deleteConversationHandler));
router.post("/conversations/:id/messages", chatLimiter, wrap(sendMessageHandler));
router.post("/conversations/:id/regenerate", chatLimiter, wrap(regenerateHandler));
router.post("/attachments", uploadLimiter, singleFile, wrap(uploadAttachmentHandler));

export { router as facultyAssistantRouter };
