import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { errorMessage, supportApi } from "./api";
import type { ActionKind } from "./ConversationPanel";
import type { InternalNote, Priority, StaffProfile, TicketDetail } from "./types";
import { AVAILABILITY_LABEL, PRIORITIES, PRIORITY_LABEL, categoryLabel } from "./types";
import { AvailabilityDot, Field, Modal, Spinner, WorkloadBar, btnPrimary, btnSecondary, cx, focusRing, inputCls } from "./ui";

export interface DialogRequest {
  kind: ActionKind;
  prefill?: string;
}

const textareaCls = cx(inputCls, "py-2.5 min-h-[96px] resize-y");

export function ActionDialogs({
  request,
  ticket,
  onClose,
  onUpdated,
  onNoteCreated,
}: {
  request: DialogRequest | null;
  ticket: TicketDetail | null;
  onClose: () => void;
  onUpdated: (t: TicketDetail) => void;
  onNoteCreated: (n: InternalNote) => void;
}) {
  const open = !!request && !!ticket;
  const kind = request?.kind;
  const isSupervisor = !!ticket?.permissions?.isSupervisor;

  const [text, setText] = useState("");
  const [reason, setReason] = useState("");
  const [department, setDepartment] = useState("");
  const [priority, setPriority] = useState<Priority | "">("");
  const [staffId, setStaffId] = useState<string>("");
  const [staff, setStaff] = useState<StaffProfile[] | null>(null);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!request || !ticket) return;
    setText(request.prefill ?? "");
    setReason("");
    setDepartment(ticket.aiAnalysis?.suggestedDepartment || ticket.department || "");
    setPriority(request.kind === "priority" ? ticket.priority : "");
    setStaffId("");
    setBusy(false);
    if (request.kind === "reassign" && ticket.permissions?.isSupervisor) {
      setStaff(null);
      setStaffError(null);
      supportApi<StaffProfile[]>("/staff")
        .then(setStaff)
        .catch((e) => setStaffError(errorMessage(e)));
    }
  }, [request, ticket?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ticket) return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const post = (path: string, body: unknown) => supportApi<TicketDetail>(`/tickets/${ticket.id}${path}`, { method: "POST", body });

  let title = "";
  let description: string | undefined;
  let body: React.ReactNode = null;
  let canSubmit = false;
  let submitLabel = "Confirm";
  let submit: () => void = () => {};

  switch (kind) {
    case "resolve":
      title = "Resolve ticket";
      description = "The resolution summary is shown to the student. They can reopen the ticket if the issue persists.";
      canSubmit = text.trim().length >= 3;
      submitLabel = "Resolve ticket";
      body = (
        <Field label="Resolution" htmlFor="res-text" hint="Describe what was done and any next steps for the student.">
          <textarea id="res-text" data-autofocus value={text} onChange={(e) => setText(e.target.value)} className={cx(textareaCls, "min-h-[140px]")} />
        </Field>
      );
      submit = () =>
        run(async () => {
          onUpdated(await post("/resolve", { resolution: text.trim() }));
          toast.success(`${ticket.referenceNumber} resolved`);
        });
      break;

    case "escalate":
      title = "Escalate ticket";
      description = "Escalation routes the ticket to another department and flags it for supervisors.";
      canSubmit = department.trim().length > 0 && reason.trim().length >= 3;
      submitLabel = "Escalate";
      body = (
        <div className="space-y-4">
          <Field label="Department" htmlFor="esc-dept" hint={ticket.aiAnalysis?.suggestedDepartment ? `AI suggests: ${ticket.aiAnalysis.suggestedDepartment}` : undefined}>
            <input id="esc-dept" data-autofocus list="esc-dept-list" value={department} onChange={(e) => setDepartment(e.target.value)} className={inputCls} />
            <datalist id="esc-dept-list">
              {[ticket.aiAnalysis?.suggestedDepartment, ticket.department].filter(Boolean).map((d) => (
                <option key={d as string} value={d as string} />
              ))}
            </datalist>
          </Field>
          <Field label="Reason" htmlFor="esc-reason">
            <textarea id="esc-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={textareaCls} />
          </Field>
          <Field label="New priority (optional)" htmlFor="esc-pri">
            <select id="esc-pri" value={priority} onChange={(e) => setPriority(e.target.value as Priority | "")} className={inputCls}>
              <option value="">Keep {ticket.priority}</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p} · {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </Field>
        </div>
      );
      submit = () =>
        run(async () => {
          onUpdated(await post("/escalate", { department: department.trim(), reason: reason.trim(), ...(priority ? { priority } : {}) }));
          toast.success(`${ticket.referenceNumber} escalated`);
        });
      break;

    case "priority":
      title = "Change priority";
      description = "Priority changes are recorded in the ticket history with your reason.";
      canSubmit = !!priority && priority !== ticket.priority && reason.trim().length >= 3;
      submitLabel = "Update priority";
      body = (
        <div className="space-y-4">
          <fieldset>
            <legend className="text-xs font-bold text-[#1a1917] mb-2">Priority</legend>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PRIORITIES.map((p) => (
                <label
                  key={p}
                  className={cx(
                    "flex flex-col items-center justify-center min-h-14 rounded-xl border cursor-pointer text-xs font-bold",
                    priority === p ? "border-[#1a1917] bg-[#f6f6f6]" : "border-[#dedede] hover:bg-[#fafafa]"
                  )}
                >
                  <input type="radio" name="prio" value={p} checked={priority === p} onChange={() => setPriority(p)} className="sr-only" />
                  <span>{p}</span>
                  <span className="text-[10px] font-semibold text-[#8a8a8a]">{PRIORITY_LABEL[p]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {ticket.aiAnalysis && (
            <p className="text-[11px] text-[#676767] bg-indigo-50 border border-indigo-100 rounded-lg p-2">
              AI assessed {ticket.aiAnalysis.priority}: {ticket.aiAnalysis.priorityReason}
            </p>
          )}
          <Field label="Reason" htmlFor="pri-reason">
            <textarea id="pri-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={textareaCls} />
          </Field>
        </div>
      );
      submit = () =>
        run(async () => {
          onUpdated(await post("/priority", { priority, reason: reason.trim() }));
          toast.success(`Priority set to ${priority}`);
        });
      break;

    case "return_to_ai":
      title = "Return to AI assistant";
      description = "The AI assistant will take ownership again to gather more information from the student.";
      canSubmit = reason.trim().length >= 3;
      submitLabel = "Return to AI";
      body = (
        <Field label="Reason / what the AI should collect" htmlFor="rai-reason">
          <textarea id="rai-reason" data-autofocus value={reason} onChange={(e) => setReason(e.target.value)} className={textareaCls} />
        </Field>
      );
      submit = () =>
        run(async () => {
          onUpdated(await post("/return-to-ai", { reason: reason.trim() }));
          toast.success("Returned to AI assistant");
        });
      break;

    case "finding":
      title = "Mark as verified finding";
      description = "Saved as an internal note marked “Verified finding”. Never visible to the student.";
      canSubmit = text.trim().length >= 3;
      submitLabel = "Save finding";
      body = (
        <Field label="Finding" htmlFor="finding-text" hint="Edit to state exactly what you verified.">
          <textarea id="finding-text" data-autofocus value={text} onChange={(e) => setText(e.target.value)} className={cx(textareaCls, "min-h-[140px]")} />
        </Field>
      );
      submit = () =>
        run(async () => {
          const note = await supportApi<InternalNote>(`/tickets/${ticket.id}/internal-notes`, {
            method: "POST",
            body: { content: text.trim(), kind: "verified_finding" },
          });
          onNoteCreated(note);
          toast.success("Verified finding saved");
        });
      break;

    case "reassign":
      if (isSupervisor) {
        title = "Reassign ticket";
        description = "Pick a representative, or let the assignment engine choose the best available one.";
        canSubmit = reason.trim().length >= 3;
        submitLabel = staffId ? "Reassign" : "Let engine choose";
        body = (
          <div className="space-y-4">
            <fieldset>
              <legend className="text-xs font-bold text-[#1a1917] mb-2">Representative</legend>
              {staffError ? (
                <p className="text-xs text-rose-600">{staffError}</p>
              ) : !staff ? (
                <Spinner label="Loading staff" />
              ) : (
                <ul className="space-y-1.5 max-h-[40vh] overflow-y-auto pr-1">
                  <li>
                    <label className={cx("flex items-center gap-3 p-3 rounded-xl border cursor-pointer min-h-11", !staffId ? "border-[#1a1917] bg-[#f6f6f6]" : "border-[#dedede]")}>
                      <input type="radio" name="staff" checked={!staffId} onChange={() => setStaffId("")} className="accent-black" />
                      <span className="text-xs font-bold">Automatic — best available representative</span>
                    </label>
                  </li>
                  {staff
                    .filter((s) => s.id !== ticket.assignment?.staffId)
                    .map((s) => {
                      const expertMatch = s.expertise.includes(ticket.category);
                      return (
                        <li key={s.id}>
                          <label className={cx("flex items-center gap-3 p-3 rounded-xl border cursor-pointer", staffId === s.id ? "border-[#1a1917] bg-[#f6f6f6]" : "border-[#dedede] hover:bg-[#fafafa]")}>
                            <input type="radio" name="staff" checked={staffId === s.id} onChange={() => setStaffId(s.id)} className="accent-black" />
                            <span className="flex-1 min-w-0">
                              <span className="flex items-center gap-2">
                                <AvailabilityDot availability={s.availability} isOnline={s.isOnline} />
                                <span className="text-xs font-bold truncate">{s.name}</span>
                                <span className="text-[10px] text-[#8a8a8a]">{s.isOnline ? AVAILABILITY_LABEL[s.availability] : "Offline"}</span>
                                {expertMatch && <span className="text-[9.5px] font-bold px-1.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">{categoryLabel(ticket.category)} expert</span>}
                              </span>
                              <span className="flex items-center gap-2 mt-1.5">
                                <WorkloadBar value={s.activeTickets} max={s.maxActiveTickets} />
                                <span className="text-[10px] text-[#676767] tabular-nums shrink-0">
                                  {s.activeTickets}/{s.maxActiveTickets}
                                  {s.pendingTickets > 0 && ` · ${s.pendingTickets} pending`}
                                </span>
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                </ul>
              )}
            </fieldset>
            <Field label="Reason" htmlFor="rea-reason">
              <textarea id="rea-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={textareaCls} />
            </Field>
          </div>
        );
      } else {
        title = "Release to queue";
        description = "The assignment engine will offer this ticket to the next best representative (excluding you).";
        canSubmit = reason.trim().length >= 3;
        submitLabel = "Release ticket";
        body = (
          <Field label="Reason" htmlFor="rel-reason">
            <textarea id="rel-reason" data-autofocus value={reason} onChange={(e) => setReason(e.target.value)} className={textareaCls} />
          </Field>
        );
      }
      submit = () =>
        run(async () => {
          onUpdated(await post("/reassign", { reason: reason.trim(), ...(isSupervisor && staffId ? { staffId } : {}) }));
          toast.success(isSupervisor ? "Ticket reassigned" : "Ticket released to queue");
        });
      break;
  }

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={title}
      description={description}
      size={kind === "reassign" && isSupervisor ? "lg" : "md"}
      footer={
        <>
          <button type="button" className={btnSecondary} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={cx(btnPrimary, focusRing)} onClick={submit} disabled={!canSubmit || busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {submitLabel}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit && !busy) submit();
        }}
      >
        <p className="text-[11px] text-[#8a8a8a] mb-3 font-mono">
          {ticket.referenceNumber} · {ticket.title}
        </p>
        {body}
      </form>
    </Modal>
  );
}
