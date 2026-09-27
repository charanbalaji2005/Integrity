import { type IRouter, Router } from "express";
import { rateLimiter, requireAuth } from "@/middleware/auth-middleware";
import {
	forgotPassword,
	googleOAuth,
	linkCredentials,
	login,
	logoutUser,
	magicLink,
	sendRegisterOtpHandler,
	verifyOtp,
	verifyRegisterOtpHandler,
} from "../controllers/authentication-controller";

const router: IRouter = Router();

// Rate limiter: 10 requests per minute per IP for authentication operations
const authRateLimiter = rateLimiter({
	windowMs: 60 * 1000,
	maxRequests: 10,
	message: "Too many authentication requests from this IP. Please wait a minute and try again.",
});

// Student Email Verification for Registration
router.post("/send-register-otp", authRateLimiter, sendRegisterOtpHandler);
router.post("/verify-register-otp", authRateLimiter, verifyRegisterOtpHandler);

// POST /api/authentication/login
router.post("/login", authRateLimiter, login);

// POST /api/authentication/forgot-password
router.post("/forgot-password", authRateLimiter, forgotPassword);

// POST /api/authentication/verify-otp
router.post("/verify-otp", authRateLimiter, verifyOtp);

// POST /api/authentication/magic-link
router.post("/magic-link", authRateLimiter, magicLink);

// GET  /api/authentication/google  (convenience redirect)
router.get("/google", googleOAuth);

// POST /api/authentication/link-credentials (Protected: requires authenticated session)
router.post("/link-credentials", requireAuth, linkCredentials);

// POST /api/authentication/logout
router.post("/logout", logoutUser);

export { router as authenticationRouter };
