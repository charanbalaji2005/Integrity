import { type IRouter, Router } from "express";
import { requireAuth } from "@/middleware/auth-middleware";
import {
	createNotification,
	deleteNotification,
	getNotifications,
	markAllRead,
	markRead,
} from "../controllers/notification-controller";

const router: IRouter = Router();

// Protect all notification routes with authentication
router.use(requireAuth);

// GET /api/notifications
router.get("/", getNotifications);

// POST /api/notifications
router.post("/", createNotification);

// POST /api/notifications/mark-read
router.post("/mark-read", markAllRead);

// POST /api/notifications/:id/read
router.post("/:id/read", markRead);

// DELETE /api/notifications/:id
router.delete("/:id", deleteNotification);

export { router as notificationRouter };
