export type ClusterRole = "source" | "target";
export type CcrSyncType = "database" | "table";
export type JobOperation =
  | "create"
  | "pause"
  | "resume"
  | "delete"
  | "desync"
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
