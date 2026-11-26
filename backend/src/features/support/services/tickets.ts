import { HTTP_STATUS } from "../../../constants/http-status";
import { prisma } from "../../../database";
import { getIO } from "../../../providers/socket";
import { AppError } from "../../../utils/app-error";
import {
	categoryLabel,
	OPEN_STATUSES,
	type Priority,
	type TicketStatus,
} from "../support-constants";
import {
	alertSupervisors,
	autoAssign,
	ensureStaffProfile,
	getSettings,
	listStaffProfiles,
	offerTo,
	processQueue,
	rankCandidates,
} from "./assignment";
import {
	ALLOWED_UPLOAD_MIME,
	audit,
	detectUploadMime,
	emitToStaff,
	notifyUser,
	STAFF_ROOM,
	ticketRoom,
	userRoom,
} from "./infra";
import { searchKnowledgeBase } from "./knowledge-base";
import { callLLM, parseJsonLoose } from "./llm";
import {
	computePermissions,
	detailInclude,
	isStaffRole,
	messageToDto,
	summaryInclude,
	type TicketWithDetail,
	toDetail,
	toSummary,
	type Viewer,
} from "./serializers";
import { generateFirstResponse, generateFollowUpReply, triageTicket } from "./triage";

export interface AuthUser {
	id: string;
	name: string;
	email: string;
	role: string;
	institutionName?: string | null;
}
export interface UploadFile {
	buffer: Buffer;
	originalname: string;
	mimetype: string;
	size: number;
}

const AI_SENDER = {
	senderId: "ai-support-agent",
	senderName: "IntegrityOS AI Assistant",
	senderRole: "ai",
};
const SYSTEM_SENDER = { senderId: "system", senderName: "System", senderRole: "system" };

// ------------------------------------------------------------- helpers
export async function viewerFor(user: AuthUser): Promise<Viewer> {
	if (!isStaffRole(user.role))
		return { id: user.id, name: user.name, role: user.role, staffId: null, isSupervisor: false };
	const staff = await ensureStaffProfile(user.id);
	return {
		id: user.id,
		name: user.name,
		role: user.role,
		staffId: staff?.id ?? null,
		isSupervisor: user.role === "admin" || staff?.supportRole === "supervisor",
	};
}

/** Broadcast a ticket lifecycle event to staff, the ticket room and the owning student's private room. */
async function broadcast(event: string, ticketId: string, extra: Record<string, unknown> = {}) {
	const t = await prisma.supportTicket.findUnique({
		where: { id: ticketId },
		include: summaryInclude,
	});
	if (!t) return;
	getIO()
		?.to(STAFF_ROOM)
		.to(ticketRoom(ticketId))
		.to(userRoom(t.studentId))
		.emit(event, { ticketId, ticket: toSummary(t), ...extra });
}

async function loadDetail(ticketId: string): Promise<TicketWithDetail> {
	const t = await prisma.supportTicket.findUnique({
		where: { id: ticketId },
		include: detailInclude,
	});
	if (!t) throw new AppError("Ticket not found.", HTTP_STATUS.NOT_FOUND);
	return t;
}

/** Loads a ticket the viewer may see (owner or staff); 404 otherwise to prevent IDOR probing. */
async function authorizedTicket(ticketId: string, viewer: Viewer): Promise<TicketWithDetail> {
	const t = await loadDetail(ticketId);
	if (!isStaffRole(viewer.role) && t.studentId !== viewer.id)
		throw new AppError("Ticket not found.", HTTP_STATUS.NOT_FOUND);
	return t;
}

async function postSystem(
	ticketId: string,
	content: string,
	messageType: "system" | "handoff" = "system",
) {
	const m = await prisma.ticketMessage.create({
		data: { ticketId, ...SYSTEM_SENDER, messageType, content },
	});
	getIO()
		?.to(ticketRoom(ticketId))
		.emit("chat:message", { ticketId, message: messageToDto(m) });
	return m;
}

async function postAi(ticketId: string, content: string) {
	const m = await prisma.ticketMessage.create({ data: { ticketId, ...AI_SENDER, content } });
	await prisma.supportTicket.update({
		where: { id: ticketId },
		data: { lastMessageAt: m.createdAt },
	});
	getIO()
		?.to(ticketRoom(ticketId))
		.emit("chat:message", { ticketId, message: messageToDto(m) });
	return m;
}

function aiTyping(ticketId: string, isTyping: boolean) {
	getIO()
		?.to(ticketRoom(ticketId))
		.emit("chat:typing", { ticketId, name: AI_SENDER.senderName, senderType: "ai", isTyping });
}

async function nextReference(): Promise<string> {
	const year = new Date().getFullYear();
	for (let i = 0; i < 3; i++) {
		try {
			const c = await prisma.supportCounter.upsert({
				where: { year },
				create: { year, value: 1 },
				update: { value: { increment: 1 } },
			});
			return `AS-${year}-${String(c.value).padStart(5, "0")}`;
		} catch {
			// concurrent first insert for the year — retry
		}
	}
	throw new AppError(
		"Could not allocate a ticket reference. Please retry.",
		HTTP_STATUS.INTERNAL_SERVER_ERROR,
	);
}

async function saveFiles(
	ticketId: string,
	messageId: string | null,
	uploaderId: string,
	files: UploadFile[],
) {
	for (const f of files) {
		const mime = detectUploadMime(f.buffer, f.mimetype);
		if (!mime || !ALLOWED_UPLOAD_MIME.has(mime))
			throw new AppError(
				`Unsupported file "${f.originalname}". Use PNG, JPG, WEBP, PDF or TXT.`,
				HTTP_STATUS.BAD_REQUEST,
			);
	}
	for (const f of files) {
		await prisma.supportAttachment.create({
			data: {
				ticketId,
				messageId,
				uploaderId,
				fileName: f.originalname.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "attachment",
				mimeType: detectUploadMime(f.buffer, f.mimetype)!,
				size: f.size,
				data: new Uint8Array(f.buffer),
			},
		});
	}
}

const safeJson = (raw: string | undefined) => {
	if (!raw) return null;
	try {
		const v = JSON.parse(raw);
		return v && typeof v === "object" ? v : null;
	} catch {
		return null;
	}
};

/** Strips anything from client diagnostics that isn't in the disclosed list. */
function sanitizeDiagnostics(raw: Record<string, unknown> | null) {
	if (!raw) return null;
	const pick = (k: string, max = 120) =>
		typeof raw[k] === "string" ? String(raw[k]).slice(0, max) : undefined;
	const conn =
		raw.connection && typeof raw.connection === "object"
			? (raw.connection as Record<string, unknown>)
			: null;
	const failed = Array.isArray(raw.recentFailedRequests) ? raw.recentFailedRequests : [];
	return {
		browser: pick("browser"),
		browserVersion: pick("browserVersion", 40),
		os: pick("os"),
		deviceType: pick("deviceType", 20),
		screen: pick("screen", 20),
		viewport: pick("viewport", 20),
		language: pick("language", 20),
		timezone: pick("timezone", 60),
		online: typeof raw.online === "boolean" ? raw.online : undefined,
		connection: conn
			? {
					effectiveType: typeof conn.effectiveType === "string" ? conn.effectiveType : undefined,
					downlink: typeof conn.downlink === "number" ? conn.downlink : undefined,
					rtt: typeof conn.rtt === "number" ? conn.rtt : undefined,
				}
			: null,
		cameraPermission: pick("cameraPermission", 20),
		microphonePermission: pick("microphonePermission", 20),
		webrtcSupported: typeof raw.webrtcSupported === "boolean" ? raw.webrtcSupported : undefined,
		socketConnected: typeof raw.socketConnected === "boolean" ? raw.socketConnected : null,
		appVersion: pick("appVersion", 40),
		recentFailedRequests: failed.slice(0, 10).flatMap((r) => {
			if (!r || typeof r !== "object") return [];
			const o = r as Record<string, unknown>;
			const path = typeof o.path === "string" ? o.path.split("?")[0]!.slice(0, 200) : null;
			return path
				? [{ path, status: Number(o.status) || 0, at: typeof o.at === "string" ? o.at : null }]
				: [];
		}),
		collectedAt: pick("collectedAt", 40),
	};
}

// ------------------------------------------------------------- student actions
export async function createTicket(
	user: AuthUser,
	input: Record<string, string | undefined>,
	files: UploadFile[],
) {
	if (isStaffRole(user.role))
		throw new AppError("Support staff cannot raise student tickets.", HTTP_STATUS.BAD_REQUEST);
	const reference = await nextReference();
	const diagnostics = sanitizeDiagnostics(safeJson(input.diagnostics));
	let examAttemptId: string | null = null;
	if (input.examAttemptId) {
		const owned = await prisma.assessmentAttempt.findFirst({
			where: { id: input.examAttemptId, studentId: user.id },
			select: { id: true },
		});
		examAttemptId = owned?.id ?? null; // never link someone else's attempt
	}
	const now = new Date();
	const ticket = await prisma.supportTicket.create({
		data: {
			referenceNumber: reference,
			studentId: user.id,
			studentName: user.name,
			email: user.email,
			institutionName: user.institutionName ?? null,
			category: input.category!,
			affectedModule: input.affectedModule!,
			title: input.title!.trim(),
			description: input.description!.trim(),
			urgency: input.urgency!,
			priority:
				input.urgency === "critical"
					? "P2"
					: input.urgency === "high"
						? "P2"
						: input.urgency === "low"
							? "P4"
							: "P3",
			department: "AI Triage",
			status: "unassigned",
			ownershipType: "AI",
			examAttemptId,
			waitingSince: now,
			lastMessageAt: now,
			portalContext: {
				create: {
					studentId: user.id,
					sourcePortal: "Student Portal",
					sourcePath: (input.sourcePath || "Student Portal › Support Center").slice(0, 300),
					sourceModule: input.affectedModule,
					examinationSessionId: examAttemptId,
					browserInformation: diagnostics
						? JSON.stringify({ browser: diagnostics.browser, version: diagnostics.browserVersion })
						: null,
					deviceInformation: diagnostics
						? JSON.stringify({
								os: diagnostics.os,
								deviceType: diagnostics.deviceType,
								screen: diagnostics.screen,
								viewport: diagnostics.viewport,
							})
						: null,
					connectionInformation: diagnostics
						? JSON.stringify({ online: diagnostics.online, connection: diagnostics.connection })
						: null,
					diagnosticMetadata: diagnostics ? JSON.stringify(diagnostics) : null,
				},
			},
		},
	});
	if (files.length) await saveFiles(ticket.id, null, user.id, files);
	await audit({
		actorId: user.id,
		actorName: user.name,
		ticketId: ticket.id,
		action: "TICKET_CREATED",
		newValue: { reference, category: ticket.category, urgency: ticket.urgency },
	});
	await broadcast("ticket:created", ticket.id);

	// Triage, assignment and the AI's first reply run in the background.
	void triageAndRespond(ticket.id).catch((err) => console.error("[Support] triage failed:", err));

	const viewer = await viewerFor(user);
	return toDetail(await loadDetail(ticket.id), viewer);
}

async function triageAndRespond(ticketId: string) {
	const t = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
	if (!t) return;
	aiTyping(ticketId, true);
	const triage = await triageTicket({
		ticketId,
		studentId: t.studentId,
		category: t.category,
		affectedModule: t.affectedModule,
		urgency: t.urgency,
		title: t.title,
		description: t.description,
		examAttemptId: t.examAttemptId,
	});
	const settings = await getSettings();
	const ranked = rankCandidates(await listStaffProfiles(), t.category, settings, new Set());
	await prisma.$transaction([
		prisma.supportTicket.update({
			where: { id: ticketId },
			data: {
				priority: triage.priority,
				severity: triage.severity,
				subcategory: triage.subcategory,
				blocksExam: triage.blocksExam,
				department: triage.department,
				examAttemptId: t.examAttemptId ?? triage.activeAttemptId,
			},
		}),
		prisma.supportAIAnalysis.create({
			data: {
				ticketId,
				category: t.category,
				subcategory: triage.subcategory,
				priority: triage.priority,
				priorityReason: triage.priorityReason,
				severity: triage.severity,
				issueSummary: triage.issueSummary,
				suggestedDepartment: triage.department,
				requiredExpertise: JSON.stringify(triage.requiredExpertise),
				recommendedStaffId: ranked[0]?.staff.id ?? null,
				confidence: triage.confidence,
				blocksExam: triage.blocksExam,
				recurring: triage.recurring,
				generatedBy: triage.generatedBy,
			},
		}),
	]);
	if (!t.examAttemptId && triage.activeAttemptId) {
		await prisma.studentPortalContext.updateMany({
			where: { ticketId },
			data: { examinationSessionId: triage.activeAttemptId },
		});
	}
	await audit({
		actorName: "AI triage agent",
		ticketId,
		action: "TICKET_TRIAGED",
		newValue: {
			priority: triage.priority,
			reason: triage.priorityReason,
			generatedBy: triage.generatedBy,
		},
	});
	await broadcast("ticket:triaged", ticketId);
	if (triage.priority === "P1")
		await alertSupervisors(
			ticketId,
			`Critical ticket ${t.referenceNumber}: ${triage.issueSummary}`,
		);

	const assigned = await autoAssign(ticketId);
	await processQueue();
	const fresh = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
	const queueNote = assigned
		? "A support representative has been notified and will join this conversation shortly — you won't need to repeat anything."
		: `All support representatives are busy right now. You're number ${fresh?.queuePosition ?? 1} in the queue (estimated wait about ${fresh?.estimatedWait ?? 30} minutes); I'll keep helping meanwhile.`;

	const reply = await generateFirstResponse({
		studentName: t.studentName,
		category: t.category,
		title: t.title,
		description: t.description,
		priority: triage.priority,
		queueNote,
	});
	aiTyping(ticketId, false);
	await postAi(ticketId, reply.text);
	await broadcast("ticket:updated", ticketId);
}

export async function listMyTickets(user: AuthUser) {
	const rows = await prisma.supportTicket.findMany({
		where: { studentId: user.id },
		include: summaryInclude,
		orderBy: { updatedAt: "desc" },
	});
	return rows.map(toSummary);
}

export async function getTicket(user: AuthUser, ticketId: string) {
	const viewer = await viewerFor(user);
	return toDetail(await authorizedTicket(ticketId, viewer), viewer);
}

export async function postMessage(
	user: AuthUser,
	ticketId: string,
	content: string,
	files: UploadFile[],
) {
	const viewer = await viewerFor(user);
	const t = await authorizedTicket(ticketId, viewer);
	const staff = isStaffRole(user.role);
	const text = content.trim();
	if (!text && files.length === 0)
		throw new AppError("Write a message or attach a file.", HTTP_STATUS.BAD_REQUEST);
	if (!OPEN_STATUSES.includes(t.status as TicketStatus))
		throw new AppError(
			"This ticket is resolved. Reopen it to continue the conversation.",
			HTTP_STATUS.CONFLICT,
		);
	if (staff && !computePermissions(t, viewer).canMessage) {
		throw new AppError(
			t.ownershipType === "AI"
				? "Accept the ticket before replying to the student."
				: "Only the assigned representative or a supervisor can reply.",
			HTTP_STATUS.FORBIDDEN,
		);
	}

	const now = new Date();
	const m = await prisma.ticketMessage.create({
		data: {
			ticketId,
			senderId: user.id,
			senderName: user.name,
			senderRole: staff ? user.role : "user",
			content: text || "(attachment)",
		},
	});
	if (files.length) await saveFiles(ticketId, m.id, user.id, files);
	await prisma.supportTicket.update({
		where: { id: ticketId },
		data: staff
			? {
					lastMessageAt: now,
					waitingSince: null,
					firstResponseAt: t.firstResponseAt ?? now,
					status: t.status === "escalated" ? "escalated" : "waiting_student",
				}
			: {
					lastMessageAt: now,
					waitingSince: t.waitingSince ?? now,
					...(t.status === "waiting_student" && t.ownershipType === "HUMAN"
						? { status: "in_progress" }
						: {}),
				},
	});
	const full = await prisma.ticketMessage.findUnique({
		where: { id: m.id },
		include: { attachments: { select: { id: true, fileName: true, mimeType: true, size: true } } },
	});
	const dto = messageToDto(full!);
	getIO()?.to(ticketRoom(ticketId)).emit("chat:message", { ticketId, message: dto });
	await broadcast("ticket:updated", ticketId);

	if (!staff && t.assignedAgentId && t.ownershipType === "HUMAN") {
		await notifyUser(t.assignedAgentId, {
			title: `New message on ${t.referenceNumber}`,
			description: text.slice(0, 120),
			ticketId,
		});
	}
	// While the AI owns the conversation it answers the student (never after human takeover).
	if (!staff && t.ownershipType === "AI")
		void aiFollowUp(ticketId, text).catch((err) =>
			console.error("[Support] AI reply failed:", err),
		);
	return dto;
}

async function aiFollowUp(ticketId: string, studentMessage: string) {
	const t = await prisma.supportTicket.findUnique({
		where: { id: ticketId },
		include: { messages: { orderBy: { createdAt: "asc" } } },
	});
	if (t?.ownershipType !== "AI") return;
	aiTyping(ticketId, true);
	const history = t.messages.map((m) => ({
		role: (m.senderRole === "ai"
			? "ai"
			: m.senderRole === "user"
				? "student"
				: m.senderId === "system"
					? "system"
					: "agent") as "student" | "ai" | "agent" | "system",
		content: m.content,
	}));
	const reply = await generateFollowUpReply({ category: t.category, history, studentMessage });
	aiTyping(ticketId, false);
	// Re-check ownership: a human may have accepted while the model was thinking.
	const latest = await prisma.supportTicket.findUnique({
		where: { id: ticketId },
		select: { ownershipType: true, assignedAgentId: true, status: true, referenceNumber: true },
	});
	if (latest?.ownershipType !== "AI") return;
	await postAi(ticketId, reply);

	// Returned-to-AI tickets go back to their representative once the student has answered.
	if (latest.assignedAgentId && latest.status === "waiting_student") {
		await prisma.supportTicket.update({
			where: { id: ticketId },
			data: { ownershipType: "HUMAN", status: "in_progress" },
		});
		await postSystem(
			ticketId,
			"Your support representative has been notified of your reply and will continue the conversation.",
			"handoff",
		);
		getIO()
			?.to(ticketRoom(ticketId))
			.emit("chat:handoff", { ticketId, ownershipType: "HUMAN", agentName: null });
		await notifyUser(latest.assignedAgentId, {
			title: `Student replied: ${latest.referenceNumber}`,
			description: "The ticket is back with you after AI information gathering.",
			ticketId,
		});
		await broadcast("ticket:updated", ticketId);
	}
}

export async function closeByStudent(user: AuthUser, ticketId: string) {
	const viewer = await viewerFor(user);
	const t = await authorizedTicket(ticketId, viewer);
	if (t.studentId !== user.id)
		throw new AppError(
			"Only the student who raised the ticket can close it.",
			HTTP_STATUS.FORBIDDEN,
		);
	if (t.status === "resolved") return toDetail(t, viewer);
	await prisma.$transaction([
		prisma.supportTicket.update({
			where: { id: ticketId },
			data: {
				status: "resolved",
				resolvedAt: new Date(),
				resolutionDetails: "Closed by the student (issue confirmed solved).",
				waitingSince: null,
				queuePosition: 0,
			},
		}),
		prisma.ticketAssignment.updateMany({
			where: { ticketId, status: "pending" },
			data: { status: "released", endedAt: new Date(), reassignmentReason: "Closed by student" },
		}),
	]);
	await postSystem(ticketId, "The student marked this issue as solved.");
	await audit({ actorId: user.id, actorName: user.name, ticketId, action: "CLOSED_BY_STUDENT" });
	await broadcast("ticket:resolved", ticketId);
	return toDetail(await loadDetail(ticketId), viewer);
}

export async function reopen(user: AuthUser, ticketId: string, reason: string) {
	const viewer = await viewerFor(user);
	const t = await authorizedTicket(ticketId, viewer);
	if (t.studentId !== user.id)
		throw new AppError(
			"Only the student who raised the ticket can reopen it.",
			HTTP_STATUS.FORBIDDEN,
		);
	if (!toDetail(t, viewer).canReopen)
		throw new AppError(
			"This ticket can no longer be reopened. Please raise a new ticket.",
			HTTP_STATUS.CONFLICT,
		);
	await prisma.supportTicket.update({
		where: { id: ticketId },
		data: {
			status: "unassigned",
			ownershipType: "AI",
			assignedAgentId: null,
			assignedAgentName: null,
			resolvedAt: null,
			reopenCount: { increment: 1 },
			waitingSince: new Date(),
			rating: null,
			ratingComment: null,
		},
	});
	await prisma.ticketMessage.create({
		data: {
			ticketId,
			senderId: user.id,
			senderName: user.name,
			senderRole: "user",
			content: `Reopened: ${reason}`,
		},
	});
	await postSystem(ticketId, "The ticket was reopened and is back in the support queue.");
	await audit({
		actorId: user.id,
		actorName: user.name,
		ticketId,
		action: "REOPENED",
		newValue: reason,
	});
	await broadcast("ticket:updated", ticketId);
	void autoAssign(ticketId, { reason: "Reopened by student" }).then(() => processQueue());
	return toDetail(await loadDetail(ticketId), viewer);
}

export async function rate(user: AuthUser, ticketId: string, rating: number, comment?: string) {
	const viewer = await viewerFor(user);
	const t = await authorizedTicket(ticketId, viewer);
	if (t.studentId !== user.id)
		throw new AppError(
			"Only the student who raised the ticket can rate it.",
			HTTP_STATUS.FORBIDDEN,
		);
	if (t.status !== "resolved")
		throw new AppError(
			"You can rate the support once the ticket is resolved.",
			HTTP_STATUS.CONFLICT,
		);
	await prisma.supportTicket.update({
		where: { id: ticketId },
		data: { rating, ratingComment: comment?.trim().slice(0, 1000) || null },
	});
	await audit({
		actorId: user.id,
		actorName: user.name,
		ticketId,
		action: "RATED",
		newValue: { rating },
	});
	await broadcast("ticket:updated", ticketId);
	return toDetail(await loadDetail(ticketId), viewer);
}

// ------------------------------------------------------------- staff actions
async function staffTicket(user: AuthUser, ticketId: string) {
	if (!isStaffRole(user.role)) throw new AppError("Support staff only.", HTTP_STATUS.FORBIDDEN);
	const viewer = await viewerFor(user);
	const t = await loadDetail(ticketId);
	return { viewer, t, perms: computePermissions(t, viewer) };
}

export async function acceptTicket(user: AuthUser, ticketId: string) {
	const { viewer, t, perms } = await staffTicket(user, ticketId);
	if (!perms.canAccept || !viewer.staffId)
		throw new AppError(
			"This ticket isn't available for you to accept (it may have been taken or offered to someone else).",
			HTTP_STATUS.CONFLICT,
		);
	const pending = t.assignments.find((a) => a.status === "pending");
	const now = new Date();
	const won = await prisma.$transaction(async (tx) => {
		// Compare-and-set: only one representative can flip AI → HUMAN.
		const upd = await tx.supportTicket.updateMany({
			where: {
				id: ticketId,
				ownershipType: "AI",
				status: { in: ["unassigned", "pending_acceptance", "escalated"] },
			},
			data: {
				ownershipType: "HUMAN",
				status: "in_progress",
				assignedAgentId: user.id,
				assignedAgentName: user.name,
				humanAcceptedAt: now,
				department: t.department === "AI Triage" ? "Technical Support" : t.department,
			},
		});
		if (upd.count === 0) return false;
		if (pending && pending.staffId === viewer.staffId) {
			await tx.ticketAssignment.update({
				where: { id: pending.id },
				data: { status: "accepted", acceptedAt: now },
			});
		} else {
			if (pending)
				await tx.ticketAssignment.update({
					where: { id: pending.id },
					data: {
						status: "reassigned",
						endedAt: now,
						reassignmentReason: `Claimed by ${user.name}`,
					},
				});
			await tx.ticketAssignment.create({
				data: {
					ticketId,
					staffId: viewer.staffId!,
					status: "accepted",
					acceptedAt: now,
					assignedById: user.id,
					reassignmentReason: "Claimed from queue",
				},
			});
		}
		return true;
	});
	if (!won)
		throw new AppError("Another representative accepted this ticket first.", HTTP_STATUS.CONFLICT);

	await postSystem(
		ticketId,
		`${user.name} from Support has joined the conversation and can see everything you've shared so far.`,
		"handoff",
	);
	getIO()
		?.to(ticketRoom(ticketId))
		.emit("chat:handoff", { ticketId, ownershipType: "HUMAN", agentName: user.name });
	await notifyUser(t.studentId, {
		title: `${t.referenceNumber}: a support representative joined`,
		description: `${user.name} is now handling your ticket.`,
		ticketId,
	});
	await audit({
		actorId: user.id,
		actorName: user.name,
		ticketId,
		action: "ACCEPTED",
		previousValue: { ownership: "AI", status: t.status },
		newValue: { ownership: "HUMAN", agent: user.name },
	});
	await broadcast("ticket:accepted", ticketId, { agentName: user.name });
	return toDetail(await loadDetail(ticketId), viewer);
}

export async function reassignTicket(
	user: AuthUser,
	ticketId: string,
	staffId: string | undefined,
	reason: string,
) {
	const { viewer, t, perms } = await staffTicket(user, ticketId);
	if (!perms.canReassign)
		throw new AppError("You can't reassign this ticket.", HTTP_STATUS.FORBIDDEN);
	if (staffId && !viewer.isSupervisor)
		throw new AppError(
			"Only supervisors can choose a specific representative.",
			HTTP_STATUS.FORBIDDEN,
		);
	const current = t.assignments.find((a) => a.status === "pending" || a.status === "accepted");
	const now = new Date();
	await prisma.$transaction([
		prisma.supportTicket.update({
			where: { id: ticketId },
			data: {
				ownershipType: "AI",
				status: "unassigned",
				assignedAgentId: null,
				assignedAgentName: null,
				reassignmentCount: { increment: 1 },
				waitingSince: t.waitingSince ?? now,
			},
		}),
		...(current
			? [
					prisma.ticketAssignment.update({
						where: { id: current.id },
						data: {
							status: staffId ? "reassigned" : "released",
							endedAt: now,
							reassignmentReason: reason,
						},
					}),
				]
			: []),
	]);
	await audit({
		actorId: user.id,
		actorName: user.name,
		ticketId,
		action: staffId ? "REASSIGNED_BY_SUPERVISOR" : "RELEASED",
		previousValue: current ? { staffId: current.staffId } : null,
		newValue: { staffId: staffId ?? "engine", reason },
	});
	if (t.ownershipType === "HUMAN")
		await postSystem(
			ticketId,
			"Your ticket is being transferred to another support representative. Your conversation history is kept.",
			"handoff",
		);

	let target: string | null = null;
	if (staffId) {
		const settings = await getSettings();
		target = await offerTo(ticketId, staffId, {
			score: null,
			breakdown: null,
			reason: `Supervisor override: ${reason}`,
			assignedById: user.id,
			timeoutSeconds: settings.acceptanceTimeoutSeconds,
		});
	} else {
		target = await autoAssign(ticketId, { exclude: current ? [current.staffId] : [], reason });
	}
	if (!target) await processQueue();
	await broadcast("ticket:reassigned", ticketId, { reason });
	return toDetail(await loadDetail(ticketId), viewer);
}

export async function escalateTicket(
	user: AuthUser,
	ticketId: string,
	department: string,
	reason: string,
	priority?: Priority,
) {
	const { viewer, t, perms } = await staffTicket(user, ticketId);
	if (!perms.canEscalate)
		throw new AppError("You can't escalate this ticket.", HTTP_STATUS.FORBIDDEN);
	await prisma.supportTicket.update({
		where: { id: ticketId },
		data: { status: "escalated", department, ...(priority ? { priority } : {}) },
	});
	await prisma.supportInternalNote.create({
		data: {
			ticketId,
			staffId: user.id,
			staffName: user.name,
			content: `Escalated to ${department}${priority ? ` as ${priority}` : ""}: ${reason}`,
		},
	});
	await postSystem(
		ticketId,
		`Your ticket has been escalated to the ${department} team for specialist help.`,
	);
	await audit({
		actorId: user.id,
		actorName: user.name,
		ticketId,
		action: "ESCALATED",
		previousValue: { department: t.department, priority: t.priority },
		newValue: { department, priority: priority ?? t.priority, reason },
	});
	await alertSupervisors(
		ticketId,
		`${t.referenceNumber} escalated to ${department} by ${user.name}: ${reason}`,
	);
	await broadcast("ticket:escalated", ticketId, { department });
	return toDetail(await loadDetail(ticketId), viewer);
}

export async function resolveTicket(user: AuthUser, ticketId: string, resolution: string) {
	const { viewer, t, perms } = await staffTicket(user, ticketId);
	if (!perms.canResolve)
		throw new AppError(
			"Only the assigned representative or a supervisor can resolve this ticket.",
			HTTP_STATUS.FORBIDDEN,
		);
	const now = new Date();
	await prisma.$transaction([
		prisma.supportTicket.update({
			where: { id: ticketId },
			data: {
				status: "resolved",
				resolvedAt: now,
				resolutionDetails: resolution,
				waitingSince: null,
				queuePosition: 0,
			},
		}),
		prisma.ticketAssignment.updateMany({
			where: { ticketId, status: "pending" },
			data: { status: "released", endedAt: now, reassignmentReason: "Resolved" },
		}),
	]);
	await postSystem(ticketId, `Resolved by ${user.name}: ${resolution}`);
	await notifyUser(t.studentId, {
		title: `${t.referenceNumber} resolved`,
		description: resolution.slice(0, 140),
		ticketId,
	});
	await audit({
		actorId: user.id,
		actorName: user.name,
		ticketId,
		action: "RESOLVED",
		newValue: resolution,
	});
	await broadcast("ticket:resolved", ticketId);
	return toDetail(await loadDetail(ticketId), viewer);
}

export async function changePriority(
	user: AuthUser,
	ticketId: string,
	priority: Priority,
	reason: string,
) {
	const { viewer, t, perms } = await staffTicket(user, ticketId);
	if (!perms.canChangePriority)
		throw new AppError("You can't change this ticket's priority.", HTTP_STATUS.FORBIDDEN);
	await prisma.supportTicket.update({ where: { id: ticketId }, data: { priority } });
	await prisma.supportInternalNote.create({
		data: {
			ticketId,
			staffId: user.id,
			staffName: user.name,
			content: `Priority changed ${t.priority} → ${priority}: ${reason}`,
		},
	});
	await audit({
		actorId: user.id,
		actorName: user.name,
		ticketId,
		action: "PRIORITY_CHANGED",
		previousValue: t.priority,
		newValue: { priority, reason },
	});
	if (priority === "P1")
		await alertSupervisors(
			ticketId,
			`${t.referenceNumber} raised to P1 by ${user.name}: ${reason}`,
		);
	await broadcast("ticket:updated", ticketId);
	return toDetail(await loadDetail(ticketId), viewer);
}

export async function returnToAi(user: AuthUser, ticketId: string, reason: string) {
	const { viewer, t, perms } = await staffTicket(user, ticketId);
	if (!perms.canReturnToAi)
		throw new AppError("You can't return this ticket to the AI assistant.", HTTP_STATUS.FORBIDDEN);
	await prisma.supportTicket.update({
		where: { id: ticketId },
		data: { ownershipType: "AI", status: "waiting_student" },
	});
	await audit({
		actorId: user.id,
		actorName: user.name,
		ticketId,
		action: "RETURNED_TO_AI",
		newValue: reason,
	});
	getIO()
		?.to(ticketRoom(ticketId))
		.emit("chat:handoff", { ticketId, ownershipType: "AI", agentName: null });
	await postAi(
		ticketId,
		`${t.assignedAgentName ?? "Your support representative"} asked me to collect a few more details so they can continue: ${reason}\nPlease reply here — your representative will be notified as soon as you answer.`,
	);
	await broadcast("ticket:updated", ticketId);
	return toDetail(await loadDetail(ticketId), viewer);
}

export async function addInternalNote(
	user: AuthUser,
	ticketId: string,
	content: string,
	kind: "note" | "verified_finding",
) {
	if (!isStaffRole(user.role)) throw new AppError("Support staff only.", HTTP_STATUS.FORBIDDEN);
	await loadDetail(ticketId);
	const n = await prisma.supportInternalNote.create({
		data: {
			ticketId,
			staffId: user.id,
			staffName: user.name,
			kind,
			content: content.trim().slice(0, 4000),
		},
	});
	await audit({
		actorId: user.id,
		actorName: user.name,
		ticketId,
		action: kind === "verified_finding" ? "FINDING_VERIFIED" : "INTERNAL_NOTE",
	});
	const dto = {
		id: n.id,
		staffId: n.staffId,
		staffName: n.staffName,
		content: n.content,
		kind: n.kind,
		createdAt: n.createdAt.toISOString(),
	};
	emitToStaff("support:note", { ticketId, note: dto }); // staff room only — never the ticket room
	return dto;
}

// ------------------------------------------------------------- copilot (private to staff)
export async function copilot(user: AuthUser, ticketId: string) {
	if (!isStaffRole(user.role)) throw new AppError("Support staff only.", HTTP_STATUS.FORBIDDEN);
	const t = await loadDetail(ticketId);
	const articles = await searchKnowledgeBase({
		q: `${t.title} ${t.description}`,
		category: t.category,
		includeInternal: true,
		limit: 4,
	});
	const similar = await prisma.supportTicket.findMany({
		where: {
			id: { not: ticketId },
			category: t.category,
			status: "resolved",
			resolutionDetails: { not: null },
		},
		orderBy: { resolvedAt: "desc" },
		take: 3,
		select: { id: true, referenceNumber: true, title: true, resolutionDetails: true },
	});
	const transcript = t.messages
		.slice(-14)
		.map(
			(m) =>
				`${m.senderRole === "user" ? "Student" : m.senderRole === "ai" ? "AI assistant" : m.senderId === "system" ? "System" : "Agent"}: ${m.content}`,
		)
		.join("\n");
	const ai = t.aiAnalyses[0];
	const disclaimer =
		"AI suggestion for the representative only — verify against the student's records before acting. Nothing here has been sent to the student.";

	const llm = parseJsonLoose<{
		suggestedReply?: string;
		rootCauses?: Array<{ cause: string; likelihood: string }>;
		steps?: string[];
		recommendedEscalation?: string | null;
		resolutionSummaryDraft?: string;
	}>(
		await callLLM(
			[
				{
					role: "system",
					content:
						'You are an internal copilot for university exam-platform support staff. Use ONLY the ticket, transcript and knowledge-base text. Do not claim to have checked systems. Return JSON {"suggestedReply": string (to the student, <120 words, no promises of grade changes/extensions), "rootCauses": [{"cause": string, "likelihood": "likely"|"possible"}], "steps": [string] (for the agent to verify/try), "recommendedEscalation": string|null (team name or null), "resolutionSummaryDraft": string}.',
				},
				{
					role: "user",
					content: `Ticket ${t.referenceNumber} (${categoryLabel(t.category)}, ${t.priority}${t.blocksExam ? ", blocks exam" : ""}).\nTitle: ${t.title}\nDescription: ${t.description}\nAI triage: ${ai?.issueSummary ?? "n/a"}\n\nTranscript:\n${transcript}\n\nKnowledge base:\n${articles.map((a) => `- ${a.title}: ${a.body}`).join("\n")}\n\nSimilar resolved tickets:\n${similar.map((s) => `- ${s.title}: ${s.resolutionDetails}`).join("\n") || "none"}`,
				},
			],
			{ json: true, timeoutMs: 20000 },
		),
	);

	const base = {
		articles: articles.map((a) => ({ id: a.id, title: a.title })),
		similarTickets: similar.map((s) => ({
			id: s.id,
			referenceNumber: s.referenceNumber,
			title: s.title,
			resolution: s.resolutionDetails,
		})),
		disclaimer,
	};
	await audit({ actorId: user.id, actorName: user.name, ticketId, action: "COPILOT_USED" });
	if (llm?.suggestedReply) {
		return {
			...base,
			suggestedReply: llm.suggestedReply,
			rootCauses: (llm.rootCauses ?? []).slice(0, 5).map((r) => ({
				cause: String(r.cause),
				likelihood: r.likelihood === "likely" ? "likely" : "possible",
			})),
			steps: (llm.steps ?? []).slice(0, 8).map(String),
			recommendedEscalation: llm.recommendedEscalation ?? null,
			resolutionSummaryDraft: llm.resolutionSummaryDraft ?? "",
			generatedBy: "llm" as const,
		};
	}
	const top = articles[0];
	return {
		...base,
		suggestedReply: `Hi ${t.studentName.split(" ")[0]}, thanks for your patience — I'm looking into this now.${top ? ` Could you try the following and tell me what happens?\n${top.body.split("\n").filter(Boolean).slice(0, 3).join("\n")}` : " Could you share any error message you see and when it started?"}`,
		rootCauses: [],
		steps: [
			"Open View Student Portal Details and compare the reported time with recorded events.",
			...(t.blocksExam
				? [
						"Check the exam attempt's proctoring status and last heartbeat; paused attempts need the faculty proctor.",
					]
				: []),
			...(top ? [`Walk through "${top.title}" with the student.`] : []),
		],
		recommendedEscalation: t.priority === "P1" ? "Technical Support (platform)" : null,
		resolutionSummaryDraft: `${categoryLabel(t.category)} issue: ${t.title}. Steps taken: … Outcome: …`,
		generatedBy: "rules" as const,
	};
}

// ------------------------------------------------------------- queue
type QueueView =
	| "all"
	| "mine"
	| "unassigned"
	| "ai"
	| "pending_acceptance"
	| "in_progress"
	| "waiting_student"
	| "escalated"
	| "resolved";
const PRIORITY_RANK: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };

export async function getQueue(
	user: AuthUser,
	q: { view?: string; q?: string; priority?: string; category?: string; sort?: string },
) {
	if (!isStaffRole(user.role)) throw new AppError("Support staff only.", HTTP_STATUS.FORBIDDEN);
	const viewer = await viewerFor(user);
	const myPending = viewer.staffId
		? await prisma.ticketAssignment.findMany({
				where: { staffId: viewer.staffId, status: "pending" },
				select: { ticketId: true },
			})
		: [];
	const myPendingIds = myPending.map((p) => p.ticketId);
	const open = { status: { in: OPEN_STATUSES } };
	const views: Record<QueueView, object> = {
		all: open,
		mine: {
			OR: [
				{ assignedAgentId: user.id, ownershipType: "HUMAN", ...open },
				{ id: { in: myPendingIds } },
			],
		},
		unassigned: { status: "unassigned" },
		ai: { ownershipType: "AI", ...open },
		pending_acceptance: { status: "pending_acceptance" },
		in_progress: { status: "in_progress" },
		waiting_student: { status: "waiting_student" },
		escalated: { status: "escalated" },
		resolved: { status: "resolved" },
	};
	const view = (Object.keys(views).includes(q.view ?? "") ? q.view : "all") as QueueView;
	const where: Record<string, unknown> = { AND: [views[view]] };
	const and = where.AND as object[];
	if (q.priority && PRIORITY_RANK[q.priority] !== undefined) and.push({ priority: q.priority });
	if (q.category) and.push({ category: q.category });
	if (q.q?.trim()) {
		const s = q.q.trim();
		and.push({
			OR: [
				{ referenceNumber: { contains: s, mode: "insensitive" } },
				{ title: { contains: s, mode: "insensitive" } },
				{ studentName: { contains: s, mode: "insensitive" } },
				{ description: { contains: s, mode: "insensitive" } },
			],
		});
	}
	const rows = await prisma.supportTicket.findMany({
		where,
		include: summaryInclude,
		take: 300,
		orderBy: { createdAt: "desc" },
	});
	const sort = q.sort ?? "priority";
	rows.sort((a, b) => {
		if (sort === "oldest") return a.createdAt.getTime() - b.createdAt.getTime();
		if (sort === "newest") return b.createdAt.getTime() - a.createdAt.getTime();
		if (sort === "waiting")
			return (
				(a.waitingSince?.getTime() ?? Number.MAX_SAFE_INTEGER) -
				(b.waitingSince?.getTime() ?? Number.MAX_SAFE_INTEGER)
			);
		return (
			(PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) ||
			a.createdAt.getTime() - b.createdAt.getTime()
		);
	});

	const countFor = (w: object) => prisma.supportTicket.count({ where: w });
	const keys = Object.keys(views) as QueueView[];
	const counts = Object.fromEntries(
		await Promise.all(keys.map(async (k) => [k, await countFor(views[k])] as const)),
	) as Record<QueueView, number>;
	const me = viewer.staffId ? ((await listStaffProfiles({ id: viewer.staffId }))[0] ?? null) : null;
	return { tickets: rows.map(toSummary), counts, me };
}
