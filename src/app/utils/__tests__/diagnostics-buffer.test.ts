import { describe, expect, it } from "vitest";
import { getRecentFailedRequests, recordFailedRequest } from "../diagnostics-buffer";

describe("diagnostics buffer", () => {
  it("stores only the path (no host, query or fragment) and caps at 10 entries", () => {
    for (let i = 0; i < 12; i++) recordFailedRequest(`https://api.example.com/api/x/${i}?token=SECRET#frag`, 500);
    const items = getRecentFailedRequests();
    expect(items).toHaveLength(10);
    expect(items[0]!.path).toBe("/api/x/2");
    expect(items.at(-1)!.path).toBe("/api/x/11");
    expect(JSON.stringify(items)).not.toContain("SECRET");
  });

  it("returns copies so callers cannot mutate the buffer", () => {
    recordFailedRequest("/api/y", 404);
    const a = getRecentFailedRequests();
    a[a.length - 1]!.path = "changed";
    expect(getRecentFailedRequests().at(-1)!.path).toBe("/api/y");
  });
});
