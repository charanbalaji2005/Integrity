import React from "react";
import { Inbox, Search, ShieldAlert, SlidersHorizontal, UserRound } from "lucide-react";
import type { Priority, QueueSort, TicketSummary } from "./types";
import { PRIORITIES, PRIORITY_LABEL, SUPPORT_CATEGORIES } from "./types";
import { EmptyState, ErrorBlock, OwnershipBadge, PriorityBadge, Spinner, StatusChip, cx, focusRing, formatDuration, inputCls, useNow } from "./ui";

export interface QueueFilters {
  q: string;
  priority: Priority | "";
  category: string;
  sort: QueueSort;
}

export function TicketList({
  title,
  description,
  tickets,
  loading,
  error,
  onRetry,
  filters,
  onFilters,
  selectedId,
  onSelect,
}: {
  title: string;
  description: string;
  tickets: TicketSummary[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  filters: QueueFilters;
  onFilters: (f: QueueFilters) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const now = useNow(30000);
  const [showFilters, setShowFilters] = React.useState(false);
  const activeFilterCount = (filters.priority ? 1 : 0) + (filters.category ? 1 : 0);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-3 sm:p-4 border-b border-[#dedede]/60 space-y-3 shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-bold tracking-tight text-[#1a1917]">{title}</h2>
            <p className="text-[11px] text-[#8a8a8a] mt-0.5">{description}</p>
          </div>
          <span className="text-[11px] font-bold text-[#676767] bg-[#ececec] rounded-full px-2 py-0.5 shrink-0 tabular-nums" aria-live="polite">
            {tickets.length}
          </span>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="size-3.5 text-[#a2a2a2] absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
            <input
              type="search"
              value={filters.q}
              onChange={(e) => onFilters({ ...filters, q: e.target.value })}
              placeholder="Search reference, student, title…"
              aria-label="Search tickets"
              className={cx(inputCls, "pl-8 text-xs")}
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((s) => !s)}
            aria-expanded={showFilters}
            aria-label="Filters and sort"
            className={cx(
              "relative inline-flex items-center justify-center size-11 rounded-xl border cursor-pointer transition",
              focusRing,
              showFilters ? "bg-[#1a1917] text-white border-[#1a1917]" : "bg-white text-[#676767] border-[#dedede] hover:bg-[#f6f6f6]"
            )}
          >
            <SlidersHorizontal className="size-4" />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 size-4 rounded-full bg-rose-600 text-white text-[9px] font-bold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
        {showFilters && (
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-[#8a8a8a] uppercase tracking-wider">Priority</span>
              <select
                value={filters.priority}
                onChange={(e) => onFilters({ ...filters, priority: e.target.value as Priority | "" })}
                className={cx(inputCls, "text-xs")}
              >
                <option value="">All priorities</option>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p} · {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-[#8a8a8a] uppercase tracking-wider">Sort</span>
              <select value={filters.sort} onChange={(e) => onFilters({ ...filters, sort: e.target.value as QueueSort })} className={cx(inputCls, "text-xs")}>
                <option value="priority">Priority</option>
                <option value="waiting">Longest waiting</option>
                <option value="oldest">Oldest first</option>
                <option value="newest">Newest first</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 col-span-2">
              <span className="text-[10px] font-bold text-[#8a8a8a] uppercase tracking-wider">Category</span>
              <select value={filters.category} onChange={(e) => onFilters({ ...filters, category: e.target.value })} className={cx(inputCls, "text-xs")}>
                <option value="">All categories</option>
                {SUPPORT_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {error ? (
          <ErrorBlock message={error} onRetry={onRetry} />
        ) : loading && tickets.length === 0 ? (
          <Spinner label="Loading tickets" />
        ) : tickets.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={filters.q || filters.priority || filters.category ? "No tickets match" : "Queue is clear"}
            description={filters.q || filters.priority || filters.category ? "Try clearing search or filters." : "New tickets will appear here in real time."}
          />
        ) : (
          <ul className="p-2 space-y-1.5" aria-label={`${title} tickets`}>
            {tickets.map((t) => {
              const selected = t.id === selectedId;
              const waitingMs = t.waitingSince ? now - new Date(t.waitingSince).getTime() : null;
              const longWait = waitingMs !== null && waitingMs > 30 * 60000;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(t.id)}
                    aria-current={selected ? "true" : undefined}
                    className={cx(
                      "w-full text-left p-3 rounded-xl border transition-all cursor-pointer",
                      focusRing,
                      selected ? "bg-[#f6f6f6] border-[#1a1917]/40 shadow-sm" : "bg-white border-[#dedede]/70 hover:bg-[#fafafa] hover:border-[#b2b2b2]"
                    )}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <PriorityBadge priority={t.priority} />
                      <span className="text-[11px] font-mono font-bold text-[#8a8a8a] truncate">{t.referenceNumber}</span>
                      <span className="ml-auto">
                        <StatusChip status={t.status} />
                      </span>
                    </div>
                    <p className="text-[13px] font-bold text-[#1a1917] leading-snug line-clamp-2">{t.title}</p>
                    <p className="text-[11px] text-[#676767] truncate mt-0.5">
                      <span className="font-semibold">{t.studentName}</span> · {t.categoryLabel}
                    </p>
                    {t.lastMessagePreview && <p className="text-[11px] text-[#a2a2a2] truncate mt-0.5">{t.lastMessagePreview}</p>}
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <OwnershipBadge ownership={t.ownershipType} />
                      {t.blocksExam && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          <ShieldAlert className="size-3" aria-hidden /> Exam blocked
                        </span>
                      )}
                      {waitingMs !== null && t.status !== "resolved" && (
                        <span
                          className={cx(
                            "text-[10px] font-bold px-1.5 py-0.5 rounded-md tabular-nums",
                            longWait ? "bg-rose-50 text-rose-700" : "bg-[#f1f1f1] text-[#676767]"
                          )}
                        >
                          waiting {formatDuration(waitingMs)}
                        </span>
                      )}
                      <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-[#8a8a8a] max-w-[45%] truncate">
                        <UserRound className="size-3 shrink-0" aria-hidden />
                        <span className="truncate">{t.assignedAgentName || "Unassigned"}</span>
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
