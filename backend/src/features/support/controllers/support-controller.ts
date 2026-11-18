import type { Request, Response } from "express";
import { HTTP_STATUS } from "../../../constants/http-status";
import { prisma } from "../../../database";
import { isAuthorizedInstitutionalEmail } from "../../../providers/auth";
import { sendEmail } from "../../../services/mail";
import { AppError } from "../../../utils/app-error";
import { getIO } from "../../../providers/socket";
import { sendSuccess } from "../../../utils/response";
import { ticketRoom, userRoom } from "../services/infra";
import { messageToDto } from "../services/serializers";
import { suggestAgentReply } from "../services/support-agent-service";

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
 * POST /api/support/tickets/:ticketId/messages — STAFF path used by the support dashboard.
 * (Students are routed to the Support Hub engine in support-hub-controller.)
 * A staff reply takes the ticket over from the AI so the assistant stops answering.
 */
export async function postMessage(req: Request, res: Response): Promise<void> {
	const ticketId = getParamString(req.params.ticketId);
	const user = getAuthUser(req);
	await checkSupportOrAdmin(user.id);

	const content = typeof req.body?.content === "string" ? req.body.content.trim().slice(0, 5000) : "";
	if (!content) {
		throw new AppError("Message content is required", HTTP_STATUS.BAD_REQUEST);
	}

	const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
	if (!ticket) {
		throw new AppError("Ticket not found", HTTP_STATUS.NOT_FOUND);
	}
	if (ticket.status === "resolved") {
		throw new AppError("This ticket is resolved.", HTTP_STATUS.CONFLICT);
	}

	const now = new Date();
	const msg = await prisma.ticketMessage.create({
		data: { ticketId, senderId: user.id, senderName: user.name, senderRole: user.role, content },
	});
	await prisma.supportTicket.update({
		where: { id: ticketId },
		data: {
			ownershipType: "HUMAN",
			status: ticket.status === "escalated" ? "escalated" : "waiting_student",
			assignedAgentId: ticket.assignedAgentId ?? user.id,
			assignedAgentName: ticket.assignedAgentName ?? user.name,
			humanAcceptedAt: ticket.humanAcceptedAt ?? now,
			firstResponseAt: ticket.firstResponseAt ?? now,
			lastMessageAt: now,
			waitingSince: null,
		},
	});

	// Live update for the student's Support Center.
	getIO()
		?.to(ticketRoom(ticketId))
		.emit("chat:message", { ticketId, message: messageToDto({ ...msg, attachments: [] }) });
	getIO()?.to(ticketRoom(ticketId)).to(userRoom(ticket.studentId)).emit("ticket:updated", { ticketId });

	sendSuccess(res, msg, "Message posted successfully", HTTP_STATUS.CREATED);
}

/**
 * POST /api/support/tickets/:ticketId/ai-suggest  (support/admin)
 * Drafts a reply with the AI Support Agent for the human agent to edit and send.
 */
export async function suggestReply(req: Request, res: Response): Promise<void> {
	const ticketId = getParamString(req.params.ticketId);
	const result = await suggestAgentReply(ticketId);
	if (!result) {
		throw new AppError("AI suggestion unavailable right now.", 503);
	}
	sendSuccess(res, result, "Draft generated", HTTP_STATUS.OK);
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
