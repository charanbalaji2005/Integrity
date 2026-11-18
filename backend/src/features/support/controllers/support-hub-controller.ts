import type { Request, Response } from "express";
import { z } from "zod";
import { HTTP_STATUS } from "../../../constants/http-status";
import { prisma } from "../../../database";
import { getAuthUser } from "../../../middleware/auth-middleware";
import { AppError } from "../../../utils/app-error";
import { sendSuccess } from "../../../utils/response";
import { AVAILABILITIES, CATEGORY_KEYS, MODULE_KEYS, PRIORITIES, URGENCIES } from "../support-constants";
import { ensureStaffProfile, getSettings, listStaffProfiles, processQueue, updateSettings } from "../services/assignment";
import { exportAnalyticsCsv, getAnalytics, getStudentContext } from "../services/context";
import { audit, emitToStaff, verifyAttachmentSignature } from "../services/infra";
import { createArticle, deleteArticle, searchKnowledgeBase, updateArticle } from "../services/knowledge-base";
import { isStaffRole } from "../services/serializers";
import * as tickets from "../services/tickets";

const param = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : String(v ?? ""));
const files = (req: Request): tickets.UploadFile[] => {
	const f = req.files;
	if (!f) return [];
	return (Array.isArray(f) ? f : Object.values(f).flat()) as tickets.UploadFile[];
};
function parse<T>(schema: z.ZodType<T>, data: unknown): T {
	const r = schema.safeParse(data ?? {});
	if (!r.success) throw new AppError(r.error.issues[0]?.message ?? "Invalid request.", HTTP_STATUS.BAD_REQUEST);
	return r.data;
}
async function requireSupervisor(req: Request) {
	const user = getAuthUser(req);
	const viewer = await tickets.viewerFor(user);
	if (!viewer.isSupervisor) throw new AppError("Supervisor privileges required.", HTTP_STATUS.FORBIDDEN);
	return user;
}

// ------------------------------------------------------------- student
const createSchema = z.object({
	title: z.string().trim().min(5, "Title must be at least 5 characters.").max(150),
	description: z.string().trim().min(10, "Describe the issue in at least 10 characters.").max(5000),
	category: z.string().refine((v) => CATEGORY_KEYS.includes(v), "Choose an issue category."),
	affectedModule: z.string().refine((v) => MODULE_KEYS.includes(v), "Choose the affected module."),
	urgency: z.string().refine((v) => (URGENCIES as string[]).includes(v), "Choose an urgency."),
	examAttemptId: z.string().max(60).optional(),
	sourcePath: z.string().max(300).optional(),
	diagnostics: z.string().max(20000).optional(),
});

export async function createTicketHandler(req: Request, res: Response) {
	const user = getAuthUser(req);
	const body = parse(createSchema, req.body);
	sendSuccess(res, await tickets.createTicket(user, body, files(req)), "Ticket created", HTTP_STATUS.CREATED);
}
export async function myTicketsHandler(req: Request, res: Response) {
	sendSuccess(res, await tickets.listMyTickets(getAuthUser(req)), "Your tickets", HTTP_STATUS.OK);
}
/** Legacy GET /tickets: students get their own; staff get the full open queue. */
export async function listTicketsHandler(req: Request, res: Response) {
	const user = getAuthUser(req);
	if (isStaffRole(user.role)) sendSuccess(res, (await tickets.getQueue(user, { view: "all" })).tickets, "Tickets", HTTP_STATUS.OK);
	else sendSuccess(res, await tickets.listMyTickets(user), "Your tickets", HTTP_STATUS.OK);
}
export async function getTicketHandler(req: Request, res: Response) {
	sendSuccess(res, await tickets.getTicket(getAuthUser(req), param(req.params.id)), "Ticket", HTTP_STATUS.OK);
}
export async function postMessageHandler(req: Request, res: Response) {
	const { content } = parse(z.object({ content: z.string().max(5000).optional().default("") }), req.body);
	sendSuccess(res, await tickets.postMessage(getAuthUser(req), param(req.params.id), content, files(req)), "Message sent", HTTP_STATUS.CREATED);
}
export async function reopenHandler(req: Request, res: Response) {
	const { reason } = parse(z.object({ reason: z.string().trim().min(3, "Tell us why you're reopening.").max(1000) }), req.body);
	sendSuccess(res, await tickets.reopen(getAuthUser(req), param(req.params.id), reason), "Ticket reopened", HTTP_STATUS.OK);
}
export async function rateHandler(req: Request, res: Response) {
	const b = parse(z.object({ rating: z.coerce.number().int().min(1).max(5), comment: z.string().max(1000).optional() }), req.body);
	sendSuccess(res, await tickets.rate(getAuthUser(req), param(req.params.id), b.rating, b.comment), "Thanks for your feedback", HTTP_STATUS.OK);
}
export async function closeHandler(req: Request, res: Response) {
	sendSuccess(res, await tickets.closeByStudent(getAuthUser(req), param(req.params.id)), "Ticket closed", HTTP_STATUS.OK);
}

// ------------------------------------------------------------- staff
export async function queueHandler(req: Request, res: Response) {
	const q = req.query as Record<string, string | undefined>;
	sendSuccess(res, await tickets.getQueue(getAuthUser(req), q), "Queue", HTTP_STATUS.OK);
}
export async function acceptHandler(req: Request, res: Response) {
	sendSuccess(res, await tickets.acceptTicket(getAuthUser(req), param(req.params.id)), "Ticket accepted", HTTP_STATUS.OK);
}
export async function reassignHandler(req: Request, res: Response) {
	const b = parse(z.object({ staffId: z.string().max(60).optional(), reason: z.string().trim().min(3, "Give a reason.").max(500) }), req.body);
	sendSuccess(res, await tickets.reassignTicket(getAuthUser(req), param(req.params.id), b.staffId, b.reason), "Ticket reassigned", HTTP_STATUS.OK);
}
export async function escalateHandler(req: Request, res: Response) {
	const b = parse(
		z.object({ department: z.string().trim().min(2).max(80), reason: z.string().trim().min(3, "Give a reason.").max(1000), priority: z.enum(PRIORITIES as [string, ...string[]]).optional() }),
		req.body,
	);
	sendSuccess(res, await tickets.escalateTicket(getAuthUser(req), param(req.params.id), b.department, b.reason, b.priority as never), "Ticket escalated", HTTP_STATUS.OK);
}
export async function resolveHandler(req: Request, res: Response) {
	const { resolution } = parse(z.object({ resolution: z.string().trim().min(5, "Describe how it was resolved.").max(2000) }), req.body);
	sendSuccess(res, await tickets.resolveTicket(getAuthUser(req), param(req.params.id), resolution), "Ticket resolved", HTTP_STATUS.OK);
}
export async function priorityHandler(req: Request, res: Response) {
	const b = parse(z.object({ priority: z.enum(PRIORITIES as [string, ...string[]]), reason: z.string().trim().min(3, "Give a reason.").max(500) }), req.body);
	sendSuccess(res, await tickets.changePriority(getAuthUser(req), param(req.params.id), b.priority as never, b.reason), "Priority updated", HTTP_STATUS.OK);
}
export async function returnToAiHandler(req: Request, res: Response) {
	const { reason } = parse(z.object({ reason: z.string().trim().min(3, "Say what information is needed.").max(500) }), req.body);
	sendSuccess(res, await tickets.returnToAi(getAuthUser(req), param(req.params.id), reason), "Returned to AI assistant", HTTP_STATUS.OK);
}
export async function internalNoteHandler(req: Request, res: Response) {
	const b = parse(z.object({ content: z.string().trim().min(1).max(4000), kind: z.enum(["note", "verified_finding"]).optional().default("note") }), req.body);
	sendSuccess(res, await tickets.addInternalNote(getAuthUser(req), param(req.params.id), b.content, b.kind), "Note added", HTTP_STATUS.CREATED);
}
export async function copilotHandler(req: Request, res: Response) {
	sendSuccess(res, await tickets.copilot(getAuthUser(req), param(req.params.id)), "Copilot suggestions", HTTP_STATUS.OK);
}
export async function studentContextHandler(req: Request, res: Response) {
	sendSuccess(res, await getStudentContext(getAuthUser(req), param(req.params.id)), "Student context", HTTP_STATUS.OK);
}

// ------------------------------------------------------------- attachments (signed URL)
export async function downloadAttachmentHandler(req: Request, res: Response) {
	const id = param(req.params.id);
	if (!verifyAttachmentSignature(id, String(req.query.exp ?? ""), String(req.query.sig ?? ""))) throw new AppError("This link has expired. Reopen the ticket to get a fresh link.", HTTP_STATUS.FORBIDDEN);
	const a = await prisma.supportAttachment.findUnique({ where: { id }, select: { data: true, mimeType: true, fileName: true } });
	if (!a) throw new AppError("Attachment not found.", HTTP_STATUS.NOT_FOUND);
	res.setHeader("Content-Type", a.mimeType);
	res.setHeader("Content-Disposition", `${a.mimeType.startsWith("image/") || a.mimeType === "application/pdf" ? "inline" : "attachment"}; filename="${a.fileName.replace(/"/g, "")}"`);
	res.setHeader("Cache-Control", "private, max-age=300");
	res.setHeader("X-Content-Type-Options", "nosniff");
	res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
	res.send(Buffer.from(a.data));
}

// ------------------------------------------------------------- staff profiles & admin
export async function meHandler(req: Request, res: Response) {
	const user = getAuthUser(req);
	if (!isStaffRole(user.role)) throw new AppError("Support staff only.", HTTP_STATUS.FORBIDDEN);
	const s = await ensureStaffProfile(user.id);
	sendSuccess(res, (await listStaffProfiles({ id: s!.id }))[0], "Your support profile", HTTP_STATUS.OK);
}

const availabilitySchema = z.object({ availability: z.enum(AVAILABILITIES as [string, ...string[]]) });
async function applyAvailability(staffId: string, availability: string, actor: { id: string; name: string }) {
	const before = await prisma.supportStaff.findUnique({ where: { id: staffId } });
	if (!before) throw new AppError("Representative not found.", HTTP_STATUS.NOT_FOUND);
	await prisma.supportStaff.update({ where: { id: staffId }, data: { availability } });
	await audit({ actorId: actor.id, actorName: actor.name, action: "AVAILABILITY_CHANGED", previousValue: { staffId, availability: before.availability }, newValue: { staffId, availability } });
	const profile = (await listStaffProfiles({ id: staffId }))[0];
	emitToStaff("support:agent:availability_changed", { staff: profile });
	if (availability === "available") void processQueue();
	return profile;
}
export async function myAvailabilityHandler(req: Request, res: Response) {
	const user = getAuthUser(req);
	if (!isStaffRole(user.role)) throw new AppError("Support staff only.", HTTP_STATUS.FORBIDDEN);
	const { availability } = parse(availabilitySchema, req.body);
	const s = await ensureStaffProfile(user.id);
	sendSuccess(res, await applyAvailability(s!.id, availability, user), "Availability updated", HTTP_STATUS.OK);
}
export async function staffAvailabilityHandler(req: Request, res: Response) {
	const user = await requireSupervisor(req);
	const { availability } = parse(availabilitySchema, req.body);
	sendSuccess(res, await applyAvailability(param(req.params.id), availability, user), "Availability updated", HTTP_STATUS.OK);
}

export async function listStaffHandler(req: Request, res: Response) {
	const user = getAuthUser(req);
	if (!isStaffRole(user.role)) throw new AppError("Support staff only.", HTTP_STATUS.FORBIDDEN);
	// Make sure every support/admin user has a profile so they appear in the dashboard.
	const supportUsers = await prisma.user.findMany({ where: { role: { in: ["support", "admin"] } }, select: { id: true } });
	for (const u of supportUsers) await ensureStaffProfile(u.id);
	sendSuccess(res, await listStaffProfiles(), "Support staff", HTTP_STATUS.OK);
}

const workingHoursSchema = z
	.object({ timezone: z.string().max(60), days: z.array(z.number().int().min(0).max(6)).max(7), start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) })
	.nullable();
const staffEditSchema = z.object({
	supportRole: z.enum(["agent", "supervisor"]).optional(),
	maxActiveTickets: z.coerce.number().int().min(1).max(100).optional(),
	expertise: z.array(z.string().refine((v) => CATEGORY_KEYS.includes(v))).max(14).optional(),
	workingHours: workingHoursSchema.optional(),
	assignmentsEnabled: z.boolean().optional(),
	availability: z.enum(AVAILABILITIES as [string, ...string[]]).optional(),
});

export async function createStaffHandler(req: Request, res: Response) {
	const actor = await requireSupervisor(req);
	const b = parse(staffEditSchema.extend({ email: z.string().email(), promote: z.boolean().optional() }), req.body);
	const target = await prisma.user.findUnique({ where: { email: b.email.toLowerCase() } });
	if (!target) throw new AppError("No account exists with that email. Ask the person to register first.", HTTP_STATUS.NOT_FOUND);
	if (!isStaffRole(target.role)) {
		if (!b.promote) throw new AppError("This account isn't a support account. Tick 'promote' to make them a support representative.", HTTP_STATUS.BAD_REQUEST);
		await prisma.user.update({ where: { id: target.id }, data: { role: "support" } });
	}
	const s = await ensureStaffProfile(target.id);
	await prisma.supportStaff.update({
		where: { id: s!.id },
		data: {
			...(b.supportRole ? { supportRole: b.supportRole } : {}),
			...(b.maxActiveTickets ? { maxActiveTickets: b.maxActiveTickets } : {}),
			...(b.expertise ? { expertise: JSON.stringify(b.expertise) } : {}),
			...(b.workingHours !== undefined ? { workingHours: b.workingHours ? JSON.stringify(b.workingHours) : null } : {}),
		},
	});
	await audit({ actorId: actor.id, actorName: actor.name, action: "STAFF_ADDED", newValue: { email: target.email, promoted: !isStaffRole(target.role) } });
	sendSuccess(res, (await listStaffProfiles({ id: s!.id }))[0], "Representative added", HTTP_STATUS.CREATED);
}

export async function updateStaffHandler(req: Request, res: Response) {
	const actor = await requireSupervisor(req);
	const id = param(req.params.id);
	const b = parse(staffEditSchema, req.body);
	const before = await prisma.supportStaff.findUnique({ where: { id } });
	if (!before) throw new AppError("Representative not found.", HTTP_STATUS.NOT_FOUND);
	await prisma.supportStaff.update({
		where: { id },
		data: {
			...(b.supportRole ? { supportRole: b.supportRole } : {}),
			...(b.maxActiveTickets ? { maxActiveTickets: b.maxActiveTickets } : {}),
			...(b.expertise ? { expertise: JSON.stringify(b.expertise) } : {}),
			...(b.workingHours !== undefined ? { workingHours: b.workingHours ? JSON.stringify(b.workingHours) : null } : {}),
			...(b.assignmentsEnabled !== undefined ? { assignmentsEnabled: b.assignmentsEnabled } : {}),
			...(b.availability ? { availability: b.availability } : {}),
		},
	});
	await audit({ actorId: actor.id, actorName: actor.name, action: "STAFF_UPDATED", previousValue: before, newValue: b });
	const profile = (await listStaffProfiles({ id }))[0];
	emitToStaff("support:agent:availability_changed", { staff: profile });
	void processQueue();
	sendSuccess(res, profile, "Representative updated", HTTP_STATUS.OK);
}

// ------------------------------------------------------------- settings, analytics, KB
export async function getSettingsHandler(req: Request, res: Response) {
	const user = getAuthUser(req);
	if (!isStaffRole(user.role)) throw new AppError("Support staff only.", HTTP_STATUS.FORBIDDEN);
	sendSuccess(res, await getSettings(), "Assignment settings", HTTP_STATUS.OK);
}
export async function updateSettingsHandler(req: Request, res: Response) {
	const actor = await requireSupervisor(req);
	const w = z.coerce.number().min(0).max(100);
	const b = parse(
		z.object({
			weights: z.object({ workload: w, expertise: w, availability: w, performance: w, recency: w }).partial().optional(),
			acceptanceTimeoutSeconds: z.coerce.number().int().min(30).max(3600).optional(),
			allowOfflineAssignment: z.boolean().optional(),
			reassignAlertThreshold: z.coerce.number().int().min(1).max(20).optional(),
		}),
		req.body,
	);
	const before = await getSettings();
	const next = await updateSettings(b as never);
	await audit({ actorId: actor.id, actorName: actor.name, action: "SETTINGS_UPDATED", previousValue: before, newValue: next });
	void processQueue();
	sendSuccess(res, next, "Settings saved", HTTP_STATUS.OK);
}

const dateQ = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
export async function analyticsHandler(req: Request, res: Response) {
	const user = getAuthUser(req);
	if (!isStaffRole(user.role)) throw new AppError("Support staff only.", HTTP_STATUS.FORBIDDEN);
	const q = parse(dateQ, req.query);
	sendSuccess(res, await getAnalytics(q.from, q.to), "Support analytics", HTTP_STATUS.OK);
}
export async function analyticsExportHandler(req: Request, res: Response) {
	await requireSupervisor(req);
	const q = parse(dateQ, req.query);
	const csv = await exportAnalyticsCsv(q.from, q.to);
	res.setHeader("Content-Type", "text/csv; charset=utf-8");
	res.setHeader("Content-Disposition", `attachment; filename="support-tickets-${q.from ?? "last30"}-${q.to ?? "today"}.csv"`);
	res.send(csv);
}

export async function kbListHandler(req: Request, res: Response) {
	const user = getAuthUser(req);
	const q = req.query as Record<string, string | undefined>;
	sendSuccess(res, await searchKnowledgeBase({ q: q.q, category: q.category, includeInternal: isStaffRole(user.role), limit: 100 }), "Knowledge base", HTTP_STATUS.OK);
}
const articleSchema = z.object({
	title: z.string().trim().min(3).max(200),
	category: z.string().refine((v) => CATEGORY_KEYS.includes(v), "Choose a category."),
	summary: z.string().trim().min(3).max(400),
	body: z.string().trim().min(10).max(20000),
	visibility: z.enum(["public", "internal"]),
	tags: z.array(z.string().max(40)).max(20).default([]),
});
export async function kbCreateHandler(req: Request, res: Response) {
	const actor = await requireSupervisor(req);
	const a = await createArticle(parse(articleSchema, req.body), actor.id);
	await audit({ actorId: actor.id, actorName: actor.name, action: "KB_ARTICLE_CREATED", newValue: { id: a.id, title: a.title } });
	sendSuccess(res, a, "Article created", HTTP_STATUS.CREATED);
}
export async function kbUpdateHandler(req: Request, res: Response) {
	const actor = await requireSupervisor(req);
	const a = await updateArticle(param(req.params.id), parse(articleSchema.partial(), req.body));
	await audit({ actorId: actor.id, actorName: actor.name, action: "KB_ARTICLE_UPDATED", newValue: { id: a.id, title: a.title } });
	sendSuccess(res, a, "Article updated", HTTP_STATUS.OK);
}
export async function kbDeleteHandler(req: Request, res: Response) {
	const actor = await requireSupervisor(req);
	await deleteArticle(param(req.params.id));
	await audit({ actorId: actor.id, actorName: actor.name, action: "KB_ARTICLE_DELETED", previousValue: param(req.params.id) });
	sendSuccess(res, null, "Article deleted", HTTP_STATUS.OK);
}
