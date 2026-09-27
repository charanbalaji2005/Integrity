import { prisma } from "../../../database";

/**
 * Generate a deterministic pseudo-embedding vector of 384 dimensions.
 * This is a highly robust, math-based fallback for local environments
 * when Ollama or external embedding APIs are not running.
 * It computes unit vectors where dot product represents semantic/lexical similarity.
 */
export function generatePseudoEmbedding(text: string): number[] {
	const dimensions = 384;
	const vector = new Array(dimensions).fill(0);

	if (!text || text.trim() === "") {
		return vector;
	}

	const cleanText = text.toLowerCase().replace(/[^\w\s]/g, " ");
	const words = cleanText.split(/\s+/).filter((w) => w.length > 0);

	// Helper to generate a deterministic random number based on word seed
	const seededRandom = (seedStr: string) => {
		let hash = 0;
		for (let i = 0; i < seedStr.length; i++) {
			hash = seedStr.charCodeAt(i) + ((hash << 5) - hash);
		}
		return () => {
			// Linear congruential generator with hash seed
			const x = Math.sin(hash++) * 10000;
			return x - Math.floor(x);
		};
	};

	// Add word-level features to the vector
	for (const word of words) {
		const nextRand = seededRandom(word);
		// Project each word onto 5 random dimensions with positive/negative values
		for (let i = 0; i < 6; i++) {
			const dim = Math.floor(nextRand() * dimensions);
			const weight = nextRand() * 2 - 1; // range -1 to 1
			vector[dim] += weight;
		}
	}

	// Add character-level n-gram (trigrams) features to handle typos/close matches
	for (let i = 0; i < text.length - 2; i++) {
		const trigram = text.substring(i, i + 3).toLowerCase();
		const nextRand = seededRandom(trigram);
		for (let j = 0; j < 3; j++) {
			const dim = Math.floor(nextRand() * dimensions);
			const weight = (nextRand() * 2 - 1) * 0.3; // lower weight for char ngrams
			vector[dim] += weight;
		}
	}

	// Normalize to unit vector (L2 norm = 1.0)
	let sumOfSquares = 0;
	for (let i = 0; i < dimensions; i++) {
		sumOfSquares += vector[i] * vector[i];
	}

	const magnitude = Math.sqrt(sumOfSquares);
	if (magnitude > 0) {
		for (let i = 0; i < dimensions; i++) {
			vector[i] = vector[i] / magnitude;
		}
	}

	return vector;
}

/**
 * Generate embedding using Ollama if running, otherwise fallback to pseudo-embedding.
 */
export async function getEmbedding(text: string): Promise<number[]> {
	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout

		// Try calling local Ollama embedding API
		const res = await fetch("http://localhost:11434/api/embeddings", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: "nomic-embed-text",
				prompt: text,
			}),
			signal: controller.signal,
		});

		clearTimeout(timeoutId);

		if (res.ok) {
			const data = (await res.json()) as any;
			if (data.embedding && Array.isArray(data.embedding)) {
				return data.embedding;
			}
		}
	} catch (err) {
		// Ollama not running or model not found, silent fallback to pseudo embedding
	}

	return generatePseudoEmbedding(text);
}

/**
 * Calculate cosine similarity between two numeric vectors.
 */
export function calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
	if (vecA.length !== vecB.length || vecA.length === 0) return 0;

	let dotProduct = 0;
	let normA = 0;
	let normB = 0;

	for (let i = 0; i < vecA.length; i++) {
		dotProduct += vecA[i] * vecB[i];
		normA += vecA[i] * vecA[i];
		normB += vecB[i] * vecB[i];
	}

	if (normA === 0 || normB === 0) return 0;
	return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface VectorSearchResult {
	answerId: string;
	response: string;
	score: number;
	similarity: number;
	manualGrade: number | null;
	aiGrade: number | null;
	feedback: string | null;
	overrideStatus: string;
	studentName: string;
}

/**
 * Retrieve similar historical answers for the given question to maintain institutional consistency.
 */
export async function findSimilarAnswers(
	questionId: string,
	targetEmbedding: number[],
	excludeAttemptId?: string,
	limit = 5,
): Promise<VectorSearchResult[]> {
	// Query all answers for this question
	const answers = await prisma.answer.findMany({
		where: {
			questionId,
			embedding: { not: null },
			attempt: {
				id: excludeAttemptId ? { not: excludeAttemptId } : undefined,
				status: { in: ["submitted", "graded"] }, // only compare completed attempts
			},
		},
		include: {
			attempt: true,
		},
	});

	const results: VectorSearchResult[] = [];

	for (const ans of answers) {
		if (!ans.embedding) continue;
		try {
			const vector = JSON.parse(ans.embedding) as number[];
			const similarity = calculateCosineSimilarity(targetEmbedding, vector);

			results.push({
				answerId: ans.id,
				response: ans.response,
				score: ans.manualGrade !== null ? ans.manualGrade : ans.aiGrade || 0,
				similarity,
				manualGrade: ans.manualGrade,
				aiGrade: ans.aiGrade,
				feedback: ans.feedback,
				overrideStatus: ans.overrideStatus,
				studentName: ans.attempt.studentName,
			});
		} catch (e) {
			// Ignore malformed embeddings
		}
	}

	// Sort by similarity descending
	results.sort((a, b) => b.similarity - a.similarity);

	return results.slice(0, limit);
}
