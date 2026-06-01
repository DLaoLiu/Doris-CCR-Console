import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AppConfig } from "./config.js";
import { AppDatabase } from "./db.js";
import { createApp } from "./app.js";
import type { SyncerClient } from "./syncer-client.js";
import type { DorisInspector } from "./doris-inspector.js";

let tempDir: string | undefined;

function createConfig(): AppConfig {
  tempDir = mkdtempSync(path.join(os.tmpdir(), "ccr-console-app-"));
  return {
    host: "127.0.0.1",
    port: 3100,
    dataDir: tempDir,
    dbPath: path.join(tempDir, "test.db"),
    secret: Buffer.from("01234567890123456789012345678901")
  };
}

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe("CCR job API logging", () => {
  it("logs Syncer create failures to operation logs", async () => {
    const config = createConfig();
    const db = new AppDatabase(config);
    const source = db.createCluster({ name: "source", role: "source", host: "10.10.10.114", queryPort: 9030, thriftPort: 9020, user: "root", password: "" })!;
    const target = db.createCluster({ name: "target", role: "target", host: "10.10.10.115", queryPort: 9030, thriftPort: 9020, user: "root", password: "" })!;
    const syncer = db.createSyncer({ name: "syncer", host: "127.0.0.1", port: 9190 })!;
    const fakeSyncerClient = {
      createJob: async () => {
        throw new Error("Fe 10.10.10.114:9030 enable_feature_binlog=false, please set it true in fe.conf");
      }
    } as unknown as SyncerClient;
    const app = createApp(config, db, fakeSyncerClient);

    const response = await app.inject({
      method: "POST",
      url: "/api/ccr/jobs",
      payload: {
        name: "sync_cz",
        syncerId: syncer.id,
        sourceClusterId: source.id,
        targetClusterId: target.id,
        syncType: "database",
        sourceDatabase: "src",
        targetDatabase: "dst"
      }
    });

    expect(response.statusCode).toBe(400);
    const logs = db.listLogs({ jobName: "sync_cz", action: "create" });
    expect(logs[0]).toMatchObject({
      action: "create",
      success: false,
      message: "Fe 10.10.10.114:9030 enable_feature_binlog=false, please set it true in fe.conf"
    });
    await app.close();
  });

  it("refreshes status and lag after creating a job", async () => {
    const config = createConfig();
    const db = new AppDatabase(config);
    const source = db.createCluster({ name: "source", role: "source", host: "10.10.10.114", queryPort: 9030, thriftPort: 9020, user: "root", password: "" })!;
    const target = db.createCluster({ name: "target", role: "target", host: "10.10.10.115", queryPort: 9030, thriftPort: 9020, user: "root", password: "" })!;
    const syncer = db.createSyncer({ name: "syncer", host: "127.0.0.1", port: 9190 })!;
    const fakeSyncerClient = {
      createJob: async () => ({ ok: true }),
      jobStatus: async () => ({ status: "running" }),
      lag: async () => ({ lag: 0 })
    } as unknown as SyncerClient;
    const app = createApp(config, db, fakeSyncerClient);

    const response = await app.inject({
      method: "POST",
      url: "/api/ccr/jobs",
      payload: {
        name: "sync_cz",
        syncerId: syncer.id,
        sourceClusterId: source.id,
        targetClusterId: target.id,
        syncType: "database",
        sourceDatabase: "src",
        targetDatabase: "dst"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ name: "sync_cz", lastStatus: "running", lastLag: "0" });
    expect(db.listLogs({ jobName: "sync_cz" }).map((log) => log.action)).toEqual(["refresh_lag", "refresh_status", "create"]);
    await app.close();
  });

  it("keeps job creation successful when post-create refresh fails", async () => {
    const config = createConfig();
    const db = new AppDatabase(config);
    const source = db.createCluster({ name: "source", role: "source", host: "10.10.10.114", queryPort: 9030, thriftPort: 9020, user: "root", password: "" })!;
    const target = db.createCluster({ name: "target", role: "target", host: "10.10.10.115", queryPort: 9030, thriftPort: 9020, user: "root", password: "" })!;
    const syncer = db.createSyncer({ name: "syncer", host: "127.0.0.1", port: 9190 })!;
    const fakeSyncerClient = {
      createJob: async () => ({ ok: true }),
      jobStatus: async () => {
        throw new Error("status not ready");
      },
      lag: async () => {
        throw new Error("lag not ready");
      }
    } as unknown as SyncerClient;
    const app = createApp(config, db, fakeSyncerClient);

    const response = await app.inject({
      method: "POST",
      url: "/api/ccr/jobs",
      payload: {
        name: "sync_cz",
        syncerId: syncer.id,
        sourceClusterId: source.id,
        targetClusterId: target.id,
        syncType: "database",
        sourceDatabase: "src",
        targetDatabase: "dst"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(db.getJobByName("sync_cz")).toBeTruthy();
    expect(db.listLogs({ jobName: "sync_cz" }).filter((log) => !log.success).map((log) => log.message)).toEqual(["lag not ready", "status not ready"]);
    await app.close();
  });

  it("reflects pause, resume, and desync states locally", async () => {
    const config = createConfig();
    const db = new AppDatabase(config);
    const source = db.createCluster({ name: "source", role: "source", host: "10.10.10.114", queryPort: 9030, thriftPort: 9020, user: "root", password: "" })!;
    const target = db.createCluster({ name: "target", role: "target", host: "10.10.10.115", queryPort: 9030, thriftPort: 9020, user: "root", password: "" })!;
    const syncer = db.createSyncer({ name: "syncer", host: "127.0.0.1", port: 9190 })!;
    db.createJob({
      name: "sync_cz",
      syncerId: syncer.id,
      sourceClusterId: source.id,
      targetClusterId: target.id,
      syncType: "database",
      sourceDatabase: "src",
      targetDatabase: "dst"
    });
    const fakeSyncerClient = {
      pause: async () => ({ ok: true }),
      resume: async () => ({ ok: true }),
      desync: async () => ({ ok: true })
    } as unknown as SyncerClient;
    const app = createApp(config, db, fakeSyncerClient);

    await app.inject({ method: "POST", url: "/api/ccr/jobs/sync_cz/pause" });
    expect(db.getJobByName("sync_cz")?.lastStatus).toBe("paused");

    await app.inject({ method: "POST", url: "/api/ccr/jobs/sync_cz/resume" });
    expect(db.getJobByName("sync_cz")?.lastStatus).toBe("running");

    await app.inject({ method: "POST", url: "/api/ccr/jobs/sync_cz/desync" });
    expect(db.getJobByName("sync_cz")?.lastStatus).toBe("ended_desynced");
    await app.close();
  });

  it("runs preflight checks with warnings and no fake success", async () => {
    const portServer = net.createServer();
    await new Promise<void>((resolve) => portServer.listen(0, "127.0.0.1", resolve));
    const port = (portServer.address() as { port: number }).port;
    const config = createConfig();
    const db = new AppDatabase(config);
    const source = db.createCluster({ name: "source", role: "source", host: "127.0.0.1", queryPort: port, thriftPort: port, user: "root", password: "" })!;
    const target = db.createCluster({ name: "target", role: "target", host: "127.0.0.1", queryPort: port, thriftPort: port, user: "root", password: "" })!;
    const syncer = db.createSyncer({ name: "syncer", host: "127.0.0.1", port: 9190 })!;
    const fakeSyncerClient = {
      version: async () => ({ version: "2.1.0" })
    } as unknown as SyncerClient;
    const fakeInspector: DorisInspector = {
      inspectObject: async (cluster) => ({ connected: true, databaseExists: true, tableExists: cluster.role === "source", binlogEnabled: cluster.role === "source" ? undefined : undefined }),
      listDatabases: async () => [{ name: "src", tableCount: 1 }],
      listTables: async () => [{ name: "tbl" }]
    };
    const app = createApp(config, db, fakeSyncerClient, fakeInspector);

    const response = await app.inject({
      method: "POST",
      url: "/api/ccr/preflight",
      payload: {
        name: "sync_cz",
        syncerId: syncer.id,
        sourceClusterId: source.id,
        targetClusterId: target.id,
        syncType: "table",
        sourceDatabase: "src",
        sourceTable: "tbl",
        targetDatabase: "dst",
        targetTable: "tbl"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, canContinue: true });
    expect(response.json().checks.some((item: { status: string }) => item.status === "warning")).toBe(true);
    expect(db.listLogs({ jobName: "sync_cz", action: "preflight" })[0].success).toBe(true);
    await app.close();
    await new Promise<void>((resolve) => portServer.close(() => resolve()));
  });

  it("expects source table to exist and target table to be absent for table sync preflight", async () => {
    const portServer = net.createServer();
    await new Promise<void>((resolve) => portServer.listen(0, "127.0.0.1", resolve));
    const port = (portServer.address() as { port: number }).port;
    const config = createConfig();
    const db = new AppDatabase(config);
    const source = db.createCluster({ name: "source", role: "source", host: "127.0.0.1", queryPort: port, thriftPort: port, user: "root", password: "" })!;
    const target = db.createCluster({ name: "target", role: "target", host: "127.0.0.1", queryPort: port, thriftPort: port, user: "root", password: "" })!;
    const syncer = db.createSyncer({ name: "syncer", host: "127.0.0.1", port: 9190 })!;
    const fakeSyncerClient = { version: async () => ({ version: "2.1.0" }) } as unknown as SyncerClient;
    const fakeInspector: DorisInspector = {
      inspectObject: async (cluster) => ({
        connected: true,
        databaseExists: true,
        tableExists: cluster.role === "source",
        binlogEnabled: cluster.role === "source" ? true : undefined
      }),
      listDatabases: async () => [{ name: "src", tableCount: 1 }],
      listTables: async () => [{ name: "bfi_imsi" }]
    };
    const app = createApp(config, db, fakeSyncerClient, fakeInspector);

    const response = await app.inject({
      method: "POST",
      url: "/api/ccr/preflight",
      payload: {
        name: "sync_cz",
        syncerId: syncer.id,
        sourceClusterId: source.id,
        targetClusterId: target.id,
        syncType: "table",
        sourceDatabase: "src",
        sourceTable: "bfi_imsi",
        targetDatabase: "dst",
        targetTable: "bfi_imsi"
      }
    });

    expect(response.statusCode).toBe(200);
    const checks = response.json().checks as Array<{ key: string; status: string }>;
    expect(checks.find((item) => item.key === "source_table_exists")).toMatchObject({ status: "passed" });
    expect(checks.find((item) => item.key === "target_table_absent")).toMatchObject({ status: "passed" });
    await app.close();
    await new Promise<void>((resolve) => portServer.close(() => resolve()));
  });

  it("lists Doris databases and tables for a configured cluster", async () => {
    const config = createConfig();
    const db = new AppDatabase(config);
    const source = db.createCluster({ name: "source", role: "source", host: "127.0.0.1", queryPort: 9030, thriftPort: 9020, user: "root", password: "" })!;
    const fakeInspector: DorisInspector = {
      inspectObject: async () => ({ connected: true, databaseExists: true }),
      listDatabases: async () => [
        { name: "bfi_v1", tableCount: 2 },
        { name: "bfi_v2", tableCount: 1 }
      ],
      listTables: async () => [
        { name: "bfi_imsi", type: "BASE TABLE" },
        { name: "bfi_wifi", type: "BASE TABLE" }
      ]
    };
    const app = createApp(config, db, {} as SyncerClient, fakeInspector);

    const databases = await app.inject({ method: "GET", url: `/api/clusters/${source.id}/databases` });
    const tables = await app.inject({ method: "GET", url: `/api/clusters/${source.id}/tables?database=bfi_v1` });

    expect(databases.statusCode).toBe(200);
    expect(databases.json().items).toEqual([{ name: "bfi_v1", tableCount: 2 }, { name: "bfi_v2", tableCount: 1 }]);
    expect(tables.statusCode).toBe(200);
    expect(tables.json().items[0]).toMatchObject({ name: "bfi_imsi", type: "BASE TABLE" });
    await app.close();
  });

  it("stores refresh metrics history and returns job detail", async () => {
    const config = createConfig();
    const db = new AppDatabase(config);
    const source = db.createCluster({ name: "source", role: "source", host: "10.10.10.114", queryPort: 9030, thriftPort: 9020, user: "root", password: "" })!;
    const target = db.createCluster({ name: "target", role: "target", host: "10.10.10.115", queryPort: 9030, thriftPort: 9020, user: "root", password: "" })!;
    const syncer = db.createSyncer({ name: "syncer", host: "127.0.0.1", port: 9190 })!;
    db.createJob({
      name: "sync_cz",
      syncerId: syncer.id,
      sourceClusterId: source.id,
      targetClusterId: target.id,
      syncType: "database",
      sourceDatabase: "src",
      targetDatabase: "dst"
    });
    let lag = 279;
    const fakeSyncerClient = {
      jobStatus: async () => ({ status: "running" }),
      lag: async () => ({ lag: lag === 279 ? lag-- : 0 })
    } as unknown as SyncerClient;
    const app = createApp(config, db, fakeSyncerClient);

    await app.inject({ method: "POST", url: "/api/ccr/jobs/sync_cz/refresh" });
    await app.inject({ method: "POST", url: "/api/ccr/jobs/sync_cz/refresh" });
    const detail = await app.inject({ method: "GET", url: "/api/ccr/jobs/sync_cz/detail" });

    expect(detail.statusCode).toBe(200);
    expect(detail.json().job).toMatchObject({ lastLag: "0", lifecycle: "running" });
    expect(detail.json().metrics.map((metric: { lag: string }) => metric.lag)).toEqual(["0", "279"]);
    await app.close();
  });
});
