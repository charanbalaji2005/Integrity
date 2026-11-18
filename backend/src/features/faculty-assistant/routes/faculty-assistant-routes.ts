import { type IRouter, type NextFunction, type Request, type Response, Router } from "express";
import { rateLimiter, requireAuth } from "@/middleware/auth-middleware";
import { chatHandler, requireVerifiedFaculty, statusHandler } from "../controllers/faculty-assistant-controller";

type Handler = (req: Request, res: Response) => Promise<void>;
const wrap = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => {
	fn(req, res).catch(next);
};

const chatLimiter = rateLimiter({
	windowMs: 60 * 1000,
	maxRequests: 20,
	message: "You're sending messages too quickly. Please wait a moment.",
});

const router: IRouter = Router();
router.use(requireAuth);

router.get("/status", wrap(statusHandler));
router.post("/chat", requireVerifiedFaculty, chatLimiter, wrap(chatHandler));

export { router as facultyAssistantRouter };
