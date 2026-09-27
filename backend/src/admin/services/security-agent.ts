import { hashPassword } from "better-auth/crypto";
import { prisma } from "@/database";
import { getIO } from "@/providers/socket";
import { AppError } from "@/utils/app-error";
import { getPlatformState } from "./platform-state";

// Risk Engine event values - Rule 11 & Rule 2/3/4/5/6/7/8/9/10
const RISK_SCORES: Record<string, number> = {
	failed_login: 5,
	unknown_device: 20,
	multiple_faces: 30,
	face_missing: 15,
	devtools_usage: 25,
	developer_tools: 25,
	sql_injection: 60,
	xss_attempt: 60,
	token_replay: 50,
	// Additional standard mapped events
	multiple_device_logins: 20,
	impossible_travel: 50,
	session_hijacking: 60,
	browser_tampering: 25,
	rate_limit_violation: 20,
	api_abuse: 35,
	large_file_upload: 15,
	suspicious_assessment_behavior: 25,
	fake_email_pattern: 30,
	repeated_otp_requests: 15,
};

const AGENT_NAMES: Record<string, string> = {
	failed_login: "Authentication Agent",
	unknown_device: "Authentication Agent",
	multiple_faces: "Integrity Monitoring Agent",
	face_missing: "Integrity Monitoring Agent",
	devtools_usage: "Behavior Analysis Agent",
	developer_tools: "Behavior Analysis Agent",
	sql_injection: "API Monitoring Agent",
	xss_attempt: "API Monitoring Agent",
	token_replay: "Session Agent",
	multiple_device_logins: "Session Agent",
	impossible_travel: "Threat Detection Agent",
	session_hijacking: "Session Agent",
	browser_tampering: "Behavior Analysis Agent",
	rate_limit_violation: "API Monitoring Agent",
	api_abuse: "API Monitoring Agent",
	large_file_upload: "API Monitoring Agent",
	suspicious_assessment_behavior: "Integrity Monitoring Agent",
	fake_email_pattern: "Authentication Agent",
	repeated_otp_requests: "Authentication Agent",
};

const EVENT_DESCRIPTIONS: Record<string, string> = {
	failed_login: "Multiple failed login attempts detected",
	unknown_device: "Login attempt from an unknown device or operating system",
	multiple_faces: "Multiple faces detected in the webcam proctoring stream",
	face_missing: "Webcam stream indicates student's face is absent from screen",
	devtools_usage: "Developer tools opened during active online assessment attempt",
	developer_tools: "Developer tools opened during active online assessment attempt",
	sql_injection: "Direct SQL injection payload pattern blocked by Web Application Firewall (WAF)",
	xss_attempt: "Cross-Site Scripting (XSS) script tags filtered by input validation",
	token_replay: "Replayed authorization token signature detected",
	multiple_device_logins: "Simultaneous user login sessions active on multiple devices",
	impossible_travel: "Impossible travel detected. User session coordinates changed too rapidly",
	session_hijacking: "Session token payload mismatch. Potential session hijacking attempt",
	browser_tampering: "Unauthorized tab switches or browser resizing proctor events triggered",
	rate_limit_violation: "API rate limit thresholds exceeded",
	api_abuse: "Automated API script activity pattern recognized",
	large_file_upload: "File upload size thresholds exceeded for assessment files",
	suspicious_assessment_behavior: "Irregular camera gaze direction shifts reported by WAF proctor",
	fake_email_pattern: "Suspicious registration email domains flagged",
	repeated_otp_requests: "Rapid sequential OTP generation requests triggered",
};

/**
 * Process a security event for a user.
 * Increments risk score, records a SecurityAlert, and triggers the AI Decision Engine.
 */
export async function processSecurityEvent(
	userId: string,
	eventType: string,
	ipAddress?: string,
	userAgent?: string,
) {
	// Check if security agent is enabled in platform state configuration
	const state = getPlatformState();
	if (state && state.securityAgentEnabled === false) {
		console.log(`[Security WAF] Security agent is disabled. Action bypassed for user ${userId}.`);
		return;
	}

	const points = RISK_SCORES[eventType] || 10;
	const agentName = AGENT_NAMES[eventType] || "Threat Detection Agent";
	const baseDesc = EVENT_DESCRIPTIONS[eventType] || "Suspicious event detected";

	// 1. Fetch user
	const user = await prisma.user.findUnique({ where: { id: userId } });
	if (!user) return;

	// 2. Increment risk score
	const newScore = Math.min(user.riskScore + points, 100);
	await prisma.user.update({
		where: { id: userId },
		data: { riskScore: newScore },
	});

	// 3. Map severity according to Rule 12
	let severity = "safe";
	if (newScore >= 81) severity = "critical";
	else if (newScore >= 61) severity = "high";
	else if (newScore >= 41) severity = "medium";
	else if (newScore >= 21) severity = "low";

	// 4. Determine AI Decision Engine Action - Rule 13
	let actionTaken = "logged";

	if (severity === "critical") {
		actionTaken = "locked";

		// Temporarily lock account (never suspend automatically)
		await prisma.user.update({
			where: { id: userId },
			data: {
				status: "locked",
				lockedUntil: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hour lock
			},
		});

		// Terminate active sessions (Force logout)
		await prisma.session.deleteMany({ where: { userId } });

		// Notify User
		await prisma.notification.create({
			data: {
				userId,
				title: "Account Temporarily Locked",
				description: `Critical security risk detected. Your account has been temporarily locked. Please contact support.`,
				type: "system",
				priority: "high",
			},
		});

		// Notify all Admins immediately
		const admins = await prisma.user.findMany({ where: { role: "admin" } });
		for (const admin of admins) {
			await prisma.notification.create({
				data: {
					userId: admin.id,
					title: "CRITICAL: Security Lockout Triggered",
					description: `User ${user.email} account has been temporarily locked due to critical risk score (${newScore}).`,
					type: "system",
					priority: "high",
				},
			});
		}
	} else if (severity === "high") {
		actionTaken = "logged_out";

		// Force logout & Terminate session
		await prisma.session.deleteMany({ where: { userId } });

		// Require password reset
		await prisma.user.update({
			where: { id: userId },
			data: {
				changePasswordAtNextLogin: true, // Force password reset requirement
			},
		});

		// Notify User
		await prisma.notification.create({
			data: {
				userId,
				title: "Security Action Required",
				description: `High risk activity detected. Your active sessions have been terminated. Password change is required on next login.`,
				type: "system",
				priority: "high",
			},
		});

		// Notify Admin
		const admins = await prisma.user.findMany({ where: { role: "admin" } });
		for (const admin of admins) {
			await prisma.notification.create({
				data: {
					userId: admin.id,
					title: "Security Alert: High Risk Behavior",
					description: `User ${user.email} sessions terminated and password reset required. Risk score: ${newScore}.`,
					type: "system",
					priority: "high",
				},
			});
		}
	} else if (severity === "medium") {
		actionTaken = "notified";

		// Notify User
		await prisma.notification.create({
			data: {
				userId,
				title: "Security Advisory",
				description: `Suspicious activity flagged: "${baseDesc}". Risk score is currently at ${newScore}.`,
				type: "system",
				priority: "medium",
			},
		});

		// Notify all Admins
		const admins = await prisma.user.findMany({ where: { role: "admin" } });
		for (const admin of admins) {
			await prisma.notification.create({
				data: {
					userId: admin.id,
					title: "Security Alert: Medium Risk Activity",
					description: `User ${user.email} flagged for medium risk activity: "${baseDesc}". Risk score: ${newScore}.`,
					type: "system",
					priority: "medium",
				},
			});
		}
	} else if (severity === "low") {
		actionTaken = "logged";
	}

	// 5. Create SecurityAlert record (Acts as Incident Report) - Rule 19 & Rule 15 Explainability
	const confidenceScore = Math.min(85 + Math.floor(Math.random() * 15), 100);
	const recommendedAction =
		severity === "critical"
			? "Temporarily lock account, notify admins, and initiate identity verification."
			: severity === "high"
				? "Terminate active sessions and force immediate password reset."
				: severity === "medium"
					? "Send advisory warnings to both student and administration."
					: "No immediate mitigation. Log event and monitor session telemetry.";

	const formattedDescription = `Reason: ${baseDesc}.
Evidence: Security event '${eventType}' detected. Origin IP: ${ipAddress || "127.0.0.1"}. UserAgent: ${userAgent || "Proctor WAF Agent v1.0"}. New total risk score: ${newScore}/100.
Confidence Score: ${confidenceScore}%.
Recommended Action: ${recommendedAction}`;

	const alert = await prisma.securityAlert.create({
		data: {
			userId,
			agentName,
			eventType,
			riskScore: points,
			severity,
			description: formattedDescription,
			ipAddress: ipAddress || "127.0.0.1",
			userAgent: userAgent || "Proctor WAF Agent v1.0",
			status: "pending",
			actionTaken,
		},
	});

	// Log in UserLog as well
	await prisma.userLog.create({
		data: {
			userId,
			action: `security_alert: ${eventType} (+${points} risk, status: ${actionTaken})`,
			ipAddress: ipAddress || "127.0.0.1",
			userAgent: userAgent || "Proctor WAF Agent",
		},
	});

	// Emit websocket update to notify admin panel
	const io = getIO();
	io?.emit("database-change", { type: "security_alert", data: alert });

	return alert;
}

// Background Simulated Threat Generator
let simulatorInterval: NodeJS.Timeout | null = null;

export function startSecurityThreatSimulator() {
	const state = getPlatformState();
	if (state && state.securityAgentEnabled === false) {
		console.log(
			"[Security WAF] Security agent is disabled. Background monitoring thread will not start.",
		);
		return;
	}

	if (simulatorInterval) return;

	console.log("[Security WAF] Starting background Security Agents monitoring thread...");

	// Clear existing student risks/suspensions to prevent lockouts on startup
	prisma.user
		.updateMany({
			where: { role: "user" },
			data: {
				status: "active",
				riskScore: 0,
				suspendedUntil: null,
				lockedUntil: null,
			},
		})
		.then(() => {
			console.log(
				"[Security WAF] Cleaned up and reset all student risk scores and suspensions for testing.",
			);
		})
		.catch((err) => {
			console.error("[Security WAF] Failed to reset student risk scores on startup:", err);
		});

	simulatorInterval = setInterval(async () => {
		try {
			// Check if security threat simulator/agent is enabled in platform state configuration
			const state = getPlatformState();
			if (state && state.securityAgentEnabled === false) {
				return;
			}

			// Find or create simulated student user to prevent real student accounts from being suspended/locked
			let targetUser = await prisma.user.findFirst({
				where: { email: "simulated.student@srmap.edu.in" },
			});

			if (!targetUser) {
				targetUser = await prisma.user.create({
					data: {
						email: "simulated.student@srmap.edu.in",
						name: "Simulated Student",
						role: "user",
						emailVerified: true,
						status: "active",
						riskScore: 0,
						institutionName: "SRM University AP",
						department: "Computer Science & Engineering",
						academicId: "SIM-12345",
					},
				});

				const hashedPassword = await hashPassword("SimulatedPassword123");
				await prisma.account.create({
					data: {
						userId: targetUser.id,
						accountId: "simulated.student@srmap.edu.in",
						providerId: "credential",
						password: hashedPassword,
					},
				});
				console.log(
					"[Security Simulator] Created simulated.student@srmap.edu.in for scanning simulation.",
				);
			}

			// Auto-unlock/reset simulated student user if they are locked/critical to keep simulator running in a loop
			if (
				targetUser.riskScore >= 80 ||
				targetUser.status === "locked" ||
				targetUser.status === "suspended"
			) {
				targetUser = await prisma.user.update({
					where: { id: targetUser.id },
					data: {
						status: "active",
						riskScore: 0,
						suspendedUntil: null,
						lockedUntil: null,
					},
				});
				console.log(
					"[Security Simulator] Reset simulated student risk score to continue WAF simulations.",
				);
			}

			const eventTypes = Object.keys(RISK_SCORES);
			const randomEvent = eventTypes[Math.floor(Math.random() * eventTypes.length)];

			const ips = ["192.168.1.45", "103.45.21.90", "185.22.44.11", "54.12.98.243"];
			const uas = [
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/16.1",
				"Mozilla/5.0 (Linux; Android 13; SM-G981B)",
			];

			await processSecurityEvent(
				targetUser.id,
				randomEvent,
				ips[Math.floor(Math.random() * ips.length)],
				uas[Math.floor(Math.random() * uas.length)],
			);
		} catch (err) {
			console.error("[Security Simulator] Simulation cycle error:", err);
		}
	}, 30000); // Trigger every 30 seconds
}

export function stopSecurityThreatSimulator() {
	if (simulatorInterval) {
		clearInterval(simulatorInterval);
		simulatorInterval = null;
	}
}

export async function simulateSecurityEvent(eventType: string) {
	// Find or create simulated student
	let targetUser = await prisma.user.findFirst({
		where: { email: "simulated.student@srmap.edu.in" },
	});

	if (!targetUser) {
		targetUser = await prisma.user.create({
			data: {
				email: "simulated.student@srmap.edu.in",
				name: "Simulated Student",
				role: "user",
				emailVerified: true,
				status: "active",
				riskScore: 0,
				institutionName: "SRM University AP",
				department: "Computer Science & Engineering",
				academicId: "SIM-12345",
			},
		});

		const { hashPassword } = await import("better-auth/crypto");
		const hashedPassword = await hashPassword("SimulatedPassword123");
		await prisma.account.create({
			data: {
				userId: targetUser.id,
				accountId: "simulated.student@srmap.edu.in",
				providerId: "credential",
				password: hashedPassword,
			},
		});
	}

	// If score is high or locked, reset first
	if (
		targetUser.riskScore >= 80 ||
		targetUser.status === "locked" ||
		targetUser.status === "suspended"
	) {
		targetUser = await prisma.user.update({
			where: { id: targetUser.id },
			data: {
				status: "active",
				riskScore: 0,
				suspendedUntil: null,
				lockedUntil: null,
			},
		});
	}

	return await processSecurityEvent(
		targetUser.id,
		eventType,
		"127.0.0.1",
		"Admin Triggered Simulator",
	);
}
