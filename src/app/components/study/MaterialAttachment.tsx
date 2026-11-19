import React, { useState } from "react";
import { FileText } from "lucide-react";
import { PdfViewer } from "./PdfViewer";
import { parseMaterialAttachment } from "./materialActions";

/**
 * Renders a chat attachment. Study-material attachments ("material:<id>|<title>")
 * become a card that opens the PDF viewer; anything else renders as before.
 */
export function ChatAttachment({ value, tone = "neutral" }: { value: string; tone?: "neutral" | "mine" }) {
  const material = parseMaterialAttachment(value);
  const [open, setOpen] = useState(false);
  const bg = tone === "mine" ? "bg-[#d3e3d3]" : "bg-[#f4f4f4]";

  if (!material) {
    return (
      <div className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 min-w-[200px] ${bg}`}>
        <div className="size-8 rounded bg-white/80 flex items-center justify-center shrink-0" aria-hidden="true">
          <FileText className="size-4 text-[#676767]" />
        </div>
        <span className="text-[12.5px] font-medium text-[#1a1917] truncate">{value}</span>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`group flex min-w-[220px] items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition hover:brightness-95 ${bg}`}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded bg-rose-50 text-rose-600" aria-hidden="true">
          <FileText className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-semibold text-[#1a1917]">{material.title}</span>
          <span className="block text-[11px] text-[#676767]">PDF · Tap to open</span>
        </span>
      </button>
      {open && <PdfViewer material={{ id: material.id, title: material.title }} onClose={() => setOpen(false)} />}
    </>
  );
}
