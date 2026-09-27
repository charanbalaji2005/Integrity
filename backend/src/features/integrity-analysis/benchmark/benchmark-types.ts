export type ExpectedLabel = "Human" | "AI";
export type BenchmarkSource =
	| "Human"
	| "ChatGPT"
	| "Claude"
	| "Gemini"
	| "DeepSeek"
	| "Llama"
	| "Paraphrased AI";

export interface BenchmarkSample {
	id: string;
	text: string;
	expectedLabel: ExpectedLabel;
	source: BenchmarkSource;
	notes?: string;
}

export interface BenchmarkPrediction {
	predictedLabel: ExpectedLabel;
	predictedScore: number;
}

export interface ConfusionMatrix {
	truePositives: number; // Expected AI, Predicted AI
	trueNegatives: number; // Expected Human, Predicted Human
	falsePositives: number; // Expected Human, Predicted AI
	falseNegatives: number; // Expected AI, Predicted Human
}

export interface BenchmarkMetrics {
	accuracy: number;
	precision: number;
	recall: number;
	f1Score: number;
	falsePositiveRate: number;
	falseNegativeRate: number;
	confusionMatrix: ConfusionMatrix;
}

export interface BenchmarkReport {
	metrics: BenchmarkMetrics;
	sourceMetrics: Record<
		BenchmarkSource,
		{
			total: number;
			correct: number;
			accuracy: number;
		}
	>;
	predictions: (BenchmarkSample & BenchmarkPrediction & { isCorrect: boolean })[];
}
