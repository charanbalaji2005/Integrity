import { createHash } from "node:crypto";
import { HTTP_STATUS } from "../../../constants/http-status";
import { prisma } from "../../../database";
import { AppError } from "../../../utils/app-error";
import { extractText } from "../../text-extraction/services/text-extraction-service";
import type { MatchKind } from "../engine/align";
import { prepareDocument, scoreDocument } from "../engine/analyze";
import { cleanText, countWords } from "../engine/text";
import { type CandidateSource, externalCandidates, pickQueryPhrases } from "../sources/external";
import { repositoryCandidates, saveToRepository } from "../sources/repository";

/**
 * Turnitin-style similarity check.
 *
 * 1. Extract and clean the text, apply exclusions (quotes, bibliography).
 * 2. Fingerprint it (word 5-grams for exact matches, content-word stem
 *    4-grams for near matches / light paraphrase).
 * 3. Gather candidate sources: the institutional repository (stored papers
 *    via an indexed fingerprint table + exam answers), Wikipedia, OpenAlex
 *    publications and, optionally, the web (Brave Search).
 * 4. Align the document with every candidate, attribute each matched word to
 *    a single primary source (largest first, so percentages add up), drop
 *    matches shorter than the minimum word count, and build the report.
 *
 * Similarity = matched words / checked words. It measures overlap, not intent.
 */

export type SourceKind = "repository" | "internet" | "publications";
export type Band = "none" | "low" | "medium" | "high" | "very_high";

export interface CheckOptions {
	excludeQuotes: boolean;
	excludeBibliography: boolean;
	minMatchWords: number;
	sources: SourceKind[];
	saveToRepository: boolean;
}

export interface ReportSource {
	id: string;
	rank: number;
	type: CandidateSource["type"];
	title: string;
	url: string | null;
	detail: string | null;
	percent: number;
	matchedWords: number;
}

export interface ReportMatch {
	id: string;
	sourceId: string;
	start: number;
	end: number;
	words: number;
	kind: MatchKind;
	sourceExcerpt: string;
}

export interface PlagiarismReportData {
	id: string;
	title: string;
	filename: string | null;
	createdAt: string;
	similarity: number;
	band: Band;
	breakdown: { internet: number; publications: number; studentPapers: number };
	stats: {
		totalWords: number;
		checkedWords: number;
		matchedWords: number;
		excludedWords: number;
		exactWords: number;
		nearWords: number;
		sourcesCompared: number;
		processingMs: number;
	};
	settings: CheckOptions;
	text: string;
	excluded: Array<{ start: number; end: number; reason: "quote" | "bibliography" }>;
	sources: ReportSource[];
	matches: ReportMatch[];
	coverage: { checked: string[]; skipped: Array<{ source: string; reason: string }> };
	savedToRepository: boolean;
}

const MAX_WORDS = 30_000;
const MIN_WORDS = 20;

export function bandFor(similarity: number): Band {
	if (similarity <= 0) return "none";
	if (similarity < 25) return "low";
	if (similarity < 50) return "medium";
	if (similarity < 75) return "high";
	return "very_high";
}

function round1(n: number): number {
	return Math.round(n * 10) / 10;
}

const running = new Set<string>();

export async function runSimilarityCheck(params: {
	user: { id: string; institutionName?: string | null };
	title?: string;
	file?: { buffer: Buffer; originalname: string; mimetype: string };
	pastedText?: string;
	options: CheckOptions;
}): Promise<PlagiarismReportData> {
	const { user, options } = params;
	if (running.has(user.id)) {
		throw new AppError(
			"A similarity check is already running for your account. Please wait for it to finish.",
			HTTP_STATUS.CONFLICT,
		);
	}
	running.add(user.id);
	const started = Date.now();
	try {
		// 1) Text
		let raw = "";
		if (params.file) {
			raw = await extractText(params.file.buffer.toString("base64"), params.file.mimetype);
		} else {
			raw = params.pastedText ?? "";
		}
		let text = cleanText(raw);
		const coverageNotes: Array<{ source: string; reason: string }> = [];
		if (countWords(text) > MAX_WORDS) {
			// Truncate at a word boundary and say so in the report.
			let n = 0;
			let cut = text.length;
			for (const m of text.matchAll(/[\p{L}\p{N}]+/gu)) {
				if (++n > MAX_WORDS) {
					cut = m.index ?? text.length;
					break;
				}
			}
			text = text.slice(0, cut);
			coverageNotes.push({
				source: "document",
				reason: `Only the first ${MAX_WORDS.toLocaleString()} words were checked`,
			});
		}
		const totalWords = countWords(text);
		if (totalWords < MIN_WORDS) {
			throw new AppError(
				params.file
					? "Not enough readable text in this file (at least 20 words are needed). For scanned images, make sure the text is clear."
					: "Paste at least 20 words to check.",
				HTTP_STATUS.BAD_REQUEST,
			);
		}

		// 2) Exclusions + fingerprints
		const prepared = prepareDocument(text, options);
		const { doc, checkedWords, excludedWords, excluded, inExcluded } = prepared;
		const contentHash = createHash("sha256")
			.update(text.toLowerCase().replace(/\s+/g, " "))
			.digest("hex");

		// 3) Candidates
		const want = new Set(options.sources);
		const phrases =
			want.has("internet") || want.has("publications")
				? pickQueryPhrases(
						text,
						inExcluded,
						Math.min(12, Math.max(4, Math.round(checkedWords / 120))),
					)
				: [];
		const [repo, external] = await Promise.all([
			want.has("repository")
				? repositoryCandidates({ doc, ownerId: user.id, contentHash })
				: Promise.resolve([] as CandidateSource[]),
			externalCandidates(phrases, {
				internet: want.has("internet"),
				publications: want.has("publications"),
			}),
		]);
		const checked = [
			...(want.has("repository") ? ["Institutional repository"] : []),
			...external.checked,
		];
		const candidates = [...repo, ...external.candidates];

		// 4) Align + attribute
		const scored = scoreDocument(prepared, candidates, options);
		const { sources, matches, exactWords, nearWords, byType } = scored;
		const matchedWords = scored.matchedWords;
		const similarity = scored.similarity;
		const title = (params.title?.trim() || params.file?.originalname || "Pasted text").slice(
			0,
			200,
		);

		let savedToRepository = false;
		if (options.saveToRepository) {
			savedToRepository = await saveToRepository({
				ownerId: user.id,
				title,
				filename: params.file?.originalname ?? null,
				text,
				contentHash,
				wordCount: totalWords,
				institutionName: user.institutionName ?? null,
				prepared: doc,
			}).catch((err) => {
				console.error("[Plagiarism] Failed to save to repository:", err);
				return false;
			});
		}

		const report: Omit<PlagiarismReportData, "id" | "createdAt"> = {
			title,
			filename: params.file?.originalname ?? null,
			similarity,
			band: bandFor(similarity),
			breakdown: {
				internet: round1((byType.internet / checkedWords) * 100),
				publications: round1((byType.publication / checkedWords) * 100),
				studentPapers: round1((byType.student_paper / checkedWords) * 100),
			},
			stats: {
				totalWords,
				checkedWords,
				matchedWords,
				excludedWords,
				exactWords,
				nearWords,
				sourcesCompared: candidates.length,
				processingMs: Date.now() - started,
			},
			settings: options,
			text,
			excluded,
			sources,
			matches,
			coverage: { checked, skipped: [...coverageNotes, ...external.skipped] },
			savedToRepository,
		};

		const saved = await prisma.plagiarismReport.create({
			data: {
				userId: user.id,
				title,
				filename: report.filename,
				similarity,
				band: report.band,
				result: JSON.stringify(report),
			},
			select: { id: true, createdAt: true },
		});
		return { ...report, id: saved.id, createdAt: saved.createdAt.toISOString() };
	} finally {
		running.delete(user.id);
	}
}

export async function listReports(userId: string) {
	return prisma.plagiarismReport.findMany({
		where: { userId },
		orderBy: { createdAt: "desc" },
		take: 100,
		select: {
			id: true,
			title: true,
			filename: true,
			similarity: true,
			band: true,
			createdAt: true,
		},
	});
}

export async function getReport(
	id: string,
	viewer: { id: string; role: string },
): Promise<PlagiarismReportData> {
	const row = await prisma.plagiarismReport.findUnique({ where: { id } });
	const staff = viewer.role === "faculty" || viewer.role === "admin";
	if (!row || (row.userId !== viewer.id && !staff)) {
		throw new AppError("Report not found.", HTTP_STATUS.NOT_FOUND);
	}
	const data = JSON.parse(row.result) as Omit<PlagiarismReportData, "id" | "createdAt">;
	return { ...data, id: row.id, createdAt: row.createdAt.toISOString() };
}
