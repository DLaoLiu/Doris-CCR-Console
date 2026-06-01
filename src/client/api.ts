import type { CcrJob, Cluster, CreateJobRequest, JobDetail, JobMetric, JobOperation, OperationLog, PreflightReport, Syncer } from "../shared/types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(path, {
    ...init,
    headers
  });
  const text = await response.text();
  const payload = text ? safeJson(text) : {};
  if (!response.ok) {
    throw new Error(payload.message ?? (text || "请求失败"));
  }
  return payload as T;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

export const api = {
  dashboard: () =>
    request<{ syncerCount: number; jobCount: number; unhealthySyncers: number; abnormalJobs: number; maxLag: number }>("/api/dashboard"),
  listClusters: () => request<Cluster[]>("/api/clusters"),
  createCluster: (input: Partial<Cluster>) => request<Cluster>("/api/clusters", { method: "POST", body: JSON.stringify(input) }),
  updateCluster: (id: number, input: Partial<Cluster>) => request<Cluster>(`/api/clusters/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  deleteCluster: (id: number) => request<{ deleted: boolean }>(`/api/clusters/${id}`, { method: "DELETE" }),
  testCluster: (id: number) => request<{ ok: boolean; results: Array<{ port: number; ok: boolean; message: string }> }>(`/api/clusters/${id}/test`, { method: "POST" }),
  testClusterDraft: (input: Partial<Cluster>) =>
    request<{ ok: boolean; results: Array<{ port: number; ok: boolean; message: string }> }>("/api/clusters/test", { method: "POST", body: JSON.stringify(input) }),
  listSyncers: () => request<Syncer[]>("/api/syncers"),
  createSyncer: (input: Partial<Syncer>) => request<Syncer>("/api/syncers", { method: "POST", body: JSON.stringify(input) }),
  updateSyncer: (id: number, input: Partial<Syncer>) => request<Syncer>(`/api/syncers/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  deleteSyncer: (id: number) => request<{ deleted: boolean }>(`/api/syncers/${id}`, { method: "DELETE" }),
  testSyncer: (id: number) => request<{ version: string; syncer: Syncer }>(`/api/syncers/${id}/version`),
  testSyncerDraft: (input: Partial<Syncer>) => request<{ version: string }>("/api/syncers/test", { method: "POST", body: JSON.stringify(input) }),
  listJobs: () => request<{ localJobs: CcrJob[]; remoteJobs: unknown }>("/api/ccr/jobs"),
  preflightJob: (input: CreateJobRequest) => request<PreflightReport>("/api/ccr/preflight", { method: "POST", body: JSON.stringify(input) }),
  createJob: (input: CreateJobRequest) => request<CcrJob>("/api/ccr/jobs", { method: "POST", body: JSON.stringify(input) }),
  jobDetail: (name: string) => request<JobDetail>(`/api/ccr/jobs/${encodeURIComponent(name)}/detail`),
  jobMetrics: (name: string, limit = 100) => request<JobMetric[]>(`/api/ccr/jobs/${encodeURIComponent(name)}/metrics?limit=${limit}`),
  refreshJob: (name: string) => request<{ success: boolean; status?: string; lag?: string; errorMessage?: string }>(`/api/ccr/jobs/${encodeURIComponent(name)}/refresh`, { method: "POST" }),
  refreshStatus: (name: string) => request<{ status: string }>(`/api/ccr/jobs/${encodeURIComponent(name)}/status`),
  refreshLag: (name: string) => request<{ lag: string }>(`/api/ccr/jobs/${encodeURIComponent(name)}/lag`),
  pauseJob: (name: string) => request<{ ok: boolean }>(`/api/ccr/jobs/${encodeURIComponent(name)}/pause`, { method: "POST" }),
  resumeJob: (name: string) => request<{ ok: boolean }>(`/api/ccr/jobs/${encodeURIComponent(name)}/resume`, { method: "POST" }),
  deleteJob: (name: string) => request<{ ok: boolean }>(`/api/ccr/jobs/${encodeURIComponent(name)}/delete`, { method: "POST" }),
  desyncJob: (name: string) => request<{ ok: boolean }>(`/api/ccr/jobs/${encodeURIComponent(name)}/desync`, { method: "POST" }),
  listLogs: (filter: { jobName?: string; action?: JobOperation }) => {
    const search = new URLSearchParams();
    if (filter.jobName) search.set("jobName", filter.jobName);
    if (filter.action) search.set("action", filter.action);
    return request<OperationLog[]>(`/api/operation-logs?${search.toString()}`);
  }
};
