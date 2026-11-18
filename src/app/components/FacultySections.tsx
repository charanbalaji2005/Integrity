import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { GraduationCap, LoaderCircle, Users } from "lucide-react";
import { toast } from "sonner";
import { useProfile } from "../context/ProfileContext";
import { apiFetch } from "../utils/api-client";
import { MAX_FACULTY_SECTIONS, SectionPicker, parseSectionList } from "./SectionPicker";

/**
 * Faculty section assignment UI.
 *  - <FacultySectionsGate/>: blocking first-time prompt when a faculty member
 *    has no sections yet (they would otherwise see no students).
 *  - <FacultySectionsChip/>: header chip showing the sections, with an editor.
 * The backend validates the same 1–3 rule and scopes every student list.
 */

function useFacultySections() {
  const { profile, refreshProfile } = useProfile();
  const isFaculty = profile?.role === "faculty";
  const sections = parseSectionList(profile?.section);
  return { profile, isFaculty, sections, refreshProfile };
}

function SectionsDialog({
  open,
  required,
  initial,
  department,
  onClose,
}: {
  open: boolean;
  required: boolean;
  initial: string[];
  department?: string | null;
  onClose: () => void;
}) {
  const [value, setValue] = useState<string[]>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValue(initial);
      setError(null);
    }
    // initial is derived from the profile string; compare by content
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial.join(",")]);

  const save = async () => {
    if (value.length === 0 || value.length > MAX_FACULTY_SECTIONS) {
      setError(`Select 1 to ${MAX_FACULTY_SECTIONS} sections.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/api/profile", { method: "PUT", body: JSON.stringify({ sections: value }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) throw new Error(data.message || `Could not save sections (HTTP ${res.status}).`);
      toast.success(`Sections saved: ${value.join(", ")}`);
      // Student lists and the live-monitoring connection are scoped to these
      // sections server-side; reload so every view picks up the new scope.
      setTimeout(() => window.location.reload(), 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save sections.");
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => !required && !saving && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="faculty-sections-title"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6"
          >
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <GraduationCap className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h2 id="faculty-sections-title" className="text-base font-bold text-zinc-900">
                  {required ? "Which sections do you teach?" : "Your sections"}
                </h2>
                <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
                  Choose up to {MAX_FACULTY_SECTIONS} sections. You'll only see students, exam attempts, live
                  monitoring and chat requests from these sections.
                </p>
              </div>
            </div>

            <div className="mt-5">
              <SectionPicker value={value} onChange={setValue} department={department} invalid={!!error && value.length === 0} />
            </div>

            {error && (
              <p role="alert" className="mt-3 text-xs font-semibold text-rose-600">
                {error}
              </p>
            )}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {!required && (
                <button
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                  className="h-10 rounded-xl px-4 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                onClick={save}
                disabled={saving || value.length === 0}
                className="flex h-10 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {saving && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
                {saving ? "Saving…" : required ? "Save & continue" : "Save sections"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Blocking first-run prompt for faculty without sections. */
export function FacultySectionsGate() {
  const { profile, isFaculty, sections } = useFacultySections();
  const needsSetup = !!profile && isFaculty && sections.length === 0;
  return <SectionsDialog open={needsSetup} required initial={[]} department={profile?.department} onClose={() => {}} />;
}

/** Header chip listing the faculty member's sections, with an editor. */
export function FacultySectionsChip() {
  const { profile, isFaculty, sections } = useFacultySections();
  const [open, setOpen] = useState(false);
  if (!isFaculty || sections.length === 0) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Change the sections you teach"
        className="hidden items-center gap-1.5 rounded-full border border-[#dedede] bg-white px-3 py-1 text-[12px] font-semibold text-zinc-700 transition hover:bg-zinc-50 sm:inline-flex"
      >
        <Users className="size-3.5 text-indigo-600" aria-hidden="true" />
        {sections.join(" · ")}
      </button>
      <SectionsDialog open={open} required={false} initial={sections} department={profile?.department} onClose={() => setOpen(false)} />
    </>
  );
}
