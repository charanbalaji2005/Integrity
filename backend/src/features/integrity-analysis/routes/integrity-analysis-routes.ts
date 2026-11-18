import { type IRouter, Router } from "express";
import { analyzeSubmission } from "../controllers/integrity-analysis-controller";

const router: IRouter = Router();

router.post("/analyze", analyzeSubmission);

export { router as integrityRouter };
