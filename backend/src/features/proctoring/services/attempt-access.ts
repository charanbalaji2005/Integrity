import { HTTP_STATUS } from "../../../constants/http-status";
import { prisma } from "../../../database";
import { AppError } from "../../../utils/app-error";
import { canSeeStudentSection } from "../../../utils/faculty-sections";

export type AttemptAccessMode =
	/** Only the student who owns the attempt (start, calibrate, frames, submit). */
	| "candidate"
	/** Faculty who own the assessment, or admins (live controls). */
	| "monitor"
	/** Either of the above (read-only views such as session/report). */
	| "candidate-or-monitor";

export interface AccessUser {
	id: string;
	role: string;
	/** Faculty: comma-separated assigned sections. Used to scope student visibility. */
	section?: string | null;
}

/** Proctoring statuses that end the live session for good. */
export const FINAL_PROCTORING_STATUSES = new Set(["TERMINATED", "SUBMITTED"]);
export const FINAL_ATTEMPT_STATUSES = new Set(["submitted", "graded"]);

export function isMonitorRole(role: string | undefined): boolean {
	return role === "faculty" || role === "admin";
}

/** True if this user may supervise attempts of the given assessment. */
export function canMonitorAssessment(user: AccessUser, assessment: { facultyId: string }): boolean {
	if (user.role === "admin") return true;
	return user.role === "faculty" && assessment.facultyId === user.id;
}

/**
 * Loads an attempt and enforces authorization. Authentication (requireAuth)
 * only proves who the caller is; this proves they may touch this attempt.
 * Returns 404 rather than 403 for foreign attempts so IDs cannot be probed.
 */
export async function loadAuthorizedAttempt(
	user: AccessUser | undefined,
	attemptId: unknown,
	mode: AttemptAccessMode,
) {
	if (!user) {
		throw new AppError("Unauthorized: Authentication required", HTTP_STATUS.UNAUTHORIZED);
	}
	if (!attemptId || typeof attemptId !== "string") {
		throw new AppError("Attempt ID is required.", HTTP_STATUS.BAD_REQUEST);
	}

	const attempt = await prisma.assessmentAttempt.findUnique({
		where: { id: attemptId },
		include: {
			assessment: { select: { id: true, facultyId: true, title: true } },
			student: { select: { section: true } },
		},
	});

	if (!attempt) {
		throw new AppError("Assessment attempt not found.", HTTP_STATUS.NOT_FOUND);
	}

	const isCandidate = attempt.studentId === user.id;
	// Owning the assessment is not enough: faculty may only supervise students
	// from their assigned sections (admins are unrestricted).
	const isMonitor =
		canMonitorAssessment(user, attempt.assessment) &&
		canSeeStudentSection(user, attempt.student?.section);

	const allowed =
		mode === "candidate" ? isCandidate : mode === "monitor" ? isMonitor : isCandidate || isMonitor;

	if (!allowed) {
		throw new AppError("Assessment attempt not found.", HTTP_STATUS.NOT_FOUND);
	}

	return attempt;
}

export function isAttemptFinal(attempt: { status: string; proctoringStatus: string }): boolean {
	return (
		FINAL_ATTEMPT_STATUSES.has(attempt.status) ||
		FINAL_PROCTORING_STATUSES.has(attempt.proctoringStatus)
	);
}

/**
 * Express middleware enforcing attempt ownership on routes with :attemptId.
 */
export function authorizeAttemptParam(mode: AttemptAccessMode) {
	return async (
		req: { user?: AccessUser; params: Record<string, string | string[] | undefined> },
		_res: unknown,
		next: (err?: unknown) => void,
	) => {
		try {
			const raw = req.params.attemptId;
			await loadAuthorizedAttempt(req.user, Array.isArray(raw) ? raw[0] : raw, mode);
			next();
		} catch (err) {
			next(err);
		}
	};
}

/**
 * Express middleware: only the owning faculty member (or an admin) may manage
 * or monitor the assessment in :id.
 */
export function authorizeAssessmentOwner() {
	return async (
		req: { user?: AccessUser; params: Record<string, string | string[] | undefined> },
		_res: unknown,
		next: (err?: unknown) => void,
	) => {
		try {
			const raw = req.params.id;
			const id = Array.isArray(raw) ? raw[0] : raw;
			if (!req.user) {
				throw new AppError("Unauthorized: Authentication required", HTTP_STATUS.UNAUTHORIZED);
			}
			const assessment = id
				? await prisma.assessment.findUnique({ where: { id }, select: { facultyId: true } })
				: null;
			if (!assessment || !canMonitorAssessment(req.user, assessment)) {
				throw new AppError("Assessment not found.", HTTP_STATUS.NOT_FOUND);
			}
			next();
		} catch (err) {
			next(err);
		}
	};
}
