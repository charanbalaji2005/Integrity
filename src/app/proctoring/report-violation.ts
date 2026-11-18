import type { ViolationSeverity } from "./types";

/**
 * Direct violation log used by client agents when the AI frame stream is not
 * available to carry the signal. Never throws.
 */
export async function reportViolation(
  attemptId: string,
  userId: string,
  type: string,
  severity: ViolationSeverity,
  description: string,
): Promise<boolean> {
  try {
    const res = await fetch(`/api/assessments/attempts/${attemptId}/violation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": userId,
        "x-user-role": "user",
      },
      body: JSON.stringify({ type, severity, description }),
    });
    return res.ok;
  } catch (err) {
    console.error(`[proctoring] Failed to log ${type} violation:`, err);
    return false;
  }
}
