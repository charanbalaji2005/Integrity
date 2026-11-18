import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Search, UserPlus, Users } from "lucide-react";
import { errorMessage, supportApi } from "./api";
import { AGENT_EVENTS, TICKET_EVENTS, useSocketEvent } from "./socket";
import type { Availability, StaffProfile, WorkingHours } from "./types";
import { AVAILABILITY_LABEL, AVAILABILITY_OPTIONS, SUPPORT_CATEGORIES, categoryLabel } from "./types";
import {
  AvailabilityDot,
  EmptyState,
  ErrorBlock,
  Field,
  Modal,
  SectionHeader,
  SlideOver,
  Spinner,
  Toggle,
  WorkloadBar,
  btnPrimary,
  btnSecondary,
  cardCls,
  cx,
  focusRing,
  formatMinutes,
  inputCls,
  timeAgo,
} from "./ui";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function StaffView() {
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<StaffProfile | null>(null);
  const [adding, setAdding] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStaff(await supportApi<StaffProfile[]>("/staff"));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const upsert = (p: StaffProfile) =>
    setStaff((list) => {
      const i = list.findIndex((s) => s.id === p.id);
      if (i === -1) return [...list, p];
      const next = [...list];
      next[i] = p;
      return next;
    });

  useSocketEvent(AGENT_EVENTS, (payload: { staff?: StaffProfile }) => {
    if (payload?.staff) upsert(payload.staff);
  });
  // Workload numbers change with assignments.
  useSocketEvent(TICKET_EVENTS, () => {
    void load();
  });

  const toggleAssignments = async (s: StaffProfile, v: boolean) => {
    setToggling(s.id);
    try {
      upsert(await supportApi<StaffProfile>(`/staff/${s.id}`, { method: "PUT", body: { assignmentsEnabled: v } }));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setToggling(null);
    }
  };

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = term ? staff.filter((s) => s.name.toLowerCase().includes(term) || s.email.toLowerCase().includes(term)) : staff;
    return [...list].sort((a, b) => Number(b.isOnline) - Number(a.isOnline) || b.workloadPercent - a.workloadPercent);
  }, [staff, q]);

  const online = staff.filter((s) => s.isOnline).length;
  const available = staff.filter((s) => s.isOnline && s.availability === "available").length;
  const totalActive = staff.reduce((n, s) => n + s.activeTickets, 0);
  const totalCap = staff.reduce((n, s) => n + s.maxActiveTickets, 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5 overflow-y-auto h-full">
      <SectionHeader
        title="Support staff"
        description="Live workload, availability and routing settings for every representative."
        actions={
          <button type="button" className={btnPrimary} onClick={() => setAdding(true)}>
            <UserPlus className="size-4" /> Add representative
          </button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat label="Representatives" value={String(staff.length)} />
        <MiniStat label="Online" value={String(online)} />
        <MiniStat label="Available now" value={String(available)} />
        <MiniStat label="Team capacity used" value={totalCap ? `${totalActive}/${totalCap}` : "—"} />
      </div>

      <div className={cx(cardCls, "overflow-hidden")}>
        <div className="p-3 sm:p-4 border-b border-[#dedede]/60">
          <div className="relative max-w-sm">
            <Search className="size-3.5 text-[#a2a2a2] absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email" aria-label="Search staff" className={cx(inputCls, "pl-8 text-xs")} />
          </div>
        </div>
        {error ? (
          <ErrorBlock message={error} onRetry={load} />
        ) : loading ? (
          <Spinner label="Loading staff" />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Users} title={staff.length ? "No matches" : "No representatives yet"} description={staff.length ? undefined : "Add a representative by email to start routing tickets."} />
        ) : (
          <ul className="divide-y divide-[#dedede]/60">
            {filtered.map((s) => (
              <li key={s.id} className="p-3 sm:p-4 grid grid-cols-1 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] gap-3 md:gap-5 md:items-center">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative shrink-0">
                    <div className="size-10 rounded-full bg-[#1a1917] text-white flex items-center justify-center font-bold text-sm">{s.name.charAt(0).toUpperCase()}</div>
                    <AvailabilityDot availability={s.availability} isOnline={s.isOnline} className="absolute -bottom-0.5 -right-0.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[#1a1917] truncate">{s.name}</span>
                      {s.supportRole === "supervisor" && <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-[#1a1917] text-white">Supervisor</span>}
                    </div>
                    <p className="text-[11px] text-[#8a8a8a] truncate">{s.email}</p>
                    <p className="text-[11px] text-[#676767]">
                      {s.isOnline ? AVAILABILITY_LABEL[s.availability] : `Offline${s.lastSeenAt ? ` · seen ${timeAgo(s.lastSeenAt)}` : ""}`}
                    </p>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-[#676767]">
                      <strong className="text-[#1a1917]">{s.activeTickets}</strong> active · {s.pendingTickets} pending
                    </span>
                    <span className="text-[#8a8a8a] tabular-nums">max {s.maxActiveTickets}</span>
                  </div>
                  <WorkloadBar value={s.activeTickets} max={s.maxActiveTickets} />
                  <p className="text-[10.5px] text-[#8a8a8a] mt-1">
                    Avg resolution {formatMinutes(s.avgResolutionMinutes)} · {s.resolvedCount} resolved
                  </p>
                </div>

                <div className="flex flex-wrap gap-1">
                  {s.expertise.length === 0 ? (
                    <span className="text-[11px] text-[#a2a2a2]">No expertise set</span>
                  ) : (
                    s.expertise.map((e) => (
                      <span key={e} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-[#f1f1f1] text-[#676767] border border-[#dedede]">
                        {categoryLabel(e)}
                      </span>
                    ))
                  )}
                </div>

                <div className="flex items-center gap-2 justify-between md:justify-end">
                  <span className="flex items-center gap-1 text-[11px] text-[#676767]">
                    {toggling === s.id ? <Loader2 className="size-4 animate-spin" /> : <Toggle checked={s.assignmentsEnabled} onChange={(v) => toggleAssignments(s, v)} label={`Automatic assignments for ${s.name}`} />}
                    <span className="hidden lg:inline">Assignments</span>
                  </span>
                  <button type="button" className={btnSecondary} onClick={() => setEditing(s)} aria-label={`Edit ${s.name}`}>
                    <Pencil className="size-3.5" /> Edit
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <StaffEditor staff={editing} onClose={() => setEditing(null)} onSaved={(p) => { upsert(p); setEditing(null); }} />
      <AddStaffDialog open={adding} onClose={() => setAdding(false)} onAdded={(p) => { upsert(p); setAdding(false); }} />
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className={cx(cardCls, "p-4")}>
      <span className="text-[10.5px] font-bold text-[#8a8a8a] uppercase tracking-wider">{label}</span>
      <div className="text-2xl font-extrabold text-[#1a1917] mt-1 tabular-nums">{value}</div>
    </div>
  );
}

function ExpertisePicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset>
      <legend className="text-xs font-bold text-[#1a1917] mb-2">Expertise</legend>
      <div className="flex flex-wrap gap-1.5">
        {SUPPORT_CATEGORIES.map((c) => {
          const on = value.includes(c.key);
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((v) => v !== c.key) : [...value, c.key])}
              className={cx(
                "min-h-9 px-2.5 rounded-lg border text-[11px] font-semibold cursor-pointer",
                focusRing,
                on ? "bg-[#1a1917] text-white border-[#1a1917]" : "bg-white text-[#676767] border-[#dedede] hover:bg-[#f6f6f6]"
              )}
            >
              {c.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function defaultHours(): WorkingHours {
  let tz = "UTC";
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    /* ignore */
  }
  return { timezone: tz, days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" };
}

function StaffEditor({ staff, onClose, onSaved }: { staff: StaffProfile | null; onClose: () => void; onSaved: (p: StaffProfile) => void }) {
  const [role, setRole] = useState<"agent" | "supervisor">("agent");
  const [cap, setCap] = useState(5);
  const [expertise, setExpertise] = useState<string[]>([]);
  const [hoursOn, setHoursOn] = useState(false);
  const [hours, setHours] = useState<WorkingHours>(defaultHours());
  const [availability, setAvailability] = useState<Availability>("available");
  const [assignments, setAssignments] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!staff) return;
    setRole(staff.supportRole);
    setCap(staff.maxActiveTickets);
    setExpertise(staff.expertise);
    setHoursOn(!!staff.workingHours);
    setHours(staff.workingHours ?? defaultHours());
    setAvailability(staff.availability === "unavailable" ? "offline" : staff.availability);
    setAssignments(staff.assignmentsEnabled);
  }, [staff]);

  const save = async () => {
    if (!staff) return;
    setSaving(true);
    try {
      const p = await supportApi<StaffProfile>(`/staff/${staff.id}`, {
        method: "PUT",
        body: { supportRole: role, maxActiveTickets: cap, expertise, workingHours: hoursOn ? hours : null, assignmentsEnabled: assignments, availability },
      });
      toast.success(`${p.name} updated`);
      onSaved(p);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SlideOver open={!!staff} onClose={onClose} title={staff ? `Edit ${staff.name}` : "Edit"} widthCls="w-full sm:w-[480px]">
      {staff && (
        <div className="p-5 space-y-5">
          <Field label="Support role" htmlFor="ed-role">
            <select id="ed-role" value={role} onChange={(e) => setRole(e.target.value as "agent" | "supervisor")} className={inputCls}>
              <option value="agent">Agent</option>
              <option value="supervisor">Supervisor</option>
            </select>
          </Field>
          <Field label="Maximum active tickets" htmlFor="ed-cap" hint="Capacity used by the assignment engine.">
            <input id="ed-cap" type="number" min={1} max={50} value={cap} onChange={(e) => setCap(Math.max(1, Number(e.target.value) || 1))} className={inputCls} />
          </Field>
          <Field label="Availability" htmlFor="ed-av">
            <select id="ed-av" value={availability} onChange={(e) => setAvailability(e.target.value as Availability)} className={inputCls}>
              {AVAILABILITY_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#1a1917]">Automatic assignments enabled</span>
            <Toggle checked={assignments} onChange={setAssignments} label="Automatic assignments enabled" />
          </div>
          <ExpertisePicker value={expertise} onChange={setExpertise} />
          <fieldset className="space-y-3">
            <div className="flex items-center justify-between">
              <legend className="text-xs font-bold text-[#1a1917]">Working hours</legend>
              <Toggle checked={hoursOn} onChange={setHoursOn} label="Set working hours" />
            </div>
            {hoursOn ? (
              <>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Working days">
                  {DAYS.map((d, i) => {
                    const on = hours.days.includes(i);
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setHours({ ...hours, days: on ? hours.days.filter((x) => x !== i) : [...hours.days, i].sort() })}
                        className={cx("min-h-11 min-w-11 rounded-lg border text-[11px] font-bold cursor-pointer", focusRing, on ? "bg-[#1a1917] text-white border-[#1a1917]" : "bg-white text-[#676767] border-[#dedede]")}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start" htmlFor="ed-start">
                    <input id="ed-start" type="time" value={hours.start} onChange={(e) => setHours({ ...hours, start: e.target.value })} className={inputCls} />
                  </Field>
                  <Field label="End" htmlFor="ed-end">
                    <input id="ed-end" type="time" value={hours.end} onChange={(e) => setHours({ ...hours, end: e.target.value })} className={inputCls} />
                  </Field>
                </div>
                <Field label="Timezone" htmlFor="ed-tz" hint="IANA name, e.g. Asia/Kolkata">
                  <input id="ed-tz" value={hours.timezone} onChange={(e) => setHours({ ...hours, timezone: e.target.value })} className={inputCls} />
                </Field>
              </>
            ) : (
              <p className="text-[11px] text-[#8a8a8a]">No working hours — eligible whenever available.</p>
            )}
          </fieldset>
          <div className="flex justify-end gap-2 pt-2 border-t border-[#dedede]/60">
            <button type="button" className={btnSecondary} onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="button" className={btnPrimary} onClick={save} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />} Save changes
            </button>
          </div>
        </div>
      )}
    </SlideOver>
  );
}

function AddStaffDialog({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (p: StaffProfile) => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"agent" | "supervisor">("agent");
  const [cap, setCap] = useState(5);
  const [expertise, setExpertise] = useState<string[]>([]);
  const [promote, setPromote] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setEmail("");
      setRole("agent");
      setCap(5);
      setExpertise([]);
      setPromote(false);
    }
  }, [open]);

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const submit = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const p = await supportApi<StaffProfile>("/staff", {
        method: "POST",
        body: { email: email.trim(), supportRole: role, maxActiveTickets: cap, expertise, ...(promote ? { promote: true } : {}) },
      });
      toast.success(`${p.name} added to support staff`);
      onAdded(p);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title="Add representative"
      description="The user must already have an IntegrityOS account."
      size="lg"
      footer={
        <>
          <button type="button" className={btnSecondary} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className={btnPrimary} onClick={submit} disabled={!valid || saving}>
            {saving && <Loader2 className="size-4 animate-spin" />} Add representative
          </button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Email" htmlFor="add-email">
          <input id="add-email" data-autofocus type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="name@institution.edu" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Support role" htmlFor="add-role">
            <select id="add-role" value={role} onChange={(e) => setRole(e.target.value as "agent" | "supervisor")} className={inputCls}>
              <option value="agent">Agent</option>
              <option value="supervisor">Supervisor</option>
            </select>
          </Field>
          <Field label="Max active tickets" htmlFor="add-cap">
            <input id="add-cap" type="number" min={1} max={50} value={cap} onChange={(e) => setCap(Math.max(1, Number(e.target.value) || 1))} className={inputCls} />
          </Field>
        </div>
        <ExpertisePicker value={expertise} onChange={setExpertise} />
        <label className="flex items-start gap-3 p-3 rounded-xl border border-amber-200 bg-amber-50 cursor-pointer">
          <input type="checkbox" checked={promote} onChange={(e) => setPromote(e.target.checked)} className="mt-0.5 size-4 accent-black" />
          <span className="text-xs text-amber-900">
            <strong>Promote to support role.</strong> If this user is not already a support representative, change their account role to support. Leave unchecked to only add existing support/admin users.
          </span>
        </label>
      </form>
    </Modal>
  );
}
