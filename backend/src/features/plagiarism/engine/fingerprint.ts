import { isContentWord, stem, type Token, tokenize } from "./text";

/** Words per shingle for exact matching (Turnitin/MOSS-style k-grams). */
export const EXACT_K = 5;
/** Content-word stems per shingle for near (light-paraphrase) matching. */
export const NEAR_K = 4;
/** Winnowing window used to pick representative fingerprints for the index. */
export const WINNOW_W = 4;

/** 32-bit FNV-1a, returned as a signed int (fits Postgres int4). */
export function fnv1a(s: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h | 0;
}

/** Pre-processed text ready for comparison. */
export interface PreparedText {
	tokens: Token[];
	/** Hash of the exact k-gram starting at token i (or null if not countable). */
	exact: Array<number | null>;
	/** Indices (into tokens) of content words, and the near k-gram hash starting at each. */
	contentIdx: number[];
	near: number[];
}

/**
 * Prepares a text. `blocked[i] === true` marks tokens that must not take part
 * in matching (e.g. excluded quotes/bibliography); shingles spanning them are
 * dropped so exclusions also break matches.
 */
export function prepare(text: string, blocked?: boolean[]): PreparedText {
	const tokens = tokenize(text);
	const exact: Array<number | null> = new Array(tokens.length).fill(null);
	for (let i = 0; i + EXACT_K <= tokens.length; i++) {
		let ok = true;
		let key = "";
		for (let j = 0; j < EXACT_K; j++) {
			if (blocked?.[i + j]) {
				ok = false;
				break;
			}
			key += (j ? " " : "") + tokens[i + j]!.norm;
		}
		if (ok) exact[i] = fnv1a(key);
	}

	const contentIdx: number[] = [];
	const stems: string[] = [];
	tokens.forEach((t, i) => {
		if (!blocked?.[i] && isContentWord(t.norm)) {
			contentIdx.push(i);
			stems.push(stem(t.norm));
		}
	});
	const near: number[] = [];
	for (let i = 0; i + NEAR_K <= stems.length; i++) {
		// Don't let a near-gram jump across a large gap (e.g. across an excluded block).
		if (contentIdx[i + NEAR_K - 1]! - contentIdx[i]! > NEAR_K * 4) {
			near.push(0);
			continue;
		}
		near.push(fnv1a(`~${stems.slice(i, i + NEAR_K).join(" ")}`));
	}
	return { tokens, exact, contentIdx, near };
}

/** Winnowing (Schleimer et al.): the minimum hash in each window of W k-grams. */
export function winnow(hashes: Array<number | null>, w = WINNOW_W): number[] {
	const valid = hashes.filter((h): h is number => h !== null);
	if (valid.length <= w) return [...new Set(valid)];
	const picked = new Set<number>();
	for (let i = 0; i + w <= valid.length; i++) {
		let min = valid[i]!;
		for (let j = 1; j < w; j++) if (valid[i + j]! < min) min = valid[i + j]!;
		picked.add(min);
	}
	return [...picked];
}
