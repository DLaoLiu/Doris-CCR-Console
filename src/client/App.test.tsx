import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfigProvider, App as AntApp } from "antd";
import App from "./App";

function mockFetch() {
  const responses: Record<string, unknown> = {
    "/api/dashboard": { syncerCount: 1, jobCount: 0, unhealthySyncers: 0, abnormalJobs: 0, maxLag: 0 },
    "/api/clusters": [],
    "/api/syncers": [],
    "/api/ccr/jobs": { localJobs: [], remoteJobs: null },
    "/api/operation-logs?": []
  };
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      const payload = responses[url] ?? [];
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(payload)),
        json: () => Promise.resolve(payload)
      });
    })
  );
}

describe("App", () => {
  it("renders dashboard and loads API data", async () => {
    mockFetch();
    render(
      <ConfigProvider>
        <AntApp>
          <App />
        </AntApp>
      </ConfigProvider>
    );

    expect(screen.getByText("Doris CCR Console")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Syncer 实例")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("1")).toBeInTheDocument());
  });

  it("opens job detail drawer with metrics and diagnostics", async () => {
    const responses: Record<string, unknown> = {
      "/api/dashboard": { syncerCount: 1, jobCount: 1, unhealthySyncers: 0, abnormalJobs: 0, maxLag: 279 },
      "/api/clusters": [
        { id: 1, name: "source", role: "source", host: "127.0.0.1", queryPort: 9030, thriftPort: 9020, user: "root", password: "******", createdAt: "", updatedAt: "" },
        { id: 2, name: "target", role: "target", host: "127.0.0.1", queryPort: 9030, thriftPort: 9020, user: "root", password: "******", createdAt: "", updatedAt: "" }
      ],
      "/api/syncers": [{ id: 1, name: "syncer", host: "127.0.0.1", port: 9190, lastHealth: "healthy", lastVersion: "2.1.0", createdAt: "", updatedAt: "" }],
      "/api/ccr/jobs": {
        localJobs: [
          {
            id: 1,
            name: "sync_cz",
            syncerId: 1,
            sourceClusterId: 1,
            targetClusterId: 2,
            syncType: "database",
            sourceDatabase: "src",
            targetDatabase: "dst",
            lastStatus: "running",
            lastLag: "279",
            lifecycle: "running",
            createdAt: "",
            updatedAt: ""
          }
        ],
        remoteJobs: null
      },
      "/api/operation-logs?": [],
      "/api/ccr/jobs/sync_cz/detail": {
        job: {
          id: 1,
          name: "sync_cz",
          syncerId: 1,
          sourceClusterId: 1,
          targetClusterId: 2,
          syncType: "database",
          sourceDatabase: "src",
          targetDatabase: "dst",
          lastStatus: "running",
          lastLag: "279",
          lifecycle: "running",
          createdAt: "",
          updatedAt: ""
        },
        metrics: [{ id: 1, jobName: "sync_cz", status: "running", lag: "279", success: true, rawStatus: "{\"status\":\"running\"}", rawLag: "{\"lag\":279}", createdAt: "2026-05-29T03:20:08.568Z" }],
        diagnostics: [{ severity: "warning", title: "Syncer 连接中断", summary: "EOF", suggestion: "稍后刷新", retryable: true, source: "EOF" }],
        logs: [],
        rawSnapshot: { status: "{\"status\":\"running\"}", lag: "{\"lag\":279}" }
      }
    };
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const payload = responses[String(input)] ?? [];
        return Promise.resolve({ ok: true, text: () => Promise.resolve(JSON.stringify(payload)) });
      })
    );

    render(
      <ConfigProvider>
        <AntApp>
          <App />
        </AntApp>
      </ConfigProvider>
    );

    await waitFor(() => expect(screen.getByText("任务")).toBeInTheDocument());
    fireEvent.click(screen.getByText("任务"));
    await waitFor(() => expect(screen.getByText("sync_cz")).toBeInTheDocument());
    fireEvent.click(screen.getByText("详情"));

    await waitFor(() => expect(screen.getByText("延迟历史")).toBeInTheDocument());
    expect(screen.getByText("Syncer 连接中断")).toBeInTheDocument();
    expect(screen.getAllByText("279").length).toBeGreaterThan(0);
  });
});
