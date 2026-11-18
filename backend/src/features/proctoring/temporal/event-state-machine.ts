export type EventState = "IDLE" | "SUSPECTED" | "CONFIRMED" | "RESOLVED";

export interface EventStateContext {
	eventType: string;
	state: EventState;
	firstObservedAt: number;
	lastObservedAt: number;
	confirmedAt?: number;
	resolvedAt?: number;
	persistenceMs: number;
	peakConfidence: number;
	details?: string;
}

export interface StateTransitionResult {
	previousState: EventState;
	currentState: EventState;
	transitioned: boolean;
	context: EventStateContext;
}

/**
 * Event State Machine: IDLE -> SUSPECTED -> CONFIRMED -> RESOLVED
 * Enforces temporal stability before promoting raw signals to confirmed events.
 */
export class ProctorEventStateMachine {
	private readonly confirmationThresholdMs: number;
	private context: EventStateContext;

	constructor(eventType: string, confirmationThresholdMs = 3000) {
		this.confirmationThresholdMs = confirmationThresholdMs;
		this.context = {
			eventType,
			state: "IDLE",
			firstObservedAt: 0,
			lastObservedAt: 0,
			persistenceMs: 0,
			peakConfidence: 0,
		};
	}

	public update(
		isConditionPresent: boolean,
		confidence: number,
		timestamp = Date.now(),
		details?: string,
	): StateTransitionResult {
		const prev = this.context.state;
		let transitioned = false;

		if (isConditionPresent) {
			this.context.lastObservedAt = timestamp;
			this.context.peakConfidence = Math.max(this.context.peakConfidence, confidence);
			if (details) this.context.details = details;

			if (this.context.state === "IDLE" || this.context.state === "RESOLVED") {
				// Transition to SUSPECTED
				this.context.state = "SUSPECTED";
				this.context.firstObservedAt = timestamp;
				this.context.persistenceMs = 0;
				transitioned = true;
			} else if (this.context.state === "SUSPECTED") {
				this.context.persistenceMs = timestamp - this.context.firstObservedAt;
				if (this.context.persistenceMs >= this.confirmationThresholdMs) {
					// Transition to CONFIRMED
					this.context.state = "CONFIRMED";
					this.context.confirmedAt = timestamp;
					transitioned = true;
				}
			} else if (this.context.state === "CONFIRMED") {
				this.context.persistenceMs = timestamp - this.context.firstObservedAt;
			}
		} else {
			// Condition is not present in current sample
			if (this.context.state === "SUSPECTED") {
				// Ephemeral noise/glance: return to IDLE without violation
				this.context.state = "IDLE";
				this.context.firstObservedAt = 0;
				this.context.persistenceMs = 0;
				transitioned = true;
			} else if (this.context.state === "CONFIRMED") {
				// Condition resolved
				this.context.state = "RESOLVED";
				this.context.resolvedAt = timestamp;
				transitioned = true;
			}
		}

		return {
			previousState: prev,
			currentState: this.context.state,
			transitioned,
			context: { ...this.context },
		};
	}

	public getContext(): EventStateContext {
		return { ...this.context };
	}

	public reset(): void {
		this.context = {
			eventType: this.context.eventType,
			state: "IDLE",
			firstObservedAt: 0,
			lastObservedAt: 0,
			persistenceMs: 0,
			peakConfidence: 0,
		};
	}
}
