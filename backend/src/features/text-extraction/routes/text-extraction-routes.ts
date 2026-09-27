import { type IRouter, Router } from "express";
import { extract, extractAndChunk } from "../controllers/text-extraction-controller";

const router: IRouter = Router();

// POST /api/text-extraction/extract
router.post("/extract", extract);

// POST /api/text-extraction/extract-and-chunk
router.post("/extract-and-chunk", extractAndChunk);

export { router as textExtractionRouter };
