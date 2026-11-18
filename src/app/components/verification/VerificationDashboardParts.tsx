import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, Clock3, ShieldAlert, X } from "lucide-react";
import { EnrolmentDocumentForm } from "./EnrolmentDocumentForm";
import type { MyVerification } from "./useVerification";

/** Banner shown above dashboard content until the student is verified. */
export function VerificationBanner({
  verification,
  onOpen,
}: {
  verification: MyVerification | null;
  onOpen: () => void;
}) {
  if (!verification || !verification.required || verification.status === "approved") return null;

  const variants = {
    unverified: {
      icon: ShieldAlert,
      cls: "border-[#c5af8a]/60 bg-[#fbf5ea] text-[#5c4a2a]",
      title: "Verify your enrolment to unlock exams",
      body: "Upload your college ID card or institution fee receipt. An administrator will approve it, and you'll get the verified badge.",
      cta: "Upload document",
    },
    pending: {
      icon: Clock3,
      cls: "border-amber-200 bg-amber-50 text-amber-900",
      title: "Your document is under review",
      body: "Exams unlock as soon as an administrator approves it. You'll be notified.",
      cta: "View submission",
    },
    rejected: {
      icon: AlertCircle,
      cls: "border-rose-200 bg-rose-50 text-rose-900",
      title: "Your enrolment document was not approved",
      body: verification.latest?.reviewNote
        ? `Reason: ${verification.latest.reviewNote}. Upload a new document to continue.`
        : "Upload a new document to continue.",
      cta: "Upload again",
    },
  } as const;

  const v = variants[verification.status as keyof typeof variants];
  if (!v) return null;
  const Icon = v.icon;

  return (
    <div role="status" className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center ${v.cls}`}>
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{v.title}</p>
        <p className="mt-0.5 text-[13px] opacity-80">{v.body}</p>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="min-h-10 shrink-0 rounded-xl bg-[#1a1917] px-4 text-xs font-semibold text-white hover:bg-black cursor-pointer"
      >
        {v.cta}
      </button>
    </div>
  );
}

export function VerificationModal({
  open,
  onClose,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  // Portal to <body>: ancestors with transforms/filters would otherwise
  // clip a position:fixed overlay to their own box.
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="verify-modal-title"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-[#faf6ee] p-4 sm:rounded-3xl sm:p-5"
          >
            <div className="mb-3 flex items-center justify-between px-1">
              <h2 id="verify-modal-title" className="text-lg font-bold text-[#1a1917]">
                Enrolment verification
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="flex size-10 items-center justify-center rounded-full text-[#6b6760] hover:bg-black/5 cursor-pointer"
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>
            <EnrolmentDocumentForm onSubmitted={onSubmitted} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
