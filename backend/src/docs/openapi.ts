import { env } from "../config/env";

type OpenApiSchema = Record<string, unknown>;

interface OpenApiDocument {
	openapi: string;
	info: {
		title: string;
		description: string;
		version: string;
	};
	servers: Array<{
		url: string;
		description: string;
	}>;
	tags: Array<{
		name: string;
		description: string;
	}>;
	paths: Record<string, unknown>;
	components: {
		schemas: Record<string, OpenApiSchema>;
	};
}

export const openApiDocument: OpenApiDocument = {
	openapi: "3.1.0",
	info: {
		title: "Assessment Integrity Agent API",
		description: "OpenAPI documentation for the backend API.",
		version: "1.0.0",
	},
	servers: [
		{
			url: env.BETTER_AUTH_URL,
			description: `${env.NODE_ENV} server`,
		},
	],
	tags: [
		{
			name: "Health",
			description: "Service and dependency health checks.",
		},
		{
			name: "Plagiarism",
			description: "Document plagiarism analysis services.",
		},
	],
	paths: {
		"/api/health": {
			get: {
				tags: ["Health"],
				summary: "Get API health",
				description: "Returns application uptime, environment, and database status.",
				operationId: "getHealth",
				responses: {
					"200": {
						description: "Health check completed.",
						content: {
							"application/json": {
								schema: {
									$ref: "#/components/schemas/HealthResponse",
								},
							},
						},
					},
				},
			},
		},
		"/api/plagiarism/analyze-document": {
			post: {
				tags: ["Plagiarism"],
				summary: "Analyze document plagiarism",
				description:
					"Extracts text from an uploaded document (TXT, PDF, DOCX, PNG, JPG) and computes semantic similarity metrics against historical submissions.",
				operationId: "analyzeDocument",
				security: [
					{
						bearerAuth: [],
					},
				],
				requestBody: {
					required: true,
					content: {
						"multipart/form-data": {
							schema: {
								type: "object",
								required: ["document"],
								properties: {
									document: {
										type: "string",
										format: "binary",
										description: "The document file to upload (maximum 10MB).",
									},
								},
							},
						},
					},
				},
				responses: {
					"200": {
						description: "Plagiarism analysis completed.",
						content: {
							"application/json": {
								schema: {
									$ref: "#/components/schemas/PlagiarismResponse",
								},
							},
						},
					},
					"400": {
						description: "Invalid request or file type.",
						content: {
							"application/json": {
								schema: {
									$ref: "#/components/schemas/ErrorResponse",
								},
							},
						},
					},
					"401": {
						description: "Unauthorized access.",
						content: {
							"application/json": {
								schema: {
									$ref: "#/components/schemas/ErrorResponse",
								},
							},
						},
					},
				},
			},
		},
	},
	components: {
		schemas: {
			HealthResponse: {
				type: "object",
				required: ["success", "status", "timestamp", "environment", "uptime", "services"],
				properties: {
					success: {
						type: "boolean",
						examples: [true],
					},
					status: {
						type: "string",
						enum: ["healthy", "degraded"],
					},
					timestamp: {
						type: "string",
						format: "date-time",
					},
					environment: {
						type: "string",
						enum: ["development", "production", "test"],
					},
					uptime: {
						type: "integer",
						minimum: 0,
					},
					services: {
						type: "object",
						required: ["database"],
						properties: {
							database: {
								type: "string",
								enum: ["healthy", "unhealthy"],
							},
						},
					},
				},
			},
			ErrorResponse: {
				type: "object",
				required: ["success", "message"],
				properties: {
					success: {
						type: "boolean",
						examples: [false],
					},
					message: {
						type: "string",
					},
				},
			},
			PlagiarismResponse: {
				type: "object",
				required: [
					"success",
					"filename",
					"overallSimilarity",
					"risk",
					"confidence",
					"processingTime",
					"totalWords",
					"matchedWords",
					"uniqueWords",
					"matchedChunks",
					"aiExplanation",
					"manualReview",
					"generatedAt",
				],
				properties: {
					success: {
						type: "boolean",
						examples: [true],
					},
					filename: {
						type: "string",
						examples: ["assignment.pdf"],
					},
					overallSimilarity: {
						type: "integer",
						examples: [34],
					},
					risk: {
						type: "string",
						enum: ["Low", "Moderate", "High", "Very High"],
						examples: ["High"],
					},
					confidence: {
						type: "number",
						examples: [0.93],
					},
					processingTime: {
						type: "string",
						examples: ["3.5s"],
					},
					totalWords: {
						type: "integer",
						examples: [2480],
					},
					matchedWords: {
						type: "integer",
						examples: [812],
					},
					uniqueWords: {
						type: "integer",
						examples: [1668],
					},
					matchedChunks: {
						type: "array",
						items: {
							type: "object",
							required: ["chunk", "similarity", "reason"],
							properties: {
								chunk: {
									type: "integer",
								},
								similarity: {
									type: "integer",
								},
								reason: {
									type: "string",
								},
								matchedText: {
									type: "string",
								},
							},
						},
					},
					aiExplanation: {
						type: "string",
					},
					manualReview: {
						type: "boolean",
					},
					generatedAt: {
						type: "string",
						format: "date-time",
					},
				},
			},
		},
	},
};
