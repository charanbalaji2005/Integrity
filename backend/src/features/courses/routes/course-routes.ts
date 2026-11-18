import { type IRouter, type NextFunction, type Request, type Response, Router } from "express";
import multer from "multer";
import { HTTP_STATUS } from "@/constants/http-status";
import { requireAuth, requireRole } from "@/middleware/auth-middleware";
import { AppError } from "@/utils/app-error";
import * as c from "../controllers/course-controller";
import { MAX_UPLOAD_BYTES } from "../services/file-storage";

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

/** Single optional "file" field with clear 400s instead of multer's raw errors. */
function singleFile(req: Request, res: Response, next: NextFunction) {
	upload.single("file")(req, res, (err: unknown) => {
		if (!err) return next();
		if (err instanceof multer.MulterError) {
			return next(
				new AppError(
					err.code === "LIMIT_FILE_SIZE" ? "File is larger than 25 MB." : "Upload a single file.",
					HTTP_STATUS.BAD_REQUEST,
				),
			);
		}
		next(err);
	});
}

const staff = requireRole("faculty", "admin");
const router: IRouter = Router();
router.use(requireAuth);

// Question images (students load them while taking an exam)
router.post("/files", staff, singleFile, c.uploadQuestionImage);
router.get("/files/:fileId", c.questionImage);

// Syllabi
router.put("/syllabi/:syllabusId/structure", staff, c.saveSyllabusStructure);
router.delete("/syllabi/:syllabusId", staff, c.deleteSyllabus);
router.get("/syllabi/:syllabusId/file", staff, c.downloadSyllabus);

// Materials (file route also serves students, with per-assessment access rules)
router.patch("/materials/:materialId", staff, singleFile, c.updateMaterial);
router.delete("/materials/:materialId", staff, c.deleteMaterial);
router.get("/materials/:materialId/file", c.materialFile);

// Courses
router.get("/", staff, c.listCourses);
router.post("/", staff, c.createCourse);
router.get("/:id", staff, c.getCourse);
router.post("/:id/syllabi", staff, singleFile, c.uploadSyllabus);
router.post("/:id/syllabi/manual", staff, c.createManualSyllabus);
router.post("/:id/materials", staff, singleFile, c.createMaterial);

export { router as courseRouter };
