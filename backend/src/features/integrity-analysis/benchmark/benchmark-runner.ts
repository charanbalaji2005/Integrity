import type {
	BenchmarkPrediction,
	BenchmarkReport,
	BenchmarkSample,
	BenchmarkSource,
	ExpectedLabel,
} from "./benchmark-types";
import { calculateClassificationMetrics, compileConfusionMatrix } from "./metrics";

/**
 * Runs an evaluation benchmark over a dataset using a customizable prediction function.
 */
export async function runBenchmark(
	samples: BenchmarkSample[],
	predictFn: (text: string) => Promise<{ predictedLabel: ExpectedLabel; predictedScore: number }>,
): Promise<BenchmarkReport> {
	const predictions: (BenchmarkSample & BenchmarkPrediction & { isCorrect: boolean })[] = [];

	const sourceStats: Partial<Record<BenchmarkSource, { total: number; correct: number }>> = {};

	const confusionInputs: {
		expected: ExpectedLabel;
		predicted: ExpectedLabel;
	}[] = [];

	for (const sample of samples) {
		const pred = await predictFn(sample.text);
		const isCorrect = pred.predictedLabel === sample.expectedLabel;

		predictions.push({
			...sample,
			...pred,
			isCorrect,
		});

		confusionInputs.push({
			expected: sample.expectedLabel,
			predicted: pred.predictedLabel,
		});

		// Initialize and increment source stats
		let stats = sourceStats[sample.source];
		if (!stats) {
			stats = { total: 0, correct: 0 };
			sourceStats[sample.source] = stats;
		}
		stats.total++;
		if (isCorrect) {
			stats.correct++;
		}
	}

	const confusionMatrix = compileConfusionMatrix(confusionInputs);
	const metrics = calculateClassificationMetrics(confusionMatrix);

	const sourceMetrics = {} as Record<
		BenchmarkSource,
		{ total: number; correct: number; accuracy: number }
	>;

	for (const [source, stats] of Object.entries(sourceStats)) {
		if (stats) {
			sourceMetrics[source as BenchmarkSource] = {
				total: stats.total,
				correct: stats.correct,
				accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) / 100 : 0,
			};
		}
	}

	return {
		metrics,
		sourceMetrics,
		predictions,
	};
}
