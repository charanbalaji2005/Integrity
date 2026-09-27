import type { CameraQualityMetrics } from "../perception/camera-quality";
import type { FacePerceptionResult } from "../perception/face-detector";
import type { DetectedSpatialObject } from "../perception/object-detector";

export interface FrameSnapshot {
	timestamp: number;
	face: FacePerceptionResult;
	objects: DetectedSpatialObject[];
	quality: CameraQualityMetrics;
	browserEvent?: string;
}

export interface TemporalSummary {
	frameCount: number;
	windowDurationMs: number;
	avgYaw: number;
	avgPitch: number;
	avgRoll: number;
	avgQualityScore: number;
	sustainedLookingAwayMs: number;
	sustainedNoFaceMs: number;
	sustainedMultipleFacesMs: number;
	sustainedEyesClosedMs: number;
	sustainedTalkingMs: number;
	recentBlinkCount: number;
	activeObjects: Map<string, { persistenceMs: number; peakConfidence: number }>;
}

export class TemporalSignalBuffer {
	private readonly capacity: number;
	private buffer: FrameSnapshot[] = [];

	constructor(capacity = 20) {
		this.capacity = capacity;
	}

	public push(snapshot: FrameSnapshot): void {
		this.buffer.push(snapshot);
		if (this.buffer.length > this.capacity) {
			this.buffer.shift();
		}
	}

	public getRecentFaces(): FacePerceptionResult[] {
		return this.buffer.map((b) => b.face);
	}

	public getSnapshots(): FrameSnapshot[] {
		return [...this.buffer];
	}

	public clear(): void {
		this.buffer = [];
	}

	public analyzeWindow(): TemporalSummary {
		if (this.buffer.length === 0) {
			return {
				frameCount: 0,
				windowDurationMs: 0,
				avgYaw: 0,
				avgPitch: 0,
				avgRoll: 0,
				avgQualityScore: 100,
				sustainedLookingAwayMs: 0,
				sustainedNoFaceMs: 0,
				sustainedMultipleFacesMs: 0,
				sustainedEyesClosedMs: 0,
				sustainedTalkingMs: 0,
				recentBlinkCount: 0,
				activeObjects: new Map(),
			};
		}

		const count = this.buffer.length;
		const oldest = this.buffer[0].timestamp;
		const newest = this.buffer[count - 1].timestamp;
		const windowDurationMs = Math.max(0, newest - oldest);

		let yawSum = 0;
		let pitchSum = 0;
		let rollSum = 0;
		let qualitySum = 0;
		let blinkCount = 0;

		let lookingAwayStart: number | null = null;
		let noFaceStart: number | null = null;
		let multipleFacesStart: number | null = null;
		let eyesClosedStart: number | null = null;
		let talkingStart: number | null = null;

		const objectTrackMap = new Map<
			string,
			{ firstSeen: number; lastSeen: number; peakConf: number }
		>();

		for (const frame of this.buffer) {
			qualitySum += frame.quality.qualityScore;

			if (frame.face.detected && frame.face.pose) {
				yawSum += frame.face.pose.yaw;
				pitchSum += frame.face.pose.pitch;
				rollSum += frame.face.pose.roll;

				if (frame.face.pose.isLookingAway) {
					if (lookingAwayStart === null) lookingAwayStart = frame.timestamp;
				} else {
					lookingAwayStart = null;
				}

				if (frame.face.eyes?.isBlinking) {
					blinkCount++;
				}

				if (frame.face.eyes?.eyesClosed) {
					if (eyesClosedStart === null) eyesClosedStart = frame.timestamp;
				} else {
					eyesClosedStart = null;
				}

				if (frame.face.mouth?.possibleSpeech) {
					if (talkingStart === null) talkingStart = frame.timestamp;
				} else {
					talkingStart = null;
				}
			} else {
				lookingAwayStart = null;
				eyesClosedStart = null;
				talkingStart = null;
			}

			// Face presence tracking
			if (!frame.face.detected) {
				if (noFaceStart === null) noFaceStart = frame.timestamp;
			} else {
				noFaceStart = null;
			}

			if (frame.face.detected && frame.face.faceCount > 1) {
				if (multipleFacesStart === null) multipleFacesStart = frame.timestamp;
			} else {
				multipleFacesStart = null;
			}

			// Spatial Object tracking
			for (const obj of frame.objects) {
				const existing = objectTrackMap.get(obj.label);
				if (!existing) {
					objectTrackMap.set(obj.label, {
						firstSeen: frame.timestamp,
						lastSeen: frame.timestamp,
						peakConf: obj.confidence,
					});
				} else {
					existing.lastSeen = frame.timestamp;
					existing.peakConf = Math.max(existing.peakConf, obj.confidence);
				}
			}
		}

		const now = newest;
		const sustainedLookingAwayMs = lookingAwayStart ? now - lookingAwayStart : 0;
		const sustainedNoFaceMs = noFaceStart ? now - noFaceStart : 0;
		const sustainedMultipleFacesMs = multipleFacesStart ? now - multipleFacesStart : 0;
		const sustainedEyesClosedMs = eyesClosedStart ? now - eyesClosedStart : 0;
		const sustainedTalkingMs = talkingStart ? now - talkingStart : 0;

		const activeObjects = new Map<string, { persistenceMs: number; peakConfidence: number }>();
		for (const [label, data] of objectTrackMap.entries()) {
			activeObjects.set(label, {
				persistenceMs: data.lastSeen - data.firstSeen,
				peakConfidence: data.peakConf,
			});
		}

		return {
			frameCount: count,
			windowDurationMs,
			avgYaw: Number((yawSum / count).toFixed(1)),
			avgPitch: Number((pitchSum / count).toFixed(1)),
			avgRoll: Number((rollSum / count).toFixed(1)),
			avgQualityScore: Math.round(qualitySum / count),
			sustainedLookingAwayMs,
			sustainedNoFaceMs,
			sustainedMultipleFacesMs,
			sustainedEyesClosedMs,
			sustainedTalkingMs,
			recentBlinkCount: blinkCount,
			activeObjects,
		};
	}
}
