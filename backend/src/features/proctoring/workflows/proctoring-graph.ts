import { Annotation, StateGraph } from "@langchain/langgraph";
import { prisma } from "../../../database";
import { getIO } from "../../../providers/socket";
import { runBehaviorAgent } from "../agents/behavior-agent";
import { runFaceAgent } from "../agents/face-agent";
import { orchestrateProctoringPolicy } from "../agents/proctor-orchestrator";
import { buildEvidenceEvent, type EvidenceEvent } from "../evidence/evidence-builder";
import {
	EvidenceFusionEngine,
	type MultiDimensionalIntegrityMetrics,
} from "../evidence/evidence-fusion";
import { type CameraQualityMetrics, evaluateCameraQuality } from "../perception/camera-quality";
import { detectFacePerception, type FacePerceptionResult } from "../perception/face-detector";
import { type DetectedSpatialObject, detectSpatialObjects } from "../perception/object-detector";
import type { CalibrationBaseline } from "../perception/pose-estimator";
import { ProctorEventDeduplicator } from "../temporal/event-deduplicator";
import { ProctorEventStateMachine } from "../temporal/event-state-machine";
import { TemporalSignalBuffer, type TemporalSummary } from "../temporal/signal-buffer";

// --- ADVANCED PROCTORING SESSION CONTEXT ---
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
		phone: ProctorEventStateMachine;
	};
	baseline?: CalibrationBaseline | null;
	status: "NORMAL" | "WARNING" | "PAUSED" | "UNDER_REVIEW" | "TERMINATED" | "SUBMITTED";
	warningCount: number;
	tabSwitchCount: number;
}

class AdvancedSessionRegistry {
	private sessions = new Map<string, AdvancedProctorSession>();

	public getSession(attemptId: string): AdvancedProctorSession {
		if (!this.sessions.has(attemptId)) {
			this.sessions.set(attemptId, {
				attemptId,
				buffer: new TemporalSignalBuffer(20),
				deduplicator: new ProctorEventDeduplicator(6000),
				fusion: new EvidenceFusionEngine(attemptId),
				stateMachines: {
					attentionDeviation: new ProctorEventStateMachine("SUSTAINED_HEAD_DEVIATION", 3500),
					faceMissing: new ProctorEventStateMachine("ABSENT_CANDIDATE", 3500),
					multipleFaces: new ProctorEventStateMachine("MULTIPLE_INDIVIDUALS", 2500),
					speech: new ProctorEventStateMachine("SUSPECTED_SPEECH", 3500),
					phone: new ProctorEventStateMachine("PROHIBITED_OBJECT", 2000),
				},
				status: "NORMAL",
				warningCount: 0,
				tabSwitchCount: 0,
			});
		}
		return this.sessions.get(attemptId)!;
	}

	public setCalibration(attemptId: string, baseline: CalibrationBaseline): void {
		const session = this.getSession(attemptId);
		session.baseline = baseline;
	}

	public removeSession(attemptId: string): void {
		this.sessions.delete(attemptId);
	}
}

export const proctorSessionRegistry = new AdvancedSessionRegistry();

// --- LANGGRAPH STATE ANNOTATION ---
const ProctorGraphState = Annotation.Root({
	attemptId: Annotation<string>(),
	frame: Annotation<string | undefined>(),
	browserEvent: Annotation<string | undefined>(),
	networkDetails: Annotation<any | undefined>(),
	qualityResult: Annotation<CameraQualityMetrics>(),
	faceResult: Annotation<FacePerceptionResult>(),
	objects: Annotation<DetectedSpatialObject[]>(),
	temporal: Annotation<TemporalSummary>(),
	newEvents: Annotation<EvidenceEvent[]>(),
	metrics: Annotation<MultiDimensionalIntegrityMetrics>(),
	action: Annotation<"none" | "warning" | "pause">(),
	statusMessage: Annotation<string>(),
});

// Node 1: Camera Quality Analysis
async function cameraQualityNode(state: typeof ProctorGraphState.State) {
	if (!state.frame) {
		return {
			qualityResult: {
				brightness: 0.5,
				blur: 0.1,
				faceVisibility: 0,
				occlusion: 0,
				lightingState: "optimal" as const,
				usable: true,
				qualityScore: 80,
			},
		};
	}
	const quality = evaluateCameraQuality(state.frame);
	return { qualityResult: quality };
}

// Node 2: Face Perception
async function facePerceptionNode(state: typeof ProctorGraphState.State) {
	if (!state.frame) {
		return {
			faceResult: { detected: false, faceCount: 0, confidence: 0 },
		};
	}
	const session = proctorSessionRegistry.getSession(state.attemptId);
	const face = await detectFacePerception(state.frame, session.baseline);
	return { faceResult: face };
}

// Node 3: Object Detection with Spatial Reasoning
async function objectPerceptionNode(state: typeof ProctorGraphState.State) {
	if (!state.frame) {
		return { objects: [] };
	}
	const objects = await detectSpatialObjects(state.frame);
	return { objects };
}

// Node 4: Temporal Signal Buffering
async function temporalAggregationNode(state: typeof ProctorGraphState.State) {
	const session = proctorSessionRegistry.getSession(state.attemptId);

	session.buffer.push({
		timestamp: Date.now(),
		face: state.faceResult,
		objects: state.objects || [],
		quality: state.qualityResult,
		browserEvent: state.browserEvent,
	});

	const temporal = session.buffer.analyzeWindow();
	return { temporal };
}

// Node 5: Event State Machine & Deduplication
async function eventBuilderNode(state: typeof ProctorGraphState.State) {
	const session = proctorSessionRegistry.getSession(state.attemptId);
	const { temporal, faceResult, objects, qualityResult, browserEvent, attemptId } = state;
	const newEvents: EvidenceEvent[] = [];
	const now = Date.now();

	// 1. Attention deviation
	const isDeviated = faceResult.detected && !!faceResult.pose?.isLookingAway;
	const devTrans = session.stateMachines.attentionDeviation.update(
		isDeviated,
		faceResult.pose?.confidence || 0.9,
		now,
		faceResult.pose?.gazeDirection,
	);
	if (devTrans.currentState === "CONFIRMED") {
		const dedup = session.deduplicator.ingest(
			attemptId,
			"SUSTAINED_HEAD_DEVIATION",
			"low",
			`Sustained head deviation (${faceResult.pose?.gazeDirection || "away"})`,
			faceResult.pose?.confidence || 0.9,
			now,
		);
		if (dedup.isNewEvent) {
			newEvents.push(
				buildEvidenceEvent({
					attemptId,
					type: "SUSTAINED_HEAD_DEVIATION",
					startTime: devTrans.context.firstObservedAt,
					endTime: now,
					confidence: faceResult.pose?.confidence || 0.9,
					cameraQuality: qualityResult.qualityScore,
					signals: {
						yaw: faceResult.pose?.yaw,
						pitch: faceResult.pose?.pitch,
						gazeDirection: faceResult.pose?.gazeDirection,
					},
				}),
			);
		}
	} else if (devTrans.currentState === "RESOLVED") {
		session.deduplicator.resolve(attemptId, "SUSTAINED_HEAD_DEVIATION", now);
	}

	// 2. Absent candidate
	const isMissing = !faceResult.detected;
	const missTrans = session.stateMachines.faceMissing.update(isMissing, 0.95, now);
	if (missTrans.currentState === "CONFIRMED") {
		const dedup = session.deduplicator.ingest(
			attemptId,
			"ABSENT_CANDIDATE",
			temporal.sustainedNoFaceMs >= 6000 ? "high" : "medium",
			"Candidate absent from camera feed",
			0.95,
			now,
		);
		if (dedup.isNewEvent) {
			newEvents.push(
				buildEvidenceEvent({
					attemptId,
					type: "ABSENT_CANDIDATE",
					startTime: missTrans.context.firstObservedAt,
					endTime: now,
					confidence: 0.95,
					cameraQuality: qualityResult.qualityScore,
					signals: { absentDurationMs: temporal.sustainedNoFaceMs },
				}),
			);
		}
	} else if (missTrans.currentState === "RESOLVED") {
		session.deduplicator.resolve(attemptId, "ABSENT_CANDIDATE", now);
	}

	// 3. Multiple faces
	const isMult = faceResult.detected && faceResult.faceCount > 1;
	const multTrans = session.stateMachines.multipleFaces.update(
		isMult,
		0.92,
		now,
		`Count: ${faceResult.faceCount}`,
	);
	if (multTrans.currentState === "CONFIRMED") {
		const dedup = session.deduplicator.ingest(
			attemptId,
			"MULTIPLE_INDIVIDUALS",
			"high",
			`Multiple individuals detected (${faceResult.faceCount} faces)`,
			0.92,
			now,
		);
		if (dedup.isNewEvent) {
			newEvents.push(
				buildEvidenceEvent({
					attemptId,
					type: "MULTIPLE_INDIVIDUALS",
					startTime: multTrans.context.firstObservedAt,
					endTime: now,
					confidence: 0.92,
					cameraQuality: qualityResult.qualityScore,
					signals: { count: faceResult.faceCount },
				}),
			);
		}
	} else if (multTrans.currentState === "RESOLVED") {
		session.deduplicator.resolve(attemptId, "MULTIPLE_INDIVIDUALS", now);
	}

	// 4. Prohibited object (Mobile Phone)
	const phoneObj = objects?.find((o) => o.label === "Mobile Phone");
	const phoneTrans = session.stateMachines.phone.update(
		Boolean(phoneObj),
		phoneObj?.confidence || 0.85,
		now,
		phoneObj?.relativePosition,
	);
	if (phoneTrans.currentState === "CONFIRMED") {
		const dedup = session.deduplicator.ingest(
			attemptId,
			"PROHIBITED_OBJECT",
			"high",
			`Mobile phone device detected (${phoneObj?.relativePosition || "workspace"})`,
			phoneObj?.confidence || 0.88,
			now,
		);
		if (dedup.isNewEvent) {
			newEvents.push(
				buildEvidenceEvent({
					attemptId,
					type: "PROHIBITED_OBJECT",
					startTime: phoneTrans.context.firstObservedAt,
					endTime: now,
					confidence: phoneObj?.confidence || 0.88,
					cameraQuality: qualityResult.qualityScore,
					signals: {
						objectLabel: "Mobile Phone",
						position: phoneObj?.relativePosition,
						bbox: phoneObj?.bbox,
					},
				}),
			);
		}
	} else if (phoneTrans.currentState === "RESOLVED") {
		session.deduplicator.resolve(attemptId, "PROHIBITED_OBJECT", now);
	}

	// 5. Browser Telemetry
	if (browserEvent === "tab-switch" || browserEvent === "window-minimize") {
		session.tabSwitchCount += 1;
		newEvents.push(
			buildEvidenceEvent({
				attemptId,
				type: "BROWSER_UNFOCUSED",
				startTime: now,
				endTime: now,
				confidence: 1.0,
				cameraQuality: qualityResult.qualityScore,
				signals: { event: browserEvent, count: session.tabSwitchCount },
			}),
		);
	}

	return { newEvents };
}

// Node 6: Evidence Fusion & Scoring
async function evidenceFusionNode(state: typeof ProctorGraphState.State) {
	const session = proctorSessionRegistry.getSession(state.attemptId);

	for (const event of state.newEvents) {
		session.fusion.registerEvent(event);
	}

	const metrics = session.fusion.computeMetrics(state.qualityResult.qualityScore);
	return { metrics };
}

// Node 7: Multi-Agent Policy Orchestration
async function agentOrchestratorNode(state: typeof ProctorGraphState.State) {
	const session = proctorSessionRegistry.getSession(state.attemptId);

	const faceAnalysis = runFaceAgent(state.faceResult, state.qualityResult, state.temporal);
	const behaviorAnalysis = runBehaviorAgent(
		faceAnalysis,
		state.objects || [],
		state.temporal,
		state.browserEvent,
	);

	const decision = orchestrateProctoringPolicy({
		faceAnalysis,
		behaviorAnalysis,
		newEvents: state.newEvents,
		metrics: state.metrics,
		currentStatus: session.status,
		warningCount: session.warningCount,
	});

	if (decision.action === "warning") {
		session.warningCount += 1;
	}
	session.status = decision.status;

	return {
		action: decision.action,
		statusMessage: decision.primaryMessage,
	};
}

// Node 8: Persistence and Broadcast
async function persistenceAndNotificationNode(state: typeof ProctorGraphState.State) {
	const { attemptId, newEvents, metrics, action, statusMessage } = state;
	const session = proctorSessionRegistry.getSession(attemptId);
	const io = getIO();

	const attempt = await prisma.assessmentAttempt.findUnique({
		where: { id: attemptId },
	});
	if (!attempt) return {};

	// 1. Persist new evidence events
	if (newEvents && newEvents.length > 0) {
		for (const evt of newEvents) {
			await prisma.violationAlert.create({
				data: {
					attemptId,
					type: evt.type,
					severity:
						evt.type === "PROHIBITED_OBJECT" || evt.type === "MULTIPLE_INDIVIDUALS"
							? "high"
							: "medium",
					description: evt.narrativeExplanation,
					riskScore:
						evt.type === "PROHIBITED_OBJECT" ? 25 : evt.type === "MULTIPLE_INDIVIDUALS" ? 20 : 5,
				},
			});

			await prisma.proctoringTimelineEvent.create({
				data: {
					attemptId,
					event: evt.type.replace(/_/g, " "),
					details: evt.narrativeExplanation,
				},
			});
		}
	}

	// 2. Update Database Record with Multi-Dimensional state
	const updatedAttempt = await prisma.assessmentAttempt.update({
		where: { id: attemptId },
		data: {
			integrityScore: metrics.compositeScore,
			proctoringStatus: session.status,
			warningCount: session.warningCount,
			faceStatus: state.faceResult?.detected
				? state.faceResult.pose?.gazeDirection
					? `Facing ${state.faceResult.pose.gazeDirection}`
					: "Attentive"
				: "Missing",
		},
	});

	// 3. Socket Broadcast to Faculty & Student
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
		},
		warningCount: session.warningCount,
		proctoringStatus: session.status,
		activeViolations: newEvents.map((e) => e.narrativeExplanation),
		correlatedIncidents: metrics.correlatedIncidents,
		timestamp: new Date().toISOString(),
	};

	io?.to(`assessment-proctoring-${updatedAttempt.assessmentId}`).emit(
		"proctor-telemetry",
		dashboardPayload,
	);
	io?.to(`student-proctoring-${attemptId}`).emit("proctor-action", {
		action: action === "pause" ? "pause-exam" : action === "warning" ? "warning" : "none",
		status: session.status,
		message: statusMessage,
	});

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
