import { describe, expect, it, vi } from "vitest";
import { runAndWait } from "../services/judge0-client";
import { localLanguagesAvailable } from "../services/local-runner";

/**
 * Real end-to-end execution through the local executor (CODE_EXECUTOR=local,
 * the default). Each language block runs only if that toolchain is installed on
 * the machine running the tests; otherwise it is reported as skipped.
 */
// Real compilers (static linking, JVM start-up) are slower than unit tests.
vi.setConfig({ testTimeout: 30000 });

const has = localLanguagesAvailable();
const run = (
	language: "c" | "cpp" | "java" | "python",
	sourceCode: string,
	stdin = "",
	timeLimitMs = 2000,
) =>
	runAndWait([{ language, sourceCode, stdin, timeLimitMs, memoryLimitMb: 256 }]).then((r) => r[0]!);

describe.skipIf(!has.c)("local executor — C", () => {
	it("compiles and runs a program that reads stdin", async () => {
		const r = await run(
			"c",
			'#include <stdio.h>\nint main(void){int a,b;scanf("%d %d",&a,&b);printf("%d\\n",a+b);return 0;}',
			"2 40",
		);
		expect(r.verdict).toBe("accepted");
		expect(r.stdout).toBe("42\n");
		expect(r.exitCode).toBe(0);
	});

	it("reports compile errors with the file name and line, without the temp path", async () => {
		const r = await run("c", "int main(void) {\n  return undefined_var;\n}\n");
		expect(r.verdict).toBe("compilation_error");
		expect(r.compileOutput).toMatch(/main\.c:2/);
		expect(r.compileOutput).not.toMatch(/integrity-code-runs/);
	});

	it("reports a non-zero exit as a runtime error", async () => {
		const r = await run("c", "int main(void){ return 3; }");
		expect(r.verdict).toBe("runtime_error");
		expect(r.exitCode).toBe(3);
	});
});

describe.skipIf(!has.cpp)("local executor — C++", () => {
	it("supports C++17 and bits/stdc++.h", async () => {
		const r = await run(
			"cpp",
			"#include <bits/stdc++.h>\nint main(){ auto [a,b] = std::pair{6,7}; std::cout << a*b << '\\n'; }",
		);
		expect(r.verdict).toBe("accepted");
		expect(r.stdout).toBe("42\n");
	});

	it("reports uncaught exceptions as runtime errors", async () => {
		const r = await run(
			"cpp",
			"#include <vector>\nint main(){ std::vector<int> v; return v.at(3); }",
		);
		expect(r.verdict).toBe("runtime_error");
		expect(r.stderr).toMatch(/out_of_range/);
	});
});

describe.skipIf(!has.java)("local executor — Java", () => {
	it("compiles and runs class Main", async () => {
		const r = await run(
			"java",
			"import java.util.*;\npublic class Main{public static void main(String[] a){Scanner s=new Scanner(System.in);System.out.println(s.nextInt()*2);}}",
			"21",
		);
		expect(r.verdict).toBe("accepted");
		expect(r.stdout).toBe("42\n");
	});

	it("reports javac errors as compilation errors", async () => {
		const r = await run(
			"java",
			'public class Main{public static void main(String[] a){ int x = "s"; }}',
		);
		expect(r.verdict).toBe("compilation_error");
		expect(r.compileOutput).toMatch(/Main\.java:1/);
	});
});

describe.skipIf(!has.python)("local executor — Python", () => {
	it("runs with stdin and normalises Windows line endings to \\n", async () => {
		const r = await run(
			"python",
			"import sys\nfor w in sys.stdin.read().split():\n    print(w.upper())",
			"a b",
		);
		expect(r.verdict).toBe("accepted");
		expect(r.stdout).toBe("A\nB\n");
	});

	it("reports syntax errors as compilation errors with a clean message", async () => {
		const r = await run("python", "def f(:\n    pass\n");
		expect(r.verdict).toBe("compilation_error");
		expect(r.stderr).toMatch(/SyntaxError/);
		expect(r.stderr).not.toMatch(/Traceback/);
	});

	it("stops programs that exceed the time limit", async () => {
		const r = await run("python", "while True:\n    pass\n", "", 1000);
		expect(r.verdict).toBe("time_limit");
	}, 15000);

	it("stops programs that flood output", async () => {
		const r = await run(
			"python",
			"import sys\nwhile True:\n    sys.stdout.write('x' * 65536)\n",
			"",
			5000,
		);
		expect(["runtime_error", "time_limit"]).toContain(r.verdict);
		expect(r.stdout.length).toBeLessThanOrEqual(64 * 1024 + 32);
	}, 20000);
});
