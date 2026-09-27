import { type IRouter, Router } from "express";
import multer from "multer";
import { requireAuth } from "../../../middleware/auth-middleware";
import { analyzeDocument } from "../controllers/plagiarism-controller";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

// POST /api/plagiarism/analyze-document
router.post("/analyze-document", requireAuth, upload.single("document"), analyzeDocument);

export { router as plagiarismRouter };
