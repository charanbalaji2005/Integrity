import type * as tf from "@tensorflow/tfjs-core";
import * as faceapi from "@vladmandic/face-api/dist/face-api.node-wasm.js";
import { base64ToTensor, initFaceApi } from "../services/proctoring-service";
import { type CalibrationBaseline, estimateHeadPose, type HeadPoseEuler } from "./pose-estimator";

export interface FacePerceptionResult {
	detected: boolean;
	faceCount: number;
	confidence: number;
	box?: { x: number; y: number; width: number; height: number };
	landmarks?: { x: number; y: number }[];
	pose?: HeadPoseEuler;
	eyes?: {
		leftEAR: number;
		rightEAR: number;
		avgEAR: number;
		isBlinking: boolean;
		eyesClosed: boolean;
	};
	mouth?: {
		mar: number;
		isMouthOpen: boolean;
		possibleSpeech: boolean;
	};
	error?: string;
}

function dist(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
	return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

function calculateEAR(eye: { x: number; y: number }[]): number {
	if (eye.length < 6) return 0.3;
	const p2_p6 = dist(eye[1], eye[5]);
	const p3_p5 = dist(eye[2], eye[4]);
	const p1_p4 = dist(eye[0], eye[3]);
	return (p2_p6 + p3_p5) / (2.0 * Math.max(0.1, p1_p4));
}

function calculateMAR(mouth: { x: number; y: number }[]): number {
	if (mouth.length < 20) return 0.2;
	// outer lips: index 0 (left), 6 (right), 3 (top), 9 (bottom)
	const vertical = dist(mouth[3], mouth[9]);
	const horizontal = dist(mouth[0], mouth[6]);
	return vertical / Math.max(0.1, horizontal);
}

/**
 * Executes face detection, landmark extraction, EAR, MAR, and pose estimation.
 */
export async function detectFacePerception(
	base64Image: string,
	baseline?: CalibrationBaseline | null,
): Promise<FacePerceptionResult> {
	await initFaceApi();
	let tensor: tf.Tensor3D | null = null;

	try {
		tensor = base64ToTensor(base64Image);
		const detections = await faceapi
			.detectAllFaces(tensor as any, new faceapi.TinyFaceDetectorOptions({ inputSize: 224 }))
			.withFaceLandmarks();

		if (!detections || detections.length === 0) {
			return {
				detected: false,
				faceCount: 0,
				confidence: 0,
			};
		}

		if (detections.length > 1) {
			return {
				detected: true,
				faceCount: detections.length,
				confidence: detections[0].detection.score,
				box: {
					x: Math.round(detections[0].detection.box.x),
					y: Math.round(detections[0].detection.box.y),
					width: Math.round(detections[0].detection.box.width),
					height: Math.round(detections[0].detection.box.height),
				},
			};
		}

		const primaryFace = detections[0];
		const positions = primaryFace.landmarks.positions;
		const box = {
			x: Math.round(primaryFace.detection.box.x),
			y: Math.round(primaryFace.detection.box.y),
			width: Math.round(primaryFace.detection.box.width),
			height: Math.round(primaryFace.detection.box.height),
		};

		// 1. Pose estimation with calibration baseline compensation
		const pose = estimateHeadPose(positions, baseline);

		// 2. Eye Aspect Ratio (EAR)
		const leftEye = positions.slice(36, 42);
		const rightEye = positions.slice(42, 48);
		const leftEAR = Number(calculateEAR(leftEye).toFixed(3));
		const rightEAR = Number(calculateEAR(rightEye).toFixed(3));
		const avgEAR = Number(((leftEAR + rightEAR) / 2.0).toFixed(3));
		const isBlinking = avgEAR < 0.17;
		const eyesClosed = avgEAR < 0.15;

		// 3. Mouth Aspect Ratio (MAR)
		const mouth = positions.slice(48, 68);
		const mar = Number(calculateMAR(mouth).toFixed(3));
		const isMouthOpen = mar > 0.35;
		const possibleSpeech = mar > 0.42;

		return {
			detected: true,
			faceCount: 1,
			confidence: Number(primaryFace.detection.score.toFixed(2)),
			box,
			landmarks: positions.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })),
			pose,
			eyes: {
				leftEAR,
				rightEAR,
				avgEAR,
				isBlinking,
				eyesClosed,
			},
			mouth: {
				mar,
				isMouthOpen,
				possibleSpeech,
			},
		};
	} catch (err: any) {
		console.warn("[detectFacePerception] Face detection error:", err.message);
		return {
			detected: false,
			faceCount: 0,
			confidence: 0,
			error: err.message,
		};
	} finally {
		if (tensor) {
			tensor.dispose();
		}
	}
}
