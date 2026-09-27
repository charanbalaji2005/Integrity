import { env } from "../../../config/env";
import type { RuleResult } from "../utils/rules";
import type { TextStatistics } from "../utils/statistics";
import type { LLMProvider } from "./llm/llm-provider";
import { MockProvider } from "./llm/mock-provider";
import { OllamaProvider } from "./llm/ollama-provider";
import { OpenAIProvider } from "./llm/openai-provider";

/**
 * Resolves the configured LLM provider instance based on env configs or overrides.
 */
export function getLLMProvider(
	providerOverride?: string,
	apiKeyOverride?: string,
	isTestOverride?: boolean,
): LLMProvider {
	const provider = providerOverride ?? env.LLM_PROVIDER;
	const apiKey = apiKeyOverride ?? env.OPENAI_API_KEY ?? "";
	const isTest = isTestOverride ?? env.NODE_ENV === "test";

	// Force MockProvider in test environments to prevent real HTTP connection hangs
	if (isTest && !providerOverride) {
		return new MockProvider();
	}

	if (provider === "ollama") {
		return new OllamaProvider(env.OLLAMA_MODEL, env.OLLAMA_BASE_URL);
	}

	if (provider === "openai" && apiKey && !isTest) {
		return new OpenAIProvider(apiKey);
	}

	return new MockProvider();
}

/**
 * Orchestrates sending statistical data and rule matches to an LLM provider to explain writing style indicators.
 */
export async function explainSubmissionEvidence(
	text: string,
	stats: TextStatistics,
	ruleResults: RuleResult[],
): Promise<{ explanation: string; mocked: boolean }> {
	const provider = getLLMProvider();
	return provider.explainEvidence(text, stats, ruleResults);
}
