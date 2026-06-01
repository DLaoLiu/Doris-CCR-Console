export type ClusterRole = "source" | "target";
export type CcrSyncType = "database" | "table";
export type JobLifecycle = "unknown" | "running" | "paused" | "failed" | "deleted" | "desynced";
export type CheckStatus = "passed" | "warning" | "failed";
export type DiagnosticSeverity = "info" | "warning" | "error";
export type JobOperation =
  | "create"
  | "pause"
  | "resume"
  | "delete"
  | "desync"
  | "preflight"
  | "refresh"
  | "refresh_status"
  | "refresh_lag"
  | "test_cluster"
  | "test_syncer";

export interface Cluster {
  id: number;
  name: string;
  role: ClusterRole;
  host: string;
  queryPort: number;
  thriftPort: number;
  user: string;
  password?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Syncer {
  id: number;
  name: string;
  host: string;
  port: number;
  lastHealth: "unknown" | "healthy" | "unhealthy";
  lastVersion?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CcrJob {
  id: number;
  name: string;
  syncerId: number;
  sourceClusterId: number;
  targetClusterId: number;
  syncType: CcrSyncType;
  sourceDatabase: string;
  sourceTable?: string;
  targetDatabase: string;
  targetTable?: string;
  lastStatus?: string;
  lastLag?: string;
  lifecycle: JobLifecycle;
  lastError?: string;
  lastCheckedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OperationLog {
  id: number;
  jobName?: string;
  action: JobOperation;
  success: boolean;
  message?: string;
  createdAt: string;
}

export interface SyncerApiResult<T = unknown> {
  success: boolean;
  error_msg?: string;
  err_msg?: string;
  ErrMsgs?: string | string[];
  data?: T;
  result?: T;
  [key: string]: unknown;
}

export interface CreateJobRequest {
  name: string;
  syncerId: number;
  sourceClusterId: number;
  targetClusterId: number;
  syncType: CcrSyncType;
  sourceDatabase: string;
  sourceTable?: string;
  targetDatabase: string;
  targetTable?: string;
}

export interface PreflightCheck {
  key: string;
  label: string;
  status: CheckStatus;
  message: string;
  suggestion?: string;
}

export interface PreflightReport {
  ok: boolean;
  canContinue: boolean;
  checkedAt: string;
  checks: PreflightCheck[];
  diagnostics: JobDiagnostic[];
}

export interface JobMetric {
  id: number;
  jobName: string;
  status?: string;
  lag?: string;
  success: boolean;
  errorMessage?: string;
  rawStatus?: string;
  rawLag?: string;
  createdAt: string;
}

export interface JobDiagnostic {
  id?: number;
  jobName?: string;
  severity: DiagnosticSeverity;
  title: string;
  summary: string;
  suggestion: string;
  retryable: boolean;
  source?: string;
  createdAt?: string;
}

export interface JobDetail {
  job: CcrJob;
  metrics: JobMetric[];
  diagnostics: JobDiagnostic[];
  logs: OperationLog[];
  rawSnapshot?: {
    status?: string;
    lag?: string;
  };
}
