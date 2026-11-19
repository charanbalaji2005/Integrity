import { type IRouter, type NextFunction, type Request, type Response, Router } from "express";
import multer from "multer";
import { HTTP_STATUS } from "@/constants/http-status";
import { getAuthUser, requireAuth } from "@/middleware/auth-middleware";
import { AppError } from "@/utils/app-error";
import { sendSuccess } from "@/utils/response";
import { contentDisposition, FILE_RULES, type UploadedFile } from "../../courses/services/file-storage";
import * as service from "../services/study-material-service";

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: FILE_RULES.study.maxBytes, files: 1 },
});

function singleFile(req: Request, res: Response, next: NextFunction) {
	upload.single("file")(req, res, (err: unknown) => {
		if (!err) return next();
		if (err instanceof multer.MulterError) {
			return next(
				new AppError(
					err.code === "LIMIT_FILE_SIZE" ? "PDF is larger than 25 MB." : "Upload a single PDF file.",
					HTTP_STATUS.BAD_REQUEST,
				),
			);
		}
		next(err);
	});
}

const wrap =
	(fn: (req: Request, res: Response) => Promise<unknown>) =>
	(req: Request, res: Response, next: NextFunction) =>
		fn(req, res).catch(next);

const param = (req: Request, name: string) => {
	const v = req.params[name];
	return Array.isArray(v) ? v[0] : String(v ?? "");
};

const router: IRouter = Router();
router.use(requireAuth);

// GET /api/study-materials — materials visible to the caller
router.get(
	"/",
	wrap(async (req, res) => {
		sendSuccess(res, await service.listMaterials(getAuthUser(req)));
	}),
);

// POST /api/study-materials — multipart: file (PDF), title, description, section, semester
router.post(
	"/",
	singleFile,
	wrap(async (req, res) => {
		const created = await service.createMaterial(
			getAuthUser(req),
			req.body,
			(req as Request & { file?: UploadedFile }).file,
		);
		sendSuccess(res, created, "Study material published", HTTP_STATUS.CREATED);
	}),
);

// GET /api/study-materials/:id — metadata (used by shared links)
router.get(
	"/:id",
	wrap(async (req, res) => {
		const { fileId: _fileId, ...m } = await service.getAccessibleMaterial(getAuthUser(req), param(req, "id"));
		sendSuccess(res, m);
	}),
);

// GET /api/study-materials/:id/file[?download=1] — the PDF itself
router.get(
	"/:id/file",
	wrap(async (req, res) => {
		const { file } = await service.getMaterialFile(getAuthUser(req), param(req, "id"));
		const download = req.query.download === "1";
		res.setHeader("Content-Type", file.mimeType);
		res.setHeader("Content-Length", String(file.sizeBytes));
		res.setHeader("Content-Disposition", contentDisposition(download ? "attachment" : "inline", file.fileName));
		res.setHeader("Cache-Control", "private, max-age=300");
		res.setHeader("X-Content-Type-Options", "nosniff");
		res.end(Buffer.from(file.data));
	}),
);

// DELETE /api/study-materials/:id — uploader or admin
router.delete(
	"/:id",
	wrap(async (req, res) => {
		await service.deleteMaterial(getAuthUser(req), param(req, "id"));
		sendSuccess(res, null, "Study material deleted");
	}),
);

export { router as studyMaterialRouter };
