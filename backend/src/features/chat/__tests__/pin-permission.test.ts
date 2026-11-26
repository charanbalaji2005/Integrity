import { describe, expect, it } from "vitest";
import { canPinMessage } from "../controllers/chat-controller";

const student = { id: "s1", role: "user", section: "CSE-A", department: "CSE" };
const otherStudent = { id: "s2", role: "user", section: "CSE-B", department: "CSE" };
const admin = { id: "a1", role: "admin" };

describe("canPinMessage", () => {
	describe("private chats", () => {
		const msg = { type: "private", senderId: "s1", recipientId: "f1" };

		it("allows either participant", () => {
			expect(canPinMessage(student, msg)).toBe(true);
			expect(canPinMessage({ id: "f1", role: "faculty" }, msg)).toBe(true);
		});

		it("blocks everyone else, including admins (private means private)", () => {
			expect(canPinMessage(otherStudent, msg)).toBe(false);
			expect(canPinMessage(admin, msg)).toBe(false);
		});
	});

	describe("class rooms", () => {
		const msg = { type: "class", senderId: "f1", section: "cse-a ", department: "cse" };

		it("allows students of that section (case and whitespace insensitive)", () => {
			expect(canPinMessage(student, msg)).toBe(true);
		});

		it("blocks students of another section or department", () => {
			expect(canPinMessage(otherStudent, msg)).toBe(false);
			expect(canPinMessage({ ...student, department: "ECE" }, msg)).toBe(false);
		});

		it("allows admins", () => {
			expect(canPinMessage(admin, msg)).toBe(true);
		});
	});

	describe("college channel", () => {
		const msg = { type: "college", senderId: "a1" };

		it("is admin-only", () => {
			expect(canPinMessage(admin, msg)).toBe(true);
			expect(canPinMessage(student, msg)).toBe(false);
			expect(canPinMessage({ id: "f1", role: "faculty" }, msg)).toBe(false);
		});
	});

	it("denies unknown chat types", () => {
		expect(canPinMessage(student, { type: "mystery", senderId: "s1" })).toBe(false);
	});
});
