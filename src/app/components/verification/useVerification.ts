import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../utils/api-client";

export type VerificationStatus = "unverified" | "pending" | "approved" | "rejected";
export type DocumentType = "college_id" | "fee_receipt";

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  college_id: "College ID Card",
  fee_receipt: "Institution Fee Receipt",
};

export interface VerificationRequestSummary {
  id: string;
  documentType: DocumentType;
  fileName: string;
  mimeType: string;
  fileSize: number;
  institutionName: string | null;
  rollNumber: string | null;
  status: "pending" | "approved" | "rejected";
  reviewNote: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface MyVerification {
  status: VerificationStatus;
  verifiedAt: string | null;
  institutionName: string | null;
  required: boolean;
  latest: VerificationRequestSummary | null;
}

async function readError(res: Response, fallback: string) {
  try {
    return (await res.json())?.message || fallback;
  } catch {
    return fallback;
  }
}

export async function submitVerificationDocument(input: {
  file: File;
  documentType: DocumentType;
  rollNumber?: string;
}): Promise<VerificationRequestSummary> {
  const fd = new FormData();
  fd.append("documentType", input.documentType);
  if (input.rollNumber?.trim()) fd.append("rollNumber", input.rollNumber.trim());
  fd.append("document", input.file, input.file.name);
  const res = await apiFetch("/api/verification/documents", { method: "POST", body: fd });
  if (!res.ok) throw new Error(await readError(res, "Upload failed. Please try again."));
  return (await res.json()).data;
}

/**
 * Current user's enrolment-verification state. While a review is pending it
 * re-checks periodically and whenever the tab regains focus, so an approval
 * shows up without a manual refresh.
 */
export function useVerification(enabled = true) {
  const [data, setData] = useState<MyVerification | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await apiFetch("/api/verification/me");
      if (!res.ok) throw new Error(await readError(res, "Could not load verification status."));
      setData((await res.json()).data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load verification status.");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled || data?.status !== "pending") return;
    const t = setInterval(refresh, 30000);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, data?.status, refresh]);

  return { data, loading, error, refresh, setData };
}
