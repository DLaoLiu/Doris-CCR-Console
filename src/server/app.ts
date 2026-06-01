import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { existsSync } from "node:fs";
import path from "node:path";
import type { AppConfig } from "./config.js";
import { AppDatabase } from "./db.js";
import { testClusterConnectivity } from "./connectivity.js";
import { diagnoseMessage, inferLifecycle } from "./diagnostics.js";
import { MySqlDorisInspector, type DorisInspector } from "./doris-inspector.js";
import { runPreflight } from "./preflight.js";
import { SyncerApiError, SyncerClient, stringifySyncerValue } from "./syncer-client.js";
import type { CreateJobRequest, JobOperation } from "../shared/types.js";
import { CCR_JOB_NAME_HELP, isValidCcrJobName } from "../shared/validation.js";

function asNumber(value: unknown) {
  return Number(value);
}

function requireString(value: unknown, name: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} 不能为空`);
  }
  return value.trim();
}

function requestMessage(error: unknown) {
  if (error instanceof SyncerApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

export function createApp(config: AppConfig, db = new AppDatabase(config), syncerClient = new SyncerClient(), inspector: DorisInspector = new MySqlDorisInspector()) {
  const app = Fastify({ logger: true });
  app.register(cors, { origin: true });

  const webDir = path.join(process.cwd(), "dist-web");
  if (existsSync(webDir)) {
    app.register(fastifyStatic, { root: webDir, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.raw.url?.startsWith("/api")) {
        reply.code(404).send({ message: "API 不存在" });
        return;
      }
      reply.sendFile("index.html");
    });
  }

  app.get("/api/health", async () => ({ ok: true }));

  app.get("/api/dashboard", async () => {
    const syncers = db.listSyncers();
    const jobs = db.listJobs();
    const unhealthySyncers = syncers.filter((item) => item.lastHealth === "unhealthy").length;
    const abnormalJobs = jobs.filter((job) => job.lastStatus && !/running|success|normal/i.test(job.lastStatus)).length;
    const maxLag = jobs.map((job) => Number(job.lastLag)).filter(Number.isFinite).sort((a, b) => b - a)[0] ?? 0;
    return { syncerCount: syncers.length, jobCount: jobs.length, unhealthySyncers, abnormalJobs, maxLag };
  });

  app.get("/api/clusters", async () => db.listClusters());
  app.post("/api/clusters", async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const cluster = db.createCluster({
      name: requireString(body.name, "集群名称"),
      role: body.role === "target" ? "target" : "source",
      host: requireString(body.host, "Host"),
      queryPort: asNumber(body.queryPort),
      thriftPort: asNumber(body.thriftPort),
      user: requireString(body.user, "用户"),
      password: typeof body.password === "string" ? body.password : ""
    });
    reply.code(201);
    return cluster;
  });
  app.put("/api/clusters/:id", async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const cluster = db.updateCluster(Number(id), {
      name: typeof body.name === "string" ? body.name : undefined,
      role: body.role === "source" || body.role === "target" ? body.role : undefined,
      host: typeof body.host === "string" ? body.host : undefined,
      queryPort: body.queryPort ? asNumber(body.queryPort) : undefined,
      thriftPort: body.thriftPort ? asNumber(body.thriftPort) : undefined,
      user: typeof body.user === "string" ? body.user : undefined,
      password: typeof body.password === "string" && body.password !== "******" ? body.password : undefined
    });
    if (!cluster) throw new Error("集群不存在");
    return cluster;
  });
  app.delete("/api/clusters/:id", async (request) => {
    const { id } = request.params as { id: string };
    return { deleted: db.deleteCluster(Number(id)) };
  });
  app.post("/api/clusters/test", async (request) => {
    const body = request.body as Record<string, unknown>;
    const result = await testClusterConnectivity({
      id: 0,
      name: typeof body.name === "string" ? body.name : "draft",
      role: body.role === "target" ? "target" : "source",
      host: requireString(body.host, "Host"),
      queryPort: asNumber(body.queryPort),
      thriftPort: asNumber(body.thriftPort),
      user: typeof body.user === "string" ? body.user : "",
      password: typeof body.password === "string" ? body.password : "",
      createdAt: "",
      updatedAt: ""
    });
    db.addLog("test_cluster", result.ok, result.results.map((item) => item.message).join("; "));
    return result;
  });
  app.post("/api/clusters/:id/test", async (request) => {
    const { id } = request.params as { id: string };
    const cluster = db.getCluster(Number(id), true);
    if (!cluster) throw new Error("集群不存在");
    const result = await testClusterConnectivity(cluster);
    db.addLog("test_cluster", result.ok, result.results.map((item) => item.message).join("；"));
    return result;
  });

  app.get("/api/syncers", async () => db.listSyncers());
  app.post("/api/syncers", async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const syncer = db.createSyncer({
      name: requireString(body.name, "Syncer 名称"),
      host: requireString(body.host, "Host"),
      port: asNumber(body.port)
    });
    reply.code(201);
    return syncer;
  });
  app.put("/api/syncers/:id", async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const syncer = db.updateSyncer(Number(id), {
      name: typeof body.name === "string" ? body.name : undefined,
      host: typeof body.host === "string" ? body.host : undefined,
      port: body.port ? asNumber(body.port) : undefined
    });
    if (!syncer) throw new Error("Syncer 不存在");
    return syncer;
  });
  app.delete("/api/syncers/:id", async (request) => {
    const { id } = request.params as { id: string };
    return { deleted: db.deleteSyncer(Number(id)) };
  });
  app.post("/api/syncers/test", async (request) => {
    const body = request.body as Record<string, unknown>;
    const syncer = {
      id: 0,
      name: typeof body.name === "string" ? body.name : "draft",
      host: requireString(body.host, "Host"),
      port: asNumber(body.port),
      lastHealth: "unknown" as const,
      createdAt: "",
      updatedAt: ""
    };
    try {
      const version = await syncerClient.version(syncer);
      const versionText = stringifySyncerValue(version);
      db.addLog("test_syncer", true, `Syncer version: ${versionText}`);
      return { version: versionText };
    } catch (error) {
      db.addLog("test_syncer", false, requestMessage(error));
      throw error;
    }
  });
  app.get("/api/syncers/:id/version", async (request) => {
    const { id } = request.params as { id: string };
    const syncer = db.getSyncer(Number(id));
    if (!syncer) throw new Error("Syncer 不存在");
    try {
      const version = await syncerClient.version(syncer);
      const versionText = stringifySyncerValue(version);
      const updated = db.updateSyncer(syncer.id, { lastHealth: "healthy", lastVersion: versionText });
      db.addLog("test_syncer", true, `Syncer 版本：${versionText}`);
      return { version: versionText, syncer: updated };
    } catch (error) {
      db.updateSyncer(syncer.id, { lastHealth: "unhealthy" });
      db.addLog("test_syncer", false, requestMessage(error));
      throw error;
    }
  });

  app.get("/api/ccr/jobs", async (request) => {
    const query = request.query as { syncerId?: string };
    if (!query.syncerId) return { localJobs: db.listJobs(), remoteJobs: null };
    const syncer = db.getSyncer(Number(query.syncerId));
    if (!syncer) throw new Error("Syncer 不存在");
    return { localJobs: db.listJobs().filter((job) => job.syncerId === syncer.id), remoteJobs: await syncerClient.listJobs(syncer) };
  });

  app.post("/api/ccr/preflight", async (request) => {
    const input = request.body as CreateJobRequest;
    const report = await runPreflight(db, syncerClient, inspector, input);
    const failedCount = report.checks.filter((item) => item.status === "failed").length;
    const warningCount = report.checks.filter((item) => item.status === "warning").length;
    db.addLog("preflight", report.ok, `预检完成：${failedCount} 个失败，${warningCount} 个警告`, input.name);
    return report;
  });

  app.post("/api/ccr/jobs", async (request, reply) => {
    const input = request.body as CreateJobRequest;
    const jobName = typeof input.name === "string" ? input.name : undefined;
    try {
      validateJobInput(input);
      const syncer = db.getSyncer(input.syncerId);
      const source = db.getCluster(input.sourceClusterId, true);
      const target = db.getCluster(input.targetClusterId, true);
      if (!syncer || !source || !target) throw new Error("Syncer 或集群不存在");
      await syncerClient.createJob(syncer, input, source, target);
      const job = db.createJob(input);
      db.addLog("create", true, "CCR 任务创建成功", input.name);
      await refreshJobSnapshot(db, syncerClient, syncer, job.name);
      reply.code(201);
      return db.getJobByName(job.name) ?? job;
    } catch (error) {
      db.addLog("create", false, requestMessage(error), jobName);
      if (jobName) {
        db.replaceDiagnostics(jobName, diagnoseMessage(requestMessage(error), "创建任务"));
      }
      throw error;
    }
  });

  app.get("/api/ccr/jobs/:name/detail", async (request) => {
    const { name } = request.params as { name: string };
    const job = db.getJobByName(name);
    if (!job) throw new Error("任务不存在");
    const metrics = db.listMetrics(name, 100);
    return {
      job,
      metrics,
      diagnostics: db.listDiagnostics(name),
      logs: db.listLogs({ jobName: name }),
      rawSnapshot: {
        status: metrics[0]?.rawStatus,
        lag: metrics[0]?.rawLag
      }
    };
  });

  app.get("/api/ccr/jobs/:name/metrics", async (request) => {
    const { name } = request.params as { name: string };
    const query = request.query as { limit?: string };
    return db.listMetrics(name, Number(query.limit ?? 100));
  });

  app.post("/api/ccr/jobs/:name/refresh", async (request) => {
    const { name } = request.params as { name: string };
    const { syncer, job } = requireJobContext(db, name);
    const result = await refreshJobSnapshot(db, syncerClient, syncer, job.name);
    db.addLog("refresh", result.success, result.errorMessage ?? "状态和延迟已刷新", job.name);
    return result;
  });

  app.get("/api/ccr/jobs/:name/status", async (request) => {
    const { name } = request.params as { name: string };
    try {
      const { syncer, job } = requireJobContext(db, name);
      const status = await syncerClient.jobStatus(syncer, job.name);
      const statusText = stringifySyncerValue(status);
      db.updateJobSnapshot(job.name, { lastStatus: statusText, lifecycle: inferLifecycle(statusText), lastCheckedAt: new Date().toISOString() });
      db.addMetric({ jobName: job.name, status: statusText, success: true, rawStatus: rawText(status) });
      db.replaceDiagnostics(job.name, []);
      db.addLog("refresh_status", true, statusText, job.name);
      return { status: statusText };
    } catch (error) {
      db.addLog("refresh_status", false, requestMessage(error), name);
      db.updateJobSnapshot(name, { lifecycle: "failed", lastError: requestMessage(error), lastCheckedAt: new Date().toISOString() });
      db.addMetric({ jobName: name, success: false, errorMessage: requestMessage(error) });
      db.replaceDiagnostics(name, diagnoseMessage(requestMessage(error), "刷新状态"));
      throw error;
    }
  });

  app.get("/api/ccr/jobs/:name/lag", async (request) => {
    const { name } = request.params as { name: string };
    try {
      const { syncer, job } = requireJobContext(db, name);
      const lag = await syncerClient.lag(syncer, job.name);
      const lagText = stringifySyncerValue(lag);
      db.updateJobSnapshot(job.name, { lastLag: lagText, lastCheckedAt: new Date().toISOString() });
      db.addMetric({ jobName: job.name, lag: lagText, success: true, rawLag: rawText(lag) });
      db.replaceDiagnostics(job.name, []);
      db.addLog("refresh_lag", true, lagText, job.name);
      return { lag: lagText };
    } catch (error) {
      db.addLog("refresh_lag", false, requestMessage(error), name);
      db.updateJobSnapshot(name, { lifecycle: "failed", lastError: requestMessage(error), lastCheckedAt: new Date().toISOString() });
      db.addMetric({ jobName: name, success: false, errorMessage: requestMessage(error) });
      db.replaceDiagnostics(name, diagnoseMessage(requestMessage(error), "刷新延迟"));
      throw error;
    }
  });

  for (const action of ["pause", "resume", "delete", "desync"] as const) {
    app.post(`/api/ccr/jobs/:name/${action}`, async (request) => {
      const { name } = request.params as { name: string };
      try {
        const { syncer, job } = requireJobContext(db, name);
        await syncerClient[action](syncer, job.name);
        const nextStatus = actionStatus(action);
        if (action === "delete") {
          db.deleteJob(job.name);
        } else if (nextStatus) {
          const lifecycle = action === "desync" ? "desynced" : inferLifecycle(nextStatus);
          db.updateJobSnapshot(job.name, { lastStatus: nextStatus, lifecycle, lastCheckedAt: new Date().toISOString() });
          db.addMetric({ jobName: job.name, status: nextStatus, success: true, rawStatus: nextStatus });
          if (action !== "desync") {
            const refreshResult = await refreshJobSnapshot(db, syncerClient, syncer, job.name);
            if (!refreshResult.success) {
              db.addLog("refresh", false, `操作已发送，但远端状态未确认：${refreshResult.errorMessage}`, job.name);
            }
          }
        }
        db.addLog(action as JobOperation, true, nextStatus ?? `${action} 成功`, job.name);
        return { ok: true };
      } catch (error) {
        db.addLog(action as JobOperation, false, requestMessage(error), name);
        throw error;
      }
    });
  }

  app.get("/api/operation-logs", async (request) => {
    const query = request.query as { jobName?: string; action?: JobOperation };
    return db.listLogs(query);
  });

  app.setErrorHandler((error, _request, reply) => {
    const status = error instanceof SyncerApiError && error.status ? error.status : 400;
    reply.code(status).send({ message: requestMessage(error), payload: error instanceof SyncerApiError ? error.payload : undefined });
  });

  app.addHook("onClose", async () => db.close());
  return app;
}

function validateJobInput(input: CreateJobRequest) {
  const jobName = requireString(input.name, "任务名");
  if (!isValidCcrJobName(jobName)) {
    throw new Error(CCR_JOB_NAME_HELP);
  }
  requireString(input.sourceDatabase, "源库");
  requireString(input.targetDatabase, "目标库");
  if (input.syncType === "table") {
    requireString(input.sourceTable, "源表");
    requireString(input.targetTable, "目标表");
  }
}

function actionStatus(action: "pause" | "resume" | "delete" | "desync") {
  if (action === "pause") return "paused";
  if (action === "resume") return "running";
  if (action === "desync") return "ended_desynced";
  return undefined;
}

function rawText(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

async function refreshJobSnapshot(db: AppDatabase, syncerClient: SyncerClient, syncer: NonNullable<ReturnType<AppDatabase["getSyncer"]>>, jobName: string) {
  let statusText: string | undefined;
  let lagText: string | undefined;
  let rawStatus: string | undefined;
  let rawLag: string | undefined;
  const errors: string[] = [];

  try {
    const status = await syncerClient.jobStatus(syncer, jobName);
    statusText = stringifySyncerValue(status);
    rawStatus = rawText(status);
    db.addLog("refresh_status", true, statusText, jobName);
  } catch (error) {
    const message = requestMessage(error);
    errors.push(message);
    db.addLog("refresh_status", false, message, jobName);
  }

  try {
    const lag = await syncerClient.lag(syncer, jobName);
    lagText = stringifySyncerValue(lag);
    rawLag = rawText(lag);
    db.addLog("refresh_lag", true, lagText, jobName);
  } catch (error) {
    const message = requestMessage(error);
    errors.push(message);
    db.addLog("refresh_lag", false, message, jobName);
  }

  const errorMessage = errors.join("；") || undefined;
  const success = errors.length === 0;
  db.updateJobSnapshot(jobName, {
    lastStatus: statusText,
    lastLag: lagText,
    lifecycle: inferLifecycle(statusText, errorMessage),
    lastError: errorMessage,
    lastCheckedAt: new Date().toISOString()
  });
  db.addMetric({ jobName, status: statusText, lag: lagText, success, errorMessage, rawStatus, rawLag });
  db.replaceDiagnostics(jobName, errorMessage ? diagnoseMessage(errorMessage, "刷新任务") : []);
  return { success, status: statusText, lag: lagText, errorMessage, diagnostics: db.listDiagnostics(jobName) };
}

function requireJobContext(db: AppDatabase, name: string) {
  const job = db.getJobByName(name);
  if (!job) throw new Error("任务不存在");
  const syncer = db.getSyncer(job.syncerId);
  if (!syncer) throw new Error("任务关联的 Syncer 不存在");
  return { job, syncer };
}
