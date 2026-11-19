import { type IRouter, Router } from "express";
import { requireAuth, requireRole } from "@/middleware/auth-middleware";
import * as c from "../controllers/coding-controller";

/** Mounted at /api/coding. Every route needs a session; ownership/scope is enforced in services. */
const router: IRouter = Router();
router.use(requireAuth);

router.get("/health", c.healthHandler);

// Student coding workspace (attempt owner only; writes only while the attempt is in progress)
router.get("/attempts/:attemptId/questions/:questionId/workspace", requireRole("user"), c.workspaceHandler);
router.put("/attempts/:attemptId/questions/:questionId/draft", requireRole("user"), c.saveDraftHandler);
router.post("/attempts/:attemptId/questions/:questionId/run", requireRole("user"), c.runHandler);
router.post("/attempts/:attemptId/questions/:questionId/submit", requireRole("user"), c.submitHandler);
router.get("/executions/:id", c.getExecutionHandler);

// Faculty: builder sandbox + Flagged Code Submissions
const faculty = requireRole("faculty", "admin");
router.post("/faculty/run", faculty, c.facultyRunHandler);
router.get("/flags", faculty, c.listFlagsHandler);
router.get("/submissions/:submissionId/review", faculty, c.reviewHandler);
router.post("/submissions/:submissionId/actions", faculty, c.actionHandler);
router.post("/assessments/:assessmentId/reevaluate-flagged", faculty, c.reevaluateFlaggedHandler);

export { router as codingRouter };
