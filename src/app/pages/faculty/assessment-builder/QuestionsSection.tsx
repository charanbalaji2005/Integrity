import React, { useMemo, useRef, useState } from "react";
import { useDrag, useDrop } from "react-dnd";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  Copy,
  GripVertical,
  ImagePlus,
  ListChecks,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "../../../components/ui/checkbox";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "../../../components/ui/select";
import { Switch } from "../../../components/ui/switch";
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
import { AuthedImage } from "../../../components/assessment/protected-files";
import { countBlanks, LANGUAGES, QUESTION_TYPES, typeMeta, type QuestionType } from "../../../components/assessment/question-meta";
import { isCodingLanguage, newKey, newQuestion, questionIssues, summarize, type BuilderForm, type QuestionForm } from "./builder-model";
import { CodingGradingSettings, ReferenceSolutionTester } from "./coding-settings";
import { checkFile, FILE_RULES, uploadWithProgress, type Syllabus } from "./builder-api";
import { CodeEditor, RichTextEditor } from "./editors";
import { btn, Field, inputCls, NumberInput, Pill, SectionCard, textareaCls } from "./ui-kit";

const DND_TYPE = "builder-question";
const UNMAPPED = "__none__";

export function QuestionsSection({ syllabus }: { syllabus: Syllabus | null }) {
  const { control, getValues } = useFormContext<BuilderForm>();
  const { fields, append, remove, move, insert } = useFieldArray({ control, name: "questions", keyName: "_rid" });
  const questions = useWatch({ control, name: "questions" });
  const negativeMarking = useWatch({ control, name: "negativeMarking" });
  const negativeMarkValue = useWatch({ control, name: "negativeMarkValue" });
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const summary = useMemo(() => summarize(questions ?? []), [questions]);

  const add = (type: QuestionType) => {
    const q = newQuestion(type, { negativeMarks: negativeMarking ? Number(negativeMarkValue) || 0 : 0 });
    append(q);
    setExpanded((s) => new Set(s).add(q.key));
    requestAnimationFrame(() => document.getElementById(`q-${q.key}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };
  const duplicate = (i: number) => {
    const src = getValues(`questions.${i}`);
    const copy: QuestionForm = { ...structuredClone(src), key: newKey(), id: undefined };
    insert(i + 1, copy);
    setExpanded((s) => new Set(s).add(copy.key));
  };
  const toggle = (key: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });

  return (
    <SectionCard
      id="section-questions"
      step={3}
      icon={ListChecks}
      title="Configure Questions"
      description="Build the question paper. Drag cards to reorder."
      actions={
        <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-zinc-500">
          <Pill>{summary.totalQuestions} questions</Pill>
          <Pill>{summary.totalMarks} marks</Pill>
          <Pill>~{summary.estimatedMinutes} min</Pill>
        </div>
      }
    >
      <div className="space-y-3">
        {fields.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/60 px-6 py-8 text-center">
            <p className="text-[13.5px] font-semibold text-zinc-800">No questions yet</p>
            <p className="mt-0.5 text-[12px] text-zinc-500">Choose a question type below to start the paper.</p>
          </div>
        ) : (
          <ol className="space-y-2.5">
            {fields.map((f, i) => (
              <QuestionCard
                key={f._rid}
                index={i}
                total={fields.length}
                expanded={expanded.has((questions?.[i] as QuestionForm | undefined)?.key ?? "")}
                onToggle={() => toggle((questions?.[i] as QuestionForm).key)}
                onMove={(from, to) => move(from, to)}
                onDuplicate={() => duplicate(i)}
                onDelete={() => setPendingDelete(i)}
                syllabus={syllabus}
                negativeMarking={negativeMarking}
              />
            ))}
          </ol>
        )}

        <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-zinc-500">
            <Plus className="size-3.5" /> Add question
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
            {QUESTION_TYPES.map((t) => (
              <button
                key={t.type}
                type="button"
                onClick={() => add(t.type)}
                title={t.hint}
                className="flex flex-col items-start gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-left transition hover:border-zinc-400 hover:shadow-sm focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-zinc-900/10"
              >
                <t.icon className="size-4 text-zinc-600" />
                <span className="text-[12px] font-semibold leading-tight text-zinc-900">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete question {pendingDelete !== null ? pendingDelete + 1 : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              The question is removed from this assessment when you save. Questions that students have already answered cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={() => {
                if (pendingDelete !== null) remove(pendingDelete);
                setPendingDelete(null);
              }}
            >
              Delete question
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionCard>
  );
}

interface DragItem {
  index: number;
}

function QuestionCard({
  index,
  total,
  expanded,
  onToggle,
  onMove,
  onDuplicate,
  onDelete,
  syllabus,
  negativeMarking,
}: {
  index: number;
  total: number;
  expanded: boolean;
  onToggle: () => void;
  onMove: (from: number, to: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  syllabus: Syllabus | null;
  negativeMarking: boolean;
}) {
  const { control } = useFormContext<BuilderForm>();
  const q = useWatch({ control, name: `questions.${index}` }) as QuestionForm;
  const cardRef = useRef<HTMLLIElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);

  const [{ isOver }, drop] = useDrop<DragItem, void, { isOver: boolean }>({
    accept: DND_TYPE,
    collect: (m) => ({ isOver: m.isOver({ shallow: true }) }),
    hover(item, monitor) {
      const el = cardRef.current;
      if (!el || item.index === index) return;
      const rect = el.getBoundingClientRect();
      const middle = (rect.bottom - rect.top) / 2;
      const offset = monitor.getClientOffset();
      if (!offset) return;
      const y = offset.y - rect.top;
      if (item.index < index && y < middle) return;
      if (item.index > index && y > middle) return;
      onMove(item.index, index);
      item.index = index;
    },
  });
  const [{ isDragging }, drag, preview] = useDrag<DragItem, void, { isDragging: boolean }>({
    type: DND_TYPE,
    item: () => ({ index }),
    collect: (m) => ({ isDragging: m.isDragging() }),
  });
  drag(handleRef);
  preview(drop(cardRef));

  if (!q) return null;
  const meta = typeMeta(q.type);
  const issues = questionIssues(q);
  const plain = q.text.replace(/_{3,}/g, "▁▁▁").replace(/[*`#>_]/g, "").replace(/\s+/g, " ").trim();
  const topicTitle = syllabus?.units.flatMap((u) => u.topics).find((t) => t.id === q.topicId)?.title;

  return (
    <li
      ref={cardRef}
      id={`q-${q.key}`}
      className={cn(
        "rounded-xl border bg-white transition",
        isDragging ? "opacity-40" : "opacity-100",
        isOver ? "border-zinc-400" : issues.length && !expanded ? "border-amber-200" : "border-zinc-200",
      )}
    >
      <div className="flex items-center gap-2 px-2.5 py-2">
        <button
          ref={handleRef}
          type="button"
          aria-label={`Drag to reorder question ${index + 1}`}
          className="cursor-grab rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-zinc-900 text-[11px] font-bold text-white">{index + 1}</span>
        <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <meta.icon className="size-3.5 shrink-0 text-zinc-500" />
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate text-[13px]", plain ? "font-medium text-zinc-900" : "italic text-zinc-400")}>{plain || "Untitled question"}</span>
            <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-zinc-500">
              <span>{meta.label}</span>·<span>{q.points} mark{Number(q.points) === 1 ? "" : "s"}</span>·<span className="capitalize">{q.difficulty}</span>
              {topicTitle && (
                <>
                  ·<span className="max-w-40 truncate">{topicTitle}</span>
                </>
              )}
            </span>
          </span>
          {issues.length > 0 ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-amber-600" title={issues.join("\n")}>
              <AlertTriangle className="size-3.5" /> {issues.length}
            </span>
          ) : (
            <CheckCircle2 className="size-4 shrink-0 text-emerald-500" aria-label="Complete" />
          )}
          <ChevronDown className={cn("size-4 shrink-0 text-zinc-400 transition-transform", expanded && "rotate-180")} />
        </button>
        <div className="flex shrink-0 items-center">
          <button type="button" className={cn(btn.ghost, "px-1.5")} disabled={index === 0} onClick={() => onMove(index, index - 1)} aria-label={`Move question ${index + 1} up`}>
            <ArrowUp className="size-3.5" />
          </button>
          <button type="button" className={cn(btn.ghost, "px-1.5")} disabled={index === total - 1} onClick={() => onMove(index, index + 1)} aria-label={`Move question ${index + 1} down`}>
            <ArrowDown className="size-3.5" />
          </button>
          <button type="button" className={cn(btn.ghost, "px-1.5")} onClick={onDuplicate} aria-label={`Duplicate question ${index + 1}`}>
            <Copy className="size-3.5" />
          </button>
          <button type="button" className={cn(btn.danger, "px-1.5")} onClick={onDelete} aria-label={`Delete question ${index + 1}`}>
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
      {expanded && <QuestionEditor index={index} q={q} issues={issues} syllabus={syllabus} negativeMarking={negativeMarking} />}
    </li>
  );
}

function QuestionEditor({
  index,
  q,
  issues,
  syllabus,
  negativeMarking,
}: {
  index: number;
  q: QuestionForm;
  issues: string[];
  syllabus: Syllabus | null;
  negativeMarking: boolean;
}) {
  const { setValue } = useFormContext<BuilderForm>();
  const set = <K extends keyof QuestionForm>(key: K, value: QuestionForm[K]) =>
    setValue(`questions.${index}.${key}` as any, value as any, { shouldDirty: true });
  const pid = `q${index}`;
  const isChoice = q.type === "multiple-choice" || q.type === "multiple-select";
  const blanks = countBlanks(q.text);

  return (
    <div className="space-y-4 border-t border-zinc-100 px-4 pb-4 pt-3">
      {issues.length > 0 && (
        <ul className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">
          {issues.map((i) => (
            <li key={i} className="flex items-center gap-1.5">
              <AlertTriangle className="size-3" /> {i}
            </li>
          ))}
        </ul>
      )}

      <Field label="Question" htmlFor={`${pid}-text`} hint={q.type === "fill-blank" ? `Type ___ (three underscores) for each blank. ${blanks} blank${blanks === 1 ? "" : "s"} detected.` : "Supports bold, italic, code, lists and code blocks."}>
        <RichTextEditor
          id={`${pid}-text`}
          value={q.text}
          onChange={(v) => set("text", v)}
          placeholder={q.type === "fill-blank" ? "The time complexity of binary search is ____." : "Write the question…"}
          rows={q.type === "descriptive" || q.type === "coding" ? 5 : 3}
          allowBlank={q.type === "fill-blank"}
          ariaLabel={`Question ${index + 1} text`}
        />
      </Field>

      <ImageAttachments imageIds={q.imageIds} onChange={(ids) => set("imageIds", ids)} />

      {isChoice && (
        <OptionsEditor
          multi={q.type === "multiple-select"}
          options={q.options}
          correct={q.correct}
          onChange={(options, correct) => {
            set("options", options);
            set("correct", correct);
          }}
          pid={pid}
        />
      )}

      {q.type === "true-false" && (
        <Field label="Correct answer">
          <div role="radiogroup" aria-label="Correct answer" className="grid max-w-xs grid-cols-2 gap-2">
            {["True", "False"].map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={q.correct[0] === v}
                onClick={() => set("correct", [v])}
                className={cn("h-9 rounded-lg border text-[13px] font-semibold", q.correct[0] === v ? "border-emerald-600 bg-emerald-50 text-emerald-700" : "border-zinc-200 text-zinc-700 hover:bg-zinc-50")}
              >
                {v}
              </button>
            ))}
          </div>
        </Field>
      )}

      {q.type === "fill-blank" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] font-semibold text-zinc-700">Accepted answers</span>
            <label className="flex items-center gap-2 text-[11.5px] text-zinc-600">
              <Switch checked={q.caseSensitive} onCheckedChange={(v) => set("caseSensitive", v)} className="data-[state=checked]:bg-zinc-900" aria-label="Case sensitive" />
              Case sensitive
            </label>
          </div>
          {blanks === 0 ? (
            <p className="text-[12px] text-zinc-500">Add a blank to the question text to configure its answer.</p>
          ) : (
            Array.from({ length: blanks }, (_, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-[12px] font-semibold text-zinc-500">Blank {i + 1}</span>
                <input
                  value={q.blanks[i] ?? ""}
                  onChange={(e) => {
                    const next = Array.from({ length: blanks }, (_, k) => q.blanks[k] ?? "");
                    next[i] = e.target.value;
                    set("blanks", next);
                  }}
                  placeholder="O(log n) | log n"
                  aria-label={`Accepted answers for blank ${i + 1}`}
                  className={inputCls}
                />
              </div>
            ))
          )}
          <p className="text-[11.5px] text-zinc-500">Separate alternative accepted answers with “|”. Partial credit is given per correct blank.</p>
        </div>
      )}

      {(q.type === "short-answer" || q.type === "descriptive") && (
        <Field label="Model answer / rubric" htmlFor={`${pid}-model`} hint="Used by the AI-assisted evaluator and shown to reviewers. Never shown to students.">
          <textarea id={`${pid}-model`} rows={q.type === "descriptive" ? 5 : 3} value={q.modelAnswer} onChange={(e) => set("modelAnswer", e.target.value)} className={textareaCls} />
        </Field>
      )}

      {q.type === "coding" && <CodingEditor q={q} set={set} pid={pid} />}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label="Marks" htmlFor={`${pid}-pts`}>
          <NumberInput id={`${pid}-pts`} value={q.points} onChange={(v) => set("points", v ?? 0)} min={0} step={0.5} invalid={!(Number(q.points) > 0)} />
        </Field>
        <Field label="Negative marks" htmlFor={`${pid}-neg`} tip="Deducted for a wrong answer to an objective question when negative marking is enabled in Assessment Settings.">
          <NumberInput id={`${pid}-neg`} value={q.negativeMarks} onChange={(v) => set("negativeMarks", v ?? 0)} min={0} step={0.25} disabled={!negativeMarking || !typeMeta(q.type).objective} />
        </Field>
        <Field label="Difficulty" htmlFor={`${pid}-diff`}>
          <Select value={q.difficulty} onValueChange={(v) => set("difficulty", v as QuestionForm["difficulty"])}>
            <SelectTrigger id={`${pid}-diff`} className="h-9 rounded-lg border-zinc-200 text-[13px] shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="easy">Easy</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="hard">Hard</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Syllabus topic" htmlFor={`${pid}-topic`}>
          <Select value={q.topicId ?? UNMAPPED} onValueChange={(v) => set("topicId", v === UNMAPPED ? null : v)} disabled={!syllabus || syllabus.units.length === 0}>
            <SelectTrigger id={`${pid}-topic`} className="h-9 rounded-lg border-zinc-200 text-[13px] shadow-none">
              <SelectValue placeholder={syllabus ? "Not mapped" : "Select a syllabus first"} />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              <SelectItem value={UNMAPPED}>Not mapped</SelectItem>
              {syllabus?.units.map((u) => (
                <SelectGroup key={u.id}>
                  <SelectLabel className="text-[11px] text-zinc-400">Unit {u.number}: {u.title}</SelectLabel>
                  {u.topics.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.title}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field label="Explanation / answer key notes" htmlFor={`${pid}-exp`} hint="Visible to faculty reviewers only.">
        <textarea id={`${pid}-exp`} rows={2} value={q.explanation} onChange={(e) => set("explanation", e.target.value)} className={textareaCls} placeholder="Why the answer is correct, common mistakes…" />
      </Field>
    </div>
  );
}

function OptionsEditor({
  multi,
  options,
  correct,
  onChange,
  pid,
}: {
  multi: boolean;
  options: string[];
  correct: string[];
  onChange: (options: string[], correct: string[]) => void;
  pid: string;
}) {
  const update = (i: number, text: string) => {
    const old = options[i];
    const next = options.map((o, j) => (j === i ? text : o));
    // Keep the correct-answer mark attached to the edited option.
    onChange(next, correct.map((c) => (c === old ? text : c)));
  };
  const mark = (opt: string, on: boolean) => {
    if (!opt.trim()) return;
    onChange(options, multi ? (on ? [...new Set([...correct, opt])] : correct.filter((c) => c !== opt)) : [opt]);
  };
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-[12.5px] font-semibold text-zinc-700">
        Options <span className="font-normal text-zinc-500">— {multi ? "tick every correct option" : "select the correct option"}</span>
      </legend>
      {options.map((opt, i) => {
        const isCorrect = !!opt.trim() && correct.includes(opt);
        return (
          <div key={i} className={cn("flex items-center gap-2 rounded-lg border px-2 py-1.5", isCorrect ? "border-emerald-300 bg-emerald-50/50" : "border-zinc-200")}>
            {multi ? (
              <Checkbox checked={isCorrect} onCheckedChange={(v) => mark(opt, v === true)} aria-label={`Mark option ${String.fromCharCode(65 + i)} correct`} disabled={!opt.trim()} />
            ) : (
              <input type="radio" name={`${pid}-correct`} checked={isCorrect} onChange={() => mark(opt, true)} disabled={!opt.trim()} aria-label={`Mark option ${String.fromCharCode(65 + i)} correct`} className="size-4 accent-emerald-600" />
            )}
            <span className="w-4 text-[12px] font-bold text-zinc-400">{String.fromCharCode(65 + i)}</span>
            <input
              value={opt}
              onChange={(e) => update(i, e.target.value)}
              placeholder={`Option ${String.fromCharCode(65 + i)}`}
              aria-label={`Option ${String.fromCharCode(65 + i)}`}
              className="h-8 min-w-0 flex-1 bg-transparent text-[13px] text-zinc-900 outline-none placeholder:text-zinc-400"
            />
            <button
              type="button"
              disabled={options.length <= 2}
              onClick={() => onChange(options.filter((_, j) => j !== i), correct.filter((c) => c !== opt))}
              aria-label={`Remove option ${String.fromCharCode(65 + i)}`}
              className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-rose-600 disabled:opacity-30"
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
      <button type="button" className={btn.ghost} disabled={options.length >= 10} onClick={() => onChange([...options, ""], correct)}>
        <Plus className="size-3.5" /> Add option
      </button>
    </fieldset>
  );
}

function CodingEditor({
  q,
  set,
  pid,
}: {
  q: QuestionForm;
  set: <K extends keyof QuestionForm>(key: K, value: QuestionForm[K]) => void;
  pid: string;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Field label="Language" htmlFor={`${pid}-lang`}>
          <Select value={q.language} onValueChange={(v) => set("language", v)}>
            <SelectTrigger id={`${pid}-lang`} className="h-9 rounded-lg border-zinc-200 text-[13px] shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.filter((l) => isCodingLanguage(l.value)).map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Time limit" htmlFor={`${pid}-tl`}>
          <NumberInput id={`${pid}-tl`} value={q.timeLimitMs} onChange={(v) => set("timeLimitMs", v ?? 2000)} min={500} max={10000} step={100} suffix="ms" />
        </Field>
        <Field label="Memory limit" htmlFor={`${pid}-ml`}>
          <NumberInput id={`${pid}-ml`} value={q.memoryLimitMb} onChange={(v) => set("memoryLimitMb", v ?? 256)} min={32} max={512} step={16} suffix="MB" />
        </Field>
      </div>
      <Field label="Starter code" htmlFor={`${pid}-starter`} hint="Pre-filled in the student's editor.">
        <CodeEditor id={`${pid}-starter`} value={q.starterCode} onChange={(v) => set("starterCode", v)} rows={5} placeholder="def solve(nums):" ariaLabel="Starter code" />
      </Field>
      <Field label="Reference solution" htmlFor={`${pid}-ref`} hint="Never shown to students. Used as the grading rubric together with the test cases.">
        <CodeEditor id={`${pid}-ref`} value={q.modelAnswer} onChange={(v) => set("modelAnswer", v)} rows={8} ariaLabel="Reference solution" />
      </Field>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Sample input" htmlFor={`${pid}-si`}>
          <textarea id={`${pid}-si`} rows={3} value={q.sampleInput} onChange={(e) => set("sampleInput", e.target.value)} className={cn(textareaCls, "font-mono text-[12px]")} />
        </Field>
        <Field label="Sample output" htmlFor={`${pid}-so`}>
          <textarea id={`${pid}-so`} rows={3} value={q.sampleOutput} onChange={(e) => set("sampleOutput", e.target.value)} className={cn(textareaCls, "font-mono text-[12px]")} />
        </Field>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[12.5px] font-semibold text-zinc-700">Test cases</span>
          <button type="button" className={btn.ghost} onClick={() => set("testCases", [...q.testCases, { input: "", output: "", hidden: true }])}>
            <Plus className="size-3.5" /> Add test case
          </button>
        </div>
        {q.testCases.length === 0 && <p className="text-[12px] text-zinc-500">No test cases. Hidden cases are never sent to students.</p>}
        {q.testCases.map((t, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 rounded-lg border border-zinc-200 p-2 md:grid-cols-[1fr_1fr_auto]">
            <textarea rows={2} value={t.input} aria-label={`Test ${i + 1} input`} placeholder="Input" onChange={(e) => set("testCases", q.testCases.map((x, j) => (j === i ? { ...x, input: e.target.value } : x)))} className={cn(textareaCls, "font-mono text-[12px]")} />
            <textarea rows={2} value={t.output} aria-label={`Test ${i + 1} expected output`} placeholder="Expected output" onChange={(e) => set("testCases", q.testCases.map((x, j) => (j === i ? { ...x, output: e.target.value } : x)))} className={cn(textareaCls, "font-mono text-[12px]")} />
            <div className="flex items-center gap-2 md:flex-col md:items-end md:justify-between">
              <label className="flex items-center gap-1.5 text-[11.5px] text-zinc-600">
                <Switch checked={t.hidden} onCheckedChange={(v) => set("testCases", q.testCases.map((x, j) => (j === i ? { ...x, hidden: v } : x)))} className="data-[state=checked]:bg-zinc-900" aria-label={`Hide test ${i + 1}`} />
                Hidden
              </label>
              <button type="button" className={btn.danger} onClick={() => set("testCases", q.testCases.filter((_, j) => j !== i))} aria-label={`Remove test ${i + 1}`}>
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>
        ))}
        <p className="text-[11.5px] text-zinc-500">
          Submissions are compiled and run against every test case in a sandbox; the rubric share is assessed by the AI evaluator against the reference solution. Low-confidence results are flagged for your review.
        </p>
        <ReferenceSolutionTester q={q} />
      </div>
      <CodingGradingSettings q={q} set={set} pid={pid} labelFor={(k) => LANGUAGES.find((l) => l.value === k)?.label ?? k} />
    </div>
  );
}

function ImageAttachments({ imageIds, onChange }: { imageIds: string[]; onChange: (ids: string[]) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [pct, setPct] = useState<number | null>(null);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    const problem = checkFile(file, FILE_RULES.image);
    if (problem) return toast.error(problem);
    if (imageIds.length >= 6) return toast.error("At most 6 images per question.");
    const fd = new FormData();
    fd.append("file", file);
    setPct(0);
    try {
      const { data } = await uploadWithProgress<{ id: string }>("/api/courses/files", fd, setPct).promise;
      onChange([...imageIds, data.id]);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setPct(null);
      if (ref.current) ref.current.value = "";
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {imageIds.map((id, i) => (
        <div key={id} className="group relative">
          <AuthedImage fileId={id} alt={`Question image ${i + 1}`} className="h-20 w-28 rounded-lg border border-zinc-200 bg-zinc-50 object-cover" />
          <button type="button" onClick={() => onChange(imageIds.filter((x) => x !== id))} aria-label={`Remove image ${i + 1}`} className="absolute -right-1.5 -top-1.5 rounded-full bg-zinc-900 p-0.5 text-white shadow">
            <X className="size-3" />
          </button>
        </div>
      ))}
      <input ref={ref} type="file" accept={FILE_RULES.image.accept} className="sr-only" aria-label="Attach image" onChange={(e) => void upload(e.target.files?.[0])} />
      <button type="button" className={btn.ghost} onClick={() => ref.current?.click()} disabled={pct !== null}>
        {pct !== null ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
        {pct !== null ? `Uploading ${pct}%` : "Attach image"}
      </button>
    </div>
  );
}
