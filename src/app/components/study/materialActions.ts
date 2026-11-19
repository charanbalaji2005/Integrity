import { toast } from "sonner";
import { apiFetch } from "../../utils/api-client";

export interface StudyMaterial {
  id: string;
  title: string;
  description: string | null;
  section: string;
  semester: string | null;
  uploadedById: string;
  uploadedByName: string;
  createdAt: string;
  file: { fileName: string; sizeBytes: number; mimeType: string };
  canDelete?: boolean;
}

/** Chat attachments that point at a study material: "material:<id>|<title>". */
export const MATERIAL_ATTACHMENT_PREFIX = "material:";

export function parseMaterialAttachment(raw: string): { id: string; title: string } | null {
  if (!raw?.startsWith(MATERIAL_ATTACHMENT_PREFIX)) return null;
  const body = raw.slice(MATERIAL_ATTACHMENT_PREFIX.length);
  const bar = body.indexOf("|");
  const id = bar === -1 ? body : body.slice(0, bar);
  return id ? { id, title: bar === -1 ? "Study material" : body.slice(bar + 1) } : null;
}

/** Human label for any attachment string (used in chat previews). */
export const attachmentLabel = (raw: string) => parseMaterialAttachment(raw)?.title ?? raw;

/** Link that opens the material in the app (access is still checked on open). */
export const materialShareUrl = (id: string) => `${window.location.origin}/dashboard?material=${encodeURIComponent(id)}`;

export const formatBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

const pdfName = (title: string, fileName?: string) =>
  fileName && /\.pdf$/i.test(fileName) ? fileName : `${title.replace(/[\\/:*?"<>|]+/g, " ").trim() || "material"}.pdf`;

export async function fetchMaterialBlob(id: string): Promise<Blob> {
  const res = await apiFetch(`/api/study-materials/${encodeURIComponent(id)}/file`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      res.status === 404
        ? "This material isn't available to you (it may be for another section or was removed)."
        : data.message || `Could not load the PDF (HTTP ${res.status}).`,
    );
  }
  return res.blob();
}

export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function downloadMaterial(m: { id: string; title: string; file?: { fileName: string } }, blob?: Blob) {
  try {
    saveBlob(blob ?? (await fetchMaterialBlob(m.id)), pdfName(m.title, m.file?.fileName));
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Download failed.");
  }
}

/**
 * Share: the PDF itself where the OS supports file sharing (mobile, Edge),
 * otherwise the in-app link via the share sheet, otherwise copy the link.
 */
export async function shareMaterial(m: { id: string; title: string; file?: { fileName: string } }, blob?: Blob) {
  const url = materialShareUrl(m.id);
  try {
    if (blob && typeof navigator.canShare === "function") {
      const file = new File([blob], pdfName(m.title, m.file?.fileName), { type: "application/pdf" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: m.title, text: `${m.title} — IntegrityOS study material` });
        return;
      }
    }
    if (typeof navigator.share === "function") {
      await navigator.share({ title: m.title, text: `${m.title} — IntegrityOS study material`, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    toast.success("Link copied — classmates in your section can open it after signing in.");
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return; // user closed the share sheet
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard.");
    } catch {
      toast.error("Sharing isn't available in this browser.");
    }
  }
}
