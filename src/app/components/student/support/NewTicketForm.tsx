import React, { useEffect, useId, useState } from "react";
import { ChevronDown, Info, Loader2, Send, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { DropZone } from "./Attachments";
import { collectDiagnostics, DIAGNOSTICS_DISCLOSURE, DIAGNOSTICS_NOT_SHARED } from "./diagnostics";
import {
  card,
  DEFAULT_SOURCE_PATH,
  errMessage,
  fieldCls,
  focusRing,
  labelCls,
  LIMITS,
  primaryBtn,
  secondaryBtn,
  SUPPORT_CATEGORIES,
  SUPPORT_MODULES,
  supportApi,
  URGENCY_OPTIONS,
  type TicketDetail,
  type Urgency,
} from "./support-shared";

export interface SupportInitialContext {
  sourcePath?: string;
  examAttemptId?: string;
  affectedModule?: string;
  category?: string;
}

interface AttemptOption {
  attemptId: string;
  label: string;
}

function isKey(list: ReadonlyArray<{ key: string }>, k?: string): k is string {
  return !!k && list.some((x) => x.key === k);
}

export function NewTicketForm({
  initialContext,
  getSocketConnected,
  onCreated,
  onCancel,
}: {
  initialContext?: SupportInitialContext;
  getSocketConnected: () => boolean | null;
  onCreated: (ticket: TicketDetail) => void;
  onCancel?: () => void;
}) {
  const ids = useId();
  const [category, setCategory] = useState<string>(isKey(SUPPORT_CATEGORIES, initialContext?.category) ? initialContext!.category! : "");
  const [module, setModule] = useState<string>(
    isKey(SUPPORT_MODULES, initialContext?.affectedModule) ? initialContext!.affectedModule! : ""
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("medium");
  const [examAttemptId, setExamAttemptId] = useState<string>(initialContext?.examAttemptId || "");
  const [files, setFiles] = useState<File[]>([]);
  const [shareDiagnostics, setShareDiagnostics] = useState(true);
  const [showDisclosure, setShowDisclosure] = useState(false);
  const [attempts, setAttempts] = useState<AttemptOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supportApi<any[]>("/api/assessments")
      .then((list) => {
        if (cancelled || !Array.isArray(list)) return;
        const opts = list
          .filter((a) => a && a.attemptId)
          .map((a) => ({
            attemptId: String(a.attemptId),
            label: `${a.title || "Untitled assessment"}${
              a.attemptStatus ? ` — ${String(a.attemptStatus).replace(/_/g, " ")}` : ""
            }`,
          }));
        setAttempts(opts);
      })
      .catch(() => {
        /* related exam is optional; ignore */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const titleLen = title.trim().length;
  const descLen = description.trim().length;
  const errors = {
    category: !category ? "Choose an issue category." : null,
    module: !module ? "Choose the affected area." : null,
    title:
      titleLen < LIMITS.titleMin
        ? `Title must be at least ${LIMITS.titleMin} characters.`
        : titleLen > LIMITS.titleMax
        ? `Title must be ${LIMITS.titleMax} characters or fewer.`
        : null,
    description:
      descLen < LIMITS.descMin
        ? `Please describe the issue in at least ${LIMITS.descMin} characters.`
        : descLen > LIMITS.descMax
        ? `Description must be ${LIMITS.descMax} characters or fewer.`
        : null,
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (hasErrors) {
      const first = document.querySelector<HTMLElement>(`[data-support-form="${ids}"] [aria-invalid="true"]`);
      first?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("title", title.trim());
      fd.append("description", description.trim());
      fd.append("category", category);
      fd.append("affectedModule", module);
      fd.append("urgency", urgency);
      if (examAttemptId) fd.append("examAttemptId", examAttemptId);
      fd.append("sourcePath", initialContext?.sourcePath || DEFAULT_SOURCE_PATH);
      if (shareDiagnostics) {
        try {
          const diag = await collectDiagnostics(getSocketConnected());
          fd.append("diagnostics", JSON.stringify(diag));
        } catch {
          /* diagnostics are best-effort */
        }
      }
      files.forEach((f) => fd.append("files", f));
      const ticket = await supportApi<TicketDetail>("/api/support/tickets", { method: "POST", body: fd });
      toast.success(`Ticket ${ticket.referenceNumber} submitted`);
      onCreated(ticket);
    } catch (err) {
      const msg = errMessage(err, "Couldn't submit your ticket.");
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const fieldError = (key: keyof typeof errors) => (touched ? errors[key] : null);
  const errId = (k: string) => `${ids}-${k}-err`;

  return (
    <form onSubmit={submit} noValidate data-support-form={ids} className={`${card} p-4 sm:p-6`} aria-labelledby={`${ids}-h`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id={`${ids}-h`} className="text-[17px] font-semibold text-[#1a1917]">
            Raise a support ticket
          </h2>
          <p className="text-[12px] text-[#676767] mt-0.5">
            Our AI assistant replies within seconds and brings in a support agent when needed.
          </p>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className={`size-11 rounded-xl flex items-center justify-center text-[#676767] hover:bg-[#f6f6f6] shrink-0 ${focusRing}`}
            aria-label="Close form"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
        <div>
          <label htmlFor={`${ids}-cat`} className={labelCls}>
            Issue category <span className="text-red-600" aria-hidden>*</span>
          </label>
          <select
            id={`${ids}-cat`}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={`${fieldCls} h-11`}
            aria-invalid={!!fieldError("category")}
            aria-describedby={fieldError("category") ? errId("cat") : undefined}
            required
          >
            <option value="">Select a category…</option>
            {SUPPORT_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          {fieldError("category") && (
            <p id={errId("cat")} className="text-[11px] text-red-700 mt-1">
              {errors.category}
            </p>
          )}
        </div>
        <div>
          <label htmlFor={`${ids}-mod`} className={labelCls}>
            Affected area <span className="text-red-600" aria-hidden>*</span>
          </label>
          <select
            id={`${ids}-mod`}
            value={module}
            onChange={(e) => setModule(e.target.value)}
            className={`${fieldCls} h-11`}
            aria-invalid={!!fieldError("module")}
            aria-describedby={fieldError("module") ? errId("mod") : undefined}
            required
          >
            <option value="">Select where it happened…</option>
            {SUPPORT_MODULES.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
          {fieldError("module") && (
            <p id={errId("mod")} className="text-[11px] text-red-700 mt-1">
              {errors.module}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={`${ids}-title`} className={labelCls}>
            Title <span className="text-red-600" aria-hidden>*</span>
          </label>
          <span className={`text-[11px] ${titleLen > LIMITS.titleMax ? "text-red-700" : "text-[#8a8a8a]"}`} aria-hidden>
            {titleLen}/{LIMITS.titleMax}
          </span>
        </div>
        <input
          id={`${ids}-title`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={LIMITS.titleMax + 20}
          placeholder="Short summary, e.g. Camera not detected when starting exam"
          className={`${fieldCls} h-11`}
          aria-invalid={!!fieldError("title")}
          aria-describedby={`${ids}-title-hint${fieldError("title") ? ` ${errId("title")}` : ""}`}
          required
        />
        <p id={`${ids}-title-hint`} className="sr-only">
          Between {LIMITS.titleMin} and {LIMITS.titleMax} characters. {titleLen} entered.
        </p>
        {fieldError("title") && (
          <p id={errId("title")} className="text-[11px] text-red-700 mt-1">
            {errors.title}
          </p>
        )}
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={`${ids}-desc`} className={labelCls}>
            Describe the issue <span className="text-red-600" aria-hidden>*</span>
          </label>
          <span
            className={`text-[11px] ${descLen > LIMITS.descMax || (touched && descLen < LIMITS.descMin) ? "text-red-700" : "text-[#8a8a8a]"}`}
            aria-hidden
          >
            {descLen}/{LIMITS.descMax}
          </span>
        </div>
        <textarea
          id={`${ids}-desc`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          placeholder="What were you doing, what did you expect, and what happened instead? Include any error message you saw."
          className={`${fieldCls} py-2.5 resize-y min-h-[120px]`}
          aria-invalid={!!fieldError("description")}
          aria-describedby={`${ids}-desc-hint${fieldError("description") ? ` ${errId("desc")}` : ""}`}
          required
        />
        <p id={`${ids}-desc-hint`} className="text-[11px] text-[#8a8a8a] mt-1">
          {LIMITS.descMin}–{LIMITS.descMax} characters.
        </p>
        {fieldError("description") && (
          <p id={errId("desc")} className="text-[11px] text-red-700 mt-1">
            {errors.description}
          </p>
        )}
      </div>

      <fieldset className="mt-4">
        <legend className={labelCls}>How urgent is it?</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {URGENCY_OPTIONS.map((u) => {
            const selected = urgency === u.key;
            return (
              <label
                key={u.key}
                className={`relative flex items-start gap-3 min-h-[44px] rounded-xl border px-3 py-2.5 cursor-pointer transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#1a1917] has-[:focus-visible]:ring-offset-2 ${
                  selected
                    ? u.key === "critical"
                      ? "border-red-300 bg-red-50"
                      : "border-[#1a1917] bg-[#f6f6f6]"
                    : "border-[#dedede] bg-white hover:bg-[#fafafa]"
                }`}
              >
                <input
                  type="radio"
                  name={`${ids}-urgency`}
                  value={u.key}
                  checked={selected}
                  onChange={() => setUrgency(u.key)}
                  className="mt-0.5 accent-[#1a1917] size-4 shrink-0"
                />
                <span>
                  <span className={`block text-[13px] font-semibold ${u.key === "critical" ? "text-red-800" : "text-[#1a1917]"}`}>
                    {u.label}
                  </span>
                  <span className="block text-[11px] text-[#676767] mt-0.5">{u.hint}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-4">
        <label htmlFor={`${ids}-exam`} className={labelCls}>
          Related exam <span className="font-normal text-[#8a8a8a]">(optional)</span>
        </label>
        <select
          id={`${ids}-exam`}
          value={examAttemptId}
          onChange={(e) => setExamAttemptId(e.target.value)}
          className={`${fieldCls} h-11`}
        >
          <option value="">Not related to a specific exam</option>
          {examAttemptId && !attempts.some((a) => a.attemptId === examAttemptId) && (
            <option value={examAttemptId}>Current exam attempt</option>
          )}
          {attempts.map((a) => (
            <option key={a.attemptId} value={a.attemptId}>
              {a.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4">
        <span className={labelCls} id={`${ids}-att`}>
          Attachments <span className="font-normal text-[#8a8a8a]">(optional — screenshots help a lot)</span>
        </span>
        <div role="group" aria-labelledby={`${ids}-att`}>
          <DropZone files={files} onChange={setFiles} max={LIMITS.ticketFiles} disabled={submitting} />
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-[#dedede] bg-[#fafafa] p-3">
        <div className="flex items-start gap-3">
          <input
            id={`${ids}-diag`}
            type="checkbox"
            checked={shareDiagnostics}
            onChange={(e) => setShareDiagnostics(e.target.checked)}
            className="mt-1 size-4 accent-[#1a1917] shrink-0"
            aria-describedby={`${ids}-diag-hint`}
          />
          <div className="flex-1 min-w-0">
            <label htmlFor={`${ids}-diag`} className="text-[13px] font-semibold text-[#1a1917] cursor-pointer flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-[#676767]" aria-hidden />
              Share technical details to help support
            </label>
            <p id={`${ids}-diag-hint`} className="text-[11px] text-[#676767] mt-0.5">
              Helps us diagnose camera, browser and connection problems faster.
            </p>
            <button
              type="button"
              onClick={() => setShowDisclosure((v) => !v)}
              aria-expanded={showDisclosure}
              aria-controls={`${ids}-diag-list`}
              className={`mt-1 inline-flex items-center gap-1 min-h-[44px] sm:min-h-[32px] text-[12px] font-semibold text-[#1a1917] underline underline-offset-2 rounded ${focusRing}`}
            >
              <Info className="size-3.5" aria-hidden />
              What's shared?
              <ChevronDown className={`size-3.5 transition-transform ${showDisclosure ? "rotate-180" : ""}`} aria-hidden />
            </button>
            {showDisclosure && (
              <div id={`${ids}-diag-list`} className="mt-1 text-[12px] text-[#676767]">
                <ul className="list-disc pl-5 space-y-0.5">
                  {DIAGNOSTICS_DISCLOSURE.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
                <p className="mt-1.5 text-[11px] text-[#8a8a8a]">{DIAGNOSTICS_NOT_SHARED}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-800">
          {error}
        </div>
      )}

      <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className={secondaryBtn} disabled={submitting}>
            Cancel
          </button>
        )}
        <button type="submit" className={primaryBtn} disabled={submitting} aria-busy={submitting}>
          {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
          {submitting ? "Submitting…" : "Submit ticket"}
        </button>
      </div>
    </form>
  );
}
