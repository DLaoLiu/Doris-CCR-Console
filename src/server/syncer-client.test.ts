import http from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SyncerClient } from "./syncer-client.js";
import type { Cluster, Syncer } from "../shared/types.js";

let server: http.Server;
let port = 0;
let requests: Array<{ method?: string; url?: string; body: string }> = [];

beforeEach(async () => {
  requests = [];
  server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      requests.push({ method: request.method, url: request.url, body });
      response.setHeader("content-type", "application/json");
      if (request.url === "/version") response.end(JSON.stringify({ success: true, version: "2.1.0" }));
      else response.end(JSON.stringify({ success: true, data: { ok: true } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as { port: number }).port;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const syncer = (): Syncer => ({
  id: 1,
  name: "syncer",
  host: "127.0.0.1",
  port,
  lastHealth: "unknown",
  createdAt: "",
  updatedAt: ""
});

const cluster = (role: "source" | "target"): Cluster => ({
  id: role === "source" ? 1 : 2,
  name: role,
  role,
  host: role,
  queryPort: 9030,
  thriftPort: 9020,
  user: "root",
  password: "pw",
  createdAt: "",
  updatedAt: ""
});

describe("SyncerClient", () => {
  it("calls version endpoint", async () => {
    await new SyncerClient().version(syncer());
    expect(requests[0].url).toBe("/version");
  });

  it("posts create_ccr payload with source and target Doris fields", async () => {
    await new SyncerClient().createJob(
      syncer(),
      {
        name: "job1",
        syncerId: 1,
        sourceClusterId: 1,
        targetClusterId: 2,
        syncType: "table",
        sourceDatabase: "src_db",
        sourceTable: "src_tbl",
        targetDatabase: "dst_db",
        targetTable: "dst_tbl"
      },
      cluster("source"),
      cluster("target")
    );

    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toBe("/create_ccr");
    expect(JSON.parse(requests[0].body)).toMatchObject({
      name: "job1",
      src: { database: "src_db", table: "src_tbl", port: "9030", thrift_port: "9020" },
      dest: { database: "dst_db", table: "dst_tbl", port: "9030", thrift_port: "9020" }
    });
  });

  it("uses name body for task operations", async () => {
    await new SyncerClient().pause(syncer(), "job1");
    expect(requests[0].url).toBe("/pause");
    expect(JSON.parse(requests[0].body)).toEqual({ name: "job1" });
  });

  it("uses POST name body for status and lag endpoints", async () => {
    const client = new SyncerClient();
    await client.jobStatus(syncer(), "job1");
    await client.lag(syncer(), "job1");

    expect(requests[0]).toMatchObject({ method: "POST", url: "/job_status" });
    expect(JSON.parse(requests[0].body)).toEqual({ name: "job1" });
    expect(requests[1]).toMatchObject({ method: "POST", url: "/get_lag" });
    expect(JSON.parse(requests[1].body)).toEqual({ name: "job1" });
  });
});
