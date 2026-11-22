import { type IRouter, Router } from "express";
import { requireAuth } from "@/middleware/auth-middleware";
import {
	createChatRequest,
	deleteMessage,
	forwardMessage,
	getChatRequests,
	getContacts,
	getFacultyList,
	getMessages,
	handleChatRequestAction,
	markMessagesAsRead,
	pinMessage,
	reactToMessage,
} from "../controllers/chat-controller";
import { postAnnouncement } from "../controllers/announcement-controller";
import {
	deleteFriend,
	friendRequestAction,
	getClassmates,
	getFriendRequests,
	postFriendRequest,
} from "../controllers/friend-controller";

const router: IRouter = Router();

// Protect all chat routes with authentication
router.use(requireAuth);

// GET /api/chat/messages
router.get("/messages", getMessages);

// POST /api/chat/messages/read
router.post("/messages/read", markMessagesAsRead);

// POST /api/chat/messages/:id/react
router.post("/messages/:id/react", reactToMessage);

// POST /api/chat/messages/:id/pin
router.post("/messages/:id/pin", pinMessage);

// POST /api/chat/messages/:id/delete
router.post("/messages/:id/delete", deleteMessage);

// POST /api/chat/messages/:id/forward
router.post("/messages/:id/forward", forwardMessage);

// POST /api/chat/announcements (faculty → own sections; admins → anywhere)
router.post("/announcements", postAnnouncement);

// GET /api/chat/faculty
router.get("/faculty", getFacultyList);

// GET /api/chat/contacts
router.get("/contacts", getContacts);

// GET /api/chat/requests
router.get("/requests", getChatRequests);

// POST /api/chat/requests
router.post("/requests", createChatRequest);

// POST /api/chat/requests/:id/action
router.post("/requests/:id/action", handleChatRequestAction);

// Student friend requests (classmates only)
router.get("/classmates", getClassmates);
router.get("/friend-requests", getFriendRequests);
router.post("/friend-requests", postFriendRequest);
router.post("/friend-requests/:id/action", friendRequestAction);
router.delete("/friends/:userId", deleteFriend);

export { router as chatRouter };
