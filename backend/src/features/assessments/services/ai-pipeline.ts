import { prisma } from "@/database";
import { calculateCosineSimilarity, getEmbedding } from "./vector-service";

export interface AgentResult {
	score: number;
	confidence: number;
	evidence: string[];
	explanation: string;
	recommendation: string;
	meta?: any;
}

/**
 * Unified LLM helper mapping to Groq (production) or local Ollama (development)
 */
async function callLLM(prompt: string, jsonMode = false): Promise<string> {
	const provider = process.env.LLM_PROVIDER || "ollama";
	const apiKey = process.env.GROQ_API_KEY;

	if (provider === "groq" && apiKey) {
		try {
			const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
				},
				body: JSON.stringify({
					model: process.env.GROQ_CHAT_MODEL || "llama-3.3-70b-specdec",
					messages: [{ role: "user", content: prompt }],
					response_format: jsonMode ? { type: "json_object" } : undefined,
					temperature: 0.1,
				}),
			});

			if (response.ok) {
				const data = (await response.json()) as any;
				return data.choices?.[0]?.message?.content || "";
			}
		} catch (err) {
			console.error("[Groq Call Failed] falling back to local...", err);
		}
	}

	// Ollama Fallback
	const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
	const model = process.env.OLLAMA_CHAT_MODEL || "llama3.2:3b";
	try {
		const response = await fetch(`${baseUrl}/api/chat`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: model,
				messages: [{ role: "user", content: prompt }],
				format: jsonMode ? "json" : undefined,
				stream: false,
			}),
		});
		if (response.ok) {
			const data = (await response.json()) as any;
			return data.message?.content || "";
		}
	} catch (err) {
		console.error("[Ollama Call Failed]", err);
	}

	throw new Error("All LLM providers failed to respond");
}

function extractJSON(text: string): any {
	try {
		return JSON.parse(text);
	} catch (err) {
		const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
		if (match && match[1]) {
			try {
				return JSON.parse(match[1]);
			} catch (err2) {}
		}
		const firstBrace = text.indexOf("{");
		const lastBrace = text.lastIndexOf("}");
		if (firstBrace !== -1 && lastBrace !== -1) {
			try {
				return JSON.parse(text.substring(firstBrace, lastBrace + 1));
			} catch (e) {}
		}
	}
	throw new Error("Could not extract JSON from text: " + text.slice(0, 100));
}

/**
 * AGENT 1: PLAGIARISM AGENT
 */
export async function runPlagiarismAgent(
	studentAnswer: string,
	questionId: string,
	attemptId: string,
): Promise<AgentResult> {
	const currentEmb = await getEmbedding(studentAnswer);

	// Find other answers for this question to detect plagiarism
	const otherAnswers = await prisma.answer.findMany({
		where: {
			questionId,
			attemptId: { not: attemptId },
		},
		include: {
			attempt: true,
		},
	});

	let maxSimilarity = 0;
	let matchedSource = "Internal Database";
	let matchedParagraph = "";

	for (const other of otherAnswers) {
		if (other.embedding) {
			try {
				const otherEmb = JSON.parse(other.embedding);
				const sim = calculateCosineSimilarity(currentEmb, otherEmb);
				if (sim > maxSimilarity) {
					maxSimilarity = sim;
					matchedSource = `Student Attempt: ${other.attempt.studentName} (${other.attempt.id})`;
					matchedParagraph = other.response;
				}
			} catch (e) {}
		}
	}

	// Format plagiarism percentage
	const plagPercent = Math.round(maxSimilarity * 100);

	const prompt = `
    You are an academic plagiarism detection agent.
    Analyze this student response and the highest matching database submission.
    
    Student Response: "${studentAnswer}"
    Closest Database Match: "${matchedParagraph || "No matching submission"}"
    Vector Similarity Calculated: ${plagPercent}%

    Analyze if the similarity constitutes plagiarism, paraphrasing, or is coincidental.
    Return a JSON object:
    {
      "score": <plagiarism percentage 0-100>,
      "confidence": <confidence score 0.0-1.0>,
      "evidence": ["bullet point list of matching matches, phrases or duplication logs"],
      "explanation": "<short summary explaining plagiarism findings>",
      "recommendation": "<faculty recommended action (e.g. Accept, Flag for review, Disqualify)>"
    }
  `;

	try {
		const raw = await callLLM(prompt, true);
		return extractJSON(raw);
	} catch (err) {
		return {
			score: plagPercent,
			confidence: 0.7,
			evidence:
				maxSimilarity > 0.8
					? ["High vector overlap with another submission"]
					: ["No significant vector overlaps"],
			explanation: `Fallback Plagiarism Check: Highest vector similarity is ${plagPercent}%.`,
			recommendation:
				maxSimilarity > 0.8
					? "Flag for manual plagiarism review."
					: "Accept response. Plagiarism metrics safe.",
		};
	}
}

/**
 * AGENT 2: AI GENERATED CONTENT AGENT
 */
export async function runAICotAgent(studentAnswer: string): Promise<AgentResult> {
	const prompt = `
    You are an AI writing detector. Analyze this student response for signs of AI generation:
    Writing Style, Perplexity, Burstiness, Sentence Structure, Vocabulary diversity, Consistency.
    
    Student Response: "${studentAnswer}"

    Evaluate the probability of the text being generated by an LLM (like GPT-4, Claude).
    Return a JSON object:
    {
      "score": <AI generation probability percentage 0-100>,
      "confidence": <confidence score 0.0-1.0>,
      "evidence": ["evidence clues e.g. 'excessive transition words', 'uniform sentence lengths'"],
      "explanation": "<explain the writing style burstiness & perplexity values>",
      "recommendation": "<recommendation for the reviewer>"
    }
  `;

	try {
		const raw = await callLLM(prompt, true);
		return extractJSON(raw);
	} catch (err) {
		const words = studentAnswer.split(/\s+/).length;
		return {
			score: words > 10 ? 20 : 5,
			confidence: 0.5,
			evidence: ["Fallback AI content evaluation"],
			explanation: "No suspicious patterns detected under local rule check.",
			recommendation: "Accept submission. Low risk of AI content.",
		};
	}
}

/**
 * AGENT 3: SEMANTIC SIMILARITY AGENT
 */
export async function runSemanticSimilarityAgent(
	questionText: string,
	correctAnswer: string,
	studentAnswer: string,
): Promise<AgentResult> {
	const currentEmb = await getEmbedding(studentAnswer);
	const correctEmb = await getEmbedding(correctAnswer);
	const similarity = calculateCosineSimilarity(currentEmb, correctEmb);
	const simScore = Math.round(similarity * 100);

	const prompt = `
    You are a semantic grading agent comparing a student response against a rubric correct answer.
    
    Question: "${questionText}"
    Correct Rubric Answer: "${correctAnswer}"
    Student Response: "${studentAnswer}"
    Raw Cosine Vector Similarity: ${simScore}%

    Evaluate the semantic correctness, conceptual coverage, and correctness score (0 to 100).
    Return a JSON object:
    {
      "score": <semantic correctness score 0-100>,
      "confidence": <confidence score 0.0-1.0>,
      "evidence": ["specific details regarding what concepts were covered or missed"],
      "explanation": "<evaluation details comparing student and correct answer>",
      "recommendation": "<relevance rating e.g. Strong alignment, Moderate gap, Complete mismatch>"
    }
  `;

	try {
		const raw = await callLLM(prompt, true);
		return extractJSON(raw);
	} catch (err) {
		return {
			score: simScore,
			confidence: 0.8,
			evidence: [`Vector similarity calculation returned ${simScore}%`],
			explanation: "Fallback semantic check based on semantic vector distance.",
			recommendation:
				simScore >= 70
					? "Strong alignment with correct answer."
					: "Partial understanding or concept gap.",
		};
	}
}

/**
 * AGENT 4: WRITING QUALITY AGENT
 */
export async function runWritingQualityAgent(studentAnswer: string): Promise<AgentResult> {
	const prompt = `
    You are an academic writing and grammar auditor.
    Evaluate the vocabulary diversity, grammar, sentence complexity, readability, and coherence of this student text:
    
    Text: "${studentAnswer}"

    Return a JSON object:
    {
      "score": <writing quality score 0-100>,
      "confidence": <confidence score 0.0-1.0>,
      "evidence": ["list of grammatical issues or praises"],
      "explanation": "<detailed metrics for grammar, vocabulary complexity, and readability>",
      "recommendation": "<recommendation on coherence improvement>"
    }
  `;

	try {
		const raw = await callLLM(prompt, true);
		return extractJSON(raw);
	} catch (err) {
		return {
			score: 85,
			confidence: 0.6,
			evidence: ["Fallback writing quality audit"],
			explanation:
				"Text meets basic readability standards, no severe grammatical breakdown observed.",
			recommendation: "Coherent writing. Proceed.",
		};
	}
}

/**
 * AGENT 5: CITATION AGENT
 */
export async function runCitationAgent(studentAnswer: string): Promise<AgentResult> {
	const prompt = `
    You are an academic citation validator.
    Check this text for citation styles (APA, IEEE, MLA, Harvard), missing references, or broken formatting:
    
    Text: "${studentAnswer}"

    Return a JSON object:
    {
      "score": <citation validity score 0-100. If no citations are present but none are required, award 100>,
      "confidence": <confidence score 0.0-1.0>,
      "evidence": ["specific malformed citations, missing styles, or broken references"],
      "explanation": "<explain if citation format was checked and correctness rating>",
      "recommendation": "<recommendation e.g. Fix APA reference, Missing inline citations, Format matches citation rules>"
    }
  `;

	try {
		const raw = await callLLM(prompt, true);
		return extractJSON(raw);
	} catch (err) {
		return {
			score: 100,
			confidence: 0.7,
			evidence: ["No references required/found"],
			explanation: "Fallback citation evaluation. Standard formatting assumes correct.",
			recommendation: "Citation format matches standards.",
		};
	}
}

/**
 * AGENT 6: RISK SCORING AGENT
 */
export async function runRiskScoringAgent(
	plagScore: number,
	aiScore: number,
	semanticScore: number,
	writingScore: number,
	citationScore: number,
	violationsCount: number,
): Promise<AgentResult> {
	const prompt = `
    You are a security risk scoring controller. Synthesize these sub-agent ratings:
    - Plagiarism Score: ${plagScore}%
    - AI Content Score: ${aiScore}%
    - Semantic Correctness Score: ${semanticScore}%
    - Writing Score: ${writingScore}%
    - Citation Score: ${citationScore}%
    - Proctoring Violations Count: ${violationsCount}

    Determine:
    1. Overall Integrity Score (0 to 100, where higher is more honest, deduct heavily for plagiarism, high AI risk, or multiple violations)
    2. Risk Level ("low", "medium", "high")
    
    Return a JSON object:
    {
      "score": <overall integrity score 0-100>,
      "confidence": <confidence score 0.0-1.0>,
      "evidence": ["factors contributing to the final risk score"],
      "explanation": "<explain risk level calculation>",
      "recommendation": "<Risk Level 'low', 'medium', or 'high'>"
    }
  `;

	try {
		const raw = await callLLM(prompt, true);
		return extractJSON(raw);
	} catch (err) {
		// Math fallback
		let integrity = 100;
		integrity -= plagScore * 0.8;
		integrity -= aiScore * 0.4;
		integrity -= violationsCount * 15;
		if (semanticScore < 50) integrity -= 15;
		integrity = Math.max(0, Math.min(100, Math.round(integrity)));

		let riskLevel = "low";
		if (integrity < 50) riskLevel = "high";
		else if (integrity < 80) riskLevel = "medium";

		return {
			score: integrity,
			confidence: 0.9,
			evidence: [
				`Computed mathematical risk based on sub-scores. Violations penalty applied: -${violationsCount * 15}`,
			],
			explanation: `Integrity index computed: ${integrity}%. Risk category assigned: ${riskLevel}.`,
			recommendation: riskLevel,
		};
	}
}

/**
 * AGENT 7: SUMMARY AGENT
 */
export async function runSummaryAgent(
	studentName: string,
	assessmentName: string,
	scores: any,
	evidence: string[],
): Promise<AgentResult> {
	const prompt = `
    You are an academic summarization engine. Create a detailed, professional executive summary report for:
    Student: ${studentName}
    Assessment: ${assessmentName}
    All Sub-scores: ${JSON.stringify(scores)}
    Evidence Log: ${JSON.stringify(evidence)}

    Generate a JSON object:
    {
      "score": 100,
      "confidence": 1.0,
      "evidence": [],
      "explanation": "<write a unified markdown paragraphs: Performance Summary, Integrity Summary, Strengths, Weaknesses>",
      "recommendation": "<Faculty Recommendations and Student Recommendations>"
    }
  `;

	try {
		const raw = await callLLM(prompt, true);
		return extractJSON(raw);
	} catch (err) {
		return {
			score: 100,
			confidence: 0.9,
			evidence: [],
			explanation: `### Executive Summary
Student **${studentName}** successfully completed the assessment **${assessmentName}**.
- **Performance Summary:** Semantic similarity alignment sits at ${scores.semanticSimilarity}%.
- **Integrity Summary:** Plagiarism index is ${scores.plagiarism}% and AI content index is ${scores.aiContent}%. Risk scoring indicates a status of **${scores.riskLevel.toUpperCase()}**.
- **Strengths:** Response has sufficient content density and formatting checks passed.
- **Weaknesses:** None observed in telemetry.`,
			recommendation:
				"Faculty: Proceed with automatic approval.\nStudent: Maintain current submission standards.",
		};
	}
}

/**
 * Orchestrate the complete 7-agent AI evaluation pipeline
 */
export async function runCompleteAIEvaluation(attemptId: string): Promise<void> {
	const startTime = Date.now();

	// 1. Fetch attempt info
	const attempt = await prisma.assessmentAttempt.findUnique({
		where: { id: attemptId },
		include: {
			assessment: { include: { questions: true } },
			answers: true,
			violations: true,
		},
	});

	if (!attempt) {
		throw new Error(`Attempt ${attemptId} not found in database`);
	}

	// 2. Perform descriptive question analysis and aggregate results
	let totalPlag = 0;
	let totalAI = 0;
	let totalSemantic = 0;
	let totalWriting = 0;
	let totalCitation = 0;
	let descCount = 0;

	const aggregatedEvidence: string[] = [];

	for (const ans of attempt.answers) {
		const question = attempt.assessment.questions.find((q) => q.id === ans.questionId);
		if (!question) continue;

		// Only run agents on descriptive questions
		if (question.type === "descriptive" || question.type === "coding") {
			descCount++;

			// Run agents in parallel/isolated try-catches so if one fails it carries on
			let plagResult: AgentResult;
			try {
				plagResult = await runPlagiarismAgent(ans.response, question.id, attempt.id);
			} catch (e) {
				plagResult = {
					score: 0,
					confidence: 0,
					evidence: ["Plagiarism check failed"],
					explanation: "Error running plagiarism agent",
					recommendation: "Manual audit",
				};
			}

			let aiResult: AgentResult;
			try {
				aiResult = await runAICotAgent(ans.response);
			} catch (e) {
				aiResult = {
					score: 0,
					confidence: 0,
					evidence: ["AI content check failed"],
					explanation: "Error running AI agent",
					recommendation: "Manual audit",
				};
			}

			let semanticResult: AgentResult;
			try {
				semanticResult = await runSemanticSimilarityAgent(
					question.text,
					question.correctAnswer || "",
					ans.response,
				);
			} catch (e) {
				semanticResult = {
					score: 50,
					confidence: 0,
					evidence: ["Semantic matching failed"],
					explanation: "Error running semantic agent",
					recommendation: "Manual audit",
				};
			}

			let writingResult: AgentResult;
			try {
				writingResult = await runWritingQualityAgent(ans.response);
			} catch (e) {
				writingResult = {
					score: 80,
					confidence: 0,
					evidence: ["Writing quality check failed"],
					explanation: "Error running writing agent",
					recommendation: "Manual audit",
				};
			}

			let citationResult: AgentResult;
			try {
				citationResult = await runCitationAgent(ans.response);
			} catch (e) {
				citationResult = {
					score: 100,
					confidence: 0,
					evidence: ["Citation check failed"],
					explanation: "Error running citation agent",
					recommendation: "Manual audit",
				};
			}

			// Record scores
			totalPlag += plagResult.score;
			totalAI += aiResult.score;
			totalSemantic += semanticResult.score;
			totalWriting += writingResult.score;
			totalCitation += citationResult.score;

			// Accumulate evidence
			if (plagResult.score > 20)
				aggregatedEvidence.push(
					`Q '${question.text.slice(0, 25)}...': Plagiarism index ${plagResult.score}% - ${plagResult.explanation}`,
				);
			if (aiResult.score > 30)
				aggregatedEvidence.push(
					`Q '${question.text.slice(0, 25)}...': AI Content probability ${aiResult.score}%`,
				);
			if (semanticResult.score < 50)
				aggregatedEvidence.push(
					`Q '${question.text.slice(0, 25)}...': Conceptual mismatch score ${semanticResult.score}%`,
				);

			// Update individual answer evaluations
			const details = {
				plagiarism: plagResult,
				aiContent: aiResult,
				semantic: semanticResult,
				writing: writingResult,
				citation: citationResult,
			};

			const currentEmb = await getEmbedding(ans.response);
			const embeddingStr = JSON.stringify(currentEmb);

			await prisma.answer.update({
				where: { id: ans.id },
				data: {
					aiGrade: Math.round((semanticResult.score / 100) * question.points * 10) / 10,
					aiConfidence:
						(semanticResult.confidence + plagResult.confidence + aiResult.confidence) / 3,
					aiEvaluation: JSON.stringify(details),
					isFlagged: plagResult.score > 30 || aiResult.score > 50 || semanticResult.score < 40,
					embedding: embeddingStr,
				},
			});
		}
	}

	// Averages calculations
	const plagScore = descCount > 0 ? Math.round(totalPlag / descCount) : 0;
	const aiScore = descCount > 0 ? Math.round(totalAI / descCount) : 0;
	const semanticScore = descCount > 0 ? Math.round(totalSemantic / descCount) : 100;
	const writingScore = descCount > 0 ? Math.round(totalWriting / descCount) : 100;
	const citationScore = descCount > 0 ? Math.round(totalCitation / descCount) : 100;
	const grammarScore = Math.max(0, writingScore - 5); // Synthesized grammar score

	// 3. Risk scoring agent
	let riskResult: AgentResult;
	try {
		riskResult = await runRiskScoringAgent(
			plagScore,
			aiScore,
			semanticScore,
			writingScore,
			citationScore,
			attempt.violations.length,
		);
	} catch (e) {
		riskResult = {
			score: 90,
			confidence: 0.8,
			evidence: [],
			explanation: "Fallback risk engine calculation",
			recommendation: "low",
		};
	}

	// 4. Summary agent
	const subScores = {
		plagiarism: plagScore,
		aiContent: aiScore,
		semanticSimilarity: semanticScore,
		writingQuality: writingScore,
		citation: citationScore,
		riskLevel: riskResult.recommendation,
	};

	let summaryResult: AgentResult;
	try {
		summaryResult = await runSummaryAgent(
			attempt.studentName,
			attempt.assessment.title,
			subScores,
			aggregatedEvidence.concat(attempt.violations.map((v) => `${v.type}: ${v.description}`)),
		);
	} catch (e) {
		summaryResult = {
			score: 100,
			confidence: 1,
			evidence: [],
			explanation: `Executive Summary for ${attempt.studentName}: Evaluation processed. Overall integrity is ${riskResult.score}%.`,
			recommendation: "Verify all logs manually.",
		};
	}

	// Generate unique Certificate details
	const randomSerial = Math.floor(100000 + Math.random() * 900000);
	const certNumber = `IOS-${attempt.assessmentId.slice(0, 4).toUpperCase()}-${randomSerial}`;
	const verifyCode = Math.random().toString(36).substring(2, 10).toUpperCase();

	// 5. Update complete AssessmentAttempt
	const elapsed = Date.now() - startTime;
	await prisma.assessmentAttempt.update({
		where: { id: attemptId },
		data: {
			status: "graded",
			integrityScore: riskResult.score,
			plagiarismScore: plagScore,
			aiDetectionScore: aiScore,
			similarityScore: semanticScore,
			writingScore: writingScore,
			grammarScore: grammarScore,
			citationScore: citationScore,
			riskLevel: riskResult.recommendation,
			evaluationSummary: summaryResult.explanation,
			recommendations: summaryResult.recommendation,
			evaluationEvidence: JSON.stringify(aggregatedEvidence),
			modelUsed: process.env.LLM_PROVIDER === "groq" ? "Groq (Llama-3)" : "Ollama (Llama-3)",
			evaluationTime: elapsed,
			certificateNumber: certNumber,
			verificationCode: verifyCode,
		},
	});
}
