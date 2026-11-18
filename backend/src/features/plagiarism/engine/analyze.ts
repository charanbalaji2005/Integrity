import { buildSpans, type Cover, compareTexts, type MatchKind } from "./align";
import { type PreparedText, prepare } from "./fingerprint";
import { countWords, findBibliographyRange, findQuotedRanges, type Range } from "./text";

/** A candidate text to compare against (repository paper, web page, publication…). */
export interface EngineSource {
	id: string;
	type: "internet" | "publication" | "student_paper";
	title: string;
	url: string | null;
	detail: string | null;
	text: string;
}

export interface EngineOptions {
	excludeQuotes: boolean;
	excludeBibliography: boolean;
	minMatchWords: number;
}

export interface PreparedDocument {
	text: string;
	doc: PreparedText;
	totalWords: number;
	checkedWords: number;
	excludedWords: number;
	excluded: Array<{ start: number; end: number; reason: "quote" | "bibliography" }>;
	inExcluded: (pos: number) => boolean;
}

export interface EngineSourceResult {
	id: string;
	rank: number;
	type: EngineSource["type"];
	title: string;
	url: string | null;
	detail: string | null;
	percent: number;
	matchedWords: number;
}

export interface EngineMatch {
	id: string;
	sourceId: string;
	start: number;
	end: number;
	words: number;
	kind: MatchKind;
	sourceExcerpt: string;
}

export interface EngineResult {
	sources: EngineSourceResult[];
	matches: EngineMatch[];
	exactWords: number;
	nearWords: number;
	matchedWords: number;
	similarity: number;
	byType: { internet: number; publication: number; student_paper: number };
}

function round1(n: number): number {
	return Math.round(n * 10) / 10;
}

/** Applies Turnitin-style exclusions and fingerprints the document. */
export function prepareDocument(
	text: string,
	options: Pick<EngineOptions, "excludeQuotes" | "excludeBibliography">,
): PreparedDocument {
	const totalWords = countWords(text);
	// 2) Exclusions
	const excluded: PreparedDocument["excluded"] = [];
	if (options.excludeBibliography) {
		const bib = findBibliographyRange(text);
		if (bib) excluded.push({ ...bib, reason: "bibliography" });
	}
	if (options.excludeQuotes) {
		for (const q of findQuotedRanges(text)) {
			if (!excluded.some((e) => q.start >= e.start && q.start < e.end))
				excluded.push({ ...q, reason: "quote" });
		}
	}
	excluded.sort((a, b) => a.start - b.start);
	const inExcluded = (pos: number) => excluded.some((e: Range) => pos >= e.start && pos < e.end);

	const probe = prepare(text);
	const blocked = probe.tokens.map((t) => inExcluded(t.start));
	const doc = prepare(text, blocked);
	const checkedWords = blocked.filter((b) => !b).length;
	const excludedWords = totalWords - checkedWords;
	return { text, doc, totalWords, checkedWords, excludedWords, excluded, inExcluded };
}

/**
 * Aligns the document with every candidate, attributes each matched word to a
 * single primary source (largest overlap first, so percentages add up) and
 * returns sources + highlighted matches. Similarity = matched / checked words.
 */
export function scoreDocument(
	prepared: PreparedDocument,
	candidates: EngineSource[],
	options: Pick<EngineOptions, "minMatchWords">,
): EngineResult {
	const { doc, checkedWords } = prepared;
	// 4) Align each candidate with the document
	const compared = candidates
		.map((source) => {
			const prepared = prepare(source.text);
			const cover = compareTexts(doc, prepared);
			return { source, prepared, cover };
		})
		.filter((c) => c.cover.size >= options.minMatchWords);

	// Primary-source attribution: largest overlap claims its words first.
	compared.sort((a, b) => b.cover.size - a.cover.size);
	const owner = new Map<number, number>(); // doc token -> compared index
	compared.forEach((c, ci) => {
		for (const t of c.cover.keys()) if (!owner.has(t)) owner.set(t, ci);
	});

	interface Built {
		source: EngineSource;
		spans: Array<{ from: number; to: number; kind: MatchKind; cover: Map<number, Cover> }>;
		words: number;
		srcTokens: ReturnType<typeof prepare>["tokens"];
	}
	const built: Built[] = [];
	const claimed = new Set<number>();
	compared.forEach((c, ci) => {
		const mine = new Set([...owner.entries()].filter(([, o]) => o === ci).map(([t]) => t));
		// Never let a bridged gap re-claim words already owned by a bigger source:
		// split spans around claimed words and keep the pieces that are still long enough.
		const kindOf = (t: number) => c.cover.get(t)?.kind ?? "near";
		const spans = buildSpans(mine, kindOf, options.minMatchWords).flatMap((s) => {
			const pieces: Array<{ from: number; to: number; kind: MatchKind }> = [];
			let from = -1;
			for (let t = s.from; t <= s.to + 1; t++) {
				const free = t <= s.to && !claimed.has(t);
				if (free && from < 0) from = t;
				if (!free && from >= 0) {
					if (t - from >= options.minMatchWords) {
						let exact = 0;
						for (let k = from; k < t; k++) if (kindOf(k) === "exact") exact++;
						pieces.push({ from, to: t - 1, kind: exact / (t - from) >= 0.6 ? "exact" : "near" });
					}
					from = -1;
				}
			}
			return pieces;
		});
		if (spans.length === 0) return;
		for (const s of spans) for (let t = s.from; t <= s.to; t++) claimed.add(t);
		built.push({
			source: c.source,
			spans: spans.map((s) => ({ ...s, cover: c.cover })),
			words: spans.reduce((a, s) => a + (s.to - s.from + 1), 0),
			srcTokens: c.prepared.tokens,
		});
	});
	built.sort((a, b) => b.words - a.words);

	// 5) Report
	const sources: EngineSourceResult[] = [];
	const matches: EngineMatch[] = [];
	let exactWords = 0;
	let nearWords = 0;
	const byType = { internet: 0, publication: 0, student_paper: 0 };
	built.forEach((b, i) => {
		const id = `s${i + 1}`;
		sources.push({
			id,
			rank: i + 1,
			type: b.source.type,
			title: b.source.title,
			url: b.source.url,
			detail: b.source.detail,
			percent: round1((b.words / checkedWords) * 100),
			matchedWords: b.words,
		});
		byType[b.source.type] += b.words;
		for (const s of b.spans) {
			const words = s.to - s.from + 1;
			if (s.kind === "exact") exactWords += words;
			else nearWords += words;
			const srcIdx: number[] = [];
			for (let t = s.from; t <= s.to; t++) {
				const c = s.cover.get(t);
				if (c) srcIdx.push(c.srcTok);
			}
			const sFrom = Math.max(0, Math.min(...srcIdx));
			const sTo = Math.min(b.srcTokens.length - 1, Math.max(...srcIdx));
			const startChar = b.srcTokens[sFrom]?.start ?? 0;
			const endChar = b.srcTokens[sTo]?.end ?? startChar;
			let excerpt = b.source.text
				.slice(startChar, Math.min(endChar, startChar + 900))
				.replace(/\s+/g, " ")
				.trim();
			if (startChar > 0) excerpt = `…${excerpt}`;
			if (endChar < b.source.text.length) excerpt = `${excerpt}…`;
			matches.push({
				id: `m${matches.length + 1}`,
				sourceId: id,
				start: doc.tokens[s.from]!.start,
				end: doc.tokens[s.to]!.end,
				words,
				kind: s.kind,
				sourceExcerpt: excerpt,
			});
		}
	});
	matches.sort((a, b) => a.start - b.start);
	matches.forEach((m, i) => {
		m.id = `m${i + 1}`;
	});

	const matchedWords = exactWords + nearWords;
	const similarity = checkedWords > 0 ? Math.round((matchedWords / checkedWords) * 100) : 0;
	return { sources, matches, exactWords, nearWords, matchedWords, similarity, byType };
}
