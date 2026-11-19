/**
 * Languages supported by the Vigil coding environment. IDs are Judge0 CE 1.13.x
 * language IDs (see infra/judge0). Labels state the real compiler versions
 * shipped in that image, so students know exactly what they are writing for.
 */
export const CODE_LANGUAGES = ["c", "cpp", "java", "python"] as const;
export type CodeLanguage = (typeof CODE_LANGUAGES)[number];

export interface LanguageSpec {
	key: CodeLanguage;
	label: string;
	/** Judge0 CE language_id */
	judge0Id: number;
	/** Monaco editor language id */
	monaco: string;
	fileName: string;
	/** Passed to Judge0 as compiler_options (compiled languages only). */
	compilerOptions?: string;
	/** JVM needs headroom; never give Java less than this. */
	minMemoryMb: number;
	template: string;
}

export const LANGUAGE_SPECS: Record<CodeLanguage, LanguageSpec> = {
	c: {
		key: "c",
		label: "C (GCC 9.2)",
		judge0Id: 50,
		monaco: "c",
		fileName: "main.c",
		compilerOptions: "-O2",
		minMemoryMb: 64,
		template: `#include <stdio.h>

int main(void) {
    // Read the input from stdin and print the answer to stdout.

    return 0;
}
`,
	},
	cpp: {
		key: "cpp",
		label: "C++17 (G++ 9.2)",
		judge0Id: 54,
		monaco: "cpp",
		fileName: "main.cpp",
		compilerOptions: "-O2 -std=c++17",
		minMemoryMb: 64,
		template: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    // Read the input from stdin and print the answer to stdout.

    return 0;
}
`,
	},
	java: {
		key: "java",
		label: "Java (OpenJDK 13)",
		judge0Id: 62,
		monaco: "java",
		fileName: "Main.java",
		minMemoryMb: 256,
		template: `import java.util.*;
import java.io.*;

// The class must be named Main.
public class Main {
    public static void main(String[] args) throws IOException {
        Scanner sc = new Scanner(System.in);

        // Read the input and print the answer.
    }
}
`,
	},
	python: {
		key: "python",
		label: "Python 3.8",
		judge0Id: 71,
		monaco: "python",
		fileName: "main.py",
		minMemoryMb: 64,
		template: `import sys


def main():
    data = sys.stdin.read().split()
    # Compute and print the answer.


if __name__ == "__main__":
    main()
`,
	},
};

export function isCodeLanguage(v: unknown): v is CodeLanguage {
	return typeof v === "string" && (CODE_LANGUAGES as readonly string[]).includes(v);
}

/** Languages a question allows: faculty choice, else all four with the faculty language first. */
export function allowedLanguagesFor(config: { language?: string; allowedLanguages?: string[] }): CodeLanguage[] {
	const chosen = (config.allowedLanguages ?? []).filter(isCodeLanguage);
	const list = chosen.length ? chosen : [...CODE_LANGUAGES];
	const primary = isCodeLanguage(config.language) ? config.language : null;
	if (primary && list.includes(primary)) return [primary, ...list.filter((l) => l !== primary)];
	return list;
}

export const MAX_SOURCE_BYTES = 64 * 1024;
export const MAX_STDIN_BYTES = 64 * 1024;
