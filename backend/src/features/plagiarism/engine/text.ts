/**
 * Text processing for the similarity engine: tokenisation with character
 * offsets (so matches can be highlighted in the original text), Turnitin-style
 * exclusions (quotes, bibliography) and a light stemmer for near-match
 * detection.
 */

export interface Token {
	/** Normalised form: lower-case, diacritics and apostrophes removed. */
	norm: string;
	start: number;
	end: number;
}

export interface Range {
	start: number;
	end: number;
}

const WORD_RE = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu;

export function normaliseWord(w: string): string {
	return w.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/['’]/g, "").toLowerCase();
}

export function tokenize(text: string): Token[] {
	const out: Token[] = [];
	for (const m of text.matchAll(WORD_RE)) {
		const start = m.index ?? 0;
		out.push({ norm: normaliseWord(m[0]), start, end: start + m[0].length });
	}
	return out;
}

export function countWords(text: string): number {
	let n = 0;
	for (const _ of text.matchAll(WORD_RE)) n++;
	return n;
}

/** Normalise line endings and strip control characters, keeping layout. */
export function cleanText(raw: string): string {
	return (
		raw
			.replace(/\r\n?/g, "\n")
			// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control chars
			.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
			.replace(/[ \t]+\n/g, "\n")
			.replace(/\n{4,}/g, "\n\n\n")
			.trim()
	);
}

/** Quoted passages ("..." or “...”), within a paragraph, up to ~120 words. */
export function findQuotedRanges(text: string): Range[] {
	const ranges: Range[] = [];
	const re = /["“]([^"“”\n]{3,800})["”]/g;
	for (const m of text.matchAll(re)) {
		const start = m.index ?? 0;
		ranges.push({ start, end: start + m[0].length });
	}
	return ranges;
}

/**
 * The bibliography/references section: from a heading like "References" or
 * "Works Cited" (in the latter part of the document) to the end.
 */
export function findBibliographyRange(text: string): Range | null {
	const re =
		/^[ \t]*(?:\d+[.)]?\s*)?(references|bibliography|works cited|literature cited|reference list|sources cited)[ \t]*:?[ \t]*$/gim;
	let last: RegExpExecArray | null = null;
	for (let m = re.exec(text); m; m = re.exec(text)) last = m;
	if (!last) return null;
	// Only treat it as the bibliography if it starts after the first 30% of the text.
	if (last.index < text.length * 0.3) return null;
	return { start: last.index, end: text.length };
}

export const STOPWORDS = new Set(
	"a about above after again against all am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves also may might must shall upon thus however therefore hence whereas within without via per et al".split(
		" ",
	),
);

/** Very small suffix-stripping stemmer, good enough for near-match detection. */
export function stem(w: string): string {
	if (w.length <= 3) return w;
	const rules: [RegExp, string][] = [
		[/ies$/, "y"],
		[/ied$/, "y"],
		[/(ss)es$/, "$1"],
		[/([^s])s$/, "$1"],
		[/ational$/, "ate"],
		[/tional$/, "tion"],
		[/ization$/, "ize"],
		[/isation$/, "ize"],
		[/ising$/, "ize"],
		[/izing$/, "ize"],
		[/ness$/, ""],
		[/ment$/, ""],
		[/fulness$/, "ful"],
		[/ously$/, "ous"],
		[/ively$/, "ive"],
		[/ly$/, ""],
		[/ingly$/, ""],
		[/ing$/, ""],
		[/edly$/, ""],
		[/ed$/, ""],
		[/er$/, ""],
		[/ation$/, "ate"],
	];
	let out = w;
	for (const [re, rep] of rules) {
		if (re.test(out)) {
			const next = out.replace(re, rep);
			if (next.length >= 3) out = next;
			break;
		}
	}
	return out;
}

export function isContentWord(norm: string): boolean {
	return norm.length > 1 && !STOPWORDS.has(norm) && !/^\d+$/.test(norm);
}

/** Split into sentences with their char ranges (for search-query selection). */
export function sentences(text: string): Array<Range & { text: string }> {
	const out: Array<Range & { text: string }> = [];
	const re = /[^.!?\n]+(?:[.!?]+|\n|$)/g;
	for (const m of text.matchAll(re)) {
		const t = m[0].trim();
		if (!t) continue;
		const start = (m.index ?? 0) + m[0].indexOf(t);
		out.push({ start, end: start + t.length, text: t });
	}
	return out;
}
