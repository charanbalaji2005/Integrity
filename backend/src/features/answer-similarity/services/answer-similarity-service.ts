import { env } from "../../../config/env";
import { calculateCosineSimilarity, getEmbedding } from "../../assessments/services/vector-service";
import { recursiveChunkText } from "../../text-extraction/services/text-extraction-service";

export interface SimilarityAnalysisResult {
	studentChunks: string[];
	rubricChunks: string[];
	chunkMatches: Array<{
		studentChunk: string;
		matchedRubricChunk: string;
		similarity: number;
	}>;
	averageSimilarity: number;
	overallSimilarity: number;
	riskScore: number;
	explanation: string;
}

function normalizeText(text: string): string {
	return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function analyzeSimilarity(
	studentAnswer: string,
	correctAnswer: string,
): Promise<SimilarityAnalysisResult> {
	const normStudent = normalizeText(studentAnswer);
	const normCorrect = normalizeText(correctAnswer);

	// 1. Chunking
	const studentChunks = recursiveChunkText(studentAnswer, 300, 30);
	const rubricChunks = recursiveChunkText(correctAnswer, 300, 30);

	// 2. Generate Embeddings & Match Chunks
	const studentEmbeddings = await Promise.all(studentChunks.map((c) => getEmbedding(c)));
	const rubricEmbeddings = await Promise.all(rubricChunks.map((c) => getEmbedding(c)));

	const chunkMatches: Array<{
		studentChunk: string;
		matchedRubricChunk: string;
		similarity: number;
	}> = [];

	let totalSimilarity = 0;

	for (let i = 0; i < studentChunks.length; i++) {
		const sChunk = studentChunks[i]!;
		const sEmb = studentEmbeddings[i]!;

		let bestMatchIdx = -1;
		let maxSim = -1;

		for (let j = 0; j < rubricChunks.length; j++) {
			const rEmb = rubricEmbeddings[j]!;
			const sim = calculateCosineSimilarity(sEmb, rEmb);
			if (sim > maxSim) {
				maxSim = sim;
				bestMatchIdx = j;
			}
		}

		const matchedChunk = bestMatchIdx !== -1 ? rubricChunks[bestMatchIdx]! : "";
		chunkMatches.push({
			studentChunk: sChunk,
			matchedRubricChunk: matchedChunk,
			similarity: Math.round(maxSim * 100) / 100,
		});
		totalSimilarity += maxSim;
	}

	const averageSimilarity =
		studentChunks.length > 0 ? Math.round((totalSimilarity / studentChunks.length) * 100) / 100 : 0;

	// Compute overall similarity (embeddings of normalized full texts)
	const fullStudentEmb = await getEmbedding(normStudent);
	const fullCorrectEmb = await getEmbedding(normCorrect);
	const overallSimilarity =
		Math.round(calculateCosineSimilarity(fullStudentEmb, fullCorrectEmb) * 100) / 100;

	// 3. AI Explanation & Risk Score via Ollama
	let riskScore = Math.round(overallSimilarity * 100);
	let explanation = `The student answer shows a semantic similarity of ${riskScore}% to the rubric.`;

	try {
		const prompt = `
      You are an AI similarity analysis agent. Compare the student answer with the correct answer/rubric and explain their semantic similarity and estimate a copying/plagiarism risk score (0 to 100).
      
      Student Response: "${studentAnswer}"
      Rubric/Correct Answer: "${correctAnswer}"
      Calculated Cosine Similarity: ${overallSimilarity}
      
      Return JSON object in EXACTLY this format:
      {
        "riskScore": <number 0 to 100>,
        "explanation": "<analysis explanation>"
      }
    `;

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 4000); // 4 sec timeout

		const url = `${env.OLLAMA_BASE_URL.replace(/\/$/, "")}/api/chat`;
		const res = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: env.OLLAMA_CHAT_MODEL,
				messages: [{ role: "user", content: prompt }],
				format: "json",
				stream: false,
			}),
			signal: controller.signal,
		});

		clearTimeout(timeoutId);

		if (res.ok) {
			const data = (await res.json()) as any;
			const content = data.message?.content;
			if (content) {
				const parsed = JSON.parse(content.trim());
				riskScore = Number(parsed.riskScore);
				explanation = parsed.explanation;
			}
		}
	} catch (err) {
		// Fail open/back to cosine-based defaults
		explanation = `Deterministic embedding similarity is ${Math.round(overallSimilarity * 100)}%. The response matches the key semantic themes of the rubric. Plagiarism risk is estimated at ${riskScore}%.`;
	}

	return {
		studentChunks,
		rubricChunks,
		chunkMatches,
		averageSimilarity,
		overallSimilarity,
		riskScore,
		explanation,
	};
}
