import Database from "better-sqlite3";
import type { AppConfig } from "./config.js";
import { decryptText, encryptText } from "./crypto.js";
import type { CcrJob, Cluster, ClusterRole, CreateJobRequest, JobDiagnostic, JobLifecycle, JobMetric, JobOperation, OperationLog, Syncer } from "../shared/types.js";

type Row = Record<string, unknown>;

function now() {
  return new Date().toISOString();
}

function normalizeCluster(row: Row, secret: Buffer): Cluster {
  return {
    id: Number(row.id),
    name: String(row.name),
    role: row.role as ClusterRole,
    host: String(row.host),
    queryPort: Number(row.query_port),
    thriftPort: Number(row.thrift_port),
    user: String(row.user),
    password: decryptText(row.password_encrypted as string, secret),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function safeCluster(cluster: Cluster): Cluster {
  return { ...cluster, password: cluster.password ? "******" : "" };
}

function normalizeSyncer(row: Row): Syncer {
  return {
    id: Number(row.id),
    name: String(row.name),
    host: String(row.host),
    port: Number(row.port),
    lastHealth: (row.last_health as Syncer["lastHealth"]) ?? "unknown",
    lastVersion: row.last_version ? String(row.last_version) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function normalizeLifecycle(row: Row): JobLifecycle {
  const lifecycle = row.lifecycle as JobLifecycle | undefined;
  if (lifecycle && lifecycle !== "unknown") return lifecycle;
  const status = row.last_status ? String(row.last_status) : "";
  if (/ended_desynced|desync|ended/i.test(status)) return "desynced";
  if (/paused|pause/i.test(status)) return "paused";
  if (/fail|error|exception/i.test(status)) return "failed";
  if (/running|normal|success|ok/i.test(status)) return "running";
  return lifecycle ?? "unknown";
}

function normalizeJob(row: Row): CcrJob {
  return {
    id: Number(row.id),
    name: String(row.name),
    syncerId: Number(row.syncer_id),
    sourceClusterId: Number(row.source_cluster_id),
    targetClusterId: Number(row.target_cluster_id),
    syncType: row.sync_type as CcrJob["syncType"],
    sourceDatabase: String(row.source_database),
    sourceTable: row.source_table ? String(row.source_table) : undefined,
    targetDatabase: String(row.target_database),
    targetTable: row.target_table ? String(row.target_table) : undefined,
    lastStatus: row.last_status ? String(row.last_status) : undefined,
    lastLag: row.last_lag ? String(row.last_lag) : undefined,
    lifecycle: normalizeLifecycle(row),
    lastError: row.last_error ? String(row.last_error) : undefined,
    lastCheckedAt: row.last_checked_at ? String(row.last_checked_at) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function normalizeLog(row: Row): OperationLog {
  return {
    id: Number(row.id),
    jobName: row.job_name ? String(row.job_name) : undefined,
    action: row.action as JobOperation,
    success: Boolean(row.success),
    message: row.message ? String(row.message) : undefined,
    createdAt: String(row.created_at)
  };
}

function normalizeMetric(row: Row): JobMetric {
  return {
    id: Number(row.id),
    jobName: String(row.job_name),
    status: row.status ? String(row.status) : undefined,
    lag: row.lag ? String(row.lag) : undefined,
    success: Boolean(row.success),
    errorMessage: row.error_message ? String(row.error_message) : undefined,
    rawStatus: row.raw_status ? String(row.raw_status) : undefined,
    rawLag: row.raw_lag ? String(row.raw_lag) : undefined,
    createdAt: String(row.created_at)
  };
}

function normalizeDiagnostic(row: Row): JobDiagnostic {
  return {
    id: Number(row.id),
    jobName: row.job_name ? String(row.job_name) : undefined,
    severity: row.severity as JobDiagnostic["severity"],
    title: String(row.title),
    summary: String(row.summary),
    suggestion: String(row.suggestion),
    retryable: Boolean(row.retryable),
    source: row.source ? String(row.source) : undefined,
    createdAt: String(row.created_at)
  };
}

export class AppDatabase {
  private db: Database.Database;
  private secret: Buffer;

  constructor(config: AppConfig) {
    this.db = new Database(config.dbPath);
    this.secret = config.secret;
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  close() {
    this.db.close();
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS clusters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('source', 'target')),
        host TEXT NOT NULL,
        query_port INTEGER NOT NULL,
        thrift_port INTEGER NOT NULL,
        user TEXT NOT NULL,
        password_encrypted TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS syncers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        last_health TEXT NOT NULL DEFAULT 'unknown',
        last_version TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ccr_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        syncer_id INTEGER NOT NULL,
        source_cluster_id INTEGER NOT NULL,
        target_cluster_id INTEGER NOT NULL,
        sync_type TEXT NOT NULL CHECK(sync_type IN ('database', 'table')),
        source_database TEXT NOT NULL,
        source_table TEXT,
        target_database TEXT NOT NULL,
        target_table TEXT,
        last_status TEXT,
        last_lag TEXT,
        lifecycle TEXT NOT NULL DEFAULT 'unknown',
        last_error TEXT,
        last_checked_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(syncer_id) REFERENCES syncers(id),
        FOREIGN KEY(source_cluster_id) REFERENCES clusters(id),
        FOREIGN KEY(target_cluster_id) REFERENCES clusters(id)
      );

      CREATE TABLE IF NOT EXISTS operation_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_name TEXT,
        action TEXT NOT NULL,
        success INTEGER NOT NULL,
        message TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS job_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_name TEXT NOT NULL,
        status TEXT,
        lag TEXT,
        success INTEGER NOT NULL,
        error_message TEXT,
        raw_status TEXT,
        raw_lag TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS job_diagnostics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_name TEXT,
        severity TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        suggestion TEXT NOT NULL,
        retryable INTEGER NOT NULL,
        source TEXT,
        created_at TEXT NOT NULL
      );
    `);
    this.addColumnIfMissing("ccr_jobs", "lifecycle", "TEXT NOT NULL DEFAULT 'unknown'");
    this.addColumnIfMissing("ccr_jobs", "last_error", "TEXT");
    this.addColumnIfMissing("ccr_jobs", "last_checked_at", "TEXT");
  }

  private addColumnIfMissing(table: string, column: string, definition: string) {
    const exists = this.db.prepare(`PRAGMA table_info(${table})`).all().some((row) => (row as Row).name === column);
    if (!exists) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  listClusters() {
    return this.db.prepare("SELECT * FROM clusters ORDER BY id DESC").all().map((row) => safeCluster(normalizeCluster(row as Row, this.secret)));
  }

  getCluster(id: number, includePassword = false) {
    const row = this.db.prepare("SELECT * FROM clusters WHERE id = ?").get(id) as Row | undefined;
    if (!row) return undefined;
    const cluster = normalizeCluster(row, this.secret);
    return includePassword ? cluster : safeCluster(cluster);
  }

  createCluster(input: Omit<Cluster, "id" | "createdAt" | "updatedAt">) {
    const ts = now();
    const result = this.db
      .prepare("INSERT INTO clusters (name, role, host, query_port, thrift_port, user, password_encrypted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(input.name, input.role, input.host, input.queryPort, input.thriftPort, input.user, encryptText(input.password ?? "", this.secret), ts, ts);
    return this.getCluster(Number(result.lastInsertRowid));
  }

  updateCluster(id: number, input: Partial<Omit<Cluster, "id" | "createdAt" | "updatedAt">>) {
    const existing = this.getCluster(id, true);
    if (!existing) return undefined;
    const next = { ...existing, ...input };
    this.db
      .prepare("UPDATE clusters SET name = ?, role = ?, host = ?, query_port = ?, thrift_port = ?, user = ?, password_encrypted = ?, updated_at = ? WHERE id = ?")
      .run(next.name, next.role, next.host, next.queryPort, next.thriftPort, next.user, encryptText(next.password ?? "", this.secret), now(), id);
    return this.getCluster(id);
  }

  deleteCluster(id: number) {
    return this.db.prepare("DELETE FROM clusters WHERE id = ?").run(id).changes > 0;
  }

  listSyncers() {
    return this.db.prepare("SELECT * FROM syncers ORDER BY id DESC").all().map((row) => normalizeSyncer(row as Row));
  }

  getSyncer(id: number) {
    const row = this.db.prepare("SELECT * FROM syncers WHERE id = ?").get(id) as Row | undefined;
    return row ? normalizeSyncer(row) : undefined;
  }

  createSyncer(input: Omit<Syncer, "id" | "lastHealth" | "createdAt" | "updatedAt">) {
    const ts = now();
    const result = this.db
      .prepare("INSERT INTO syncers (name, host, port, last_health, last_version, created_at, updated_at) VALUES (?, ?, ?, 'unknown', ?, ?, ?)")
      .run(input.name, input.host, input.port, input.lastVersion ?? null, ts, ts);
    return this.getSyncer(Number(result.lastInsertRowid));
  }

  updateSyncer(id: number, input: Partial<Omit<Syncer, "id" | "createdAt" | "updatedAt">>) {
    const existing = this.getSyncer(id);
    if (!existing) return undefined;
    const next = { ...existing, ...input };
    this.db
      .prepare("UPDATE syncers SET name = ?, host = ?, port = ?, last_health = ?, last_version = ?, updated_at = ? WHERE id = ?")
      .run(next.name, next.host, next.port, next.lastHealth, next.lastVersion ?? null, now(), id);
    return this.getSyncer(id);
  }

  deleteSyncer(id: number) {
    return this.db.prepare("DELETE FROM syncers WHERE id = ?").run(id).changes > 0;
  }

  listJobs() {
    return this.db.prepare("SELECT * FROM ccr_jobs ORDER BY id DESC").all().map((row) => normalizeJob(row as Row));
  }

  getJobByName(name: string) {
    const row = this.db.prepare("SELECT * FROM ccr_jobs WHERE name = ?").get(name) as Row | undefined;
    return row ? normalizeJob(row) : undefined;
  }

  createJob(input: CreateJobRequest) {
    const ts = now();
    const result = this.db
      .prepare(`
        INSERT INTO ccr_jobs (
          name, syncer_id, source_cluster_id, target_cluster_id, sync_type,
          source_database, source_table, target_database, target_table,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        input.name,
        input.syncerId,
        input.sourceClusterId,
        input.targetClusterId,
        input.syncType,
        input.sourceDatabase,
        input.sourceTable ?? null,
        input.targetDatabase,
        input.targetTable ?? null,
        ts,
        ts
      );
    return normalizeJob(this.db.prepare("SELECT * FROM ccr_jobs WHERE id = ?").get(result.lastInsertRowid) as Row);
  }

  updateJobStatus(name: string, patch: Pick<Partial<CcrJob>, "lastStatus" | "lastLag">) {
    return this.updateJobSnapshot(name, patch);
  }

  updateJobSnapshot(name: string, patch: Pick<Partial<CcrJob>, "lastStatus" | "lastLag" | "lifecycle" | "lastError" | "lastCheckedAt">) {
    const job = this.getJobByName(name);
    if (!job) return undefined;
    this.db
      .prepare(
        `UPDATE ccr_jobs
         SET last_status = COALESCE(?, last_status),
             last_lag = COALESCE(?, last_lag),
             lifecycle = COALESCE(?, lifecycle),
             last_error = ?,
             last_checked_at = COALESCE(?, last_checked_at),
             updated_at = ?
         WHERE name = ?`
      )
      .run(patch.lastStatus ?? null, patch.lastLag ?? null, patch.lifecycle ?? null, patch.lastError ?? null, patch.lastCheckedAt ?? null, now(), name);
    return this.getJobByName(name);
  }

  deleteJob(name: string) {
    return this.db.prepare("DELETE FROM ccr_jobs WHERE name = ?").run(name).changes > 0;
  }

  addLog(action: JobOperation, success: boolean, message?: string, jobName?: string) {
    this.db
      .prepare("INSERT INTO operation_logs (job_name, action, success, message, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(jobName ?? null, action, success ? 1 : 0, message ?? null, now());
  }

  addMetric(input: Omit<JobMetric, "id" | "createdAt">) {
    const ts = now();
    this.db
      .prepare("INSERT INTO job_metrics (job_name, status, lag, success, error_message, raw_status, raw_lag, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(input.jobName, input.status ?? null, input.lag ?? null, input.success ? 1 : 0, input.errorMessage ?? null, input.rawStatus ?? null, input.rawLag ?? null, ts);
    return this.listMetrics(input.jobName, 1)[0];
  }

  listMetrics(jobName: string, limit = 100) {
    return this.db
      .prepare("SELECT * FROM job_metrics WHERE job_name = ? ORDER BY id DESC LIMIT ?")
      .all(jobName, limit)
      .map((row) => normalizeMetric(row as Row));
  }

  replaceDiagnostics(jobName: string | undefined, diagnostics: Omit<JobDiagnostic, "id" | "createdAt" | "jobName">[]) {
    if (jobName) {
      this.db.prepare("DELETE FROM job_diagnostics WHERE job_name = ?").run(jobName);
    }
    const ts = now();
    const insert = this.db.prepare(
      "INSERT INTO job_diagnostics (job_name, severity, title, summary, suggestion, retryable, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );
    for (const diagnostic of diagnostics) {
      insert.run(jobName ?? null, diagnostic.severity, diagnostic.title, diagnostic.summary, diagnostic.suggestion, diagnostic.retryable ? 1 : 0, diagnostic.source ?? null, ts);
    }
  }

  listDiagnostics(jobName: string) {
    return this.db
      .prepare("SELECT * FROM job_diagnostics WHERE job_name = ? ORDER BY id DESC LIMIT 50")
      .all(jobName)
      .map((row) => normalizeDiagnostic(row as Row));
  }

  listLogs(filter: { jobName?: string; action?: JobOperation }) {
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (filter.jobName) {
      conditions.push("job_name = ?");
      values.push(filter.jobName);
    }
    if (filter.action) {
      conditions.push("action = ?");
      values.push(filter.action);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    return this.db.prepare(`SELECT * FROM operation_logs ${where} ORDER BY id DESC LIMIT 300`).all(...values).map((row) => normalizeLog(row as Row));
  }
}
