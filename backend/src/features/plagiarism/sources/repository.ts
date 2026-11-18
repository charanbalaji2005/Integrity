import { prisma } from "../../../database";
import { type PreparedText, prepare, winnow } from "../engine/fingerprint";
import { countWords } from "../engine/text";
import type { CandidateSource } from "./external";

/**
 * Institutional repository candidates: previously checked documents (found
 * through the indexed fingerprint table) and students' exam answers.
 * Other students are never named; matches show the institution and date only,
 * like Turnitin's "Submitted to <institution>".
 */

const MAX_REPOSITORY_CANDIDATES = 25;
const MAX_ANSWERS_SCANNED = 4000;

function fmtDate(d: Date | null | undefined): string {
	return d ? d.toISOString().slice(0, 10) : "";
}

export async function repositoryCandidates(params: {
	doc: PreparedText;
	ownerId: string;
	contentHash: string;
}): Promise<CandidateSource[]> {
	const { doc, ownerId, contentHash } = params;
	const out: CandidateSource[] = [];

	// 1) Stored documents via winnowed fingerprints (index lookup, scales to large repositories).
	const hashes = winnow(doc.exact);
	const counts = new Map<string, number>();
	for (let i = 0; i < hashes.length; i += 3000) {
		const rows = await prisma.plagiarismFingerprint.groupBy({
			by: ["documentId"],
			where: { hash: { in: hashes.slice(i, i + 3000) } },
			_count: { _all: true },
		});
		for (const r of rows) counts.set(r.documentId, (counts.get(r.documentId) ?? 0) + r._count._all);
	}
	const ranked = [...counts.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]);
	if (ranked.length > 0) {
		const docs = await prisma.plagiarismDocument.findMany({
			where: { id: { in: ranked.slice(0, MAX_REPOSITORY_CANDIDATES * 2).map(([id]) => id) } },
			select: {
				id: true,
				ownerId: true,
				contentHash: true,
				text: true,
				institutionName: true,
				createdAt: true,
			},
		});
		for (const d of docs) {
			// A student re-checking the same file shouldn't match their own earlier copy.
			if (d.ownerId === ownerId && d.contentHash === contentHash) continue;
			const own = d.ownerId === ownerId;
			out.push({
				id: `repo:${d.id}`,
				type: "student_paper",
				title: own
					? "Your earlier submission"
					: `Submitted to ${d.institutionName || "this institution"}`,
				url: null,
				detail: `Student paper · ${own ? "your own earlier submission" : "institutional repository"} · ${fmtDate(d.createdAt)}`,
				text: d.text,
			});
			if (out.length >= MAX_REPOSITORY_CANDIDATES) break;
		}
	}

	// 2) Exam answers written by other students (quick pre-filter by shared k-grams).
	const docExact = new Set(doc.exact.filter((h): h is number => h !== null));
	const docNear = new Set(doc.near.filter((h) => h !== 0));
	const answers = await prisma.answer.findMany({
		where: { attempt: { studentId: { not: ownerId } } },
		select: {
			id: true,
			response: true,
			attempt: {
				select: {
					submittedAt: true,
					assessment: { select: { title: true, institutionName: true } },
				},
			},
		},
		take: MAX_ANSWERS_SCANNED,
		orderBy: { id: "desc" },
	});
	for (const a of answers) {
		if (!a.response || countWords(a.response) < 15) continue;
		const prepared = prepare(a.response);
		const overlaps =
			prepared.exact.some((h) => h !== null && docExact.has(h)) ||
			prepared.near.some((h) => h !== 0 && docNear.has(h));
		if (!overlaps) continue;
		out.push({
			id: `answer:${a.id}`,
			type: "student_paper",
			title: `Submitted to ${a.attempt.assessment.institutionName || "this institution"}`,
			url: null,
			detail: `Student exam answer · ${a.attempt.assessment.title} · ${fmtDate(a.attempt.submittedAt)}`,
			text: a.response,
		});
	}
	return out;
}

/** Adds a checked document to the repository (skips exact duplicates by the same owner). */
export async function saveToRepository(params: {
	ownerId: string;
	title: string;
	filename: string | null;
	text: string;
	contentHash: string;
	wordCount: number;
	institutionName: string | null;
	prepared: PreparedText;
}): Promise<boolean> {
	const existing = await prisma.plagiarismDocument.findFirst({
		where: { ownerId: params.ownerId, contentHash: params.contentHash },
		select: { id: true },
	});
	if (existing) return true;
	const doc = await prisma.plagiarismDocument.create({
		data: {
			ownerId: params.ownerId,
			title: params.title,
			filename: params.filename,
			text: params.text,
			contentHash: params.contentHash,
			wordCount: params.wordCount,
			institutionName: params.institutionName,
		},
		select: { id: true },
	});
	const hashes = winnow(params.prepared.exact);
	for (let i = 0; i < hashes.length; i += 5000) {
		await prisma.plagiarismFingerprint.createMany({
			data: hashes.slice(i, i + 5000).map((hash) => ({ hash, documentId: doc.id })),
			skipDuplicates: true,
		});
	}
	return true;
}
