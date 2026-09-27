import type * as tf from "@tensorflow/tfjs-core";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import { base64ToTensor } from "../services/proctoring-service";

export interface DetectedSpatialObject {
	label: "Mobile Phone" | "Book" | "Secondary Screen" | "Audio Earphones" | "Other";
	rawClass: string;
	confidence: number;
	bbox: {
		x: number;
		y: number;
		width: number;
		height: number;
	};
	relativePosition:
		| "top-left"
		| "top-right"
		| "lower-left"
		| "lower-right"
		| "center"
		| "left"
		| "right";
}

let cocoModel: cocoSsd.ObjectDetection | null = null;
let isLoading = false;

export async function initCocoSsd(): Promise<void> {
	if (cocoModel) return;
	if (isLoading) {
		while (isLoading) {
			await new Promise((r) => setTimeout(r, 100));
		}
		return;
	}
	isLoading = true;
	try {
		console.log("[COCO-SSD] Initializing spatial object detector...");
		cocoModel = await cocoSsd.load({ base: "mobilenet_v2" });
		console.log("[COCO-SSD] Spatial object detector initialized successfully.");
	} catch (err) {
		console.error("[COCO-SSD] Failed to load object detection model:", err);
		throw err;
	} finally {
		isLoading = false;
	}
}

function calculateRelativePosition(
	x: number,
	y: number,
	width: number,
	height: number,
	frameWidth = 640,
	frameHeight = 480,
): DetectedSpatialObject["relativePosition"] {
	const centerX = x + width / 2;
	const centerY = y + height / 2;

	const isLeft = centerX < frameWidth * 0.4;
	const isRight = centerX > frameWidth * 0.6;
	const isTop = centerY < frameHeight * 0.4;
	const isBottom = centerY > frameHeight * 0.6;

	if (isTop && isLeft) return "top-left";
	if (isTop && isRight) return "top-right";
	if (isBottom && isLeft) return "lower-left";
	if (isBottom && isRight) return "lower-right";
	if (isLeft) return "left";
	if (isRight) return "right";
	return "center";
}

/**
 * Detects prohibited objects in the scene with spatial positioning.
 */
export async function detectSpatialObjects(
	base64Image: string,
	frameWidth = 640,
	frameHeight = 480,
): Promise<DetectedSpatialObject[]> {
	await initCocoSsd();
	if (!cocoModel) return [];

	let tensor: tf.Tensor3D | null = null;
	try {
		tensor = base64ToTensor(base64Image);
		const predictions = await cocoModel.detect(tensor as any);

		const relevantObjects: DetectedSpatialObject[] = [];

		for (const p of predictions) {
			const cls = p.class.toLowerCase();
			let label: DetectedSpatialObject["label"] | null = null;

			if (cls === "cell phone" || cls === "phone" || cls === "remote") {
				label = "Mobile Phone";
			} else if (cls === "book" || cls === "paper") {
				label = "Book";
			} else if (cls === "laptop" || cls === "tv" || cls === "monitor") {
				label = "Secondary Screen";
			} else if (cls === "headphones" || cls === "earbuds" || cls === "headset") {
				label = "Audio Earphones";
			}

			if (label && p.score >= 0.38) {
				const [x, y, width, height] = p.bbox;
				relevantObjects.push({
					label,
					rawClass: p.class,
					confidence: Number(p.score.toFixed(2)),
					bbox: {
						x: Math.round(x),
						y: Math.round(y),
						width: Math.round(width),
						height: Math.round(height),
					},
					relativePosition: calculateRelativePosition(x, y, width, height, frameWidth, frameHeight),
				});
			}
		}

		return relevantObjects;
	} catch (err: any) {
		console.warn("[detectSpatialObjects] Object detection error:", err.message);
		return [];
	} finally {
		if (tensor) {
			tensor.dispose();
		}
	}
}
