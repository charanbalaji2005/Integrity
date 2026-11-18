import { generateEvidence } from "../utils/evidence";
import { calculateOverallIntegrityScore } from "../utils/overall-integrity-score";
import { mapIntegrityRisk } from "../utils/risk-mapper";
import { runRuleEngine } from "../utils/rules";
import {
	calculateIntegratedScore,
	calculateRulesScore,
	calculateStatisticsScore,
} from "../utils/scoring";
import { calculateTextStatistics } from "../utils/statistics";
import { explainSubmissionEvidence } from "./llm-service";

export interface IntegrityAnalysisResult {
	statistics: ReturnType<typeof calculateTextStatistics>;
	ruleFindings: ReturnType<typeof runRuleEngine>;
	scores: {
		statisticsScore: number;
		rulesScore: number;
		integratedAiScore: number;
	};
	evidence: ReturnType<typeof generateEvidence>;
	risk: ReturnType<typeof mapIntegrityRisk>;
	llmExplanation: string;
	llmExplanationMocked: boolean;
	overallIntegrity: ReturnType<typeof calculateOverallIntegrityScore>;
	recommendation: string;
}

/**
 * Orchestrates the full text analysis pipeline stateless workflow.
 */
export async function analyzeSubmissionText(text: string): Promise<IntegrityAnalysisResult> {
	// 1. Run statistical analysis
	const statistics = calculateTextStatistics(text);

	// 2. Run rule engine
	const ruleFindings = runRuleEngine(text);

	// 3. Calculate statistics score
	const statisticsScore = calculateStatisticsScore(statistics);

	// 4. Calculate rules score
	const rulesScore = calculateRulesScore(ruleFindings);

	// 5. Call mockable LLM explanation service (with no LLM score returned)
	const llmResponse = await explainSubmissionEvidence(text, statistics, ruleFindings);

	// 6. Calculate integrated AI score (LLM is excluded from score generation)
	const integratedAiScore = calculateIntegratedScore(statisticsScore, rulesScore, undefined);

	// 7. Generate structured evidence
	const evidence = generateEvidence(statistics, ruleFindings);

	// 8. Map risk level
	const risk = mapIntegrityRisk(integratedAiScore);

	// 9. Calculate overall integrity score using the integrated AI score
	const overallIntegrity = calculateOverallIntegrityScore({
		aiDetection: integratedAiScore,
	});

	// 10. Return frontend-ready explainability response
	return {
		statistics,
		ruleFindings,
		scores: {
			statisticsScore,
			rulesScore,
			integratedAiScore,
		},
		evidence,
		risk,
		llmExplanation: llmResponse.explanation,
		llmExplanationMocked: llmResponse.mocked,
		overallIntegrity,
		recommendation: risk.action,
	};
}
