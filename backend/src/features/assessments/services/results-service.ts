import { prisma } from "../../../database";
import {
	canSeeStudentSection,
	normalizeSectionCode,
	studentSectionWhere,
} from "../../../utils/faculty-sections";
import { parseRegistrationNumber } from "../../../utils/registration-number";

export type CompletionStatus = "completed" | "in_progress" | "not_started";

export interface ResultsFilters {
	/** Section code, e.g. CSE-A. */
	section?: string;
	semester?: string;
	batchYear?: number;
}

export interface ResultsViewer {
	role: string | null;
	section?: string | null;
}

export interface ResultRow {
	studentId: string;
	name: string;
	email: string;
	registrationNumber: string;
	registrationValid: boolean;
	batchYear: number | null;
	department: string | null;
	semester: string | null;
	section: string | null;
	status: CompletionStatus;
	attemptId: string | null;
	marks: number | null;
	maxMarks: number;
	percentage: number | null;
	passed: boolean | null;
	/** "final" once faculty/AI grading has finished, otherwise "provisional". */
	gradeStatus: "final" | "provisional" | null;
	integrityScore: number | null;
	riskLevel: string | null;
	startedAt: string | null;
	submittedAt: string | null;
}

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Section-wise results for one assessment: every student in the roster
 * (institution students + anyone who attempted), limited to the viewer's
 * sections, with completion status and marks — including students who have
 * not started yet.
 */
export async function getAssessmentResults(
	assessmentId: string,
	filters: ResultsFilters,
	viewer: ResultsViewer,
) {
	const assessment = await prisma.assessment.findUnique({
		where: { id: assessmentId },
		select: {
			id: true,
			title: true,
			institutionName: true,
			totalMarks: true,
			passingMarks: true,
			questions: { select: { points: true } },
		},
	});
	if (!assessment) return null;

	const maxMarks =
		assessment.totalMarks && assessment.totalMarks > 0
			? assessment.totalMarks
			: assessment.questions.reduce((sum, q) => sum + (q.points || 0), 0);

	const attempts = await prisma.assessmentAttempt.findMany({
		where: { assessmentId },
		orderBy: { createdAt: "desc" },
		select: {
			id: true,
			studentId: true,
			status: true,
			score: true,
			integrityScore: true,
			riskLevel: true,
			startedAt: true,
			submittedAt: true,
		},
	});

	// Roster: every student of the institution, plus anyone who attempted.
	const attemptedIds = [...new Set(attempts.map((a) => a.studentId))];
	const students = await prisma.user.findMany({
		where: {
			role: "user",
			OR: [
				{ institutionName: { equals: assessment.institutionName, mode: "insensitive" } },
				{ id: { in: attemptedIds } },
			],
			// Faculty only see students of the sections they teach.
			...studentSectionWhere(viewer),
		},
		select: {
			id: true,
			name: true,
			email: true,
			rollNumber: true,
			academicId: true,
			department: true,
			semester: true,
			section: true,
		},
	});

	// Best attempt per student: a finished attempt beats an in-progress one, then highest score.
	const byStudent = new Map<string, (typeof attempts)[number]>();
	for (const a of attempts) {
		const cur = byStudent.get(a.studentId);
		const done = a.status === "submitted" || a.status === "graded";
		const curDone = cur ? cur.status === "submitted" || cur.status === "graded" : false;
		if (!cur || (done && !curDone) || (done && curDone && (a.score ?? -1) > (cur.score ?? -1))) {
			byStudent.set(a.studentId, a);
		}
	}

	// Section list is computed before filtering so the UI can offer every option.
	const sectionMap = new Map<string, { section: string; students: number; completed: number }>();
	for (const s of students) {
		const key = normalizeSectionCode(s.section) || "UNASSIGNED";
		const entry = sectionMap.get(key) ?? { section: key, students: 0, completed: 0 };
		entry.students += 1;
		const a = byStudent.get(s.id);
		if (a && (a.status === "submitted" || a.status === "graded")) entry.completed += 1;
		sectionMap.set(key, entry);
	}

	const rows: ResultRow[] = students
		.filter((s) => {
			if (
				filters.section &&
				(normalizeSectionCode(s.section) || "UNASSIGNED") !== normalizeSectionCode(filters.section)
			)
				return false;
			if (filters.semester && norm(s.semester) !== norm(filters.semester)) return false;
			if (filters.batchYear) {
				const reg = parseRegistrationNumber(s.rollNumber || s.academicId);
				if (reg.batchYear !== filters.batchYear) return false;
			}
			return true;
		})
		.map((s): ResultRow => {
			const reg = parseRegistrationNumber(s.rollNumber || s.academicId);
			const a = byStudent.get(s.id);
			const done = Boolean(a && (a.status === "submitted" || a.status === "graded"));
			const status: CompletionStatus = !a ? "not_started" : done ? "completed" : "in_progress";
			const marks = done && a?.score !== null && a?.score !== undefined ? round1(a.score) : null;
			const percentage = marks !== null && maxMarks > 0 ? round1((marks / maxMarks) * 100) : null;
			return {
				studentId: s.id,
				name: s.name,
				email: s.email,
				registrationNumber: reg.normalized || "",
				registrationValid: reg.valid,
				batchYear: reg.batchYear,
				department: s.department,
				semester: s.semester,
				section: s.section,
				status,
				attemptId: a?.id ?? null,
				marks,
				maxMarks: round1(maxMarks),
				percentage,
				passed:
					marks !== null &&
					assessment.passingMarks !== null &&
					assessment.passingMarks !== undefined
						? marks >= assessment.passingMarks
						: null,
				gradeStatus: done ? (a?.status === "graded" ? "final" : "provisional") : null,
				integrityScore: a ? Math.round(a.integrityScore) : null,
				riskLevel: a?.riskLevel ?? null,
				startedAt: a?.startedAt?.toISOString() ?? null,
				submittedAt: a?.submittedAt?.toISOString() ?? null,
			};
		})
		.sort((x, y) =>
			(x.registrationNumber || "~" + x.name).localeCompare(
				y.registrationNumber || "~" + y.name,
				undefined,
				{
					numeric: true,
				},
			),
		);

	const scored = rows.filter((r) => r.marks !== null).map((r) => r.marks as number);
	const summary = {
		total: rows.length,
		completed: rows.filter((r) => r.status === "completed").length,
		inProgress: rows.filter((r) => r.status === "in_progress").length,
		notStarted: rows.filter((r) => r.status === "not_started").length,
		average: scored.length ? round1(scored.reduce((a, b) => a + b, 0) / scored.length) : null,
		highest: scored.length ? Math.max(...scored) : null,
		lowest: scored.length ? Math.min(...scored) : null,
		passed: rows.filter((r) => r.passed === true).length,
	};

	return {
		assessment: {
			id: assessment.id,
			title: assessment.title,
			institutionName: assessment.institutionName,
			maxMarks: round1(maxMarks),
			passingMarks: assessment.passingMarks,
		},
		sections: [...sectionMap.values()].sort((a, b) => a.section.localeCompare(b.section)),
		summary,
		rows,
	};
}

/**
 * Faculty who should hear that a student finished: the assessment owner, but
 * only when the student belongs to one of the owner's sections (the same rule
 * that decides whether the owner can see the student in results).
 */
export async function facultyToNotify(ownerId: string, studentSection: string | null | undefined) {
	const owner = await prisma.user.findUnique({
		where: { id: ownerId },
		select: { id: true, role: true, section: true },
	});
	if (!owner) return [];
	return canSeeStudentSection(owner, studentSection) ? [owner.id] : [];
}
