import React, { useMemo, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { ClipboardList, Loader2, Plus, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { cn } from "../../../components/ui/utils";
import type { BuilderForm } from "./builder-model";
import { coursesApi, type CourseSummary } from "./builder-api";
import { btn, Field, inputCls, NumberInput, SectionCard, textareaCls, ToggleRow } from "./ui-kit";

const ALL = "__all__";
const NONE = "__none__";

const TYPES: { value: BuilderForm["assessmentType"]; label: string }[] = [
  { value: "quiz", label: "Quiz" },
  { value: "midterm", label: "Midterm" },
  { value: "final", label: "Final Examination" },
  { value: "practice", label: "Practice Test" },
];

const selectTriggerCls =
  "h-9 w-full rounded-lg border-zinc-200 bg-white text-[13.5px] shadow-none focus:ring-4 focus:ring-zinc-900/5 data-[placeholder]:text-zinc-400";

export function InfoSection({
  courses,
  coursesLoading,
  onCourseCreated,
  totalQuestionMarks,
}: {
  courses: CourseSummary[];
  coursesLoading: boolean;
  onCourseCreated: (c: CourseSummary) => void;
  totalQuestionMarks: number;
}) {
  const {
    register,
    control,
    setValue,
    formState: { errors },
  } = useFormContext<BuilderForm>();
  const subjectFilter = useWatch({ control, name: "subjectFilter" });
  const courseId = useWatch({ control, name: "courseId" });
  const totalMarks = useWatch({ control, name: "totalMarks" });
  const [newCourseOpen, setNewCourseOpen] = useState(false);

  const subjects = useMemo(
    () => [...new Set(courses.map((c) => c.subject).filter((s): s is string => !!s))].sort(),
    [courses],
  );
  const visibleCourses = subjectFilter ? courses.filter((c) => c.subject === subjectFilter) : courses;

  const selectCourse = (id: string | null) => {
    setValue("courseId", id, { shouldDirty: true });
    // Syllabus, topics and materials belong to a course; clear them when it changes.
    setValue("syllabusId", null, { shouldDirty: true });
    setValue("topicIds", [], { shouldDirty: true });
    setValue("materials", [], { shouldDirty: true });
    const c = courses.find((x) => x.id === id);
    if (c?.subject) setValue("subjectFilter", c.subject);
  };

  return (
    <SectionCard
      id="section-info"
      step={1}
      icon={ClipboardList}
      title="Assessment Information"
      description="Name, schedule and scoring for this examination."
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Assessment title" htmlFor="ab-title" required error={errors.title?.message} className="md:col-span-2">
          <input
            id="ab-title"
            {...register("title")}
            placeholder="e.g. Data Structures — Midterm Examination"
            aria-invalid={!!errors.title || undefined}
            className={inputCls}
            autoComplete="off"
          />
        </Field>

        <Field
          label="Description & instructions"
          htmlFor="ab-desc"
          hint="Shown to students on the instructions screen before they begin."
          className="md:col-span-2"
        >
          <textarea id="ab-desc" rows={3} {...register("description")} placeholder="Scope, allowed aids, special instructions…" className={textareaCls} />
        </Field>

        <Field label="Subject" htmlFor="ab-subject" hint={subjects.length ? "Filters the course list." : "Subjects come from your courses."}>
          <Select
            value={subjectFilter || ALL}
            onValueChange={(v) => setValue("subjectFilter", v === ALL ? "" : v)}
            disabled={coursesLoading || subjects.length === 0}
          >
            <SelectTrigger id="ab-subject" className={selectTriggerCls}>
              <SelectValue placeholder="All subjects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All subjects</SelectItem>
              {subjects.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Course" htmlFor="ab-course" hint="Links the syllabus and learning materials." tip="Courses are shared across your institution, so syllabi and materials uploaded once are reused by every assessment of the course.">
          <div className="flex gap-2">
            <Select value={courseId ?? NONE} onValueChange={(v) => selectCourse(v === NONE ? null : v)} disabled={coursesLoading}>
              <SelectTrigger id="ab-course" className={selectTriggerCls}>
                {coursesLoading ? (
                  <span className="flex items-center gap-2 text-zinc-400">
                    <Loader2 className="size-3.5 animate-spin" /> Loading courses…
                  </span>
                ) : (
                  <SelectValue placeholder="Select a course" />
                )}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No course</SelectItem>
                {visibleCourses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button type="button" className={cn(btn.secondary, "shrink-0 px-2.5")} onClick={() => setNewCourseOpen(true)} aria-label="Create a new course">
              <Plus className="size-4" />
            </button>
          </div>
        </Field>

        <Field label="Assessment type" className="md:col-span-2">
          <Controller
            control={control}
            name="assessmentType"
            render={({ field }) => (
              <div role="radiogroup" aria-label="Assessment type" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {TYPES.map((t) => {
                  const active = field.value === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => field.onChange(t.value)}
                      className={cn(
                        "h-9 rounded-lg border text-[12.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-zinc-900/10",
                        active ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                      )}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            )}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4 md:col-span-2 md:grid-cols-4">
          <Field label="Duration" htmlFor="ab-duration" required error={errors.duration?.message}>
            <Controller
              control={control}
              name="duration"
              render={({ field }) => (
                <NumberInput id="ab-duration" value={field.value} onChange={(v) => field.onChange(v ?? "")} min={1} max={1440} suffix="min" invalid={!!errors.duration} />
              )}
            />
          </Field>
          <Field
            label="Total marks"
            htmlFor="ab-total"
            error={errors.totalMarks?.message}
            hint={totalMarks == null ? `Auto: ${totalQuestionMarks}` : undefined}
            tip="Leave empty to use the sum of question marks. When set, the question marks must add up to this value before publishing."
          >
            <Controller
              control={control}
              name="totalMarks"
              render={({ field }) => (
                <NumberInput id="ab-total" value={field.value} onChange={field.onChange} min={0} step={0.5} placeholder={String(totalQuestionMarks)} invalid={!!errors.totalMarks} />
              )}
            />
          </Field>
          <Field label="Passing marks" htmlFor="ab-pass" error={errors.passingMarks?.message}>
            <Controller
              control={control}
              name="passingMarks"
              render={({ field }) => (
                <NumberInput id="ab-pass" value={field.value} onChange={field.onChange} min={0} step={0.5} placeholder="Optional" invalid={!!errors.passingMarks} />
              )}
            />
          </Field>
          <Field label="Attempts allowed" htmlFor="ab-attempts" error={errors.attemptLimit?.message}>
            <Controller
              control={control}
              name="attemptLimit"
              render={({ field }) => (
                <NumberInput id="ab-attempts" value={field.value} onChange={(v) => field.onChange(v ?? "")} min={1} max={50} invalid={!!errors.attemptLimit} />
              )}
            />
          </Field>
        </div>

        <Field label="Grading scheme" htmlFor="ab-grading">
          <Controller
            control={control}
            name="gradingScheme"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="ab-grading" className={selectTriggerCls}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="points">Points</SelectItem>
                  <SelectItem value="percentage">Percentage</SelectItem>
                  <SelectItem value="letter">Letter grade</SelectItem>
                  <SelectItem value="pass-fail">Pass / Fail</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <div className="hidden md:block" />

        <Field label="Available from" htmlFor="ab-start" hint="Leave empty to open as soon as it is published.">
          <input id="ab-start" type="datetime-local" {...register("availabilityStart")} className={inputCls} />
        </Field>
        <Field label="Available until" htmlFor="ab-end" error={errors.availabilityEnd?.message} hint="Leave empty for no closing time.">
          <input id="ab-end" type="datetime-local" {...register("availabilityEnd")} aria-invalid={!!errors.availabilityEnd || undefined} className={inputCls} />
        </Field>
      </div>

      <NewCourseDialog
        open={newCourseOpen}
        onOpenChange={setNewCourseOpen}
        onCreated={(c) => {
          onCourseCreated(c);
          selectCourse(c.id);
        }}
      />
    </SectionCard>
  );
}

function NewCourseDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (c: CourseSummary) => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [department, setDepartment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim().length < 2 || name.trim().length < 3) {
      setError("Enter a course code and a course name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const c = await coursesApi.create({ code: code.trim(), name: name.trim(), subject: subject.trim() || undefined, department: department.trim() || undefined });
      toast.success(`Course ${c.code} created`);
      onCreated(c);
      onOpenChange(false);
      setCode("");
      setName("");
      setSubject("");
      setDepartment("");
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
            <DialogTitle>New course</DialogTitle>
            <DialogDescription>Courses are shared with faculty in your institution. Check the list first to avoid duplicates.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Code" htmlFor="nc-code" required>
              <input id="nc-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="CSE201" className={inputCls} />
            </Field>
            <Field label="Name" htmlFor="nc-name" required className="col-span-2">
              <input id="nc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Data Structures" className={inputCls} />
            </Field>
            <Field label="Subject" htmlFor="nc-subject" className="col-span-3 sm:col-span-2">
              <input id="nc-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Computer Science" className={inputCls} />
            </Field>
            <Field label="Department" htmlFor="nc-dept" className="col-span-3 sm:col-span-1">
              <input id="nc-dept" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="CSE" className={inputCls} />
            </Field>
          </div>
          {error && (
            <p role="alert" className="text-[12px] font-medium text-rose-600">
              {error}
            </p>
          )}
          <DialogFooter>
            <button type="button" className={btn.secondary} onClick={() => onOpenChange(false)}>
              Cancel
            </button>
            <button type="submit" className={btn.primary} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />} Create course
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SettingsSection() {
  const { control, formState: { errors } } = useFormContext<BuilderForm>();
  const negativeMarking = useWatch({ control, name: "negativeMarking" });
  return (
    <SectionCard id="section-settings" step={4} icon={Settings2} title="Assessment Settings" description="Delivery, scoring rules and access.">
      <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
        <div className="divide-y divide-zinc-100">
          <Controller control={control} name="randomizeQuestions" render={({ field }) => (
            <ToggleRow id="ab-rq" label="Randomize question order" description="Each student gets a different, stable order." checked={field.value} onChange={field.onChange} />
          )} />
          <Controller control={control} name="randomizeOptions" render={({ field }) => (
            <ToggleRow id="ab-ro" label="Randomize answer options" description="Shuffles MCQ and multiple-select options per student." checked={field.value} onChange={field.onChange} />
          )} />
          <Controller control={control} name="negativeMarking" render={({ field }) => (
            <ToggleRow id="ab-neg" label="Negative marking" description="Deduct marks for wrong objective answers. Blank answers are never penalised." checked={field.value} onChange={field.onChange} />
          )} />
          {negativeMarking && (
            <div className="pb-3 pt-1">
              <Field label="Default deduction per wrong answer" htmlFor="ab-negval" error={errors.negativeMarkValue?.message} hint="Used when a question has no deduction of its own.">
                <Controller control={control} name="negativeMarkValue" render={({ field }) => (
                  <NumberInput id="ab-negval" value={field.value} onChange={(v) => field.onChange(v ?? 0)} min={0} step={0.25} suffix="marks" className="max-w-48" />
                )} />
              </Field>
            </div>
          )}
        </div>
        <div className="divide-y divide-zinc-100">
          <Controller control={control} name="lateSubmissionAllowed" render={({ field }) => (
            <ToggleRow id="ab-late" label="Allow late start" description="Students may still start after the availability window closes." checked={field.value} onChange={field.onChange} />
          )} />
          <Controller control={control} name="attemptLock" render={({ field }) => (
            <ToggleRow id="ab-lock" label="Lock attempts" description="Temporarily block all new and resumed attempts." checked={field.value} onChange={field.onChange} />
          )} />
        </div>
      </div>
    </SectionCard>
  );
}
