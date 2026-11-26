import { describe, expect, it } from "vitest";
import { formatMemory, formatTime, isFinished, VERDICT_LABEL, type Execution } from "../coding-api";

describe("coding-api helpers", () => {
  it("formats memory and time", () => {
    expect(formatMemory(null)).toBe("—");
    expect(formatMemory(512)).toBe("512 KB");
    expect(formatMemory(2048)).toBe("2.0 MB");
    expect(formatTime(12)).toBe("12 ms");
    expect(formatTime(undefined)).toBe("—");
  });

  it("knows when an execution is finished", () => {
    const e = (status: Execution["status"]) => ({ status }) as Execution;
    expect(isFinished(e("completed"))).toBe(true);
    expect(isFinished(e("failed"))).toBe(true);
    expect(isFinished(e("running"))).toBe(false);
  });

  it("describes sandbox failures as not the student's fault", () => {
    expect(VERDICT_LABEL.infra_error).toMatch(/not your code/i);
  });
});
