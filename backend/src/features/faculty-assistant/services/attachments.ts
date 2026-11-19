import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { HTTP_STATUS } from "../../../constants/http-status";
import { prisma } from "../../../database";
import { AppError } from "../../../utils/app-error";
import { extractText } from "../../text-extraction/services/text-extraction-service";

/** Max characters of extracted text kept per document (keeps prompts bounded). */
export const MAX_ATTACHMENT_CHARS = 60_000;
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const KINDS: Record<string, { kind: "pdf" | "docx" | "pptx" | "text" | "image"; mime: string }> = {
	pdf: { kind: "pdf", mime: "application/pdf" },
	docx: { kind: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
	pptx: { kind: "pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
	txt: { kind: "text", mime: "text/plain" },
	md: { kind: "text", mime: "text/markdown" },
	csv: { kind: "text", mime: "text/csv" },
	png: { kind: "image", mime: "image/png" },
	jpg: { kind: "image", mime: "image/jpeg" },
	jpeg: { kind: "image", mime: "image/jpeg" },
	webp: { kind: "image", mime: "image/webp" },
};

const decodeXml = (s: string) =>
	s
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
		.replace(/&amp;/g, "&");

const MAX_ENTRY_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 60 * 1024 * 1024;

/**
 * Minimal ZIP reader (stored + deflate entries) built on node:zlib, so Office
 * files can be read without extra dependencies. Decompressed sizes are capped
 * to defuse zip bombs.
 */
export function readZipEntries(buffer: Buffer, wanted: (name: string) => boolean): Record<string, string> {
	const EOCD = 0x06054b50;
	let eocd = -1;
	for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65_557); i--) {
		if (buffer.readUInt32LE(i) === EOCD) {
			eocd = i;
			break;
		}
	}
	if (eocd < 0) throw new Error("not a zip archive");
	const count = buffer.readUInt16LE(eocd + 10);
	let ptr = buffer.readUInt32LE(eocd + 16);
	const out: Record<string, string> = {};
	let total = 0;
	for (let n = 0; n < count; n++) {
		if (ptr + 46 > buffer.length || buffer.readUInt32LE(ptr) !== 0x02014b50) throw new Error("corrupt central directory");
		const method = buffer.readUInt16LE(ptr + 10);
		const compressed = buffer.readUInt32LE(ptr + 20);
		const nameLen = buffer.readUInt16LE(ptr + 28);
		const extraLen = buffer.readUInt16LE(ptr + 30);
		const commentLen = buffer.readUInt16LE(ptr + 32);
		const local = buffer.readUInt32LE(ptr + 42);
		const name = buffer.toString("utf8", ptr + 46, ptr + 46 + nameLen);
		ptr += 46 + nameLen + extraLen + commentLen;
		if (!wanted(name)) continue;
		if (local + 30 > buffer.length || buffer.readUInt32LE(local) !== 0x04034b50) throw new Error("corrupt local header");
		const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
		const raw = buffer.subarray(start, start + compressed);
		let data: Buffer;
		if (method === 0) data = raw;
		else if (method === 8) data = inflateRawSync(raw, { maxOutputLength: MAX_ENTRY_BYTES });
		else continue; // unsupported compression — skip the entry
		total += data.length;
		if (total > MAX_TOTAL_BYTES) throw new Error("archive too large when decompressed");
		out[name] = data.toString("utf8");
	}
	return out;
}

/** Text of every slide (and its speaker notes) in slide order. */
export function extractPptxText(buffer: Buffer): string {
	let files: Record<string, string>;
	try {
		files = readZipEntries(buffer, (name) => /^ppt\/(slides|notesSlides)\/\w+\.xml$/.test(name));
	} catch {
		throw new AppError("This PowerPoint file could not be opened.", HTTP_STATUS.BAD_REQUEST);
	}
	const slideNo = (name: string) => Number(name.match(/(\d+)\.xml$/)?.[1] ?? 0);
	const textOf = (xml: string) =>
		[...xml.matchAll(/<a:p\b[\s\S]*?<\/a:p>/g)]
			.map((p) => [...p[0].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((t) => decodeXml(t[1])).join(""))
			.filter((l) => l.trim())
			.join("\n");
	const slides = Object.keys(files)
		.filter((n) => n.startsWith("ppt/slides/"))
		.sort((a, b) => slideNo(a) - slideNo(b));
	return slides
		.map((name) => {
			const n = slideNo(name);
			const body = textOf(files[name]);
			const notesKey = `ppt/notesSlides/notesSlide${n}.xml`;
			const notes = files[notesKey] ? textOf(files[notesKey]).replace(/^\d+$/gm, "").trim() : "";
			return `--- Slide ${n} ---\n${body}${notes ? `\n[Speaker notes] ${notes}` : ""}`;
		})
		.join("\n\n");
}

export async function createAttachment(
	userId: string,
	file: { originalname: string; buffer: Buffer; size: number } | undefined,
	conversationId?: string | null,
) {
	if (!file?.buffer?.length) throw new AppError("No file was uploaded.", HTTP_STATUS.BAD_REQUEST);
	if (file.size > MAX_ATTACHMENT_BYTES) throw new AppError("Files must be 20 MB or smaller.", HTTP_STATUS.BAD_REQUEST);
	const ext = path.extname(file.originalname).slice(1).toLowerCase();
	const type = KINDS[ext];
	if (!type) {
		throw new AppError("Supported files: PDF, DOCX, PPTX, TXT, MD, CSV, PNG, JPG, WEBP.", HTTP_STATUS.BAD_REQUEST);
	}
	if (conversationId) {
		const owned = await prisma.assistantConversation.count({ where: { id: conversationId, userId } });
		if (!owned) throw new AppError("Conversation not found.", HTTP_STATUS.NOT_FOUND);
	}

	let text = "";
	try {
		if (type.kind === "pptx") text = extractPptxText(file.buffer);
		else if (type.kind === "text") text = file.buffer.toString("utf-8");
		else text = await extractText(file.buffer.toString("base64"), type.mime);
	} catch (err) {
		if (err instanceof AppError) throw err;
		throw new AppError(
			"The document could not be read. It may be scanned, encrypted or damaged.",
			HTTP_STATUS.UNPROCESSABLE_ENTITY,
		);
	}
	text = text.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
	if (!text) {
		throw new AppError("No readable text was found in this file.", HTTP_STATUS.UNPROCESSABLE_ENTITY);
	}
	const truncated = text.length > MAX_ATTACHMENT_CHARS;
	return prisma.assistantAttachment.create({
		data: {
			userId,
			conversationId: conversationId || null,
			fileName: path.basename(file.originalname).slice(0, 200),
			mimeType: type.mime,
			sizeBytes: file.size,
			kind: type.kind,
			extractedText: truncated ? text.slice(0, MAX_ATTACHMENT_CHARS) : text,
			truncated,
		},
		select: { id: true, fileName: true, kind: true, sizeBytes: true, truncated: true, createdAt: true },
	});
}

/** Attachments owned by the user; missing or foreign ids are silently ignored. */
export async function loadAttachments(userId: string, ids: string[]) {
	if (!ids.length) return [];
	return prisma.assistantAttachment.findMany({
		where: { id: { in: ids }, userId },
		select: { id: true, fileName: true, kind: true, extractedText: true, truncated: true },
	});
}
