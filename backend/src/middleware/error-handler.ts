import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/app-error";

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
	if (err instanceof AppError) {
		return res.status(err.statusCode).json({
			success: false,
			message: err.message,
		});
	}

	// Handle Better Auth APIError or other errors with status/statusCode
	if (
		err &&
		(err.name === "APIError" ||
			err.constructor?.name === "APIError" ||
			typeof err.statusCode === "number" ||
			typeof err.status === "number")
	) {
		const statusCode =
			typeof err.statusCode === "number"
				? err.statusCode
				: typeof err.status === "number"
					? err.status
					: 400;
		return res.status(statusCode).json({
			success: false,
			message: err.message || "Authentication failed",
		});
	}

	console.error("Unhandled error:", err);

	return res.status(500).json({
		success: false,
		message: "Internal server error",
	});
}
