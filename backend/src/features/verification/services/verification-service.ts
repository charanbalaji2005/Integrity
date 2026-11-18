import { HTTP_STATUS } from "../../../constants/http-status";
import { prisma } from "../../../database";
import { AppError } from "../../../utils/app-error";

export const DOCUMENT_TYPES = {
	college_id: "College ID Card",
	fee_receipt: "Institution Fee Receipt",
} as const;
export type DocumentType = keyof typeof DOCUMENT_TYPES;

export const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export type VerificationStatus = "unverified" | "pending" | "approved" | "rejected";

/** Magic-byte check so a renamed file can't pass the MIME filter. */
export function detectMime(buf: Buffer): string | null {
	if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
	if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
		return "image/png";
	}
	if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
	return null;
}

const summarySelect = {
	id: true,
	documentType: true,
	fileName: true,
	mimeType: true,
	fileSize: true,
	institutionName: true,
	rollNumber: true,
	status: true,
	reviewNote: true,
	reviewedByName: true,
	reviewedAt: true,
	createdAt: true,
} as const;

export async function getMyVerification(userId: string) {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: { verificationStatus: true, verifiedAt: true, institutionName: true, role: true },
	});
	if (!user) throw new AppError("User not found", HTTP_STATUS.NOT_FOUND);

	const latest = await prisma.studentVerification.findFirst({
		where: { userId },
		orderBy: { createdAt: "desc" },
		select: summarySelect,
	});

	return {
		status: user.verificationStatus as VerificationStatus,
		verifiedAt: user.verifiedAt,
		institutionName: user.institutionName,
		/** Only students need verification to take exams. */
		required: user.role === "user",
		latest,
	};
}

export async function submitDocument(params: {
	userId: string;
	documentType: DocumentType;
	file: { buffer: Buffer; originalname: string; size: number };
	rollNumber?: string;
	institutionName?: string;
}) {
	const { userId, documentType, file } = params;

	const user = await prisma.user.findUnique({ where: { id: userId } });
	if (!user) throw new AppError("User not found", HTTP_STATUS.NOT_FOUND);
	if (user.role !== "user") {
		throw new AppError("Only student accounts submit enrolment verification.", HTTP_STATUS.BAD_REQUEST);
	}
	if (user.verificationStatus === "approved") {
		throw new AppError("Your account is already verified.", HTTP_STATUS.CONFLICT);
	}

	const mime = detectMime(file.buffer);
	if (!mime || !ALLOWED_MIME_TYPES.has(mime)) {
		throw new AppError("Upload a JPG, PNG or PDF file.", HTTP_STATUS.BAD_REQUEST);
	}

	const institutionName = params.institutionName?.trim() || user.institutionName || null;
	const rollNumber = params.rollNumber?.trim() || user.rollNumber || null;
	const safeName = file.originalname.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "document";

	const created = await prisma.$transaction(async (tx) => {
		// A new submission replaces any earlier one still waiting for review.
		await tx.studentVerification.deleteMany({ where: { userId, status: "pending" } });
		const record = await tx.studentVerification.create({
			data: {
				userId,
				documentType,
				fileName: safeName,
				mimeType: mime,
				fileSize: file.size,
				fileData: new Uint8Array(file.buffer),
				institutionName,
				rollNumber,
			},
			select: summarySelect,
		});
		await tx.user.update({
			where: { id: userId },
			data: {
				verificationStatus: "pending",
				...(rollNumber && !user.rollNumber ? { rollNumber } : {}),
				...(institutionName && !user.institutionName ? { institutionName } : {}),
			},
		});
		return record;
	});

	// Let administrators know a review is waiting.
	const admins = await prisma.user.findMany({ where: { role: "admin" }, select: { id: true } });
	if (admins.length > 0) {
		await prisma.notification.createMany({
			data: admins.map((a) => ({
				userId: a.id,
				title: "Student verification pending",
				description: `${user.name} submitted a ${DOCUMENT_TYPES[documentType]} for review.`,
				type: "system",
				priority: "medium",
				senderName: user.name,
				senderRole: "user",
			})),
		});
	}

	return created;
}

export async function listRequests(status: string | undefined) {
	const where = status && status !== "all" ? { status } : {};
	const [items, counts] = await Promise.all([
		prisma.studentVerification.findMany({
			where,
			orderBy: { createdAt: status === "pending" ? "asc" : "desc" },
			take: 200,
			select: {
				...summarySelect,
				user: {
					select: {
						id: true,
						name: true,
						email: true,
						rollNumber: true,
						department: true,
						semester: true,
						section: true,
						institutionName: true,
						verificationStatus: true,
					},
				},
			},
		}),
		prisma.studentVerification.groupBy({ by: ["status"], _count: { _all: true } }),
	]);

	const countMap: Record<string, number> = { pending: 0, approved: 0, rejected: 0 };
	for (const c of counts) countMap[c.status] = c._count._all;
	return { items, counts: countMap };
}

export async function getDocument(id: string) {
	const doc = await prisma.studentVerification.findUnique({
		where: { id },
		select: { fileData: true, mimeType: true, fileName: true },
	});
	if (!doc) throw new AppError("Document not found", HTTP_STATUS.NOT_FOUND);
	return doc;
}

async function notifyStudent(userId: string, title: string, description: string, priority: "medium" | "high") {
	await prisma.notification.create({
		data: { userId, title, description, type: "system", priority, senderName: "IntegrityOS Admin", senderRole: "admin" },
	});
}

export async function reviewRequest(params: {
	id: string;
	reviewer: { id: string; name: string };
	decision: "approved" | "rejected";
	note?: string;
	institutionName?: string;
}) {
	const { id, reviewer, decision } = params;
	const request = await prisma.studentVerification.findUnique({
		where: { id },
		select: { id: true, userId: true, status: true, institutionName: true, documentType: true },
	});
	if (!request) throw new AppError("Verification request not found", HTTP_STATUS.NOT_FOUND);
	if (request.status !== "pending") {
		throw new AppError(`This request was already ${request.status}.`, HTTP_STATUS.CONFLICT);
	}

	const note = params.note?.trim().slice(0, 500) || null;
	if (decision === "rejected" && !note) {
		throw new AppError("Give the student a reason for the rejection.", HTTP_STATUS.BAD_REQUEST);
	}
	const institutionName = params.institutionName?.trim() || request.institutionName || null;
	const now = new Date();

	await prisma.$transaction([
		prisma.studentVerification.update({
			where: { id },
			data: {
				status: decision,
				reviewNote: note,
				reviewedById: reviewer.id,
				reviewedByName: reviewer.name,
				reviewedAt: now,
				...(institutionName ? { institutionName } : {}),
			},
		}),
		prisma.user.update({
			where: { id: request.userId },
			data:
				decision === "approved"
					? { verificationStatus: "approved", verifiedAt: now, ...(institutionName ? { institutionName } : {}) }
					: { verificationStatus: "rejected", verifiedAt: null },
		}),
	]);

	if (decision === "approved") {
		await notifyStudent(
			request.userId,
			"You're verified",
			`Your ${DOCUMENT_TYPES[request.documentType as DocumentType] ?? "document"} was approved${institutionName ? ` for ${institutionName}` : ""}. You can now take examinations.`,
			"high",
		);
	} else {
		await notifyStudent(
			request.userId,
			"Verification needs attention",
			`Your document was not approved: ${note}. Please upload a new one.`,
			"high",
		);
	}

	return { id, status: decision, userId: request.userId };
}
