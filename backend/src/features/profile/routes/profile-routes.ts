import { type IRouter, Router } from "express";
import { requireAuth } from "@/middleware/auth-middleware";
import {
	changePassword,
	getActivityHistory,
	getProfile,
	getSessions,
	revokeSession,
	toggle2FA,
	updateProfile,
} from "../controllers/profile-controller";

const router: IRouter = Router();

// Protect all profile routes with authentication
router.use(requireAuth);

// GET /api/profile
router.get("/", getProfile);

// PUT /api/profile
router.put("/", updateProfile);

// PUT /api/profile/password
router.put("/password", changePassword);

// POST /api/profile/2fa
router.post("/2fa", toggle2FA);

// GET /api/profile/history
router.get("/history", getActivityHistory);

// GET /api/profile/sessions
router.get("/sessions", getSessions);

// DELETE /api/profile/sessions/:id
router.delete("/sessions/:id", revokeSession);

export { router as profileRouter };
