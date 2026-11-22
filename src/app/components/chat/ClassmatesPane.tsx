import React, { useMemo, useState } from "react";
import { Check, Clock, Loader2, Mail, MessageCircle, Search, UserCheck, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "../../utils/api-client";

export type FriendStatus = "none" | "outgoing" | "incoming" | "friends";

export interface Classmate {
  id: string;
  name: string;
  email: string;
  rollNumber?: string | null;
  section?: string | null;
  department?: string | null;
  friendStatus: FriendStatus;
  requestId: string | null;
}

export interface FriendRequestRow {
  id: string;
  sender?: { id: string; name: string; email: string; rollNumber?: string | null };
  receiver?: { id: string; name: string; email: string; rollNumber?: string | null };
}

const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1917]/30";

async function call(path: string, init: RequestInit) {
  const res = await apiFetch(path, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || "Something went wrong.");
  return body;
}

/** Classmates of the signed-in student, with friend requests and quick actions. */
export function ClassmatesPane({
  section,
  classmates,
  incoming,
  loading,
  backButton,
  onChanged,
  onMessage,
}: {
  section: string | null;
  classmates: Classmate[];
  incoming: FriendRequestRow[];
  loading: boolean;
  backButton?: React.ReactNode;
  onChanged: () => void;
  onMessage: (c: Classmate) => void;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (key: string, path: string, init: RequestInit, success: string) => {
    setBusy(key);
    try {
      const body = await call(path, init);
      toast.success(body.message || success);
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };
  const send = (c: Classmate) =>
    act(c.id, "/api/chat/friend-requests", { method: "POST", body: JSON.stringify({ receiverId: c.id }) }, `Request sent to ${c.name}`);
  const respond = (key: string, requestId: string, action: "accept" | "decline" | "cancel") =>
    act(key, `/api/chat/friend-requests/${requestId}/action`, { method: "POST", body: JSON.stringify({ action }) }, "Done");

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () => classmates.filter((c) => !q || [c.name, c.email, c.rollNumber].some((f) => (f || "").toLowerCase().includes(q))),
    [classmates, q],
  );
  const friends = classmates.filter((c) => c.friendStatus === "friends").length;

  return (
    <>
      <header className="h-16 shrink-0 px-4 flex items-center gap-3 bg-[#fafafa] border-b border-[#ebebeb]">
        {backButton}
        <div className="size-10 rounded-full bg-[#1a1917] text-white flex items-center justify-center shrink-0" aria-hidden="true">
          <Users className="size-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-[#111111] truncate">Classmates{section ? ` · ${section}` : ""}</h2>
          <p className="text-[12px] text-[#8a8a8a] truncate">
            {classmates.length} classmate{classmates.length === 1 ? "" : "s"} · {friends} friend{friends === 1 ? "" : "s"}
            {incoming.length > 0 ? ` · ${incoming.length} request${incoming.length === 1 ? "" : "s"} waiting` : ""}
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto min-h-0 p-4 md:p-6 bg-[#fafafa]">
        <div className="max-w-4xl mx-auto space-y-6">
          {!section ? (
            <div className="rounded-2xl border border-dashed border-[#dedede] bg-white p-8 text-center text-[13px] text-[#676767]">
              Add your section to your profile to see your classmates.
            </div>
          ) : (
            <>
              {incoming.length > 0 && (
                <section aria-labelledby="friend-requests-title" className="space-y-2">
                  <h3 id="friend-requests-title" className="text-[12px] font-bold uppercase tracking-wider text-[#8a8a8a]">
                    Friend requests
                  </h3>
                  <ul className="space-y-2">
                    {incoming.map((r) => (
                      <li key={r.id} className="flex items-center gap-3 rounded-2xl border border-[#ebebeb] bg-white p-3">
                        <div className="size-10 rounded-full bg-[#f4f4f4] border border-[#ebebeb] flex items-center justify-center text-xs font-bold text-[#1a1917] shrink-0" aria-hidden="true">
                          {initials(r.sender?.name ?? "")}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13.5px] font-semibold text-[#111111]">{r.sender?.name}</div>
                          <div className="truncate text-[11.5px] text-[#8a8a8a]">{r.sender?.rollNumber || r.sender?.email} · wants to be friends</div>
                        </div>
                        <button
                          type="button"
                          disabled={!!busy}
                          onClick={() => respond(`in-${r.id}`, r.id, "accept")}
                          className={`inline-flex h-9 items-center gap-1 rounded-lg bg-[#1a1917] px-3 text-[12px] font-semibold text-white hover:bg-[#333] disabled:opacity-50 ${focusRing}`}
                        >
                          {busy === `in-${r.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Accept
                        </button>
                        <button
                          type="button"
                          disabled={!!busy}
                          onClick={() => respond(`in-${r.id}`, r.id, "decline")}
                          aria-label={`Decline ${r.sender?.name}`}
                          className={`inline-flex h-9 items-center rounded-lg border border-[#dedede] bg-white px-2.5 text-[#676767] hover:bg-[#f4f4f4] disabled:opacity-50 ${focusRing}`}
                        >
                          <X className="size-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section aria-labelledby="classmates-title" className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 id="classmates-title" className="text-[12px] font-bold uppercase tracking-wider text-[#8a8a8a]">
                    Your section
                  </h3>
                  <label className="relative w-full sm:w-72">
                    <span className="sr-only">Search classmates</span>
                    <Search className="size-4 text-[#8a8a8a] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search by name, roll number or email"
                      className="w-full h-10 rounded-lg bg-white border border-[#dedede] pl-9 pr-3 text-base md:text-[13px] text-[#1a1917] placeholder:text-[#8a8a8a] outline-none focus:border-[#1a1917]"
                    />
                  </label>
                </div>
                <p className="text-[12.5px] text-[#676767]">
                  Send a friend request to a classmate. Once they accept, you can chat privately from your chat list.
                </p>

                {loading && classmates.length === 0 ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-[12.5px] text-[#8a8a8a]">
                    <Loader2 className="size-4 animate-spin" /> Loading classmates…
                  </div>
                ) : visible.length === 0 ? (
                  <div className="py-12 text-center text-[12.5px] text-[#8a8a8a]">
                    <Users className="size-6 mx-auto mb-2 text-[#c4c4c4]" aria-hidden="true" />
                    {classmates.length === 0 ? "No other students are registered in your section yet." : "No classmates match your search."}
                  </div>
                ) : (
                  <ul role="list" className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {visible.map((c) => (
                      <li key={c.id} className="flex flex-col justify-between gap-3 rounded-2xl border border-[#ebebeb] bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-sm">
                        <div className="flex items-start gap-3">
                          <div className="size-11 rounded-full bg-[#f4f4f4] border border-[#ebebeb] flex items-center justify-center text-xs font-bold uppercase text-[#1a1917] shrink-0" aria-hidden="true">
                            {initials(c.name)}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-[13.5px] font-semibold text-[#111111]">{c.name}</div>
                            <div className="truncate text-[12px] text-[#8a8a8a]">{c.rollNumber || c.section || "Classmate"}</div>
                            <div className="mt-1 flex min-w-0 items-center gap-1 text-[11.5px] text-[#676767]">
                              <Mail className="size-3 shrink-0" aria-hidden="true" />
                              <span className="truncate">{c.email}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 border-t border-[#f0f0f0] pt-3">
                          {c.friendStatus === "none" && (
                            <button
                              type="button"
                              disabled={!!busy}
                              onClick={() => send(c)}
                              className={`inline-flex h-10 items-center gap-1 rounded-lg bg-[#1a1917] px-3 text-[12px] font-semibold text-white hover:bg-[#333] disabled:opacity-50 ${focusRing}`}
                            >
                              {busy === c.id ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" aria-hidden="true" />}
                              Add friend
                            </button>
                          )}
                          {c.friendStatus === "outgoing" && (
                            <>
                              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                                <Clock className="size-3" aria-hidden="true" /> Request sent
                              </span>
                              <button
                                type="button"
                                disabled={!!busy || !c.requestId}
                                onClick={() => c.requestId && respond(c.id, c.requestId, "cancel")}
                                className={`text-[12px] font-semibold text-[#676767] hover:text-[#1a1917] disabled:opacity-50 ${focusRing}`}
                              >
                                Cancel
                              </button>
                            </>
                          )}
                          {c.friendStatus === "incoming" && (
                            <button
                              type="button"
                              disabled={!!busy || !c.requestId}
                              onClick={() => c.requestId && respond(c.id, c.requestId, "accept")}
                              className={`inline-flex h-10 items-center gap-1 rounded-lg bg-emerald-600 px-3 text-[12px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 ${focusRing}`}
                            >
                              {busy === c.id ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Accept request
                            </button>
                          )}
                          {c.friendStatus === "friends" && (
                            <>
                              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                                <UserCheck className="size-3" aria-hidden="true" /> Friends
                              </span>
                              <button
                                type="button"
                                onClick={() => onMessage(c)}
                                className={`inline-flex h-10 items-center gap-1 rounded-lg border border-[#dedede] bg-white px-3 text-[12px] font-semibold text-[#1a1917] hover:bg-[#f4f4f4] ${focusRing}`}
                              >
                                <MessageCircle className="size-3.5" aria-hidden="true" /> Message
                              </button>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}
