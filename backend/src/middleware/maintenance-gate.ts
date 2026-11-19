/**
 * Maintenance / emergency-shutdown access policy.
 *
 * While either mode is on, every portal (student, faculty, support) is down
 * and only the admin panel keeps working. Kept as a pure function so the
 * rules are unit-tested and live in one place.
 */

export type GateStatus = "EMERGENCY_SHUTDOWN" | "MAINTENANCE_MODE";

export type GateDecision =
	| { allow: true; needsRole?: false }
	/** Path alone doesn't decide it: the caller must resolve the user's role. */
	| { allow: false; needsRole: true }
	| { allow: false; needsRole?: false; status: GateStatus; message: string };

/** Always reachable: the admin API, Better Auth internals and health checks. */
const OPEN_PREFIXES = ["/api/admin", "/api/auth", "/api/health"];

/**
 * Sign-in endpoints stay open so an administrator can still log in during
 * maintenance. A non-admin who signs in gains nothing: every other API stays
 * blocked for them and the frontend shows the maintenance screen.
 * (Registration is intentionally not listed.)
 */
const SIGN_IN_PATHS = [
	"/api/authentication/login",
	"/api/authentication/logout",
	"/api/authentication/verify-otp",
	"/api/authentication/forgot-password",
	"/api/authentication/magic-link",
	"/api/authentication/google",
	"/api/authentication/oauth-complete",
];

/** Segment-aware prefix match: "/api/admin" matches "/api/admin/x", not "/api/administrator". */
function matchesPrefix(path: string, prefix: string): boolean {
	return path === prefix || path.startsWith(`${prefix}/`);
}

export function isMaintenanceExemptPath(path: string): boolean {
	const clean = path.split("?")[0].replace(/\/+$/, "") || "/";
	return OPEN_PREFIXES.some((p) => matchesPrefix(clean, p)) || SIGN_IN_PATHS.includes(clean);
}

const PORTAL_MESSAGE: Record<string, string> = {
	faculty: "Faculty portal is undergoing planned maintenance. Please try again later.",
	support: "Support portal is undergoing planned maintenance. Please try again later.",
};

export function decideMaintenanceAccess(params: {
	path: string;
	maintenanceMode: boolean;
	emergencyShutdown: boolean;
	/** undefined = not resolved yet; null = anonymous. */
	role?: string | null;
}): GateDecision {
	const { path, maintenanceMode, emergencyShutdown, role } = params;
	if (!maintenanceMode && !emergencyShutdown) return { allow: true };
	if (isMaintenanceExemptPath(path)) return { allow: true };
	if (role === undefined) return { allow: false, needsRole: true };
	if (role === "admin") return { allow: true };

	if (emergencyShutdown) {
		return {
			allow: false,
			status: "EMERGENCY_SHUTDOWN",
			message: "System has been suspended by the administrator for safety and security.",
		};
	}
	return {
		allow: false,
		status: "MAINTENANCE_MODE",
		message:
			PORTAL_MESSAGE[role ?? ""] ??
			"Student portal is undergoing planned maintenance. Please try again later.",
	};
}
