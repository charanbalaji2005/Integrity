import { z } from "zod";

export const createCourseSchema = z.object({
	code: z.string().trim().min(2, "Course code is required").max(30),
	name: z.string().trim().min(3, "Course name is required").max(160),
	subject: z.string().trim().max(160).optional().nullable(),
	department: z.string().trim().max(120).optional().nullable(),
});

export const manualSyllabusSchema = z.object({
	title: z.string().trim().min(3).max(160),
});

const topicSchema = z.object({
	id: z.string().optional(),
	title: z.string().trim().min(2, "Topic titles need at least 2 characters").max(200),
});

export const syllabusStructureSchema = z.object({
	units: z
		.array(
			z.object({
				id: z.string().optional(),
				title: z.string().trim().min(2, "Unit titles need at least 2 characters").max(200),
				topics: z.array(topicSchema).max(60),
			}),
		)
		.max(40),
});

export const MATERIAL_KINDS = ["pdf", "notes", "slides", "reference", "video", "link"] as const;
export const LINK_KINDS = new Set<string>(["video", "link"]);

const httpUrl = z
	.string()
	.trim()
	.url("Enter a valid URL")
	.refine((u) => /^https?:\/\//i.test(u), "Only http(s) links are allowed");

export const materialFieldsSchema = z.object({
	kind: z.enum(MATERIAL_KINDS),
	title: z.string().trim().min(2, "Title is required").max(200),
	description: z.string().trim().max(1000).optional().nullable(),
	url: httpUrl.optional().nullable(),
});

export const materialUpdateSchema = materialFieldsSchema.partial();
