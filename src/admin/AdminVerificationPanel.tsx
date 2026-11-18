import React, { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  BadgeCheck,
  CheckCircle2,
  ExternalLink,
  FileText,
  IdCard,
  Loader2,
  Receipt,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "../app/utils/api-client";
import { DOCUMENT_TYPE_LABELS, type DocumentType } from "../app/components/verification/useVerification";

type ReqStatus = "pending" | "approved" | "rejected";

interface VerificationItem {
  id: string;
  documentType: DocumentType;
  fileName: string;
  mimeType: string;
  fileSize: number;
  institutionName: string | null;
  rollNumber: string | null;
  status: ReqStatus;
  reviewNote: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    rollNumber: string | null;
    department: string | null;
    semester: string | null;
    section: string | null;
    institutionName: string | null;
  };
}

const FILTERS: { id: ReqStatus; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

async function readError(res: Response, fallback: string) {
  try {
    return (await res.json())?.message || fallback;
  } catch {
    return fallback;
  }
}

/** Fetches a protected document as a blob URL (auth headers can't be sent by <img src>). */
function useDocumentUrl(item: VerificationItem | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    let revoked: string | null = null;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setUrl(null);
    apiFetch(`/api/verification/admin/requests/${item.id}/document`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await readError(res, "Could not load document"));
        const blob = await res.blob();
        if (cancelled) return;
        revoked = URL.createObjectURL(blob);
        setUrl(revoked);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Could not load document"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [item?.id]);

  return { url, loading, error };
}

export function AdminVerificationPanel() {
  const [filter, setFilter] = useState<ReqStatus>("pending");
  const [items, setItems] = useState<VerificationItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({ pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [institution, setInstitution] = useState("");
  const [note, setNote] = useState("");
  const [acting, setActing] = useState<"approve" | "reject" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/verification/admin/requests?status=${filter}`);
      if (!res.ok) throw new Error(await readError(res, "Could not load requests"));
      const data = (await res.json()).data;
      setItems(data.items);
      setCounts(data.counts);
      setSelectedId((cur) => (data.items.some((i: VerificationItem) => i.id === cur) ? cur : data.items[0]?.id ?? null));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load requests");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const selected = items.find((i) => i.id === selectedId) ?? null;
  const doc = useDocumentUrl(selected);

  useEffect(() => {
    setInstitution(selected?.institutionName || selected?.user.institutionName || "");
    setNote("");
  }, [selected?.id]);

  const act = async (decision: "approve" | "reject") => {
    if (!selected) return;
    if (decision === "reject" && !note.trim()) {
      toast.error("Add a reason so the student knows what to fix.");
      return;
    }
    setActing(decision);
    try {
      const res = await apiFetch(`/api/verification/admin/requests/${selected.id}/${decision}`, {
        method: "POST",
        body: JSON.stringify(
          decision === "approve" ? { institutionName: institution.trim() || undefined } : { note: note.trim() },
        ),
      });
      if (!res.ok) throw new Error(await readError(res, `Could not ${decision}`));
      toast.success(
        decision === "approve"
          ? `${selected.user.name} is now verified and can take exams.`
          : `Rejected. ${selected.user.name} has been asked to re-upload.`,
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Could not ${decision}`);
    } finally {
      setActing(null);
    }
  };

  return (
    <motion.div
      key="verification"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex flex-col gap-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#1a1917]">Student Verification</h1>
          <p className="text-xs text-[#8e8a80] mt-1">
            Review college ID cards and fee receipts. Approved students get the verified badge and can take exams.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex min-h-9 items-center gap-1.5 self-start rounded-xl border border-[#ebdcc9] bg-white px-3 text-xs font-bold text-[#1a1917] hover:bg-[#faf6ee] cursor-pointer"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto" role="tablist" aria-label="Filter requests">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`shrink-0 min-h-9 rounded-full px-4 text-xs font-bold border transition cursor-pointer ${
              filter === f.id ? "bg-zinc-950 text-white border-zinc-950" : "bg-white text-[#6b6861] border-[#ebdcc9] hover:bg-[#faf6ee]"
            }`}
          >
            {f.label}
            <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] ${filter === f.id ? "bg-white/20" : "bg-[#ebdcc9]/50"}`}>
              {counts[f.id] ?? 0}
            </span>
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_1fr]">
        {/* Queue */}
        <div className="rounded-2xl border border-[#ebdcc9] bg-white p-2 max-h-[70vh] overflow-y-auto">
          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-12 text-xs text-[#8e8a80]">
              <Loader2 className="size-4 animate-spin" /> Loading requests...
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#8e8a80]">
              <ShieldCheck className="mx-auto mb-2 size-6 text-[#c5af8a]" />
              No {filter} requests.
            </div>
          ) : (
            <ul className="space-y-1">
              {items.map((i) => {
                const Icon = i.documentType === "college_id" ? IdCard : Receipt;
                const active = i.id === selectedId;
                return (
                  <li key={i.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(i.id)}
                      aria-current={active ? "true" : undefined}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition cursor-pointer ${
                        active ? "bg-zinc-950 text-white" : "hover:bg-[#faf6ee]"
                      }`}
                    >
                      <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${active ? "bg-white/15" : "bg-[#f3ead9] text-[#8a6d3b]"}`}>
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-bold">{i.user.name}</span>
                        <span className={`block truncate text-[11px] ${active ? "text-white/70" : "text-[#8e8a80]"}`}>
                          {DOCUMENT_TYPE_LABELS[i.documentType]} · {new Date(i.createdAt).toLocaleDateString()}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Detail */}
        <div className="rounded-2xl border border-[#ebdcc9] bg-white p-5 min-h-[400px]">
          {!selected ? (
            <div className="flex h-full items-center justify-center text-xs text-[#8e8a80]">Select a request to review.</div>
          ) : (
            <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
              {/* Document preview */}
              <div className="min-w-0">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-bold text-[#1a1917]">{selected.fileName}</p>
                  {doc.url && (
                    <a href={doc.url} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-[#8a6d3b] hover:underline">
                      Open <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
                <div className="flex min-h-[340px] items-center justify-center overflow-hidden rounded-xl border border-[#ebdcc9] bg-[#faf6ee]">
                  {doc.loading ? (
                    <Loader2 className="size-5 animate-spin text-[#8e8a80]" />
                  ) : doc.error ? (
                    <p className="text-xs text-rose-600">{doc.error}</p>
                  ) : doc.url && selected.mimeType === "application/pdf" ? (
                    <iframe src={doc.url} title={`Document ${selected.fileName}`} className="h-[520px] w-full" />
                  ) : doc.url ? (
                    <img src={doc.url} alt={`${DOCUMENT_TYPE_LABELS[selected.documentType]} submitted by ${selected.user.name}`} className="max-h-[560px] w-full object-contain" />
                  ) : (
                    <FileText className="size-6 text-[#8e8a80]" />
                  )}
                </div>
              </div>

              {/* Student + decision */}
              <div className="flex flex-col gap-4">
                <dl className="space-y-2 text-xs">
                  {[
                    ["Student", selected.user.name],
                    ["Email", selected.user.email],
                    ["Roll number", selected.rollNumber || selected.user.rollNumber || "—"],
                    ["Department", [selected.user.department, selected.user.semester && `Sem ${selected.user.semester}`, selected.user.section && `Sec ${selected.user.section}`].filter(Boolean).join(" · ") || "—"],
                    ["Document", DOCUMENT_TYPE_LABELS[selected.documentType]],
                    ["Submitted", new Date(selected.createdAt).toLocaleString()],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3 border-b border-[#ebdcc9]/50 pb-2">
                      <dt className="text-[#8e8a80] shrink-0">{k}</dt>
                      <dd className="font-semibold text-[#1a1917] text-right break-all">{v}</dd>
                    </div>
                  ))}
                </dl>

                {selected.status === "pending" ? (
                  <>
                    <label className="block">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#8e8a80]">College name (shown on badge)</span>
                      <input
                        value={institution}
                        onChange={(e) => setInstitution(e.target.value)}
                        maxLength={160}
                        placeholder="e.g. SRM University AP"
                        className="mt-1.5 w-full rounded-xl border border-[#ebdcc9] px-3 py-2 text-sm focus:border-[#c5af8a] focus:outline-none focus:ring-1 focus:ring-[#c5af8a]"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#8e8a80]">Reason (required to reject)</span>
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        maxLength={500}
                        rows={3}
                        placeholder="e.g. Name on the receipt doesn't match the account"
                        className="mt-1.5 w-full rounded-xl border border-[#ebdcc9] px-3 py-2 text-sm focus:border-[#c5af8a] focus:outline-none focus:ring-1 focus:ring-[#c5af8a]"
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={acting !== null}
                        onClick={() => act("reject")}
                        className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50 cursor-pointer"
                      >
                        {acting === "reject" ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />} Reject
                      </button>
                      <button
                        type="button"
                        disabled={acting !== null}
                        onClick={() => act("approve")}
                        className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                      >
                        {acting === "approve" ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Approve
                      </button>
                    </div>
                  </>
                ) : (
                  <div className={`rounded-xl border p-3 text-xs ${selected.status === "approved" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-rose-200 bg-rose-50 text-rose-900"}`}>
                    <p className="flex items-center gap-1.5 font-bold">
                      {selected.status === "approved" ? <BadgeCheck className="size-4" /> : <XCircle className="size-4" />}
                      {selected.status === "approved" ? "Approved" : "Rejected"}
                      {selected.reviewedByName ? ` by ${selected.reviewedByName}` : ""}
                    </p>
                    {selected.reviewedAt && <p className="mt-1 opacity-80">{new Date(selected.reviewedAt).toLocaleString()}</p>}
                    {selected.institutionName && selected.status === "approved" && <p className="mt-1">College: {selected.institutionName}</p>}
                    {selected.reviewNote && <p className="mt-1">Reason: {selected.reviewNote}</p>}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
