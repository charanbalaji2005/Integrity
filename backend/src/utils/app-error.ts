export class AppError extends Error {
	public readonly statusCode: number;

	constructor(message: string, statusCode = 500) {
		super(message);
		this.statusCode = statusCode;
		this.name = "AppError";
		Error.captureStackTrace(this, this.constructor);
	}
}
