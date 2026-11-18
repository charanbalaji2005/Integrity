import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { Laptop, X } from "lucide-react";
import { EXAM_DEVICE_MESSAGE, getDeviceKind } from "../../utils/device";

/** Explains why exams can't be started on this phone/tablet. */
export function DesktopRequiredNotice({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const kind = getDeviceKind();

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="desktop-required-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-3xl bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-[#f4f4f4] text-[#1a1917]">
            <Laptop className="size-6" aria-hidden="true" />
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex size-10 items-center justify-center rounded-full text-[#676767] hover:bg-black/5 cursor-pointer"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>
        <h2 id="desktop-required-title" className="mt-4 text-lg font-bold text-[#1a1917]">
          Open this exam on a laptop or desktop
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[#676767]">
          You're on a {kind === "tablet" ? "tablet" : "phone"}. {EXAM_DEVICE_MESSAGE}
        </p>
        <ul className="mt-4 space-y-1.5 rounded-2xl border border-[#dedede] bg-[#fafafa] p-4 text-[13px] text-[#3a3a3a]">
          <li>• Sign in to IntegrityOS on your computer</li>
          <li>• Make sure the webcam works and the room is well lit</li>
          <li>• Open Live Sessions and start the exam there</li>
        </ul>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 min-h-12 w-full rounded-xl bg-[#1a1917] text-sm font-semibold text-white hover:bg-black cursor-pointer"
        >
          Got it
        </button>
      </div>
    </div>,
    document.body,
  );
}
