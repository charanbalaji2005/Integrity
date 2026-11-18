import React, { useMemo, useRef, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import {
  AlertCircle,
  BookMarked,
  CheckCircle2,
  ChevronDown,
  Eye,
  FileUp,
  GraduationCap,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "../../../components/ui/checkbox";
import { Progress } from "../../../components/ui/progress";
import { Skeleton } from "../../../components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../components/ui/alert-dialog";
import { cn } from "../../../components/ui/utils";
import { formatBytes, MaterialIcon } from "../../../components/assessment/ExamMaterialsPanel";
import { openProtectedFile } from "../../../components/assessment/protected-files";
import type { BuilderForm } from "./builder-model";
import {
  checkFile,
  coursesApi,
  FILE_RULES,
  kindForFile,
  uploadWithProgress,
  type CourseDetail,
  type CourseMaterial,
  type Syllabus,
} from "./builder-api";
import { btn, Field, inputCls, Pill, SectionCard, textareaCls, ToggleRow } from "./ui-kit";

const NONE = "__none__";
const KIND_LABEL: Record<CourseMaterial["kind"], string> = {
  pdf: "PDF document",
  notes: "Lecture notes",
  slides: "Presentation",
  reference: "Reference document",
  video: "Video lecture",
  link: "External resource",
};

const STATUS_PILL: Record<Syllabus["status"], { tone: "emerald" | "amber" | "rose" | "sky"; label: string }> = {
  ready: { tone: "emerald", label: "Processed" },
  processing: { tone: "sky", label: "Processing" },
  failed: { tone: "rose", label: "Needs manual units" },
  manual: { tone: "amber", label: "Manual" },
};

export function SyllabusSection({
  course,
  courseLoading,
  courseError,
  reloadCourse,
}: {
  course: CourseDetail | null;
  courseLoading: boolean;
  courseError: string | null;
  reloadCourse: () => Promise<CourseDetail | null>;
}) {
  const { control } = useFormContext<BuilderForm>();
  const courseId = useWatch({ control, name: "courseId" });

  let body: React.ReactNode;
  if (!courseId) {
    body = (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/60 px-6 py-10 text-center">
        <GraduationCap className="size-6 text-zinc-400" />
        <div>
          <p className="text-[13.5px] font-semibold text-zinc-800">Select a course to link its syllabus</p>
          <p className="mt-0.5 text-[12px] text-zinc-500">Choose or create a course in Assessment Information. Its syllabus and materials load here.</p>
        </div>
        <button type="button" className={btn.secondary} onClick={() => document.getElementById("ab-course")?.focus()}>
          Choose course
        </button>
      </div>
    );
  } else if (courseLoading && !course) {
    body = (
      <div className="space-y-3" aria-busy="true" aria-label="Loading course">
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    );
  } else if (courseError || !course) {
    body = (
      <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[12.5px] text-rose-700">
        <span className="flex items-center gap-2"><AlertCircle className="size-4" /> {courseError || "Could not load the course."}</span>
        <button type="button" className={btn.secondary} onClick={() => void reloadCourse()}>
          <RefreshCw className="size-3.5" /> Retry
        </button>
      </div>
    );
  } else {
    body = (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl bg-zinc-50 px-4 py-3 text-[12.5px]">
          <span className="font-semibold text-zinc-900">{course.code} — {course.name}</span>
          <span className="text-zinc-500">Subject: <span className="font-medium text-zinc-800">{course.subject || "Not set"}</span></span>
          {course.department && <span className="text-zinc-500">Department: <span className="font-medium text-zinc-800">{course.department}</span></span>}
          {courseLoading && <Loader2 className="size-3.5 animate-spin text-zinc-400" aria-label="Refreshing" />}
        </div>
        <SyllabusPicker course={course} reloadCourse={reloadCourse} />
        <MaterialsManager course={course} reloadCourse={reloadCourse} />
        <AccessSettings course={course} />
      </div>
    );
  }

  return (
    <SectionCard
      id="section-syllabus"
      step={2}
      icon={BookMarked}
      title="Syllabus & Learning Materials"
      description="Select the syllabus units and learning resources associated with this assessment."
    >
      {body}
    </SectionCard>
  );
}

/* ───────────────────────── syllabus & units ───────────────────────── */

function SyllabusPicker({ course, reloadCourse }: { course: CourseDetail; reloadCourse: () => Promise<CourseDetail | null> }) {
  const { control, setValue, getValues } = useFormContext<BuilderForm>();
  const syllabusId = useWatch({ control, name: "syllabusId" });
  const topicIds = useWatch({ control, name: "topicIds" });
  const fileRef = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<{ name: string; pct: number; abort: () => void } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [creatingManual, setCreatingManual] = useState(false);

  const syllabus = course.syllabi.find((s) => s.id === syllabusId) ?? null;
  const selected = useMemo(() => new Set(topicIds), [topicIds]);

  const selectSyllabus = (id: string | null) => {
    setValue("syllabusId", id, { shouldDirty: true });
    // Keep only topics that belong to the newly selected syllabus.
    const s = course.syllabi.find((x) => x.id === id);
    const valid = new Set(s?.units.flatMap((u) => u.topics.map((t) => t.id)) ?? []);
    setValue("topicIds", getValues("topicIds").filter((t) => valid.has(t)), { shouldDirty: true });
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const problem = checkFile(file, FILE_RULES.syllabus);
    if (problem) {
      toast.error(problem);
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    const job = uploadWithProgress<{ syllabusId: string; duplicate: boolean }>(`/api/courses/${course.id}/syllabi`, fd, (pct) =>
      setUpload((u) => (u ? { ...u, pct } : u)),
    );
    setUpload({ name: file.name, pct: 0, abort: job.abort });
    try {
      const { data, message } = await job.promise;
      await reloadCourse();
      selectSyllabus(data.syllabusId);
      toast.success(message || "Syllabus uploaded");
    } catch (err: any) {
      if (err.message !== "Upload cancelled.") toast.error(err.message);
    } finally {
      setUpload(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const createManual = async () => {
    setCreatingManual(true);
    try {
      const s = await coursesApi.createManualSyllabus(course.id, `${course.code} syllabus`);
      await reloadCourse();
      selectSyllabus(s.id);
      setEditOpen(true);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreatingManual(false);
    }
  };

  const removeSyllabus = async () => {
    if (!syllabus) return;
    try {
      await coursesApi.deleteSyllabus(syllabus.id);
      selectSyllabus(null);
      await reloadCourse();
      toast.success("Syllabus deleted");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const toggleTopic = (id: string, on: boolean) => {
    const next = on ? [...new Set([...topicIds, id])] : topicIds.filter((t) => t !== id);
    setValue("topicIds", next, { shouldDirty: true });
  };
  const toggleUnit = (ids: string[], on: boolean) => {
    const set = new Set(topicIds);
    ids.forEach((id) => (on ? set.add(id) : set.delete(id)));
    setValue("topicIds", [...set], { shouldDirty: true });
  };

  const units = syllabus?.units ?? [];
  const selectedUnits = units.filter((u) => u.topics.some((t) => selected.has(t.id)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Official syllabus" htmlFor="ab-syllabus" className="min-w-56 flex-1">
          <Select value={syllabusId ?? NONE} onValueChange={(v) => selectSyllabus(v === NONE ? null : v)}>
            <SelectTrigger id="ab-syllabus" className="h-9 w-full rounded-lg border-zinc-200 bg-white text-[13.5px] shadow-none">
              <SelectValue placeholder="Select a syllabus" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{course.syllabi.length ? "No syllabus" : "No syllabus uploaded yet"}</SelectItem>
              {course.syllabi.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.title} · {s.units.length} unit{s.units.length === 1 ? "" : "s"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <input ref={fileRef} type="file" accept={FILE_RULES.syllabus.accept} className="sr-only" aria-label="Upload syllabus file" onChange={(e) => void onFile(e.target.files?.[0])} />
        <button type="button" className={btn.secondary} onClick={() => fileRef.current?.click()} disabled={!!upload}>
          <FileUp className="size-4" /> Upload syllabus
        </button>
        <button type="button" className={btn.ghost} onClick={createManual} disabled={creatingManual}>
          {creatingManual ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Enter manually
        </button>
      </div>
      <p className="-mt-2 text-[11.5px] text-zinc-500">{FILE_RULES.syllabus.label}. Units and topics are extracted automatically; uploading the same file again reuses it.</p>

      {upload && (
        <div className="rounded-xl border border-zinc-200 p-3" aria-live="polite">
          <div className="mb-2 flex items-center justify-between text-[12px]">
            <span className="flex items-center gap-2 font-medium text-zinc-800">
              <Loader2 className="size-3.5 animate-spin" /> {upload.pct < 100 ? `Uploading ${upload.name}` : `Extracting units from ${upload.name}…`}
            </span>
            {upload.pct < 100 && (
              <button type="button" className="text-zinc-500 hover:text-zinc-900" onClick={upload.abort} aria-label="Cancel upload">
                <X className="size-4" />
              </button>
            )}
          </div>
          <Progress value={upload.pct} className="h-1.5" />
        </div>
      )}

      {syllabus && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <Pill tone={STATUS_PILL[syllabus.status].tone}>
                {syllabus.status === "ready" ? <CheckCircle2 className="size-3" /> : <AlertCircle className="size-3" />}
                {STATUS_PILL[syllabus.status].label}
              </Pill>
              {syllabus.statusMessage && <span className="text-zinc-500">{syllabus.statusMessage}</span>}
            </div>
            <div className="flex items-center gap-1">
              {syllabus.file && (
                <button
                  type="button"
                  className={btn.ghost}
                  onClick={() =>
                    openProtectedFile(`/api/courses/syllabi/${syllabus.id}/file`, syllabus.file!.fileName).catch((e) => toast.error(e.message))
                  }
                >
                  <Eye className="size-3.5" /> View document
                </button>
              )}
              <button type="button" className={btn.ghost} onClick={() => setEditOpen(true)}>
                <Pencil className="size-3.5" /> Edit units
              </button>
              <button type="button" className={btn.danger} onClick={() => setConfirmDelete(true)} aria-label="Delete syllabus">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>

          {units.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-[12.5px] text-zinc-500">
              No units yet.{" "}
              <button type="button" className="font-semibold text-zinc-900 underline-offset-2 hover:underline" onClick={() => setEditOpen(true)}>
                Add units and topics
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-[12px]">
                <span className="text-zinc-600">
                  <span className="font-semibold text-zinc-900">{selected.size}</span> topic{selected.size === 1 ? "" : "s"} across{" "}
                  <span className="font-semibold text-zinc-900">{selectedUnits.length}</span> of {units.length} units selected
                </span>
                <div className="flex gap-1">
                  <button type="button" className={btn.ghost} onClick={() => toggleUnit(units.flatMap((u) => u.topics.map((t) => t.id)), true)}>
                    Select all
                  </button>
                  <button type="button" className={btn.ghost} onClick={() => setValue("topicIds", [], { shouldDirty: true })} disabled={selected.size === 0}>
                    Clear
                  </button>
                </div>
              </div>
              <ul className="space-y-2">
                {units.map((u) => (
                  <UnitCard key={u.id} unit={u} selected={selected} onTopic={toggleTopic} onUnit={toggleUnit} />
                ))}
              </ul>
              {selectedUnits.length > 0 && (
                <div className="flex flex-wrap gap-1.5" aria-label="Selected units">
                  {selectedUnits.map((u) => (
                    <Pill key={u.id} tone="violet">
                      Unit {u.number}: {u.title} · {u.topics.filter((t) => selected.has(t.id)).length}/{u.topics.length}
                    </Pill>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {syllabus && (
        <EditUnitsDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          syllabus={syllabus}
          onSaved={async () => {
            const fresh = await reloadCourse();
            const s = fresh?.syllabi.find((x) => x.id === syllabus.id);
            const valid = new Set(s?.units.flatMap((u) => u.topics.map((t) => t.id)) ?? []);
            setValue("topicIds", getValues("topicIds").filter((t) => valid.has(t)), { shouldDirty: true });
          }}
        />
      )}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this syllabus?</AlertDialogTitle>
            <AlertDialogDescription>
              Its units and topics are removed from the course for every assessment. Questions mapped to these topics lose their mapping. Syllabi used by published assessments cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={() => void removeSyllabus()}>
              Delete syllabus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function UnitCard({
  unit,
  selected,
  onTopic,
  onUnit,
}: {
  unit: Syllabus["units"][number];
  selected: Set<string>;
  onTopic: (id: string, on: boolean) => void;
  onUnit: (ids: string[], on: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const ids = unit.topics.map((t) => t.id);
  const count = ids.filter((id) => selected.has(id)).length;
  const state: boolean | "indeterminate" = count === 0 ? false : count === ids.length ? true : "indeterminate";
  const panelId = `unit-panel-${unit.id}`;
  return (
    <li className={cn("rounded-xl border transition", count > 0 ? "border-zinc-300 bg-white" : "border-zinc-200 bg-white")}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <Checkbox
          checked={state}
          disabled={ids.length === 0}
          onCheckedChange={(v) => onUnit(ids, v === true)}
          aria-label={`Select all topics in unit ${unit.number}`}
        />
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={panelId} className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left">
          <span className="min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Unit {unit.number}</span>
            <span className="block truncate text-[13px] font-semibold text-zinc-900">{unit.title}</span>
          </span>
          <span className="flex shrink-0 items-center gap-2 text-[11.5px] text-zinc-500">
            {count}/{ids.length}
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
          </span>
        </button>
      </div>
      {open && (
        <div id={panelId} className="border-t border-zinc-100 px-3 py-2">
          {unit.topics.length === 0 ? (
            <p className="py-1 text-[12px] text-zinc-500">No topics in this unit.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              {unit.topics.map((t) => (
                <li key={t.id}>
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-md px-1 py-1.5 text-[12.5px] text-zinc-700 hover:bg-zinc-50">
                    <Checkbox className="mt-0.5" checked={selected.has(t.id)} onCheckedChange={(v) => onTopic(t.id, v === true)} />
                    <span className="break-words">{t.title}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

interface DraftUnit {
  key: string;
  id?: string;
  title: string;
  topics: { key: string; id?: string; title: string }[];
}

function EditUnitsDialog({
  open,
  onOpenChange,
  syllabus,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  syllabus: Syllabus;
  onSaved: () => Promise<void>;
}) {
  const [units, setUnits] = useState<DraftUnit[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const k = () => Math.random().toString(36).slice(2);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setUnits(
      syllabus.units.map((u) => ({
        key: u.id,
        id: u.id,
        title: u.title,
        topics: u.topics.map((t) => ({ key: t.id, id: t.id, title: t.title })),
      })),
    );
  }, [open, syllabus]);

  const patch = (i: number, fn: (u: DraftUnit) => DraftUnit) => setUnits((list) => list.map((u, j) => (j === i ? fn(u) : u)));

  const save = async () => {
    const cleaned = units
      .map((u) => ({ ...u, title: u.title.trim(), topics: u.topics.map((t) => ({ ...t, title: t.title.trim() })).filter((t) => t.title) }))
      .filter((u) => u.title || u.topics.length);
    const bad = cleaned.find((u) => u.title.length < 2 || u.topics.some((t) => t.title.length < 2));
    if (bad) {
      setError("Every unit needs a title, and topics need at least 2 characters.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await coursesApi.saveStructure(
        syllabus.id,
        cleaned.map((u) => ({ id: u.id, title: u.title, topics: u.topics.map((t) => ({ id: t.id, title: t.title })) })),
      );
      await onSaved();
      toast.success("Syllabus units saved");
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit units & topics</DialogTitle>
          <DialogDescription>Changes apply to the course syllabus and are shared with other assessments that use it. Existing topic mappings are kept.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
          {units.map((u, i) => (
            <div key={u.key} className="rounded-xl border border-zinc-200 p-3">
              <div className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-[11px] font-semibold uppercase text-zinc-400">Unit {i + 1}</span>
                <input
                  value={u.title}
                  onChange={(e) => patch(i, (x) => ({ ...x, title: e.target.value }))}
                  placeholder="Unit title"
                  aria-label={`Unit ${i + 1} title`}
                  className={inputCls}
                />
                <button type="button" className={btn.danger} onClick={() => setUnits((l) => l.filter((_, j) => j !== i))} aria-label={`Remove unit ${i + 1}`}>
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              <ul className="mt-2 space-y-1.5 pl-16">
                {u.topics.map((t, j) => (
                  <li key={t.key} className="flex items-center gap-2">
                    <input
                      value={t.title}
                      onChange={(e) => patch(i, (x) => ({ ...x, topics: x.topics.map((tt, jj) => (jj === j ? { ...tt, title: e.target.value } : tt)) }))}
                      placeholder="Topic"
                      aria-label={`Unit ${i + 1} topic ${j + 1}`}
                      className={cn(inputCls, "h-8 text-[12.5px]")}
                    />
                    <button type="button" className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-rose-600" onClick={() => patch(i, (x) => ({ ...x, topics: x.topics.filter((_, jj) => jj !== j) }))} aria-label="Remove topic">
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
                <li>
                  <button type="button" className={btn.ghost} onClick={() => patch(i, (x) => ({ ...x, topics: [...x.topics, { key: k(), title: "" }] }))}>
                    <Plus className="size-3.5" /> Add topic
                  </button>
                </li>
              </ul>
            </div>
          ))}
          <button type="button" className={cn(btn.secondary, "w-full border-dashed")} onClick={() => setUnits((l) => [...l, { key: k(), title: "", topics: [{ key: k(), title: "" }] }])}>
            <Plus className="size-4" /> Add unit
          </button>
        </div>
        {error && <p role="alert" className="text-[12px] font-medium text-rose-600">{error}</p>}
        <DialogFooter>
          <button type="button" className={btn.secondary} onClick={() => onOpenChange(false)}>Cancel</button>
          <button type="button" className={btn.primary} onClick={save} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />} Save units
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── materials ───────────────────────── */

interface UploadJob {
  key: string;
  name: string;
  pct: number;
  status: "uploading" | "error";
  error?: string;
  abort: () => void;
}

function MaterialsManager({ course, reloadCourse }: { course: CourseDetail; reloadCourse: () => Promise<CourseDetail | null> }) {
  const { control, setValue, getValues } = useFormContext<BuilderForm>();
  const linked = useWatch({ control, name: "materials" });
  const linkedMap = useMemo(() => new Map(linked.map((m) => [m.materialId, m])), [linked]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [linkOpen, setLinkOpen] = useState(false);
  const [editing, setEditing] = useState<CourseMaterial | null>(null);
  const [deleting, setDeleting] = useState<CourseMaterial | null>(null);

  const attach = (materialId: string, on: boolean) => {
    const cur = getValues("materials");
    setValue(
      "materials",
      on ? (cur.some((m) => m.materialId === materialId) ? cur : [...cur, { materialId, permittedInExam: false }]) : cur.filter((m) => m.materialId !== materialId),
      { shouldDirty: true },
    );
  };
  const setPermitted = (materialId: string, permittedInExam: boolean) =>
    setValue("materials", getValues("materials").map((m) => (m.materialId === materialId ? { ...m, permittedInExam } : m)), { shouldDirty: true });

  const uploadFiles = (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      const problem = checkFile(file, FILE_RULES.material);
      if (problem) {
        toast.error(problem);
        continue;
      }
      const key = `${file.name}-${Date.now()}-${Math.random()}`;
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kindForFile(file.name));
      fd.append("title", file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || file.name);
      const job = uploadWithProgress<CourseMaterial>(`/api/courses/${course.id}/materials`, fd, (pct) =>
        setJobs((js) => js.map((j) => (j.key === key ? { ...j, pct } : j))),
      );
      setJobs((js) => [...js, { key, name: file.name, pct: 0, status: "uploading", abort: job.abort }]);
      job.promise
        .then(async ({ data, message }) => {
          setJobs((js) => js.filter((j) => j.key !== key));
          await reloadCourse();
          attach(data.id, true);
          toast.success(message || `${file.name} uploaded`);
        })
        .catch((err) => setJobs((js) => js.map((j) => (j.key === key ? { ...j, status: "error", error: err.message } : j))));
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const replaceFile = (m: CourseMaterial, file: File | undefined) => {
    if (!file) return;
    const problem = checkFile(file, FILE_RULES.material);
    if (problem) return toast.error(problem);
    const fd = new FormData();
    fd.append("file", file);
    const key = `replace-${m.id}`;
    const job = uploadWithProgress<CourseMaterial>(`/api/courses/materials/${m.id}`, fd, (pct) => setJobs((js) => js.map((j) => (j.key === key ? { ...j, pct } : j))), "PATCH");
    setJobs((js) => [...js, { key, name: `Replacing ${m.title}`, pct: 0, status: "uploading", abort: job.abort }]);
    job.promise
      .then(async () => {
        setJobs((js) => js.filter((j) => j.key !== key));
        await reloadCourse();
        toast.success("File replaced");
      })
      .catch((err) => setJobs((js) => js.map((j) => (j.key === key ? { ...j, status: "error", error: err.message } : j))));
  };

  const remove = async (m: CourseMaterial) => {
    try {
      await coursesApi.deleteMaterial(m.id);
      attach(m.id, false);
      await reloadCourse();
      toast.success("Material removed from the course");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-[13.5px] font-semibold text-zinc-900">Learning materials</h3>
          <p className="text-[11.5px] text-zinc-500">The course library is shared; tick the items that belong to this assessment.</p>
        </div>
        <button type="button" className={btn.secondary} onClick={() => setLinkOpen(true)}>
          <Link2 className="size-4" /> Add video or link
        </button>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition",
          drag ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 bg-zinc-50/40",
        )}
      >
        <UploadCloud className="size-6 text-zinc-400" />
        <p className="text-[12.5px] text-zinc-600">
          Drag and drop files here, or{" "}
          <button type="button" className="font-semibold text-zinc-900 underline-offset-2 hover:underline" onClick={() => fileRef.current?.click()}>
            browse files
          </button>
        </p>
        <p className="text-[11px] text-zinc-400">{FILE_RULES.material.label}</p>
        <input ref={fileRef} type="file" multiple accept={FILE_RULES.material.accept} className="sr-only" aria-label="Upload learning materials" onChange={(e) => e.target.files && uploadFiles(e.target.files)} />
      </div>

      {jobs.length > 0 && (
        <ul className="space-y-2" aria-live="polite">
          {jobs.map((j) => (
            <li key={j.key} className="rounded-lg border border-zinc-200 px-3 py-2">
              <div className="flex items-center justify-between gap-2 text-[12px]">
                <span className="truncate font-medium text-zinc-800">{j.name}</span>
                {j.status === "uploading" ? (
                  <button type="button" onClick={j.abort} className="text-zinc-400 hover:text-zinc-800" aria-label={`Cancel ${j.name}`}>
                    <X className="size-3.5" />
                  </button>
                ) : (
                  <button type="button" onClick={() => setJobs((js) => js.filter((x) => x.key !== j.key))} className="text-zinc-400 hover:text-zinc-800" aria-label="Dismiss">
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
              {j.status === "uploading" ? (
                <Progress value={j.pct} className="mt-1.5 h-1" />
              ) : (
                <p className="mt-1 text-[11.5px] text-rose-600">{j.error}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {course.materials.length === 0 ? (
        <p className="rounded-lg bg-zinc-50 px-3 py-3 text-center text-[12px] text-zinc-500">No materials in this course yet.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200">
          {course.materials.map((m) => {
            const link = linkedMap.get(m.id);
            return (
              <li key={m.id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center">
                <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                  <Checkbox className="mt-1" checked={!!link} onCheckedChange={(v) => attach(m.id, v === true)} aria-label={`Attach ${m.title}`} />
                  <MaterialIcon kind={m.kind} className="mt-0.5 size-4 shrink-0 text-zinc-500" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-zinc-900">{m.title}</span>
                    <span className="block truncate text-[11.5px] text-zinc-500">
                      {KIND_LABEL[m.kind]}
                      {m.file && ` · ${m.file.fileName} · ${formatBytes(m.file.sizeBytes)}`}
                      {m.url && ` · ${m.url}`}
                      {m.description && ` · ${m.description}`}
                    </span>
                  </span>
                </label>
                <div className="flex shrink-0 items-center gap-1 pl-7 sm:pl-0">
                  {link && (
                    <label className="mr-1 flex items-center gap-1.5 text-[11.5px] font-medium text-zinc-600" title="Students may open this during the examination">
                      <Checkbox checked={link.permittedInExam} onCheckedChange={(v) => setPermitted(m.id, v === true)} />
                      Permitted in exam
                    </label>
                  )}
                  {m.url ? (
                    <a href={m.url} target="_blank" rel="noopener noreferrer" className={btn.ghost} aria-label={`Open ${m.title}`}>
                      <Eye className="size-3.5" />
                    </a>
                  ) : (
                    <button type="button" className={btn.ghost} aria-label={`Preview ${m.title}`} onClick={() => openProtectedFile(`/api/courses/materials/${m.id}/file`, m.file?.fileName || m.title).catch((e) => toast.error(e.message))}>
                      <Eye className="size-3.5" />
                    </button>
                  )}
                  {!m.url && (
                    <label className={cn(btn.ghost, "cursor-pointer")} aria-label={`Replace file for ${m.title}`} title="Replace file">
                      <RefreshCw className="size-3.5" />
                      <input type="file" accept={FILE_RULES.material.accept} className="sr-only" onChange={(e) => replaceFile(m, e.target.files?.[0])} />
                    </label>
                  )}
                  <button type="button" className={btn.ghost} aria-label={`Edit ${m.title}`} onClick={() => setEditing(m)}>
                    <Pencil className="size-3.5" />
                  </button>
                  <button type="button" className={btn.danger} aria-label={`Delete ${m.title}`} onClick={() => setDeleting(m)}>
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <LinkMaterialDialog open={linkOpen} onOpenChange={setLinkOpen} courseId={course.id} onCreated={async (m) => { await reloadCourse(); attach(m.id, true); }} />
      <EditMaterialDialog material={editing} onClose={() => setEditing(null)} onSaved={async () => { await reloadCourse(); }} />
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.title}” from the course?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes it from the shared course library{deleting?._count.assessments ? ` and from ${deleting._count.assessments} assessment(s) using it` : ""}. To keep it in the library, untick it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={() => deleting && void remove(deleting)}>
              Delete material
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function LinkMaterialDialog({ open, onOpenChange, courseId, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; courseId: string; onCreated: (m: CourseMaterial) => Promise<void> }) {
  const [kind, setKind] = useState<"video" | "link">("video");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^https?:\/\/\S+\.\S+/i.test(url.trim())) return setError("Enter a full http(s) link.");
    if (title.trim().length < 2) return setError("Enter a title.");
    setSaving(true);
    setError(null);
    try {
      const m = await coursesApi.createLinkMaterial(courseId, { kind, title: title.trim(), url: url.trim(), description: description.trim() || undefined });
      await onCreated(m);
      toast.success("Resource added");
      onOpenChange(false);
      setTitle("");
      setUrl("");
      setDescription("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Add video or external resource</DialogTitle>
            <DialogDescription>Links open in a new tab for students who have access.</DialogDescription>
          </DialogHeader>
          <div role="radiogroup" aria-label="Resource type" className="grid grid-cols-2 gap-2">
            {(["video", "link"] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={cn("h-9 rounded-lg border text-[12.5px] font-semibold", kind === k ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 text-zinc-700 hover:bg-zinc-50")}>
                {k === "video" ? "Video lecture" : "External resource"}
              </button>
            ))}
          </div>
          <Field label="Title" htmlFor="lm-title" required>
            <input id="lm-title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="Lecture 4 — AVL rotations" />
          </Field>
          <Field label="URL" htmlFor="lm-url" required>
            <input id="lm-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} className={inputCls} placeholder="https://" />
          </Field>
          <Field label="Description" htmlFor="lm-desc">
            <textarea id="lm-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className={textareaCls} />
          </Field>
          {error && <p role="alert" className="text-[12px] font-medium text-rose-600">{error}</p>}
          <DialogFooter>
            <button type="button" className={btn.secondary} onClick={() => onOpenChange(false)}>Cancel</button>
            <button type="submit" className={btn.primary} disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" />} Add resource</button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditMaterialDialog({ material, onClose, onSaved }: { material: CourseMaterial | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  React.useEffect(() => {
    if (!material) return;
    setTitle(material.title);
    setDescription(material.description ?? "");
    setUrl(material.url ?? "");
    setError(null);
  }, [material]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!material) return;
    if (title.trim().length < 2) return setError("Enter a title.");
    setSaving(true);
    try {
      await coursesApi.updateMaterial(material.id, {
        title: title.trim(),
        description: description.trim() || null,
        ...(material.url ? { url: url.trim() } : {}),
      });
      await onSaved();
      toast.success("Material updated");
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!material} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Edit material</DialogTitle>
            <DialogDescription>Updates the shared course library entry.</DialogDescription>
          </DialogHeader>
          <Field label="Title" htmlFor="em-title" required>
            <input id="em-title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
          </Field>
          {material?.url && (
            <Field label="URL" htmlFor="em-url" required>
              <input id="em-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} className={inputCls} />
            </Field>
          )}
          <Field label="Description" htmlFor="em-desc" hint="Shown to students next to the material.">
            <textarea id="em-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className={textareaCls} />
          </Field>
          {error && <p role="alert" className="text-[12px] font-medium text-rose-600">{error}</p>}
          <DialogFooter>
            <button type="button" className={btn.secondary} onClick={onClose}>Cancel</button>
            <button type="submit" className={btn.primary} disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" />} Save</button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AccessSettings({ course }: { course: CourseDetail }) {
  const { control, register, formState: { errors } } = useFormContext<BuilderForm>();
  const accessible = useWatch({ control, name: "materialsAccessible" });
  const linked = useWatch({ control, name: "materials" });
  const permitted = linked.filter((l) => l.permittedInExam).map((l) => course.materials.find((m) => m.id === l.materialId)).filter((m): m is CourseMaterial => !!m);
  return (
    <div className="rounded-xl border border-zinc-200 p-4">
      <h3 className="text-[13.5px] font-semibold text-zinc-900">Student access</h3>
      <div className="mt-1 divide-y divide-zinc-100">
        <Controller control={control} name="materialsAccessible" render={({ field }) => (
          <ToggleRow id="ab-mat-access" label="Allow students to access attached materials" description="Materials appear on the assessment for enrolled students." checked={field.value} onChange={field.onChange} />
        )} />
        <Controller control={control} name="materialsDownloadable" render={({ field }) => (
          <ToggleRow id="ab-mat-dl" label="Allow downloads" description="Otherwise students can only view materials in the browser." checked={field.value} onChange={field.onChange} disabled={!accessible} />
        )} />
        <Controller control={control} name="materialsRestrictedDuringExam" render={({ field }) => (
          <ToggleRow id="ab-mat-restrict" label="Restrict materials during the examination" description="Only items marked “Permitted in exam” stay available while an attempt is in progress." checked={field.value} onChange={field.onChange} disabled={!accessible} />
        )} />
      </div>
      {accessible && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Materials available from" htmlFor="ab-mat-from">
            <input id="ab-mat-from" type="datetime-local" {...register("materialsAvailableFrom")} className={inputCls} />
          </Field>
          <Field label="Materials available until" htmlFor="ab-mat-until" error={errors.materialsAvailableUntil?.message}>
            <input id="ab-mat-until" type="datetime-local" {...register("materialsAvailableUntil")} aria-invalid={!!errors.materialsAvailableUntil || undefined} className={inputCls} />
          </Field>
        </div>
      )}
      <div className="mt-3 rounded-lg bg-zinc-50 px-3 py-2.5">
        <div className="text-[11.5px] font-semibold uppercase tracking-wide text-zinc-500">Permitted reference materials</div>
        {permitted.length === 0 ? (
          <p className="mt-1 text-[12px] text-zinc-500">None — the examination is closed-book.</p>
        ) : (
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {permitted.map((m) => (
              <li key={m.id}><Pill tone="sky"><MaterialIcon kind={m.kind} className="size-3" /> {m.title}</Pill></li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
