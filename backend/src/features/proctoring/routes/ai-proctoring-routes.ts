import { type IRouter, Router } from "express";
import { requireAuth, requireRole } from "../../../middleware/auth-middleware";
import {
	calibrateSession,
	endSession,
	facultyPause,
	facultyResume,
	facultyTerminate,
	facultyWarning,
	getReport,
	getSession,
	processFrame,
	startSession,
} from "../controllers/ai-proctoring-controller";

const router: IRouter = Router();

// Routes mapped to /api/ai-proctoring - all require authentication
router.use(requireAuth);

router.post("/start-session", startSession);
router.post("/calibrate", calibrateSession);
router.post("/process-frame", processFrame);
router.post("/end-session", endSession);
router.get("/session/:id", getSession);
router.get("/report/:attemptId", getReport);

// Faculty control actions require faculty or admin role
router.post("/faculty/resume", requireRole("faculty", "admin"), facultyResume);
router.post("/faculty/terminate", requireRole("faculty", "admin"), facultyTerminate);
router.post("/faculty/pause", requireRole("faculty", "admin"), facultyPause);
router.post("/faculty/warning", requireRole("faculty", "admin"), facultyWarning);

export { router as aiProctoringRouter };
