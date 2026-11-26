import { prisma } from "./prisma";

const INSTITUTION = "SRM University AP";

interface SeedQuestion {
	type: "multiple-choice" | "descriptive" | "coding";
	text: string;
	options?: string[];
	correctAnswer?: string;
	points: number;
	difficulty: "easy" | "medium" | "hard";
}

interface SeedLiveAssessment {
	id: string;
	title: string;
	description: string;
	duration: number;
	/** Days the assessment stays open from now. */
	openDays: number;
	questions: SeedQuestion[];
}

const mcq = (
	text: string,
	options: string[],
	correctAnswer: string,
	points = 2,
	difficulty: SeedQuestion["difficulty"] = "easy",
): SeedQuestion => ({ type: "multiple-choice", text, options, correctAnswer, points, difficulty });

export const LIVE_ASSESSMENTS: SeedLiveAssessment[] = [
	{
		id: "seed-live-dbms-midterm",
		title: "Live: Database Management Systems Mid-Term",
		description: "Proctored mid-term covering SQL, normalisation, transactions and indexing.",
		duration: 45,
		openDays: 14,
		questions: [
			mcq(
				"Which normal form removes transitive dependencies?",
				["1NF", "2NF", "3NF", "BCNF"],
				"3NF",
			),
			mcq(
				"Which SQL clause filters rows after aggregation?",
				["WHERE", "HAVING", "GROUP BY", "ORDER BY"],
				"HAVING",
			),
			mcq(
				"Which ACID property guarantees committed data survives a crash?",
				["Atomicity", "Consistency", "Isolation", "Durability"],
				"Durability",
			),
			mcq(
				"A B+ tree index is best suited for which query?",
				["Range scans", "Full-text search", "Bitmap joins", "Graph traversal"],
				"Range scans",
				2,
				"medium",
			),
			{
				type: "descriptive",
				text: "Explain the difference between optimistic and pessimistic concurrency control, with one scenario for each.",
				points: 6,
				difficulty: "medium",
			},
			{
				type: "coding",
				text: "Write a SQL query that returns the top 3 departments by average salary, including departments with ties.",
				points: 6,
				difficulty: "hard",
			},
		],
	},
	{
		id: "seed-live-os-quiz",
		title: "Live: Operating Systems Quiz",
		description: "Short proctored quiz on scheduling, memory management and synchronisation.",
		duration: 20,
		openDays: 7,
		questions: [
			mcq(
				"Which scheduling algorithm can cause starvation?",
				["Round Robin", "FCFS", "Shortest Job First", "Multilevel Feedback with ageing"],
				"Shortest Job First",
			),
			mcq(
				"What does a TLB cache?",
				["Disk blocks", "Page table entries", "System calls", "Interrupt vectors"],
				"Page table entries",
			),
			mcq(
				"Which condition is NOT required for deadlock?",
				["Mutual exclusion", "Hold and wait", "Preemption", "Circular wait"],
				"Preemption",
				2,
				"medium",
			),
			{
				type: "descriptive",
				text: "Describe how a semaphore differs from a mutex and when you would use each.",
				points: 4,
				difficulty: "medium",
			},
		],
	},
	{
		id: "seed-live-python-lab",
		title: "Live: Python Programming Lab Test",
		description:
			"Hands-on proctored coding test. Webcam, tab-switch and behaviour monitoring are enabled.",
		duration: 60,
		openDays: 10,
		questions: [
			mcq("What is the output of len({1, 2, 2, 3})?", ["2", "3", "4", "Error"], "3"),
			mcq(
				"Which keyword creates a generator function?",
				["return", "yield", "async", "lambda"],
				"yield",
			),
			{
				type: "coding",
				text: "Write a function is_anagram(a, b) that returns True when the two strings are anagrams, ignoring case and spaces.",
				points: 6,
				difficulty: "easy",
			},
			{
				type: "coding",
				text: "Implement an LRU cache class with get(key) and put(key, value) in O(1) time.",
				points: 10,
				difficulty: "hard",
			},
		],
	},
	{
		id: "seed-live-networks-test",
		title: "Live: Computer Networks Unit Test",
		description: "Proctored unit test on the TCP/IP stack, routing and network security basics.",
		duration: 30,
		openDays: 21,
		questions: [
			mcq(
				"Which layer does a router primarily operate at?",
				["Data link", "Network", "Transport", "Application"],
				"Network",
			),
			mcq(
				"Which protocol resolves IP addresses to MAC addresses?",
				["DNS", "DHCP", "ARP", "ICMP"],
				"ARP",
			),
			mcq(
				"TCP's three-way handshake uses which sequence?",
				["SYN, ACK, FIN", "SYN, SYN-ACK, ACK", "ACK, SYN, ACK", "SYN, FIN, ACK"],
				"SYN, SYN-ACK, ACK",
			),
			{
				type: "descriptive",
				text: "Explain how TLS protects data in transit, covering the handshake and symmetric session keys.",
				points: 6,
				difficulty: "medium",
			},
		],
	},
];

/**
 * Upserts a set of published, fully proctored assessments that are open right now,
 * so the student "Live Sessions" view and faculty live monitoring have data to work with.
 * Safe to re-run: assessments are upserted and questions are only created once.
 */
export async function seedLiveAssessments(
	facultyId: string,
	facultyName: string,
): Promise<string[]> {
	const now = new Date();
	const seeded: string[] = [];

	for (const a of LIVE_ASSESSMENTS) {
		const end = new Date(now.getTime() + a.openDays * 24 * 60 * 60 * 1000);
		const window = {
			availabilityStart: now,
			availabilityEnd: end,
			published: true,
			facultyId,
			facultyName,
		};

		await prisma.assessment.upsert({
			where: { id: a.id },
			update: window,
			create: {
				id: a.id,
				title: a.title,
				description: a.description,
				duration: a.duration,
				attemptLimit: 3,
				institutionName: INSTITUTION,
				...window,
				webcamMonitoring: true,
				microphoneAnalysis: false,
				browserLockdown: true,
				faceVerification: true,
				gazeTracking: true,
				tabSwitchDetection: true,
				behavioralAnalysis: true,
				allowResume: true,
				maxResumeCount: 3,
			},
		});

		const existing = await prisma.question.count({ where: { assessmentId: a.id } });
		if (existing === 0) {
			await prisma.question.createMany({
				data: a.questions.map((q) => ({
					assessmentId: a.id,
					type: q.type,
					text: q.text,
					options: q.options ? JSON.stringify(q.options) : null,
					correctAnswer: q.correctAnswer ?? null,
					points: q.points,
					difficulty: q.difficulty,
				})),
			});
		}
		seeded.push(a.id);
	}

	return seeded;
}
