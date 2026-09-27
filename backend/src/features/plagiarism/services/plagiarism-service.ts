import { env } from "../../../config/env";
import { prisma } from "../../../database";
import { calculateCosineSimilarity, getEmbedding } from "../../assessments/services/vector-service";
import {
	extractText,
	recursiveChunkText,
} from "../../text-extraction/services/text-extraction-service";

export interface MatchedChunk {
	chunk: number;
	similarity: number;
	reason: string;
	matchedText?: string;
}

export interface AnalysisChunk {
	text: string;
	similarity: number;
}

export interface PlagiarismAnalysisResult {
	success: boolean;
	filename: string;
	overallSimilarity: number;
	risk: string;
	confidence: number;
	processingTime: string;
	totalWords: number;
	matchedWords: number;
	uniqueWords: number;
	matchedChunks: MatchedChunk[];
	chunks: AnalysisChunk[];
	aiExplanation: string;
	manualReview: boolean;
	generatedAt: string;
	extractedText: string;
}

const PRESET_CORPUS = [
	{
		text: "artificial intelligence is the simulation of human intelligence processes by machines, especially computer systems. these processes include learning, reasoning, and self-correction. typical applications of ai include expert systems, natural language processing, speech recognition and machine vision.",
		source: "Artificial Intelligence Definition",
	},
	{
		text: "the assessment integrity platform ensures academic honesty by employing webcam monitoring, browser lockdowns, and advanced biometric checks during online examinations. the system continuously logs violations such as tab switching, gaze away anomalies, and multiple faces detection to maintain assessment credibility.",
		source: "Assessment Integrity Policy",
	},
	{
		text: "data science combines math and statistics, specialized programming, advanced analytics, artificial intelligence, and machine learning to uncover actionable insights. these insights help guide decision-making and strategic planning in businesses and research institutions.",
		source: "Data Science Fundamentals",
	},
	{
		text: "operating systems manage computer hardware and software resources and provide common services for computer programs. key concepts include multitasking, memory management, virtual memory, file systems, and device drivers to establish stable runtimes.",
		source: "Operating Systems Lecture Notes",
	},
];

let cachedPresetChunks: Array<{ text: string; embedding: number[] }> | null = null;

async function getPresetChunks(): Promise<Array<{ text: string; embedding: number[] }>> {
	if (cachedPresetChunks) return cachedPresetChunks;
	const results: Array<{ text: string; embedding: number[] }> = [];
	for (const preset of PRESET_CORPUS) {
		const chunks = recursiveChunkText(preset.text, 300, 30);
		for (const ch of chunks) {
			const emb = await getEmbedding(ch);
			results.push({ text: ch, embedding: emb });
		}
	}
	cachedPresetChunks = results;
	return results;
}

export async function analyzeDocumentPlagiarism(
	fileBuffer: Buffer,
	filename: string,
	mimetype: string,
): Promise<PlagiarismAnalysisResult> {
	const startTime = Date.now();

	// 1. Text Extraction
	console.log(`[Plagiarism] Starting text extraction for file: ${filename}`);
	const base64File = fileBuffer.toString("base64");
	const extractedText = await extractText(base64File, mimetype);

	if (!extractedText.trim()) {
		throw new Error("The uploaded document contains no readable text.");
	}

	const normalizedText = extractedText.trim().toLowerCase().replace(/\s+/g, " ");
	const totalWords = extractedText
		.trim()
		.split(/\s+/)
		.filter((w) => w.length > 0).length;
	console.log(`[Plagiarism] Text extraction complete. Total words: ${totalWords}`);

	// 2. Chunking
	console.log(`[Plagiarism] Generating chunks...`);
	const docChunks = recursiveChunkText(extractedText, 300, 30);
	console.log(`[Plagiarism] Generated ${docChunks.length} chunks.`);

	// 3. Load Comparison Targets (Presets & DB Answers)
	console.log(`[Plagiarism] Preparing comparison corpus...`);
	const presetChunks = await getPresetChunks();

	const dbAnswers = await prisma.answer.findMany({
		where: { embedding: { not: null } },
		select: { response: true, embedding: true },
	});

	const dbTargets: Array<{ text: string; embedding: number[] }> = [];
	for (const ans of dbAnswers) {
		if (!ans.embedding) continue;
		try {
			const embedding = JSON.parse(ans.embedding) as number[];
			dbTargets.push({ text: ans.response, embedding });
		} catch {
			// ignore parsing errors
		}
	}

	// Combine targets
	const targets = [...presetChunks, ...dbTargets];

	// 4. Generate Embeddings & Compute Cosine Similarity
	console.log(`[Plagiarism] Generating document embedding & matching chunks...`);
	const docEmbedding = await getEmbedding(normalizedText);

	let overallSimilarity = 0;
	for (const target of targets) {
		const sim = calculateCosineSimilarity(docEmbedding, target.embedding);
		if (sim > overallSimilarity) {
			overallSimilarity = sim;
		}
	}

	const overallSimPercent = Math.round(overallSimilarity * 100);

	// Match Chunks
	const matchedChunks: MatchedChunk[] = [];
	const chunksResult: AnalysisChunk[] = [];
	let matchedWordsCount = 0;

	for (let i = 0; i < docChunks.length; i++) {
		const docChunk = docChunks[i]!;
		const docChunkEmb = await getEmbedding(docChunk);

		let maxChunkSim = 0;
		let bestMatchedText = "";

		for (const target of targets) {
			const sim = calculateCosineSimilarity(docChunkEmb, target.embedding);
			if (sim > maxChunkSim) {
				maxChunkSim = sim;
				bestMatchedText = target.text;
			}
		}

		const chunkSimPercent = Math.round(maxChunkSim * 100);
		chunksResult.push({
			text: docChunk,
			similarity: chunkSimPercent,
		});

		if (chunkSimPercent >= 50) {
			matchedChunks.push({
				chunk: i + 1,
				similarity: chunkSimPercent,
				reason:
					chunkSimPercent >= 85
						? "High semantic replication"
						: chunkSimPercent >= 70
							? "Moderate semantic similarity"
							: "Low semantic overlap",
				matchedText: bestMatchedText.slice(0, 150) + (bestMatchedText.length > 150 ? "..." : ""),
			});

			const wordsInChunk = docChunk.split(/\s+/).filter((w) => w.length > 0).length;
			matchedWordsCount += wordsInChunk;
		}
	}

	const matchedWords = Math.min(totalWords, matchedWordsCount);
	const uniqueWords = Math.max(0, totalWords - matchedWords);

	// Risk Classification
	let risk = "Low";
	if (overallSimPercent > 60) risk = "Very High";
	else if (overallSimPercent > 30) risk = "High";
	else if (overallSimPercent > 10) risk = "Moderate";

	const confidence = Math.round(Math.min(1.0, 0.85 + overallSimPercent / 1000) * 100) / 100;

	// 5. AI Plagiarism Explanation via Ollama
	console.log(`[Plagiarism] Querying AI model for plagiarized explanation...`);
	let aiExplanation = `The document "${filename}" has been analyzed. The overall semantic similarity to historical submissions and institutional references is ${overallSimPercent}%, placing it in the ${risk} risk category.`;
	let manualReview = overallSimPercent > 30;

	try {
		const prompt = `
      You are an AI plagiarism analysis agent. Generate a neutral, objective explanation for the plagiarism report of an uploaded document.
      
      Document Filename: "${filename}"
      Overall Similarity: ${overallSimPercent}%
      Plagiarism Risk Level: ${risk}
      Total Words: ${totalWords}
      Matched Words: ${matchedWords}
      Unique Words: ${uniqueWords}
      
      Explain why similarity exists, describe which sections are similar (historical records or institutional references), and whether a manual review is recommended. Do not make biased or accusatory conclusions. Write in a neutral, professional academic tone.
      
      Return JSON object in EXACTLY this format:
      {
        "explanation": "<your explanation here>",
        "manualReview": <boolean>
      }
    `;

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 6000); // 6 sec timeout

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
				aiExplanation = parsed.explanation;
				manualReview = !!parsed.manualReview;
			}
		}
	} catch (err) {
		console.log(
			`[Plagiarism] AI explanation generation failed or timed out. Falling back to deterministic description.`,
		);
	}

	const processingTime = ((Date.now() - startTime) / 1000).toFixed(1) + "s";
	console.log(
		`[Plagiarism] Plagiarism analysis complete in ${processingTime}. Overall Similarity: ${overallSimPercent}%`,
	);

	return {
		success: true,
		filename,
		overallSimilarity: overallSimPercent,
		risk,
		confidence,
		processingTime,
		totalWords,
		matchedWords,
		uniqueWords,
		matchedChunks,
		chunks: chunksResult,
		aiExplanation,
		manualReview,
		generatedAt: new Date().toISOString(),
		extractedText,
	};
}
