import { app } from "./app";
import { env } from "./config/env";
import { prisma } from "./database";
import { initSocketServer } from "./providers/socket";

async function bootstrap() {
	try {
		await prisma.$connect();
		console.log("Database connected");

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

		// Restore the latest persisted proctoring rule configuration before serving traffic.
		const { loadAgentConfig } = await import("./features/proctoring/agent-control/agent-config");
		await loadAgentConfig();

		const server = app.listen(env.PORT, "0.0.0.0", () => {
			console.log(`Server running on http://localhost:${env.PORT} [${env.NODE_ENV}]`);
		});

		initSocketServer(server);

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

		// Warm up face-detection models so the first face check isn't slow.
		const { initFaceApi } = await import("./features/proctoring/services/proctoring-service");
		initFaceApi().catch((err) => console.error("[FaceAPI] Warm-up failed:", err));

		// Warm up the COCO-SSD object detector (phones, books, extra laptops).
		// Cold-loading it takes ~25s, which otherwise stalls the first proctoring frames.
		const { initCocoSsd } = await import("./features/proctoring/perception/object-detector");
		initCocoSsd().catch((err) => console.error("[COCO-SSD] Warm-up failed:", err));
	} catch (error) {
		console.error("Failed to start server:", error);
		process.exit(1);
	}
}

bootstrap();
