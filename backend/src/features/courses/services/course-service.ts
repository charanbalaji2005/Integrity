import type { z } from "zod";
import { HTTP_STATUS } from "@/constants/http-status";
import { prisma } from "@/database";
import { AppError } from "@/utils/app-error";
import { extractText } from "../../text-extraction/services/text-extraction-service";
import type {
	createCourseSchema,
	materialFieldsSchema,
	materialUpdateSchema,
	syllabusStructureSchema,
} from "../schemas/course-schemas";
import { LINK_KINDS } from "../schemas/course-schemas";
import { storeFile, type UploadedFile } from "./file-storage";
import { parseSyllabusText } from "./syllabus-parser";

export interface CourseUser {
	id: string;
	role: string;
	name?: string | null;
	institutionName?: string | null;
}

const DEFAULT_INSTITUTION = "SRM University AP";
export const institutionOf = (u: { institutionName?: string | null }) =>
	u.institutionName || DEFAULT_INSTITUTION;
export const isStaff = (u: CourseUser) => u.role === "faculty" || u.role === "admin";

const fileMeta = { select: { id: true, fileName: true, mimeType: true, sizeBytes: true } } as const;

/** Courses are an institution-wide catalogue so faculty reuse each other's syllabi and materials. */
async function loadCourseFor(user: CourseUser, courseId: string) {
	const course = await prisma.course.findUnique({ where: { id: courseId } });
	if (!course || (user.role !== "admin" && course.institutionName !== institutionOf(user))) {
		throw new AppError("Course not found.", HTTP_STATUS.NOT_FOUND);
	}
	return course;
}

function assertCanManage(user: CourseUser, ownerIds: (string | null | undefined)[]) {
	if (user.role === "admin" || ownerIds.includes(user.id)) return;
	throw new AppError(
		"Only the uploader, the course owner or an administrator can change this.",
		HTTP_STATUS.FORBIDDEN,
	);
}

/* ───────────────────────── courses ───────────────────────── */

export async function listCourses(user: CourseUser) {
	return prisma.course.findMany({
		where: user.role === "admin" ? {} : { institutionName: institutionOf(user) },
		orderBy: [{ code: "asc" }],
		include: {
			owner: { select: { id: true, name: true } },
			_count: { select: { syllabi: true, materials: true, assessments: true } },
		},
	});
}

export async function createCourse(user: CourseUser, input: z.infer<typeof createCourseSchema>) {
	const institutionName = institutionOf(user);
	const code = input.code.toUpperCase();
	const existing = await prisma.course.findUnique({
		where: { institutionName_code: { institutionName, code } },
	});
	if (existing) {
		throw new AppError(
			`Course ${code} already exists — select it from the list instead of creating a duplicate.`,
			HTTP_STATUS.CONFLICT,
		);
	}
	return prisma.course.create({
		data: {
			code,
			name: input.name,
			subject: input.subject || null,
			department: input.department || null,
			institutionName,
			ownerId: user.id,
		},
		include: {
			owner: { select: { id: true, name: true } },
			_count: { select: { syllabi: true, materials: true, assessments: true } },
		},
	});
}

export async function getCourseDetail(user: CourseUser, courseId: string) {
	await loadCourseFor(user, courseId);
	return prisma.course.findUnique({
		where: { id: courseId },
		include: {
			owner: { select: { id: true, name: true } },
			syllabi: {
				orderBy: { createdAt: "desc" },
				include: {
					file: fileMeta,
					units: {
						orderBy: { order: "asc" },
						include: { topics: { orderBy: { order: "asc" } } },
					},
					_count: { select: { assessments: true } },
				},
			},
			materials: {
				orderBy: { createdAt: "desc" },
				include: { file: fileMeta, _count: { select: { assessments: true } } },
			},
		},
	});
}

/* ───────────────────────── syllabi ───────────────────────── */

async function replaceUnits(
	courseId: string,
	syllabusId: string,
	units: { number: number; title: string; topics: string[] }[],
) {
	await prisma.$transaction(async (tx) => {
		await tx.courseUnit.deleteMany({ where: { syllabusId } });
		for (const [i, u] of units.entries()) {
			await tx.courseUnit.create({
				data: {
					courseId,
					syllabusId,
					number: u.number,
					title: u.title,
					order: i,
					topics: { create: u.topics.map((title, j) => ({ title, order: j })) },
				},
			});
		}
	});
}

export async function uploadSyllabus(
	user: CourseUser,
	courseId: string,
	file: UploadedFile | undefined,
	title?: string,
) {
	await loadCourseFor(user, courseId);
	const { file: stored, reused } = await storeFile(user.id, "syllabus", file as UploadedFile);

	// The same document already uploaded for this course is reused, not duplicated.
	const duplicate = await prisma.syllabus.findFirst({
		where: { courseId, fileId: stored.id },
		select: { id: true },
	});
	if (duplicate) return { syllabusId: duplicate.id, duplicate: true };

	const syllabus = await prisma.syllabus.create({
		data: {
			courseId,
			title: title?.trim() || stored.fileName.replace(/\.[^.]+$/, ""),
			status: "processing",
			fileId: stored.id,
			uploadedById: user.id,
		},
	});

	try {
		const text = await extractText(
			(file as UploadedFile).buffer.toString("base64"),
			stored.mimeType,
		);
		const units = parseSyllabusText(text);
		await replaceUnits(courseId, syllabus.id, units);
		await prisma.syllabus.update({
			where: { id: syllabus.id },
			data: {
				status: "ready",
				statusMessage:
					units.length > 0
						? `Detected ${units.length} unit${units.length === 1 ? "" : "s"} and ${units.reduce((n, u) => n + u.topics.length, 0)} topics.`
						: "No unit headings were detected. Add units and topics manually.",
			},
		});
	} catch (err) {
		console.error("[Syllabus] text extraction failed:", err);
		await prisma.syllabus.update({
			where: { id: syllabus.id },
			data: {
				status: "failed",
				statusMessage:
					"The document could not be read (it may be scanned or password-protected). Add units manually.",
			},
		});
	}
	return { syllabusId: syllabus.id, duplicate: false, fileReused: reused };
}

export async function createManualSyllabus(user: CourseUser, courseId: string, title: string) {
	await loadCourseFor(user, courseId);
	return prisma.syllabus.create({
		data: { courseId, title, status: "manual", uploadedById: user.id, isOfficial: false },
	});
}

async function loadSyllabusFor(user: CourseUser, syllabusId: string) {
	const syllabus = await prisma.syllabus.findUnique({
		where: { id: syllabusId },
		include: { course: true },
	});
	if (
		!syllabus ||
		(user.role !== "admin" && syllabus.course.institutionName !== institutionOf(user))
	) {
		throw new AppError("Syllabus not found.", HTTP_STATUS.NOT_FOUND);
	}
	return syllabus;
}

/**
 * Saves edited units/topics. Existing ids are updated in place so questions and
 * assessments that reference a topic keep their mapping; removed ones are deleted.
 */
export async function saveSyllabusStructure(
	user: CourseUser,
	syllabusId: string,
	input: z.infer<typeof syllabusStructureSchema>,
) {
	const syllabus = await loadSyllabusFor(user, syllabusId);
	assertCanManage(user, [syllabus.uploadedById, syllabus.course.ownerId]);

	await prisma.$transaction(async (tx) => {
		const existingUnits = await tx.courseUnit.findMany({
			where: { syllabusId },
			include: { topics: { select: { id: true } } },
		});
		const unitIds = new Set(existingUnits.map((u) => u.id));
		const keptUnitIds = new Set(
			input.units.map((u) => u.id).filter((id): id is string => !!id && unitIds.has(id)),
		);
		await tx.courseUnit.deleteMany({
			where: { syllabusId, id: { notIn: [...keptUnitIds] } },
		});

		for (const [i, u] of input.units.entries()) {
			const unit =
				u.id && keptUnitIds.has(u.id)
					? await tx.courseUnit.update({
							where: { id: u.id },
							data: { title: u.title, number: i + 1, order: i },
						})
					: await tx.courseUnit.create({
							data: {
								courseId: syllabus.courseId,
								syllabusId,
								title: u.title,
								number: i + 1,
								order: i,
							},
						});
			const ownTopicIds = new Set(
				existingUnits.find((e) => e.id === unit.id)?.topics.map((t) => t.id) ?? [],
			);
			const keptTopicIds = u.topics
				.map((t) => t.id)
				.filter((id): id is string => !!id && ownTopicIds.has(id));
			await tx.courseTopic.deleteMany({ where: { unitId: unit.id, id: { notIn: keptTopicIds } } });
			for (const [j, t] of u.topics.entries()) {
				if (t.id && ownTopicIds.has(t.id)) {
					await tx.courseTopic.update({ where: { id: t.id }, data: { title: t.title, order: j } });
				} else {
					await tx.courseTopic.create({ data: { unitId: unit.id, title: t.title, order: j } });
				}
			}
		}
		if (syllabus.status === "failed" || syllabus.status === "processing") {
			await tx.syllabus.update({
				where: { id: syllabusId },
				data: { status: "ready", statusMessage: "Units edited manually." },
			});
		}
	});
}

export async function deleteSyllabus(user: CourseUser, syllabusId: string) {
	const syllabus = await loadSyllabusFor(user, syllabusId);
	assertCanManage(user, [syllabus.uploadedById, syllabus.course.ownerId]);
	const published = await prisma.assessment.count({ where: { syllabusId, published: true } });
	if (published > 0) {
		throw new AppError(
			`This syllabus is used by ${published} published assessment${published === 1 ? "" : "s"} and cannot be deleted.`,
			HTTP_STATUS.CONFLICT,
		);
	}
	await prisma.syllabus.delete({ where: { id: syllabusId } });
}

export async function getSyllabusFile(user: CourseUser, syllabusId: string) {
	const syllabus = await loadSyllabusFor(user, syllabusId);
	if (!syllabus.fileId) throw new AppError("This syllabus has no document.", HTTP_STATUS.NOT_FOUND);
	return prisma.storedFile.findUniqueOrThrow({ where: { id: syllabus.fileId } });
}

/* ───────────────────────── materials ───────────────────────── */

function assertMaterialShape(kind: string, url: string | null | undefined, hasFile: boolean) {
	if (LINK_KINDS.has(kind)) {
		if (!url)
			throw new AppError(
				"A link is required for video and external resources.",
				HTTP_STATUS.BAD_REQUEST,
			);
	} else if (!hasFile) {
		throw new AppError("Attach a file for this material type.", HTTP_STATUS.BAD_REQUEST);
	}
}

export async function createMaterial(
	user: CourseUser,
	courseId: string,
	fields: z.infer<typeof materialFieldsSchema>,
	file: UploadedFile | undefined,
) {
	await loadCourseFor(user, courseId);
	const isLink = LINK_KINDS.has(fields.kind);
	assertMaterialShape(fields.kind, fields.url, !!file);

	let fileId: string | null = null;
	if (!isLink && file) {
		const { file: stored } = await storeFile(user.id, "material", file);
		// Reuse: the same document is already a material of this course.
		const existing = await prisma.courseMaterial.findFirst({
			where: { courseId, fileId: stored.id },
			include: { file: fileMeta, _count: { select: { assessments: true } } },
		});
		if (existing) return { material: existing, duplicate: true };
		fileId = stored.id;
	} else if (isLink && fields.url) {
		const existing = await prisma.courseMaterial.findFirst({
			where: { courseId, url: fields.url },
			include: { file: fileMeta, _count: { select: { assessments: true } } },
		});
		if (existing) return { material: existing, duplicate: true };
	}

	const material = await prisma.courseMaterial.create({
		data: {
			courseId,
			kind: fields.kind,
			title: fields.title,
			description: fields.description || null,
			url: isLink ? (fields.url ?? null) : null,
			fileId,
			uploadedById: user.id,
		},
		include: { file: fileMeta, _count: { select: { assessments: true } } },
	});
	return { material, duplicate: false };
}

async function loadMaterialFor(user: CourseUser, materialId: string) {
	const material = await prisma.courseMaterial.findUnique({
		where: { id: materialId },
		include: { course: true },
	});
	if (
		!material ||
		(user.role !== "admin" && material.course.institutionName !== institutionOf(user))
	) {
		throw new AppError("Material not found.", HTTP_STATUS.NOT_FOUND);
	}
	return material;
}

export async function updateMaterial(
	user: CourseUser,
	materialId: string,
	fields: z.infer<typeof materialUpdateSchema>,
	file: UploadedFile | undefined,
) {
	const material = await loadMaterialFor(user, materialId);
	assertCanManage(user, [material.uploadedById, material.course.ownerId]);
	const kind = fields.kind ?? material.kind;
	const isLink = LINK_KINDS.has(kind);
	let fileId = material.fileId;
	if (file) {
		if (isLink) throw new AppError("Links cannot have a file attached.", HTTP_STATUS.BAD_REQUEST);
		fileId = (await storeFile(user.id, "material", file)).file.id;
	}
	const url = isLink ? (fields.url !== undefined ? fields.url : material.url) : null;
	assertMaterialShape(kind, url, !!fileId);
	return prisma.courseMaterial.update({
		where: { id: materialId },
		data: {
			kind,
			title: fields.title ?? material.title,
			description:
				fields.description !== undefined ? fields.description || null : material.description,
			url,
			fileId: isLink ? null : fileId,
		},
		include: { file: fileMeta, _count: { select: { assessments: true } } },
	});
}

export async function deleteMaterial(user: CourseUser, materialId: string) {
	const material = await loadMaterialFor(user, materialId);
	assertCanManage(user, [material.uploadedById, material.course.ownerId]);
	const published = await prisma.assessmentMaterial.count({
		where: { materialId, assessment: { published: true } },
	});
	if (published > 0) {
		throw new AppError(
			`This material is attached to ${published} published assessment${published === 1 ? "" : "s"}. Detach it there first.`,
			HTTP_STATUS.CONFLICT,
		);
	}
	await prisma.courseMaterial.delete({ where: { id: materialId } });
}

/**
 * Who may open a material file:
 *  - staff of the course's institution;
 *  - students, only through a published assessment of their institution that
 *    shares materials, inside the availability window. While the student has an
 *    attempt in progress, materials are blocked when the assessment restricts them,
 *    except those explicitly permitted as exam references.
 */
export async function authorizeMaterialFile(
	user: CourseUser,
	materialId: string,
	download: boolean,
) {
	const material = await prisma.courseMaterial.findUnique({
		where: { id: materialId },
		include: { course: true },
	});
	if (!material || !material.fileId)
		throw new AppError("Material not found.", HTTP_STATUS.NOT_FOUND);
	if (isStaff(user)) {
		if (user.role !== "admin" && material.course.institutionName !== institutionOf(user)) {
			throw new AppError("Material not found.", HTTP_STATUS.NOT_FOUND);
		}
		return material.fileId;
	}

	const links = await prisma.assessmentMaterial.findMany({
		where: {
			materialId,
			assessment: {
				published: true,
				materialsAccessible: true,
				institutionName: institutionOf(user),
			},
		},
		include: {
			assessment: {
				select: {
					id: true,
					materialsDownloadable: true,
					materialsRestrictedDuringExam: true,
					materialsAvailableFrom: true,
					materialsAvailableUntil: true,
				},
			},
		},
	});
	const now = Date.now();
	for (const link of links) {
		const a = link.assessment;
		if (a.materialsAvailableFrom && a.materialsAvailableFrom.getTime() > now) continue;
		if (a.materialsAvailableUntil && a.materialsAvailableUntil.getTime() < now) continue;
		if (download && !a.materialsDownloadable) continue;
		const inExam = await prisma.assessmentAttempt.count({
			where: { assessmentId: a.id, studentId: user.id, status: "started" },
		});
		if (inExam > 0 && a.materialsRestrictedDuringExam && !link.permittedInExam) continue;
		return material.fileId;
	}
	throw new AppError(
		download
			? "Downloading this material is not permitted."
			: "This material is not available to you right now.",
		HTTP_STATUS.FORBIDDEN,
	);
}

export function getStoredFile(fileId: string) {
	return prisma.storedFile.findUniqueOrThrow({ where: { id: fileId } });
}

/* ───────────────────────── question images ───────────────────────── */

export async function uploadQuestionImage(user: CourseUser, file: UploadedFile | undefined) {
	const { file: stored } = await storeFile(user.id, "question-image", file as UploadedFile);
	return stored;
}

export async function getQuestionImage(fileId: string) {
	const file = await prisma.storedFile.findUnique({ where: { id: fileId } });
	if (!file || file.purpose !== "question-image") {
		throw new AppError("Image not found.", HTTP_STATUS.NOT_FOUND);
	}
	return file;
}
