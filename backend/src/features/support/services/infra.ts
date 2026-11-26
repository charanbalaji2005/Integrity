import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../../../config/env";
import { prisma } from "../../../database";
import { getIO } from "../../../providers/socket";

// ------------------------------------------------------------- real-time
export const STAFF_ROOM = "support-staff";
export const ticketRoom = (ticketId: string) => `support-ticket-${ticketId}`;
export const userRoom = (userId: string) => `user-${userId}`;

/** Broadcast to support staff and to whoever is viewing the ticket (owner/staff). */
export function emitTicketEvent(event: string, ticketId: string, payload: Record<string, unknown>) {
	const io = getIO();
	if (!io) return;
	io.to(STAFF_ROOM)
		.to(ticketRoom(ticketId))
		.emit(event, { ticketId, ...payload });
}
export function emitToTicket(event: string, ticketId: string, payload: Record<string, unknown>) {
	getIO()
		?.to(ticketRoom(ticketId))
		.emit(event, { ticketId, ...payload });
}
export function emitToStaff(event: string, payload: Record<string, unknown>) {
	getIO()?.to(STAFF_ROOM).emit(event, payload);
}

/** Persisted notification + real-time push to that user only. */
export async function notifyUser(
	userId: string,
	n: {
		title: string;
		description: string;
		ticketId?: string;
		priority?: "low" | "medium" | "high";
	},
) {
	await prisma.notification
		.create({
			data: {
				userId,
				title: n.title,
				description: n.description,
				type: "system",
				priority: n.priority ?? "medium",
				senderName: "Support Hub",
				senderRole: "support",
			},
		})
		.catch(() => undefined);
	getIO()?.to(userRoom(userId)).emit("notification:new", n);
}

// ------------------------------------------------------------- audit
export async function audit(params: {
	actorId?: string | null;
	actorName?: string | null;
	ticketId?: string | null;
	action: string;
	previousValue?: unknown;
	newValue?: unknown;
}) {
	const str = (v: unknown) =>
		v === undefined || v === null ? null : typeof v === "string" ? v : JSON.stringify(v);
	await prisma.supportAuditLog
		.create({
			data: {
				actorId: params.actorId ?? null,
				actorName: params.actorName ?? null,
				ticketId: params.ticketId ?? null,
				action: params.action,
				previousValue: str(params.previousValue),
				newValue: str(params.newValue),
			},
		})
		.catch((err) => console.error("[SupportAudit] failed:", err));
}

// ------------------------------------------------------------- signed attachment URLs
const URL_TTL_SECONDS = 10 * 60;

function sign(id: string, exp: number): string {
	return createHmac("sha256", env.BETTER_AUTH_SECRET)
		.update(`support-attachment:${id}:${exp}`)
		.digest("base64url");
}

/** Short-lived URL usable directly in <img src>/<a href> (no auth header needed). */
export function signedAttachmentUrl(id: string): string {
	const exp = Math.floor(Date.now() / 1000) + URL_TTL_SECONDS;
	const base = env.BETTER_AUTH_URL.replace(/\/$/, "");
	return `${base}/api/support/attachments/${id}/download?exp=${exp}&sig=${sign(id, exp)}`;
}

export function verifyAttachmentSignature(id: string, exp: string, sig: string): boolean {
	const e = Number(exp);
	if (!Number.isFinite(e) || e < Math.floor(Date.now() / 1000)) return false;
	const expected = Buffer.from(sign(id, e));
	const given = Buffer.from(String(sig));
	return expected.length === given.length && timingSafeEqual(expected, given);
}

// ------------------------------------------------------------- uploads
export const ALLOWED_UPLOAD_MIME = new Set([
	"image/png",
	"image/jpeg",
	"image/webp",
	"application/pdf",
	"text/plain",
]);

export function detectUploadMime(buf: Buffer, declared: string): string | null {
	if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
	if (
		buf.length >= 8 &&
		buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
	)
		return "image/png";
	if (
		buf.length >= 12 &&
		buf.subarray(0, 4).toString("latin1") === "RIFF" &&
		buf.subarray(8, 12).toString("latin1") === "WEBP"
	)
		return "image/webp";
	if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-")
		return "application/pdf";
	if (declared === "text/plain" && !buf.subarray(0, 4096).includes(0)) return "text/plain";
	return null;
}
