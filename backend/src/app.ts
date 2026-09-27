import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import cors from "cors";
import express, { type Express } from "express";
import { adminRouter } from "./admin/routes/admin-routes";
import { getPlatformState } from "./admin/services/platform-state";
import { env } from "./config/env";
import { prisma } from "./database";
import { registerSwaggerDocs } from "./docs/swagger";
import { answerSimilarityRouter } from "./features/answer-similarity/routes/answer-similarity-routes";
import { assessmentRouter } from "./features/assessments/routes/assessment-routes";
import { authenticationRouter } from "./features/authentication/routes/authentication-routes";
import { chatRouter } from "./features/chat/routes/chat-routes";
import { healthRouter } from "./features/health/routes/health-routes";
import { notificationRouter } from "./features/notifications/routes/notification-routes";
import { plagiarismRouter } from "./features/plagiarism/routes/plagiarism-routes";
import { aiProctoringRouter } from "./features/proctoring/routes/ai-proctoring-routes";
import { proctoringRouter } from "./features/proctoring/routes/proctoring-routes";
import { profileRouter } from "./features/profile/routes/profile-routes";
import { supportRouter } from "./features/support/routes/support-routes";
import { textExtractionRouter } from "./features/text-extraction/routes/text-extraction-routes";

import { errorHandler } from "./middleware/error-handler";
import { notFound } from "./middleware/not-found";
import { auth } from "./providers/auth";
import { requestContextStore } from "./utils/request-context";

const app: Express = express();

app.use((req, _res, next) => {
	requestContextStore.run({ url: req.url, method: req.method }, () => {
		next();
	});
});

app.use(
	cors({
		origin(origin, callback) {
			const allowedOrigins = [
				env.FRONTEND_URL,
				"http://localhost:5173",
				"http://localhost:5174",
				"http://localhost:5175",
			];

			// Allow Postman, curl, server-to-server requests
			if (!origin) {
				return callback(null, true);
			}

			if (allowedOrigins.includes(origin)) {
				return callback(null, true);
			}

			console.error(`❌ Blocked by CORS: ${origin}`);
			return callback(new Error("Not allowed by CORS"));
		},
		credentials: true,
		methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
		allowedHeaders: ["Content-Type", "Authorization"],
	}),
);

// Logging middleware
app.use((req, _res, next) => {
	console.log(`[HTTP] ${req.method} ${req.url}`);
	next();
});

registerSwaggerDocs(app);

// Better Auth error redirect handler (sends users back to the frontend with the error param)
app.get("/api/auth/error", (req, res) => {
	const error = req.query.error || "UNKNOWN";
	const referer = req.headers.referer;
	let frontendUrl = env.FRONTEND_URL;

	const host = req.headers.host || "";
	if (host.includes("localhost") || host.includes("127.0.0.1")) {
		frontendUrl = "http://localhost:5173";
	}

	if (referer) {
		try {
			const origin = new URL(referer).origin;
			if (
				origin === env.FRONTEND_URL ||
				origin === "http://localhost:5173" ||
				origin === "http://localhost:5174" ||
				origin === "http://localhost:5175"
			) {
				frontendUrl = origin;
			}
		} catch {
			// ignore
		}
	}
	res.redirect(`${frontendUrl}?error=${encodeURIComponent(String(error))}`);
});

// Custom Interceptor for Password Reset
// (uses its own local JSON parser since the global express.json() is
// intentionally mounted AFTER the Better Auth handler below — Better Auth
// needs to read the raw, unconsumed request body itself)
app.post("/api/auth/reset-password", express.json(), async (req, res, _next) => {
	try {
		const getCleanToken = () => {
			const bodyToken = req.body.token;
			if (
				bodyToken &&
				typeof bodyToken === "string" &&
				bodyToken !== "null" &&
				bodyToken !== "undefined"
			) {
				return bodyToken.trim();
			}
			const queryToken = req.query.token;
			if (
				queryToken &&
				typeof queryToken === "string" &&
				queryToken !== "null" &&
				queryToken !== "undefined"
			) {
				return queryToken.trim();
			}
			const authHeader = req.headers.authorization;
			if (authHeader?.startsWith("Bearer ")) {
				const bearerToken = authHeader.replace("Bearer ", "").trim();
				if (bearerToken && bearerToken !== "null" && bearerToken !== "undefined") {
					return bearerToken;
				}
			}
			return null;
		};

		const token = getCleanToken();
		const { newPassword } = req.body;

		if (!token) {
			return res.status(400).json({ message: "Reset token is required." });
		}
		if (!newPassword) {
			return res.status(400).json({ message: "New password is required." });
		}

		// Find verification record.
		// Better Auth stores password-reset verifications as:
		//   identifier: "reset-password:<token>"
		//   value: "<userId>"
		const verification = await prisma.verification.findFirst({
			where: { identifier: `reset-password:${token}` },
		});

		if (!verification || verification.expiresAt < new Date()) {
			return res.status(400).json({ message: "Invalid or expired password reset token." });
		}

		// The verification's value holds the user's ID for reset-password tokens.
		const user = await prisma.user.findUnique({
			where: { id: verification.value },
		});

		if (!user) {
			return res.status(404).json({ message: "User not found." });
		}

		// 1. Password Strength Validation
		const { validatePasswordStrength } = await import("./utils/password-validator");
		const validation = validatePasswordStrength(newPassword, {
			name: user.name,
			email: user.email,
			rollNumber: user.rollNumber,
			academicId: user.academicId,
		});

		if (!validation.isValid) {
			return res.status(400).json({
				message: `Password does not meet requirements: ${validation.suggestions.join(" ")}`,
			});
		}

		// 2. Fetch the credentials account
		const account = await prisma.account.findFirst({
			where: { userId: user.id, providerId: "credential" },
		});

		if (account?.password) {
			// Check if new password is same as current password
			const { verifyPassword } = await import("better-auth/crypto");
			const isSameAsCurrent = await verifyPassword({
				password: newPassword,
				hash: account.password,
			});
			if (isSameAsCurrent) {
				return res.status(400).json({
					message: "New password must be different from current password.",
				});
			}

			// Validate Reuse against Password History (last 10)
			const histories = await prisma.passwordHistory.findMany({
				where: { userId: user.id },
				orderBy: { createdAt: "desc" },
				take: 10,
			});

			for (const history of histories) {
				const isMatch = await verifyPassword({
					password: newPassword,
					hash: history.hash,
				});
				if (isMatch) {
					return res.status(400).json({
						message:
							"❌ You cannot reuse any of your last 10 passwords. Please choose a different password.",
					});
				}
			}

			// Save old password in history
			await prisma.passwordHistory.create({
				data: {
					userId: user.id,
					hash: account.password,
				},
			});

			// Prune histories
			const allHistories = await prisma.passwordHistory.findMany({
				where: { userId: user.id },
				orderBy: { createdAt: "desc" },
			});
			if (allHistories.length > 10) {
				const idsToDelete = allHistories.slice(10).map((h) => h.id);
				await prisma.passwordHistory.deleteMany({
					where: { id: { in: idsToDelete } },
				});
			}
		}

		// 3. Update account with new hashed password
		const { hashPassword } = await import("better-auth/crypto");
		const hashedPassword = await hashPassword(newPassword);

		if (account) {
			await prisma.account.update({
				where: { id: account.id },
				data: { password: hashedPassword },
			});
		} else {
			await prisma.account.create({
				data: {
					userId: user.id,
					accountId: user.email,
					providerId: "credential",
					password: hashedPassword,
				},
			});
		}

		// 4. Revoke active sessions (force logout)
		await prisma.session.deleteMany({
			where: { userId: user.id },
		});

		// 5. Delete verification token
		await prisma.verification.delete({
			where: { id: verification.id },
		});

		// 6. Log audit
		const xForwardedFor = req.headers["x-forwarded-for"];
		const ip =
			(Array.isArray(xForwardedFor) ? xForwardedFor[0] : xForwardedFor) ||
			req.socket.remoteAddress ||
			"";
		const ua = req.headers["user-agent"] || "";
		await prisma.userLog.create({
			data: {
				userId: user.id,
				ipAddress: ip,
				userAgent: ua,
				action: "reset_password",
			},
		});

		// 7. Notification
		await prisma.notification.create({
			data: {
				userId: user.id,
				title: "Password Reset Successfully",
				description:
					"Your password has been reset successfully. If you did not perform this action, please contact the administrator immediately.",
				type: "system",
				priority: "high",
				senderName: "Security Control",
				senderRole: "system",
			},
		});

		return res.json({ message: "Password updated successfully." });
	} catch (err: any) {
		console.error("Error in custom password reset interceptor:", err);
		return res.status(500).json({ message: err.message || "Internal server error." });
	}
});

// Custom session endpoint to resolve 404 issue from standard client auth queries
app.get("/api/auth/session", async (req, res) => {
	try {
		const sessionData = await auth.api.getSession({
			headers: new Headers(req.headers as any),
		});
		return res.json(sessionData);
	} catch (err: any) {
		console.error("Error in fallback session endpoint:", err);
		return res.status(500).json({ message: err.message || "Internal server error." });
	}
});

// Better Auth routes
app.all("/api/auth/*any", toNodeHandler(auth));

// Global JSON parsing for all routes below (must come AFTER the Better Auth
// handler above, since Better Auth needs the raw, unparsed request body)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Blocker middleware for Maintenance Mode and Emergency Shutdown
app.use(async (req, res, next) => {
	try {
		const { maintenanceMode, emergencyShutdown, studentPortalEnabled, facultyPortalEnabled } =
			getPlatformState();
		if (maintenanceMode || emergencyShutdown) {
			const isPublicRoute =
				req.url.startsWith("/api/admin") ||
				req.url.startsWith("/api/auth") ||
				req.url.startsWith("/api/health");
			if (isPublicRoute) {
				return next();
			}

			let userRole: string | null = null;
			try {
				const sessionData = await auth.api.getSession({
					headers: fromNodeHeaders(req.headers),
				});
				if (sessionData?.user) {
					const dbUser = await prisma.user.findUnique({
						where: { id: sessionData.user.id },
					});
					if (dbUser) {
						userRole = dbUser.role;
					}
				}
			} catch (_err) {
				// Ignore session extraction failure for unauthenticated visitors
			}

			const isAdmin = userRole === "admin" || userRole === "support";
			if (isAdmin) {
				return next();
			}

			if (emergencyShutdown) {
				return res.status(503).json({
					status: "EMERGENCY_SHUTDOWN",
					message: "System has been suspended by the administrator for safety and security.",
				});
			}

			if (maintenanceMode) {
				if (userRole === "faculty") {
					return res.status(503).json({
						status: "MAINTENANCE_MODE",
						message: "Faculty portal is undergoing planned maintenance. Please try again later.",
					});
				} else {
					return res.status(503).json({
						status: "MAINTENANCE_MODE",
						message: "Student portal is undergoing planned maintenance. Please try again later.",
					});
				}
			}
		}
		next();
	} catch (e) {
		next(e);
	}
});

// Feature routes
app.use("/api/health", healthRouter);

app.use("/api/authentication", authenticationRouter);
app.use("/api/assessments", assessmentRouter);
app.use("/api/support", supportRouter);
app.use("/api/admin", adminRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/profile", profileRouter);
app.use("/api/proctoring", proctoringRouter);
app.use("/api/ai-proctoring", aiProctoringRouter);
app.use("/api/text-extraction", textExtractionRouter);
app.use("/api/answer-similarity", answerSimilarityRouter);
app.use("/api/plagiarism", plagiarismRouter);
app.use("/api/chat", chatRouter);

app.use(notFound);
app.use(errorHandler);

export { app };