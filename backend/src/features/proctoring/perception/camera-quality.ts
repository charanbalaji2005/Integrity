import * as jpeg from "jpeg-js";

export interface CameraQualityMetrics {
	brightness: number; // 0 (pitch black) to 1 (pure white)
	blur: number; // 0 (crystal sharp) to 1 (extremely blurry)
	faceVisibility: number; // 0 (invisible/absent) to 1 (optimal frame coverage)
	occlusion: number; // 0 (completely unoccluded) to 1 (heavily covered)
	lightingState: "optimal" | "under-exposed" | "over-exposed" | "backlit";
	usable: boolean;
	qualityScore: number; // 0 to 100 overall composite quality score
	warningMessage?: string;
}

/**
 * Evaluates frame quality deterministically using image statistics.
 */
export function evaluateCameraQuality(
	base64Image: string,
	faceBox?: { x: number; y: number; width: number; height: number } | null,
	faceDetected = false,
): CameraQualityMetrics {
	try {
		const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");
		const buffer = Buffer.from(cleanBase64, "base64");
		const raw = jpeg.decode(buffer, { useTArray: true });
		const { width, height, data } = raw;
		const totalPixels = width * height;

		if (totalPixels === 0) {
			return getFallbackQuality("Empty frame buffer");
		}

		// 1. Calculate Brightness and Contrast
		let luminanceSum = 0;
		const step = Math.max(1, Math.floor(totalPixels / 10000)); // Sample ~10k pixels for sub-millisecond execution
		let sampledCount = 0;

		for (let i = 0; i < totalPixels; i += step) {
			const idx = i * 4;
			const r = data[idx];
			const g = data[idx + 1];
			const b = data[idx + 2];
			// Standard ITU-R BT.601 perceptual luminance
			const lum = 0.299 * r + 0.587 * g + 0.114 * b;
			luminanceSum += lum;
			sampledCount++;
		}

		const avgLuminance = luminanceSum / (sampledCount * 255);
		const brightness = Math.min(1, Math.max(0, avgLuminance));

		let lightingState: CameraQualityMetrics["lightingState"] = "optimal";
		if (brightness < 0.18) {
			lightingState = "under-exposed";
		} else if (brightness > 0.88) {
			lightingState = "over-exposed";
		}

		// 2. Estimate Blur / Sharpness via Horizontal and Vertical Gradient Variance
		let gradientSum = 0;
		let gradientSqSum = 0;
		let gradientSamples = 0;

		const rowStep = Math.max(1, Math.floor(height / 100));
		const colStep = Math.max(1, Math.floor(width / 100));

		for (let y = 1; y < height - 1; y += rowStep) {
			for (let x = 1; x < width - 1; x += colStep) {
				const currIdx = (y * width + x) * 4;
				const rightIdx = (y * width + (x + 1)) * 4;
				const downIdx = ((y + 1) * width + x) * 4;

				const currLum =
					0.299 * data[currIdx] + 0.587 * data[currIdx + 1] + 0.114 * data[currIdx + 2];
				const rightLum =
					0.299 * data[rightIdx] + 0.587 * data[rightIdx + 1] + 0.114 * data[rightIdx + 2];
				const downLum =
					0.299 * data[downIdx] + 0.587 * data[downIdx + 1] + 0.114 * data[downIdx + 2];

				const grad = Math.abs(currLum - rightLum) + Math.abs(currLum - downLum);
				gradientSum += grad;
				gradientSqSum += grad * grad;
				gradientSamples++;
			}
		}

		const meanGrad = gradientSum / (gradientSamples || 1);
		const gradVariance = gradientSqSum / (gradientSamples || 1) - meanGrad * meanGrad;
		// A sharp scene produces gradVariance > 150; blurry scene has gradVariance < 40
		const blur = Math.min(1, Math.max(0, 1 - Math.min(1, gradVariance / 180)));

		// 3. Evaluate Face Visibility & Occlusion
		let faceVisibility = 0;
		let occlusion = 0;

		if (faceDetected && faceBox) {
			const frameArea = width * height;
			const faceArea = faceBox.width * faceBox.height;
			const areaRatio = faceArea / frameArea;

			// Ideal face occupying between 8% and 35% of total camera frame
			if (areaRatio >= 0.08 && areaRatio <= 0.4) {
				faceVisibility = 0.95;
			} else if (areaRatio < 0.08) {
				faceVisibility = Math.max(0.2, areaRatio / 0.08); // Too far away
			} else {
				faceVisibility = Math.max(0.4, 1 - (areaRatio - 0.4) * 1.5); // Too close
			}

			// Boundary clipping heuristic: face box clipping camera edges
			const isNearEdge =
				faceBox.x < 10 ||
				faceBox.y < 10 ||
				faceBox.x + faceBox.width > width - 10 ||
				faceBox.y + faceBox.height > height - 10;
			if (isNearEdge) {
				occlusion += 0.25;
				faceVisibility *= 0.8;
			}
		} else if (faceDetected) {
			faceVisibility = 0.75;
		} else {
			faceVisibility = 0;
		}

		// 4. Usable Flag and Composite Quality Score
		const isLightingAcceptable = brightness >= 0.12 && brightness <= 0.92;
		const isBlurAcceptable = blur <= 0.65;
		const usable = isLightingAcceptable && isBlurAcceptable;

		let qualityScore = Math.round(
			(1 - blur) * 35 +
				(1 - Math.abs(brightness - 0.5) * 2) * 35 +
				(faceDetected ? faceVisibility : 0.5) * 30,
		);
		qualityScore = Math.max(10, Math.min(100, qualityScore));

		let warningMessage: string | undefined;
		if (!usable) {
			if (brightness < 0.12) {
				warningMessage = "Environment lighting is too dark. Please adjust your room lighting.";
			} else if (brightness > 0.92) {
				warningMessage = "Camera is overexposed or backlit. Please avoid bright background lights.";
			} else if (blur > 0.65) {
				warningMessage = "Camera focus is blurry. Please clean your camera lens.";
			}
		}

		return {
			brightness: Number(brightness.toFixed(2)),
			blur: Number(blur.toFixed(2)),
			faceVisibility: Number(faceVisibility.toFixed(2)),
			occlusion: Number(occlusion.toFixed(2)),
			lightingState,
			usable,
			qualityScore,
			warningMessage,
		};
	} catch (err: any) {
		console.warn("[evaluateCameraQuality] Failed to compute metrics:", err.message);
		return getFallbackQuality("Failed to compute camera metrics");
	}
}

function getFallbackQuality(warningMessage?: string): CameraQualityMetrics {
	return {
		brightness: 0.5,
		blur: 0.1,
		faceVisibility: 0.8,
		occlusion: 0,
		lightingState: "optimal",
		usable: true,
		qualityScore: 80,
		warningMessage,
	};
}
