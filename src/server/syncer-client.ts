import type { CcrJob, Cluster, CreateJobRequest, Syncer, SyncerApiResult } from "../shared/types.js";

export class SyncerApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public payload?: unknown
  ) {
    super(message);
  }
}

function baseUrl(syncer: Syncer) {
  return `http://${syncer.host}:${syncer.port}`;
}

function errorMessage(payload: SyncerApiResult) {
  const details = payload.error_msg ?? payload.err_msg ?? payload.ErrMsgs;
  if (Array.isArray(details)) return details.join("; ");
  return details ? String(details) : "Syncer API 返回失败";
}

function unwrap<T>(payload: SyncerApiResult<T>) {
  if (payload.success === false) {
    throw new SyncerApiError(errorMessage(payload), undefined, payload);
  }
  return (payload.data ?? payload.result ?? payload) as T;
}

async function request<T>(syncer: Syncer, path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(`${baseUrl(syncer)}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(8000)
  });

  const text = await response.text();
  const payload = parseSyncerPayload<T>(text, response.ok);
  if (!response.ok) {
    const message = typeof payload === "string" ? payload : errorMessage(payload);
    throw new SyncerApiError(`Syncer API HTTP ${response.status}: ${message}`, response.status, payload);
  }
  if (typeof payload === "string") return payload as T;
  return unwrap<T>(payload);
}

function parseSyncerPayload<T>(text: string, ok: boolean): SyncerApiResult<T> | string {
  if (!text) return { success: ok } as SyncerApiResult<T>;
  try {
    return JSON.parse(text) as SyncerApiResult<T>;
  } catch {
    return text;
  }
}

function buildCreatePayload(input: CreateJobRequest, source: Cluster, target: Cluster) {
  return {
    name: input.name,
    src: {
      host: source.host,
      port: String(source.queryPort),
      thrift_port: String(source.thriftPort),
      user: source.user,
      password: source.password ?? "",
      database: input.sourceDatabase,
      table: input.syncType === "table" ? input.sourceTable : undefined
    },
    dest: {
      host: target.host,
      port: String(target.queryPort),
      thrift_port: String(target.thriftPort),
      user: target.user,
      password: target.password ?? "",
      database: input.targetDatabase,
      table: input.syncType === "table" ? input.targetTable : undefined
    }
  };
}

export class SyncerClient {
  async version(syncer: Syncer) {
    return request<{ version?: string } | string>(syncer, "/version");
  }

  async listJobs(syncer: Syncer) {
    return request<unknown>(syncer, "/list_jobs");
  }

  async createJob(syncer: Syncer, input: CreateJobRequest, source: Cluster, target: Cluster) {
    return request(syncer, "/create_ccr", {
      method: "POST",
      body: JSON.stringify(buildCreatePayload(input, source, target))
    });
  }

  async jobStatus(syncer: Syncer, jobName: string) {
    return this.postName(syncer, "/job_status", jobName);
  }

  async lag(syncer: Syncer, jobName: string) {
    return this.postName(syncer, "/get_lag", jobName);
  }

  async pause(syncer: Syncer, jobName: string) {
    return this.postName(syncer, "/pause", jobName);
  }

  async resume(syncer: Syncer, jobName: string) {
    return this.postName(syncer, "/resume", jobName);
  }

  async delete(syncer: Syncer, jobName: string) {
    return this.postName(syncer, "/delete", jobName);
  }

  async desync(syncer: Syncer, jobName: string) {
    return this.postName(syncer, "/desync", jobName);
  }

  private async postName(syncer: Syncer, path: string, jobName: string) {
    return request(syncer, path, {
      method: "POST",
      body: JSON.stringify({ name: jobName })
    });
  }
}

export function stringifySyncerValue(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const maybeRecord = value as Record<string, unknown>;
    if (typeof maybeRecord.version === "string") return maybeRecord.version;
    if (typeof maybeRecord.status === "string") return maybeRecord.status;
    if (typeof maybeRecord.lag === "string" || typeof maybeRecord.lag === "number") return String(maybeRecord.lag);
  }
  return JSON.stringify(value);
}
