import type { BenchmarkMetrics, ConfusionMatrix } from "./benchmark-types";

/**
 * Calculates classification metrics from a confusion matrix.
 */
export function calculateClassificationMetrics(matrix: ConfusionMatrix): BenchmarkMetrics {
	const { truePositives: tp, trueNegatives: tn, falsePositives: fp, falseNegatives: fn } = matrix;

	const total = tp + tn + fp + fn;
	const accuracy = total > 0 ? (tp + tn) / total : 0;
	const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
	const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
	const f1Score = precision + recall > 0 ? (2 * (precision * recall)) / (precision + recall) : 0;

	// False Positive Rate = FP / (FP + TN)
	const falsePositiveRate = fp + tn > 0 ? fp / (fp + tn) : 0;

	// False Negative Rate = FN / (FN + TP)
	const falseNegativeRate = fn + tp > 0 ? fn / (fn + tp) : 0;

	return {
		accuracy: Math.round(accuracy * 10000) / 10000,
		precision: Math.round(precision * 10000) / 10000,
		recall: Math.round(recall * 10000) / 10000,
		f1Score: Math.round(f1Score * 10000) / 10000,
		falsePositiveRate: Math.round(falsePositiveRate * 10000) / 10000,
		falseNegativeRate: Math.round(falseNegativeRate * 10000) / 10000,
		confusionMatrix: matrix,
	};
}

/**
 * Compiles a confusion matrix from expected and predicted labels.
 */
export function compileConfusionMatrix(
	results: { expected: "Human" | "AI"; predicted: "Human" | "AI" }[],
): ConfusionMatrix {
	let truePositives = 0;
	let trueNegatives = 0;
	let falsePositives = 0;
	let falseNegatives = 0;

	for (const res of results) {
		if (res.expected === "AI") {
			if (res.predicted === "AI") {
				truePositives++;
			} else {
				falseNegatives++;
			}
		} else {
			if (res.predicted === "AI") {
				falsePositives++;
			} else {
				trueNegatives++;
			}
		}
	}

	return {
		truePositives,
		trueNegatives,
		falsePositives,
		falseNegatives,
	};
}
