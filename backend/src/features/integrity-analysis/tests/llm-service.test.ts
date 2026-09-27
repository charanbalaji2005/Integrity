// Set env variables at top before imports run
process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/db";
process.env.BETTER_AUTH_SECRET = "dummy-secret-for-tests";
process.env.BETTER_AUTH_URL = "http://localhost:3000";

import { describe, expect, it } from "vitest";
import { MockProvider } from "../services/llm/mock-provider";
import { OllamaProvider } from "../services/llm/ollama-provider";
import { OpenAIProvider } from "../services/llm/openai-provider";
import { getLLMProvider } from "../services/llm-service";

describe("LLM Service Providers & Factory Selection", () => {
	it("should select OllamaProvider when provider setting is 'ollama'", () => {
		const provider = getLLMProvider("ollama", "", true);
		expect(provider).toBeInstanceOf(OllamaProvider);
	});

	it("should select OpenAIProvider when provider setting is 'openai' and API key is present outside test mode", () => {
		const provider = getLLMProvider("openai", "sk-12345", false);
		expect(provider).toBeInstanceOf(OpenAIProvider);
	});

	it("should select MockProvider when provider setting is 'openai' but key is missing", () => {
		const provider = getLLMProvider("openai", "", false);
		expect(provider).toBeInstanceOf(MockProvider);
	});

	it("should fallback to MockProvider when test mode is active for OpenAI", () => {
		const provider = getLLMProvider("openai", "sk-12345", true);
		expect(provider).toBeInstanceOf(MockProvider);
	});

	it("should fall back to mock explanation if Ollama endpoint is down or unavailable", async () => {
		// Instantiate an OllamaProvider pointing to an invalid port/dead service URL
		const provider = new OllamaProvider("llama3.2", "http://localhost:9999");

		const stats = {
			typeTokenRatio: 0.5,
			vocabularyRichness: 0.8,
			averageSentenceLength: 12.0,
			sentenceLengthStdDev: 3.5,
			wordFrequencyDistribution: {},
			stopWordRatio: 0.4,
			averageSyllablesPerWord: 1.5,
			fleschReadingEase: 60,
			fleschKincaidGrade: 8,
			characterEntropy: 4.5,
			paragraphVariance: 1.5,
			averagePunctuationDensity: 0.05,
			nGramRepetition: { bigram: 0.1, trigram: 0.02 },
			rareWordFrequency: 0.5,
			repeatedSentenceOpenings: 0.0,
		};

		const rules = [
			{
				name: "Academic Connectors",
				count: 2,
				severity: "low" as const,
				explanation: "",
				matchedExamples: [],
			},
		];

		// Attempt to explain evidence — it should fail to connect to port 9999 and fall back to mock returns
		const result = await provider.explainEvidence("Student essay text...", stats, rules);

		expect(result.mocked).toBe(true);
		expect(result.explanation).toContain("[MOCKED OLLAMA FALLBACK]");
		expect(result.explanation).toContain("Academic Connectors");
	});
});
