import { type IRouter, type NextFunction, type Request, type Response, Router } from "express";
import multer from "multer";
import { HTTP_STATUS } from "../../../constants/http-status";
import { requireAuth } from "../../../middleware/auth-middleware";
import { AppError } from "../../../utils/app-error";
import {
	checkSimilarity,
	getReportHandler,
	listReportsHandler,
} from "../controllers/plagiarism-controller";

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

/** Multer with clear 400s for oversized/multiple files. */
function optionalDocument(req: Request, res: Response, next: NextFunction) {
	upload.single("document")(req, res, (err: unknown) => {
		if (!err) return next();
		if (err instanceof multer.MulterError) {
			return next(
				new AppError(
					err.code === "LIMIT_FILE_SIZE"
						? "File is larger than 10 MB."
						: "Upload a single document.",
					HTTP_STATUS.BAD_REQUEST,
				),
			);
		}
		next(err);
	});
}

const router: IRouter = Router();
router.use(requireAuth);

// Turnitin-style similarity check
router.post("/check", optionalDocument, checkSimilarity);
// Legacy path (same handler and response shape)
router.post("/analyze-document", optionalDocument, checkSimilarity);

router.get("/reports", listReportsHandler);
router.get("/reports/:id", getReportHandler);

export { router as plagiarismRouter };
