import { describe, expect, it } from "vitest";
import { parseSyllabusText } from "./syllabus-parser";

describe("parseSyllabusText", () => {
	it("extracts roman-numbered units with comma separated topics", () => {
		const text = `Course: Data Structures
UNIT I: Introduction
Abstract data types, asymptotic notation; arrays and linked lists
UNIT II - Trees
Binary trees, AVL trees, B-trees
Text Books
1. Cormen et al.`;
		const units = parseSyllabusText(text);
		expect(units).toHaveLength(2);
		expect(units[0]).toEqual({
			number: 1,
			title: "Introduction",
			topics: ["Abstract data types", "asymptotic notation", "arrays and linked lists"],
		});
		expect(units[1].title).toBe("Trees");
		expect(units[1].topics).toEqual(["Binary trees", "AVL trees", "B-trees"]);
	});

	it("handles bullet lines, module headings and hour annotations", () => {
		const text = `Module 1 Sorting (8 hours)
• Bubble sort
• Merge sort
Module-2: Graphs
- BFS and DFS
- Shortest paths`;
		const units = parseSyllabusText(text);
		expect(units.map((u) => u.number)).toEqual([1, 2]);
		expect(units[0].title).toBe("Sorting");
		expect(units[0].topics).toEqual(["Bubble sort", "Merge sort"]);
		expect(units[1].topics).toEqual(["BFS and DFS", "Shortest paths"]);
	});

	it("splits inline topic lists out of the heading", () => {
		const units = parseSyllabusText("Unit 3: Hashing – open addressing, chaining, rehashing");
		expect(units[0].title).toBe("Hashing");
		expect(units[0].topics).toEqual(["open addressing", "chaining", "rehashing"]);
	});

	it("returns nothing for text without unit headings", () => {
		expect(parseSyllabusText("Just a paragraph about the course.")).toEqual([]);
		expect(parseSyllabusText("")).toEqual([]);
	});

	it("keeps the first occurrence when a table of contents repeats headings", () => {
		const units = parseSyllabusText("Unit 1 Basics\nVariables, loops\nUnit 1 Basics\nRepeat");
		expect(units).toHaveLength(1);
		expect(units[0].topics).toEqual(["Variables", "loops"]);
	});
});
