import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { extractPptxText, readZipEntries } from "../services/attachments";

/** Builds a ZIP archive in memory (deflate or stored entries) for the tests. */
function zip(files: Record<string, string>, store = false): Buffer {
	const locals: Buffer[] = [];
	const centrals: Buffer[] = [];
	let offset = 0;
	for (const [name, text] of Object.entries(files)) {
		const raw = Buffer.from(text, "utf8");
		const data = store ? raw : deflateRawSync(raw);
		const nameBuf = Buffer.from(name, "utf8");
		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(store ? 0 : 8, 8);
		local.writeUInt32LE(data.length, 18);
		local.writeUInt32LE(raw.length, 22);
		local.writeUInt16LE(nameBuf.length, 26);
		const central = Buffer.alloc(46);
		central.writeUInt32LE(0x02014b50, 0);
		central.writeUInt16LE(store ? 0 : 8, 10);
		central.writeUInt32LE(data.length, 20);
		central.writeUInt32LE(raw.length, 24);
		central.writeUInt16LE(nameBuf.length, 28);
		central.writeUInt32LE(offset, 42);
		locals.push(local, nameBuf, data);
		centrals.push(central, nameBuf);
		offset += 30 + nameBuf.length + data.length;
	}
	const cd = Buffer.concat(centrals);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(Object.keys(files).length, 8);
	end.writeUInt16LE(Object.keys(files).length, 10);
	end.writeUInt32LE(cd.length, 12);
	end.writeUInt32LE(offset, 16);
	return Buffer.concat([...locals, cd, end]);
}

const slide = (...paras: string[]) =>
	`<p:sld xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree>${paras
		.map((t) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`)
		.join("")}</p:spTree></p:cSld></p:sld>`;

describe("readZipEntries", () => {
	it("reads deflated and stored entries, filtered by name", () => {
		expect(
			readZipEntries(zip({ "a.xml": "deflated", "b.bin": "skip" }), (n) => n.endsWith(".xml")),
		).toEqual({ "a.xml": "deflated" });
		expect(readZipEntries(zip({ "s.txt": "stored" }, true), () => true)).toEqual({
			"s.txt": "stored",
		});
	});

	it("caps decompressed size (zip bomb)", () => {
		const bomb = zip({ "big.xml": "A".repeat(9 * 1024 * 1024) });
		expect(() => readZipEntries(bomb, () => true)).toThrow();
	});
});

describe("extractPptxText", () => {
	it("returns slide text in numeric slide order with speaker notes", () => {
		const file = zip({
			"ppt/slides/slide10.xml": slide("Ten"),
			"ppt/slides/slide2.xml": slide("Two &amp; more", "Second line"),
			"ppt/slides/slide1.xml": slide("Intro to AVL trees"),
			"ppt/notesSlides/notesSlide1.xml": slide("Mention rotations", "1"),
			"ppt/presentation.xml": "<x/>",
		});
		const text = extractPptxText(file);
		expect(text.indexOf("Slide 1")).toBeLessThan(text.indexOf("Slide 2"));
		expect(text.indexOf("Slide 2")).toBeLessThan(text.indexOf("Slide 10"));
		expect(text).toContain("Two & more\nSecond line");
		expect(text).toContain("[Speaker notes] Mention rotations");
	});

	it("rejects files that are not zip archives", () => {
		expect(() => extractPptxText(Buffer.from("not a zip at all, definitely not"))).toThrow(
			/could not be opened/,
		);
	});
});
