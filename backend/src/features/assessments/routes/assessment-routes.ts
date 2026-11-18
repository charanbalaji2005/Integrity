import { type IRouter, Router } from "express";
import { requireAuth, requireRole } from "@/middleware/auth-middleware";
import { requireDesktopDevice } from "@/utils/device";
import {
	authorizeAssessmentOwner,
	authorizeAttemptParam,
} from "../../proctoring/services/attempt-access";
import {
	createAssessment,
	editAssessment,
	evaluateAttempt,
	getAnalytics,
	getAssessmentAuditTrail,
	getAssessmentById,
	getAssessmentMaterials,
	getAssessmentResultsHandler,
	getAssessments,
	getAttemptAuditTrail,
	getAttemptDetails,
	getAttempts,
	getBuilderAssessment,
	getPublishCheck,
	logViolation,
	publishAssessment,
	reEvaluateAttempt,
	resetAttempt,
	saveAttemptState,
	startAttempt,
	submitAttempt,
	updateProgress,
} from "../controllers/assessment-controller";

const router: IRouter = Router();

// Protect all assessment endpoints with session-based authentication
router.use(requireAuth);

// Assessments list and CRUD
router.get("/", getAssessments);
router.post("/", requireRole("faculty", "admin"), createAssessment);
router.get("/:id", getAssessmentById);
router.get(
	"/:id/builder",
	requireRole("faculty", "admin"),
	authorizeAssessmentOwner(),
	getBuilderAssessment,
);
router.get(
	"/:id/publish-check",
	requireRole("faculty", "admin"),
	authorizeAssessmentOwner(),
	getPublishCheck,
);
router.get("/:id/materials", getAssessmentMaterials);
router.put("/:id", requireRole("faculty", "admin"), authorizeAssessmentOwner(), editAssessment);
router.post(
	"/:id/publish",
	requireRole("faculty", "admin"),
	authorizeAssessmentOwner(),
	publishAssessment,
);

// Attempt actions (Students)
// Exams may only be started or resumed from a laptop/desktop (not phones/tablets).
router.post("/:id/start", requireDesktopDevice, startAttempt);
router.post("/attempts/:attemptId/progress", authorizeAttemptParam("candidate"), updateProgress);
router.post("/attempts/:attemptId/violation", authorizeAttemptParam("candidate"), logViolation);
router.post("/attempts/:attemptId/submit", authorizeAttemptParam("candidate"), submitAttempt);
router.post(
	"/attempts/:attemptId/save-state",
	authorizeAttemptParam("candidate"),
	saveAttemptState,
);

// Evaluation and proctoring (Faculty)
router.get(
	"/:id/attempts",
	requireRole("faculty", "admin"),
	authorizeAssessmentOwner(),
	getAttempts,
);
router.get(
	"/attempts/:attemptId",
	authorizeAttemptParam("candidate-or-monitor"),
	getAttemptDetails,
);
router.post(
	"/attempts/:attemptId/evaluate",
	requireRole("faculty", "admin"),
	authorizeAttemptParam("monitor"),
	evaluateAttempt,
);
router.post(
	"/attempts/:attemptId/re-evaluate",
	requireRole("faculty", "admin"),
	authorizeAttemptParam("monitor"),
	reEvaluateAttempt,
);
router.post(
	"/attempts/:attemptId/reset",
	requireRole("faculty", "admin"),
	authorizeAttemptParam("monitor"),
	resetAttempt,
);
router.get(
	"/attempts/:attemptId/audit",
	requireRole("faculty", "admin"),
	authorizeAttemptParam("monitor"),
	getAttemptAuditTrail,
);
router.get(
	"/:id/audit-trail",
	requireRole("faculty", "admin"),
	authorizeAssessmentOwner(),
	getAssessmentAuditTrail,
);
router.get(
	"/:id/results",
	requireRole("faculty", "admin"),
	authorizeAssessmentOwner(),
	getAssessmentResultsHandler,
);
router.get(
	"/:id/analytics",
	requireRole("faculty", "admin"),
	authorizeAssessmentOwner(),
	getAnalytics,
);

export { router as assessmentRouter };
