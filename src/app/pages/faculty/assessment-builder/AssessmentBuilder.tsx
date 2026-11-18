import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FormProvider, useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { AlertTriangle, Check, CheckCircle2, Eye, Loader2, Rocket, Save } from "lucide-react";
import { toast } from "sonner";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "../../../components/ui/breadcrumb";
import { Skeleton } from "../../../components/ui/skeleton";
import { TooltipProvider } from "../../../components/ui/tooltip";
import { cn } from "../../../components/ui/utils";
import { readPreferences } from "../../../settings/preferences";
import {
  buildChecklist,
  builderFormSchema,
  emptyForm,
  formFromServer,
  summarize,
  toPayload,
  type BuilderForm,
} from "./builder-model";
import { ApiError, assessmentsApi, coursesApi, type CourseDetail, type CourseSummary } from "./builder-api";
import { InfoSection, SettingsSection } from "./InfoSection";
import { SyllabusSection } from "./SyllabusSection";
import { QuestionsSection } from "./QuestionsSection";
import { ChecklistPanel, IntegrityPanel, ResumePanel, SummaryPanel } from "./Sidebar";
import { PreviewDialog } from "./PreviewDialog";
import { btn, Pill } from "./ui-kit";

const AUTOSAVE_MS = 15000;

/** Payload without question ids — used to detect edits made while a save was in flight. */
const fingerprint = (v: BuilderForm) => {
  const p = toPayload(v);
  return JSON.stringify({ ...p, questions: p.questions.map(({ id: _id, ...rest }) => rest) });
};

const relative = (d: Date) => {
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

export default function AssessmentBuilder({
  user,
  assessmentId: initialId,
  onNavigate,
  onChanged,
  onDirtyChange,
}: {
  user: { id: string; name?: string };
  assessmentId: string | null;
  onNavigate: (tab: "Overview") => void;
  onChanged: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const defaults = useMemo(() => readPreferences(user.id).examDefaults, [user.id]);
  const form = useForm<BuilderForm>({
    resolver: zodResolver(builderFormSchema) as unknown as Resolver<BuilderForm>,
    defaultValues: emptyForm(defaults),
    mode: "onTouched",
  });
  const { control, getValues, setValue, reset, trigger, formState } = form;
  const values = useWatch({ control }) as BuilderForm;

  const [assessmentId, setAssessmentId] = useState<string | null>(initialId);
  const [loading, setLoading] = useState(!!initialId);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [serverIssues, setServerIssues] = useState<string[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [, tick] = useState(0);

  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [courseLoading, setCourseLoading] = useState(false);
  const [courseError, setCourseError] = useState<string | null>(null);
  const savingRef = useRef<Promise<string | null> | null>(null);

  /* ── loading ── */
  useEffect(() => {
    let live = true;
    coursesApi
      .list()
      .then((c) => live && setCourses(c))
      .catch((e) => live && toast.error(`Could not load courses: ${e.message}`))
      .finally(() => live && setCoursesLoading(false));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!initialId) return;
    let live = true;
    setLoading(true);
    assessmentsApi
      .loadBuilder(initialId)
      .then((a) => {
        if (!live) return;
        reset(formFromServer(a, defaults));
        setPublished(!!a.published);
        setAttemptCount(a._count?.attempts ?? 0);
        setLastSaved(new Date(a.updatedAt));
      })
      .catch((e) => live && setLoadError(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [initialId, defaults, reset]);

  const courseId = values.courseId;
  const reloadCourse = useCallback(async (): Promise<CourseDetail | null> => {
    const id = getValues("courseId");
    if (!id) {
      setCourse(null);
      return null;
    }
    setCourseLoading(true);
    setCourseError(null);
    try {
      const c = await coursesApi.get(id);
      setCourse(c);
      setCourses((list) => list.map((x) => (x.id === c.id ? { ...x, _count: { ...x._count, syllabi: c.syllabi.length, materials: c.materials.length } } : x)));
      return c;
    } catch (e: any) {
      setCourseError(e.message);
      return null;
    } finally {
      setCourseLoading(false);
    }
  }, [getValues]);

  useEffect(() => {
    if (!courseId) {
      setCourse(null);
      return;
    }
    if (course?.id !== courseId) setCourse(null);
    void reloadCourse();
  }, [courseId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── saving ── */
  const dirty = formState.isDirty;
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const focusFirstError = () => {
    const first = document.querySelector<HTMLElement>("[aria-invalid='true']");
    first?.scrollIntoView({ behavior: "smooth", block: "center" });
    first?.focus({ preventScroll: true });
  };

  const save = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}): Promise<string | null> => {
      if (savingRef.current) return savingRef.current;
      const run = (async () => {
        const valid = await trigger();
        if (!valid) {
          if (!silent) {
            toast.error("Fix the highlighted fields before saving.");
            requestAnimationFrame(focusFirstError);
          }
          return null;
        }
        const snapshot = getValues();
        const before = fingerprint(snapshot);
        const payload = toPayload(snapshot);
        setSaving(true);
        try {
          const id = assessmentId;
          const saved = id
            ? await assessmentsApi.update(id, payload)
            : await assessmentsApi.create({ ...payload, published: false });
          // Attach server ids to new questions so later saves update instead of duplicating.
          const serverQs: { id: string }[] = saved.questions ?? [];
          serverQs.forEach((q, i) => {
            if (getValues(`questions.${i}`)) setValue(`questions.${i}.id`, q.id);
          });
          if (fingerprint(getValues()) === before) reset(getValues());
          setAssessmentId(saved.id);
          setPublished(!!saved.published);
          setLastSaved(new Date());
          setServerIssues([]);
          onChanged();
          if (!silent) toast.success(saved.published ? "Changes saved" : "Draft saved");
          return saved.id as string;
        } catch (e: any) {
          if (!silent || !(e instanceof ApiError) || e.status !== 0) toast.error(e.message || "Could not save.");
          return null;
        } finally {
          setSaving(false);
        }
      })();
      savingRef.current = run;
      try {
        return await run;
      } finally {
        savingRef.current = null;
      }
    },
    [assessmentId, getValues, onChanged, reset, setValue, trigger],
  );

  // Autosave drafts after a pause in editing (never auto-modifies a published exam).
  useEffect(() => {
    if (!dirty || !assessmentId || published || loading) return;
    const t = setTimeout(() => void save({ silent: true }), AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [values, dirty, assessmentId, published, loading, save]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  const checklist = useMemo(() => buildChecklist(values), [values]);
  const summary = useMemo(() => summarize(values.questions ?? []), [values.questions]);

  const publish = async () => {
    const blocking = checklist.filter((c) => c.required && !c.ok);
    if (blocking.length) {
      toast.error(`Complete ${blocking.length} required checklist item${blocking.length === 1 ? "" : "s"} before publishing.`);
      document.getElementById("section-checklist")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setPublishing(true);
    try {
      const id = await save({ silent: true });
      if (!id) {
        toast.error("Fix the highlighted fields before publishing.");
        requestAnimationFrame(focusFirstError);
        return;
      }
      await assessmentsApi.publish(id);
      setPublished(true);
      setServerIssues([]);
      onChanged();
      toast.success("Assessment published. Students can access it within its availability window.");
    } catch (e: any) {
      const issues: { message: string }[] = (e instanceof ApiError && (e.data as any)?.issues) || [];
      setServerIssues(issues.map((i) => i.message));
      toast.error(e.message || "Could not publish.");
    } finally {
      setPublishing(false);
    }
  };

  /* ── progress ── */
  const ok = (id: string) => checklist.find((c) => c.id === id)?.ok ?? false;
  const steps = [
    { label: "Information", done: ok("basics") && ok("schedule"), target: "section-info" },
    { label: "Syllabus", done: ok("course") && ok("topics"), target: "section-syllabus" },
    { label: "Questions", done: ok("questions") && ok("complete"), target: "section-questions" },
    { label: "Integrity", done: !!(values.webcamMonitoring || values.browserLockdown || values.tabSwitchDetection), target: "section-integrity" },
    { label: "Ready", done: checklist.filter((c) => c.required).every((c) => c.ok), target: "section-checklist" },
  ];
  const pct = Math.round((steps.filter((s) => s.done).length / steps.length) * 100);
  const syllabus = course?.syllabi.find((s) => s.id === values.syllabusId) ?? null;

  if (loadError) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
        <AlertTriangle className="mx-auto size-6 text-rose-500" />
        <p className="mt-2 text-sm font-semibold text-rose-800">Could not open this assessment</p>
        <p className="text-xs text-rose-700">{loadError}</p>
        <button type="button" className={cn(btn.secondary, "mt-4")} onClick={() => onNavigate("Overview")}>Back to overview</button>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <DndProvider backend={HTML5Backend}>
        <FormProvider {...form}>
          <div className="mx-auto max-w-[1400px] space-y-5">
            {/* Header */}
            <div className="space-y-4">
              <Breadcrumb>
                <BreadcrumbList className="text-[12.5px]">
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <button type="button" className="text-[12.5px] font-medium" onClick={() => onNavigate("Overview")}>Dashboard</button>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <button type="button" className="text-[12.5px] font-medium" onClick={() => onNavigate("Overview")}>Examinations</button>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{assessmentId ? "Edit Assessment" : "Create Assessment"}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>

              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-[26px] font-semibold tracking-tight text-zinc-900">{assessmentId ? "Edit Assessment" : "Create Assessment"}</h1>
                    {published ? <Pill tone="emerald"><CheckCircle2 className="size-3" /> Published</Pill> : <Pill tone="amber">Draft</Pill>}
                    <span className="text-[12px] text-zinc-500" aria-live="polite">
                      {saving ? (
                        <span className="inline-flex items-center gap-1"><Loader2 className="size-3 animate-spin" /> Saving…</span>
                      ) : dirty ? (
                        "Unsaved changes"
                      ) : lastSaved ? (
                        <span className="inline-flex items-center gap-1"><Check className="size-3" /> Saved {relative(lastSaved)}</span>
                      ) : null}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[13px] text-zinc-500">Design, configure and publish secure online assessments.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className={btn.secondary} onClick={() => void save()} disabled={saving || loading} title="Ctrl+S">
                    {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} {published ? "Save changes" : "Save Draft"}
                  </button>
                  <button type="button" className={btn.secondary} onClick={() => setPreviewOpen(true)} disabled={loading}>
                    <Eye className="size-4" /> Preview Assessment
                  </button>
                  {published ? (
                    <span className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-50 px-3.5 text-[13px] font-semibold text-emerald-700">
                      <CheckCircle2 className="size-4" /> Published
                    </span>
                  ) : (
                    <button type="button" className={btn.success} onClick={() => void publish()} disabled={publishing || saving || loading}>
                      {publishing ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />} Publish Assessment
                    </button>
                  )}
                </div>
              </div>

              {/* Configuration progress */}
              <nav aria-label="Configuration progress" className="rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                <div className="mb-2.5 flex items-center justify-between text-[12px]">
                  <span className="font-semibold text-zinc-700">Configuration progress</span>
                  <span className="tabular-nums text-zinc-500">{pct}% complete</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Configuration progress">
                  <div className="h-full rounded-full bg-zinc-900 transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
                <ol className="mt-3 grid grid-cols-5 gap-1">
                  {steps.map((s, i) => (
                    <li key={s.label}>
                      <button
                        type="button"
                        onClick={() => document.getElementById(s.target)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                        className="flex w-full flex-col items-center gap-1 rounded-md py-1 text-center transition hover:bg-zinc-50 sm:flex-row sm:justify-center sm:gap-1.5"
                      >
                        <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold", s.done ? "bg-zinc-900 text-white" : "border border-zinc-300 text-zinc-500")}>
                          {s.done ? <Check className="size-3" /> : i + 1}
                        </span>
                        <span className={cn("text-[11px] sm:text-[12px]", s.done ? "font-semibold text-zinc-900" : "text-zinc-500")}>{s.label}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </nav>

              {published && (
                <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12.5px] text-amber-900">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>
                    This assessment is published{attemptCount ? ` and has ${attemptCount} attempt${attemptCount === 1 ? "" : "s"}` : ""}. Saved changes apply to students who start or resume after saving. Questions that already have answers cannot be removed.
                  </span>
                </div>
              )}
            </div>

            {loading ? (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]" aria-busy="true" aria-label="Loading assessment">
                <div className="space-y-5">
                  <Skeleton className="h-80 w-full rounded-2xl" />
                  <Skeleton className="h-56 w-full rounded-2xl" />
                  <Skeleton className="h-72 w-full rounded-2xl" />
                </div>
                <div className="space-y-5">
                  <Skeleton className="h-96 w-full rounded-2xl" />
                  <Skeleton className="h-48 w-full rounded-2xl" />
                </div>
              </div>
            ) : (
              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
                className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]"
              >
                <div className="min-w-0 space-y-5">
                  <InfoSection
                    courses={courses}
                    coursesLoading={coursesLoading}
                    onCourseCreated={(c) => setCourses((l) => [...l, c].sort((a, b) => a.code.localeCompare(b.code)))}
                    totalQuestionMarks={summary.totalMarks}
                  />
                  <SyllabusSection course={course} courseLoading={courseLoading} courseError={courseError} reloadCourse={reloadCourse} />
                  <QuestionsSection syllabus={syllabus} />
                  <SettingsSection />
                </div>
                <aside className="min-w-0 space-y-5 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pb-4 lg:pr-1" aria-label="Assessment configuration sidebar">
                  <IntegrityPanel />
                  <ResumePanel />
                  <SummaryPanel summary={summary} totalMarks={values.totalMarks ?? null} passingMarks={values.passingMarks ?? null} duration={Number(values.duration) || 0} />
                  <ChecklistPanel items={checklist} serverIssues={serverIssues} onPublish={() => void publish()} publishing={publishing} published={published} />
                </aside>
              </form>
            )}
          </div>
          <PreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} form={values} course={course} />
        </FormProvider>
      </DndProvider>
    </TooltipProvider>
  );
}
