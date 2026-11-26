import { type IRouter, type NextFunction, type Request, type Response, Router } from "express";
import multer from "multer";
import { HTTP_STATUS } from "../../../constants/http-status";
import { requireAuth, requireRole } from "../../../middleware/auth-middleware";
import { AppError } from "../../../utils/app-error";
import {
	approveRequestHandler,
	getDocumentHandler,
	getMyVerificationHandler,
	listRequestsHandler,
	rejectRequestHandler,
	submitDocumentHandler,
} from "../controllers/verification-controller";
import { ALLOWED_MIME_TYPES, MAX_DOCUMENT_BYTES } from "../services/verification-service";

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 },
	fileFilter: (_req, file, cb) => {
		if (ALLOWED_MIME_TYPES.has(file.mimetype)) return cb(null, true);
		cb(new AppError("Upload a JPG, PNG or PDF file.", HTTP_STATUS.BAD_REQUEST));
	},
});

/** Runs multer and maps its errors (size/type) to clear 400 responses. */
function singleDocument(req: Request, res: Response, next: NextFunction) {
	upload.single("document")(req, res, (err: unknown) => {
		if (!err) return next();
		if (err instanceof multer.MulterError) {
			const msg =
				err.code === "LIMIT_FILE_SIZE" ? "File is larger than 10 MB." : "Upload a single document.";
			return next(new AppError(msg, HTTP_STATUS.BAD_REQUEST));
		}
		next(err);
	});
}

const router: IRouter = Router();
router.use(requireAuth);

// Student
router.get("/me", getMyVerificationHandler);
router.post("/documents", singleDocument, submitDocumentHandler);

// Administrator review
router.get("/admin/requests", requireRole("admin", "support"), listRequestsHandler);
router.get("/admin/requests/:id/document", requireRole("admin", "support"), getDocumentHandler);
router.post("/admin/requests/:id/approve", requireRole("admin"), approveRequestHandler);
router.post("/admin/requests/:id/reject", requireRole("admin"), rejectRequestHandler);

export { router as verificationRouter };
