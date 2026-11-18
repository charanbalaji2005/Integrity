import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Search,
  Sheet,
  UserX,
} from "lucide-react";
import { buildXlsx, downloadBlob, toCsv, toTsv, type CellValue } from "../../utils/xlsx-writer";

type Status = "completed" | "in_progress" | "not_started";

interface Row {
  studentId: string;
  name: string;
  email: string;
  registrationNumber: string;
  registrationValid: boolean;
  batchYear: number | null;
  semester: string | null;
  section: string | null;
  status: Status;
  attemptId: string | null;
  marks: number | null;
  maxMarks: number;
  percentage: number | null;
  passed: boolean | null;
  gradeStatus: "final" | "provisional" | null;
  integrityScore: number | null;
  riskLevel: string | null;
  submittedAt: string | null;
}

interface ResultsData {
  assessment: { id: string; title: string; institutionName: string; maxMarks: number; passingMarks: number | null };
  sections: { section: string; students: number; completed: number }[];
  summary: {
    total: number;
    completed: number;
    inProgress: number;
    notStarted: number;
    average: number | null;
    highest: number | null;
    lowest: number | null;
    passed: number;
  };
  rows: Row[];
}

export interface CompletionEvent {
  attemptId: string;
  assessmentId: string;
  studentName: string;
  registrationNumber: string;
  section: string;
  at: number;
}

const STATUS_META: Record<Status, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  completed: { label: "Completed", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  in_progress: { label: "In progress", cls: "bg-amber-50 text-amber-700 border-amber-200", icon: Clock3 },
  not_started: { label: "Not started", cls: "bg-zinc-50 text-zinc-600 border-zinc-200", icon: UserX },
};

const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

/**
 * Section-wise results: who in a section has completed an assessment, with
 * marks, integrity and live updates as students submit. Exports to Excel
 * (.xlsx), Google Sheets (copy + paste into a new sheet) and CSV.
 */
export default function SectionResults({
  assessments,
  lastCompletion,
}: {
  assessments: { id: string; title: string }[];
  lastCompletion: CompletionEvent | null;
}) {
  const [assessmentId, setAssessmentId] = useState<string>("");
  const [section, setSection] = useState("");
  const [batch, setBatch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<ResultsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!assessmentId && assessments.length) setAssessmentId(assessments[0].id);
  }, [assessments, assessmentId]);

  const load = useCallback(async () => {
    if (!assessmentId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (section) params.set("section", section);
      if (batch) params.set("batch", batch);
      const res = await fetch(`/api/assessments/${assessmentId}/results?${params}`, { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
      setData(body.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load results.");
    } finally {
      setLoading(false);
    }
  }, [assessmentId, section, batch]);

  useEffect(() => {
    void load();
  }, [load]);

  // A student just submitted: refresh and highlight their row.
  useEffect(() => {
    if (!lastCompletion || lastCompletion.assessmentId !== assessmentId) return;
    void load();
    const key = lastCompletion.registrationNumber || lastCompletion.studentName;
    setFlash((f) => ({ ...f, [key]: Date.now() }));
  }, [lastCompletion, assessmentId, load]);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.rows.filter(
      (r) =>
        (statusFilter === "all" || r.status === statusFilter) &&
        (!q || r.name.toLowerCase().includes(q) || r.registrationNumber.toLowerCase().includes(q)),
    );
  }, [data, statusFilter, query]);

  const batches = useMemo(
    () => [...new Set((data?.rows ?? []).map((r) => r.batchYear).filter((y): y is number => y !== null))].sort(),
    [data],
  );

  // ── Export ──
  const exportRows = (): CellValue[][] => {
    const header = [
      "S.No",
      "Registration No",
      "Student Name",
      "Batch",
      "Section",
      "Semester",
      "Status",
      "Marks",
      "Max Marks",
      "Percentage",
      "Result",
      "Grade Status",
      "Integrity %",
      "Risk Level",
      "Submitted At",
      "Email",
    ];
    return [
      header,
      ...rows.map((r, i) => [
        i + 1,
        r.registrationNumber || "—",
        r.name,
        r.batchYear ?? "",
        r.section ?? "",
        r.semester ?? "",
        STATUS_META[r.status].label,
        r.marks,
        r.maxMarks,
        r.percentage,
        r.passed === null ? "" : r.passed ? "Pass" : "Fail",
        r.gradeStatus === "final" ? "Final" : r.gradeStatus === "provisional" ? "Provisional" : "",
        r.integrityScore,
        r.riskLevel ?? "",
        r.submittedAt ? new Date(r.submittedAt).toLocaleString() : "",
        r.email,
      ]),
    ];
  };

  const fileBase = () => {
    const title = (data?.assessment.title || "assessment").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_");
    return `${title}_${section || "all-sections"}_marks_${new Date().toISOString().slice(0, 10)}`;
  };

  const exportExcel = () => {
    if (!data) return;
    const s = data.summary;
    const summarySheet: CellValue[][] = [
      ["Field", "Value"],
      ["Assessment", data.assessment.title],
      ["Institution", data.assessment.institutionName],
      ["Section", section || "All my sections"],
      ["Batch", batch || "All"],
      ["Maximum marks", data.assessment.maxMarks],
      ["Passing marks", data.assessment.passingMarks ?? ""],
      ["Students", s.total],
      ["Completed", s.completed],
      ["In progress", s.inProgress],
      ["Not started", s.notStarted],
      ["Average marks", s.average ?? ""],
      ["Highest", s.highest ?? ""],
      ["Lowest", s.lowest ?? ""],
      ["Passed", s.passed],
      ["Exported at", new Date().toLocaleString()],
    ];
    const blob = buildXlsx([
      { name: "Marks", rows: exportRows(), widths: [6, 17, 26, 8, 10, 10, 13, 8, 10, 11, 8, 12, 11, 11, 20, 30] },
      { name: "Summary", rows: summarySheet, widths: [18, 40] },
    ]);
    downloadBlob(blob, `${fileBase()}.xlsx`);
    toast.success("Excel file downloaded.");
  };

  const exportCsv = () => {
    downloadBlob(new Blob([toCsv(exportRows())], { type: "text/csv;charset=utf-8" }), `${fileBase()}.csv`);
    toast.success("CSV downloaded.");
  };

  const exportGoogleSheets = async () => {
    try {
      await navigator.clipboard.writeText(toTsv(exportRows()));
    } catch {
      toast.error("Clipboard access was blocked. Use the Excel download and import it into Google Sheets instead.");
      return;
    }
    window.open("https://sheets.new", "_blank", "noopener");
    toast.success("Marks copied. In the new Google Sheet, click cell A1 and press Ctrl+V.", { duration: 8000 });
  };

  const s = data?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Section Results</h1>
          <p className="text-xs text-[#8a8a8a]">
            Completion and marks for the students of your sections. Updates live as students submit.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportExcel}
            disabled={!rows.length}
            className="inline-flex items-center gap-1.5 min-h-10 rounded-xl bg-[#1a1917] px-4 text-xs font-bold text-white disabled:opacity-40 cursor-pointer"
          >
            <FileSpreadsheet className="size-4" /> Excel (.xlsx)
          </button>
          <button
            type="button"
            onClick={() => void exportGoogleSheets()}
            disabled={!rows.length}
            className="inline-flex items-center gap-1.5 min-h-10 rounded-xl border border-[#dedede] bg-white px-4 text-xs font-bold disabled:opacity-40 cursor-pointer hover:bg-[#f6f6f6]"
            title="Copies the table and opens a new Google Sheet to paste into"
          >
            <Sheet className="size-4 text-emerald-600" /> Google Sheets
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!rows.length}
            className="inline-flex items-center gap-1.5 min-h-10 rounded-xl border border-[#dedede] bg-white px-4 text-xs font-bold disabled:opacity-40 cursor-pointer hover:bg-[#f6f6f6]"
          >
            <Download className="size-4" /> CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1.4fr_auto] gap-2">
        <select
          value={assessmentId}
          onChange={(e) => setAssessmentId(e.target.value)}
          className="min-h-10 rounded-xl border border-[#dedede] bg-white px-3 text-xs font-bold"
          aria-label="Assessment"
        >
          {assessments.length === 0 && <option value="">No assessments</option>}
          {assessments.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </select>
        <select
          value={section}
          onChange={(e) => setSection(e.target.value)}
          className="min-h-10 rounded-xl border border-[#dedede] bg-white px-3 text-xs font-bold"
          aria-label="Section"
        >
          <option value="">All my sections</option>
          {(data?.sections ?? []).map((sec) => (
            <option key={sec.section} value={sec.section}>
              {sec.section} ({sec.completed}/{sec.students} done)
            </option>
          ))}
        </select>
        <select
          value={batch}
          onChange={(e) => setBatch(e.target.value)}
          className="min-h-10 rounded-xl border border-[#dedede] bg-white px-3 text-xs font-bold"
          aria-label="Batch year"
        >
          <option value="">All batches</option>
          {batches.map((y) => (
            <option key={y} value={y}>
              Batch {y}
            </option>
          ))}
        </select>
        <label className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[#8a8a8a]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or AP24…"
            className="w-full min-h-10 rounded-xl border border-[#dedede] bg-white pl-8 pr-3 text-xs"
            aria-label="Search students"
          />
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center justify-center gap-1.5 min-h-10 rounded-xl border border-[#dedede] bg-white px-3 text-xs font-bold cursor-pointer hover:bg-[#f6f6f6]"
          aria-label="Refresh"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Summary */}
      {s && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
          {(
            [
              ["Students", s.total, "text-[#1a1917]", "all"],
              ["Completed", s.completed, "text-emerald-700", "completed"],
              ["In progress", s.inProgress, "text-amber-700", "in_progress"],
              ["Not started", s.notStarted, "text-zinc-600", "not_started"],
              ["Average", s.average === null ? "—" : `${s.average}/${data!.assessment.maxMarks}`, "text-[#1a1917]", null],
              ["Passed", data!.assessment.passingMarks === null ? "—" : s.passed, "text-emerald-700", null],
            ] as [string, number | string, string, "all" | Status | null][]
          ).map(([label, value, cls, filter]) => (
            <button
              key={label}
              type="button"
              disabled={!filter}
              onClick={() => filter && setStatusFilter(filter)}
              className={`text-left bg-white border rounded-xl px-3 py-2.5 shadow-sm ${
                filter && statusFilter === filter ? "border-[#1a1917]" : "border-[#dedede]"
              } ${filter ? "cursor-pointer hover:border-[#9e9e9e]" : "cursor-default"}`}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#8a8a8a] block">{label}</span>
              <span className={`text-lg font-extrabold ${cls}`}>{value}</span>
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-[#dedede] rounded-2xl shadow-sm overflow-hidden">
        {error ? (
          <p className="p-6 text-xs text-rose-600">{error}</p>
        ) : !data && loading ? (
          <div className="p-6 flex items-center gap-2 text-xs text-[#8a8a8a]">
            <Loader2 className="size-4 animate-spin" /> Loading results…
          </div>
        ) : rows.length === 0 ? (
          <p className="p-6 text-xs text-[#8a8a8a]">No students match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#f6f6f6] text-[10px] uppercase tracking-wider text-[#676767]">
                <tr>
                  {["#", "Registration No", "Student", "Section", "Status", "Marks", "%", "Integrity", "Submitted"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left font-bold whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#efefef]">
                {rows.map((r, i) => {
                  const meta = STATUS_META[r.status];
                  const Icon = meta.icon;
                  const flashedAt = flash[r.registrationNumber || r.name];
                  const isNew = flashedAt && Date.now() - flashedAt < 15000;
                  return (
                    <tr key={r.studentId} className={isNew ? "bg-emerald-50/70 transition-colors" : "hover:bg-[#fafafa]"}>
                      <td className="px-3 py-2.5 text-[#8a8a8a]">{i + 1}</td>
                      <td className="px-3 py-2.5 font-mono whitespace-nowrap">
                        {r.registrationNumber ? (
                          <span className="inline-flex items-center gap-1">
                            {r.registrationValid ? (
                              <>
                                <span className="text-[#8a8a8a]">{r.registrationNumber.slice(0, 2)}</span>
                                <span className="font-bold">{r.registrationNumber.slice(2, 4)}</span>
                                <span>{r.registrationNumber.slice(4)}</span>
                              </>
                            ) : (
                              <>
                                {r.registrationNumber}
                                <span title="Does not match the AP + year + 9-digit format">
                                  <AlertTriangle className="size-3 text-amber-500" />
                                </span>
                              </>
                            )}
                          </span>
                        ) : (
                          <span className="text-[#b2b2b2]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-[#1a1917]">{r.name}</div>
                        {r.batchYear && <div className="text-[10px] text-[#8a8a8a]">Batch {r.batchYear}</div>}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{r.section || "—"}</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${meta.cls}`}>
                          <Icon className="size-3" /> {meta.label}
                        </span>
                        {isNew && <span className="ml-1.5 text-[10px] font-bold text-emerald-700">just now</span>}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap font-semibold">
                        {r.marks === null ? (
                          <span className="text-[#b2b2b2]">—</span>
                        ) : (
                          <>
                            {r.marks}
                            <span className="text-[#8a8a8a] font-normal">/{r.maxMarks}</span>
                            {r.gradeStatus === "provisional" && (
                              <span className="ml-1 text-[9px] font-bold text-amber-600" title="Descriptive answers still being evaluated">
                                PROV
                              </span>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {r.percentage === null ? "" : (
                          <span className={r.passed === false ? "text-rose-600 font-bold" : ""}>{r.percentage}%</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {r.integrityScore === null ? "" : (
                          <span
                            className={`font-bold ${
                              r.integrityScore < 60 ? "text-rose-600" : r.integrityScore < 85 ? "text-amber-600" : "text-emerald-700"
                            }`}
                          >
                            {r.integrityScore}%
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-[#676767]">{fmtDateTime(r.submittedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="flex items-center gap-1.5 text-[10px] text-[#8a8a8a]">
        <Copy className="size-3" />
        Google Sheets: the table is copied to your clipboard and a new sheet opens — click A1 and paste. Excel files can also
        be imported into Google Sheets via File → Import.
      </p>
    </div>
  );
}
