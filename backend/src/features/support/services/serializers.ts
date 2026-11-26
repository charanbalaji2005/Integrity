import type { Prisma } from "@prisma/client";
import {
	categoryLabel,
	moduleLabel,
	OPEN_STATUSES,
	REOPEN_WINDOW_DAYS,
	type TicketStatus,
} from "../support-constants";
import { signedAttachmentUrl } from "./infra";

export const detailInclude = {
	messages: {
		orderBy: { createdAt: "asc" },
		include: { attachments: { select: { id: true, fileName: true, mimeType: true, size: true } } },
	},
	attachments: {
		where: { messageId: null },
		select: { id: true, fileName: true, mimeType: true, size: true },
	},
	assignments: {
		orderBy: { assignedAt: "desc" },
		include: { staff: { include: { user: { select: { name: true } } } } },
	},
	aiAnalyses: { orderBy: { createdAt: "desc" }, take: 1 },
	internalNotes: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.SupportTicketInclude;

export const summaryInclude = {
	messages: { orderBy: { createdAt: "desc" }, take: 1, select: { content: true, createdAt: true } },
} satisfies Prisma.SupportTicketInclude;

export type TicketWithDetail = Prisma.SupportTicketGetPayload<{ include: typeof detailInclude }>;
export type TicketWithSummary = Prisma.SupportTicketGetPayload<{ include: typeof summaryInclude }>;
type TicketBase = Prisma.SupportTicketGetPayload<object>;

export interface Viewer {
	id: string;
	name: string;
	role: string;
	staffId: string | null;
	isSupervisor: boolean;
}

export function isStaffRole(role: string): boolean {
	return role === "support" || role === "admin";
}

function senderType(m: {
	senderRole: string;
	senderId: string;
	messageType: string;
}): "student" | "ai" | "agent" | "system" {
	if (m.messageType === "system" || m.messageType === "handoff" || m.senderId === "system")
		return "system";
	if (m.senderRole === "ai") return "ai";
	if (m.senderRole === "support" || m.senderRole === "admin") return "agent";
	return "student";
}

function attachment(a: { id: string; fileName: string; mimeType: string; size: number }) {
	return {
		id: a.id,
		fileName: a.fileName,
		mimeType: a.mimeType,
		size: a.size,
		url: signedAttachmentUrl(a.id),
	};
}

export function toSummary(
	t: TicketBase & { messages?: Array<{ content: string; createdAt: Date }> },
) {
	const last = t.messages?.[t.messages.length - 1] ?? t.messages?.[0];
	return {
		id: t.id,
		referenceNumber: t.referenceNumber,
		title: t.title,
		category: t.category,
		categoryLabel: categoryLabel(t.category),
		affectedModule: t.affectedModule,
		moduleLabel: moduleLabel(t.affectedModule),
		priority: t.priority,
		status: t.status as TicketStatus,
		ownershipType: t.ownershipType as "AI" | "HUMAN",
		studentId: t.studentId,
		studentName: t.studentName,
		assignedAgentId: t.assignedAgentId,
		assignedAgentName: t.assignedAgentName,
		createdAt: t.createdAt.toISOString(),
		updatedAt: t.updatedAt.toISOString(),
		lastMessageAt: t.lastMessageAt.toISOString(),
		lastMessagePreview: (last?.content ?? t.description).replace(/\s+/g, " ").slice(0, 140),
		waitingSince: t.waitingSince ? t.waitingSince.toISOString() : null,
		blocksExam: t.blocksExam,
		rating: t.rating,
	};
}

export function computePermissions(t: TicketWithDetail, viewer: Viewer) {
	const open = OPEN_STATUSES.includes(t.status as TicketStatus);
	const pending = t.assignments.find((a) => a.status === "pending");
	const offeredToMe = Boolean(pending && viewer.staffId && pending.staffId === viewer.staffId);
	const isAssignee = t.assignedAgentId === viewer.id && t.ownershipType === "HUMAN";
	const sup = viewer.isSupervisor;
	return {
		canAccept:
			open &&
			(t.status === "unassigned" ||
				(t.status === "pending_acceptance" && (offeredToMe || sup)) ||
				(t.status === "escalated" && t.ownershipType === "AI")),
		canReassign: open && (isAssignee || sup || offeredToMe),
		canResolve: open && (isAssignee || sup),
		canEscalate: open && (isAssignee || sup),
		canChangePriority: open && (isAssignee || sup),
		canReturnToAi: open && t.ownershipType === "HUMAN" && (isAssignee || sup),
		canMessage: open && (isAssignee || (sup && t.ownershipType === "HUMAN")),
		isSupervisor: sup,
	};
}

export function toDetail(t: TicketWithDetail, viewer: Viewer) {
	const staff = isStaffRole(viewer.role);
	const resolvedAt = t.resolvedAt;
	const canReopen =
		!staff &&
		t.status === "resolved" &&
		Boolean(resolvedAt && Date.now() - resolvedAt.getTime() < REOPEN_WINDOW_DAYS * 86_400_000);

	const base = {
		...toSummary({
			...t,
			messages: t.messages.map((m) => ({ content: m.content, createdAt: m.createdAt })),
		}),
		description: t.description,
		subcategory: t.subcategory,
		severity: t.severity,
		urgency: t.urgency,
		department: t.department,
		resolution: t.resolutionDetails,
		resolvedAt: resolvedAt ? resolvedAt.toISOString() : null,
		reopenCount: t.reopenCount,
		canReopen,
		ratingComment: t.ratingComment,
		messages: t.messages.map((m) => ({
			id: m.id,
			senderType: senderType(m),
			senderName: m.senderName,
			content: m.content,
			messageType: (m.messageType as "text" | "system" | "handoff") ?? "text",
			createdAt: m.createdAt.toISOString(),
			attachments: m.attachments.map(attachment),
		})),
		attachments: t.attachments.map(attachment),
	};
	if (!staff) return base;

	const assignmentInfo = (a: TicketWithDetail["assignments"][number]) => ({
		id: a.id,
		staffId: a.staffId,
		staffName: a.staff.user.name,
		status: a.status,
		assignedAt: a.assignedAt.toISOString(),
		acceptedAt: a.acceptedAt ? a.acceptedAt.toISOString() : null,
		timeoutAt: a.timeoutAt ? a.timeoutAt.toISOString() : null,
		score: a.assignmentScore,
		reason: a.reassignmentReason,
	});
	const current =
		t.assignments.find((a) => a.status === "pending" || a.status === "accepted") ?? null;
	const ai = t.aiAnalyses[0];
	let requiredExpertise: string[] = [];
	try {
		requiredExpertise = ai ? JSON.parse(ai.requiredExpertise) : [];
	} catch {
		/* ignore */
	}
	const recommended = ai?.recommendedStaffId
		? t.assignments.find((a) => a.staffId === ai.recommendedStaffId)
		: undefined;
	return {
		...base,
		assignment: current ? assignmentInfo(current) : null,
		assignmentHistory: t.assignments.map(assignmentInfo),
		aiAnalysis: ai
			? {
					category: ai.category,
					subcategory: ai.subcategory,
					priority: ai.priority,
					priorityReason: ai.priorityReason,
					severity: ai.severity,
					issueSummary: ai.issueSummary,
					suggestedDepartment: ai.suggestedDepartment,
					requiredExpertise,
					recommendedStaffId: ai.recommendedStaffId,
					recommendedStaffName: recommended?.staff.user.name ?? null,
					confidence: ai.confidence,
					blocksExam: ai.blocksExam,
					recurring: ai.recurring,
					generatedBy: ai.generatedBy,
					createdAt: ai.createdAt.toISOString(),
				}
			: null,
		internalNotes: t.internalNotes.map((n) => ({
			id: n.id,
			staffId: n.staffId,
			staffName: n.staffName,
			content: n.content,
			kind: n.kind,
			createdAt: n.createdAt.toISOString(),
		})),
		permissions: computePermissions(t, viewer),
	};
}

export function messageToDto(m: {
	id: string;
	senderRole: string;
	senderId: string;
	senderName: string;
	content: string;
	messageType: string;
	createdAt: Date;
	attachments?: Array<{ id: string; fileName: string; mimeType: string; size: number }>;
}) {
	return {
		id: m.id,
		senderType: senderType(m),
		senderName: m.senderName,
		content: m.content,
		messageType: m.messageType as "text" | "system" | "handoff",
		createdAt: m.createdAt.toISOString(),
		attachments: (m.attachments ?? []).map(attachment),
	};
}
