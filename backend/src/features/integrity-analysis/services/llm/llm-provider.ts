import type { RuleResult } from "../../utils/rules";
import type { TextStatistics } from "../../utils/statistics";

/**
 * Common abstraction interface for Large Language Model explanation providers.
 */
export interface LLMProvider {
	explainEvidence(
		text: string,
		stats: TextStatistics,
		ruleResults: RuleResult[],
	): Promise<{ explanation: string; mocked: boolean }>;
}
