import { type IRouter, type NextFunction, type Request, type Response, Router } from "express";
import multer from "multer";
import { env } from "../../../config/env";
import { HTTP_STATUS } from "../../../constants/http-status";
import { requireAuth, requireRole } from "../../../middleware/auth-middleware";
import { AppError } from "../../../utils/app-error";
import {
	listRecording,
	recordingStatus,
	streamSegment,
	uploadSegment,
} from "../controllers/recording-controller";
import { baseMimeType, RECORDING_MIME_TYPES } from "../services/recording-service";

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: env.RECORDING_MAX_SEGMENT_MB * 1024 * 1024, files: 1, fields: 8 },
	fileFilter: (_req, file, cb) => {
		if (RECORDING_MIME_TYPES.has(baseMimeType(file.mimetype))) return cb(null, true);
		cb(new AppError("Recording segments must be WebM or MP4 video.", HTTP_STATUS.BAD_REQUEST));
	},
});

function singleSegment(req: Request, res: Response, next: NextFunction) {
	upload.single("segment")(req, res, (err: unknown) => {
		if (!err) return next();
		if (err instanceof multer.MulterError) {
			const msg =
				err.code === "LIMIT_FILE_SIZE"
					? `Segment is larger than ${env.RECORDING_MAX_SEGMENT_MB} MB.`
					: "Upload a single recording segment.";
			return next(new AppError(msg, HTTP_STATUS.BAD_REQUEST));
		}
		next(err);
	});
}

/** Express 5 forwards rejected promises to the error handler. */
const router: IRouter = Router();

// Mounted at /api/proctoring/recordings
router.use(requireAuth);

router.post("/:attemptId/segments", singleSegment, uploadSegment);
router.get("/:attemptId/status", recordingStatus);
router.get("/:attemptId/segments", requireRole("faculty", "admin"), listRecording);
router.get("/:attemptId/segments/:sequence", requireRole("faculty", "admin"), streamSegment);

export { router as recordingRouter };
