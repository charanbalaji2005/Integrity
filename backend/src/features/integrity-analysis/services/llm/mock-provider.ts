import type { RuleResult } from "../../utils/rules";
import type { TextStatistics } from "../../utils/statistics";
import type { LLMProvider } from "./llm-provider";

/**
 * Fallback local model engine mock provider for local development or testing environments.
 */
export class MockProvider implements LLMProvider {
	async explainEvidence(
		_text: string,
		stats: TextStatistics,
		ruleResults: RuleResult[],
	): Promise<{ explanation: string; mocked: boolean }> {
		const activeRules = ruleResults.filter((r) => r.count > 0).map((r) => r.name);
		const ruleSummary =
			activeRules.length > 0
				? `matched several style markers including ${activeRules.join(", ")}`
				: "did not match any major style markers";

		const explanation = `[MOCKED ANALYSIS] The submission has an average sentence length of ${stats.averageSentenceLength.toFixed(1)} words with a standard deviation of ${stats.sentenceLengthStdDev.toFixed(2)}. The vocabulary richness is ${stats.vocabularyRichness.toFixed(3)} and the text ${ruleSummary}. In accordance with the evaluation guidelines, no definitive guilt or AI probability classification is determined. The writing patterns show uniform paragraph distributions and formal transition flows.`;

		return { explanation, mocked: true };
	}
}
