import { type IRouter, Router } from "express";
import { rateLimiter, requireAuth } from "@/middleware/auth-middleware";
import {
	forgotPassword,
	googleOAuth,
	linkCredentials,
	login,
	logoutUser,
	magicLink,
	oauthComplete,
	sendRegisterOtpHandler,
	verifyOtp,
	verifyRegisterOtpHandler,
} from "../controllers/authentication-controller";
import {
	loginStatusHandler,
	sendLoginCodeHandler,
	verifyLoginCodeHandler,
} from "../controllers/two-factor-controller";

const router: IRouter = Router();

// Rate limiter: 10 requests per minute per IP for authentication operations
const authRateLimiter = rateLimiter({
	windowMs: 60 * 1000,
	maxRequests: 10,
	message: "Too many authentication requests from this IP. Please wait a minute and try again.",
});

// Separate budget for the 2FA step so a normal sign-in (login + status + send +
// verify) never trips the shared auth limiter. Guessing is bounded separately:
// each code allows 5 attempts, then the pending session is destroyed.
const twoFactorRateLimiter = rateLimiter({
	windowMs: 60 * 1000,
	maxRequests: 30,
	message: "Too many verification requests from this IP. Please wait a minute and try again.",
});

// Student Email Verification for Registration
router.post("/send-register-otp", authRateLimiter, sendRegisterOtpHandler);
router.post("/verify-register-otp", authRateLimiter, verifyRegisterOtpHandler);

// POST /api/authentication/login
router.post("/login", authRateLimiter, login);

// Two-step verification (session issued by /login or Google stays unusable until verified)
router.post("/2fa/status", twoFactorRateLimiter, loginStatusHandler);
router.post("/2fa/send", twoFactorRateLimiter, sendLoginCodeHandler);
router.post("/2fa/verify", twoFactorRateLimiter, verifyLoginCodeHandler);

// POST /api/authentication/forgot-password
router.post("/forgot-password", authRateLimiter, forgotPassword);

// POST /api/authentication/verify-otp
router.post("/verify-otp", authRateLimiter, verifyOtp);

// POST /api/authentication/magic-link
router.post("/magic-link", authRateLimiter, magicLink);

// GET  /api/authentication/google  (convenience redirect)
router.get("/google", googleOAuth);

// GET  /api/authentication/oauth-complete  (Google OAuth landing → token handoff to frontend)
router.get("/oauth-complete", oauthComplete);

// POST /api/authentication/link-credentials (Protected: requires authenticated session)
router.post("/link-credentials", requireAuth, linkCredentials);

// POST /api/authentication/logout
router.post("/logout", logoutUser);

export { router as authenticationRouter };
