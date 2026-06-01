import { testClusterConnectivity } from "./connectivity.js";
import type { DorisInspector } from "./doris-inspector.js";
import { diagnoseMessage } from "./diagnostics.js";
import type { AppDatabase } from "./db.js";
import { SyncerClient, stringifySyncerValue } from "./syncer-client.js";
import type { CheckStatus, Cluster, CreateJobRequest, PreflightCheck, PreflightReport } from "../shared/types.js";
import { CCR_JOB_NAME_HELP, isValidCcrJobName } from "../shared/validation.js";

function check(key: string, label: string, status: CheckStatus, message: string, suggestion?: string): PreflightCheck {
  return { key, label, status, message, suggestion };
}

function requireId(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function validateShape(input: CreateJobRequest) {
  const checks: PreflightCheck[] = [];
  const name = typeof input.name === "string" ? input.name.trim() : "";
  checks.push(
    isValidCcrJobName(name)
      ? check("job_name", "任务名", "passed", "任务名符合 Doris CCR 规则")
      : check("job_name", "任务名", "failed", CCR_JOB_NAME_HELP, "改成英文字母开头，只包含英文字母、数字和下划线")
  );
  checks.push(requireId(input.syncerId) ? check("syncer_required", "Syncer", "passed", "已选择 Syncer") : check("syncer_required", "Syncer", "failed", "请选择 Syncer"));
  checks.push(requireId(input.sourceClusterId) ? check("source_required", "源集群", "passed", "已选择源集群") : check("source_required", "源集群", "failed", "请选择源集群"));
  checks.push(requireId(input.targetClusterId) ? check("target_required", "目标集群", "passed", "已选择目标集群") : check("target_required", "目标集群", "failed", "请选择目标集群"));
  checks.push(input.sourceDatabase ? check("source_database", "源库", "passed", "已填写源库") : check("source_database", "源库", "failed", "请填写源库"));
  checks.push(input.targetDatabase ? check("target_database", "目标库", "passed", "已填写目标库") : check("target_database", "目标库", "failed", "请填写目标库"));
  if (input.syncType === "table") {
    checks.push(input.sourceTable ? check("source_table", "源表", "passed", "已填写源表") : check("source_table", "源表", "failed", "表级同步必须填写源表"));
    checks.push(input.targetTable ? check("target_table", "目标表", "passed", "已填写目标表") : check("target_table", "目标表", "failed", "表级同步必须填写目标表"));
  }
  return checks;
}

function objectLabel(cluster: Cluster, database: string, table?: string) {
  return `${cluster.name} ${database}${table ? `.${table}` : ""}`;
}

export async function runPreflight(db: AppDatabase, syncerClient: SyncerClient, inspector: DorisInspector, input: CreateJobRequest): Promise<PreflightReport> {
  const checks = validateShape(input);
  const diagnostics = checks.filter((item) => item.status === "failed").flatMap((item) => diagnoseMessage(item.message, item.label));

  const syncer = requireId(input.syncerId) ? db.getSyncer(input.syncerId) : undefined;
  const source = requireId(input.sourceClusterId) ? db.getCluster(input.sourceClusterId, true) : undefined;
  const target = requireId(input.targetClusterId) ? db.getCluster(input.targetClusterId, true) : undefined;

  if (!syncer) checks.push(check("syncer_exists", "Syncer 配置", "failed", "选择的 Syncer 不存在", "刷新页面或重新选择 Syncer"));
  if (!source) checks.push(check("source_exists", "源集群配置", "failed", "选择的源集群不存在", "刷新页面或重新选择源集群"));
  if (!target) checks.push(check("target_exists", "目标集群配置", "failed", "选择的目标集群不存在", "刷新页面或重新选择目标集群"));

  if (syncer) {
    try {
      const version = stringifySyncerValue(await syncerClient.version(syncer));
      checks.push(check("syncer_version", "Syncer 连通性", "passed", `Syncer 可访问，版本：${version}`));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      checks.push(check("syncer_version", "Syncer 连通性", "failed", message, "确认 Syncer 进程、HTTP 端口和防火墙"));
      diagnostics.push(...diagnoseMessage(message, "Syncer 连通性"));
    }
  }

  for (const item of [
    { role: "源集群", cluster: source, database: input.sourceDatabase, table: input.syncType === "table" ? input.sourceTable : undefined, side: "source" as const },
    { role: "目标集群", cluster: target, database: input.targetDatabase, table: input.syncType === "table" ? input.targetTable : undefined, side: "target" as const }
  ]) {
    if (!item.cluster) continue;
    const connectivity = await testClusterConnectivity(item.cluster);
    checks.push(
      connectivity.ok
        ? check(`${item.role}_ports`, `${item.role}端口`, "passed", connectivity.results.map((result) => result.message).join("；"))
        : check(`${item.role}_ports`, `${item.role}端口`, "failed", connectivity.results.map((result) => result.message).join("；"), "确认 FE Query/Thrift 端口和网络连通性")
    );

    if (item.database) {
      const objectCheck = await inspector.inspectObject(item.cluster, item.database, item.table);
      if (!objectCheck.connected) {
        checks.push(check(`${item.role}_mysql`, `${item.role}只读检查`, "failed", objectCheck.message ?? "Doris MySQL 协议连接失败", "确认账号、密码、Query Port 和权限"));
        diagnostics.push(...diagnoseMessage(objectCheck.message, `${item.role}只读检查`));
        continue;
      }
      checks.push(
        objectCheck.databaseExists
          ? check(`${item.role}_database`, `${item.role}数据库`, "passed", `${objectLabel(item.cluster, item.database)} 存在`)
          : check(`${item.role}_database`, `${item.role}数据库`, "failed", `${objectLabel(item.cluster, item.database)} 不存在`, "请先创建数据库或修正库名")
      );
      if (item.table) {
        if (item.side === "source") {
          checks.push(
            objectCheck.tableExists
              ? check("source_table_exists", "源表", "passed", `${objectLabel(item.cluster, item.database, item.table)} 存在`)
              : check("source_table_exists", "源表", "failed", `${objectLabel(item.cluster, item.database, item.table)} 不存在`, "请先确认源表存在或修正源表名")
          );
          if (objectCheck.tableState && !/normal/i.test(objectCheck.tableState)) {
            checks.push(check("source_table_state", "源表状态", "warning", `表状态可能不是 NORMAL：${objectCheck.tableState}`, "确认源表不处于 RESTORE/SCHEMA_CHANGE 等状态"));
          }
          if (objectCheck.binlogEnabled === true) {
            checks.push(check("source_table_binlog", "源表 Binlog", "passed", "SHOW CREATE TABLE 显示 binlog.enable=true"));
          } else if (objectCheck.binlogEnabled === false) {
            checks.push(check("source_table_binlog", "源表 Binlog", "failed", "SHOW CREATE TABLE 显示 binlog.enable 不是 true", "为源表设置 binlog.enable=true"));
          } else {
            checks.push(check("source_table_binlog", "源表 Binlog", "warning", "未能从 SHOW CREATE TABLE 判断 binlog.enable", "请人工确认源库或源表已开启 binlog.enable=true"));
          }
        } else {
          checks.push(
            objectCheck.tableExists
              ? check("target_table_absent", "目标表占用", "failed", `${objectLabel(item.cluster, item.database, item.table)} 已存在，Syncer 会返回 dest table already exists`, "请删除/改名目标表，或换一个不存在的目标表名后再创建表级 CCR")
              : check("target_table_absent", "目标表占用", "passed", `${objectLabel(item.cluster, item.database, item.table)} 不存在，可由 CCR 创建`)
          );
        }
      }
    }
  }

  checks.push(check("fe_binlog", "FE Binlog 配置", "warning", "控制台无法直接读取所有 FE 的 fe.conf", "请确认源端和目标端 FE 已配置 enable_feature_binlog=true"));
  checks.push(check("version_order", "版本兼容", "warning", "控制台只能读取 Syncer 版本，无法完整判断上下游 Doris 版本顺序", "请确认 Syncer >= 下游 Doris >= 上游 Doris"));

  const failed = checks.some((item) => item.status === "failed");
  return {
    ok: !failed,
    canContinue: !failed,
    checkedAt: new Date().toISOString(),
    checks,
    diagnostics
  };
}
