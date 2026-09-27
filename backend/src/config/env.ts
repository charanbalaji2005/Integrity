import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
	NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

	PORT: z.coerce.number().default(3000),

	DATABASE_URL: z.string().min(1),

	BETTER_AUTH_SECRET: z.string().min(1),

	BETTER_AUTH_URL: z.string().url(),

	GOOGLE_CLIENT_ID: z.string().min(1).optional(),

	GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),

	SMTP_USER: z.string().email(),

	SMTP_PASS: z.string().min(1),

	FRONTEND_URL: z.string().url(),

	FACE_API_MODELS_PATH: z.string().default("src/features/proctoring/models"),

	FACE_MATCH_THRESHOLD: z.coerce.number().default(0.55),

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

	// OpenAI
	OPENAI_API_KEY: z.string().optional(),

	LLM_PROVIDER: z.enum(["openai", "ollama"]).default("openai"),

	OLLAMA_MODEL: z.string().default("llama3.2"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
	console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
	process.exit(1);
}

export const env = parsed.data;
