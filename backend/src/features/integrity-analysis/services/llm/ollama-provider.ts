import { INTEGRITY_ANALYSIS_PROMPT } from "../../constants/prompts";
import type { RuleResult } from "../../utils/rules";
import type { TextStatistics } from "../../utils/statistics";
import type { LLMProvider } from "./llm-provider";

/**
 * Local LLM provider executing analysis prompts on Ollama local servers.
 */
export class OllamaProvider implements LLMProvider {
	constructor(
		private model: string,
		private baseUrl: string,
	) {}

	async explainEvidence(
		text: string,
		stats: TextStatistics,
		ruleResults: RuleResult[],
	): Promise<{ explanation: string; mocked: boolean }> {
		const statsSummary = JSON.stringify(
			{
				typeTokenRatio: stats.typeTokenRatio,
				vocabularyRichness: stats.vocabularyRichness,
				averageSentenceLength: stats.averageSentenceLength,
				sentenceLengthStdDev: stats.sentenceLengthStdDev,
				stopWordRatio: stats.stopWordRatio,
				paragraphVariance: stats.paragraphVariance,
			},
			null,
			2,
		);

		const rulesSummary = JSON.stringify(
			ruleResults.map((r) => ({
				name: r.name,
				count: r.count,
				severity: r.severity,
			})),
			null,
			2,
		);

		const prompt = `${INTEGRITY_ANALYSIS_PROMPT}\n\nAnalyze this submission:\n\nTEXT:\n"""${text}"""\n\nWRITING STATISTICS:\n${statsSummary}\n\nRULE FINDINGS:\n${rulesSummary}`;

		try {
			const response = await fetch(`${this.baseUrl}/api/generate`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: this.model,
					prompt: prompt,
					stream: false,
				}),
			});

			if (!response.ok) {
				throw new Error(`Ollama server returned status: ${response.status}`);
			}

			const data = (await response.json()) as { response: string };

			return {
				explanation: data.response || "No explanation returned.",
				mocked: false,
			};
		} catch (error) {
			const errMsg = error instanceof Error ? error.message : String(error);
			console.warn("Ollama API call failed, falling back to mock provider:", errMsg);

			const activeRules = ruleResults.filter((r) => r.count > 0).map((r) => r.name);
			const ruleSummary =
				activeRules.length > 0
					? `matched several style markers including ${activeRules.join(", ")}`
					: "did not match any major style markers";

			const explanation = `[MOCKED OLLAMA FALLBACK] The submission has an average sentence length of ${stats.averageSentenceLength.toFixed(1)} words with a standard deviation of ${stats.sentenceLengthStdDev.toFixed(2)}. The vocabulary richness is ${stats.vocabularyRichness.toFixed(3)} and the text ${ruleSummary}. In accordance with the evaluation guidelines, no definitive guilt or AI probability classification is determined. The writing patterns show uniform paragraph distributions and formal transition flows.`;

			return {
				explanation,
				mocked: true,
			};
		}
	}
}
