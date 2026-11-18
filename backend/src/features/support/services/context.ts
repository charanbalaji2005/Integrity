import { HTTP_STATUS } from "../../../constants/http-status";
import { prisma } from "../../../database";
import { isUserOnline } from "../../../providers/socket";
import { AppError } from "../../../utils/app-error";
import { categoryLabel, FIRST_RESPONSE_SLA_MINUTES, moduleLabel, type Priority, SUPPORT_CATEGORIES } from "../support-constants";
import { audit, signedAttachmentUrl } from "./infra";
import { isStaffRole } from "./serializers";
import type { AuthUser } from "./tickets";

/**
 * "View Student Portal Details": only what is relevant to the ticket, never
 * exam answers or unrelated records. Every access is audited.
 */
export async function getStudentContext(user: AuthUser, ticketId: string) {
	if (!isStaffRole(user.role)) throw new AppError("Support staff only.", HTTP_STATUS.FORBIDDEN);
	const t = await prisma.supportTicket.findUnique({
		where: { id: ticketId },
		include: {
			portalContext: true,
			attachments: { where: { messageId: null }, select: { id: true, fileName: true, mimeType: true, size: true } },
			aiAnalyses: { orderBy: { createdAt: "desc" }, take: 1 },
		},
	});
	if (!t) throw new AppError("Ticket not found.", HTTP_STATUS.NOT_FOUND);
	const student = await prisma.user.findUnique({
		where: { id: t.studentId },
		select: {
			name: true, email: true, rollNumber: true, academicId: true, institutionName: true, department: true, branch: true,
			semester: true, section: true, createdAt: true, emailVerified: true, verificationStatus: true, status: true,
		},
	});
	if (!student) throw new AppError("Student account no longer exists.", HTTP_STATUS.NOT_FOUND);

	await audit({ actorId: user.id, actorName: user.name, ticketId, action: "VIEW_STUDENT_CONTEXT" });

	// Exam context: the attempt linked at creation/triage, owned by this student only.
	let exam = null as null | Record<string, unknown>;
	if (t.examAttemptId) {
		const a = await prisma.assessmentAttempt.findFirst({
			where: { id: t.examAttemptId, studentId: t.studentId },
			select: {
				id: true, status: true, startedAt: true, submittedAt: true, timeLeft: true, proctoringStatus: true, isOnline: true,
				lastHeartbeatAt: true, lastFrameAt: true, networkQuality: true, faceStatus: true, warningCount: true,
				assessment: { select: { id: true, title: true, availabilityStart: true, availabilityEnd: true, duration: true, facultyName: true } },
				proctoringTimeline: { orderBy: { timestamp: "desc" }, take: 30, select: { timestamp: true, event: true, details: true } },
			},
		});
		if (a) {
			exam = {
				attemptId: a.id,
				assessmentId: a.assessment.id,
				title: a.assessment.title,
				course: a.assessment.facultyName ? `Faculty: ${a.assessment.facultyName}` : null,
				scheduledStart: a.assessment.availabilityStart?.toISOString() ?? null,
				scheduledEnd: a.assessment.availabilityEnd?.toISOString() ?? null,
				durationMinutes: a.assessment.duration,
				startedAt: a.startedAt.toISOString(),
				submittedAt: a.submittedAt?.toISOString() ?? null,
				attemptStatus: a.status,
				proctoringStatus: a.proctoringStatus,
				remainingSeconds: a.status === "started" ? a.timeLeft ?? null : null,
				isOnline: a.isOnline,
				lastHeartbeatAt: a.lastHeartbeatAt?.toISOString() ?? null,
				lastFrameAt: a.lastFrameAt?.toISOString() ?? null,
				networkQuality: a.networkQuality,
				faceStatus: a.faceStatus,
				warningCount: a.warningCount,
				events: a.proctoringTimeline.map((e) => ({ at: e.timestamp.toISOString(), event: e.event, details: e.details })),
			};
		}
	}

	let client: unknown = null;
	try {
		client = t.portalContext?.diagnosticMetadata ? JSON.parse(t.portalContext.diagnosticMetadata) : null;
	} catch {
		client = null;
	}
	const [lastLogin, logs, audits] = await Promise.all([
		prisma.session.findFirst({ where: { userId: t.studentId }, orderBy: { createdAt: "desc" }, select: { createdAt: true, userAgent: true } }),
		prisma.userLog.findMany({ where: { userId: t.studentId, createdAt: { gte: new Date(Date.now() - 14 * 86_400_000) } }, orderBy: { createdAt: "desc" }, take: 30, select: { action: true, createdAt: true } }),
		prisma.supportAuditLog.findMany({ where: { ticketId }, orderBy: { createdAt: "asc" }, take: 100, select: { action: true, actorName: true, createdAt: true, newValue: true } }),
	]);

	const activity: Array<{ at: string; type: string; label: string; detail: string | null; source: "student" | "system" | "ai" | "staff" }> = [];
	for (const l of logs) activity.push({ at: l.createdAt.toISOString(), type: `account:${l.action}`, label: `Account: ${l.action.replace(/_/g, " ")}`, detail: null, source: "system" });
	for (const e of (exam?.events as Array<{ at: string; event: string; details: string | null }> | undefined) ?? []) {
		activity.push({ at: e.at, type: "exam_event", label: `Exam: ${e.event}`, detail: e.details, source: "system" });
	}
	for (const a of audits) {
		const actor = a.actorName ?? "System";
		const source = a.action === "TICKET_CREATED" || a.action.endsWith("_BY_STUDENT") || a.action === "REOPENED" || a.action === "RATED" ? "student" : actor.startsWith("AI") ? "ai" : actor === "Assignment engine" ? "system" : "staff";
		activity.push({ at: a.createdAt.toISOString(), type: `ticket:${a.action.toLowerCase()}`, label: `Ticket: ${a.action.replace(/_/g, " ").toLowerCase()}`, detail: actor, source });
	}
	activity.sort((x, y) => y.at.localeCompare(x.at));

	const pathParts = (t.portalContext?.sourcePath ?? "Student Portal").split(/\s*[›>]\s*/).filter(Boolean);
	if (!pathParts.includes(moduleLabel(t.affectedModule))) pathParts.push(moduleLabel(t.affectedModule));
	pathParts.push(categoryLabel(t.category));
	const ai = t.aiAnalyses[0];

	return {
		profile: {
			name: student.name,
			studentId: student.rollNumber ?? student.academicId ?? null,
			email: student.email,
			institution: student.institutionName,
			department: student.department,
			branch: student.branch,
			semester: student.semester,
			section: student.section,
			accountCreatedAt: student.createdAt.toISOString(),
			emailVerified: student.emailVerified,
			enrolmentVerification: student.verificationStatus,
			accountStatus: student.status,
		},
		origin: {
			path: [...new Set(pathParts)],
			sourcePortal: t.portalContext?.sourcePortal ?? "Student Portal",
			affectedModule: moduleLabel(t.affectedModule),
			category: categoryLabel(t.category),
			priority: t.priority as Priority,
			status: t.status,
			createdAt: t.createdAt.toISOString(),
			description: t.description,
			attachments: t.attachments.map((a) => ({ ...a, url: signedAttachmentUrl(a.id) })),
			aiSummary: ai?.issueSummary ?? null,
			aiCategory: ai ? categoryLabel(ai.category) : null,
		},
		exam,
		diagnostics: {
			client,
			server: {
				lastLoginAt: lastLogin?.createdAt.toISOString() ?? null,
				lastLoginUserAgent: lastLogin?.userAgent ?? null,
				lastHeartbeatAt: (exam?.lastHeartbeatAt as string | null | undefined) ?? null,
				socketOnline: isUserOnline(t.studentId),
			},
		},
		activity: activity.slice(0, 80),
		provenance: { profile: "system", origin: "student", exam: "system", diagnostics: "automatic", ai: "ai" },
	};
}

// ------------------------------------------------------------- analytics
function dayRange(from?: string, to?: string) {
	const end = to ? new Date(`${to}T23:59:59.999Z`) : new Date();
	const start = from ? new Date(`${from}T00:00:00.000Z`) : new Date(end.getTime() - 29 * 86_400_000);
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new AppError("Invalid date range.", HTTP_STATUS.BAD_REQUEST);
	return { start, end };
}

export async function getAnalytics(from?: string, to?: string) {
	const { start, end } = dayRange(from, to);
	const inRange = { createdAt: { gte: start, lte: end } };
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const tickets = await prisma.supportTicket.findMany({
		where: inRange,
		select: { id: true, category: true, priority: true, status: true, ownershipType: true, createdAt: true, humanAcceptedAt: true, resolvedAt: true, rating: true, reassignmentCount: true, assignedAgentId: true },
	});
	const [todayCount, staff] = await Promise.all([
		prisma.supportTicket.count({ where: { createdAt: { gte: today } } }),
		import("./assignment").then((m) => m.listStaffProfiles()),
	]);
	const open = tickets.filter((t) => t.status !== "resolved");
	const humanAccepted = tickets.filter((t) => t.humanAcceptedAt);
	const resolved = tickets.filter((t) => t.status === "resolved" && t.resolvedAt);
	const avg = (vals: number[]) => (vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null);
	const firstResp = humanAccepted.map((t) => (t.humanAcceptedAt!.getTime() - t.createdAt.getTime()) / 60000);
	const slaMet = humanAccepted.filter((t) => (t.humanAcceptedAt!.getTime() - t.createdAt.getTime()) / 60000 <= (FIRST_RESPONSE_SLA_MINUTES[t.priority as Priority] ?? 240));
	const rated = tickets.filter((t) => t.rating !== null);
	const aiResolved = resolved.filter((t) => !t.humanAcceptedAt);
	return {
		range: { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) },
		totals: {
			total: tickets.length,
			today: todayCount,
			pending: open.filter((t) => ["unassigned", "pending_acceptance"].includes(t.status)).length,
			aiHandled: open.filter((t) => t.ownershipType === "AI").length,
			humanHandled: open.filter((t) => t.ownershipType === "HUMAN").length,
			unassigned: open.filter((t) => t.status === "unassigned").length,
			resolved: resolved.length,
			escalated: tickets.filter((t) => t.status === "escalated").length,
		},
		avgFirstResponseMinutes: avg(firstResp),
		avgResolutionMinutes: avg(resolved.map((t) => (t.resolvedAt!.getTime() - t.createdAt.getTime()) / 60000)),
		slaCompliancePercent: humanAccepted.length ? Math.round((slaMet.length / humanAccepted.length) * 100) : null,
		byCategory: SUPPORT_CATEGORIES.map((c) => ({ category: c.key, label: c.label, count: tickets.filter((t) => t.category === c.key).length })).filter((c) => c.count > 0),
		byPriority: (["P1", "P2", "P3", "P4"] as const).map((p) => ({ priority: p, count: tickets.filter((t) => t.priority === p).length })),
		staffWorkload: staff.map((s) => ({ staffId: s.id, name: s.name, active: s.activeTickets, pending: s.pendingTickets, max: s.maxActiveTickets, resolved: s.resolvedCount, availability: s.availability, isOnline: s.isOnline })),
		reassignmentRate: tickets.length ? Math.round((tickets.filter((t) => t.reassignmentCount > 0).length / tickets.length) * 100) : null,
		aiResolutionRate: resolved.length ? Math.round((aiResolved.length / resolved.length) * 100) : null,
		satisfaction: { average: rated.length ? Math.round((rated.reduce((a, t) => a + (t.rating ?? 0), 0) / rated.length) * 10) / 10 : null, count: rated.length },
	};
}

export async function exportAnalyticsCsv(from?: string, to?: string): Promise<string> {
	const { start, end } = dayRange(from, to);
	const rows = await prisma.supportTicket.findMany({
		where: { createdAt: { gte: start, lte: end } },
		orderBy: { createdAt: "asc" },
		select: { referenceNumber: true, category: true, priority: true, status: true, ownershipType: true, assignedAgentName: true, createdAt: true, humanAcceptedAt: true, resolvedAt: true, reassignmentCount: true, rating: true },
	});
	const esc = (v: unknown) => {
		const s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
		return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
	};
	const header = ["reference", "category", "priority", "status", "ownership", "agent", "created_at", "accepted_at", "resolved_at", "first_response_min", "resolution_min", "reassignments", "rating"];
	const lines = rows.map((r) =>
		[
			r.referenceNumber, categoryLabel(r.category), r.priority, r.status, r.ownershipType, r.assignedAgentName, r.createdAt, r.humanAcceptedAt, r.resolvedAt,
			r.humanAcceptedAt ? Math.round((r.humanAcceptedAt.getTime() - r.createdAt.getTime()) / 60000) : "",
			r.resolvedAt ? Math.round((r.resolvedAt.getTime() - r.createdAt.getTime()) / 60000) : "",
			r.reassignmentCount, r.rating,
		].map(esc).join(","),
	);
	return [header.join(","), ...lines].join("\n");
}
