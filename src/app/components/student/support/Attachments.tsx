import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { FileText, ImageIcon, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { ACCEPTED_EXT, focusRing, formatBytes, validateFile, type Attachment } from "./support-shared";

/** Adds files to a list, enforcing type/size/count limits. Returns the new list. */
export function addFiles(current: File[], incoming: FileList | File[] | null, max: number): File[] {
  if (!incoming) return current;
  const next = [...current];
  for (const f of Array.from(incoming)) {
    if (next.length >= max) {
      toast.error(`You can attach up to ${max} files.`);
      break;
    }
    const err = validateFile(f);
    if (err) {
      toast.error(err);
      continue;
    }
    if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
    next.push(f);
  }
  return next;
}

function isImage(f: { type?: string; mimeType?: string; name?: string; fileName?: string }) {
  const t = f.type || f.mimeType || "";
  return t.startsWith("image/");
}

/** Thumbnails / chips for files selected locally (not yet uploaded). */
export function LocalFilePreviews({ files, onRemove }: { files: File[]; onRemove: (index: number) => void }) {
  const urls = useMemo(() => files.map((f) => (isImage(f) ? URL.createObjectURL(f) : null)), [files]);
  useEffect(() => () => urls.forEach((u) => u && URL.revokeObjectURL(u)), [urls]);
  if (files.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Selected attachments">
      {files.map((f, i) => (
        <li
          key={`${f.name}-${f.size}-${i}`}
          className="flex items-center gap-2 pl-1.5 pr-1 py-1 rounded-xl border border-[#dedede] bg-white max-w-full"
        >
          {urls[i] ? (
            <img src={urls[i] as string} alt="" className="size-9 rounded-lg object-cover border border-[#eee]" />
          ) : (
            <span className="size-9 rounded-lg bg-[#f6f6f6] flex items-center justify-center text-[#676767]">
              <FileText className="size-4" aria-hidden />
            </span>
          )}
          <span className="min-w-0">
            <span className="block text-[12px] font-medium text-[#1a1917] truncate max-w-[140px]">{f.name}</span>
            <span className="block text-[11px] text-[#8a8a8a]">{formatBytes(f.size)}</span>
          </span>
          <button
            type="button"
            onClick={() => onRemove(i)}
            className={`size-11 -my-1 rounded-lg flex items-center justify-center text-[#676767] hover:bg-[#f6f6f6] hover:text-[#1a1917] ${focusRing}`}
            aria-label={`Remove ${f.name}`}
          >
            <X className="size-4" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Drag-and-drop zone with a file picker. */
export function DropZone({
  files,
  onChange,
  max,
  disabled,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  max: number;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const hintId = useId();
  const full = files.length >= max;
  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !full) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (disabled || full) return;
          onChange(addFiles(files, e.dataTransfer.files, max));
        }}
        className={`rounded-xl border border-dashed px-4 py-4 flex flex-col sm:flex-row items-center gap-3 text-center sm:text-left transition-colors ${
          over ? "border-[#1a1917] bg-[#f6f6f6]" : "border-[#cfcfcf] bg-[#fafafa]"
        }`}
      >
        <span className="size-10 rounded-full bg-white border border-[#dedede] flex items-center justify-center text-[#676767] shrink-0">
          <Upload className="size-4" aria-hidden />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] text-[#1a1917]">
            Drag screenshots or files here, or{" "}
            <button
              type="button"
              disabled={disabled || full}
              onClick={() => inputRef.current?.click()}
              className={`font-semibold underline underline-offset-2 disabled:opacity-50 rounded ${focusRing}`}
            >
              browse
            </button>
          </p>
          <p id={hintId} className="text-[11px] text-[#8a8a8a] mt-0.5">
            Up to {max} files · PNG, JPG, WEBP, PDF or TXT · 10 MB each ({files.length}/{max} added)
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXT}
          className="sr-only"
          aria-describedby={hintId}
          tabIndex={-1}
          onChange={(e) => {
            onChange(addFiles(files, e.target.files, max));
            e.target.value = "";
          }}
        />
      </div>
      <LocalFilePreviews files={files} onRemove={(i) => onChange(files.filter((_, idx) => idx !== i))} />
    </div>
  );
}

/** Attachments already stored on the server (signed URLs). Images inline, others as chips. */
export function RemoteAttachments({ items, tone = "light" }: { items: Attachment[]; tone?: "light" | "dark" }) {
  if (!items || items.length === 0) return null;
  const images = items.filter((a) => isImage(a) && a.url);
  const chip =
    tone === "dark"
      ? "border-white/20 bg-white/10 text-white hover:bg-white/20"
      : "border-[#dedede] bg-white text-[#1a1917] hover:bg-[#f6f6f6]";
  return (
    <div className="mt-2 space-y-2">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((a) => (
            <a
              key={a.id}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`block rounded-xl overflow-hidden border border-black/10 ${focusRing}`}
              aria-label={`Open image ${a.fileName}`}
            >
              <img src={a.url} alt={a.fileName} loading="lazy" className="max-h-48 max-w-[240px] object-cover bg-[#f6f6f6]" />
            </a>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {items.map((a) => (
          <a
            key={`chip-${a.id}`}
            href={a.url || undefined}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1.5 min-h-[32px] px-2.5 rounded-lg border text-[11px] font-medium max-w-full ${chip} ${focusRing}`}
          >
            {isImage(a) ? <ImageIcon className="size-3.5 shrink-0" aria-hidden /> : <FileText className="size-3.5 shrink-0" aria-hidden />}
            <span className="truncate max-w-[160px]">{a.fileName}</span>
            <span className="opacity-70 shrink-0">{formatBytes(a.size)}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
