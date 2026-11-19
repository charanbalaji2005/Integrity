import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Download,
  Eye,
  FileText,
  Library,
  LoaderCircle,
  RefreshCw,
  Search,
  Share2,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { useProfile } from "../../context/ProfileContext";
import { apiFetch } from "../../utils/api-client";
import { parseSectionList } from "../SectionPicker";
import { ClassTargetPicker, SEMESTERS } from "./ClassTargetPicker";
import { PdfViewer } from "./PdfViewer";
import { type StudyMaterial, downloadMaterial, formatBytes, shareMaterial } from "./materialActions";

type Mode = "student" | "faculty" | "admin";

/** ?material=<id> deep links (from Share) open the viewer directly. */
function takeMaterialParam(): string | null {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("material");
  if (id) {
    params.delete("material");
    const qs = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }
  return id;
}

export function StudyMaterialsPanel({ mode }: { mode: Mode }) {
  const { profile } = useProfile();
  const canUpload = mode !== "student";
  const ownSections = useMemo(() => parseSectionList(profile?.section), [profile?.section]);

  const [items, setItems] = useState<StudyMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [viewing, setViewing] = useState<StudyMaterial | { id: string; title: string } | null>(null);
  const pendingOpen = useRef<string | null>(takeMaterialParam());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/study-materials");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || `Could not load materials (HTTP ${res.status}).`);
      const list: StudyMaterial[] = data.data || [];
      setItems(list);
      if (pendingOpen.current) {
        const id = pendingOpen.current;
        pendingOpen.current = null;
        setViewing(list.find((m) => m.id === id) ?? { id, title: "Shared study material" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load materials.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (m: StudyMaterial) => {
    if (!window.confirm(`Delete "${m.title}"? Students will no longer be able to open it.`)) return;
    const res = await apiFetch(`/api/study-materials/${m.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(data.message || "Could not delete the material.");
    toast.success("Material deleted");
    setItems((prev) => prev.filter((x) => x.id !== m.id));
  };

  const sectionsInList = useMemo(() => Array.from(new Set(items.map((m) => m.section))).sort(), [items]);
  const visible = items.filter((m) => {
    if (sectionFilter !== "all" && m.section !== sectionFilter) return false;
    const q = query.trim().toLowerCase();
    return !q || `${m.title} ${m.description ?? ""} ${m.uploadedByName} ${m.section}`.toLowerCase().includes(q);
  });

  const studentNoSection = mode === "student" && profile && !profile.section;

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-[#1a1917]">
            <Library className="size-6 text-indigo-600" aria-hidden="true" /> Study materials
          </h2>
          <p className="mt-1 text-[13px] text-[#676767]">
            {mode === "student"
              ? `PDFs your faculty shared with ${profile?.section ? `section ${profile.section}` : "your section"}. Open, download or share them.`
              : mode === "faculty"
                ? `Share PDFs with your sections (${ownSections.join(", ") || "none assigned"}). Only those students can open them.`
                : "All study materials across every section. Publish to any section or to everyone."}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex h-9 items-center gap-1.5 self-start rounded-lg border border-[#dedede] bg-white px-3 text-[13px] font-semibold text-[#1a1917] hover:bg-[#f6f6f6] sm:self-auto"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" /> Refresh
        </button>
      </div>

      {canUpload && (
        <UploadCard mode={mode} ownSections={ownSections} onCreated={(m) => setItems((prev) => [{ ...m, canDelete: true }, ...prev])} />
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8a8a8a]" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, description or faculty"
            aria-label="Search study materials"
            className="h-10 w-full rounded-xl border border-[#dedede] bg-white pl-9 pr-3 text-[13px] outline-none focus:border-[#1a1917]"
          />
        </div>
        {mode !== "student" && sectionsInList.length > 1 && (
          <select
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
            aria-label="Filter by section"
            className="h-10 rounded-xl border border-[#dedede] bg-white px-3 text-[13px] font-semibold outline-none"
          >
            <option value="all">All sections</option>
            {sectionsInList.map((s) => (
              <option key={s} value={s}>
                {s === "ALL" ? "Everyone" : s}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading && items.length === 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-36 animate-pulse rounded-2xl bg-[#f6f6f6]" />
          ))}
        </ul>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-[13px] text-rose-700" role="alert">
          {error}
        </div>
      ) : studentNoSection ? (
        <EmptyState icon={BookOpen} title="Complete your profile first" body="Set your section in your profile to see the materials your faculty shared with your class." />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={items.length ? "No materials match your search" : "No study materials yet"}
          body={
            items.length
              ? "Try a different search or section."
              : mode === "student"
                ? "When your faculty share PDFs with your section, they will appear here."
                : "Upload your first PDF above — students in that section can open it right away."
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((m) => (
            <li key={m.id} className="flex flex-col rounded-2xl border border-[#e7e7e7] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.25)]">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600" aria-hidden="true">
                  <FileText className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="line-clamp-2 text-[14px] font-semibold leading-snug text-[#1a1917]">{m.title}</h3>
                  <p className="mt-0.5 text-[11.5px] text-[#8a8a8a]">
                    {m.uploadedByName} · {new Date(m.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} ·{" "}
                    {formatBytes(m.file.sizeBytes)}
                  </p>
                </div>
              </div>
              {m.description && <p className="mt-2 line-clamp-2 text-[12.5px] text-[#676767]">{m.description}</p>}
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                  {m.section === "ALL" ? "All sections" : m.section}
                </span>
                {m.semester && <span className="rounded-md bg-[#f4f4f4] px-2 py-0.5 text-[11px] font-semibold text-[#676767]">{m.semester}</span>}
              </div>
              <div className="mt-auto flex items-center gap-1.5 pt-4">
                <button
                  type="button"
                  onClick={() => setViewing(m)}
                  className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-zinc-950 px-3 text-[13px] font-semibold text-white hover:bg-zinc-800"
                >
                  <Eye className="size-4" aria-hidden="true" /> Open
                </button>
                <IconAction label="Download" onClick={() => downloadMaterial(m)} icon={Download} />
                <IconAction label="Share" onClick={() => shareMaterial(m)} icon={Share2} />
                {m.canDelete && <IconAction label="Delete" onClick={() => remove(m)} icon={Trash2} danger />}
              </div>
            </li>
          ))}
        </ul>
      )}

      {viewing && <PdfViewer material={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function IconAction({
  label,
  onClick,
  icon: Icon,
  danger,
}: {
  label: string;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex size-9 items-center justify-center rounded-lg border transition ${
        danger
          ? "border-rose-200 text-rose-600 hover:bg-rose-50"
          : "border-[#dedede] text-[#1a1917] hover:bg-[#f6f6f6]"
      }`}
    >
      <Icon className="size-4" />
    </button>
  );
}

function EmptyState({ icon: Icon, title, body }: { icon: React.ComponentType<{ className?: string }>; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[#dedede] bg-white px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-[#f6f6f6] text-[#8a8a8a]">
        <Icon className="size-5" />
      </span>
      <p className="text-[14px] font-semibold text-[#1a1917]">{title}</p>
      <p className="max-w-sm text-[12.5px] text-[#676767]">{body}</p>
    </div>
  );
}

function UploadCard({
  mode,
  ownSections,
  onCreated,
}: {
  mode: Mode;
  ownSections: string[];
  onCreated: (m: StudyMaterial) => void;
}) {
  const isAdmin = mode === "admin";
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [everyone, setEveryone] = useState(false);
  const [section, setSection] = useState(ownSections[0] ?? "CSE-A");
  const [semester, setSemester] = useState(""); // "" = every semester
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isAdmin && ownSections.length && !ownSections.includes(section)) setSection(ownSections[0]);
  }, [isAdmin, ownSections, section]);

  const pick = (f: File | null) => {
    if (!f) return;
    if (!/\.pdf$/i.test(f.name)) return toast.error("Only PDF files can be shared as study materials.");
    if (f.size > 25 * 1024 * 1024) return toast.error("PDF is larger than 25 MB.");
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.pdf$/i, ""));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return toast.error("Choose a PDF to upload.");
    if (!title.trim()) return toast.error("Give the material a title.");
    if (!isAdmin && !ownSections.length) return toast.error("You have no sections assigned yet.");
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("title", title.trim());
      body.append("description", description.trim());
      body.append("section", isAdmin && everyone ? "ALL" : section);
      if (semester) body.append("semester", semester);
      const res = await apiFetch("/api/study-materials", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || `Upload failed (HTTP ${res.status}).`);
      onCreated(data.data);
      toast.success(`Published to ${isAdmin && everyone ? "all sections" : section}`);
      setFile(null);
      setTitle("");
      setDescription("");
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const label = "mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#8a8a8a]";
  const input = "h-10 w-full rounded-xl border border-[#dedede] bg-white px-3 text-[13px] outline-none focus:border-[#1a1917]";

  return (
    <form onSubmit={submit} className="rounded-2xl border border-[#e7e7e7] bg-white p-4 sm:p-5">
      <h3 className="mb-3 flex items-center gap-2 text-[14px] font-bold text-[#1a1917]">
        <Upload className="size-4 text-indigo-600" aria-hidden="true" /> Share a PDF
      </h3>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            pick(e.dataTransfer.files?.[0] ?? null);
          }}
          className="flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#dedede] bg-[#fafafa] p-4 text-center transition hover:border-indigo-300 hover:bg-indigo-50/40"
        >
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          <FileText className={`size-7 ${file ? "text-rose-600" : "text-[#b2b2b2]"}`} aria-hidden="true" />
          {file ? (
            <>
              <span className="max-w-full truncate text-[13px] font-semibold text-[#1a1917]">{file.name}</span>
              <span className="text-[11.5px] text-[#8a8a8a]">{formatBytes(file.size)} · click to change</span>
            </>
          ) : (
            <>
              <span className="text-[13px] font-semibold text-[#1a1917]">Drop a PDF here or click to browse</span>
              <span className="text-[11.5px] text-[#8a8a8a]">PDF only · up to 25 MB</span>
            </>
          )}
        </label>

        <div className="space-y-3">
          <div>
            <label className={label} htmlFor="sm-title">Title</label>
            <input id="sm-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="e.g. Unit 2 — Trees and Graphs" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="sm-desc">Description (optional)</label>
            <input id="sm-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} placeholder="What should students focus on?" className={input} />
          </div>
          <div>
            <span className={label}>Share with</span>
            {isAdmin && (
              <label className="mb-2 flex items-center gap-2 text-[12.5px] font-medium text-[#1a1917]">
                <input type="checkbox" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} className="size-4 accent-zinc-950" />
                Every section (all students)
              </label>
            )}
            {!(isAdmin && everyone) && (
              <div className="flex flex-wrap items-center gap-2">
                <ClassTargetPicker
                  allowedSections={isAdmin ? null : ownSections}
                  section={section}
                  semester={semester || SEMESTERS[0]}
                  onChange={(n) => {
                    setSection(n.section);
                    if (semester) setSemester(n.semester);
                  }}
                  size="md"
                  className={semester ? "" : "[&>select:last-child]:hidden"}
                />
                <label className="flex items-center gap-1.5 text-[12px] text-[#676767]">
                  <input
                    type="checkbox"
                    checked={!!semester}
                    onChange={(e) => setSemester(e.target.checked ? SEMESTERS[0] : "")}
                    className="size-4 accent-zinc-950"
                  />
                  Only one semester
                </label>
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={busy || !file}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-5 text-[13px] font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Upload className="size-4" aria-hidden="true" />}
            {busy ? "Uploading…" : "Publish PDF"}
          </button>
        </div>
      </div>
    </form>
  );
}
