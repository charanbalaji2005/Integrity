import { Annotation, StateGraph } from "@langchain/langgraph";
import { env } from "../../../config/env";
import { prisma } from "../../../database";
import { emitToAssessmentMonitors, getIO } from "../../../providers/socket";
import { getRule, type RuleId } from "../agent-control/agent-config";
import { recordDetections, track } from "../agent-control/agent-telemetry";
import { runBehaviorAgent } from "../agents/behavior-agent";
import { runBrowserAgent } from "../agents/browser-agent";
import { compileEvidenceInvestigation } from "../agents/evidence-agent";
import { runFaceAgent } from "../agents/face-agent";
import { orchestrateProctoringPolicy } from "../agents/proctor-orchestrator";
import { reviewFlaggedFrame, shouldReviewFrame } from "../agents/vision-review-agent";
import {
	buildEvidenceEvent,
	type EvidenceEvent,
	type EvidenceType,
	riskScoreForEvent,
	severityForEvent,
} from "../evidence/evidence-builder";
import {
	EvidenceFusionEngine,
	type FusionSnapshot,
	type MultiDimensionalIntegrityMetrics,
} from "../evidence/evidence-fusion";
import { type CameraQualityMetrics, evaluateCameraQuality } from "../perception/camera-quality";
import {
	computeFaceDescriptor,
	descriptorDistance,
	detectFacePerception,
	type FacePerceptionResult,
} from "../perception/face-detector";
import { evaluateLiveness, type LivenessResult } from "../perception/liveness";
import {
	type DetectedSpatialObject,
	detectSpatialObjectsWithStatus,
} from "../perception/object-detector";
import type { CalibrationBaseline } from "../perception/pose-estimator";
import { ProctorEventDeduplicator } from "../temporal/event-deduplicator";
import { ProctorEventStateMachine } from "../temporal/event-state-machine";
import { TemporalSignalBuffer, type TemporalSummary } from "../temporal/signal-buffer";

const BROWSER_EVENT_TYPES = new Set<EvidenceType>([
	"BROWSER_UNFOCUSED",
	"DEVTOOLS_OPENED",
	"FULLSCREEN_EXITED",
]);

export interface BrowserTelemetry {
	/** Cumulative count of visibility/blur losses since the exam UI loaded. */
	tabSwitches: number;
	visibilityHidden: boolean;
	isDevToolsOpen: boolean;
	fullscreenExited: boolean;
	/** Cumulative full-screen exits since the exam UI loaded (informational). */
	fullscreenExits?: number;
	/** Copy/cut/paste/right-click attempts since the last delivered frame (delta). */
	clipboardEvents?: number;
	/** Window focus losses (not tab switches) since the last delivered frame (delta). */
	windowBlurs?: number;
	/** Set when the legacy string form explicitly reported a discrete event. */
	discreteEvent?: "tab-switch" | "window-minimize";
}

function nonNegativeInt(raw: unknown): number | undefined {
	const n = Number(raw);
	return Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n), 1000) : undefined;
}

export function normalizeBrowserTelemetry(raw: unknown): BrowserTelemetry | null {
	if (raw == null) return null;
	if (typeof raw === "string") {
		if (raw === "tab-switch" || raw === "window-minimize") {
			return {
				tabSwitches: 0,
				visibilityHidden: raw === "window-minimize",
				isDevToolsOpen: false,
				fullscreenExited: false,
				discreteEvent: raw,
			};
		}
		return null;
	}
	if (typeof raw !== "object") return null;
	const r = raw as Record<string, unknown>;
	const n = Number(r.tabSwitches);
	return {
		tabSwitches: Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0,
		visibilityHidden: r.visibilityHidden === true,
		isDevToolsOpen: r.isDevToolsOpen === true,
		fullscreenExited: r.fullscreenExited === true,
		fullscreenExits: nonNegativeInt(r.fullscreenExits),
		clipboardEvents: nonNegativeInt(r.clipboardEvents),
		windowBlurs: nonNegativeInt(r.windowBlurs),
	};
}

export type ProctorSessionStatus =
	| "NORMAL"
	| "WARNING"
	| "PAUSED"
	| "UNDER_REVIEW"
	| "TERMINATED"
	| "SUBMITTED";

export interface AgentHealth {
	faceDetector: "ok" | "failed" | "no_frame";
	objectDetector: "ok" | "failed" | "no_frame";
	identity: "match" | "mismatch" | "inconclusive" | "not_enrolled" | "skipped";
	liveness: LivenessResult["status"];
	lastFrameAt: string | null;
}

export const MONITORED_OBJECTS = [
	"Mobile Phone",
	"Secondary Screen",
	"Book",
	"Audio Earphones",
] as const;
type MonitoredObject = (typeof MONITORED_OBJECTS)[number];

export interface AdvancedProctorSession {
	attemptId: string;
	buffer: TemporalSignalBuffer;
	deduplicator: ProctorEventDeduplicator;
	fusion: EvidenceFusionEngine;
	stateMachines: {
		attentionDeviation: ProctorEventStateMachine;
		faceMissing: ProctorEventStateMachine;
		multipleFaces: ProctorEventStateMachine;
		speech: ProctorEventStateMachine;
		eyeClosure: ProctorEventStateMachine;
		cameraUnusable: ProctorEventStateMachine;
		liveness: ProctorEventStateMachine;
		identity: ProctorEventStateMachine;
		objects: Record<MonitoredObject, ProctorEventStateMachine>;
	};
	baseline?: CalibrationBaseline | null;
	referenceDescriptor: number[] | null;
	status: ProctorSessionStatus;
	warningCount: number;
	tabSwitchCount: number;
	lastReportedTabSwitches: number;
	devToolsOpen: boolean;
	frameCounter: number;
	stateVersion: number;
	health: AgentHealth;
}

interface PersistedSessionState {
	version: 1;
	stateVersion: number;
	baseline: CalibrationBaseline | null;
	referenceDescriptor: number[] | null;
	tabSwitchCount: number;
	lastReportedTabSwitches: number;
	devToolsOpen: boolean;
	frameCounter: number;
	fusion: FusionSnapshot;
}

/** Re-verify identity every N frames (~every 10s at the 2.5s client cadence). */
const IDENTITY_CHECK_EVERY_N_FRAMES = 4;

function createStateMachines(): AdvancedProctorSession["stateMachines"] {
	// Detection windows come from the versioned admin config. They are captured
	// at session creation, so active exams keep the configuration they started with.
	const ms = (id: RuleId) => getRule(id).detectionMs ?? 3000;
	const obj = ms("PROHIBITED_OBJECT");
	return {
		attentionDeviation: new ProctorEventStateMachine(
			"SUSTAINED_HEAD_DEVIATION",
			ms("SUSTAINED_HEAD_DEVIATION"),
		),
		faceMissing: new ProctorEventStateMachine("ABSENT_CANDIDATE", ms("ABSENT_CANDIDATE")),
		multipleFaces: new ProctorEventStateMachine("MULTIPLE_INDIVIDUALS", ms("MULTIPLE_INDIVIDUALS")),
		speech: new ProctorEventStateMachine("SUSPECTED_SPEECH", ms("SUSPECTED_SPEECH")),
		eyeClosure: new ProctorEventStateMachine("PROLONGED_EYE_CLOSURE", ms("PROLONGED_EYE_CLOSURE")),
		cameraUnusable: new ProctorEventStateMachine("CAMERA_DEGRADATION", ms("CAMERA_DEGRADATION")),
		liveness: new ProctorEventStateMachine("LIVENESS_FAILURE", ms("LIVENESS_FAILURE")),
		identity: new ProctorEventStateMachine("IDENTITY_MISMATCH", ms("IDENTITY_MISMATCH")),
		objects: {
			"Mobile Phone": new ProctorEventStateMachine("PROHIBITED_OBJECT:Mobile Phone", obj),
			"Secondary Screen": new ProctorEventStateMachine("PROHIBITED_OBJECT:Secondary Screen", obj),
			Book: new ProctorEventStateMachine("PROHIBITED_OBJECT:Book", obj),
			"Audio Earphones": new ProctorEventStateMachine("PROHIBITED_OBJECT:Audio Earphones", obj),
		},
	};
}

function parsePersistedState(raw: string | null | undefined): PersistedSessionState | null {
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as PersistedSessionState;
		return parsed && parsed.version === 1 ? parsed : null;
	} catch {
		return null;
	}
}

function normalizeStatus(value: string | null | undefined): ProctorSessionStatus {
	const allowed: ProctorSessionStatus[] = [
		"NORMAL",
		"WARNING",
		"PAUSED",
		"UNDER_REVIEW",
		"TERMINATED",
		"SUBMITTED",
	];
	return allowed.includes(value as ProctorSessionStatus)
		? (value as ProctorSessionStatus)
		: "NORMAL";
}

/** Row fields needed to (re)hydrate a session; matches the attempt row. */
export interface AttemptStateRow {
	id: string;
	proctoringState: string | null;
	proctoringStatus: string;
	warningCount: number;
	lastFrameAt?: Date | null;
}

/**
 * Session registry. Memory is only a cache: the durable copy lives in
 * assessment_attempts.proctoringState, so a restart, a reconnect or a request
 * landing on another backend instance rebuilds the same agent context.
 */
class AdvancedSessionRegistry {
	private sessions = new Map<string, AdvancedProctorSession>();
	private inFlight = new Set<string>();

	private build(row: AttemptStateRow | null, attemptId: string): AdvancedProctorSession {
		const persisted = parsePersistedState(row?.proctoringState);
		const fusion = new EvidenceFusionEngine(attemptId, persisted?.fusion ?? null);
		const session: AdvancedProctorSession = {
			attemptId,
			buffer: new TemporalSignalBuffer(20),
			deduplicator: new ProctorEventDeduplicator(6000),
			fusion,
			stateMachines: createStateMachines(),
			baseline: persisted?.baseline ?? null,
			referenceDescriptor: persisted?.referenceDescriptor ?? null,
			status: normalizeStatus(row?.proctoringStatus),
			warningCount: row?.warningCount ?? 0,
			tabSwitchCount: persisted?.tabSwitchCount ?? 0,
			lastReportedTabSwitches: persisted?.lastReportedTabSwitches ?? 0,
			devToolsOpen: persisted?.devToolsOpen ?? false,
			frameCounter: persisted?.frameCounter ?? 0,
			stateVersion: persisted?.stateVersion ?? 0,
			health: {
				faceDetector: "no_frame",
				objectDetector: "no_frame",
				identity: persisted?.referenceDescriptor ? "inconclusive" : "not_enrolled",
				liveness: "uncertain",
				lastFrameAt: row?.lastFrameAt ? row.lastFrameAt.toISOString() : null,
			},
		};
		fusion.setIdentityEnrolled(Boolean(session.referenceDescriptor));
		return session;
	}

	/**
	 * Returns the session for an attempt, rehydrating from the DB row when the
	 * cached copy is missing or older than what another instance persisted.
	 */
	public ensureSession(row: AttemptStateRow): AdvancedProctorSession {
		const cached = this.sessions.get(row.id);
		const persisted = parsePersistedState(row.proctoringState);
		const persistedVersion = persisted?.stateVersion ?? 0;

		if (cached && cached.stateVersion >= persistedVersion) {
			// DB is authoritative for lifecycle fields changed by faculty actions.
			cached.status = normalizeStatus(row.proctoringStatus);
			cached.warningCount = Math.max(cached.warningCount, row.warningCount);
			return cached;
		}

		const session = this.build(row, row.id);
		this.sessions.set(row.id, session);
		return session;
	}

	/** Cache-only accessor used inside the graph after ensureSession ran. */
	public getSession(attemptId: string): AdvancedProctorSession {
		let session = this.sessions.get(attemptId);
		if (!session) {
			session = this.build(null, attemptId);
			this.sessions.set(attemptId, session);
		}
		return session;
	}

	public setCalibration(
		attemptId: string,
		baseline: CalibrationBaseline,
		referenceDescriptor: number[] | null,
	): void {
		const session = this.getSession(attemptId);
		session.baseline = baseline;
		session.referenceDescriptor = referenceDescriptor;
		session.fusion.setIdentityEnrolled(Boolean(referenceDescriptor));
		session.health.identity = referenceDescriptor ? "inconclusive" : "not_enrolled";
		// Calibration starts a fresh observation window.
		session.buffer.clear();
		session.stateMachines = createStateMachines();
	}

	public serialize(session: AdvancedProctorSession): string {
		session.stateVersion += 1;
		const state: PersistedSessionState = {
			version: 1,
			stateVersion: session.stateVersion,
			baseline: session.baseline ?? null,
			referenceDescriptor: session.referenceDescriptor,
			tabSwitchCount: session.tabSwitchCount,
			lastReportedTabSwitches: session.lastReportedTabSwitches,
			devToolsOpen: session.devToolsOpen,
			frameCounter: session.frameCounter,
			fusion: session.fusion.snapshot(),
		};
		return JSON.stringify(state);
	}

	public async persist(session: AdvancedProctorSession): Promise<void> {
		await prisma.assessmentAttempt.update({
			where: { id: session.attemptId },
			data: { proctoringState: this.serialize(session) },
		});
	}

	/** Per-attempt single-flight guard so overlapping frames never run concurrently. */
	public tryAcquire(attemptId: string): boolean {
		if (this.inFlight.has(attemptId)) return false;
		this.inFlight.add(attemptId);
		return true;
	}

	public release(attemptId: string): void {
		this.inFlight.delete(attemptId);
	}

	public removeSession(attemptId: string): void {
		this.sessions.delete(attemptId);
		this.inFlight.delete(attemptId);
	}
}

export const proctorSessionRegistry = new AdvancedSessionRegistry();

// --- LANGGRAPH STATE ANNOTATION ---
const ProctorGraphState = Annotation.Root({
	attemptId: Annotation<string>(),
	frame: Annotation<string | undefined>(),
	browser: Annotation<BrowserTelemetry | null>(),
	networkDetails: Annotation<unknown>(),
	qualityResult: Annotation<CameraQualityMetrics>(),
	faceResult: Annotation<FacePerceptionResult>(),
	objects: Annotation<DetectedSpatialObject[]>(),
	objectDetectorOk: Annotation<boolean>(),
	identityCheck: Annotation<"match" | "mismatch" | null>(),
	identityDistance: Annotation<number | null>(),
	liveness: Annotation<LivenessResult>(),
	temporal: Annotation<TemporalSummary>(),
	browserEvent: Annotation<string | undefined>(),
	newEvents: Annotation<EvidenceEvent[]>(),
	metrics: Annotation<MultiDimensionalIntegrityMetrics>(),
	action: Annotation<"none" | "warning" | "pause">(),
	statusMessage: Annotation<string>(),
	requiresHumanReview: Annotation<boolean>(),
});

type GraphState = typeof ProctorGraphState.State;

// Node 1: Camera Quality Analysis
async function cameraQualityNode(state: GraphState) {
	if (!state.frame) {
		// No frame is a monitoring gap, never a "clean" frame.
		return {
			qualityResult: {
				brightness: 0,
				blur: 1,
				faceVisibility: 0,
				occlusion: 1,
				lightingState: "under-exposed" as const,
				usable: false,
				qualityScore: 0,
				warningMessage: "No camera frame received from the candidate device.",
			},
		};
	}
	const frame = state.frame;
	const qualityResult = await track("camera-quality", () => evaluateCameraQuality(frame));
	return { qualityResult };
}

// Node 2: Face Perception (+ periodic identity re-verification)
async function facePerceptionNode(state: GraphState) {
	if (!state.frame) {
		return {
			faceResult: { detected: false, faceCount: 0, confidence: 0, error: "NO_FRAME" },
			identityCheck: null,
			identityDistance: null,
		};
	}
	const session = proctorSessionRegistry.getSession(state.attemptId);
	const frame = state.frame;
	const face = await track("face-perception", () => detectFacePerception(frame, session.baseline), {
		// A detector error is a failed execution, not an "absent face".
		isFailure: (f) => (f.error && f.error !== "NO_FRAME" ? String(f.error) : null),
	});

	let identityCheck: "match" | "mismatch" | null = null;
	let identityDistance: number | null = null;
	const shouldVerify =
		session.referenceDescriptor &&
		face.detected &&
		face.faceCount === 1 &&
		session.frameCounter % IDENTITY_CHECK_EVERY_N_FRAMES === 0;

	if (shouldVerify && session.referenceDescriptor) {
		const descriptor = await computeFaceDescriptor(state.frame);
		if (descriptor) {
			identityDistance = Number(
				descriptorDistance(descriptor, session.referenceDescriptor).toFixed(3),
			);
			identityCheck = identityDistance < env.FACE_MATCH_THRESHOLD ? "match" : "mismatch";
		}
	}

	return { faceResult: face, identityCheck, identityDistance };
}

// Node 3: Object Detection with Spatial Reasoning
async function objectPerceptionNode(state: GraphState) {
	if (!state.frame) {
		return { objects: [], objectDetectorOk: false };
	}
	const frame = state.frame;
	const result = await track("object-detection", () => detectSpatialObjectsWithStatus(frame), {
		isFailure: (r) => (r.ok ? null : r.error || "detector failed"),
	});
	if (!result.ok) {
		console.warn(`[objectPerception] Detector failed for ${state.attemptId}: ${result.error}`);
	}
	return { objects: result.objects, objectDetectorOk: result.ok };
}

// Node 4: Temporal Signal Buffering + liveness
async function temporalAggregationNode(state: GraphState) {
	const session = proctorSessionRegistry.getSession(state.attemptId);
	const browser = state.browser;

	// Derive a discrete browser event from cumulative counters (delta since last frame).
	let browserEvent: string | undefined;
	if (browser) {
		if (browser.discreteEvent) {
			browserEvent = browser.discreteEvent;
		} else if (browser.tabSwitches < session.lastReportedTabSwitches) {
			// Client counter reset (page reload): re-baseline without an event.
			session.lastReportedTabSwitches = browser.tabSwitches;
		} else if (browser.tabSwitches > session.lastReportedTabSwitches) {
			browserEvent = browser.visibilityHidden ? "window-minimize" : "tab-switch";
		}
	}

	if (state.frame) {
		session.buffer.push({
			timestamp: Date.now(),
			face: state.faceResult,
			objects: state.objects || [],
			quality: state.qualityResult,
			browserEvent,
		});
	}

	const temporal = session.buffer.analyzeWindow();
	const liveness = evaluateLiveness(state.faceResult, session.buffer.getRecentFaces());
	return { temporal, liveness, browserEvent };
}

interface ConditionSpec {
	machine: ProctorEventStateMachine;
	present: boolean;
	confidence: number;
	dedupKey: string;
	type: EvidenceType;
	description: string;
	signals: Record<string, unknown>;
	/** When false the observation is unknown; the machine is not advanced. */
	observable?: boolean;
}

// Node 5: Event State Machines & Deduplication
async function eventBuilderNode(state: GraphState) {
	const session = proctorSessionRegistry.getSession(state.attemptId);
	const { temporal, faceResult, objects, qualityResult, attemptId, liveness } = state;
	const newEvents: EvidenceEvent[] = [];
	const now = Date.now();

	const faceObservable = !faceResult.error && qualityResult.usable;

	const evaluate = (spec: ConditionSpec) => {
		if (spec.observable === false) return;
		const rule = getRule(spec.type as RuleId);
		// Disabled rule: the machine is not advanced, so no evidence is produced.
		if (rule && !rule.enabled) return;
		// Low-confidence signals are treated as "not present" rather than as violations.
		const present = spec.present && spec.confidence >= (rule?.minConfidence ?? 0);
		const trans = spec.machine.update(present, spec.confidence, now);
		if (trans.currentState === "CONFIRMED") {
			const draft = buildEvidenceEvent({
				attemptId,
				type: spec.type,
				startTime: trans.context.firstObservedAt,
				endTime: now,
				confidence: spec.confidence,
				cameraQuality: qualityResult.qualityScore,
				signals: spec.signals,
			});
			const dedup = session.deduplicator.ingest(
				attemptId,
				spec.dedupKey,
				severityForEvent(draft),
				spec.description,
				spec.confidence,
				now,
			);
			if (dedup.isNewEvent) newEvents.push(draft);
		} else if (trans.currentState === "RESOLVED") {
			session.deduplicator.resolve(attemptId, spec.dedupKey, now);
		}
	};

	const sm = session.stateMachines;

	// 0. Camera unusable / no frames: monitoring gap that needs review.
	evaluate({
		machine: sm.cameraUnusable,
		present: !qualityResult.usable,
		confidence: 0.9,
		dedupKey: "CAMERA_DEGRADATION",
		type: "CAMERA_DEGRADATION",
		description: qualityResult.warningMessage || "Camera feed unusable",
		signals: { warning: qualityResult.warningMessage, quality: qualityResult.qualityScore },
	});

	// 1. Attention deviation
	evaluate({
		machine: sm.attentionDeviation,
		present: faceResult.detected && !!faceResult.pose?.isLookingAway,
		confidence: faceResult.pose?.confidence || 0.9,
		dedupKey: "SUSTAINED_HEAD_DEVIATION",
		type: "SUSTAINED_HEAD_DEVIATION",
		description: `Sustained head deviation (${faceResult.pose?.gazeDirection || "away"})`,
		signals: {
			yaw: faceResult.pose?.yaw,
			pitch: faceResult.pose?.pitch,
			gazeDirection: faceResult.pose?.gazeDirection,
		},
		observable: faceObservable,
	});

	// 2. Absent candidate (only when the detector actually ran on a usable frame)
	evaluate({
		machine: sm.faceMissing,
		present: !faceResult.detected,
		confidence: 0.95,
		dedupKey: "ABSENT_CANDIDATE",
		type: "ABSENT_CANDIDATE",
		description: "Candidate absent from camera feed",
		signals: { absentDurationMs: temporal.sustainedNoFaceMs },
		observable: faceObservable,
	});

	// 3. Multiple faces
	evaluate({
		machine: sm.multipleFaces,
		present: faceResult.detected && faceResult.faceCount > 1,
		confidence: 0.92,
		dedupKey: "MULTIPLE_INDIVIDUALS",
		type: "MULTIPLE_INDIVIDUALS",
		description: `Multiple individuals detected (${faceResult.faceCount} faces)`,
		signals: { count: faceResult.faceCount },
		observable: !faceResult.error,
	});

	// 4. Suspected speech (mouth-aspect-ratio) — previously detected but never persisted
	evaluate({
		machine: sm.speech,
		present:
			faceResult.detected && faceResult.faceCount === 1 && !!faceResult.mouth?.possibleSpeech,
		confidence: 0.7,
		dedupKey: "SUSPECTED_SPEECH",
		type: "SUSPECTED_SPEECH",
		description: "Sustained mouth movement / possible speech",
		signals: { mar: faceResult.mouth?.mar, sustainedMs: temporal.sustainedTalkingMs },
		observable: faceObservable,
	});

	// 5. Prolonged eye closure (EAR) — previously detected but never persisted
	evaluate({
		machine: sm.eyeClosure,
		present: faceResult.detected && faceResult.faceCount === 1 && !!faceResult.eyes?.eyesClosed,
		confidence: 0.75,
		dedupKey: "PROLONGED_EYE_CLOSURE",
		type: "PROLONGED_EYE_CLOSURE",
		description: "Prolonged eye closure",
		signals: { ear: faceResult.eyes?.avgEAR, sustainedMs: temporal.sustainedEyesClosedMs },
		observable: faceObservable,
	});

	// 6. Every monitored prohibited object, not only phones
	for (const label of MONITORED_OBJECTS) {
		const obj = objects?.find((o) => o.label === label);
		evaluate({
			machine: sm.objects[label],
			present: Boolean(obj),
			confidence: obj?.confidence || 0.85,
			dedupKey: `PROHIBITED_OBJECT:${label}`,
			type: "PROHIBITED_OBJECT",
			description: `${label} detected (${obj?.relativePosition || "workspace"})`,
			signals: { objectLabel: label, position: obj?.relativePosition, bbox: obj?.bbox },
			observable: state.objectDetectorOk,
		});
	}

	// 7. Liveness / presentation attack
	evaluate({
		machine: sm.liveness,
		present: liveness.status === "suspicious",
		confidence: liveness.confidence,
		dedupKey: "LIVENESS_FAILURE",
		type: "LIVENESS_FAILURE",
		description: liveness.reason,
		signals: { reason: liveness.reason, microMovementScore: liveness.microMovementScore },
		observable: faceObservable,
	});

	// 8. Identity continuity (only advanced on frames where a check actually ran)
	if (state.identityCheck) {
		evaluate({
			machine: sm.identity,
			present: state.identityCheck === "mismatch",
			confidence: 0.85,
			dedupKey: "IDENTITY_MISMATCH",
			type: "IDENTITY_MISMATCH",
			description: "Face does not match enrolled candidate",
			signals: { distance: state.identityDistance, threshold: env.FACE_MATCH_THRESHOLD },
		});
	}

	// 9. Browser Monitoring Agent (tab focus, DevTools, full-screen exit)
	newEvents.push(
		...runBrowserAgent({
			attemptId,
			browser: state.browser,
			browserEvent: state.browserEvent,
			state: session,
			cameraQuality: qualityResult.qualityScore,
			now,
		}),
	);

	recordDetections(
		"browser-telemetry",
		newEvents.filter((e) => BROWSER_EVENT_TYPES.has(e.type)).length,
	);
	recordDetections(
		"face-perception",
		newEvents.filter(
			(e) =>
				e.type !== "PROHIBITED_OBJECT" &&
				!BROWSER_EVENT_TYPES.has(e.type) &&
				e.type !== "CAMERA_DEGRADATION",
		).length,
	);
	recordDetections(
		"object-detection",
		newEvents.filter((e) => e.type === "PROHIBITED_OBJECT").length,
	);
	recordDetections(
		"camera-quality",
		newEvents.filter((e) => e.type === "CAMERA_DEGRADATION").length,
	);
	return { newEvents };
}

// Node 6: Evidence Fusion & Scoring
async function evidenceFusionNode(state: GraphState) {
	const session = proctorSessionRegistry.getSession(state.attemptId);

	session.fusion.recordFrame({
		hadFrame: Boolean(state.frame),
		usable: state.qualityResult.usable,
		faceDetectorFailed: Boolean(state.faceResult.error) && state.faceResult.error !== "NO_FRAME",
		objectDetectorFailed: Boolean(state.frame) && !state.objectDetectorOk,
		identityCheck: state.identityCheck,
	});

	for (const event of state.newEvents) {
		session.fusion.registerEvent(event);
	}

	const metrics = session.fusion.computeMetrics(state.qualityResult.qualityScore);
	return { metrics };
}

// Node 7: Multi-Agent Policy Orchestration (Face, Behaviour, Evidence → Orchestrator)
async function agentOrchestratorNode(state: GraphState) {
	const session = proctorSessionRegistry.getSession(state.attemptId);

	const faceAnalysis = await track("face-agent", () =>
		runFaceAgent(state.faceResult, state.qualityResult, state.temporal),
	);
	const behaviorAnalysis = await track("behavior-agent", () =>
		runBehaviorAgent(faceAnalysis, state.objects || [], state.temporal, state.browserEvent),
	);
	const investigation = await track("evidence-agent", () =>
		compileEvidenceInvestigation(state.attemptId, session.fusion.getRecentEvents()),
	);

	// Terminal / faculty-held states are never overridden by the automated policy.
	if (
		session.status === "TERMINATED" ||
		session.status === "SUBMITTED" ||
		session.status === "UNDER_REVIEW"
	) {
		return {
			action: "none" as const,
			statusMessage: "Session is not active.",
			requiresHumanReview: investigation.requiresHumanReview,
		};
	}

	// Narrowed above (terminal states returned early); capture before the closure.
	const currentStatus = session.status;
	const decision = await track(
		"orchestrator",
		() =>
			orchestrateProctoringPolicy({
				faceAnalysis,
				behaviorAnalysis,
				newEvents: state.newEvents,
				metrics: state.metrics,
				currentStatus,
				warningCount: session.warningCount,
			}),
		{ detections: (d) => (d.action === "none" ? 0 : 1) },
	);

	if (decision.action === "warning") {
		session.warningCount += 1;
	}
	session.status = decision.status;

	return {
		action: decision.action,
		statusMessage: decision.primaryMessage,
		requiresHumanReview: decision.requiresHumanReview || investigation.requiresHumanReview,
	};
}

// Node 8: Persistence and Broadcast
async function persistenceAndNotificationNode(state: GraphState) {
	const { attemptId, newEvents, metrics, action, statusMessage } = state;
	const session = proctorSessionRegistry.getSession(attemptId);
	const io = getIO();
	const now = new Date();

	session.frameCounter += 1;
	session.health = {
		faceDetector: !state.frame ? "no_frame" : state.faceResult.error ? "failed" : "ok",
		objectDetector: !state.frame ? "no_frame" : state.objectDetectorOk ? "ok" : "failed",
		identity: !session.referenceDescriptor
			? "not_enrolled"
			: state.identityCheck
				? state.identityCheck
				: session.health.identity === "not_enrolled"
					? "inconclusive"
					: session.health.identity,
		liveness: state.liveness?.status ?? "uncertain",
		lastFrameAt: state.frame ? now.toISOString() : session.health.lastFrameAt,
	};

	if (newEvents.length > 0) {
		await prisma.$transaction(
			newEvents.flatMap((evt) => [
				prisma.violationAlert.create({
					data: {
						attemptId,
						type: evt.type,
						severity: severityForEvent(evt),
						description: evt.narrativeExplanation,
						riskScore: riskScoreForEvent(evt),
					},
				}),
				prisma.proctoringTimelineEvent.create({
					data: {
						attemptId,
						event: evt.type.replace(/_/g, " "),
						details: `${evt.narrativeExplanation} [status: ${evt.status}, confidence: ${Math.round(evt.confidence * 100)}%${evt.humanReviewRecommended ? ", human review recommended" : ""}]`,
					},
				}),
			]),
		);
	}

	const updatedAttempt = await prisma.assessmentAttempt.update({
		where: { id: attemptId },
		data: {
			integrityScore: metrics.compositeScore,
			proctoringStatus: session.status,
			warningCount: session.warningCount,
			isOnline: true,
			lastHeartbeatAt: now,
			...(state.frame ? { lastFrameAt: now } : {}),
			faceStatus: state.faceResult?.error
				? state.faceResult.error === "NO_FRAME"
					? "No Camera"
					: "Detector Error"
				: !state.qualityResult.usable
					? "Camera Unusable"
					: state.faceResult?.detected
						? state.faceResult.faceCount > 1
							? "Multiple Faces"
							: state.faceResult.pose?.gazeDirection &&
									state.faceResult.pose.gazeDirection !== "center"
								? `Facing ${state.faceResult.pose.gazeDirection}`
								: "Attentive"
						: "Missing",
			proctoringState: proctorSessionRegistry.serialize(session),
		},
		include: { student: { select: { section: true } } },
	});

	const dashboardPayload = {
		attemptId,
		studentId: updatedAttempt.studentId,
		studentName: updatedAttempt.studentName,
		assessmentId: updatedAttempt.assessmentId,
		integrityScore: metrics.compositeScore,
		metrics: {
			compositeScore: metrics.compositeScore,
			identityScore: metrics.identityScore,
			cameraQualityScore: metrics.cameraQualityScore,
			environmentScore: metrics.environmentScore,
			browserScore: metrics.browserScore,
			behaviorScore: metrics.behaviorScore,
			evidenceConfidence: metrics.evidenceConfidence,
			cameraReliability: metrics.cameraReliability,
			identityVerification: metrics.identityVerification,
			decision: metrics.decision,
		},
		agentHealth: session.health,
		faceStatus: updatedAttempt.faceStatus,
		isOnline: true,
		lastFrameAt: updatedAttempt.lastFrameAt,
		lastHeartbeatAt: updatedAttempt.lastHeartbeatAt,
		warningCount: session.warningCount,
		proctoringStatus: session.status,
		requiresHumanReview: state.requiresHumanReview,
		activeViolations: newEvents.map((e) => e.narrativeExplanation),
		correlatedIncidents: metrics.correlatedIncidents,
		timestamp: now.toISOString(),
	};

	emitToAssessmentMonitors(
		updatedAttempt.assessmentId,
		updatedAttempt.student?.section,
		"proctor-telemetry",
		dashboardPayload,
	);

	// Second opinion from the Groq vision model on visual alerts (async, throttled, never blocks the frame).
	const eventTypes = newEvents.map((e) => e.type);
	if (state.frame && shouldReviewFrame(attemptId, eventTypes, true)) {
		void reviewFlaggedFrame({
			attemptId,
			assessmentId: updatedAttempt.assessmentId,
			section: updatedAttempt.student?.section,
			frame: state.frame,
			eventTypes,
		});
	}

	if (action !== "none") {
		io?.to(`student-proctoring-${attemptId}`).emit("proctor-action", {
			action: action === "pause" ? "pause-exam" : "warning",
			status: session.status,
			message: statusMessage,
		});
	}

	return {};
}

// --- BUILD & EXPORT GRAPH ---
const workflow = new StateGraph(ProctorGraphState)
	.addNode("cameraQuality", cameraQualityNode)
	.addNode("facePerception", facePerceptionNode)
	.addNode("objectPerception", objectPerceptionNode)
	.addNode("temporalAggregation", temporalAggregationNode)
	.addNode("eventBuilder", eventBuilderNode)
	.addNode("evidenceFusion", evidenceFusionNode)
	.addNode("agentOrchestrator", agentOrchestratorNode)
	.addNode("persistenceAndNotification", persistenceAndNotificationNode)
	.addEdge("__start__", "cameraQuality")
	.addEdge("cameraQuality", "facePerception")
	.addEdge("facePerception", "objectPerception")
	.addEdge("objectPerception", "temporalAggregation")
	.addEdge("temporalAggregation", "eventBuilder")
	.addEdge("eventBuilder", "evidenceFusion")
	.addEdge("evidenceFusion", "agentOrchestrator")
	.addEdge("agentOrchestrator", "persistenceAndNotification")
	.addEdge("persistenceAndNotification", "__end__");

export const proctorPipeline = workflow.compile();
