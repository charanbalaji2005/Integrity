import { prisma } from "../../../database";
import { isDemoEmail } from "../../demo/demo-accounts";
import { type Availability, DEFAULT_WEIGHTS, type Weights } from "../support-constants";
import { audit, emitTicketEvent, emitToStaff, emitToTicket, notifyUser } from "./infra";
import { toSummary } from "./serializers";

/**
 * Workload-aware assignment engine.
 *
 * Every candidate is scored from live database state:
 *   score = Σ weight_i × factor_i  (weights configurable, normalised to 1)
 *   - workload:     1 − (active + pending) / capacity   (lower load wins)
 *   - expertise:    1 if the rep lists the ticket category, 0.4 if the rep is a generalist (no expertise listed), else 0
 *   - availability: 1 online & available, 0.5 if offline but offline assignment is enabled
 *   - performance:  faster average resolution than the slowest eligible rep (0.5 when unknown)
 *   - recency:      time since last assignment (spreads work across reps; capped at 1 h)
 * Only reps that are assignment-enabled, "available", online (unless offline
 * assignment is enabled), within working hours and below capacity are eligible.
 * Ticket ownership changes use conditional (compare-and-set) updates, so two
 * reps can never claim the same ticket.
 */

export interface EngineSettings {
	weights: Weights;
	acceptanceTimeoutSeconds: number;
	allowOfflineAssignment: boolean;
	reassignAlertThreshold: number;
}

export async function getSettings(): Promise<EngineSettings> {
	const row = await prisma.supportSettings.upsert({
		where: { id: "default" },
		update: {},
		create: { id: "default", weights: JSON.stringify(DEFAULT_WEIGHTS) },
	});
	let weights: Weights = DEFAULT_WEIGHTS;
	try {
		weights = { ...DEFAULT_WEIGHTS, ...JSON.parse(row.weights) };
	} catch {
		/* defaults */
	}
	return {
		weights,
		acceptanceTimeoutSeconds: row.acceptanceTimeoutSeconds,
		allowOfflineAssignment: row.allowOfflineAssignment,
		reassignAlertThreshold: row.reassignAlertThreshold,
	};
}

export async function updateSettings(input: Partial<EngineSettings>): Promise<EngineSettings> {
	const current = await getSettings();
	const next = { ...current, ...input, weights: { ...current.weights, ...(input.weights ?? {}) } };
	await prisma.supportSettings.update({
		where: { id: "default" },
		data: {
			weights: JSON.stringify(next.weights),
			acceptanceTimeoutSeconds: next.acceptanceTimeoutSeconds,
			allowOfflineAssignment: next.allowOfflineAssignment,
			reassignAlertThreshold: next.reassignAlertThreshold,
		},
	});
	return next;
}

// ------------------------------------------------------------- staff profiles
const ACTIVE_HUMAN_STATUSES = ["in_progress", "waiting_student", "escalated"];

export async function ensureStaffProfile(userId: string) {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { id: true, role: true },
	});
	if (!user || (user.role !== "support" && user.role !== "admin")) return null;
	return prisma.supportStaff.upsert({
		where: { userId },
		update: {},
		create: { userId, supportRole: user.role === "admin" ? "supervisor" : "agent" },
	});
}

export interface StaffProfileDto {
	id: string;
	userId: string;
	name: string;
	email: string;
	supportRole: "agent" | "supervisor";
	availability: Availability;
	isOnline: boolean;
	lastSeenAt: string | null;
	assignmentsEnabled: boolean;
	maxActiveTickets: number;
	activeTickets: number;
	pendingTickets: number;
	workloadPercent: number;
	expertise: string[];
	workingHours: { timezone: string; days: number[]; start: string; end: string } | null;
	avgResolutionMinutes: number | null;
	avgFirstResponseMinutes: number | null;
	resolvedCount: number;
	lastAssignedAt: string | null;
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
	if (!raw) return fallback;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

/** Live staff profiles with workload/performance computed from tickets. */
export async function listStaffProfiles(
	where: { id?: string; userId?: string } = {},
): Promise<StaffProfileDto[]> {
	const staff = await prisma.supportStaff.findMany({
		where,
		include: { user: { select: { name: true, email: true, role: true } } },
		orderBy: { createdAt: "asc" },
	});
	if (staff.length === 0) return [];
	const userIds = staff.map((s) => s.userId);
	const [active, pending, resolved] = await Promise.all([
		prisma.supportTicket.groupBy({
			by: ["assignedAgentId"],
			where: {
				assignedAgentId: { in: userIds },
				ownershipType: "HUMAN",
				status: { in: ACTIVE_HUMAN_STATUSES },
			},
			_count: { _all: true },
		}),
		prisma.ticketAssignment.groupBy({
			by: ["staffId"],
			where: { staffId: { in: staff.map((s) => s.id) }, status: "pending" },
			_count: { _all: true },
		}),
		prisma.supportTicket.findMany({
			where: {
				assignedAgentId: { in: userIds },
				status: "resolved",
				resolvedAt: { not: null },
				humanAcceptedAt: { not: null },
			},
			select: { assignedAgentId: true, createdAt: true, humanAcceptedAt: true, resolvedAt: true },
			take: 5000,
			orderBy: { resolvedAt: "desc" },
		}),
	]);
	const activeMap = new Map(active.map((a) => [a.assignedAgentId, a._count._all]));
	const pendingMap = new Map(pending.map((p) => [p.staffId, p._count._all]));

	return staff.map((s) => {
		const mine = resolved.filter((r) => r.assignedAgentId === s.userId);
		const avg = (vals: number[]) =>
			vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
		const activeTickets = activeMap.get(s.userId) ?? 0;
		const pendingTickets = pendingMap.get(s.id) ?? 0;
		return {
			id: s.id,
			userId: s.userId,
			name: s.user.name,
			email: s.user.email,
			supportRole:
				s.user.role === "admin" ? "supervisor" : (s.supportRole as "agent" | "supervisor"),
			availability: s.availability as Availability,
			isOnline: s.isOnline,
			lastSeenAt: s.lastSeenAt ? s.lastSeenAt.toISOString() : null,
			assignmentsEnabled: s.assignmentsEnabled,
			maxActiveTickets: s.maxActiveTickets,
			activeTickets,
			pendingTickets,
			workloadPercent:
				s.maxActiveTickets > 0
					? Math.min(100, Math.round(((activeTickets + pendingTickets) / s.maxActiveTickets) * 100))
					: 100,
			expertise: parseJson<string[]>(s.expertise, []),
			workingHours: parseJson(s.workingHours, null),
			avgResolutionMinutes: avg(
				mine.map((r) => (r.resolvedAt!.getTime() - r.humanAcceptedAt!.getTime()) / 60000),
			),
			avgFirstResponseMinutes: avg(
				mine.map((r) => (r.humanAcceptedAt!.getTime() - r.createdAt.getTime()) / 60000),
			),
			resolvedCount: mine.length,
			lastAssignedAt: s.lastAssignedAt ? s.lastAssignedAt.toISOString() : null,
		};
	});
}

function withinWorkingHours(wh: StaffProfileDto["workingHours"], now: Date): boolean {
	if (!wh || !Array.isArray(wh.days) || !wh.start || !wh.end) return true;
	try {
		const parts = new Intl.DateTimeFormat("en-GB", {
			timeZone: wh.timezone || "UTC",
			weekday: "short",
			hour: "2-digit",
			minute: "2-digit",
			hour12: false,
		}).formatToParts(now);
		const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
			parts.find((p) => p.type === "weekday")?.value ?? "",
		);
		const hm = `${parts.find((p) => p.type === "hour")?.value ?? "00"}:${parts.find((p) => p.type === "minute")?.value ?? "00"}`;
		if (!wh.days.includes(wd)) return false;
		return wh.start <= wh.end ? hm >= wh.start && hm < wh.end : hm >= wh.start || hm < wh.end; // supports overnight shifts
	} catch {
		return true;
	}
}

export interface Candidate {
	staff: StaffProfileDto;
	score: number;
	breakdown: Record<string, number>;
}

/** Ranks eligible reps for a ticket category. Pure apart from the data passed in. */
export function rankCandidates(
	profiles: StaffProfileDto[],
	category: string,
	settings: EngineSettings,
	exclude: Set<string>,
	now = new Date(),
): Candidate[] {
	const eligible = profiles.filter(
		(p) =>
			// The public demo support account never receives real tickets.
			!isDemoEmail(p.email) &&
			!exclude.has(p.id) &&
			p.assignmentsEnabled &&
			p.availability === "available" &&
			(p.isOnline || settings.allowOfflineAssignment) &&
			withinWorkingHours(p.workingHours, now) &&
			p.activeTickets + p.pendingTickets < p.maxActiveTickets,
	);
	if (eligible.length === 0) return [];
	const w = settings.weights;
	const total = w.workload + w.expertise + w.availability + w.performance + w.recency || 1;
	const knownRes = eligible
		.map((p) => p.avgResolutionMinutes)
		.filter((v): v is number => v !== null);
	const slowest = knownRes.length ? Math.max(...knownRes) : null;

	return eligible
		.map((p) => {
			const workload = 1 - (p.activeTickets + p.pendingTickets) / Math.max(1, p.maxActiveTickets);
			const expertise = p.expertise.includes(category) ? 1 : p.expertise.length === 0 ? 0.4 : 0;
			const availability = p.isOnline ? 1 : 0.5;
			const performance =
				p.avgResolutionMinutes === null || slowest === null || slowest === 0
					? 0.5
					: Math.max(0, 1 - p.avgResolutionMinutes / (slowest * 1.25));
			const recency = p.lastAssignedAt
				? Math.min(1, (now.getTime() - new Date(p.lastAssignedAt).getTime()) / 3_600_000)
				: 1;
			const breakdown = { workload, expertise, availability, performance, recency };
			const score =
				(w.workload * workload +
					w.expertise * expertise +
					w.availability * availability +
					w.performance * performance +
					w.recency * recency) /
				total;
			return { staff: p, score: Math.round(score * 1000) / 1000, breakdown };
		})
		.sort((a, b) => b.score - a.score || a.staff.activeTickets - b.staff.activeTickets);
}

/**
 * Offers an AI-owned, unassigned ticket to the best eligible rep.
 * Returns the chosen staff id or null (no eligible rep — ticket stays queued).
 */
export async function autoAssign(
	ticketId: string,
	opts: { exclude?: string[]; reason?: string } = {},
): Promise<string | null> {
	const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
	if (ticket?.ownershipType !== "AI" || !["unassigned", "escalated"].includes(ticket.status))
		return null;
	const settings = await getSettings();
	const previous = await prisma.ticketAssignment.findMany({
		where: { ticketId, status: { in: ["timed_out", "released", "reassigned"] } },
		select: { staffId: true },
	});
	const exclude = new Set([...(opts.exclude ?? []), ...previous.map((p) => p.staffId)]);
	const profiles = await listStaffProfiles();
	let ranked = rankCandidates(profiles, ticket.category, settings, exclude);
	// If everyone eligible was excluded by history, allow previous reps again rather than stalling.
	if (ranked.length === 0 && previous.length > 0)
		ranked = rankCandidates(profiles, ticket.category, settings, new Set(opts.exclude ?? []));
	const best = ranked[0];
	if (!best) return null;
	return offerTo(ticketId, best.staff.id, {
		score: best.score,
		breakdown: best.breakdown,
		reason: opts.reason ?? null,
		assignedById: null,
		timeoutSeconds: settings.acceptanceTimeoutSeconds,
	});
}

/** Creates a pending assignment if the ticket is still free (compare-and-set). */
export async function offerTo(
	ticketId: string,
	staffId: string,
	o: {
		score: number | null;
		breakdown: Record<string, number> | null;
		reason: string | null;
		assignedById: string | null;
		timeoutSeconds: number;
	},
): Promise<string | null> {
	const staff = await prisma.supportStaff.findUnique({
		where: { id: staffId },
		include: { user: { select: { id: true, name: true } } },
	});
	if (!staff) return null;
	const created = await prisma.$transaction(async (tx) => {
		const claimed = await tx.supportTicket.updateMany({
			where: {
				id: ticketId,
				ownershipType: "AI",
				status: { in: ["unassigned", "escalated", "pending_acceptance"] },
			},
			data: { status: "pending_acceptance" },
		});
		if (claimed.count === 0) return null;
		// Supersede any other pending offer on this ticket.
		await tx.ticketAssignment.updateMany({
			where: { ticketId, status: "pending" },
			data: {
				status: "reassigned",
				endedAt: new Date(),
				reassignmentReason: o.reason ?? "Reassigned",
			},
		});
		const a = await tx.ticketAssignment.create({
			data: {
				ticketId,
				staffId,
				status: "pending",
				assignmentScore: o.score,
				scoreBreakdown: o.breakdown ? JSON.stringify(o.breakdown) : null,
				timeoutAt: new Date(Date.now() + o.timeoutSeconds * 1000),
				reassignmentReason: o.reason,
				assignedById: o.assignedById,
			},
		});
		await tx.supportStaff.update({ where: { id: staffId }, data: { lastAssignedAt: new Date() } });
		return a;
	});
	if (!created) return null;
	const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
	if (ticket) {
		emitTicketEvent("ticket:assigned", ticketId, {
			ticket: toSummary(ticket),
			staffId,
			staffName: staff.user.name,
		});
		await notifyUser(staff.user.id, {
			title: `New assignment: ${ticket.referenceNumber} (${ticket.priority})`,
			description: `${ticket.title} — accept within ${Math.round(o.timeoutSeconds / 60)} min.`,
			ticketId,
			priority: ticket.priority === "P1" || ticket.priority === "P2" ? "high" : "medium",
		});
	}
	await audit({
		actorId: o.assignedById,
		actorName: o.assignedById ? null : "Assignment engine",
		ticketId,
		action: o.assignedById ? "ASSIGNMENT_OVERRIDE" : "AUTO_ASSIGNED",
		newValue: {
			staffId,
			staffName: staff.user.name,
			score: o.score,
			breakdown: o.breakdown,
			reason: o.reason,
		},
	});
	return staffId;
}

/** Expires pending offers past their timeout and re-offers the ticket. */
export async function expireTimedOutAssignments(): Promise<void> {
	const settings = await getSettings();
	const expired = await prisma.ticketAssignment.findMany({
		where: { status: "pending", timeoutAt: { lt: new Date() } },
		include: { staff: { include: { user: { select: { id: true, name: true } } } } },
		take: 50,
	});
	for (const a of expired) {
		const changed = await prisma.$transaction(async (tx) => {
			const upd = await tx.ticketAssignment.updateMany({
				where: { id: a.id, status: "pending" },
				data: {
					status: "timed_out",
					endedAt: new Date(),
					reassignmentReason: "Acceptance timeout",
				},
			});
			if (upd.count === 0) return null;
			return tx.supportTicket.updateMany({
				where: { id: a.ticketId, status: "pending_acceptance", ownershipType: "AI" },
				data: { status: "unassigned", reassignmentCount: { increment: 1 } },
			});
		});
		if (!changed || changed.count === 0) continue;
		await audit({
			actorName: "Assignment engine",
			ticketId: a.ticketId,
			action: "ASSIGNMENT_TIMED_OUT",
			previousValue: { staffId: a.staffId, staffName: a.staff.user.name },
		});
		await notifyUser(a.staff.user.id, {
			title: "Assignment timed out",
			description: "A ticket offered to you was not accepted in time and has been re-queued.",
			ticketId: a.ticketId,
		});
		const ticket = await prisma.supportTicket.findUnique({ where: { id: a.ticketId } });
		if (!ticket) continue;
		emitTicketEvent("ticket:reassigned", ticket.id, {
			ticket: toSummary(ticket),
			reason: "timeout",
		});
		if (ticket.reassignmentCount >= settings.reassignAlertThreshold)
			await alertSupervisors(
				ticket.id,
				`${ticket.referenceNumber} has been reassigned ${ticket.reassignmentCount} times without acceptance.`,
			);
		await autoAssign(ticket.id, { reason: "Previous offer timed out" });
	}
}

export async function alertSupervisors(ticketId: string, description: string) {
	const sups = await prisma.supportStaff.findMany({
		where: { OR: [{ supportRole: "supervisor" }, { user: { role: "admin" } }] },
		select: { userId: true },
	});
	for (const s of sups)
		await notifyUser(s.userId, {
			title: "Supervisor attention needed",
			description,
			ticketId,
			priority: "high",
		});
	emitToStaff("notification:supervisor", { ticketId, description });
}

const PRIORITY_ORDER: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };

/**
 * Works through the waiting queue (highest priority first, then oldest),
 * offering tickets while eligible capacity remains, and refreshes queue
 * position / estimated wait for students.
 */
export async function processQueue(): Promise<void> {
	const waiting = await prisma.supportTicket.findMany({
		where: { ownershipType: "AI", status: { in: ["unassigned", "escalated"] } },
		select: { id: true, priority: true, createdAt: true, queuePosition: true, estimatedWait: true },
	});
	waiting.sort(
		(a, b) =>
			(PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9) ||
			a.createdAt.getTime() - b.createdAt.getTime(),
	);
	for (const t of waiting) {
		const assigned = await autoAssign(t.id);
		if (!assigned) break; // no eligible capacity left
	}
	// Queue position + rough wait estimate from live capacity.
	const still = await prisma.supportTicket.findMany({
		where: {
			ownershipType: "AI",
			status: { in: ["unassigned", "escalated", "pending_acceptance"] },
		},
		select: { id: true, priority: true, createdAt: true, queuePosition: true, estimatedWait: true },
	});
	still.sort(
		(a, b) =>
			(PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9) ||
			a.createdAt.getTime() - b.createdAt.getTime(),
	);
	const online = await prisma.supportStaff.count({
		where: { isOnline: true, availability: "available", assignmentsEnabled: true },
	});
	for (const [i, t] of still.entries()) {
		const position = i + 1;
		const estimatedWait = online > 0 ? Math.ceil(position / online) * 8 : 30;
		if (t.queuePosition !== position || t.estimatedWait !== estimatedWait) {
			await prisma.supportTicket.update({
				where: { id: t.id },
				data: { queuePosition: position, estimatedWait },
			});
			emitToTicket("ticket:queue", t.id, { queuePosition: position, estimatedWait });
		}
	}
}

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;
export function startAssignmentScheduler(intervalMs = 15000) {
	if (timer) return;
	timer = setInterval(async () => {
		if (running) return;
		running = true;
		try {
			await expireTimedOutAssignments();
			await processQueue();
		} catch (err) {
			console.error("[SupportEngine] scheduler error:", err);
		} finally {
			running = false;
		}
	}, intervalMs);
}
