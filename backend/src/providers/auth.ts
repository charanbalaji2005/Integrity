import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { magicLink, openAPI } from "better-auth/plugins";

import { env } from "../config/env";
import { prisma } from "../database";
import { verifyFace } from "../features/proctoring/services/proctoring-service";
import { sendEmail } from "../services/mail";
import { requestContextStore } from "../utils/request-context";

export function isAuthorizedInstitutionalEmail(email: string): boolean {
	const emailLower = email.toLowerCase().trim();
	const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();
	return (
		emailLower.endsWith("@srmap.edu.in") ||
		emailLower.endsWith("@support.com") ||
		emailLower === "admin@university.edu" ||
		(Boolean(adminEmail) && emailLower === adminEmail) ||
		emailLower === "consolesupport@integrityos.in"
	);
}

export const auth = betterAuth({
	session: {
		expiresIn: 60 * 60 * 24 * 1, // 1 day session duration
		updateAge: 60 * 60 * 12, // update age 12 hours
	},
	logger: {
		level: "warn",
		log: (level, message, ...args) => {
			// Prevent domain restriction validation from flooding backend console with ERROR logs
			if (
				typeof message === "string" &&
				(message.includes("srmap.edu.in") || message.includes("APIError"))
			) {
				return;
			}
			console[level](message, ...args);
		},
	},
	user: {
		additionalFields: {
			role: {
				type: "string",
				defaultValue: "user",
				input: false,
			},
			status: {
				type: "string",
				defaultValue: "active",
				input: false,
			},
			suspendedUntil: {
				type: "date",
				required: false,
				defaultValue: null,
				input: false,
			},
			institutionName: {
				type: "string",
				required: false,
			},
			department: {
				type: "string",
				required: false,
			},
			academicId: {
				type: "string",
				required: false,
			},
		},
	},
	databaseHooks: {
		user: {
			create: {
				before: async (user) => {
					const email = user.email.toLowerCase();

					// Completely disable Google/social registrations. Accounts must be pre-registered via email/password first.
					const store = requestContextStore.getStore();
					const requestUrl = store?.url || "";
					if (requestUrl && !requestUrl.includes("/sign-up")) {
						throw new APIError("BAD_REQUEST", {
							message: `email_not_registered:${email}`,
						});
					}

					if (!isAuthorizedInstitutionalEmail(email)) {
						throw new APIError("BAD_REQUEST", {
							message: "Only authorized email domains are allowed.",
						});
					}

					// Enforce that email registrations must have an active verified-register-email OTP record
					const verifiedRecord = await prisma.verification.findFirst({
						where: {
							identifier: `verified-register-email:${email}`,
						},
					});
					if (!verifiedRecord || (verifiedRecord.expiresAt && verifiedRecord.expiresAt.getTime() <= Date.now())) {
						throw new APIError("BAD_REQUEST", {
							message: "Email verification is required before registration. Please verify the code sent to your email.",
						});
					}
					// Clean up the verified token after one-time use
					await prisma.verification.delete({
						where: { id: verifiedRecord.id },
					});

					// Verify face scan if image is provided during registration
					if (user.image) {
						try {
							const faceResult = await verifyFace(user.image as string);
							if (!faceResult.faceDetected) {
								throw new APIError("BAD_REQUEST", {
									message: "Face verification failed: No face detected in the captured image.",
								});
							}
						} catch (err: any) {
							throw new APIError("BAD_REQUEST", {
								message: err.message || "Face verification failed.",
							});
						}
					}

					// Public registration is STRICTLY student ("user") role.
					// Support representatives are gated by @support.com verification.
					// Faculty and Admin accounts can NEVER be created via public registration.
					let role = "user";
					if (email === "consolesupport@integrityos.in" || email.endsWith("@support.com")) {
						role = "support";
					}

					return {
						data: {
							...user,
							role,
							emailVerified: true,
						},
					};
				},
			},
		},
	},

	hooks: {
		before: createAuthMiddleware(async (ctx) => {
			const path = ctx.path;
			if (path.includes("/sign-in") || path.includes("/sign-up") || path.includes("/callback")) {
				const email = (ctx.body?.email || ctx.query?.email)?.toLowerCase();
				if (email && !isAuthorizedInstitutionalEmail(email)) {
					throw new APIError("BAD_REQUEST", {
						message: "Only authorized email domains are allowed.",
					});
				}

				if (path.includes("/sign-up")) {
					const password = ctx.body?.password;
					if (!password || typeof password !== "string" || password.length < 8) {
						throw new APIError("BAD_REQUEST", {
							message: "Password must be at least 8 characters long.",
						});
					}
				}

				if (email) {
					// Check user suspension status
					const dbUser = await prisma.user.findUnique({
						where: { email },
					});
					if (dbUser) {
						if (dbUser.status === "suspended") {
							throw new APIError("UNAUTHORIZED", {
								message: "Your account is suspended.",
							});
						}
						if (
							dbUser.status === "locked" ||
							(dbUser.lockedUntil && new Date(dbUser.lockedUntil).getTime() > Date.now())
						) {
							const lockedTime = dbUser.lockedUntil ? new Date(dbUser.lockedUntil).getTime() : 0;
							const minsLeft =
								lockedTime > Date.now() ? Math.ceil((lockedTime - Date.now()) / 60000) : 0;
							const msg =
								minsLeft > 0
									? `Your account is temporarily locked. Please try again after ${minsLeft} minutes.`
									: "Your account is locked. Please contact administrator for assistance.";
							throw new APIError("UNAUTHORIZED", {
								message: msg,
							});
						}
						if (dbUser.status === "temporarily_suspended" && dbUser.suspendedUntil) {
							if (new Date(dbUser.suspendedUntil).getTime() > Date.now()) {
								throw new APIError("UNAUTHORIZED", {
									message: `Your account is temporarily suspended until ${new Date(dbUser.suspendedUntil).toLocaleString()}.`,
								});
							} else {
								// Automatically unsuspend if the time has passed
								await prisma.user.update({
									where: { id: dbUser.id },
									data: { status: "active", suspendedUntil: null },
								});
							}
						}
					}
				}
			}
		}),
		after: createAuthMiddleware(async (ctx) => {
			const path = ctx.path;

			// Strict domain restriction check for new sessions (email/social logins)
			if (ctx.context.newSession) {
				const email = ctx.context.newSession.user.email.toLowerCase();
				if (!isAuthorizedInstitutionalEmail(email)) {
					throw new APIError("BAD_REQUEST", {
						message: "Only authorized email domains are allowed.",
					});
				}
			}

			// Cut off active sessions for suspended users
			if (path.includes("/get-session") && ctx.context.session) {
				const dbUser = await prisma.user.findUnique({
					where: { id: ctx.context.session.user.id },
				});
				if (dbUser) {
					if (dbUser.status === "suspended") {
						throw new APIError("UNAUTHORIZED", {
							message: "Your account is suspended.",
						});
					}
					if (
						dbUser.status === "locked" ||
						(dbUser.lockedUntil && new Date(dbUser.lockedUntil).getTime() > Date.now())
					) {
						const lockedTime = dbUser.lockedUntil ? new Date(dbUser.lockedUntil).getTime() : 0;
						const minsLeft =
							lockedTime > Date.now() ? Math.ceil((lockedTime - Date.now()) / 60000) : 0;
						const msg =
							minsLeft > 0
								? `Your account is temporarily locked. Please try again after ${minsLeft} minutes.`
								: "Your account is locked. Please contact administrator for assistance.";
						throw new APIError("UNAUTHORIZED", {
							message: msg,
						});
					}
					if (dbUser.status === "temporarily_suspended" && dbUser.suspendedUntil) {
						if (new Date(dbUser.suspendedUntil).getTime() > Date.now()) {
							throw new APIError("UNAUTHORIZED", {
								message: `Your account is temporarily suspended until ${new Date(dbUser.suspendedUntil).toLocaleString()}.`,
							});
						} else {
							await prisma.user.update({
								where: { id: dbUser.id },
								data: { status: "active", suspendedUntil: null },
							});
						}
					}
				}
			}

			// Log registration
			if (path.includes("/sign-up/email") && ctx.context.newSession) {
				const user = ctx.context.newSession.user;
				const ip =
					ctx.request?.headers?.get("x-forwarded-for") ||
					ctx.request?.headers?.get("x-real-ip") ||
					"127.0.0.1";
				const ua = ctx.request?.headers?.get("user-agent") || "";
				await prisma.userLog.create({
					data: {
						userId: user.id,
						action: "register",
						ipAddress: ip,
						userAgent: ua,
					},
				});
			}

			// Log login
			if ((path.includes("/sign-in") || path.includes("/callback")) && ctx.context.newSession) {
				const user = ctx.context.newSession.user;
				const ip =
					ctx.request?.headers?.get("x-forwarded-for") ||
					ctx.request?.headers?.get("x-real-ip") ||
					"127.0.0.1";
				const ua = ctx.request?.headers?.get("user-agent") || "";
				await prisma.userLog.create({
					data: {
						userId: user.id,
						action: "login",
						ipAddress: ip,
						userAgent: ua,
					},
				});
			}
		}),
	},
	database: prismaAdapter(prisma, {
		provider: "postgresql",
	}),

	secret: env.BETTER_AUTH_SECRET,
	baseURL: env.BETTER_AUTH_URL,

	advanced: {
		defaultCookieAttributes: {
			sameSite: "none",
			secure: true,
			partitioned: true,
		},
	},

	account: {
		accountLinking: {
			enabled: true,
			trustedProviders: ["google"],
		},
	},

	trustedOrigins: [
		env.BETTER_AUTH_URL,
		env.FRONTEND_URL,
		"http://localhost:5173",
		"http://localhost:5174",
		"http://localhost:5175",
	],

	socialProviders: {
		google: {
			clientId: env.GOOGLE_CLIENT_ID as string,
			clientSecret: env.GOOGLE_CLIENT_SECRET as string,
			redirectURI: `${env.BETTER_AUTH_URL}/api/auth/callback/google`.replace("https://", "http://"),
		},
	},

	emailAndPassword: {
		enabled: true,
		minPasswordLength: 8,

		sendResetPassword: async ({ user, url }) => {
			try {
				const parsedUrl = new URL(url);
				const token =
					parsedUrl.searchParams.get("token") || parsedUrl.pathname.split("/").pop() || "";

				// Generate a secure 6-digit OTP
				const otp = Math.floor(100000 + Math.random() * 900000).toString();

				const emailLower = user.email.toLowerCase();

				// Delete any existing OTP records for this email
				await prisma.verification.deleteMany({
					where: { identifier: `otp:${emailLower}` },
				});

				// Save mapping in Verification table
				await prisma.verification.create({
					data: {
						identifier: `otp:${emailLower}`,
						value: `${otp}:${token}`,
						expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
					},
				});

				// Send the OTP via email
				await sendEmail({
					to: user.email,
					subject: "Password Reset Verification Code - IntegrityOS",
					html: `
            <div style="font-family: sans-serif; padding: 32px; color: #1a1917; max-width: 480px; margin: 0 auto; border: 2px solid #ebdcc9; border-radius: 24px; background-color: #fafaf8; text-align: center;">
              <h2 style="margin-top: 0; font-size: 24px; font-weight: bold; letter-spacing: -1px; color: #1a1917;">IntegrityOS</h2>
              <p style="font-size: 14px; color: #6b6861; margin-bottom: 24px;">Your password reset verification code is:</p>
              <div style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #1a1917; background-color: #f0ece4; padding: 16px; border-radius: 12px; display: inline-block; margin-bottom: 24px; font-family: monospace;">
                ${otp}
              </div>
              <p style="font-size: 12px; color: #8e8a80; margin-bottom: 0;">This code is valid for 10 minutes. If you did not request a password reset, you can safely ignore this email.</p>
            </div>
          `,
				});
			} catch (err) {
				console.error("Error generating or sending password reset OTP:", err);
				throw err;
			}
		},
	},

	plugins: [
		openAPI(),

		magicLink({
			sendMagicLink: async ({ email, url }) => {
				await sendEmail({
					to: email,
					subject: "Sign in with Magic Link - IntegrityOS",
					html: `
            <div style="font-family: sans-serif; padding: 24px; color: #1a1917; max-width: 500px; margin: 0 auto; border: 1px solid #ebdcc9; border-radius: 16px; background-color: #fafaf8;">
              <h2 style="margin-top: 0; font-size: 24px; font-weight: bold; letter-spacing: -0.5px;">IntegrityOS</h2>
              <p style="font-size: 14px; line-height: 1.5; color: #403e3a;">Click the button below to sign in to your IntegrityOS account instantly:</p>
              <div style="text-align: center; margin: 24px 0;">
                <a href="${url}" style="display: inline-block; padding: 12px 32px; background-color: #000; color: #fff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px;">Sign In to Portal</a>
              </div>
              <p style="font-size: 12px; line-height: 1.5; color: #6b6861; margin-bottom: 0;">If you did not request this, you can safely ignore this email.</p>
            </div>
          `,
				});
			},
		}),
	],
});
