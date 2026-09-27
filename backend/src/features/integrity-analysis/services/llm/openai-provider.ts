import OpenAI from "openai";
import { INTEGRITY_ANALYSIS_PROMPT } from "../../constants/prompts";
import type { RuleResult } from "../../utils/rules";
import type { TextStatistics } from "../../utils/statistics";
import type { LLMProvider } from "./llm-provider";

/**
 * Concrete LLM provider for the OpenAI API wrapper using the official SDK.
 */
export class OpenAIProvider implements LLMProvider {
	private openai: OpenAI;

	constructor(apiKey: string) {
		this.openai = new OpenAI({ apiKey });
	}

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

		try {
			const response = await this.openai.chat.completions.create({
				model: "gpt-4o-mini",
				messages: [
					{ role: "system", content: INTEGRITY_ANALYSIS_PROMPT },
					{
						role: "user",
						content: `Analyze this submission:\n\nTEXT:\n"""${text}"""\n\nWRITING STATISTICS:\n${statsSummary}\n\nRULE FINDINGS:\n${rulesSummary}`,
					},
				],
			});

			return {
				explanation: response.choices[0]?.message?.content || "No explanation returned.",
				mocked: false,
			};
		} catch (error) {
			console.error("OpenAI API call failed, falling back to mock:", error);
			return {
				explanation: `[FALLBACK ANALYSIS] The submission presents an average sentence length of ${stats.averageSentenceLength.toFixed(1)} words with a standard deviation of ${stats.sentenceLengthStdDev.toFixed(2)}. The writing displays high grammatical consistency and standard academic formatting structure.`,
				mocked: true,
			};
		}
	}
}
