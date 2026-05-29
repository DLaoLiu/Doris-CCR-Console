import { describe, expect, it } from "vitest";
import { isValidCcrJobName } from "./validation";

describe("CCR job name validation", () => {
  it("accepts Doris-compatible ASCII job names", () => {
    expect(isValidCcrJobName("sync_cz")).toBe(true);
    expect(isValidCcrJobName("ccr_job_01")).toBe(true);
  });

  it("rejects Chinese names and names that start with numbers", () => {
    expect(isValidCcrJobName("同步cz")).toBe(false);
    expect(isValidCcrJobName("01_job")).toBe(false);
  });
});
