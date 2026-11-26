/**
 * Default accounts that may sign in to every portal (admin, faculty, support,
 * student) with one set of credentials. Their role follows the portal they
 * sign in through, and they are never limited by faculty section scoping.
 * Override with a comma-separated MULTI_PORTAL_EMAILS environment variable.
 */
export const MULTI_PORTAL_EMAILS = (
	process.env.MULTI_PORTAL_EMAILS || "charanbalajineelampalli752005@gmail.com"
)
	.split(",")
	.map((e) => e.trim().toLowerCase())
	.filter(Boolean);

export function isMultiPortalEmail(email: string | null | undefined): boolean {
	return !!email && MULTI_PORTAL_EMAILS.includes(email.trim().toLowerCase());
}

/**
 * Accounts that are never locked or suspended (failed logins, the security agent
 * or admin actions), so the platform owner can always sign in. Same list as the
 * multi-portal default accounts.
 */
export function isLockExempt(email: string | null | undefined): boolean {
	return isMultiPortalEmail(email);
}
