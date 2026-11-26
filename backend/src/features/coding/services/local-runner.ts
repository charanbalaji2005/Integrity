import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { env } from "../../../config/env";
import { type CodeLanguage, LANGUAGE_SPECS } from "../languages";

/**
 * Local code executor: compiles and runs programs with the toolchains installed
 * on this machine (GCC/G++, a JDK, Python). It returns Judge0-shaped results, so
 * the rest of the coding feature works unchanged.
 *
 * There is NO sandbox here: programs run as the server's OS user with only a
 * time limit, an output cap, a per-run temp folder and a small concurrency cap.
 * Enable with CODE_EXECUTOR=local only on a trusted single-machine setup.
 */

const isWin = process.platform === "win32";
const exe = (name: string) => (isWin ? `${name}.exe` : name);
const MAX_CAPTURE = 1024 * 1024; // kill a program that floods more than 1 MB of output
const COMPILE_TIMEOUT_MS = 30000;
const MAX_CONCURRENT = 3;
const RESULT_TTL_MS = 10 * 60 * 1000;
const WORK_ROOT = join(tmpdir(), "integrity-code-runs");
/** Prints only "File, line, SyntaxError: ..." (no wrapper traceback) and exits 1 on a syntax error. */
const PY_SYNTAX_CHECK = [
	"import sys, traceback",
	"src = open(sys.argv[1], encoding='utf-8').read()",
	"try:",
	"    compile(src, sys.argv[1], 'exec')",
	"except SyntaxError as e:",
	"    sys.stderr.write(''.join(traceback.format_exception_only(type(e), e)))",
	"    sys.exit(1)",
].join("\n");

/* ───────── toolchain detection ───────── */

interface Toolchain {
	gcc: string | null;
	gpp: string | null;
	gccBinDir: string | null;
	javac: string | null;
	java: string | null;
	python: string | null;
	versions: Partial<Record<CodeLanguage, string>>;
}

function findOnPath(name: string): string | null {
	for (const dir of (process.env.PATH ?? "").split(delimiter)) {
		if (!dir || /WindowsApps/i.test(dir)) continue; // skip the Microsoft Store python stub
		const p = join(dir, exe(name));
		if (existsSync(p)) return p;
	}
	return null;
}

function newestSubdir(dir: string, test: (d: string) => boolean): string | null {
	if (!existsSync(dir)) return null;
	try {
		const subs = readdirSync(dir, { withFileTypes: true })
			.filter((d) => d.isDirectory())
			.map((d) => join(dir, d.name))
			.filter(test)
			.sort()
			.reverse();
		return subs[0] ?? null;
	} catch {
		return null;
	}
}

function detectGccBinDir(): string | null {
	if (env.LOCAL_GCC_BIN_DIR) return env.LOCAL_GCC_BIN_DIR;
	const candidates = isWin
		? [
				"C:\\msys64\\ucrt64\\bin",
				"C:\\msys64\\mingw64\\bin",
				"C:\\msys64\\clang64\\bin",
				"C:\\mingw64\\bin",
				"C:\\MinGW\\bin",
				"C:\\TDM-GCC-64\\bin",
			]
		: [];
	for (const c of candidates) if (existsSync(join(c, exe("g++")))) return c;
	const onPath = findOnPath("g++");
	return onPath ? join(onPath, "..") : null;
}

function detectJavaHome(): string | null {
	const hasJavac = (d: string) => existsSync(join(d, "bin", exe("javac")));
	for (const h of [env.LOCAL_JAVA_HOME, process.env.JAVA_HOME]) if (h && hasJavac(h)) return h;
	const roots = isWin
		? [
				join(homedir(), ".jdks"),
				"C:\\Program Files\\Java",
				"C:\\Program Files\\Eclipse Adoptium",
				"C:\\Program Files\\Microsoft",
				"C:\\Program Files\\Zulu",
				"C:\\Program Files\\Amazon Corretto",
			]
		: [join(homedir(), ".jdks"), "/usr/lib/jvm"];
	for (const r of roots) {
		const d = newestSubdir(r, hasJavac);
		if (d) return d;
	}
	const javac = findOnPath("javac");
	return javac ? join(javac, "..", "..") : null;
}

function detectPython(): string | null {
	if (env.LOCAL_PYTHON_PATH && existsSync(env.LOCAL_PYTHON_PATH)) return env.LOCAL_PYTHON_PATH;
	return findOnPath("python3") ?? findOnPath("python");
}

function version(
	cmd: string | null,
	args: string[],
	pick: (out: string) => string | null,
): string | null {
	if (!cmd) return null;
	try {
		const out = execFileSync(cmd, args, {
			encoding: "utf8",
			timeout: 10000,
			windowsHide: true,
			stdio: ["ignore", "pipe", "pipe"],
		});
		return pick(out);
	} catch (err) {
		const e = err as { stdout?: string; stderr?: string };
		return pick(`${e.stdout ?? ""}${e.stderr ?? ""}`);
	}
}

let toolchain: Toolchain | null = null;

export function localToolchain(): Toolchain {
	if (toolchain) return toolchain;
	const gccBinDir = detectGccBinDir();
	const gcc =
		gccBinDir && existsSync(join(gccBinDir, exe("gcc"))) ? join(gccBinDir, exe("gcc")) : null;
	const gpp =
		gccBinDir && existsSync(join(gccBinDir, exe("g++"))) ? join(gccBinDir, exe("g++")) : null;
	const javaHome = detectJavaHome();
	const javac = javaHome ? join(javaHome, "bin", exe("javac")) : null;
	const java = javaHome ? join(javaHome, "bin", exe("java")) : null;
	const python = detectPython();

	const gccVer = version(
		gpp ?? gcc,
		["-dumpfullversion", "-dumpversion"],
		(o) => o.trim().split(/\s+/)[0] || null,
	);
	const javaVer = version(javac, ["-version"], (o) => o.match(/javac\s+([\w.+-]+)/)?.[1] ?? null);
	const pyVer = version(python, ["--version"], (o) => o.match(/Python\s+([\d.]+)/)?.[1] ?? null);

	const versions: Partial<Record<CodeLanguage, string>> = {};
	if (gcc && gccVer) versions.c = `C (GCC ${gccVer})`;
	if (gpp && gccVer) versions.cpp = `C++17 (G++ ${gccVer})`;
	if (javac && java && javaVer) versions.java = `Java (JDK ${javaVer})`;
	if (python && pyVer) versions.python = `Python ${pyVer}`;

	toolchain = { gcc, gpp, gccBinDir, javac, java, python, versions };
	return toolchain;
}

/** Updates language labels to the real local compiler versions (call once at startup in local mode). */
export function applyLocalLanguageLabels() {
	const t = localToolchain();
	for (const [k, label] of Object.entries(t.versions) as [CodeLanguage, string][])
		LANGUAGE_SPECS[k].label = label;
}

export function localLanguagesAvailable(): Record<CodeLanguage, boolean> {
	const t = localToolchain();
	return {
		c: Boolean(t.versions.c),
		cpp: Boolean(t.versions.cpp),
		java: Boolean(t.versions.java),
		python: Boolean(t.versions.python),
	};
}

/* ───────── process execution ───────── */

interface ProcResult {
	stdout: string;
	stderr: string;
	exitCode: number | null;
	timedOut: boolean;
	flooded: boolean;
	timeMs: number;
	spawnError: string | null;
}

function killTree(child: ChildProcess) {
	if (child.pid == null) return;
	if (isWin) {
		try {
			execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
				stdio: "ignore",
				windowsHide: true,
			});
		} catch {
			/* already gone */
		}
	} else {
		child.kill("SIGKILL");
	}
}

function runProcess(
	cmd: string,
	args: string[],
	opts: { cwd: string; stdin: string; timeoutMs: number; extraPath?: string | null },
): Promise<ProcResult> {
	return new Promise((resolve) => {
		const pathParts = [opts.extraPath, process.env.PATH].filter(Boolean).join(delimiter);
		const start = process.hrtime.bigint();
		let child: ChildProcess;
		try {
			child = spawn(cmd, args, {
				cwd: opts.cwd,
				windowsHide: true,
				env: {
					...process.env,
					PATH: pathParts,
					PYTHONIOENCODING: "utf-8",
					PYTHONDONTWRITEBYTECODE: "1",
				},
			});
		} catch (err) {
			resolve({
				stdout: "",
				stderr: "",
				exitCode: null,
				timedOut: false,
				flooded: false,
				timeMs: 0,
				spawnError: (err as Error).message,
			});
			return;
		}
		const out: Buffer[] = [];
		const errs: Buffer[] = [];
		let size = 0;
		let timedOut = false;
		let flooded = false;
		let settled = false;
		const collect = (bucket: Buffer[]) => (chunk: Buffer) => {
			size += chunk.length;
			if (size > MAX_CAPTURE) {
				if (!flooded) {
					flooded = true;
					killTree(child);
				}
				return;
			}
			bucket.push(chunk);
		};
		child.stdout?.on("data", collect(out));
		child.stderr?.on("data", collect(errs));
		const timer = setTimeout(() => {
			timedOut = true;
			killTree(child);
		}, opts.timeoutMs);
		const finish = (exitCode: number | null, spawnError: string | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve({
				// Normalise Windows line endings so output comparisons match Linux judges.
				stdout: Buffer.concat(out).toString("utf8").replace(/\r\n/g, "\n"),
				stderr: Buffer.concat(errs).toString("utf8").replace(/\r\n/g, "\n"),
				exitCode,
				timedOut,
				flooded,
				timeMs: Math.round(Number(process.hrtime.bigint() - start) / 1e6),
				spawnError,
			});
		};
		child.on("error", (err) => finish(null, err.message));
		child.on("close", (code) => finish(code, null));
		child.stdin?.on("error", () => {}); // program exited without reading all input
		child.stdin?.end(opts.stdin);
	});
}

/* ───────── Judge0-shaped results ───────── */

interface StoredResult {
	token: string;
	status: { id: number; description: string };
	stdout: string | null;
	stderr: string | null;
	compile_output: string | null;
	message: string | null;
	exit_code: number | null;
	time: string | null;
	memory: number | null;
	at: number;
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const results = new Map<string, StoredResult>();

function store(token: string, r: Omit<StoredResult, "token" | "at">) {
	results.set(token, { token, at: Date.now(), ...r });
}

const STATUS = {
	queued: { id: 1, description: "In Queue" },
	processing: { id: 2, description: "Processing" },
	accepted: { id: 3, description: "Accepted" },
	tle: { id: 5, description: "Time Limit Exceeded" },
	compile: { id: 6, description: "Compilation Error" },
	runtime: { id: 11, description: "Runtime Error (NZEC)" },
	internal: { id: 13, description: "Internal Error" },
};

export interface LocalRunRequest {
	language: CodeLanguage;
	sourceCode: string;
	stdin: string;
	timeLimitMs: number;
	memoryLimitMb: number;
}

const empty = {
	stdout: null,
	stderr: null,
	compile_output: null,
	message: null,
	exit_code: null,
	time: null,
	memory: null,
};

async function execute(token: string, r: LocalRunRequest) {
	const t = localToolchain();
	const dir = join(WORK_ROOT, token);
	const spec = LANGUAGE_SPECS[r.language];
	const fail = (message: string) =>
		store(token, { ...empty, status: STATUS.internal, message: b64(message) });

	try {
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, spec.fileName), r.sourceCode, "utf8");

		// 1. Compile (or syntax-check Python).
		let runCmd: string;
		let runArgs: string[];
		let compile: ProcResult | null = null;
		if (r.language === "c" || r.language === "cpp") {
			const cc = r.language === "c" ? t.gcc : t.gpp;
			if (!cc)
				return fail(
					`No ${r.language === "c" ? "gcc" : "g++"} found on this machine. Install MSYS2/MinGW or set LOCAL_GCC_BIN_DIR.`,
				);
			const std = r.language === "c" ? ["-std=gnu17"] : ["-std=gnu++17"];
			// -static so the program needs no MinGW DLLs at run time.
			compile = await runProcess(
				cc,
				["-O2", ...std, spec.fileName, "-o", exe("main"), "-static", "-lm"],
				{ cwd: dir, stdin: "", timeoutMs: COMPILE_TIMEOUT_MS, extraPath: t.gccBinDir },
			);
			runCmd = join(dir, exe("main"));
			runArgs = [];
		} else if (r.language === "java") {
			if (!t.javac || !t.java)
				return fail("No JDK found on this machine. Install a JDK or set LOCAL_JAVA_HOME.");
			compile = await runProcess(t.javac, ["-encoding", "UTF-8", spec.fileName], {
				cwd: dir,
				stdin: "",
				timeoutMs: COMPILE_TIMEOUT_MS,
			});
			const heap = Math.min(512, Math.max(spec.minMemoryMb, r.memoryLimitMb));
			runCmd = t.java;
			runArgs = [
				`-Xmx${heap}m`,
				"-Xss64m",
				"-XX:+UseSerialGC",
				"-Dfile.encoding=UTF-8",
				"-cp",
				".",
				"Main",
			];
		} else {
			if (!t.python)
				return fail("No Python found on this machine. Install Python or set LOCAL_PYTHON_PATH.");
			compile = await runProcess(t.python, ["-c", PY_SYNTAX_CHECK, spec.fileName], {
				cwd: dir,
				stdin: "",
				timeoutMs: COMPILE_TIMEOUT_MS,
			});
			runCmd = t.python;
			runArgs = ["-X", "utf8", spec.fileName];
		}

		if (compile.spawnError) return fail(`Could not start the compiler: ${compile.spawnError}`);
		if (compile.timedOut)
			return store(token, {
				...empty,
				status: STATUS.compile,
				compile_output: b64("Compilation timed out."),
			});
		if (compile.exitCode !== 0) {
			const msg = (compile.stderr || compile.stdout).split(dir + (isWin ? "\\" : "/")).join("");
			// Python syntax errors are reported as stderr so the shared classifier maps them to compilation_error.
			if (r.language === "python")
				return store(token, {
					...empty,
					status: STATUS.runtime,
					stderr: b64(msg),
					exit_code: compile.exitCode,
				});
			return store(token, { ...empty, status: STATUS.compile, compile_output: b64(msg) });
		}

		// 2. Run with the time limit (wall clock; generous for JVM start-up).
		const limit =
			Math.min(20000, Math.max(1000, r.timeLimitMs)) + (r.language === "java" ? 1500 : 500);
		const run = await runProcess(runCmd, runArgs, {
			cwd: dir,
			stdin: r.stdin,
			timeoutMs: limit,
			extraPath: t.gccBinDir,
		});
		if (run.spawnError) return fail(`Could not start the program: ${run.spawnError}`);
		const base = {
			...empty,
			stdout: b64(run.stdout),
			stderr: b64(run.stderr),
			exit_code: run.exitCode,
			time: (run.timeMs / 1000).toFixed(3),
		};
		if (run.timedOut) return store(token, { ...base, status: STATUS.tle });
		if (run.flooded)
			return store(token, {
				...base,
				status: STATUS.runtime,
				message: b64("Output limit exceeded (1 MB)."),
			});
		if (run.exitCode !== 0) return store(token, { ...base, status: STATUS.runtime });
		return store(token, { ...base, status: STATUS.accepted });
	} catch (err) {
		return fail(`Local executor error: ${(err as Error).message}`);
	} finally {
		try {
			rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
		} catch {
			/* best effort */
		}
	}
}

/* ───────── queue ───────── */

const queue: Array<{ token: string; req: LocalRunRequest }> = [];
let active = 0;

function pump() {
	while (active < MAX_CONCURRENT && queue.length) {
		const job = queue.shift()!;
		active++;
		store(job.token, { ...empty, status: STATUS.processing });
		void execute(job.token, job.req).finally(() => {
			active--;
			pump();
		});
	}
	// Forget results nobody collected.
	const cutoff = Date.now() - RESULT_TTL_MS;
	for (const [k, v] of results) if (v.at < cutoff && v.status.id > 2) results.delete(k);
}

export function submitLocalRuns(runs: LocalRunRequest[]): string[] {
	return runs.map((req) => {
		const token = randomUUID();
		store(token, { ...empty, status: STATUS.queued });
		queue.push({ token, req });
		pump();
		return token;
	});
}

export function fetchLocalRuns(tokens: string[]) {
	return tokens.map((t) => {
		const r = results.get(t);
		if (!r)
			return {
				token: t,
				status: STATUS.internal,
				message: b64("Result expired or unknown token."),
			};
		const { at: _at, ...rest } = r;
		return rest;
	});
}
