import type { Prisma } from "@prisma/client";
import { HTTP_STATUS } from "../constants/http-status";
import { AppError } from "./app-error";

/**
 * Faculty ↔ section assignment.
 *
 * A faculty member teaches between 1 and MAX_FACULTY_SECTIONS sections. They
 * are stored in `User.section` as a comma-separated list (e.g. "CSE-A,CSE-C"),
 * the format the class-chat code already understood. Students keep a single
 * section in the same column. Section codes match the student profile format:
 * DEPT-LETTER, e.g. CSE-A, ECE-B.
 *
 * Every place that shows students to faculty goes through the helpers below,
 * so the rule "faculty only see students of their sections" lives in one file.
 */

export const MAX_FACULTY_SECTIONS = 3;
export const SECTION_CODE_RE = /^[A-Z]{2,4}-[A-Z]$/;

export function normalizeSectionCode(raw: unknown): string {
	return String(raw ?? "")
		.trim()
		.toUpperCase();
}

/** Sections stored for a user (faculty: up to 3, student: 1). Never throws. */
export function parseSections(stored: string | null | undefined): string[] {
	return Array.from(
		new Set(
			String(stored ?? "")
				.split(",")
				.map(normalizeSectionCode)
				.filter(Boolean),
		),
	);
}

/**
 * Validates faculty section input (array or comma-separated string) and
 * returns the canonical stored value. Requires 1–3 valid, distinct codes.
 */
export function validateFacultySections(input: unknown): string {
	const list = Array.isArray(input)
		? input.map(normalizeSectionCode)
		: String(input ?? "")
				.split(",")
				.map(normalizeSectionCode);
	const sections = list.filter(Boolean);

	if (sections.length === 0) {
		throw new AppError(
			"Select at least one section for this faculty member.",
			HTTP_STATUS.BAD_REQUEST,
		);
	}
	const invalid = sections.filter((s) => !SECTION_CODE_RE.test(s));
	if (invalid.length) {
		throw new AppError(
			`Invalid section code: ${invalid.join(", ")}. Use the format CSE-A, ECE-B, …`,
			HTTP_STATUS.BAD_REQUEST,
		);
	}
	if (new Set(sections).size !== sections.length) {
		throw new AppError("Each section can only be selected once.", HTTP_STATUS.BAD_REQUEST);
	}
	if (sections.length > MAX_FACULTY_SECTIONS) {
		throw new AppError(
			`A faculty member can be assigned at most ${MAX_FACULTY_SECTIONS} sections.`,
			HTTP_STATUS.BAD_REQUEST,
		);
	}
	return sections.join(",");
}

interface ScopedUser {
	role: string | null;
	section?: string | null;
}

/** Faculty sections, or null when the user is not section-scoped (admins see everyone). */
export function facultySectionsOf(user: ScopedUser): string[] | null {
	if (user.role === "admin") return null;
	if (user.role === "faculty") return parseSections(user.section);
	return [];
}

/** May this staff user see a student who belongs to `studentSection`? */
export function canSeeStudentSection(
	user: ScopedUser,
	studentSection: string | null | undefined,
): boolean {
	const scope = facultySectionsOf(user);
	if (scope === null) return true;
	return scope.includes(normalizeSectionCode(studentSection));
}

/** Prisma filter on a student relation, limiting rows to the viewer's sections. */
export function studentSectionWhere(user: ScopedUser): Prisma.UserWhereInput {
	const scope = facultySectionsOf(user);
	if (scope === null) return {};
	// A faculty member with no sections configured sees no students.
	return { section: { in: scope } };
}

/** Prisma filter for AssessmentAttempt rows visible to the viewer. */
export function attemptSectionWhere(user: ScopedUser): Prisma.AssessmentAttemptWhereInput {
	const scope = facultySectionsOf(user);
	if (scope === null) return {};
	return { student: studentSectionWhere(user) };
}

/** Socket room for live proctoring events of one section within an assessment. */
export function sectionMonitorRoom(
	assessmentId: string,
	section: string | null | undefined,
): string {
	return `assessment-proctoring-${assessmentId}::${normalizeSectionCode(section) || "UNASSIGNED"}`;
}
