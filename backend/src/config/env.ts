import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
	NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

	PORT: z.coerce.number().default(3000),

	DATABASE_URL: z.string().min(1),
	NEON_DATABASE_URL: z.string().optional(),
	CLOUD_DATABASE_URL: z.string().optional(),
	LOCAL_DATABASE_URL: z.string().optional(),

	BETTER_AUTH_SECRET: z.string().min(1),

	BETTER_AUTH_URL: z
		.string()
		.transform((val) =>
			val.startsWith("http://") || val.startsWith("https://") ? val : `https://${val}`,
		)
		.pipe(z.string().url()),

	GOOGLE_CLIENT_ID: z.string().min(1).optional(),

	GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),

	/** Optional custom SMTP server; when unset, Gmail is used with SMTP_USER/SMTP_PASS. */
	SMTP_HOST: z.string().optional(),
	SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
	SMTP_USER: z.string().optional().default("proctor@integrity.local"),

	SMTP_PASS: z.string().optional().default("disabled"),

	FRONTEND_URL: z
		.string()
		.transform((val) =>
			val.startsWith("http://") || val.startsWith("https://") ? val : `https://${val}`,
		)
		.pipe(z.string().url()),

	FACE_API_MODELS_PATH: z.string().default("src/features/proctoring/models"),

	FACE_MATCH_THRESHOLD: z.coerce.number().default(0.55),

	/**
	 * Load face-api + COCO-SSD at boot instead of on first use. Costs ~300 MB of
	 * resident memory, so it is off by default in production (Render free = 512 MB).
	 */
	PRELOAD_ML_MODELS: z
		.enum(["true", "false"])
		.optional()
		.transform((v) => (v === undefined ? process.env.NODE_ENV !== "production" : v === "true")),

	// Ollama
	OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),

	OLLAMA_CHAT_MODEL: z.string().default("llama3.2:3b"),

	OLLAMA_EMBEDDING_MODEL: z.string().default("nomic-embed-text"),

	// Live Proctoring
	FRAME_CAPTURE_RATE: z.coerce.number().default(2),
	MAX_WARNINGS: z.coerce.number().default(3),
	FACE_ABSENCE_SECONDS: z.coerce.number().default(5),
	LOOK_AWAY_SECONDS: z.coerce.number().default(3),
	PHONE_CONFIDENCE: z.coerce.number().default(0.75),
	BOOK_CONFIDENCE: z.coerce.number().default(0.7),
	PROCTORING_RISK_THRESHOLD: z.coerce.number().default(60),

	// Continuous exam recording (segments stored on local disk)
	RECORDINGS_DIR: z.string().default("storage/recordings"),
	/** Max size of a single uploaded recording segment, in MB. */
	RECORDING_MAX_SEGMENT_MB: z.coerce.number().default(25),
	/** How long after submission late segments (still uploading) are accepted. */
	RECORDING_UPLOAD_GRACE_MINUTES: z.coerce.number().default(30),

	// Plagiarism checker external sources (Wikipedia + OpenAlex need no key).
	// Set to "false" to keep document text from leaving the server entirely.
	PLAGIARISM_EXTERNAL_SEARCH: z
		.string()
		.optional()
		.transform((v) => v !== "false"),
	/** Optional: enables full-web search (Brave Search API). */
	BRAVE_SEARCH_API_KEY: z.string().optional(),
	/** Optional: OpenAlex API key (free at openalex.org/settings/api) for a dedicated daily budget. */
	OPENALEX_API_KEY: z.string().optional(),

	// Vigil coding: isolated Judge0 execution service (infra/judge0). Student code
	// is never executed by this server. Unset → code execution reports "unavailable".
	JUDGE0_URL: z.string().url().optional(),
	/** Must equal AUTHN_TOKEN in infra/judge0/judge0.conf. */
	JUDGE0_AUTH_TOKEN: z.string().optional(),
	/**
	 * "judge0" (default): sandboxed Judge0. "local": compile and run with the toolchains
	 * installed on this machine (gcc/g++, JDK, Python). Local mode has NO sandbox —
	 * use it only on a trusted single-machine setup.
	 */
	CODE_EXECUTOR: z.enum(["judge0", "local"]).default("local"),
	/** Local executor overrides (auto-detected when unset). */
	LOCAL_GCC_BIN_DIR: z.string().optional(),
	LOCAL_JAVA_HOME: z.string().optional(),
	LOCAL_PYTHON_PATH: z.string().optional(),
	/** Confidence below this (0–1) sends a coding evaluation to faculty review. */
	CODE_EVAL_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.7),

	// Groq & OpenAI & Ollama LLMs
	GROQ_API_KEY: z.string().optional(),
	GROQ_CHAT_MODEL: z.string().default("openai/gpt-oss-120b"),
	/** Reasoning model: faculty AI assistant, proctoring reports, evaluation. */
	GROQ_REASONING_MODEL: z.string().default("openai/gpt-oss-120b"),
	/** Fast model: support ticket agent (low latency). */
	GROQ_FAST_MODEL: z.string().default("openai/gpt-oss-20b"),
	/** Vision model: second-opinion review of flagged proctoring frames. */
	GROQ_VISION_MODEL: z.string().default("qwen/qwen3.8-27b"),
	/** Safety model: moderation of messages sent to the AI agents. */
	GROQ_SAFETY_MODEL: z.string().default("openai/gpt-oss-safeguard-20b"),
	/** Set to "false" to disable vision review of flagged proctoring frames. */
	GROQ_VISION_PROCTORING: z
		.string()
		.optional()
		.transform((v) => v !== "false"),

	OPENAI_API_KEY: z.string().optional(),

	LLM_PROVIDER: z.enum(["openai", "ollama", "groq"]).default("groq"),

	OLLAMA_MODEL: z.string().default("llama3.2"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
	console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
	process.exit(1);
}

export const env = parsed.data;
