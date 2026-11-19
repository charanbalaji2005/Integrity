import { app } from "./app";
import { env } from "./config/env";
import { prisma } from "./database";
import { initSocketServer } from "./providers/socket";

// Prevent server crash on unhandled background promises or errors
process.on("unhandledRejection", (reason, promise) => {
	console.error("[Process] Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
	console.error("[Process] Uncaught Exception:", error);
});

/**
 * Startup order matters on Render:
 *  1. Open the HTTP port immediately. Render's port scan / health check must
 *     succeed even while the database is cold or the first-run seed is slow;
 *     /api/health always answers 200 and reports the DB status in its body.
 *  2. Connect to the database with retries (Neon cold starts can take a while)
 *     and run the one-off seed / config restore in the background.
 *  3. Load the ML models lazily. Preloading face-api + COCO-SSD keeps ~300 MB
 *     resident, which pushed the server past the 512 MB limit of Render's free
 *     plan and got it OOM-killed in a restart loop. Set PRELOAD_ML_MODELS=true
 *     on hosts with enough memory to trade RAM for a faster first frame.
 */

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function connectDatabaseWithRetry(maxAttempts = 8): Promise<void> {
	for (let attempt = 1; ; attempt++) {
		try {
			await prisma.$connect();
			console.log("Database connected");
			return;
		} catch (err) {
			if (attempt >= maxAttempts) throw err;
			const delay = Math.min(30_000, 1_000 * 2 ** (attempt - 1));
			console.warn(
				`[Bootstrap] Database connection failed (attempt ${attempt}/${maxAttempts}); retrying in ${delay / 1000}s:`,
				err instanceof Error ? err.message : err,
			);
			await sleep(delay);
		}
	}
}

async function initialiseData() {
	await connectDatabaseWithRetry();

	// Auto-seed default accounts on clean startup if needed
	try {
		const adminCount = await prisma.user.count({ where: { role: "admin" } });
		if (adminCount === 0) {
			console.log("[Bootstrap] No admin account detected. Running automatic database seed...");
			const { seedDatabase } = await import("./database/seed");
			await seedDatabase(false);
		}
	} catch (seedErr) {
		console.warn("[Bootstrap] Auto-seed check skipped or failed:", seedErr);
	}

	// Restore the latest persisted proctoring rule configuration.
	const { loadAgentConfig } = await import("./features/proctoring/agent-control/agent-config");
	await loadAgentConfig();

	// Start background threat monitoring simulator
	const { startSecurityThreatSimulator } = await import("./admin/services/security-agent");
	startSecurityThreatSimulator();

	// Start background evaluation queue worker
	const { startQueueWorker } = await import("./features/assessments/services/queue-worker");
	startQueueWorker();

	// Support Hub: built-in knowledge base + assignment engine (timeouts, queue).
	const { ensureDefaultKnowledgeBase } = await import("./features/support/services/knowledge-base");
	const { startAssignmentScheduler } = await import("./features/support/services/assignment");
	await ensureDefaultKnowledgeBase().catch((err) => console.error("[Support] KB seed failed:", err));
	startAssignmentScheduler();

	// Vigil coding: poll the Judge0 sandbox for runs and process evaluation jobs.
	const { startExecutionPoller } = await import("./features/coding/services/execution-service");
	const { startEvaluationWorker } = await import("./features/coding/services/evaluation-service");
	startExecutionPoller();
	startEvaluationWorker();
}

async function preloadModels() {
	// face-api and COCO-SSD load on first use anyway; this only removes the
	// cold-start delay (~25 s) from the first proctoring frame.
	const { initFaceApi } = await import("./features/proctoring/services/proctoring-service");
	initFaceApi().catch((err) => console.error("[FaceAPI] Warm-up failed:", err));
	const { initCocoSsd } = await import("./features/proctoring/perception/object-detector");
	initCocoSsd().catch((err) => console.error("[COCO-SSD] Warm-up failed:", err));
}

function bootstrap() {
	const server = app.listen(env.PORT, "0.0.0.0", () => {
		console.log(`Server running on http://localhost:${env.PORT} [${env.NODE_ENV}]`);
	});
	server.on("error", (err) => {
		console.error("Failed to open HTTP port:", err);
		process.exit(1);
	});
	initSocketServer(server);

	initialiseData().catch((error) => {
		// Without a database the API cannot work; exit so the platform restarts us.
		console.error("Failed to initialise database-backed services:", error);
		process.exit(1);
	});

	if (env.PRELOAD_ML_MODELS) {
		preloadModels().catch((err) => console.error("[Bootstrap] Model preload failed:", err));
	} else {
		console.log("[Bootstrap] ML models will load on first use (set PRELOAD_ML_MODELS=true to preload).");
	}
}

bootstrap();
