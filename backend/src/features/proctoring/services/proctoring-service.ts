import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-cpu";
import * as faceapi from "@vladmandic/face-api/dist/face-api.node-wasm.js";
import * as jpeg from "jpeg-js";
import path from "path";
import { env } from "../../../config/env";
import { prisma } from "../../../database";

let isModelLoaded = false;

export async function initFaceApi() {
	if (isModelLoaded) return;
	try {
		await tf.setBackend("cpu");
		await tf.ready();

		const modelsPath = path.resolve(env.FACE_API_MODELS_PATH);
		await faceapi.nets.tinyFaceDetector.loadFromDisk(modelsPath);
		await faceapi.nets.faceLandmark68Net.loadFromDisk(modelsPath);
		await faceapi.nets.faceRecognitionNet.loadFromDisk(modelsPath);
		isModelLoaded = true;
		console.log("[FaceAPI] Models loaded successfully on CPU backend.");
	} catch (err) {
		console.error("[FaceAPI] Failed to initialize models:", err);
		throw err;
	}
}

export function base64ToTensor(base64Str: string): tf.Tensor3D {
	try {
		const cleanBase64 = base64Str.replace(/^data:image\/\w+;base64,/, "");
		const buffer = Buffer.from(cleanBase64, "base64");

		// Decode JPEG
		const rawImageData = jpeg.decode(buffer, { useTArray: true });
		const { width, height, data } = rawImageData;

		const numPixels = width * height;
		const rgbValues = new Int32Array(numPixels * 3);
		for (let i = 0; i < numPixels; i++) {
			rgbValues[i * 3] = data[i * 4]; // R
			rgbValues[i * 3 + 1] = data[i * 4 + 1]; // G
			rgbValues[i * 3 + 2] = data[i * 4 + 2]; // B
		}

		return tf.tensor3d(rgbValues, [height, width, 3], "int32");
	} catch (err) {
		console.error("[FaceAPI] Failed to parse base64 to tensor:", err);
		throw new Error("Invalid image encoding or format. Please ensure image is a valid JPEG.");
	}
}

export interface FaceCheckResult {
	faceDetected: boolean;
	multipleFaces: boolean;
	confidenceScore: number;
	match: boolean;
	manualReviewRequired: boolean;
	message: string;
}

export async function verifyFace(
	selfieBase64: string,
	idPhotoBase64?: string,
	userId?: string,
): Promise<FaceCheckResult> {
	await initFaceApi();

	// If no ID photo base64 is provided directly, but a userId is provided, try to load it from the database
	if (!idPhotoBase64 && userId) {
		const user = await prisma.user.findUnique({
			where: { id: userId },
			select: { image: true },
		});
		if (user?.image) {
			idPhotoBase64 = user.image;
		}
	}

	let selfieTensor: tf.Tensor3D | null = null;
	let idTensor: tf.Tensor3D | null = null;

	try {
		selfieTensor = base64ToTensor(selfieBase64);

		// Detect face on selfie
		const selfieDetections = await faceapi
			.detectAllFaces(selfieTensor as any, new faceapi.TinyFaceDetectorOptions({ inputSize: 224 }))
			.withFaceLandmarks()
			.withFaceDescriptors();

		if (selfieDetections.length === 0) {
			return {
				faceDetected: false,
				multipleFaces: false,
				confidenceScore: 0,
				match: false,
				manualReviewRequired: true,
				message: "No face detected in the live camera capture.",
			};
		}

		if (selfieDetections.length > 1) {
			return {
				faceDetected: true,
				multipleFaces: true,
				confidenceScore: 0,
				match: false,
				manualReviewRequired: true,
				message: "Multiple faces detected in the live camera capture.",
			};
		}

		const selfieFace = selfieDetections[0];
		const selfieDescriptor = selfieFace?.descriptor;

		// If ID card photo is provided, match descriptors
		if (idPhotoBase64) {
			idTensor = base64ToTensor(idPhotoBase64);

			const idDetections = await faceapi
				.detectAllFaces(idTensor as any, new faceapi.TinyFaceDetectorOptions({ inputSize: 224 }))
				.withFaceLandmarks()
				.withFaceDescriptors();

			if (idDetections.length === 0) {
				return {
					faceDetected: true,
					multipleFaces: false,
					confidenceScore: 0,
					match: false,
					manualReviewRequired: true,
					message: "No face detected in the uploaded ID document.",
				};
			}

			if (idDetections.length > 1) {
				return {
					faceDetected: true,
					multipleFaces: false,
					confidenceScore: 0,
					match: false,
					manualReviewRequired: true,
					message: "Multiple faces detected in the uploaded ID document.",
				};
			}

			const idFace = idDetections[0];
			const idDescriptor = idFace?.descriptor;

			if (selfieDescriptor && idDescriptor) {
				const distance = faceapi.euclideanDistance(selfieDescriptor, idDescriptor);
				const threshold = env.FACE_MATCH_THRESHOLD;
				const match = distance < threshold;

				// Normalize confidence: 0 distance is 100%, threshold is 50%, 1.0 distance is 0%
				let confidenceScore = 1.0 - distance / (threshold * 2);
				confidenceScore = Math.max(0.0, Math.min(1.0, confidenceScore));

				// Flag manual review if match is borderline
				const borderLow = threshold - 0.08;
				const borderHigh = threshold + 0.08;
				const manualReviewRequired = distance >= borderLow && distance <= borderHigh;

				return {
					faceDetected: true,
					multipleFaces: false,
					confidenceScore: Math.round(confidenceScore * 100) / 100,
					match,
					manualReviewRequired,
					message: match
						? "Face matches registration ID successfully."
						: "Face does not match the registration ID.",
				};
			}
		}

		// Single photo detection verification (e.g. tab check alignment)
		const score = selfieFace?.detection?.score || 1.0;
		return {
			faceDetected: true,
			multipleFaces: false,
			confidenceScore: Math.round(score * 100) / 100,
			match: true,
			manualReviewRequired: score < 0.6,
			message: "Face detected and aligned successfully.",
		};
	} finally {
		if (selfieTensor) tf.dispose(selfieTensor);
		if (idTensor) tf.dispose(idTensor);
	}
}
