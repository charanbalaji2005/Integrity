import type { Request, Response } from "express";
import { z } from "zod";
import { HTTP_STATUS } from "@/constants/http-status";
import { prisma } from "@/database";
import { getAuthUser } from "@/middleware/auth-middleware";
import { getIO } from "@/providers/socket";
import { AppError } from "@/utils/app-error";
import { departmentForSection, normalizeSemester } from "@/utils/departments";
import { SECTION_CODE_RE, canSeeStudentSection, normalizeSectionCode } from "@/utils/faculty-sections";
import { isMultiPortalEmail } from "@/utils/multi-portal";
import { sendSuccess } from "@/utils/response";
import { ALL_SECTIONS, getAccessibleMaterial } from "../../study-materials/services/study-material-service";

/**
 * POST /api/chat/announcements
 *
 * Server-validated broadcast (replaces the old fire-and-forget socket emit,
 * which was silently rejected because the sender never joined the class room).
 *  - Faculty: only to class rooms of their own sections.
 *  - Admins / all-portal accounts: any section, or the entire college.
 * Attachments must be study materials the sender can see and that belong to
 * the same audience.
 */
const announcementSchema = z.object({
	target: z.enum(["college", "class"]),
	content: z.string().trim().min(1, "Write the announcement message.").max(5000),
	section: z.string().trim().optional(),
	semester: z.string().trim().optional(),
	materialId: z.string().trim().optional(),
});

export async function postAnnouncement(req: Request, res: Response): Promise<void> {
	const user = getAuthUser(req);
	if (user.role !== "faculty" && user.role !== "admin") {
		throw new AppError("Only faculty and administrators can broadcast announcements.", HTTP_STATUS.FORBIDDEN);
	}
	const parsed = announcementSchema.safeParse(req.body);
	if (!parsed.success) {
		throw new AppError(parsed.error.issues[0]?.message ?? "Invalid announcement.", HTTP_STATUS.BAD_REQUEST);
	}
	const { target, content, materialId } = parsed.data;
	const unrestricted = user.role === "admin" || isMultiPortalEmail(user.email);

	let roomId = "college";
	let department: string | null = null;
	let semester: string | null = null;
	let section: string | null = null;

	if (target === "college") {
		if (!unrestricted) {
			throw new AppError(
				"Faculty can only broadcast to their own sections. Choose one of your sections.",
				HTTP_STATUS.FORBIDDEN,
			);
		}
	} else {
		section = normalizeSectionCode(parsed.data.section);
		semester = normalizeSemester(parsed.data.semester);
		if (!SECTION_CODE_RE.test(section)) {
			throw new AppError("Choose a valid section (e.g. CSE-A).", HTTP_STATUS.BAD_REQUEST);
		}
		if (!semester) throw new AppError("Choose the semester (1–8).", HTTP_STATUS.BAD_REQUEST);
		if (!canSeeStudentSection(user, section)) {
			throw new AppError(`You can only broadcast to your own sections (not ${section}).`, HTTP_STATUS.FORBIDDEN);
		}
		department = departmentForSection(section);
		if (!department) throw new AppError(`Unknown department for section ${section}.`, HTTP_STATUS.BAD_REQUEST);
		// Must match the student room key: class:<department>:<"Semester N">:<section>
		roomId = `class:${department}:${semester}:${section}`;
	}

	let attachments: string[] = [];
	if (materialId) {
		const material = await getAccessibleMaterial(user, materialId);
		const audienceOk =
			material.section === ALL_SECTIONS || (target === "class" && material.section === section);
		if (!audienceOk) {
			throw new AppError(
				"The attached PDF is shared with a different section than this announcement.",
				HTTP_STATUS.BAD_REQUEST,
			);
		}
		// Clients render "material:<id>|<title>" as an openable study-material card.
		attachments = [`material:${material.id}|${material.title}`];
	}

	const saved = await prisma.chatMessage.create({
		data: {
			senderId: user.id,
			senderName: user.name,
			senderRole: user.role,
			content,
			type: target,
			department,
			semester,
			section,
			attachments: attachments.length ? JSON.stringify(attachments) : null,
		},
	});

	getIO()?.to(roomId).emit("new-message", { ...saved, roomId, attachments });

	sendSuccess(
		res,
		{ id: saved.id, roomId },
		target === "college" ? "Announcement sent to the entire college" : `Announcement sent to ${section} · ${semester}`,
		HTTP_STATUS.CREATED,
	);
}
