export type RiskLevel = "Very Low" | "Low" | "Medium" | "High" | "Critical";

export interface RiskMapping {
	score: number;
	clampedScore: number;
	riskLevel: RiskLevel;
	action: string;
	range: string;
}

/**
 * Maps a numerical integrity score to a risk level, action, and description.
 * Clamps the score between 0 and 100 automatically.
 */
export function mapIntegrityRisk(score: number): RiskMapping {
	const clampedScore = Math.max(0, Math.min(100, score));

	let riskLevel: RiskLevel = "Very Low";
	let action = "No action";
	let range = "0–20";

	if (clampedScore >= 0 && clampedScore <= 20) {
		riskLevel = "Very Low";
		action = "No action";
		range = "0–20";
	} else if (clampedScore > 20 && clampedScore <= 40) {
		riskLevel = "Low";
		action = "Store result";
		range = "21–40";
	} else if (clampedScore > 40 && clampedScore <= 60) {
		riskLevel = "Medium";
		action = "Flag for review if combined with other signals";
		range = "41–60";
	} else if (clampedScore > 60 && clampedScore <= 80) {
		riskLevel = "High";
		action = "Recommend faculty review";
		range = "61–80";
	} else {
		riskLevel = "Critical";
		action = "Strong recommendation for manual review";
		range = "81–100";
	}

	return {
		score,
		clampedScore,
		riskLevel,
		action,
		range,
	};
}
