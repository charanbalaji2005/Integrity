import React, { useEffect, useState } from "react";
import { BookOpen, Download, ExternalLink, FileText, Link2, Loader2, PlayCircle, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "../../utils/api-client";
import { openProtectedFile } from "./protected-files";

export interface PermittedMaterial {
  id: string;
  kind: string;
  title: string;
  description?: string | null;
  url?: string | null;
  file?: { fileName: string; mimeType: string; sizeBytes: number } | null;
  permittedInExam?: boolean;
  canDownload?: boolean;
}

export const formatBytes = (n?: number) =>
  !n ? "" : n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

export function MaterialIcon({ kind, className }: { kind: string; className?: string }) {
  if (kind === "video") return <PlayCircle className={className} />;
  if (kind === "link") return <Link2 className={className} />;
  return <FileText className={className} />;
}

/** Materials list in the dark exam theme (used in the live exam and the preview). */
export function MaterialsList({
  materials,
  allowFileOpen = true,
}: {
  materials: PermittedMaterial[];
  allowFileOpen?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const open = async (m: PermittedMaterial, download: boolean) => {
    if (!allowFileOpen) return;
    setBusy(m.id + (download ? ":d" : ""));
    try {
      await openProtectedFile(`/api/courses/materials/${m.id}/file`, m.file?.fileName || m.title, download);
    } catch (err: any) {
      toast.error(err?.message || "Could not open this material.");
    } finally {
      setBusy(null);
    }
  };
  if (materials.length === 0)
    return <p className="text-xs text-zinc-500">No reference materials are permitted for this examination.</p>;
  return (
    <ul className="space-y-2">
      {materials.map((m) => (
        <li key={m.id} className="rounded-xl border border-zinc-800 bg-[#222222]/60 p-3">
          <div className="flex items-start gap-2.5">
            <MaterialIcon kind={m.kind} className="mt-0.5 size-4 shrink-0 text-zinc-400" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-zinc-100 break-words">{m.title}</div>
              {m.description && <div className="mt-0.5 text-[11px] text-zinc-400 break-words">{m.description}</div>}
              <div className="mt-2 flex flex-wrap gap-2">
                {m.url ? (
                  <a
                    href={m.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] font-bold text-zinc-200 hover:bg-zinc-800"
                  >
                    <ExternalLink className="size-3" /> Open link
                  </a>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={!allowFileOpen || !!busy}
                      onClick={() => open(m, false)}
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] font-bold text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                    >
                      {busy === m.id ? <Loader2 className="size-3 animate-spin" /> : <BookOpen className="size-3" />} View
                    </button>
                    {m.canDownload && (
                      <button
                        type="button"
                        disabled={!allowFileOpen || !!busy}
                        onClick={() => open(m, true)}
                        className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-1 text-[11px] font-bold text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                      >
                        {busy === `${m.id}:d` ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />} Download
                      </button>
                    )}
                    {m.file && <span className="self-center text-[10px] text-zinc-500">{formatBytes(m.file.sizeBytes)}</span>}
                  </>
                )}
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Slide-over listing the materials a student may consult during the exam. */
export function ExamMaterialsPanel({
  assessmentId,
  open,
  onClose,
}: {
  assessmentId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [materials, setMaterials] = useState<PermittedMaterial[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setError(null);
    apiFetch(`/api/assessments/${assessmentId}/materials`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message || "Could not load materials.");
        if (live) setMaterials(body.data?.materials ?? []);
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [open, assessmentId]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/60" role="dialog" aria-modal="true" aria-label="Permitted materials">
      <div className="h-full w-full max-w-md overflow-y-auto border-l border-zinc-800 bg-[#1a1917] p-5 text-zinc-100">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold">Permitted reference materials</h2>
          <button type="button" onClick={onClose} aria-label="Close materials" className="rounded-lg p-1.5 hover:bg-zinc-800">
            <X className="size-4" />
          </button>
        </div>
        {error ? (
          <p className="text-xs text-rose-300">{error}</p>
        ) : materials === null ? (
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Loader2 className="size-4 animate-spin" /> Loading materials…
          </div>
        ) : (
          <MaterialsList materials={materials} />
        )}
      </div>
    </div>
  );
}
