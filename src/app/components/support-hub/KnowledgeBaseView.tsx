import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, BookOpen, Eye, EyeOff, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { errorMessage, supportApi } from "./api";
import type { KbArticle } from "./types";
import { SUPPORT_CATEGORIES, categoryLabel } from "./types";
import { EmptyState, ErrorBlock, Field, Modal, SectionHeader, Spinner, btnDanger, btnIcon, btnPrimary, btnSecondary, cardCls, cx, focusRing, formatDateTime, inputCls } from "./ui";

type Draft = Omit<KbArticle, "id" | "updatedAt"> & { id?: string };

const emptyDraft = (): Draft => ({ title: "", category: "other", summary: "", body: "", visibility: "internal", tags: [] });

export function KnowledgeBaseView({ canManage }: { canManage: boolean }) {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [category, setCategory] = useState("");
  const [articles, setArticles] = useState<KbArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<KbArticle | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [tagsText, setTagsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<KbArticle | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (debouncedQ) params.set("q", debouncedQ);
    if (category) params.set("category", category);
    try {
      const list = await supportApi<KbArticle[]>(`/kb${params.toString() ? `?${params}` : ""}`);
      setArticles(list);
      setError(null);
      setSelected((s) => (s ? list.find((a) => a.id === s.id) ?? s : s));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, category]);

  useEffect(() => {
    void load();
  }, [load]);

  const openEditor = (a?: KbArticle) => {
    const d = a ? { id: a.id, title: a.title, category: a.category, summary: a.summary, body: a.body, visibility: a.visibility, tags: a.tags } : emptyDraft();
    setDraft(d);
    setTagsText(d.tags.join(", "));
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    const body = {
      title: draft.title.trim(),
      category: draft.category,
      summary: draft.summary.trim(),
      body: draft.body.trim(),
      visibility: draft.visibility,
      tags: tagsText.split(",").map((t) => t.trim()).filter(Boolean),
    };
    try {
      const saved = draft.id
        ? await supportApi<KbArticle>(`/kb/${draft.id}`, { method: "PUT", body })
        : await supportApi<KbArticle>("/kb", { method: "POST", body });
      toast.success(draft.id ? "Article updated" : "Article published");
      setDraft(null);
      if (saved && (saved as KbArticle).id) setSelected(saved);
      void load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (a: KbArticle) => {
    setSaving(true);
    try {
      await supportApi(`/kb/${a.id}`, { method: "DELETE" });
      toast.success("Article deleted");
      setConfirmDelete(null);
      if (selected?.id === a.id) setSelected(null);
      void load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const valid = !!draft && draft.title.trim().length >= 3 && draft.body.trim().length >= 10;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5 overflow-y-auto h-full">
      <SectionHeader
        title="Knowledge base"
        description={canManage ? "Create and maintain help articles. Public articles are visible to students; internal ones only to staff." : "Search help articles to support your replies."}
        actions={
          canManage ? (
            <button type="button" className={btnPrimary} onClick={() => openEditor()}>
              <Plus className="size-4" /> New article
            </button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] gap-4 sm:gap-6">
        <div className={cx(cardCls, "flex flex-col min-h-[300px]", selected && "hidden lg:flex")}>
          <div className="p-3 border-b border-[#dedede]/60 space-y-2">
            <div className="relative">
              <Search className="size-3.5 text-[#a2a2a2] absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search articles" aria-label="Search articles" className={cx(inputCls, "pl-8 text-xs")} />
            </div>
            <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category" className={cx(inputCls, "text-xs")}>
              <option value="">All categories</option>
              {SUPPORT_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          {error ? (
            <ErrorBlock message={error} onRetry={load} />
          ) : loading && articles.length === 0 ? (
            <Spinner label="Loading articles" />
          ) : articles.length === 0 ? (
            <EmptyState icon={BookOpen} title="No articles" description={q || category ? "Try a different search." : canManage ? "Publish the first article." : "No articles have been published yet."} />
          ) : (
            <ul className="p-2 space-y-1 overflow-y-auto max-h-[65vh]">
              {articles.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(a)}
                    aria-current={selected?.id === a.id ? "true" : undefined}
                    className={cx("w-full text-left p-3 rounded-xl border cursor-pointer", focusRing, selected?.id === a.id ? "bg-[#f6f6f6] border-[#1a1917]/30" : "border-transparent hover:bg-[#fafafa]")}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-bold text-[#1a1917] flex-1 min-w-0 truncate">{a.title}</span>
                      <VisibilityTag v={a.visibility} />
                    </div>
                    <p className="text-[11px] text-[#676767] line-clamp-2 mt-0.5">{a.summary}</p>
                    <p className="text-[10px] text-[#a2a2a2] mt-1">{categoryLabel(a.category)}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={cx(cardCls, "p-5 min-h-[300px]", !selected && "hidden lg:block")}>
          {!selected ? (
            <EmptyState icon={BookOpen} title="Select an article" description="Choose an article from the list to read it." />
          ) : (
            <article>
              <div className="flex items-start gap-2 mb-3">
                <button type="button" onClick={() => setSelected(null)} aria-label="Back to articles" className={cx(btnIcon, "lg:hidden -ml-2")}>
                  <ArrowLeft className="size-5" />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <VisibilityTag v={selected.visibility} />
                    <span className="text-[11px] text-[#8a8a8a]">{categoryLabel(selected.category)} · updated {formatDateTime(selected.updatedAt)}</span>
                  </div>
                  <h2 className="text-lg font-bold text-[#1a1917] mt-1">{selected.title}</h2>
                </div>
                {canManage && (
                  <div className="flex gap-1 shrink-0">
                    <button type="button" className={btnIcon} onClick={() => openEditor(selected)} aria-label="Edit article">
                      <Pencil className="size-4" />
                    </button>
                    <button type="button" className={cx(btnIcon, "hover:text-rose-600")} onClick={() => setConfirmDelete(selected)} aria-label="Delete article">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )}
              </div>
              {selected.summary && <p className="text-sm text-[#676767] mb-4 leading-relaxed">{selected.summary}</p>}
              <div className="text-[13.5px] text-[#1a1917] whitespace-pre-wrap leading-relaxed">{selected.body}</div>
              {selected.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-5">
                  {selected.tags.map((t) => (
                    <span key={t} className="text-[10.5px] font-semibold px-2 py-0.5 rounded-md bg-[#f1f1f1] text-[#676767]">
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </article>
          )}
        </div>
      </div>

      <Modal
        open={!!draft}
        onClose={() => !saving && setDraft(null)}
        title={draft?.id ? "Edit article" : "New article"}
        size="lg"
        footer={
          <>
            <button type="button" className={btnSecondary} onClick={() => setDraft(null)} disabled={saving}>
              Cancel
            </button>
            <button type="button" className={btnPrimary} onClick={save} disabled={!valid || saving}>
              {saving && <Loader2 className="size-4 animate-spin" />} {draft?.id ? "Save changes" : "Publish"}
            </button>
          </>
        }
      >
        {draft && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) void save(); }}>
            <Field label="Title" htmlFor="kb-title">
              <input id="kb-title" data-autofocus value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={inputCls} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Category" htmlFor="kb-cat">
                <select id="kb-cat" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className={inputCls}>
                  {SUPPORT_CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              <fieldset>
                <legend className="text-xs font-bold text-[#1a1917] mb-1.5">Visibility</legend>
                <div className="grid grid-cols-2 gap-2">
                  {(["internal", "public"] as const).map((v) => (
                    <label key={v} className={cx("flex items-center justify-center gap-1.5 min-h-11 rounded-xl border text-xs font-bold cursor-pointer capitalize", draft.visibility === v ? "border-[#1a1917] bg-[#f6f6f6]" : "border-[#dedede]")}>
                      <input type="radio" name="kb-vis" className="sr-only" checked={draft.visibility === v} onChange={() => setDraft({ ...draft, visibility: v })} />
                      {v === "public" ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />} {v}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            <Field label="Summary" htmlFor="kb-sum">
              <input id="kb-sum" value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Body" htmlFor="kb-body">
              <textarea id="kb-body" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} className={cx(inputCls, "py-2.5 min-h-[200px] resize-y")} />
            </Field>
            <Field label="Tags" htmlFor="kb-tags" hint="Comma separated">
              <input id="kb-tags" value={tagsText} onChange={(e) => setTagsText(e.target.value)} className={inputCls} />
            </Field>
          </form>
        )}
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => !saving && setConfirmDelete(null)}
        title="Delete article?"
        description={confirmDelete ? `“${confirmDelete.title}” will be removed permanently.` : undefined}
        size="sm"
        footer={
          <>
            <button type="button" className={btnSecondary} onClick={() => setConfirmDelete(null)} disabled={saving}>
              Cancel
            </button>
            <button type="button" className={btnDanger} onClick={() => confirmDelete && remove(confirmDelete)} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />} Delete
            </button>
          </>
        }
      >
        <p className="text-xs text-[#676767]">Students and staff will no longer see this article.</p>
      </Modal>
    </div>
  );
}

function VisibilityTag({ v }: { v: "public" | "internal" }) {
  return v === "public" ? (
    <span className="inline-flex items-center gap-1 text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
      <Eye className="size-3" aria-hidden /> Public
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
      <EyeOff className="size-3" aria-hidden /> Internal
    </span>
  );
}
