import { getRule } from "../agent-control/agent-config";
import { buildEvidenceEvent, type EvidenceEvent } from "../evidence/evidence-builder";

/** Client-reported browser telemetry for one frame (see normalizeBrowserTelemetry). */
export interface BrowserAgentInput {
	tabSwitches: number;
	visibilityHidden: boolean;
	isDevToolsOpen: boolean;
	fullscreenExited: boolean;
	/** Cumulative fullscreen exits reported by the client (optional, informational). */
	fullscreenExits?: number;
	/** Clipboard / context-menu attempts since the last delivered frame. */
	clipboardEvents?: number;
	/** Window focus losses (another app/window) since the last delivered frame. */
	windowBlurs?: number;
	discreteEvent?: "tab-switch" | "window-minimize";
}

/** The per-session counters this agent owns. Mutated in place. */
export interface BrowserAgentState {
	tabSwitchCount: number;
	lastReportedTabSwitches: number;
	devToolsOpen: boolean;
}

/**
 * Browser Monitoring Agent.
 *
 * Converts the client's cumulative browser counters into discrete, de-duplicated
 * evidence events: tab switch / minimise, DevTools opened (edge-triggered),
 * full-screen exit, clipboard/right-click attempts and window focus loss. It owns its slice of the session state so the graph only has
 * to route telemetry to it.
 */
export function runBrowserAgent(params: {
	attemptId: string;
	browser: BrowserAgentInput | null;
	/** Discrete focus event derived by the temporal node for this frame, if any. */
	browserEvent?: string;
	state: BrowserAgentState;
	cameraQuality: number;
	now: number;
}): EvidenceEvent[] {
	const { attemptId, browser, browserEvent, state, cameraQuality, now } = params;
	const events: EvidenceEvent[] = [];

	// 1. Focus loss (tab switch / minimise)
	if (browserEvent && getRule("BROWSER_UNFOCUSED").enabled) {
		const delta = browser?.discreteEvent
			? 1
			: Math.max(1, (browser?.tabSwitches ?? 0) - state.lastReportedTabSwitches);
		state.tabSwitchCount += delta;
		if (browser && !browser.discreteEvent) {
			state.lastReportedTabSwitches = browser.tabSwitches;
		}
		events.push(
			buildEvidenceEvent({
				attemptId,
				type: "BROWSER_UNFOCUSED",
				startTime: now,
				endTime: now,
				confidence: 1.0,
				cameraQuality,
				signals: { event: browserEvent, count: state.tabSwitchCount, delta },
			}),
		);
	}

	if (!browser) return events;

	// 2. DevTools (edge-triggered: only the closed → open transition is an event)
	if (browser.isDevToolsOpen && !state.devToolsOpen && getRule("DEVTOOLS_OPENED").enabled) {
		events.push(
			buildEvidenceEvent({
				attemptId,
				type: "DEVTOOLS_OPENED",
				startTime: now,
				endTime: now,
				confidence: 0.8,
				cameraQuality,
				signals: { event: "devtools-open" },
			}),
		);
	}
	state.devToolsOpen = browser.isDevToolsOpen;

	// 3. Full-screen exit (the client latches the flag until a frame delivers it)
	if (browser.fullscreenExited && getRule("FULLSCREEN_EXITED").enabled) {
		events.push(
			buildEvidenceEvent({
				attemptId,
				type: "FULLSCREEN_EXITED",
				startTime: now,
				endTime: now,
				confidence: 1.0,
				cameraQuality,
				signals: { event: "fullscreen-exit", count: browser.fullscreenExits ?? null },
			}),
		);
	}

	// 4. Clipboard / right-click attempts (blocked client-side, recorded here)
	if ((browser.clipboardEvents ?? 0) > 0 && getRule("CLIPBOARD_ATTEMPT").enabled) {
		events.push(
			buildEvidenceEvent({
				attemptId,
				type: "CLIPBOARD_ATTEMPT",
				startTime: now,
				endTime: now,
				confidence: 1.0,
				cameraQuality,
				signals: { event: "clipboard", count: browser.clipboardEvents },
			}),
		);
	}

	// 5. Window focus lost to another application or window
	if ((browser.windowBlurs ?? 0) > 0 && getRule("WINDOW_BLUR").enabled) {
		events.push(
			buildEvidenceEvent({
				attemptId,
				type: "WINDOW_BLUR",
				startTime: now,
				endTime: now,
				confidence: 0.9,
				cameraQuality,
				signals: { event: "window-blur", count: browser.windowBlurs },
			}),
		);
	}

	return events;
}
