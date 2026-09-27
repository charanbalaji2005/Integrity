export interface DeduplicatedProctorEvent {
	id: string;
	attemptId: string;
	type: string;
	severity: "low" | "medium" | "high" | "critical";
	description: string;
	startTime: number;
	endTime: number;
	durationMs: number;
	peakConfidence: number;
	occurrences: number;
	isOngoing: boolean;
}

export class ProctorEventDeduplicator {
	private activeEvents = new Map<string, DeduplicatedProctorEvent>();
	private readonly cooldownMs: number;

	constructor(cooldownMs = 6000) {
		this.cooldownMs = cooldownMs;
	}

	/**
	 * Ingests a confirmed condition. If an ongoing event exists or is within cooldown,
	 * updates it. Otherwise, initiates a new deduplicated event.
	 */
	public ingest(
		attemptId: string,
		type: string,
		severity: DeduplicatedProctorEvent["severity"],
		description: string,
		confidence: number,
		timestamp = Date.now(),
	): { isNewEvent: boolean; event: DeduplicatedProctorEvent } {
		const key = `${attemptId}:${type}`;
		const existing = this.activeEvents.get(key);

		if (existing) {
			const timeSinceLast = timestamp - existing.endTime;

			if (existing.isOngoing || timeSinceLast <= this.cooldownMs) {
				// Extend ongoing event
				existing.endTime = timestamp;
				existing.durationMs = existing.endTime - existing.startTime;
				existing.peakConfidence = Math.max(existing.peakConfidence, confidence);
				existing.occurrences += 1;
				existing.isOngoing = true;

				return {
					isNewEvent: false,
					event: { ...existing },
				};
			}
		}

		// Create fresh deduplicated event
		const newEvent: DeduplicatedProctorEvent = {
			id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
			attemptId,
			type,
			severity,
			description,
			startTime: timestamp,
			endTime: timestamp,
			durationMs: 0,
			peakConfidence: confidence,
			occurrences: 1,
			isOngoing: true,
		};

		this.activeEvents.set(key, newEvent);
		return {
			isNewEvent: true,
			event: { ...newEvent },
		};
	}

	/**
	 * Marks an active event as resolved when the condition is no longer present.
	 */
	public resolve(
		attemptId: string,
		type: string,
		timestamp = Date.now(),
	): DeduplicatedProctorEvent | null {
		const key = `${attemptId}:${type}`;
		const existing = this.activeEvents.get(key);

		if (existing && existing.isOngoing) {
			existing.endTime = timestamp;
			existing.durationMs = Math.max(1000, existing.endTime - existing.startTime);
			existing.isOngoing = false;
			return { ...existing };
		}

		return null;
	}

	public getActiveEvents(attemptId: string): DeduplicatedProctorEvent[] {
		const results: DeduplicatedProctorEvent[] = [];
		for (const [key, evt] of this.activeEvents.entries()) {
			if (key.startsWith(`${attemptId}:`) && evt.isOngoing) {
				results.push({ ...evt });
			}
		}
		return results;
	}

	public clear(attemptId?: string): void {
		if (attemptId) {
			for (const key of this.activeEvents.keys()) {
				if (key.startsWith(`${attemptId}:`)) {
					this.activeEvents.delete(key);
				}
			}
		} else {
			this.activeEvents.clear();
		}
	}
}
