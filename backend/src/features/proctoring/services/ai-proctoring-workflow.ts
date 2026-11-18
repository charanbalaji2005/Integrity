/**
 * Compatibility bridge for AI Proctoring Workflow.
 * Re-exports the advanced LangGraph multi-agent proctoring pipeline.
 */
export {
	type AdvancedProctorSession as ProctoringSession,
	proctorPipeline,
	proctorSessionRegistry as sessionManager,
} from "../workflows/proctoring-graph";
