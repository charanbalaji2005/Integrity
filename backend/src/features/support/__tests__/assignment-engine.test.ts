import { describe, expect, it } from "vitest";
import { type EngineSettings, rankCandidates, type StaffProfileDto } from "../services/assignment";
import { DEFAULT_WEIGHTS } from "../support-constants";

const settings: EngineSettings = {
	weights: DEFAULT_WEIGHTS,
	acceptanceTimeoutSeconds: 180,
	allowOfflineAssignment: false,
	reassignAlertThreshold: 2,
};

function rep(
	id: string,
	active: number,
	expertise: string[] = [],
	extra: Partial<StaffProfileDto> = {},
): StaffProfileDto {
	return {
		id,
		userId: `u-${id}`,
		name: id,
		email: `${id}@x`,
		supportRole: "agent",
		availability: "available",
		isOnline: true,
		lastSeenAt: null,
		assignmentsEnabled: true,
		maxActiveTickets: 15,
		activeTickets: active,
		pendingTickets: 0,
		workloadPercent: 0,
		expertise,
		workingHours: null,
		avgResolutionMinutes: null,
		avgFirstResponseMinutes: null,
		resolvedCount: 0,
		lastAssignedAt: null,
		...extra,
	};
}

describe("assignment engine", () => {
	it("spec scenario: camera ticket goes to the least-loaded camera expert (D), not merely the least-loaded rep", () => {
		const staff = [
			rep("A", 12),
			rep("B", 5, ["login_auth"]),
			rep("C", 8, ["camera_microphone"]),
			rep("D", 3, ["camera_microphone"]),
			rep("E", 10),
		];
		const ranked = rankCandidates(staff, "camera_microphone", settings, new Set());
		expect(ranked[0]!.staff.id).toBe("D");
		expect(ranked.findIndex((r) => r.staff.id === "C")).toBeLessThan(
			ranked.findIndex((r) => r.staff.id === "B"),
		);
	});

	it("prefers lower workload when expertise is equal", () => {
		const ranked = rankCandidates(
			[rep("busy", 9, ["network"]), rep("free", 1, ["network"])],
			"network",
			settings,
			new Set(),
		);
		expect(ranked[0]!.staff.id).toBe("free");
	});

	it("skips reps at capacity, offline, not available, disabled or excluded", () => {
		const staff = [
			rep("full", 15, ["network"]),
			rep("offline", 0, ["network"], { isOnline: false }),
			rep("break", 0, ["network"], { availability: "on_break" }),
			rep("disabled", 0, ["network"], { assignmentsEnabled: false }),
			rep("timedout", 0, ["network"]),
			rep("ok", 6, []),
		];
		const ranked = rankCandidates(staff, "network", settings, new Set(["timedout"]));
		expect(ranked.map((r) => r.staff.id)).toEqual(["ok"]);
	});

	it("allows offline reps only when offline assignment is enabled", () => {
		const staff = [rep("offline", 0, ["network"], { isOnline: false })];
		expect(rankCandidates(staff, "network", settings, new Set())).toHaveLength(0);
		expect(
			rankCandidates(staff, "network", { ...settings, allowOfflineAssignment: true }, new Set()),
		).toHaveLength(1);
	});

	it("respects working hours", () => {
		const offShift = rep("night", 0, [], {
			workingHours: { timezone: "UTC", days: [0, 1, 2, 3, 4, 5, 6], start: "02:00", end: "03:00" },
		});
		const noon = new Date("2026-11-18T12:00:00Z");
		expect(rankCandidates([offShift], "other", settings, new Set(), noon)).toHaveLength(0);
		expect(
			rankCandidates([offShift], "other", settings, new Set(), new Date("2026-11-18T02:30:00Z")),
		).toHaveLength(1);
	});

	it("returns nobody when every rep is at capacity", () => {
		expect(rankCandidates([rep("a", 15), rep("b", 15)], "other", settings, new Set())).toHaveLength(
			0,
		);
	});

	it("weights are configurable: with workload weighted 100%, the least-loaded rep wins regardless of expertise", () => {
		const s = {
			...settings,
			weights: { workload: 100, expertise: 0, availability: 0, performance: 0, recency: 0 },
		};
		const ranked = rankCandidates(
			[rep("expert", 7, ["camera_microphone"]), rep("idle", 0)],
			"camera_microphone",
			s,
			new Set(),
		);
		expect(ranked[0]!.staff.id).toBe("idle");
	});
});
