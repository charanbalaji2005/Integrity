import type { Request, Response } from "express";
import { z } from "zod";
import { HTTP_STATUS } from "../../../constants/http-status";
import { getAuthUser } from "../../../middleware/auth-middleware";
import { AppError } from "../../../utils/app-error";
import { sendSuccess } from "../../../utils/response";
import {
	getReport,
	listReports,
	runSimilarityCheck,
	type SourceKind,
} from "../services/plagiarism-service";

const EXT_TO_MIME: Record<string, string> = {
	txt: "text/plain",
	pdf: "application/pdf",
	docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	webp: "image/webp",
};

const bool = (def: boolean) =>
	z
		.union([z.boolean(), z.string()])
		.optional()
		.transform((v) =>
			v === undefined || v === "" ? def : v === true || v === "true" || v === "1" || v === "on",
		);

const optionsSchema = z.object({
	title: z.string().max(200).optional(),
	text: z.string().max(400_000).optional(),
	excludeQuotes: bool(true),
	excludeBibliography: bool(true),
	minMatchWords: z.coerce.number().int().min(3).max(40).optional().default(8),
	sources: z
		.string()
		.optional()
		.transform((v) => {
			const all: SourceKind[] = ["repository", "internet", "publications"];
			if (!v) return all;
			const picked = v.split(",").map((s) => s.trim()) as SourceKind[];
			return all.filter((s) => picked.includes(s));
		}),
	saveToRepository: bool(true),
});

/**
 * POST /api/plagiarism/check  (multipart: `document` file OR `text`, plus options)
 * Also served at the legacy path POST /api/plagiarism/analyze-document.
 */
export async function checkSimilarity(req: Request, res: Response): Promise<void> {
	const user = getAuthUser(req);
	const parsed = optionsSchema.safeParse(req.body ?? {});
	if (!parsed.success) throw new AppError("Invalid check options.", HTTP_STATUS.BAD_REQUEST);
	const o = parsed.data;
	if (o.sources.length === 0)
		throw new AppError("Choose at least one source to compare against.", HTTP_STATUS.BAD_REQUEST);

	let file: { buffer: Buffer; originalname: string; mimetype: string } | undefined;
	if (req.file) {
		const ext = req.file.originalname.split(".").pop()?.toLowerCase() || "";
		const mime = EXT_TO_MIME[ext];
		if (!mime) {
			throw new AppError(
				"Unsupported file. Upload TXT, PDF, DOCX, PNG, JPG or WEBP.",
				HTTP_STATUS.BAD_REQUEST,
			);
		}
		file = { buffer: req.file.buffer, originalname: req.file.originalname, mimetype: mime };
	} else if (!o.text?.trim()) {
		throw new AppError("Upload a document or paste text to check.", HTTP_STATUS.BAD_REQUEST);
	}

	const report = await runSimilarityCheck({
		user: { id: user.id, institutionName: user.institutionName },
		title: o.title,
		file,
		pastedText: file ? undefined : o.text,
		options: {
			excludeQuotes: o.excludeQuotes,
			excludeBibliography: o.excludeBibliography,
			minMatchWords: o.minMatchWords,
			sources: o.sources,
			saveToRepository: o.saveToRepository,
		},
	});
	sendSuccess(res, report, "Similarity report generated.", HTTP_STATUS.OK);
}

// GET /api/plagiarism/reports
export async function listReportsHandler(req: Request, res: Response): Promise<void> {
	const user = getAuthUser(req);
	sendSuccess(res, await listReports(user.id), "Similarity reports", HTTP_STATUS.OK);
}

// GET /api/plagiarism/reports/:id
export async function getReportHandler(req: Request, res: Response): Promise<void> {
	const user = getAuthUser(req);
	const id = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id ?? "");
	sendSuccess(
		res,
		await getReport(id, { id: user.id, role: user.role }),
		"Similarity report",
		HTTP_STATUS.OK,
	);
}
