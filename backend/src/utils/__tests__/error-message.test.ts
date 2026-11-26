import { describe, expect, it } from "vitest";
import { errorMessage } from "../error-message";

describe("errorMessage", () => {
	it("returns the message of an Error", () => {
		expect(errorMessage(new Error("boom"))).toBe("boom");
		expect(errorMessage(new TypeError("bad type"), "fallback")).toBe("bad type");
	});

	it("returns a thrown string as-is", () => {
		expect(errorMessage("plain failure")).toBe("plain failure");
	});

	it("reads a string message from error-like objects", () => {
		expect(errorMessage({ message: "from object" })).toBe("from object");
	});

	it("uses the fallback for empty, missing or non-string messages", () => {
		expect(errorMessage(new Error(""), "fallback")).toBe("fallback");
		expect(errorMessage({ message: 42 }, "fallback")).toBe("fallback");
		expect(errorMessage(null, "fallback")).toBe("fallback");
		expect(errorMessage(undefined)).toBe("Unexpected error");
		expect(errorMessage("", "fallback")).toBe("fallback");
	});
});
