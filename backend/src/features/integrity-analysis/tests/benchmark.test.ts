import { describe, expect, it } from "vitest";
import { runBenchmark } from "../benchmark/benchmark-runner";
import type { BenchmarkSample, ConfusionMatrix, ExpectedLabel } from "../benchmark/benchmark-types";
import { calculateClassificationMetrics, compileConfusionMatrix } from "../benchmark/metrics";
import { BENCHMARK_DATASET } from "../benchmark/sample-dataset";

describe("Benchmark Metrics Calculator", () => {
	it("should calculate correct metrics for a balanced confusion matrix", () => {
		// TP = 50, TN = 40, FP = 10, FN = 0
		const matrix: ConfusionMatrix = {
			truePositives: 50,
			trueNegatives: 40,
			falsePositives: 10,
			falseNegatives: 0,
		};

		const metrics = calculateClassificationMetrics(matrix);

		// Total = 100
		// Accuracy = (50 + 40) / 100 = 0.90
		expect(metrics.accuracy).toBe(0.9);

		// Precision = 50 / (50 + 10) = 50 / 60 = 0.8333
		expect(metrics.precision).toBeCloseTo(0.8333);

		// Recall = 50 / (50 + 0) = 1.0
		expect(metrics.recall).toBe(1.0);

		// F1 = 2 * (0.8333 * 1) / (0.8333 + 1) = 1.6666 / 1.8333 = 0.9091
		expect(metrics.f1Score).toBeCloseTo(0.9091);

		// False Positive Rate = FP / (FP + TN) = 10 / (10 + 40) = 0.20
		expect(metrics.falsePositiveRate).toBe(0.2);

		// False Negative Rate = FN / (FN + TP) = 0 / 50 = 0
		expect(metrics.falseNegativeRate).toBe(0);
	});

	it("should compile confusion matrix from predictions", () => {
		const results: { expected: ExpectedLabel; predicted: ExpectedLabel }[] = [
			{ expected: "AI", predicted: "AI" }, // TP
			{ expected: "AI", predicted: "AI" }, // TP
			{ expected: "Human", predicted: "Human" }, // TN
			{ expected: "Human", predicted: "AI" }, // FP
			{ expected: "AI", predicted: "Human" }, // FN
		];

		const matrix = compileConfusionMatrix(results);
		expect(matrix.truePositives).toBe(2);
		expect(matrix.trueNegatives).toBe(1);
		expect(matrix.falsePositives).toBe(1);
		expect(matrix.falseNegatives).toBe(1);
	});
});

describe("Benchmark Runner", () => {
	it("should run prediction over sample dataset and summarize accuracy", async () => {
		const samples: BenchmarkSample[] = [
			{
				id: "1",
				text: "Human text",
				expectedLabel: "Human",
				source: "Human",
			},
			{ id: "2", text: "AI text", expectedLabel: "AI", source: "ChatGPT" },
		];

		// Simple predict mock that flags "AI text" as AI and others as Human
		const mockPredict = async (text: string) => {
			const isAi = text.includes("AI");
			return {
				predictedLabel: (isAi ? "AI" : "Human") as ExpectedLabel,
				predictedScore: isAi ? 90 : 10,
			};
		};

		const report = await runBenchmark(samples, mockPredict);

		expect(report.metrics.accuracy).toBe(1.0);
		expect(report.predictions).toHaveLength(2);
		expect(report.predictions[0].isCorrect).toBe(true);
		expect(report.sourceMetrics.Human.accuracy).toBe(1.0);
		expect(report.sourceMetrics.ChatGPT.accuracy).toBe(1.0);
	});

	it("should run on the full sample dataset", async () => {
		expect(BENCHMARK_DATASET.length).toBe(17); // 3+3+2+2+2+2+3 = 17

		const simplePredict = async (text: string) => {
			// Mock predict: classify AI if text has academic connector words, otherwise human
			const hasAiMarkers =
				text.includes("Furthermore") ||
				text.includes("Moreover") ||
				text.includes("Overall") ||
				text.includes("conclusion") ||
				text.includes("vital") ||
				text.includes("crucial") ||
				text.includes("essential");

			return {
				predictedLabel: (hasAiMarkers ? "AI" : "Human") as ExpectedLabel,
				predictedScore: hasAiMarkers ? 85 : 15,
			};
		};

		const report = await runBenchmark(BENCHMARK_DATASET, simplePredict);
		expect(report.predictions).toHaveLength(17);
		expect(report.metrics.accuracy).toBeGreaterThan(0.5);
	});
});
