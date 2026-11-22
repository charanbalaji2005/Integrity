import { z } from "zod";
import { HTTP_STATUS } from "@/constants/http-status";
import { prisma } from "@/database";
import { AppError } from "@/utils/app-error";
import {
	SECTION_CODE_RE,
	normalizeSectionCode,
} from "@/utils/faculty-sections";
import { normalizeSemester } from "@/utils/departments";
import { canonicalSection, canonicalSectionList } from "@/utils/section-codes";
import { isMultiPortalEmail } from "@/utils/multi-portal";
import { storeFile, type UploadedFile } from "../../courses/services/file-storage";

/**
 * Study materials: PDFs a faculty member shares with one of their sections.
 *
 * Who sees what
 *  - Students: materials for their own section (and "ALL"), optionally
 *    restricted to their semester.
 *  - Faculty: materials for the sections they teach, plus anything they uploaded.
 *    They can only publish to their own sections.
 *  - Admins (and the all-portal default accounts): everything, can publish to any
 *    section or to every student ("ALL").
 */

export const ALL_SECTIONS = "ALL";

export interface MaterialUser {
	id: string;
	role: string | null;
	name?: string | null;
	email?: string | null;
	section?: string | null;
	semester?: string | null;
	department?: string | null;
}

/** The user's own section(s) as DEPT-LETTER codes (older profiles may store just "A"). */
const ownSectionsOf = (u: MaterialUser) => canonicalSectionList(u.section, u.department);
const studentSectionOf = (u: MaterialUser) => canonicalSection(u.section, u.department) ?? normalizeSectionCode(u.section);

const isUnrestricted = (u: MaterialUser) => u.role === "admin" || isMultiPortalEmail(u.email);
const isStaff = (u: MaterialUser) => u.role === "faculty" || u.role === "admin";

const listSelect = {
	id: true,
	title: true,
	description: true,
	section: true,
	semester: true,
	uploadedById: true,
	uploadedByName: true,
	createdAt: true,
	updatedAt: true,
	file: { select: { fileName: true, sizeBytes: true, mimeType: true } },
} as const;

export const createMaterialSchema = z.object({
	title: z.string().trim().min(1, "Give the material a title.").max(200),
	description: z.string().trim().max(2000).optional().default(""),
	section: z.string().trim().min(1, "Choose a section."),
	semester: z.string().trim().optional().default(""),
});

function canView(user: MaterialUser, m: { section: string; semester: string | null; uploadedById: string }) {
	if (isUnrestricted(user)) return true;
	if (user.role === "faculty") {
		return m.uploadedById === user.id || m.section === ALL_SECTIONS || ownSectionsOf(user).includes(m.section);
	}
	// Students
	const sectionOk = m.section === ALL_SECTIONS || m.section === studentSectionOf(user);
	const semesterOk = !m.semester || m.semester === normalizeSemester(user.semester);
	return sectionOk && semesterOk;
}

export async function listMaterials(user: MaterialUser) {
	let where = {};
	if (!isUnrestricted(user)) {
		if (user.role === "faculty") {
			const sections = ownSectionsOf(user);
			where = { OR: [{ uploadedById: user.id }, { section: { in: [...sections, ALL_SECTIONS] } }] };
		} else {
			const own = studentSectionOf(user);
			if (!own) return [];
			const semester = normalizeSemester(user.semester);
			where = {
				section: { in: [own, ALL_SECTIONS] },
				OR: [{ semester: null }, ...(semester ? [{ semester }] : [])],
			};
		}
	}
	const rows = await prisma.studyMaterial.findMany({ where, select: listSelect, orderBy: { createdAt: "desc" } });
	return rows.map((r) => ({
		...r,
		canDelete: isUnrestricted(user) || r.uploadedById === user.id,
	}));
}

export async function createMaterial(user: MaterialUser, input: unknown, file: UploadedFile | undefined) {
	if (!isStaff(user)) {
		throw new AppError("Only faculty and administrators can upload study materials.", HTTP_STATUS.FORBIDDEN);
	}
	const parsed = createMaterialSchema.safeParse(input);
	if (!parsed.success) {
		throw new AppError(parsed.error.issues[0]?.message ?? "Invalid material details.", HTTP_STATUS.BAD_REQUEST);
	}
	const { title, description } = parsed.data;
	const rawSection = normalizeSectionCode(parsed.data.section);
	const section = rawSection === ALL_SECTIONS ? rawSection : (canonicalSection(rawSection, user.department) ?? rawSection);
	const semester = parsed.data.semester ? normalizeSemester(parsed.data.semester) : null;
	if (parsed.data.semester && !semester) {
		throw new AppError("Semester must be between 1 and 8.", HTTP_STATUS.BAD_REQUEST);
	}

	if (section === ALL_SECTIONS) {
		if (!isUnrestricted(user)) {
			throw new AppError("Only administrators can share a material with every section.", HTTP_STATUS.FORBIDDEN);
		}
	} else {
		if (!SECTION_CODE_RE.test(section)) {
			throw new AppError("Invalid section code. Use the format CSE-A, ECE-B, …", HTTP_STATUS.BAD_REQUEST);
		}
		if (!isUnrestricted(user) && !ownSectionsOf(user).includes(section)) {
			throw new AppError(`You can only share materials with your own sections (not ${section}).`, HTTP_STATUS.FORBIDDEN);
		}
	}

	const { file: stored } = await storeFile(user.id, "study", file as UploadedFile);
	return prisma.studyMaterial.create({
		data: {
			title,
			description: description || null,
			section,
			semester,
			fileId: stored.id,
			uploadedById: user.id,
			uploadedByName: user.name || "Faculty",
		},
		select: listSelect,
	});
}

export async function deleteMaterial(user: MaterialUser, id: string) {
	const m = await prisma.studyMaterial.findUnique({ where: { id }, select: { uploadedById: true } });
	if (!m) throw new AppError("Study material not found.", HTTP_STATUS.NOT_FOUND);
	if (!isUnrestricted(user) && m.uploadedById !== user.id) {
		throw new AppError("You can only delete materials you uploaded.", HTTP_STATUS.FORBIDDEN);
	}
	await prisma.studyMaterial.delete({ where: { id } });
}

/** Loads a material the user may see (404 otherwise, so ids cannot be probed). */
export async function getAccessibleMaterial(user: MaterialUser, id: string) {
	const m = await prisma.studyMaterial.findUnique({
		where: { id },
		select: { ...listSelect, fileId: true },
	});
	if (!m || !canView(user, m)) throw new AppError("Study material not found.", HTTP_STATUS.NOT_FOUND);
	return m;
}

export async function getMaterialFile(user: MaterialUser, id: string) {
	const m = await getAccessibleMaterial(user, id);
	const file = await prisma.storedFile.findUnique({
		where: { id: m.fileId },
		select: { fileName: true, mimeType: true, sizeBytes: true, data: true },
	});
	if (!file) throw new AppError("The file for this material is missing.", HTTP_STATUS.NOT_FOUND);
	return { material: m, file };
}
