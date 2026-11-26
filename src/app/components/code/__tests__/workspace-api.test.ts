import { describe, expect, it, vi } from "vitest";
import { flushCodingDrafts, readLocalDraft, registerCodingFlusher, workspacePath, writeLocalDraft } from "../workspace-api";

describe("coding workspace helpers", () => {
  it("builds encoded workspace paths", () => {
    expect(workspacePath("a/1", "q 2")).toBe("/attempts/a%2F1/questions/q%202");
  });

  it("mirrors drafts per attempt, question and language in localStorage", () => {
    expect(readLocalDraft("a1", "q1", "cpp")).toBeNull();
    writeLocalDraft("a1", "q1", "cpp", "int main(){}");
    writeLocalDraft("a1", "q1", "python", "print(1)");
    expect(readLocalDraft("a1", "q1", "cpp")?.code).toBe("int main(){}");
    expect(readLocalDraft("a1", "q1", "python")?.code).toBe("print(1)");
    expect(typeof readLocalDraft("a1", "q1", "cpp")?.updatedAt).toBe("number");
  });

  it("ignores corrupted local drafts", () => {
    localStorage.setItem("vigil-code:a1:q1:java", "{not json");
    expect(readLocalDraft("a1", "q1", "java")).toBeNull();
    localStorage.setItem("vigil-code:a1:q1:c", JSON.stringify({ code: 5 }));
    expect(readLocalDraft("a1", "q1", "c")).toBeNull();
  });

  it("flushes every registered workspace before exam submission, and unregisters", async () => {
    const a = vi.fn().mockResolvedValue(undefined);
    const b = vi.fn().mockRejectedValue(new Error("offline"));
    const offA = registerCodingFlusher(a);
    const offB = registerCodingFlusher(b);
    await expect(flushCodingDrafts()).resolves.toBeUndefined();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    offA();
    offB();
    await flushCodingDrafts();
    expect(a).toHaveBeenCalledTimes(1);
  });

  it("never waits longer than the timeout for a hung save", async () => {
    const off = registerCodingFlusher(() => new Promise(() => {}));
    const start = Date.now();
    await flushCodingDrafts(50);
    expect(Date.now() - start).toBeLessThan(1000);
    off();
  });
});
