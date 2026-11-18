import { z } from "zod";

export const analyzeSubmissionSchema = z.object({
	body: z.object({
		text: z
			.string({
				message: "Submission text is required",
			})
			.min(50, "Text must be at least 50 characters")
			.max(100000, "Text must not exceed 100,000 characters"),
	}),
});
