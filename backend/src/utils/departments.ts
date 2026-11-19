/**
 * Department names as stored on student profiles, keyed by the section-code
 * prefix (CSE-A → "Computer Science & Engineering"). Class chat rooms are
 * keyed by these exact names, so announcements must use them too.
 */
export const DEPARTMENT_BY_PREFIX: Record<string, string> = {
	CSE: "Computer Science & Engineering",
	ECE: "Electronics & Communications",
	EEE: "Electrical & Electronics Engineering",
	MEC: "Mechanical Engineering",
};

export function departmentForSection(section: string): string | null {
	const prefix = section.split("-")[0]?.toUpperCase() ?? "";
	return DEPARTMENT_BY_PREFIX[prefix] ?? null;
}

/** Normalises "4", "sem 4", "Semester 4" → "Semester 4" (the student profile format). */
export function normalizeSemester(raw: unknown): string | null {
	const m = String(raw ?? "").match(/(\d{1,2})/);
	if (!m) return null;
	const n = Number(m[1]);
	return n >= 1 && n <= 8 ? `Semester ${n}` : null;
}
