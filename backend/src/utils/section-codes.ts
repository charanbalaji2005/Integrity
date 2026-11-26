import { HTTP_STATUS } from "../constants/http-status";
import { AppError } from "./app-error";
import { DEPARTMENT_BY_PREFIX } from "./departments";
import { SECTION_CODE_RE } from "./faculty-sections";

/**
 * Section codes are always stored as DEPT-LETTER (e.g. "CSE-A"); faculty
 * scoping, study materials, chat rooms and announcements all match on that
 * exact string. Older profiles (and free-text inputs) may hold just "A", so
 * these helpers resolve such values using the user's department.
 */

const PREFIX_BY_NAME: Record<string, string> = Object.fromEntries(
	Object.entries(DEPARTMENT_BY_PREFIX).map(([prefix, name]) => [name.toLowerCase(), prefix]),
);

/** "CSE", "cse", "Computer Science & Engineering" → "CSE"; unknown → null. */
export function departmentPrefix(department: string | null | undefined): string | null {
	const d = String(department ?? "").trim();
	if (!d) return null;
	const upper = d.toUpperCase();
	if (DEPARTMENT_BY_PREFIX[upper]) return upper;
	return PREFIX_BY_NAME[d.toLowerCase()] ?? null;
}

/**
 * Canonical section code or null when it can't be resolved.
 * Accepts "CSE-A", "cse-a", "CSE A", "CSE_A", "CSEA", and a bare "A" when the
 * department is known.
 */
export function canonicalSection(raw: unknown, department?: string | null): string | null {
	const s = String(raw ?? "")
		.trim()
		.toUpperCase();
	if (!s) return null;
	if (SECTION_CODE_RE.test(s)) return s;
	const spaced = s.match(/^([A-Z]{2,4})[\s_]*-?[\s_]*([A-Z])$/);
	if (spaced && DEPARTMENT_BY_PREFIX[spaced[1]!]) return `${spaced[1]}-${spaced[2]}`;
	if (/^[A-Z]$/.test(s)) {
		const prefix = departmentPrefix(department);
		if (prefix) return `${prefix}-${s}`;
	}
	return null;
}

/** For saving a student's section: empty → null, unresolvable → 400 with guidance. */
export function resolveStudentSection(raw: unknown, department?: string | null): string | null {
	if (raw === undefined || raw === null || String(raw).trim() === "") return null;
	const code = canonicalSection(raw, department);
	if (!code) {
		const prefix = departmentPrefix(department) ?? "CSE";
		throw new AppError(
			`Invalid section "${String(raw).trim()}". Use the format ${prefix}-A, ${prefix}-B, …`,
			HTTP_STATUS.BAD_REQUEST,
		);
	}
	return code;
}

/** Faculty section list (array or comma string) with each entry resolved; validation stays in validateFacultySections. */
export function canonicalSectionList(raw: unknown, department?: string | null): string[] {
	const list = Array.isArray(raw) ? raw : String(raw ?? "").split(",");
	return list
		.map(
			(x) =>
				canonicalSection(x, department) ??
				String(x ?? "")
					.trim()
					.toUpperCase(),
		)
		.filter(Boolean);
}
