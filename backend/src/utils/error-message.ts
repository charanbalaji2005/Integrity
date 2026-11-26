/**
 * Extracts a human-readable message from a caught value of unknown type.
 * `catch` bindings are `unknown`; this avoids `err: any` and never throws.
 */
export function errorMessage(err: unknown, fallback = "Unexpected error"): string {
	if (err instanceof Error && err.message) return err.message;
	if (typeof err === "string" && err) return err;
	if (err && typeof err === "object" && "message" in err) {
		const msg = (err as { message?: unknown }).message;
		if (typeof msg === "string" && msg) return msg;
	}
	return fallback;
}
