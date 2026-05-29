import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AppConfig } from "./config.js";
import { AppDatabase } from "./db.js";
import { createApp } from "./app.js";
import type { SyncerClient } from "./syncer-client.js";

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
});
