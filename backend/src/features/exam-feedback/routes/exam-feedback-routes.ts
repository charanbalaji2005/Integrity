import { type IRouter, type NextFunction, type Request, type Response, Router } from "express";
import { requireAuth, requireRole } from "@/middleware/auth-middleware";
import { listFeedbackHandler, submitFeedbackHandler } from "../controllers/exam-feedback-controller";

type Handler = (req: Request, res: Response) => Promise<void>;
const wrap = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => {
	fn(req, res).catch(next);
};

const router: IRouter = Router();
router.use(requireAuth);

// Student: submit feedback for their own submitted attempt
router.post("/", wrap(submitFeedbackHandler));

// Admin: view all feedback with aggregate stats
router.get("/admin", requireRole("admin", "support"), wrap(listFeedbackHandler));

export { router as examFeedbackRouter };
