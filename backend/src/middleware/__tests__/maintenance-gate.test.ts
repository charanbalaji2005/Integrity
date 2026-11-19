import { describe, expect, it } from "vitest";
import { decideMaintenanceAccess, isMaintenanceExemptPath } from "../maintenance-gate";

const on = { maintenanceMode: true, emergencyShutdown: false };

describe("maintenance gate", () => {
	it("lets everything through when the platform is up", () => {
		expect(
			decideMaintenanceAccess({
				path: "/api/assessments",
				maintenanceMode: false,
				emergencyShutdown: false,
				role: null,
			}),
		).toEqual({ allow: true });
	});

	it("keeps admin login and the admin API reachable without a session", () => {
		for (const path of [
			"/api/authentication/login",
			"/api/authentication/verify-otp",
			"/api/authentication/forgot-password",
			"/api/admin/settings",
			"/api/auth/get-session",
			"/api/health",
		]) {
			expect(decideMaintenanceAccess({ path, ...on }).allow).toBe(true);
		}
	});

	it("does not open registration or look-alike paths", () => {
		expect(isMaintenanceExemptPath("/api/authentication/send-register-otp")).toBe(false);
		expect(isMaintenanceExemptPath("/api/administrator")).toBe(false);
		expect(isMaintenanceExemptPath("/api/healthz")).toBe(false);
	});

	it("asks for the role on other paths, then admits admins only", () => {
		expect(decideMaintenanceAccess({ path: "/api/notifications", ...on })).toEqual({
			allow: false,
			needsRole: true,
		});
		expect(
			decideMaintenanceAccess({ path: "/api/notifications", ...on, role: "admin" }).allow,
		).toBe(true);
	});

	it("takes every non-admin portal down, including support", () => {
		for (const [role, portal] of [
			["user", "Student"],
			["faculty", "Faculty"],
			["support", "Support"],
			[null, "Student"],
		] as const) {
			const d = decideMaintenanceAccess({ path: "/api/support/tickets", ...on, role });
			expect(d).toMatchObject({ allow: false, status: "MAINTENANCE_MODE" });
			expect("message" in d && d.message).toContain(portal);
		}
	});

	it("emergency shutdown blocks non-admins but not the admin panel", () => {
		const shut = { maintenanceMode: false, emergencyShutdown: true };
		expect(
			decideMaintenanceAccess({ path: "/api/assessments", ...shut, role: "faculty" }),
		).toMatchObject({
			status: "EMERGENCY_SHUTDOWN",
		});
		expect(
			decideMaintenanceAccess({ path: "/api/assessments", ...shut, role: "admin" }).allow,
		).toBe(true);
		expect(decideMaintenanceAccess({ path: "/api/authentication/login", ...shut }).allow).toBe(
			true,
		);
	});
});
