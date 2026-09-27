import type { Request, Response } from "express";
import { HTTP_STATUS } from "../../../constants/http-status";
import { prisma } from "../../../database";
import { isAuthorizedInstitutionalEmail } from "../../../providers/auth";
import { sendEmail } from "../../../services/mail";
import { AppError } from "../../../utils/app-error";
import { sendSuccess } from "../../../utils/response";

function getParamString(param: any): string {
	if (Array.isArray(param)) {
		return String(param[0] || "");
	}
	return String(param || "");
}

function getHeaderString(header: any): string {
	if (Array.isArray(header)) {
		return String(header[0] || "");
	}
	return String(header || "");
}

/**
 * Helper to check role
 */
function getAuthUser(req: Request) {
	const user = req.user;
	if (!user) {
		throw new AppError("Unauthorized: Authentication session required", HTTP_STATUS.UNAUTHORIZED);
	}
	return user;
}

async function checkSupportOrAdmin(userId: string) {
	const user = await prisma.user.findUnique({ where: { id: userId } });
	if (!user || (user.role !== "support" && user.role !== "admin")) {
		throw new AppError("Forbidden: Support representative or administrator privileges required.", HTTP_STATUS.FORBIDDEN);
	}
	return user;
}

/**
 * GET /api/support/tickets
 */
export async function getTickets(req: Request, res: Response): Promise<void> {
	const user = getAuthUser(req);
	const role = user.role;

	if (role === "support" || role === "admin") {
		// Support Agent: returns all tickets
		const tickets = await prisma.supportTicket.findMany({
			include: { messages: { orderBy: { createdAt: "asc" } } },
			orderBy: { createdAt: "desc" },
		});
		sendSuccess(res, tickets, "All tickets retrieved successfully", HTTP_STATUS.OK);
	} else {
		// Student/User: returns only their tickets
		const tickets = await prisma.supportTicket.findMany({
			where: { studentId: user.id },
			include: { messages: { orderBy: { createdAt: "asc" } } },
			orderBy: { createdAt: "desc" },
		});
		sendSuccess(res, tickets, "Student tickets retrieved successfully", HTTP_STATUS.OK);
	}
}

/**
 * POST /api/support/tickets
 */
export async function createTicket(req: Request, res: Response): Promise<void> {
	const user = getAuthUser(req);
	const userId = user.id;

	const { category, description, priority } = req.body;
	if (!category || !description) {
		throw new AppError("Category and Description are required", HTTP_STATUS.BAD_REQUEST);
	}

	// Generate Reference Number
	const randomId = Math.floor(1000 + Math.random() * 9000);
	const referenceNumber = `TIC-${randomId}`;

	// Queue position
	const pendingCount = await prisma.supportTicket.count({
		where: { status: { in: ["pending", "waiting"] } },
	});
	const queuePosition = pendingCount + 1;
	const estimatedWait = Math.max(2, queuePosition * 3);

	// Create ticket
	const ticket = await prisma.supportTicket.create({
		data: {
			referenceNumber,
			studentId: user.id,
			studentName: user.name,
			email: user.email,
			category,
			priority: priority || "medium",
			department: category === "technical" ? "Technical Assistance" : "Assessment Operations",
			status: "pending",
			description,
			queuePosition,
			estimatedWait,
		},
	});

	// Triage with AI Agent message
	let aiResponse = "";
	if (category === "technical") {
		aiResponse =
			"Hello! I am the IntegrityOS AI Support Assistant. I've logged your Technical Assistance ticket. Based on our database, please ensure: 1) You are using Google Chrome or Microsoft Edge. 2) System permissions for your camera and microphone are allowed in your browser settings. 3) Adblockers are disabled. If you have done these and still experience issues, please wait – I am escalating this to the Technical Support queue.";
	} else if (category === "assessment") {
		aiResponse =
			"Hi! I am the IntegrityOS AI Support Assistant. For Assessment Assistance, I am checking your active proctored exam context. If you experienced a disconnect or tab-switch alert, please note that your progress is automatically saved to the database. You can click 'Resume Exam' on the dashboard. I have queued this request for a Support Agent review to inspect your logs.";
	} else if (category === "account-recovery") {
		aiResponse =
			"Hello! I am the IntegrityOS AI Support Assistant. For Account Recovery: please note that password resets can be requested directly from the Login page. If you are having MFA or institution-linked login trouble, please confirm your university registration email. A support administrator will verify your ID shortly.";
	} else if (category === "integrity-clarifications") {
		aiResponse =
			"Greetings. I am the IntegrityOS AI Support Assistant. For Integrity Report Clarifications: support agents can review your gaze logs, webcam verification pictures, and tab-switch records. However, access is strictly role-permission controlled. Please describe the specific alert you wish to appeal while I connect you to an evaluator.";
	} else {
		aiResponse =
			"Hello! I am the IntegrityOS AI Support Assistant. I have received your ticket and connected you to the queue. While you wait for a live support agent, could you please provide any browser console errors or details about the page you were on?";
	}

	// Create AI Message
	await prisma.ticketMessage.create({
		data: {
			ticketId: ticket.id,
			senderId: "ai-bot",
			senderName: "AI Support Agent",
			senderRole: "ai",
			content: aiResponse,
		},
	});

	const finalTicket = await prisma.supportTicket.findUnique({
		where: { id: ticket.id },
		include: { messages: { orderBy: { createdAt: "asc" } } },
	});

	sendSuccess(res, finalTicket, "Support ticket created successfully", HTTP_STATUS.CREATED);
}

/**
 * POST /api/support/tickets/:ticketId/messages
 */
export async function postMessage(req: Request, res: Response): Promise<void> {
	const ticketId = getParamString(req.params.ticketId);
	const user = getAuthUser(req);

	const { content } = req.body;
	if (!content || !content.trim()) {
		throw new AppError("Message content is required", HTTP_STATUS.BAD_REQUEST);
	}

	const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
	if (!ticket) {
		throw new AppError("Ticket not found", HTTP_STATUS.NOT_FOUND);
	}

	const role = user.role;

	// Create message
	const msg = await prisma.ticketMessage.create({
		data: {
			ticketId,
			senderId: user.id,
			senderName: user.name,
			senderRole: role,
			content,
		},
	});

	// If user messaged, change ticket status to waiting/pending to nudge agent
	if (role === "user") {
		await prisma.supportTicket.update({
			where: { id: ticketId },
			data: { status: ticket.status === "active" ? "active" : "waiting" },
		});
	}

	sendSuccess(res, msg, "Message posted successfully", HTTP_STATUS.CREATED);
}

/**
 * POST /api/support/tickets/:ticketId/status
 */
export async function updateTicketStatus(req: Request, res: Response): Promise<void> {
	const ticketId = getParamString(req.params.ticketId);
	const agent = getAuthUser(req);
	await checkSupportOrAdmin(agent.id);
	const { status, assignedAgentId, assignedAgentName, resolutionDetails } = req.body;

	const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
	if (!ticket) {
		throw new AppError("Ticket not found", HTTP_STATUS.NOT_FOUND);
	}

	const updated = await prisma.supportTicket.update({
		where: { id: ticketId },
		data: {
			status: status || ticket.status,
			assignedAgentId: assignedAgentId !== undefined ? assignedAgentId : ticket.assignedAgentId,
			assignedAgentName:
				assignedAgentName !== undefined ? assignedAgentName : ticket.assignedAgentName,
			resolutionDetails:
				resolutionDetails !== undefined ? resolutionDetails : ticket.resolutionDetails,
			queuePosition: status === "resolved" ? 0 : ticket.queuePosition,
		},
	});

	// Add system message indicating assignment or resolution
	let systemMsg = "";
	if (status === "active" && assignedAgentName) {
		systemMsg = `Support Agent ${assignedAgentName} has joined the conversation and is reviewing your case.`;
	} else if (status === "resolved") {
		systemMsg = `This support session has been marked as RESOLVED. Resolution Details: ${resolutionDetails || "No details provided"}.`;
	}

	if (systemMsg) {
		await prisma.ticketMessage.create({
			data: {
				ticketId,
				senderId: "system",
				senderName: "System Notification",
				senderRole: "ai",
				content: systemMsg,
			},
		});
	}

	sendSuccess(res, updated, "Ticket status updated successfully", HTTP_STATUS.OK);
}

/**
 * GET /api/support/analytics
 */
export async function getSupportAnalytics(req: Request, res: Response): Promise<void> {
	const user = getAuthUser(req);
	await checkSupportOrAdmin(user.id);

	const totalTickets = await prisma.supportTicket.count();
	const activeChats = await prisma.supportTicket.count({ where: { status: "active" } });
	const pendingTickets = await prisma.supportTicket.count({
		where: { status: { in: ["pending", "waiting"] } },
	});
	const resolvedTickets = await prisma.supportTicket.count({ where: { status: "resolved" } });

	const resolutionRate =
		totalTickets > 0 ? Math.round((resolvedTickets / totalTickets) * 100) : 100;

	// Simulated analytics categories
	const categoriesCount = await prisma.supportTicket.groupBy({
		by: ["category"],
		_count: true,
	});

	sendSuccess(
		res,
		{
			totalTickets,
			activeChats,
			pendingTickets,
			resolvedTickets,
			resolutionRate,
			categoriesCount,
			averageResponseTime: "2.4 minutes",
			csatScore: "4.8 / 5.0",
		},
		"Support analytics retrieved successfully",
		HTTP_STATUS.OK,
	);
}

/**
 * POST /api/support/send-otp
 */
export async function sendSupportRegisterOtp(req: Request, res: Response): Promise<void> {
	const { email } = req.body;
	if (!email) {
		throw new AppError("Email is required.", HTTP_STATUS.BAD_REQUEST);
	}

	const emailLower = email.trim().toLowerCase();

	if (!isAuthorizedInstitutionalEmail(emailLower)) {
		throw new AppError("Only authorized email domains are allowed.", HTTP_STATUS.BAD_REQUEST);
	}

	// Check user existence
	const existingUser = await prisma.user.findUnique({ where: { email: emailLower } });
	if (existingUser) {
		throw new AppError("An account with this email already exists.", HTTP_STATUS.BAD_REQUEST);
	}

	// Generate 6-digit OTP
	const otp = Math.floor(100000 + Math.random() * 900000).toString();

	// Delete existing registry OTPs
	await prisma.verification.deleteMany({
		where: { identifier: `register-otp:${emailLower}` },
	});

	// Save to verification database
	await prisma.verification.create({
		data: {
			identifier: `register-otp:${emailLower}`,
			value: otp,
			expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
		},
	});

	// Send Email
	try {
		await sendEmail({
			to: emailLower,
			subject: "Support Registration Code - IntegrityOS",
			html: `
        <div style="font-family: sans-serif; padding: 32px; color: #1a1917; max-width: 480px; margin: 0 auto; border: 2px solid #ebdcc9; border-radius: 24px; background-color: #fafaf8; text-align: center;">
          <h2 style="margin-top: 0; font-size: 24px; font-weight: bold; letter-spacing: -1px; color: #1a1917;">IntegrityOS Support Portal</h2>
          <p style="font-size: 14px; color: #6b6861; margin-bottom: 24px;">Your verification code to register as a Support Representative is:</p>
          <div style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #1a1917; background-color: #f0ece4; padding: 16px; border-radius: 12px; display: inline-block; margin-bottom: 24px; font-family: monospace;">
            ${otp}
          </div>
          <p style="font-size: 12px; color: #8e8a80; margin-bottom: 0;">This code is valid for 10 minutes. If you did not request this, please ignore this email.</p>
        </div>
      `,
		});
		console.log(`[Support Registration OTP] Generated code ${otp} for email ${emailLower}`);
		sendSuccess(res, null, "Verification code sent to your email", HTTP_STATUS.OK);
	} catch (err) {
		console.error("Error sending registration OTP email:", err);
		throw new AppError(
			"Failed to send verification email. Please try again.",
			HTTP_STATUS.INTERNAL_SERVER_ERROR,
		);
	}
}

/**
 * POST /api/support/verify-otp
 */
export async function verifySupportRegisterOtp(req: Request, res: Response): Promise<void> {
	const { email, otp } = req.body;
	if (!email || !otp) {
		throw new AppError("Email and verification code are required.", HTTP_STATUS.BAD_REQUEST);
	}

	const emailLower = email.trim().toLowerCase();
	const record = await prisma.verification.findFirst({
		where: { identifier: `register-otp:${emailLower}` },
	});

	if (!record) {
		throw new AppError("Invalid or expired verification code.", HTTP_STATUS.BAD_REQUEST);
	}

	if (record.expiresAt.getTime() <= Date.now()) {
		throw new AppError("Verification code has expired.", HTTP_STATUS.BAD_REQUEST);
	}

	if (record.value !== otp) {
		throw new AppError("Invalid verification code.", HTTP_STATUS.BAD_REQUEST);
	}

	// Delete verification record after successful verify
	await prisma.verification.delete({
		where: { id: record.id },
	});

	// Create a short-lived "verified-register-email" record to authorize user creation in the database hook
	await prisma.verification.create({
		data: {
			identifier: `verified-register-email:${emailLower}`,
			value: "verified",
			expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
		},
	});

	sendSuccess(res, null, "Code verified successfully", HTTP_STATUS.OK);
}
