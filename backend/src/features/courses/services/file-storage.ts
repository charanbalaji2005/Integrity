import { createHash } from "node:crypto";
import path from "node:path";
import { HTTP_STATUS } from "@/constants/http-status";
import { prisma } from "@/database";
import { AppError } from "@/utils/app-error";

export type FilePurpose = "syllabus" | "material" | "question-image";

const MB = 1024 * 1024;

interface FileRule {
	maxBytes: number;
	/** extension → canonical mime type */
	types: Record<string, string>;
	label: string;
}

const PDF = "application/pdf";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const DOC = "application/msword";
const PPT = "application/vnd.ms-powerpoint";

export const FILE_RULES: Record<FilePurpose, FileRule> = {
	syllabus: { maxBytes: 10 * MB, types: { pdf: PDF, docx: DOCX }, label: "PDF or DOCX up to 10 MB" },
	material: {
		maxBytes: 25 * MB,
		types: {
			pdf: PDF,
			docx: DOCX,
			doc: DOC,
			pptx: PPTX,
			ppt: PPT,
			txt: "text/plain",
			md: "text/markdown",
		},
		label: "PDF, DOC/DOCX, PPT/PPTX, TXT or MD up to 25 MB",
	},
	"question-image": {
		maxBytes: 5 * MB,
		types: { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" },
		label: "PNG, JPG, WEBP or GIF up to 5 MB",
	},
};

/** Largest file any purpose accepts — used as the multer ceiling. */
export const MAX_UPLOAD_BYTES = 25 * MB;

/**
 * Confirms the bytes match the claimed extension so a renamed executable can't be
 * stored as a "PDF". Office Open XML files are ZIP containers; legacy Office files
 * are OLE compound documents.
 */
function signatureMatches(ext: string, buf: Buffer): boolean {
	const head = (n: number) => buf.subarray(0, n);
	switch (ext) {
		case "pdf":
			return head(5).toString("ascii") === "%PDF-";
		case "docx":
		case "pptx":
			return buf[0] === 0x50 && buf[1] === 0x4b; // "PK"
		case "doc":
		case "ppt":
			return head(4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]));
		case "png":
			return head(4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
		case "jpg":
		case "jpeg":
			return buf[0] === 0xff && buf[1] === 0xd8;
		case "gif":
			return head(3).toString("ascii") === "GIF";
		case "webp":
			return head(4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP";
		case "txt":
		case "md":
			return !buf.subarray(0, 4096).includes(0); // plain text has no NUL bytes
		default:
			return false;
	}
}

export interface UploadedFile {
	originalname: string;
	buffer: Buffer;
	size: number;
}

export function validateUpload(file: UploadedFile | undefined, purpose: FilePurpose) {
	const rule = FILE_RULES[purpose];
	if (!file || !file.buffer?.length) {
		throw new AppError("No file was uploaded.", HTTP_STATUS.BAD_REQUEST);
	}
	const ext = path.extname(file.originalname).slice(1).toLowerCase();
	const mimeType = rule.types[ext];
	if (!mimeType) {
		throw new AppError(`Unsupported file type. Allowed: ${rule.label}.`, HTTP_STATUS.BAD_REQUEST);
	}
	if (file.size > rule.maxBytes) {
		throw new AppError(`File is too large. Allowed: ${rule.label}.`, HTTP_STATUS.BAD_REQUEST);
	}
	if (!signatureMatches(ext, file.buffer)) {
		throw new AppError(
			`The file content does not match its .${ext} extension.`,
			HTTP_STATUS.BAD_REQUEST,
		);
	}
	// Strip any path components and control characters from the stored name.
	const fileName = path.basename(file.originalname).replace(/[\u0000-\u001f"\\]/g, "_").slice(0, 200);
	return { ext, mimeType, fileName };
}

/** Stores a validated upload; identical bytes from the same owner reuse the existing record. */
export async function storeFile(ownerId: string, purpose: FilePurpose, file: UploadedFile) {
	const { mimeType, fileName } = validateUpload(file, purpose);
	const sha256 = createHash("sha256").update(file.buffer).digest("hex");
	const existing = await prisma.storedFile.findFirst({
		where: { ownerId, sha256, purpose },
		select: { id: true, fileName: true, mimeType: true, sizeBytes: true, sha256: true },
	});
	if (existing) return { file: existing, reused: true };
	const created = await prisma.storedFile.create({
		data: {
			ownerId,
			purpose,
			fileName,
			mimeType,
			sizeBytes: file.size,
			sha256,
			data: new Uint8Array(file.buffer),
		},
		select: { id: true, fileName: true, mimeType: true, sizeBytes: true, sha256: true },
	});
	return { file: created, reused: false };
}

/** RFC 5987 Content-Disposition value that is safe for any file name. */
export function contentDisposition(kind: "inline" | "attachment", fileName: string) {
	const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
	return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
