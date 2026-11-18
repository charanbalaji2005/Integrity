import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileText, IdCard, Loader2, Receipt, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import {
  DOCUMENT_TYPE_LABELS,
  type DocumentType,
  type MyVerification,
  submitVerificationDocument,
  useVerification,
} from "./useVerification";
import { InstitutionBadge, PendingBadge, VerifiedBadge } from "./VerificationBadges";

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = ".jpg,.jpeg,.png,.pdf";
const ACCEPT_MIME = new Set(["image/jpeg", "image/png", "application/pdf"]);

const TYPE_OPTIONS: { id: DocumentType; icon: typeof IdCard; hint: string }[] = [
  { id: "college_id", icon: IdCard, hint: "Front side, photo and name clearly visible" },
  { id: "fee_receipt", icon: Receipt, hint: "Current semester receipt showing your name and institution" },
];

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Keep a JPEG of an ID-card photo for the face-match step (images only). */
function cacheIdPhotoForFaceMatch(file: File) {
  if (!file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onloadend = () => {
    const img = new Image();
    img.onload = () => {
      const canvas = window.document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      try {
        localStorage.setItem("uploaded_id_card", canvas.toDataURL("image/jpeg", 0.9));
      } catch {
        /* storage full or blocked: face match falls back to selfie-only */
      }
    };
    img.src = reader.result as string;
  };
  reader.readAsDataURL(file);
}

interface Props {
  /** Called after a successful submission with the refreshed status. */
  onSubmitted?: (status: MyVerification | null) => void;
  /** Hide the header (when embedded in a modal that has its own title). */
  hideHeader?: boolean;
}

export function EnrolmentDocumentForm({ onSubmitted, hideHeader = false }: Props) {
  const { data, loading, refresh } = useVerification();
  const inputRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState<DocumentType>("college_id");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [rollNumber, setRollNumber] = useState("");
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (files: FileList | null) => {
    setError(null);
    const f = files?.[0];
    if (!f) return;
    if (!ACCEPT_MIME.has(f.type)) {
      setError("Upload a JPG, PNG or PDF file.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("File is larger than 10 MB.");
      return;
    }
    setFile(f);
  };

  const submit = async () => {
    if (!file || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitVerificationDocument({ file, documentType: docType, rollNumber });
      if (docType === "college_id") cacheIdPhotoForFaceMatch(file);
      toast.success("Document submitted. An administrator will review it shortly.");
      setFile(null);
      setReplacing(false);
      await refresh();
      onSubmitted?.(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const status = data?.status ?? "unverified";
  const showForm = status === "unverified" || status === "rejected" || replacing;

  return (
    <div className="rounded-3xl border border-card-border bg-card-bg p-5 sm:p-6 shadow-card">
      {!hideHeader && (
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#f3ead9] text-[#8a6d3b]">
              <UploadCloud className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-bold text-ink-900">Enrolment proof</h2>
              <p className="text-sm text-ink-500">College ID card or institution fee receipt</p>
            </div>
          </div>
          {status === "approved" && <VerifiedBadge size="md" />}
          {status === "pending" && !replacing && <PendingBadge />}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-10 justify-center text-sm text-ink-500">
          <Loader2 className="size-4 animate-spin" /> Checking verification status...
        </div>
      ) : status === "approved" ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 text-sm">
          <div className="flex items-center gap-2 font-bold text-emerald-800">
            <CheckCircle2 className="size-5" /> Enrolment verified
          </div>
          <p className="mt-1.5 text-emerald-900/80">You can take examinations. Your profile now shows the verified badge.</p>
          {data?.institutionName && <InstitutionBadge name={data.institutionName} className="mt-3" />}
        </div>
      ) : status === "pending" && !replacing ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 text-sm">
          <p className="font-bold text-amber-900">Waiting for administrator approval</p>
          <p className="mt-1.5 text-amber-900/80">
            {data?.latest
              ? `${DOCUMENT_TYPE_LABELS[data.latest.documentType]} · ${data.latest.fileName} · submitted ${new Date(data.latest.createdAt).toLocaleString()}`
              : "Your document has been submitted."}
          </p>
          <p className="mt-2 text-amber-900/70">You'll get a notification once it's reviewed. Exams unlock after approval.</p>
          <button
            type="button"
            onClick={() => setReplacing(true)}
            className="mt-3 text-[13px] font-semibold text-amber-900 underline underline-offset-4 cursor-pointer"
          >
            Upload a different document
          </button>
        </div>
      ) : null}

      {!loading && showForm && (
        <div className={status === "pending" || status === "approved" ? "mt-5" : ""}>
          {status === "rejected" && data?.latest?.reviewNote && (
            <div role="alert" className="mb-4 flex gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              <AlertCircle className="size-5 shrink-0" />
              <div>
                <p className="font-bold">Your last document was not approved</p>
                <p className="mt-0.5">Reason: {data.latest.reviewNote}. Please upload a new one.</p>
              </div>
            </div>
          )}

          {/* Document type */}
          <fieldset>
            <legend className="mb-2 text-[13px] font-semibold text-ink-700">Document type</legend>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup">
              {TYPE_OPTIONS.map(({ id, icon: Icon, hint }) => {
                const active = docType === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setDocType(id)}
                    className={`flex items-start gap-3 rounded-2xl border p-3 text-left transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c5af8a] ${
                      active ? "border-ink-900 bg-ink-900 text-card-bg shadow-pill" : "border-card-border bg-white/60 text-ink-700 hover:border-[#c5af8a]"
                    }`}
                  >
                    <Icon className={`mt-0.5 size-5 shrink-0 ${active ? "text-[#f5e9d3]" : "text-[#8a6d3b]"}`} aria-hidden="true" />
                    <span>
                      <span className="block text-[13.5px] font-bold">{DOCUMENT_TYPE_LABELS[id]}</span>
                      <span className={`block text-[11.5px] leading-snug ${active ? "text-card-bg/70" : "text-ink-500"}`}>{hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Drop zone */}
          <div
            role="button"
            tabIndex={0}
            aria-label="Choose a document to upload"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), inputRef.current?.click())}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files);
            }}
            className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-5 py-8 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c5af8a] ${
              dragging ? "border-[#8a6d3b] bg-[#f3ead9]/60" : "border-upload-border bg-upload-bg hover:border-[#c5af8a]"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                pick(e.target.files);
                e.target.value = "";
              }}
            />
            {file ? (
              <div className="flex w-full max-w-sm items-center gap-3 text-left" onClick={(e) => e.stopPropagation()}>
                {preview ? (
                  <img src={preview} alt="Selected document preview" className="size-16 shrink-0 rounded-xl border border-card-border object-cover" />
                ) : (
                  <span className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                    <FileText className="size-7" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink-900">{file.name}</p>
                  <p className="text-xs text-ink-500">{formatSize(file.size)} · {DOCUMENT_TYPE_LABELS[docType]}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-400 hover:bg-black/5 hover:text-ink-700 cursor-pointer"
                  aria-label="Remove file"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <>
                <UploadCloud className="mb-3 size-7 text-[#c5af8a]" aria-hidden="true" />
                <p className="text-sm font-semibold text-ink-700">
                  Drag and drop, or <span className="text-[#8a6d3b] underline">browse</span>
                </p>
                <p className="mt-1 text-xs text-ink-400">JPG, PNG or PDF · up to 10 MB</p>
              </>
            )}
          </div>

          <label className="mt-4 block">
            <span className="text-[13px] font-semibold text-ink-700">
              Roll number <span className="font-normal text-ink-400">(optional, helps the reviewer)</span>
            </span>
            <input
              value={rollNumber}
              onChange={(e) => setRollNumber(e.target.value)}
              maxLength={40}
              placeholder="e.g. AP23110010001"
              className="mt-1.5 w-full rounded-xl border border-card-border bg-white/70 px-3.5 py-2.5 text-base sm:text-sm text-ink-900 placeholder:text-ink-400 focus:border-[#c5af8a] focus:outline-none focus:ring-1 focus:ring-[#c5af8a]"
            />
          </label>

          {error && (
            <p role="alert" className="mt-3 flex items-center gap-1.5 text-sm text-rose-700">
              <AlertCircle className="size-4" /> {error}
            </p>
          )}

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {replacing && (
              <button
                type="button"
                onClick={() => {
                  setReplacing(false);
                  setFile(null);
                }}
                className="min-h-11 rounded-2xl border border-card-border px-5 text-sm font-semibold text-ink-700 cursor-pointer"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              disabled={!file || submitting}
              onClick={submit}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-ink-900 px-5 text-sm font-semibold text-card-bg shadow-btn-dark transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            >
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {submitting ? "Uploading..." : "Submit for admin approval"}
            </button>
          </div>
          <p className="mt-3 text-[11.5px] text-ink-400">
            Only administrators can view this document. It is used solely to confirm your enrolment.
          </p>
        </div>
      )}
    </div>
  );
}
