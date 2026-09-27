import { type IRouter, Router } from "express";
import { analyze } from "../controllers/answer-similarity-controller";

const router: IRouter = Router();

// POST /api/answer-similarity/analyze
router.post("/analyze", analyze);

export { router as answerSimilarityRouter };
