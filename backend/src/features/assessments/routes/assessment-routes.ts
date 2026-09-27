import { type IRouter, Router } from "express";
import { requireAuth, requireRole } from "@/middleware/auth-middleware";
import {
	createAssessment,
	editAssessment,
	evaluateAttempt,
	getAnalytics,
	getAssessmentAuditTrail,
	getAssessmentById,
	getAssessments,
	getAttemptAuditTrail,
	getAttemptDetails,
	getAttempts,
	logViolation,
	publishAssessment,
	reEvaluateAttempt,
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
router.put("/:id", requireRole("faculty", "admin"), editAssessment);
router.post("/:id/publish", requireRole("faculty", "admin"), publishAssessment);

// Attempt actions (Students)
router.post("/:id/start", startAttempt);
router.post("/attempts/:attemptId/progress", updateProgress);
router.post("/attempts/:attemptId/violation", logViolation);
router.post("/attempts/:attemptId/submit", submitAttempt);
router.post("/attempts/:attemptId/save-state", saveAttemptState);

// Evaluation and proctoring (Faculty)
router.get("/:id/attempts", requireRole("faculty", "admin"), getAttempts);
router.get("/attempts/:attemptId", getAttemptDetails);
router.post("/attempts/:attemptId/evaluate", requireRole("faculty", "admin"), evaluateAttempt);
router.post("/attempts/:attemptId/re-evaluate", requireRole("faculty", "admin"), reEvaluateAttempt);
router.get("/attempts/:attemptId/audit", requireRole("faculty", "admin"), getAttemptAuditTrail);
router.get("/:id/audit-trail", requireRole("faculty", "admin"), getAssessmentAuditTrail);
router.get("/:id/analytics", requireRole("faculty", "admin"), getAnalytics);

export { router as assessmentRouter };
