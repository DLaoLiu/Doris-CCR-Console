import { render, screen, waitFor } from "@testing-library/react";
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
});
