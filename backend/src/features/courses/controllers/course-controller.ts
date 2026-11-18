import type { Request, Response } from "express";
import type { z } from "zod";
import { HTTP_STATUS } from "@/constants/http-status";
import { getAuthUser } from "@/middleware/auth-middleware";
import { AppError } from "@/utils/app-error";
import { sendSuccess } from "@/utils/response";
import {
	createCourseSchema,
	manualSyllabusSchema,
	materialFieldsSchema,
	materialUpdateSchema,
	syllabusStructureSchema,
} from "../schemas/course-schemas";
import * as service from "../services/course-service";
import { contentDisposition, type UploadedFile } from "../services/file-storage";

const param = (req: Request, key: string) => {
	const v = req.params[key];
	return String(Array.isArray(v) ? v[0] : v || "");
};

function parse<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
	const result = schema.safeParse(body);
	if (!result.success) {
		throw new AppError(result.error.issues[0]?.message ?? "Validation failed", HTTP_STATUS.BAD_REQUEST);
	}
	return result.data;
}

/** Multipart fields arrive as strings; treat empty strings as "not provided". */
function cleanFields(body: Record<string, unknown>) {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(body ?? {})) {
		if (v === "" || v === undefined) continue;
		out[k] = v === "null" ? null : v;
	}
	return out;
}

const uploaded = (req: Request) => (req as Request & { file?: UploadedFile }).file;

export async function listCourses(req: Request, res: Response) {
	sendSuccess(res, await service.listCourses(getAuthUser(req)), "Courses retrieved");
}

export async function createCourse(req: Request, res: Response) {
	const input = parse(createCourseSchema, req.body);
	sendSuccess(res, await service.createCourse(getAuthUser(req), input), "Course created", HTTP_STATUS.CREATED);
}

export async function getCourse(req: Request, res: Response) {
	sendSuccess(res, await service.getCourseDetail(getAuthUser(req), param(req, "id")), "Course retrieved");
}

export async function uploadSyllabus(req: Request, res: Response) {
	const title = typeof req.body?.title === "string" ? req.body.title : undefined;
	const result = await service.uploadSyllabus(getAuthUser(req), param(req, "id"), uploaded(req), title);
	sendSuccess(
		res,
		result,
		result.duplicate ? "This syllabus was already uploaded for the course — reusing it." : "Syllabus uploaded",
		result.duplicate ? HTTP_STATUS.OK : HTTP_STATUS.CREATED,
	);
}

export async function createManualSyllabus(req: Request, res: Response) {
	const { title } = parse(manualSyllabusSchema, req.body);
	sendSuccess(
		res,
		await service.createManualSyllabus(getAuthUser(req), param(req, "id"), title),
		"Syllabus created",
		HTTP_STATUS.CREATED,
	);
}

export async function saveSyllabusStructure(req: Request, res: Response) {
	const input = parse(syllabusStructureSchema, req.body);
	await service.saveSyllabusStructure(getAuthUser(req), param(req, "syllabusId"), input);
	sendSuccess(res, null, "Syllabus units saved");
}

export async function deleteSyllabus(req: Request, res: Response) {
	await service.deleteSyllabus(getAuthUser(req), param(req, "syllabusId"));
	sendSuccess(res, null, "Syllabus deleted");
}

export async function downloadSyllabus(req: Request, res: Response) {
	const file = await service.getSyllabusFile(getAuthUser(req), param(req, "syllabusId"));
	sendFile(res, file, req.query.download === "1" ? "attachment" : "inline");
}

export async function createMaterial(req: Request, res: Response) {
	const fields = parse(materialFieldsSchema, cleanFields(req.body));
	const result = await service.createMaterial(getAuthUser(req), param(req, "id"), fields, uploaded(req));
	sendSuccess(
		res,
		result.material,
		result.duplicate ? "This material already exists in the course — reusing it." : "Material added",
		result.duplicate ? HTTP_STATUS.OK : HTTP_STATUS.CREATED,
	);
}

export async function updateMaterial(req: Request, res: Response) {
	const fields = parse(materialUpdateSchema, cleanFields(req.body));
	sendSuccess(
		res,
		await service.updateMaterial(getAuthUser(req), param(req, "materialId"), fields, uploaded(req)),
		"Material updated",
	);
}

export async function deleteMaterial(req: Request, res: Response) {
	await service.deleteMaterial(getAuthUser(req), param(req, "materialId"));
	sendSuccess(res, null, "Material removed");
}

export async function materialFile(req: Request, res: Response) {
	const download = req.query.download === "1";
	const fileId = await service.authorizeMaterialFile(getAuthUser(req), param(req, "materialId"), download);
	const file = await service.getStoredFile(fileId);
	sendFile(res, file, download ? "attachment" : "inline");
}

export async function uploadQuestionImage(req: Request, res: Response) {
	sendSuccess(
		res,
		await service.uploadQuestionImage(getAuthUser(req), uploaded(req)),
		"Image uploaded",
		HTTP_STATUS.CREATED,
	);
}

export async function questionImage(req: Request, res: Response) {
	const file = await service.getQuestionImage(param(req, "fileId"));
	res.setHeader("Cache-Control", "private, max-age=86400, immutable");
	sendFile(res, file, "inline");
}

function sendFile(
	res: Response,
	file: { fileName: string; mimeType: string; sizeBytes: number; data: Uint8Array },
	disposition: "inline" | "attachment",
) {
	res.setHeader("Content-Type", file.mimeType);
	res.setHeader("Content-Length", String(file.sizeBytes));
	res.setHeader("Content-Disposition", contentDisposition(disposition, file.fileName));
	res.setHeader("X-Content-Type-Options", "nosniff");
	res.end(Buffer.from(file.data));
}
