import { prisma } from "@/database";
import { attemptSectionWhere } from "@/utils/faculty-sections";
import { collectPublishIssues } from "../../assessments/services/assessment-builder-service";
import { extractText } from "../../text-extraction/services/text-extraction-service";

/**
 * Authorized data access for Vigil's agents.
 *
 * Every tool is scoped to the requesting faculty member: assessments they own,
 * and only attempts by students in their sections (attemptSectionWhere). Tools
 * return compact, factual summaries — the model never queries the database itself.
 */

export interface ToolUser {
	id: string;
	role: string;
	section?: string | null;
}

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const clip = (s: string | null | undefined, n: number) => {
	const t = (s ?? "").replace(/\s+/g, " ").trim();
	return t.length > n ? `${t.slice(0, n)}…` : t;
};
const norm = (s: string) =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9 ]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();

/* ───────────────────────── assessments ───────────────────────── */

export async function listOwnAssessments(user: ToolUser) {
	const rows = await prisma.assessment.findMany({
		where: { facultyId: user.id },
		orderBy: { updatedAt: "desc" },
		take: 40,
		select: {
			id: true,
			title: true,
			published: true,
			assessmentType: true,
			availabilityStart: true,
			availabilityEnd: true,
			duration: true,
			updatedAt: true,
			course: { select: { code: true } },
			_count: { select: { questions: true, attempts: true } },
		},
	});
	return rows.map((a) => ({
		id: a.id,
		title: a.title,
		type: a.assessmentType,
		status: a.published ? "published" : "draft",
		course: a.course?.code ?? null,
		questions: a._count.questions,
		attempts: a._count.attempts,
		opens: a.availabilityStart,
		closes: a.availabilityEnd,
	}));
}

/**
 * Picks the assessment a request refers to: the pinned one, else the best title
 * match, else (when the request clearly needs one) the most recently updated.
 */
export async function resolveAssessment(
	user: ToolUser,
	ref: string | null,
	pinnedId: string | null,
	fallbackLatest: boolean,
) {
	if (pinnedId) {
		const pinned = await prisma.assessment.findFirst({
			where: { id: pinnedId, facultyId: user.id },
			select: { id: true, title: true },
		});
		if (pinned) return pinned;
	}
	const all = await prisma.assessment.findMany({
		where: { facultyId: user.id },
		orderBy: { updatedAt: "desc" },
		select: { id: true, title: true },
		take: 200,
	});
	if (ref?.trim()) {
		const want = norm(ref)
			.split(" ")
			.filter((w) => w.length > 1);
		let best: { id: string; title: string } | null = null;
		let bestScore = 0;
		for (const a of all) {
			const t = norm(a.title);
			const score = want.filter((w) => t.includes(w)).length / Math.max(1, want.length);
			if (score > bestScore) {
				best = a;
				bestScore = score;
			}
		}
		if (best && bestScore >= 0.5) return best;
	}
	return fallbackLatest ? (all[0] ?? null) : null;
}

export async function examOverview(assessmentId: string) {
	const a = await prisma.assessment.findUnique({
		where: { id: assessmentId },
		include: {
			questions: {
				orderBy: { order: "asc" },
				include: {
					topic: { select: { title: true, unit: { select: { number: true, title: true } } } },
				},
			},
			course: { select: { code: true, name: true } },
			topics: { include: { topic: { select: { title: true } } } },
			materials: { include: { material: { select: { title: true, kind: true } } } },
			_count: { select: { attempts: true } },
		},
	});
	if (!a) return null;
	const issues = await collectPublishIssues(assessmentId).catch(() => []);
	const marks = a.questions.reduce((s, q) => s + q.points, 0);
	return {
		id: a.id,
		title: a.title,
		type: a.assessmentType,
		status: a.published ? "published" : "draft",
		course: a.course ? `${a.course.code} — ${a.course.name}` : null,
		durationMinutes: a.duration,
		window: { opens: a.availabilityStart, closes: a.availabilityEnd },
		totalMarks: a.totalMarks ?? marks,
		questionMarksSum: marks,
		passingMarks: a.passingMarks,
		attemptsAllowed: a.attemptLimit,
		negativeMarking: a.negativeMarking ? { default: a.negativeMarkValue } : false,
		randomize: { questions: a.randomizeQuestions, options: a.randomizeOptions },
		integrity: {
			webcam: a.webcamMonitoring,
			faceVerification: a.faceVerification,
			gaze: a.gazeTracking,
			microphone: a.microphoneAnalysis,
			browserLockdown: a.browserLockdown,
			tabSwitchDetection: a.tabSwitchDetection,
			behaviourAnalysis: a.behavioralAnalysis,
		},
		resume: {
			allowed: a.allowResume,
			maxResumes: a.maxResumeCount,
			graceMinutes: a.resumeTimeWindow,
			autoSubmit: a.autoSubmitOnExpiry,
		},
		syllabusTopicsCovered: a.topics.map((t) => t.topic.title),
		materials: a.materials.map(
			(m) =>
				`${m.material.title} (${m.material.kind}${m.permittedInExam ? ", permitted in exam" : ""})`,
		),
		attempts: a._count.attempts,
		publishBlockers: issues.map((i) => i.message),
		questions: a.questions.map((q, i) => ({
			n: i + 1,
			type: q.type,
			difficulty: q.difficulty,
			marks: q.points,
			topic: q.topic ? `Unit ${q.topic.unit.number}: ${q.topic.title}` : null,
			outcome: q.learningOutcome,
			text: clip(q.text, 260),
			options: q.options ? (JSON.parse(q.options) as string[]).map((o) => clip(o, 80)) : undefined,
			answerKey: clip(q.correctAnswer, 200) || null,
		})),
	};
}

/* ───────────────────────── performance analytics ───────────────────────── */

export async function performance(user: ToolUser, assessmentId: string) {
	const a = await prisma.assessment.findUnique({
		where: { id: assessmentId },
		select: {
			title: true,
			passingMarks: true,
			totalMarks: true,
			questions: { orderBy: { order: "asc" }, include: { topic: { select: { title: true } } } },
		},
	});
	if (!a) return null;
	const attempts = await prisma.assessmentAttempt.findMany({
		where: { assessmentId, status: { in: ["submitted", "graded"] }, ...attemptSectionWhere(user) },
		select: {
			studentName: true,
			score: true,
			integrityScore: true,
			submittedAt: true,
			startedAt: true,
			student: { select: { section: true, rollNumber: true } },
			answers: { select: { questionId: true, aiGrade: true, manualGrade: true, response: true } },
		},
	});
	const total = a.totalMarks ?? a.questions.reduce((s, q) => s + q.points, 0);
	const scores = attempts.map((t) => {
		const fromAnswers = t.answers.reduce((s, x) => s + (x.manualGrade ?? x.aiGrade ?? 0), 0);
		return Math.max(0, t.score ?? fromAnswers);
	});
	const sorted = [...scores].sort((x, y) => x - y);
	const mean = scores.length ? scores.reduce((s, x) => s + x, 0) / scores.length : 0;
	const median = sorted.length
		? sorted.length % 2
			? sorted[(sorted.length - 1) / 2]
			: (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
		: 0;
	const buckets = ["0-39%", "40-59%", "60-74%", "75-89%", "90-100%"];
	const dist = [0, 0, 0, 0, 0];
	for (const s of scores) {
		const pct = total ? (s / total) * 100 : 0;
		dist[pct < 40 ? 0 : pct < 60 ? 1 : pct < 75 ? 2 : pct < 90 ? 3 : 4] += 1;
	}

	const perQuestion = a.questions.map((q, i) => {
		const ans = attempts.flatMap((t) => t.answers.filter((x) => x.questionId === q.id));
		const graded = ans.filter((x) => (x.manualGrade ?? x.aiGrade) != null);
		const avg = graded.length
			? graded.reduce((s, x) => s + (x.manualGrade ?? x.aiGrade ?? 0), 0) / graded.length
			: null;
		return {
			n: i + 1,
			type: q.type,
			difficulty: q.difficulty,
			topic: q.topic?.title ?? null,
			outcome: q.learningOutcome,
			text: clip(q.text, 140),
			answered: ans.filter((x) => x.response?.trim()).length,
			skipped: attempts.length - ans.filter((x) => x.response?.trim()).length,
			averageMarks: avg == null ? null : round(avg, 2),
			maxMarks: q.points,
			facilityIndex: avg == null || !q.points ? null : round(Math.max(0, avg) / q.points, 2),
		};
	});

	const groupBy = (key: "topic" | "outcome") => {
		const map = new Map<string, { got: number; max: number }>();
		for (const q of perQuestion) {
			const k = q[key];
			if (!k || q.averageMarks == null) continue;
			const cur = map.get(k) ?? { got: 0, max: 0 };
			cur.got += Math.max(0, q.averageMarks);
			cur.max += q.maxMarks;
			map.set(k, cur);
		}
		return [...map.entries()]
			.map(([name, v]) => ({ name, averagePercent: v.max ? round((v.got / v.max) * 100) : null }))
			.sort((x, y) => (x.averagePercent ?? 0) - (y.averagePercent ?? 0));
	};

	const sections = new Map<string, number[]>();
	attempts.forEach((t, i) => {
		const sec = t.student?.section || "Unassigned";
		sections.set(sec, [...(sections.get(sec) ?? []), scores[i]]);
	});

	const students = attempts
		.map((t, i) => ({
			name: t.studentName,
			roll: t.student?.rollNumber ?? null,
			section: t.student?.section ?? null,
			score: round(scores[i], 2),
			percent: total ? round((scores[i] / total) * 100) : null,
			integrityScore: round(t.integrityScore),
			minutesTaken: t.submittedAt
				? Math.round((t.submittedAt.getTime() - t.startedAt.getTime()) / 60000)
				: null,
		}))
		.sort((x, y) => y.score - x.score);

	return {
		assessment: a.title,
		totalMarks: total,
		passingMarks: a.passingMarks,
		submissions: attempts.length,
		mean: round(mean, 2),
		median: round(median, 2),
		highest: sorted.at(-1) ?? null,
		lowest: sorted[0] ?? null,
		passRate:
			a.passingMarks != null && scores.length
				? round((scores.filter((s) => s >= (a.passingMarks ?? 0)).length / scores.length) * 100)
				: null,
		distribution: Object.fromEntries(buckets.map((b, i) => [b, dist[i]])),
		bySection: [...sections.entries()].map(([section, list]) => ({
			section,
			students: list.length,
			mean: round(list.reduce((s, x) => s + x, 0) / list.length, 2),
		})),
		questions: perQuestion,
		hardestQuestions: [...perQuestion]
			.filter((q) => q.facilityIndex != null)
			.sort((x, y) => (x.facilityIndex ?? 0) - (y.facilityIndex ?? 0))
			.slice(0, 5)
			.map((q) => q.n),
		weakTopics: groupBy("topic").slice(0, 6),
		weakOutcomes: groupBy("outcome").slice(0, 6),
		students: students.length > 60 ? [...students.slice(0, 30), ...students.slice(-30)] : students,
		note: "Scores for descriptive/coding answers may still be pending AI or faculty grading.",
	};
}

/* ───────────────────────── integrity ───────────────────────── */

export async function integrityOverview(user: ToolUser, assessmentId: string) {
	const attempts = await prisma.assessmentAttempt.findMany({
		where: { assessmentId, ...attemptSectionWhere(user) },
		select: {
			id: true,
			studentName: true,
			status: true,
			integrityScore: true,
			riskLevel: true,
			warningCount: true,
			proctoringStatus: true,
			resumeCount: true,
			student: { select: { section: true, rollNumber: true } },
			violations: { select: { type: true, severity: true, timestamp: true } },
		},
		orderBy: { integrityScore: "asc" },
		take: 300,
	});
	const byType: Record<string, number> = {};
	const rows = attempts.map((t) => {
		const counts: Record<string, number> = {};
		for (const v of t.violations) {
			counts[v.type] = (counts[v.type] ?? 0) + 1;
			byType[v.type] = (byType[v.type] ?? 0) + 1;
		}
		return {
			student: t.studentName,
			roll: t.student?.rollNumber ?? null,
			section: t.student?.section ?? null,
			status: t.status,
			integrityScore: round(t.integrityScore),
			riskLevel: t.riskLevel,
			alerts: t.violations.length,
			highSeverity: t.violations.filter((v) => v.severity === "high").length,
			alertTypes: counts,
			proctoringStatus: t.proctoringStatus,
			resumes: t.resumeCount,
		};
	});
	const scores = rows.map((r) => r.integrityScore);
	return {
		attempts: rows.length,
		averageIntegrity: scores.length
			? round(scores.reduce((s, x) => s + x, 0) / scores.length)
			: null,
		alertsByType: byType,
		studentsWithMoreThanThreeAlerts: rows.filter((r) => r.alerts > 3).map((r) => r.student),
		students: rows,
		caution:
			"Alerts are automated indicators with false positives (lighting, glasses, poor webcams, accessibility needs). They are not proof of misconduct.",
	};
}

/** Chronological evidence for one student's attempt (matched by name or roll number). */
export async function attemptInvestigation(
	user: ToolUser,
	assessmentId: string,
	studentRef: string,
) {
	const ref = norm(studentRef);
	const candidates = await prisma.assessmentAttempt.findMany({
		where: { assessmentId, ...attemptSectionWhere(user) },
		select: { id: true, studentName: true, student: { select: { rollNumber: true } } },
	});
	const match =
		candidates.find((c) => c.student?.rollNumber && norm(c.student.rollNumber) === ref) ??
		candidates.find((c) => norm(c.studentName) === ref) ??
		candidates.find(
			(c) =>
				norm(c.studentName).includes(ref) ||
				ref.split(" ").every((w) => norm(c.studentName).includes(w)),
		);
	if (!match)
		return {
			found: false,
			searched: studentRef,
			studentsAvailable: candidates.slice(0, 20).map((c) => c.studentName),
		};

	const t = await prisma.assessmentAttempt.findUnique({
		where: { id: match.id },
		include: {
			violations: { orderBy: { timestamp: "asc" } },
			proctoringTimeline: { orderBy: { timestamp: "asc" } },
			answers: {
				include: {
					question: {
						select: { text: true, type: true, points: true, correctAnswer: true, order: true },
					},
				},
			},
			student: { select: { rollNumber: true, section: true } },
			_count: { select: { recordingSegments: true } },
		},
	});
	if (!t) return { found: false, searched: studentRef };
	const start = t.startedAt.getTime();
	const at = (d: Date) => {
		const s = Math.max(0, Math.round((d.getTime() - start) / 1000));
		return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
	};
	const timeline = [
		...t.violations.map((v) => ({
			t: v.timestamp,
			at: at(v.timestamp),
			kind: "alert",
			type: v.type,
			severity: v.severity,
			detail: clip(v.description, 160),
			network: v.network,
			latencyMs: v.latency,
		})),
		...t.proctoringTimeline.map((e) => ({
			t: e.timestamp,
			at: at(e.timestamp),
			kind: "event",
			type: e.event,
			detail: clip(e.details, 160),
		})),
	]
		.sort((x, y) => x.t.getTime() - y.t.getTime())
		.slice(0, 120)
		.map(({ t: _t, ...rest }) => rest);

	return {
		found: true,
		student: t.studentName,
		roll: t.student?.rollNumber ?? null,
		section: t.student?.section ?? null,
		status: t.status,
		startedAt: t.startedAt,
		submittedAt: t.submittedAt,
		integrityScore: round(t.integrityScore),
		riskLevel: t.riskLevel,
		warnings: t.warningCount,
		resumes: t.resumeCount,
		network: t.networkQuality,
		recordedSegments: t._count.recordingSegments,
		proctoringSummary: clip(t.proctoringSummary, 800) || null,
		aiEvaluationSummary: clip(t.evaluationSummary, 600) || null,
		plagiarismScore: t.plagiarismScore,
		aiContentScore: t.aiDetectionScore,
		timeline,
		answers: t.answers
			.sort((x, y) => x.question.order - y.question.order)
			.map((x) => ({
				question: clip(x.question.text, 200),
				type: x.question.type,
				maxMarks: x.question.points,
				rubric: clip(x.question.correctAnswer, 400) || null,
				response: clip(x.response, 900),
				aiGrade: x.aiGrade,
				manualGrade: x.manualGrade,
				flagged: x.isFlagged,
			})),
	};
}

export async function liveStatus(user: ToolUser, assessmentId: string) {
	const now = Date.now();
	const attempts = await prisma.assessmentAttempt.findMany({
		where: { assessmentId, status: "started", ...attemptSectionWhere(user) },
		select: {
			studentName: true,
			progress: true,
			integrityScore: true,
			faceStatus: true,
			networkQuality: true,
			isOnline: true,
			lastHeartbeatAt: true,
			timeLeft: true,
			violations: {
				where: { timestamp: { gte: new Date(now - 10 * 60 * 1000) } },
				select: { type: true },
			},
		},
	});
	const rows = attempts.map((t) => ({
		student: t.studentName,
		online: t.isOnline && (!t.lastHeartbeatAt || now - t.lastHeartbeatAt.getTime() < 2 * 60 * 1000),
		progressPercent: Math.round(t.progress),
		minutesLeft: t.timeLeft != null ? Math.round(t.timeLeft / 60) : null,
		integrityScore: round(t.integrityScore),
		face: t.faceStatus,
		network: t.networkQuality,
		alertsLast10Min: t.violations.length,
	}));
	return {
		asOf: new Date(now).toISOString(),
		inProgress: rows.length,
		online: rows.filter((r) => r.online).length,
		offline: rows.filter((r) => !r.online).map((r) => r.student),
		needingAttention: rows
			.filter((r) => r.alertsLast10Min >= 2 || r.integrityScore < 70 || r.face !== "Detected")
			.map((r) => r.student),
		students: rows,
	};
}

/* ───────────────────────── answer similarity ───────────────────────── */

function cosine(a: number[], b: number[]) {
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < Math.min(a.length, b.length); i++) {
		dot += a[i] * b[i];
		na += a[i] * a[i];
		nb += b[i] * b[i];
	}
	return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

const words = (s: string) =>
	new Set(
		norm(s)
			.split(" ")
			.filter((w) => w.length > 2),
	);
function jaccard(a: string, b: string) {
	const x = words(a);
	const y = words(b);
	const inter = [...x].filter((w) => y.has(w)).length;
	return x.size + y.size - inter ? inter / (x.size + y.size - inter) : 0;
}

/** Pairs of unusually similar written answers (embeddings when stored, word overlap otherwise). */
export async function answerSimilarity(user: ToolUser, assessmentId: string) {
	const questions = await prisma.question.findMany({
		where: { assessmentId, type: { in: ["descriptive", "short-answer", "coding"] } },
		select: { id: true, text: true, order: true },
		orderBy: { order: "asc" },
	});
	const pairs: {
		question: number;
		studentA: string;
		studentB: string;
		similarity: number;
		method: string;
		excerptA: string;
		excerptB: string;
	}[] = [];
	for (const q of questions) {
		const answers = await prisma.answer.findMany({
			where: { questionId: q.id, attempt: { ...attemptSectionWhere(user) } },
			select: { response: true, embedding: true, attempt: { select: { studentName: true } } },
			take: 200,
		});
		const usable = answers.filter((a) => a.response.trim().split(/\s+/).length >= 8);
		for (let i = 0; i < usable.length; i++) {
			for (let j = i + 1; j < usable.length; j++) {
				const A = usable[i];
				const B = usable[j];
				let sim = jaccard(A.response, B.response);
				let method = "word overlap";
				try {
					if (A.embedding && B.embedding) {
						sim = Math.max(sim, cosine(JSON.parse(A.embedding), JSON.parse(B.embedding)));
						method = "semantic embedding + word overlap";
					}
				} catch {
					/* ignore malformed */
				}
				if (sim >= 0.8)
					pairs.push({
						question: q.order + 1,
						studentA: A.attempt.studentName,
						studentB: B.attempt.studentName,
						similarity: round(sim, 2),
						method,
						excerptA: clip(A.response, 160),
						excerptB: clip(B.response, 160),
					});
			}
		}
	}
	pairs.sort((x, y) => y.similarity - x.similarity);
	return {
		writtenQuestionsChecked: questions.length,
		similarPairs: pairs.slice(0, 15),
		caution:
			"High similarity can come from model answers, shared textbooks or short factual responses. Review the full answers before drawing conclusions.",
	};
}

/* ───────────────────────── course knowledge ───────────────────────── */

/** Syllabus structure plus excerpts of the course's own documents (trusted knowledge base). */
export async function courseKnowledge(assessmentId: string, maxChars = 18_000) {
	const a = await prisma.assessment.findUnique({
		where: { id: assessmentId },
		select: { courseId: true, syllabusId: true },
	});
	if (!a?.courseId) return null;
	const course = await prisma.course.findUnique({
		where: { id: a.courseId },
		include: {
			syllabi: {
				where: a.syllabusId ? { id: a.syllabusId } : {},
				take: 1,
				include: {
					units: { orderBy: { order: "asc" }, include: { topics: { orderBy: { order: "asc" } } } },
				},
			},
			materials: { include: { file: true }, orderBy: { createdAt: "desc" }, take: 8 },
		},
	});
	if (!course) return null;
	const docs: { title: string; excerpt: string }[] = [];
	let budget = maxChars;
	for (const m of course.materials) {
		if (budget <= 500 || !m.file) continue;
		const mime = m.file.mimeType;
		if (
			![
				"application/pdf",
				"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
				"text/plain",
				"text/markdown",
			].includes(mime)
		)
			continue;
		try {
			const text = mime.startsWith("text/")
				? Buffer.from(m.file.data).toString("utf-8")
				: await extractText(Buffer.from(m.file.data).toString("base64"), mime);
			const excerpt = text.replace(/\s+/g, " ").trim().slice(0, Math.min(6000, budget));
			if (excerpt) {
				docs.push({ title: m.title, excerpt });
				budget -= excerpt.length;
			}
		} catch {
			/* unreadable document — skip */
		}
	}
	return {
		course: `${course.code} — ${course.name}`,
		syllabus:
			course.syllabi[0]?.units.map((u) => ({
				unit: u.number,
				title: u.title,
				topics: u.topics.map((t) => t.title),
			})) ?? [],
		materials: course.materials.map((m) => ({ title: m.title, kind: m.kind, link: m.url })),
		documentExcerpts: docs,
	};
}

/**
 * Finds a student of this assessment (within the faculty's sections) whose name or
 * roll number appears in the message — a fallback when the router missed it.
 */
export async function findMentionedStudent(
	user: ToolUser,
	assessmentId: string,
	message: string,
): Promise<string | null> {
	const text = ` ${norm(message)} `;
	const attempts = await prisma.assessmentAttempt.findMany({
		where: { assessmentId, ...attemptSectionWhere(user) },
		select: { studentName: true, student: { select: { rollNumber: true } } },
		take: 500,
	});
	let best: { name: string; score: number } | null = null;
	for (const a of attempts) {
		const roll = a.student?.rollNumber ? norm(a.student.rollNumber) : "";
		if (roll && text.includes(` ${roll} `)) return a.studentName;
		const parts = norm(a.studentName)
			.split(" ")
			.filter((p) => p.length > 2);
		const hits = parts.filter((p) => text.includes(` ${p} `)).length;
		const score = parts.length ? hits / parts.length : 0;
		if (hits > 0 && (!best || score > best.score)) best = { name: a.studentName, score };
	}
	return best?.name ?? null;
}
