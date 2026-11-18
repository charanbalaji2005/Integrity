import { type IRouter, Router } from "express";
import { requireAuth } from "../../../middleware/auth-middleware";
import { faceCheck } from "../controllers/proctoring-controller";

const router: IRouter = Router();

// POST /api/proctoring/face-check
router.post("/face-check", requireAuth, faceCheck);

export { router as proctoringRouter };
