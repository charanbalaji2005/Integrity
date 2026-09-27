import { app } from "./app";
import { env } from "./config/env";
import { prisma } from "./database";
import { initSocketServer } from "./providers/socket";

async function bootstrap() {
	try {
		await prisma.$connect();
		console.log("Database connected");

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
	} catch (error) {
		console.error("Failed to start server:", error);
		process.exit(1);
	}
}

bootstrap();
