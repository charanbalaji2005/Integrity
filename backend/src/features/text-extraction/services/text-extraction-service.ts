import _pdfParse from "pdf-parse";

const pdfParse = _pdfParse as any;

import mammoth from "mammoth";
import Tesseract from "tesseract.js";

export async function extractText(base64Str: string, fileType: string): Promise<string> {
	const normalizedType = fileType.toLowerCase().trim();
	const cleanBase64 = base64Str.replace(/^data:.*;base64,/, "");
	const buffer = Buffer.from(cleanBase64, "base64");

	if (normalizedType === "txt" || normalizedType === "text/plain") {
		return buffer.toString("utf-8");
	}

	if (normalizedType === "pdf" || normalizedType === "application/pdf") {
		const data = await pdfParse(buffer);
		return data.text || "";
	}

	if (
		normalizedType === "docx" ||
		normalizedType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
	) {
		const data = await mammoth.extractRawText({ buffer });
		return data.value || "";
	}

	if (
		normalizedType === "png" ||
		normalizedType === "jpg" ||
		normalizedType === "jpeg" ||
		normalizedType === "webp" ||
		normalizedType.startsWith("image/")
	) {
		// OCR Image extraction
		const result = await Tesseract.recognize(buffer, "eng");
		return result.data.text || "";
	}

	throw new Error(
		`Unsupported file type: ${fileType}. Supported types: TXT, PDF, DOCX, and common image formats (PNG, JPG, WEBP).`,
	);
}

export function recursiveChunkText(text: string, chunkSize = 500, chunkOverlap = 50): string[] {
	if (!text) return [];
	const delimiters = ["\n\n", "\n", " ", ""];

	function split(textToSplit: string, delimiterIdx: number): string[] {
		if (textToSplit.length <= chunkSize) {
			return [textToSplit];
		}
		if (delimiterIdx >= delimiters.length) {
			const chunks: string[] = [];
			let i = 0;
			while (i < textToSplit.length) {
				chunks.push(textToSplit.slice(i, i + chunkSize));
				i += chunkSize - chunkOverlap;
			}
			return chunks;
		}

		const delimiter = delimiters[delimiterIdx]!;
		const parts = textToSplit.split(delimiter);
		const result: string[] = [];
		let currentChunk = "";

		for (const part of parts) {
			const candidate = currentChunk ? currentChunk + delimiter + part : part;
			if (candidate.length <= chunkSize) {
				currentChunk = candidate;
			} else {
				if (currentChunk) {
					result.push(currentChunk);
				}
				if (part.length > chunkSize) {
					const subChunks = split(part, delimiterIdx + 1);
					for (let i = 0; i < subChunks.length - 1; i++) {
						result.push(subChunks[i]!);
					}
					currentChunk = subChunks[subChunks.length - 1]!;
				} else {
					currentChunk = part;
				}
			}
		}
		if (currentChunk) {
			result.push(currentChunk);
		}

		return result;
	}

	return split(text, 0);
}
