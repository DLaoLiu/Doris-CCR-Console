import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AppDatabase } from "./db.js";
import type { AppConfig } from "./config.js";

let tempDir: string | undefined;

function createDb() {
  tempDir = mkdtempSync(path.join(os.tmpdir(), "ccr-console-"));
  const config: AppConfig = {
    host: "127.0.0.1",
    port: 3100,
    dataDir: tempDir,
    dbPath: path.join(tempDir, "test.db"),
    secret: Buffer.from("01234567890123456789012345678901")
  };
  return new AppDatabase(config);
}

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

describe("AppDatabase", () => {
  it("stores encrypted cluster credentials and masks list responses", () => {
    const db = createDb();
    const cluster = db.createCluster({
      name: "source",
      role: "source",
      host: "127.0.0.1",
      queryPort: 9030,
      thriftPort: 9020,
      user: "root",
      password: "secret"
    });

    expect(cluster?.password).toBe("******");
    expect(db.getCluster(cluster!.id, true)?.password).toBe("secret");
    expect(db.listClusters()[0].password).toBe("******");
    db.close();
  });

  it("writes CCR jobs and operation logs", () => {
    const db = createDb();
    const source = db.createCluster({ name: "source", role: "source", host: "s", queryPort: 9030, thriftPort: 9020, user: "root", password: "" })!;
    const target = db.createCluster({ name: "target", role: "target", host: "t", queryPort: 9030, thriftPort: 9020, user: "root", password: "" })!;
    const syncer = db.createSyncer({ name: "syncer", host: "127.0.0.1", port: 9190 })!;

    db.createJob({
      name: "job1",
      syncerId: syncer.id,
      sourceClusterId: source.id,
      targetClusterId: target.id,
      syncType: "database",
      sourceDatabase: "db1",
      targetDatabase: "db2"
    });
    db.addLog("create", true, "created", "job1");

    expect(db.listJobs()).toHaveLength(1);
    expect(db.listLogs({ jobName: "job1" })[0].message).toBe("created");
    db.close();
  });
});
