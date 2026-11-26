import { describe, expect, it } from "vitest";
import { classify, normalizeResult } from "../services/judge0-client";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

describe("classify (Judge0 status → verdict)", () => {
	it("returns null while the run is queued or processing", () => {
		expect(classify(1, "", null, 262144, "c")).toBeNull();
		expect(classify(2, "", null, 262144, "c")).toBeNull();
	});

	it("treats Accepted and Wrong Answer statuses as a finished, successful run", () => {
		// We compare outputs ourselves, so Judge0's own WA (4) still means "ran cleanly".
		expect(classify(3, "", 1000, 262144, "cpp")).toBe("accepted");
		expect(classify(4, "", 1000, 262144, "cpp")).toBe("accepted");
	});

	it("maps time limit, compile error and internal errors", () => {
		expect(classify(5, "", null, 262144, "java")).toBe("time_limit");
		expect(classify(6, "", null, 262144, "c")).toBe("compilation_error");
		expect(classify(13, "", null, 262144, "c")).toBe("infra_error");
		expect(classify(14, "", null, 262144, "c")).toBe("infra_error");
	});

	it("reports Python syntax errors as compilation errors, not runtime errors", () => {
		for (const err of [
			"SyntaxError: invalid syntax",
			"IndentationError: unexpected indent",
			"TabError: inconsistent use",
		]) {
			expect(classify(11, err, null, 65536, "python")).toBe("compilation_error");
		}
		// The same text from a compiled language is just a runtime error.
		expect(classify(11, "SyntaxError: invalid syntax", null, 65536, "c")).toBe("runtime_error");
	});

	it("detects memory limit by usage (≥95% of limit) or by out-of-memory messages", () => {
		expect(classify(11, "", 250_000, 262144, "c")).toBe("memory_limit");
		expect(classify(11, "", 100_000, 262144, "c")).toBe("runtime_error");
		expect(classify(11, "java.lang.OutOfMemoryError: Java heap space", null, 262144, "java")).toBe(
			"memory_limit",
		);
		expect(classify(11, "MemoryError", null, 65536, "python")).toBe("memory_limit");
		expect(
			classify(
				11,
				"terminate called after throwing an instance of 'std::bad_alloc'",
				null,
				65536,
				"cpp",
			),
		).toBe("memory_limit");
	});

	it("treats unknown status ids as infrastructure errors", () => {
		expect(classify(99, "", null, 65536, "c")).toBe("infra_error");
	});
});

describe("normalizeResult", () => {
	it("decodes base64 fields and converts time to milliseconds", () => {
		const r = normalizeResult(
			{
				token: "t1",
				status: { id: 3, description: "Accepted" },
				stdout: b64("42\n"),
				stderr: null,
				time: "0.125",
				memory: 3100,
				exit_code: 0,
			},
			"cpp",
			256,
		);
		expect(r).toMatchObject({
			token: "t1",
			done: true,
			verdict: "accepted",
			stdout: "42\n",
			stderr: "",
			timeMs: 125,
			memoryKb: 3100,
			exitCode: 0,
		});
	});

	it("marks a missing status as an infrastructure failure", () => {
		const r = normalizeResult({ token: "t2" }, "c", 64);
		expect(r.done).toBe(true);
		expect(r.verdict).toBe("infra_error");
		expect(r.timeMs).toBeNull();
	});

	it("truncates very large output so it cannot flood storage", () => {
		const big = "x".repeat(70 * 1024);
		const r = normalizeResult(
			{ token: "t3", status: { id: 3, description: "Accepted" }, stdout: b64(big) },
			"python",
			64,
		);
		expect(r.stdout.length).toBeLessThan(big.length);
		expect(r.stdout.endsWith("…[output truncated]")).toBe(true);
	});

	it("never gives Java less than its minimum memory when judging memory_limit", () => {
		// Java's floor is 256 MB: 200 MB used against a requested 64 MB limit is NOT a memory-limit hit.
		const r = normalizeResult(
			{ token: "t4", status: { id: 11, description: "Runtime Error" }, memory: 200 * 1024 },
			"java",
			64,
		);
		expect(r.verdict).toBe("runtime_error");
	});
});
