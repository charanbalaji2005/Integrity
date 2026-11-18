import { prisma } from "@/database";
import { getIO } from "../../../providers/socket";
import { runCompleteAIEvaluation } from "./ai-pipeline";

let isWorkerRunning = false;
let checkInterval: NodeJS.Timeout | null = null;

/**
 * Initializes and starts the background queue worker.
 * Sweeps the database every 5 seconds for pending evaluation jobs.
 */
export function startQueueWorker() {
	if (isWorkerRunning) return;
	isWorkerRunning = true;

	console.log("[Queue Worker] Starting background AI Evaluation queue worker...");

	// 1. Recover/resume any jobs stuck in "processing" state due to previous crash/restart
	prisma.evaluationJob
		.updateMany({
			where: { status: "processing" },
			data: { status: "pending" },
		})
		.then((res: any) => {
			if (res.count > 0) {
				console.log(`[Queue Worker] Recovered ${res.count} crashed/stuck evaluation jobs.`);
			}
		})
		.catch((err: any) => {
			console.error("[Queue Worker] Error recovering stuck jobs:", err);
		});

	// 2. Set interval to check queue
	checkInterval = setInterval(async () => {
		try {
			await processNextJob();
		} catch (err) {
			console.error("[Queue Worker] Uncaught error in processing cycle:", err);
		}
	}, 5000);
}

/**
 * Stop the background worker cleanly.
 */
export function stopQueueWorker() {
	if (checkInterval) {
		clearInterval(checkInterval);
		checkInterval = null;
	}
	isWorkerRunning = false;
	console.log("[Queue Worker] Stopped background queue worker.");
}

/**
 * Processes a single pending job in the queue.
 */
async function processNextJob() {
	// Find a pending job
	const job = await prisma.evaluationJob.findFirst({
		where: {
			status: { in: ["pending"] },
			retryCount: { lt: 3 }, // Only process if under maximum retries
		},
		orderBy: { createdAt: "asc" },
	});

	if (!job) return;

	console.log(`[Queue Worker] Processing job ${job.id} for Attempt ${job.attemptId}...`);

	// Lock the job to prevent other instances from processing it
	await prisma.evaluationJob.update({
		where: { id: job.id },
		data: { status: "processing" },
	});

	try {
		// Run the full 7-agent evaluation pipeline
		await runCompleteAIEvaluation(job.attemptId);

		// Mark job completed
		await prisma.evaluationJob.update({
			where: { id: job.id },
			data: { status: "completed" },
		});

		console.log(`[Queue Worker] Successfully finished job ${job.id} for Attempt ${job.attemptId}`);

		// Send notifications
		const attempt = await prisma.assessmentAttempt.findUnique({
			where: { id: job.attemptId },
			include: { assessment: true },
		});

		if (attempt) {
			// 1. Notify Student
			await prisma.notification.create({
				data: {
					userId: attempt.studentId,
					title: "Assessment Evaluated",
					description: "Your assessment has been successfully evaluated.",
					type: "assessment",
					priority: "medium",
				},
			});

			// 2. Notify Faculty
			await prisma.notification.create({
				data: {
					userId: attempt.assessment.facultyId,
					title: "Assessment Evaluated",
					description: "Assessment evaluation completed.",
					type: "assessment",
					priority: "medium",
				},
			});

			// 3. Emit socket event
			const io = getIO();
			if (io) {
				io.emit("integrity-report-created", {
					attemptId: attempt.id,
					studentId: attempt.studentId,
					assessmentId: attempt.assessmentId,
					status: "graded",
				});
			}
		}
	} catch (err: any) {
		const nextRetry = job.retryCount + 1;
		const isFatal = nextRetry >= job.maxRetries;
		const finalStatus = isFatal ? "failed" : "pending";

		console.error(
			`[Queue Worker] Job ${job.id} failed (Attempt ${nextRetry}/${job.maxRetries}):`,
			err,
		);

		await prisma.evaluationJob.update({
			where: { id: job.id },
			data: {
				status: finalStatus,
				retryCount: nextRetry,
				errorLog: err?.message || String(err),
			},
		});
	}
}
