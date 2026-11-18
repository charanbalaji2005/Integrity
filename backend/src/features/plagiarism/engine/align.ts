import { EXACT_K, NEAR_K, type PreparedText } from "./fingerprint";

export type MatchKind = "exact" | "near";

export interface Cover {
	kind: MatchKind;
	/** Corresponding token index in the source (for the comparison excerpt). */
	srcTok: number;
}

/**
 * Marks every document token that is part of a k-gram shared with the source.
 * Exact 5-word matches win over near (stem/stop-word-insensitive) matches.
 */
export function compareTexts(doc: PreparedText, src: PreparedText): Map<number, Cover> {
	const cover = new Map<number, Cover>();

	const srcExact = new Map<number, number>();
	src.exact.forEach((h, i) => {
		if (h !== null && !srcExact.has(h)) srcExact.set(h, i);
	});
	doc.exact.forEach((h, i) => {
		if (h === null) return;
		const s = srcExact.get(h);
		if (s === undefined) return;
		for (let j = 0; j < EXACT_K; j++) cover.set(i + j, { kind: "exact", srcTok: s + j });
	});

	const srcNear = new Map<number, number>();
	src.near.forEach((h, k) => {
		if (h !== 0 && !srcNear.has(h)) srcNear.set(h, k);
	});
	doc.near.forEach((h, k) => {
		if (h === 0) return;
		const m = srcNear.get(h);
		if (m === undefined) return;
		const from = doc.contentIdx[k]!;
		const to = doc.contentIdx[k + NEAR_K - 1]!;
		const srcFrom = src.contentIdx[m]!;
		for (let t = from; t <= to; t++) {
			if (!cover.has(t))
				cover.set(t, {
					kind: "near",
					srcTok: Math.min(srcFrom + (t - from), src.tokens.length - 1),
				});
		}
	});

	return cover;
}

export interface TokenSpan {
	from: number; // token index, inclusive
	to: number; // token index, inclusive
	kind: MatchKind;
}

/**
 * Groups covered tokens into spans, bridging gaps of up to `maxGap` tokens
 * (e.g. a changed word inside an otherwise copied sentence), and drops spans
 * shorter than `minWords`.
 */
export function buildSpans(
	covered: Set<number>,
	kindOf: (t: number) => MatchKind,
	minWords: number,
	maxGap = 2,
): TokenSpan[] {
	const idx = [...covered].sort((a, b) => a - b);
	const spans: TokenSpan[] = [];
	let cur: { from: number; to: number; exact: number; total: number } | null = null;
	for (const t of idx) {
		if (cur && t - cur.to <= maxGap + 1) {
			cur.to = t;
		} else {
			if (cur) spans.push(finish(cur));
			cur = { from: t, to: t, exact: 0, total: 0 };
		}
		cur.total++;
		if (kindOf(t) === "exact") cur.exact++;
	}
	if (cur) spans.push(finish(cur));
	return spans.filter((s) => s.to - s.from + 1 >= minWords);

	function finish(c: { from: number; to: number; exact: number; total: number }): TokenSpan {
		return { from: c.from, to: c.to, kind: c.exact / c.total >= 0.6 ? "exact" : "near" };
	}
}
