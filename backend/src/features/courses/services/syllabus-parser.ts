/**
 * Heuristic syllabus structure extraction.
 *
 * University syllabi almost always group content under headings such as
 * "UNIT I: Introduction", "Unit-2 Trees and Graphs" or "Module 3 – Sorting".
 * Topics follow as comma/semicolon separated phrases or bullet lines until the
 * next heading. Anything we cannot recognise is left for the faculty member to
 * add manually in the builder, so the parser favours precision over recall.
 */

export interface ParsedUnit {
	number: number;
	title: string;
	topics: string[];
}

const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 };

function romanToInt(roman: string): number | null {
	const s = roman.toLowerCase();
	if (!/^[ivxlc]+$/.test(s)) return null;
	let total = 0;
	for (let i = 0; i < s.length; i++) {
		const cur = ROMAN[s[i]];
		const next = ROMAN[s[i + 1]] ?? 0;
		total += cur < next ? -cur : cur;
	}
	return total > 0 && total <= 40 ? total : null;
}

const HEADING =
	/^\s*(?:unit|module|chapter|part)\s*[-–—:.]?\s*([ivxlc]+|\d{1,2})\b\s*[-–—:.)]*\s*(.*)$/i;

/** Lines that are syllabus boilerplate rather than topics. */
const NOISE =
	/^(?:text\s*books?|reference\s*books?|references|course\s*outcomes?|outcomes|co\d|po\d|total\s*(?:hours|periods)|(?:\d+\s*)?(?:hours|hrs|periods|lectures)\b|l\s*t\s*p\s*c|credits?|prerequisites?|assessment|evaluation|suggested\s*readings?)/i;

const MAX_UNITS = 30;
const MAX_TOPICS_PER_UNIT = 40;

function cleanTopic(raw: string): string {
	return raw
		.replace(/^[\s•●▪◦*·\-–—>]+/, "")
		.replace(/^\(?[a-z0-9]{1,2}[.)]\s+/i, "")
		.replace(/\(\s*\d+\s*(?:hours|hrs|periods|h)\s*\)/gi, "")
		.replace(/\s+/g, " ")
		.replace(/[\s.;:,]+$/, "")
		.trim();
}

function splitTopics(block: string): string[] {
	const lines = block
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean);
	const out: string[] = [];
	for (const line of lines) {
		if (NOISE.test(line)) break; // anything after "Text books" etc. is not a topic
		const parts = /[,;]/.test(line) ? line.split(/[;,]/) : [line];
		for (const p of parts) {
			const t = cleanTopic(p);
			if (t.length >= 3 && t.length <= 160 && /[a-z]/i.test(t) && !NOISE.test(t)) out.push(t);
		}
	}
	// De-duplicate case-insensitively while preserving order.
	const seen = new Set<string>();
	return out
		.filter((t) => {
			const k = t.toLowerCase();
			if (seen.has(k)) return false;
			seen.add(k);
			return true;
		})
		.slice(0, MAX_TOPICS_PER_UNIT);
}

export function parseSyllabusText(text: string): ParsedUnit[] {
	if (!text?.trim()) return [];
	const lines = text.replace(/ /g, " ").split(/\r?\n/);

	const headings: { line: number; number: number; title: string }[] = [];
	lines.forEach((line, idx) => {
		const m = line.match(HEADING);
		if (!m) return;
		const num = /^\d+$/.test(m[1]) ? Number(m[1]) : romanToInt(m[1]);
		if (!num) return;
		headings.push({ line: idx, number: num, title: cleanTopic(m[2] || "") });
	});
	if (headings.length === 0) return [];

	const units: ParsedUnit[] = [];
	const seenNumbers = new Set<number>();
	headings.forEach((h, i) => {
		// Table-of-contents style repeats ("Unit 1 ... Unit 1") keep the first body occurrence.
		if (seenNumbers.has(h.number)) return;
		const end = i + 1 < headings.length ? headings[i + 1].line : lines.length;
		let title = h.title;
		let body = lines.slice(h.line + 1, end).join("\n");
		// A heading with an inline topic list ("Unit 1: Intro – a, b, c") keeps the
		// first phrase as the title and the rest as topics.
		const inline = title.match(/^(.{3,80}?)\s*[-–—:]\s+(.+[,;].+)$/);
		if (inline) {
			title = inline[1].trim();
			body = `${inline[2]}\n${body}`;
		} else if (/[,;]/.test(title) && title.length > 60) {
			body = `${title}\n${body}`;
			title = "";
		}
		const topics = splitTopics(body);
		if (!title && topics.length === 0) return;
		seenNumbers.add(h.number);
		units.push({ number: h.number, title: title || `Unit ${h.number}`, topics });
	});

	return units.sort((a, b) => a.number - b.number).slice(0, MAX_UNITS);
}
