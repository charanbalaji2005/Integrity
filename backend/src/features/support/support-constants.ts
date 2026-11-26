export const SUPPORT_CATEGORIES = [
	{ key: "login_auth", label: "Login and Authentication", department: "Identity & Access" },
	{ key: "examination", label: "Examination Issues", department: "Examination Support" },
	{
		key: "assessment_quiz",
		label: "Assessment and Quiz Issues",
		department: "Examination Support",
	},
	{
		key: "camera_microphone",
		label: "Camera and Microphone Problems",
		department: "Proctoring Support",
	},
	{ key: "ai_proctoring", label: "AI Proctoring Issues", department: "Proctoring Support" },
	{ key: "face_verification", label: "Face Verification", department: "Proctoring Support" },
	{ key: "browser_compat", label: "Browser Compatibility", department: "Technical Support" },
	{ key: "network", label: "Network and Connectivity", department: "Technical Support" },
	{
		key: "syllabus_materials",
		label: "Syllabus and Learning Materials",
		department: "Academic Support",
	},
	{ key: "course_management", label: "Course Management", department: "Academic Support" },
	{ key: "results_grading", label: "Results and Grading", department: "Academic Support" },
	{ key: "account_profile", label: "Account and Profile", department: "Identity & Access" },
	{ key: "technical", label: "Technical Issues", department: "Technical Support" },
	{ key: "other", label: "Other", department: "General Support" },
] as const;

export const SUPPORT_MODULES = [
	{ key: "student_dashboard", label: "Student Dashboard" },
	{ key: "examination_portal", label: "Examination Portal" },
	{ key: "assessment_builder", label: "Assessment Builder" },
	{ key: "live_proctoring", label: "Live Proctoring" },
	{ key: "materials_syllabus", label: "Materials and Syllabus" },
	{ key: "results", label: "Results" },
	{ key: "profile_account", label: "Profile and Account" },
	{ key: "other", label: "Other" },
] as const;

export type CategoryKey = (typeof SUPPORT_CATEGORIES)[number]["key"];
export type ModuleKey = (typeof SUPPORT_MODULES)[number]["key"];
export type Priority = "P1" | "P2" | "P3" | "P4";
export type Urgency = "low" | "medium" | "high" | "critical";
export type TicketStatus =
	| "unassigned"
	| "pending_acceptance"
	| "in_progress"
	| "waiting_student"
	| "escalated"
	| "resolved";
export type Availability = "available" | "busy" | "away" | "offline" | "on_break" | "unavailable";

export const CATEGORY_KEYS = SUPPORT_CATEGORIES.map((c) => c.key) as string[];
export const MODULE_KEYS = SUPPORT_MODULES.map((m) => m.key) as string[];
export const PRIORITIES: Priority[] = ["P1", "P2", "P3", "P4"];
export const URGENCIES: Urgency[] = ["low", "medium", "high", "critical"];
export const AVAILABILITIES: Availability[] = [
	"available",
	"busy",
	"away",
	"offline",
	"on_break",
	"unavailable",
];
export const OPEN_STATUSES: TicketStatus[] = [
	"unassigned",
	"pending_acceptance",
	"in_progress",
	"waiting_student",
	"escalated",
];

export function categoryLabel(key: string): string {
	return SUPPORT_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}
export function categoryDepartment(key: string): string {
	return SUPPORT_CATEGORIES.find((c) => c.key === key)?.department ?? "General Support";
}
export function moduleLabel(key: string): string {
	return SUPPORT_MODULES.find((m) => m.key === key)?.label ?? key;
}

/** First-response SLA targets per priority (minutes) used for SLA compliance. */
export const FIRST_RESPONSE_SLA_MINUTES: Record<Priority, number> = {
	P1: 15,
	P2: 30,
	P3: 240,
	P4: 1440,
};

export const DEFAULT_WEIGHTS = {
	workload: 40,
	expertise: 30,
	availability: 15,
	performance: 10,
	recency: 5,
};
export type Weights = typeof DEFAULT_WEIGHTS;

/** How long a student may reopen a resolved ticket. */
export const REOPEN_WINDOW_DAYS = 7;
