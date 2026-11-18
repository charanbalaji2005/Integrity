import { env } from "../../../config/env";
import { isContentWord, normaliseWord, sentences, tokenize } from "../engine/text";

/**
 * External candidate sources. Only short phrase queries (a few words) leave
 * the server, never the whole document; candidate texts are then compared
 * locally. No API keys are needed for Wikipedia or OpenAlex. Brave Search is
 * used only when BRAVE_SEARCH_API_KEY is set.
 */

export interface CandidateSource {
	id: string;
	type: "internet" | "publication" | "student_paper";
	title: string;
	url: string | null;
	detail: string | null;
	text: string;
}

const UA = "IntegrityOS-SimilarityChecker/1.0";
const REQUEST_TIMEOUT_MS = 7000;
const MAX_SOURCE_CHARS = 250_000;

// Small TTL cache so repeated checks don't re-download the same pages.
const cache = new Map<string, { at: number; value: unknown }>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
function cached<T>(key: string): T | undefined {
	const hit = cache.get(key);
	if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;
	if (hit) cache.delete(key);
	return undefined;
}
function remember(key: string, value: unknown) {
	if (cache.size > 400) cache.delete(cache.keys().next().value as string);
	cache.set(key, { at: Date.now(), value });
}

/** Hosts that answered 429 (rate limited) recently, so the report can say so. */
const rateLimited = new Map<string, number>();
function hostOf(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		return url;
	}
}
function isRateLimited(host: string): boolean {
	const at = rateLimited.get(host);
	return at !== undefined && Date.now() - at < 10 * 60 * 1000;
}

async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T | null> {
	const hit = cached<T>(url);
	if (hit !== undefined) return hit;
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
	try {
		const res = await fetch(url, {
			headers: { "User-Agent": UA, Accept: "application/json", ...headers },
			signal: ctrl.signal,
		});
		if (res.status === 429) rateLimited.set(hostOf(url), Date.now());
		if (!res.ok) return null;
		const data = (await res.json()) as T;
		remember(url, data);
		return data;
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

/** Run async jobs with a concurrency limit. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
	const out: R[] = new Array(items.length);
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, async () => {
			while (next < items.length) {
				const i = next++;
				out[i] = await fn(items[i]!);
			}
		}),
	);
	return out;
}

/**
 * Picks distinctive phrases to search for: long, content-rich sentences spread
 * across the document, trimmed to ~9 consecutive words (outside exclusions).
 */
export function pickQueryPhrases(
	text: string,
	isExcluded: (charPos: number) => boolean,
	max: number,
): string[] {
	const cands = sentences(text)
		.filter((s) => !isExcluded(s.start) && !isExcluded(s.end - 1))
		.map((s) => {
			const words = tokenize(s.text).map((t) => t.norm);
			const content = words.filter(isContentWord);
			const score =
				words.length >= 10
					? (content.length / words.length) * Math.min(words.length, 30) +
						content.reduce((a, w) => a + Math.min(w.length, 12), 0) / 12
					: 0;
			return { s, words, score };
		})
		.filter((c) => c.score > 0);
	if (cands.length === 0) return [];

	// Spread picks across the document: best sentence from each of `max` buckets.
	const buckets = Math.min(max, cands.length);
	const per = cands.length / buckets;
	const picks: string[] = [];
	for (let b = 0; b < buckets; b++) {
		const slice = cands.slice(Math.floor(b * per), Math.floor((b + 1) * per));
		const best = slice.sort((x, y) => y.score - x.score)[0];
		if (!best) continue;
		const raw = tokenize(best.s.text).map((t) => best.s.text.slice(t.start, t.end));
		const mid = Math.max(0, Math.floor(raw.length / 2) - 4);
		picks.push(raw.slice(mid, mid + 9).join(" "));
	}
	return [...new Set(picks)];
}

// ---------------------------------------------------------------- Wikipedia
async function wikipediaCandidates(phrases: string[]): Promise<CandidateSource[]> {
	const base = "https://en.wikipedia.org/w/api.php";
	const titles = new Set<string>();
	// Exact-phrase search catches verbatim copying; a couple of loose searches catch paraphrase.
	const queries = [...phrases.map((p) => `"${p}"`), ...phrases.slice(0, 3)];
	let answered = 0;
	await pool(queries, 4, async (q) => {
		const data = await fetchJson<{ query?: { search?: Array<{ title: string }> } }>(
			`${base}?action=query&list=search&format=json&srlimit=3&srsearch=${encodeURIComponent(q)}`,
		);
		if (data) answered++;
		for (const r of data?.query?.search ?? []) if (titles.size < 10) titles.add(r.title);
	});
	if (answered === 0) throw new Error("Wikipedia unreachable");
	const pages = await pool([...titles], 4, async (title) => {
		const data = await fetchJson<{
			query?: { pages?: Record<string, { title: string; extract?: string; fullurl?: string }> };
		}>(
			`${base}?action=query&prop=extracts|info&inprop=url&explaintext=1&exsectionformat=plain&format=json&redirects=1&titles=${encodeURIComponent(title)}`,
		);
		const page = Object.values(data?.query?.pages ?? {})[0];
		if (!page?.extract) return null;
		return {
			id: `wiki:${page.title}`,
			type: "internet" as const,
			title: `${page.title} – Wikipedia`,
			url:
				page.fullurl ??
				`https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
			detail: "Internet source · en.wikipedia.org",
			text: page.extract.slice(0, MAX_SOURCE_CHARS),
		};
	});
	return pages.filter((p): p is NonNullable<typeof p> => Boolean(p));
}

// ---------------------------------------------------------------- OpenAlex
interface OpenAlexWork {
	id: string;
	display_name?: string;
	doi?: string | null;
	publication_year?: number;
	abstract_inverted_index?: Record<string, number[]> | null;
	primary_location?: {
		source?: { display_name?: string } | null;
		landing_page_url?: string | null;
	} | null;
	authorships?: Array<{ author?: { display_name?: string } }>;
}

function rebuildAbstract(inv: Record<string, number[]>): string {
	const words: string[] = [];
	for (const [w, positions] of Object.entries(inv)) for (const p of positions) words[p] = w;
	return words.filter(Boolean).join(" ");
}

async function openAlexCandidates(phrases: string[]): Promise<CandidateSource[]> {
	const works = new Map<string, OpenAlexWork>();
	let answered = 0;
	// Each search costs OpenAlex credits; keep it to a few distinctive phrases.
	const key = env.OPENALEX_API_KEY ? `&api_key=${encodeURIComponent(env.OPENALEX_API_KEY)}` : "";
	await pool(phrases.slice(0, 4), 2, async (p) => {
		const data = await fetchJson<{ results?: OpenAlexWork[] }>(
			`https://api.openalex.org/works?per-page=3&search=${encodeURIComponent(p)}&select=id,display_name,doi,publication_year,abstract_inverted_index,primary_location,authorships${key}`,
		);
		if (data) answered++;
		for (const w of data?.results ?? [])
			if (works.size < 12 && w.abstract_inverted_index) works.set(w.id, w);
	});
	if (answered === 0) throw new Error("OpenAlex unreachable");
	return [...works.values()].map((w) => {
		const authors = (w.authorships ?? [])
			.slice(0, 3)
			.map((a) => a.author?.display_name)
			.filter(Boolean)
			.join(", ");
		const venue = w.primary_location?.source?.display_name;
		return {
			id: `openalex:${w.id}`,
			type: "publication" as const,
			title: w.display_name || "Untitled publication",
			url: w.doi || w.primary_location?.landing_page_url || w.id,
			detail: ["Publication", authors, venue, w.publication_year].filter(Boolean).join(" · "),
			text: `${w.display_name ?? ""}. ${rebuildAbstract(w.abstract_inverted_index ?? {})}`,
		};
	});
}

// ---------------------------------------------------------------- Brave (optional)
function htmlToText(html: string): string {
	return html
		.replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
		.replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, "\n")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/[ \t]+/g, " ")
		.replace(/\n\s*\n+/g, "\n\n")
		.trim();
}

async function fetchPageText(url: string): Promise<string | null> {
	const hit = cached<string>(`page:${url}`);
	if (hit !== undefined) return hit;
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
	try {
		const res = await fetch(url, {
			headers: { "User-Agent": UA, Accept: "text/html" },
			signal: ctrl.signal,
			redirect: "follow",
		});
		if (!res.ok || !(res.headers.get("content-type") || "").includes("text/html")) return null;
		const html = (await res.text()).slice(0, 1_500_000);
		const text = htmlToText(html).slice(0, MAX_SOURCE_CHARS);
		remember(`page:${url}`, text);
		return text;
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

async function braveCandidates(phrases: string[], key: string): Promise<CandidateSource[]> {
	const results = new Map<string, { url: string; title: string }>();
	await pool(phrases.slice(0, 6), 2, async (p) => {
		const data = await fetchJson<{ web?: { results?: Array<{ url: string; title: string }> } }>(
			`https://api.search.brave.com/res/v1/web/search?count=3&q=${encodeURIComponent(`"${p}"`)}`,
			{ "X-Subscription-Token": key },
		);
		for (const r of data?.web?.results ?? []) {
			if (results.size < 8 && !/wikipedia\.org/.test(r.url)) results.set(r.url, r);
		}
	});
	const pages = await pool([...results.values()], 3, async (r) => {
		const text = await fetchPageText(r.url);
		if (!text) return null;
		let host = r.url;
		try {
			host = new URL(r.url).hostname;
		} catch {
			/* keep url */
		}
		return {
			id: `web:${r.url}`,
			type: "internet" as const,
			title: r.title || host,
			url: r.url,
			detail: `Internet source · ${host}`,
			text,
		};
	});
	return pages.filter((p): p is NonNullable<typeof p> => Boolean(p));
}

export interface ExternalResult {
	candidates: CandidateSource[];
	skipped: Array<{ source: string; reason: string }>;
	checked: string[];
}

export async function externalCandidates(
	phrases: string[],
	want: { internet: boolean; publications: boolean },
): Promise<ExternalResult> {
	const skipped: ExternalResult["skipped"] = [];
	const checked: string[] = [];
	if (!env.PLAGIARISM_EXTERNAL_SEARCH) {
		if (want.internet)
			skipped.push({
				source: "internet",
				reason: "External search is disabled by the administrator",
			});
		if (want.publications)
			skipped.push({
				source: "publications",
				reason: "External search is disabled by the administrator",
			});
		return { candidates: [], skipped, checked };
	}
	if (phrases.length === 0) return { candidates: [], skipped, checked };

	const jobs: Promise<CandidateSource[]>[] = [];
	if (want.internet) {
		jobs.push(
			wikipediaCandidates(phrases).then((r) => {
				checked.push("Wikipedia");
				return r;
			}),
		);
		if (env.BRAVE_SEARCH_API_KEY) {
			jobs.push(
				braveCandidates(phrases, env.BRAVE_SEARCH_API_KEY).then((r) => {
					checked.push("Web (Brave Search)");
					return r;
				}),
			);
		}
	}
	if (want.publications) {
		jobs.push(
			openAlexCandidates(phrases).then((r) => {
				checked.push("OpenAlex publications");
				return r;
			}),
		);
	}
	const settled = await Promise.allSettled(jobs);
	const candidates = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));

	// If every external request failed, say so instead of implying the internet was clean.
	if (want.internet && !checked.includes("Wikipedia")) {
		skipped.push({
			source: "internet",
			reason: isRateLimited("en.wikipedia.org")
				? "Internet search is temporarily rate-limited; try again shortly"
				: "Internet sources could not be reached",
		});
	}
	if (want.publications && !checked.includes("OpenAlex publications")) {
		skipped.push({
			source: "publications",
			reason: isRateLimited("api.openalex.org")
				? "Publication database daily limit reached (add OPENALEX_API_KEY for a dedicated budget)"
				: "Publication database could not be reached",
		});
	}
	return { candidates, skipped, checked };
}

export { normaliseWord };
