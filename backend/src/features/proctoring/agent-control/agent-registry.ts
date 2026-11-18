import type { AgentId, RuleId } from "./agent-config";
import { getAgentConfig, RULE_META } from "./agent-config";

/**
 * Central registry of the proctoring agents that ACTUALLY exist in
 * features/proctoring. Nothing here is aspirational: each entry points at
 * the module that runs inside the frame pipeline.
 */
export interface AgentDefinition {
	id: AgentId;
	name: string;
	description: string;
	responsibility: string;
	model: string;
	source: string;
	stage: "perception" | "reasoning" | "decision";
	implementation: "operational" | "partial";
	notes?: string;
}

export const AGENTS: AgentDefinition[] = [
	{
		id: "camera-quality",
		name: "Camera Quality Agent",
		description: "Scores brightness, blur, occlusion and face visibility of every frame.",
		responsibility: "Marks unusable frames as monitoring gaps so they never count as misconduct.",
		model: "Heuristic image analysis (jpeg-js)",
		source: "perception/camera-quality.ts",
		stage: "perception",
		implementation: "operational",
	},
	{
		id: "face-perception",
		name: "Face Perception Agent",
		description:
			"Face detection, 68-point landmarks, head pose, eye/mouth ratios and periodic identity re-verification.",
		responsibility: "Presence, multiple faces, attention, speech, eye closure, liveness, identity.",
		model: "face-api.js (TinyFaceDetector + Landmark68 + FaceRecognition)",
		source: "perception/face-detector.ts",
		stage: "perception",
		implementation: "operational",
	},
	{
		id: "object-detection",
		name: "Object Detection Agent",
		description: "Detects phones, secondary screens, books and earphones with spatial position.",
		responsibility: "Prohibited-object evidence.",
		model: "TensorFlow.js COCO-SSD",
		source: "perception/object-detector.ts",
		stage: "perception",
		implementation: "operational",
	},
	{
		id: "browser-telemetry",
		name: "Browser Monitoring Agent",
		description:
			"Converts client tab-switch / visibility / DevTools / full-screen telemetry into discrete events.",
		responsibility:
			"Tab switching, window minimise, window focus loss, DevTools, full-screen exit, clipboard/right-click.",
		model: "Rule-based (client telemetry)",
		source: "agents/browser-agent.ts",
		stage: "perception",
		implementation: "operational",
	},
	{
		id: "face-agent",
		name: "Face Analysis Agent",
		description: "Interprets face perception in context of duration and camera quality.",
		responsibility: "Summarises candidate attention state for the orchestrator.",
		model: "Rule-based reasoning",
		source: "agents/face-agent.ts",
		stage: "reasoning",
		implementation: "operational",
	},
	{
		id: "behavior-agent",
		name: "Behavior Agent",
		description: "Separates natural habits (scratch-pad work) from deceptive behaviour.",
		responsibility: "Behaviour pattern + risk level.",
		model: "Rule-based reasoning",
		source: "agents/behavior-agent.ts",
		stage: "reasoning",
		implementation: "operational",
	},
	{
		id: "evidence-agent",
		name: "Evidence Agent",
		description: "Compiles chronological events into an explainable investigation summary.",
		responsibility: "Evidence timeline + human-review recommendation.",
		model: "Rule-based synthesis",
		source: "agents/evidence-agent.ts",
		stage: "reasoning",
		implementation: "operational",
	},
	{
		id: "orchestrator",
		name: "Proctor Orchestrator",
		description:
			"Combines specialist outputs into warn / pause decisions. Never penalises on agent failure.",
		responsibility: "Session policy decisions and auto-pause.",
		model: "Policy engine",
		source: "agents/proctor-orchestrator.ts",
		stage: "decision",
		implementation: "operational",
	},
];

/** An agent is DISABLED when every rule it owns is switched off (it still runs, but emits nothing). */
export function isAgentEffectivelyDisabled(id: AgentId): boolean {
	const owned = RULE_META.filter((r) => r.agent === id).map((r) => r.id as RuleId);
	if (!owned.length) return false;
	const { rules } = getAgentConfig();
	return owned.every((rid) => !rules[rid].enabled);
}
