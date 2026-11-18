import { describe, expect, it } from "vitest";
import { type EngineSource, prepareDocument, scoreDocument } from "../engine/analyze";
import { countWords } from "../engine/text";

const SOURCE_A =
	"Photosynthesis is the process by which green plants and certain other organisms transform light energy into chemical energy. During photosynthesis in green plants, light energy is captured and used to convert water, carbon dioxide, and minerals into oxygen and energy-rich organic compounds.";
const SOURCE_B =
	"The French Revolution was a period of political and societal change in France that began with the Estates General of 1789 and ended with the coup of 18 Brumaire in November 1799 and the formation of the French Consulate.";
const ORIGINAL =
	"My grandmother kept a small vegetable garden behind her kitchen, and every summer we picked tomatoes, beans and chillies together while she told stories about the village where she grew up.";

const src = (id: string, text: string, type: EngineSource["type"] = "internet"): EngineSource => ({
	id,
	type,
	title: id,
	url: null,
	detail: null,
	text,
});
const opts = { excludeQuotes: true, excludeBibliography: true, minMatchWords: 8 };

function check(text: string, sources: EngineSource[], o = opts) {
	return scoreDocument(prepareDocument(text, o), sources, o);
}

describe("similarity engine", () => {
	it("scores a verbatim copy at ~100% against the copied source", () => {
		const r = check(SOURCE_A, [src("A", SOURCE_A), src("B", SOURCE_B)]);
		expect(r.similarity).toBeGreaterThanOrEqual(95);
		expect(r.sources).toHaveLength(1);
		expect(r.sources[0]!.title).toBe("A");
		expect(r.matches.every((m) => m.kind === "exact")).toBe(true);
	});

	it("scores original writing at 0%", () => {
		const r = check(ORIGINAL, [src("A", SOURCE_A), src("B", SOURCE_B)]);
		expect(r.similarity).toBe(0);
		expect(r.matches).toHaveLength(0);
	});

	it("reports the copied share and attributes passages to their own sources", () => {
		const text = `${ORIGINAL} ${SOURCE_A} ${SOURCE_B}`;
		const r = check(text, [src("A", SOURCE_A, "internet"), src("B", SOURCE_B, "publication")]);
		const total = (ORIGINAL + SOURCE_A + SOURCE_B).split(/\s+/).length;
		const expected = Math.round(((total - ORIGINAL.split(/\s+/).length) / total) * 100);
		expect(Math.abs(r.similarity - expected)).toBeLessThanOrEqual(6);
		expect(r.sources.map((s) => s.title).sort()).toEqual(["A", "B"]);
		// per-source percentages add up to the overall score (±rounding)
		const sum = r.sources.reduce((a, s) => a + s.percent, 0);
		expect(Math.abs(sum - r.similarity)).toBeLessThanOrEqual(2);
		expect(r.byType.publication).toBeGreaterThan(0);
	});

	it("highlights the right characters", () => {
		const text = `${ORIGINAL} ${SOURCE_B}`;
		const r = check(text, [src("B", SOURCE_B)]);
		const first = r.matches[0]!;
		expect(text.slice(first.start, first.end).startsWith("The French Revolution")).toBe(true);
		expect(first.sourceExcerpt).toContain("French Revolution");
	});

	it("detects light paraphrase (changed small words and endings) as a near match", () => {
		const paraphrased =
			"Photosynthesis is a process through which green plant and some other organism transforms light energies into chemical energy. In photosynthesis of green plants, the light energy gets captured and is used for converting water, carbon dioxide and mineral into oxygen and energy-rich organic compound.";
		const r = check(paraphrased, [src("A", SOURCE_A)]);
		expect(r.similarity).toBeGreaterThan(40);
		expect(r.nearWords).toBeGreaterThan(0);
	});

	it("excludes quoted passages when asked, and counts them when not", () => {
		const text = `${ORIGINAL} As the textbook puts it, "${SOURCE_B}" That is the definition we use.`;
		const withExclusion = check(text, [src("B", SOURCE_B)]);
		expect(withExclusion.similarity).toBe(0);
		const without = check(text, [src("B", SOURCE_B)], { ...opts, excludeQuotes: false });
		expect(without.similarity).toBeGreaterThan(30);
	});

	it("excludes the bibliography section", () => {
		const essay = `${ORIGINAL} ${ORIGINAL.replace("grandmother", "grandfather")} ${ORIGINAL.replace("summer", "winter")}`;
		const text = `${essay}\n\nReferences\n${SOURCE_B}`;
		const prepared = prepareDocument(text, opts);
		expect(prepared.excluded.some((e) => e.reason === "bibliography")).toBe(true);
		expect(scoreDocument(prepared, [src("B", SOURCE_B)], opts).similarity).toBe(0);
	});

	it("ignores matches shorter than the minimum word count", () => {
		const text = `${ORIGINAL} It ended with the coup of 18 Brumaire, which everyone remembers.`;
		const strict = check(text, [src("B", SOURCE_B)], { ...opts, minMatchWords: 8 });
		expect(strict.similarity).toBe(0);
		const loose = check(text, [src("B", SOURCE_B)], { ...opts, minMatchWords: 5 });
		expect(loose.similarity).toBeGreaterThan(0);
	});

	it("never double-counts words matched by two sources", () => {
		const r = check(SOURCE_A, [src("A1", SOURCE_A), src("A2", SOURCE_A)]);
		expect(r.sources).toHaveLength(1);
		expect(r.matchedWords).toBeLessThanOrEqual(countWords(SOURCE_A));
	});
});
