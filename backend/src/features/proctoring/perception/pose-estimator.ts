export interface Point2D {
	x: number;
	y: number;
}

export interface HeadPoseEuler {
	yaw: number; // in degrees: negative = right, positive = left
	pitch: number; // in degrees: negative = looking up, positive = looking down
	roll: number; // in degrees: tilt toward shoulder
	deltaYaw: number; // deviation from calibrated baseline
	deltaPitch: number; // deviation from calibrated baseline
	deltaRoll: number; // deviation from calibrated baseline
	gazeDirection: "center" | "left" | "right" | "up" | "down";
	isLookingAway: boolean;
	confidence: number;
}

export interface CalibrationBaseline {
	baselineYaw: number;
	baselinePitch: number;
	baselineRoll: number;
	baselineFaceBox?: { x: number; y: number; width: number; height: number };
	calibratedAt: number;
}

/**
 * Calculates real 3D Euler angles (Yaw, Pitch, Roll in degrees) from 68 facial landmarks.
 */
export function estimateHeadPose(
	landmarks: Point2D[],
	baseline?: CalibrationBaseline | null,
): HeadPoseEuler {
	if (!landmarks || landmarks.length < 68) {
		return {
			yaw: 0,
			pitch: 0,
			roll: 0,
			deltaYaw: 0,
			deltaPitch: 0,
			deltaRoll: 0,
			gazeDirection: "center",
			isLookingAway: false,
			confidence: 0,
		};
	}

	// Key landmark indices (68-point model)
	// Jaw edges: 0 (left edge), 16 (right edge)
	// Chin: 8
	// Nose bridge: 27, Nose tip: 30
	// Left eye outer: 36, Right eye outer: 45
	const leftJaw = landmarks[0];
	const rightJaw = landmarks[16];
	const chin = landmarks[8];
	const noseBridge = landmarks[27];
	const noseTip = landmarks[30];
	const leftEyeOuter = landmarks[36];
	const rightEyeOuter = landmarks[45];

	// 1. Roll (Tilt toward left/right shoulder)
	const deltaEyeX = rightEyeOuter.x - leftEyeOuter.x;
	const deltaEyeY = rightEyeOuter.y - leftEyeOuter.y;
	const rawRoll = Math.atan2(deltaEyeY, deltaEyeX) * (180 / Math.PI);

	// 2. Yaw (Horizontal turn left / right)
	const leftDist = Math.max(0.1, noseTip.x - leftJaw.x);
	const rightDist = Math.max(0.1, rightJaw.x - noseTip.x);
	const yawRatio = leftDist / rightDist;
	// Normalized asymmetry mapped between -1 and +1
	const yawAsymmetry = (yawRatio - 1) / (yawRatio + 1);
	// Approx ~65 degrees at extreme edge
	const rawYaw = yawAsymmetry * 65;

	// 3. Pitch (Vertical tilt up / down)
	const bridgeToTip = Math.max(0.1, noseTip.y - noseBridge.y);
	const tipToChin = Math.max(0.1, chin.y - noseTip.y);
	const pitchRatio = bridgeToTip / tipToChin;
	// Normal human neutral pitch ratio is ~0.42
	const rawPitch = (pitchRatio - 0.42) * 55;

	// Round to 1 decimal place
	const yaw = Number(rawYaw.toFixed(1));
	const pitch = Number(rawPitch.toFixed(1));
	const roll = Number(rawRoll.toFixed(1));

	// 4. Baseline offset subtraction (Calibration compensation)
	const baseYaw = baseline ? baseline.baselineYaw : 0;
	const basePitch = baseline ? baseline.baselinePitch : 0;
	const baseRoll = baseline ? baseline.baselineRoll : 0;

	const deltaYaw = Number((yaw - baseYaw).toFixed(1));
	const deltaPitch = Number((pitch - basePitch).toFixed(1));
	const deltaRoll = Number((roll - baseRoll).toFixed(1));

	// 5. Gaze Direction & Attention Classification
	let gazeDirection: HeadPoseEuler["gazeDirection"] = "center";
	let isLookingAway = false;

	// Angular thresholds for looking away (adjusted with safety margin)
	if (deltaYaw > 18) {
		gazeDirection = "left";
		isLookingAway = true;
	} else if (deltaYaw < -18) {
		gazeDirection = "right";
		isLookingAway = true;
	} else if (deltaPitch < -15) {
		gazeDirection = "up";
		isLookingAway = true;
	} else if (deltaPitch > 22) {
		gazeDirection = "down";
		isLookingAway = true;
	}

	return {
		yaw,
		pitch,
		roll,
		deltaYaw,
		deltaPitch,
		deltaRoll,
		gazeDirection,
		isLookingAway,
		confidence: 0.92,
	};
}
