import { describe, expect, it, vi } from "vitest";
import { apiFetch } from "../api-client";
import { getRecentFailedRequests } from "../diagnostics-buffer";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("apiFetch", () => {
  it("prefixes the API base URL, sends credentials and the stored bearer token", async () => {
    localStorage.setItem("auth_token", "tok123");
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({}));
    await apiFetch("/api/profile");
    const [url, init] = spy.mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/profile$/);
    expect((init as RequestInit).credentials).toBe("include");
    const h = new Headers((init as RequestInit).headers);
    expect(h.get("Authorization")).toBe("Bearer tok123");
    expect(h.get("Content-Type")).toBe("application/json");
  });

  it("does not force a JSON content type on FormData uploads", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({}));
    await apiFetch("/api/upload", { method: "POST", body: new FormData() });
    expect(new Headers((spy.mock.calls[0]![1] as RequestInit).headers).has("Content-Type")).toBe(false);
  });

  it("keeps an explicit Authorization header and records failed requests", async () => {
    localStorage.setItem("auth_token", "stored");
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ message: "nope" }, 503));
    const res = await apiFetch("/api/broken?x=1", { headers: { Authorization: "Bearer explicit" } });
    expect(res.status).toBe(503);
    expect(new Headers((spy.mock.calls[0]![1] as RequestInit).headers).get("Authorization")).toBe("Bearer explicit");
    expect(getRecentFailedRequests().some((r) => r.path === "/api/broken" && r.status === 503)).toBe(true);
  });
});
