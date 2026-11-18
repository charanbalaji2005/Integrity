/**
 * Registration numbers look like AP24110010895:
 *   AP        → registration (campus) code
 *   24        → batch / admission year (2024)
 *   110010895 → 9-digit unique student number
 * Keep in sync with backend/src/utils/registration-number.ts.
 */
export const REGISTRATION_NUMBER_PATTERN = /^([A-Z]{2})(\d{2})(\d{9})$/;

export interface ParsedRegistrationNumber {
  normalized: string;
  valid: boolean;
  regCode: string | null;
  batchYear: number | null;
  serial: string | null;
}

export function parseRegistrationNumber(raw: string | null | undefined): ParsedRegistrationNumber {
  const normalized = String(raw ?? "").replace(/[\s-]/g, "").toUpperCase();
  const m = REGISTRATION_NUMBER_PATTERN.exec(normalized);
  // Unrecognised formats are shown exactly as stored (trimmed), not mangled.
  if (!m) return { normalized: String(raw ?? "").trim(), valid: false, regCode: null, batchYear: null, serial: null };
  return { normalized, valid: true, regCode: m[1], batchYear: 2000 + Number(m[2]), serial: m[3] };
}
