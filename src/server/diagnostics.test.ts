import { describe, expect, it } from "vitest";
import { diagnoseMessage, inferLifecycle } from "./diagnostics.js";

describe("diagnostics", () => {
  it("maps common Doris CCR errors to actionable diagnostics", () => {
    const diagnostics = diagnoseMessage("[normal] Fe 10.10.10.114:9030 enable_feature_binlog=false, please set it true in fe.conf", "create");

    expect(diagnostics[0]).toMatchObject({
      severity: "error",
      title: "FE 未启用 CCR Binlog",
      retryable: true
    });
  });

  it("maps existing destination table errors", () => {
    const diagnostics = diagnoseMessage("[normal] dest table bfi_v2.bfi_imsi already exists", "create");

    expect(diagnostics[0]).toMatchObject({
      severity: "error",
      title: "目标表已存在",
      retryable: true
    });
  });

  it("infers normalized lifecycle from raw status text", () => {
    expect(inferLifecycle("paused")).toBe("paused");
    expect(inferLifecycle("running")).toBe("running");
    expect(inferLifecycle("ended_desynced")).toBe("desynced");
    expect(inferLifecycle(undefined, "EOF")).toBe("failed");
  });
});
