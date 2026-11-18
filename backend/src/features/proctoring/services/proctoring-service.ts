import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-cpu";
import * as faceapi from "@vladmandic/face-api/dist/face-api.node-wasm.js";
import * as jpeg from "jpeg-js";
import path from "path";
import { env } from "../../../config/env";
import { prisma } from "../../../database";

let isModelLoaded = false;
let initPromise: Promise<void> | null = null;

/** Prefer the WASM backend (~10-15x faster than pure-JS CPU); fall back to CPU. */
async function selectBackend(): Promise<string> {
	try {
		const wasm = await import("@tensorflow/tfjs-backend-wasm");
		try {
			const wasmDir = path.dirname(require.resolve("@tensorflow/tfjs-backend-wasm/package.json"));
			wasm.setWasmPaths(`${path.join(wasmDir, "dist")}${path.sep}`);
		} catch {
			// Use the backend's default lookup path.
		}
		if (await tf.setBackend("wasm")) {
			await tf.ready();
			return "wasm";
		}
	} catch (err) {
		console.warn("[FaceAPI] WASM backend unavailable, falling back to CPU:", err);
	}
	await tf.setBackend("cpu");
	await tf.ready();
	return "cpu";
}

export function initFaceApi(): Promise<void> {
	if (isModelLoaded) return Promise.resolve();
	// Share one in-flight init so concurrent requests don't load models twice.
	if (!initPromise) {
		initPromise = (async () => {
			const backend = await selectBackend();
			const modelsPath = path.resolve(env.FACE_API_MODELS_PATH);
			await Promise.all([
				faceapi.nets.tinyFaceDetector.loadFromDisk(modelsPath),
				faceapi.nets.faceLandmark68Net.loadFromDisk(modelsPath),
				faceapi.nets.faceRecognitionNet.loadFromDisk(modelsPath),
			]);
			isModelLoaded = true;
			console.log(`[FaceAPI] Models loaded successfully on ${backend.toUpperCase()} backend.`);
		})().catch((err) => {
			initPromise = null;
			console.error("[FaceAPI] Failed to initialize models:", err);
			throw err;
		});
	}
	return initPromise;
}

// Cache of the registered ID photo's face descriptor, keyed by user, so the
// reference image isn't decoded and re-analysed on every face check.
const idDescriptorCache = new Map<string, { key: string; descriptor: Float32Array | null }>();

async function getIdDescriptor(
	idPhotoBase64: string,
	userId?: string,
): Promise<Float32Array | null | "multiple"> {
	const cacheKey = `${idPhotoBase64.length}:${idPhotoBase64.slice(-64)}`;
	const cached = userId ? idDescriptorCache.get(userId) : undefined;
	if (cached && cached.key === cacheKey) return cached.descriptor;

	let idTensor: tf.Tensor3D | null = null;
	try {
		idTensor = base64ToTensor(idPhotoBase64);
		const idDetections = await faceapi
			.detectAllFaces(idTensor as never, new faceapi.TinyFaceDetectorOptions({ inputSize: 320 }))
			.withFaceLandmarks()
			.withFaceDescriptors();
		if (idDetections.length > 1) return "multiple";
		const descriptor = idDetections[0]?.descriptor ?? null;
		if (userId) idDescriptorCache.set(userId, { key: cacheKey, descriptor });
		return descriptor;
	} finally {
		if (idTensor) tf.dispose(idTensor);
	}
}

/** Only JPEG data URLs / raw base64 can be decoded; profile images may be URLs or PNGs. */
function isDecodableJpeg(value: string): boolean {
	if (/^data:image\/(jpe?g);base64,/i.test(value)) return true;
	if (/^data:/i.test(value) || /^https?:\/\//i.test(value)) return false;
	// Raw base64: JPEG files start with FF D8 → "/9j/" in base64.
	return value.startsWith("/9j/");
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
		// Profile images can be OAuth avatar URLs or PNGs, which can't be decoded
		// here; skip matching rather than failing every face check.
		if (user?.image && isDecodableJpeg(user.image)) {
			idPhotoBase64 = user.image;
		}
	}

	let selfieTensor: tf.Tensor3D | null = null;

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
			const idResult = await getIdDescriptor(idPhotoBase64, userId);

			if (idResult === null) {
				return {
					faceDetected: true,
					multipleFaces: false,
					confidenceScore: 0,
					match: false,
					manualReviewRequired: true,
					message: "No face detected in the uploaded ID document.",
				};
			}

			if (idResult === "multiple") {
				return {
					faceDetected: true,
					multipleFaces: false,
					confidenceScore: 0,
					match: false,
					manualReviewRequired: true,
					message: "Multiple faces detected in the uploaded ID document.",
				};
			}

			const idDescriptor = idResult;

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
	}
}
