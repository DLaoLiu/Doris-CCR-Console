import type { DiagnosticSeverity, JobDiagnostic, JobLifecycle } from "../shared/types.js";

type DiagnosticRule = {
  pattern: RegExp;
  severity: DiagnosticSeverity;
  title: string;
  summary: string;
  suggestion: string;
  retryable: boolean;
};

const rules: DiagnosticRule[] = [
  {
    pattern: /dest table .* already exists/i,
    severity: "error",
    title: "目标表已存在",
    summary: "表级 CCR 创建时目标表不能提前存在，Syncer 会尝试创建目标表并因此失败。",
    suggestion: "删除或改名目标表，或在创建任务时换一个不存在的目标表名。",
    retryable: true
  },
  {
    pattern: /enable_feature_binlog\s*=\s*false/i,
    severity: "error",
    title: "FE 未启用 CCR Binlog",
    summary: "源端或目标端 FE 配置里的 enable_feature_binlog 为 false，CCR 无法正常创建或推进。",
    suggestion: "在对应 FE 的 fe.conf 中设置 enable_feature_binlog=true，重启或滚动重启 FE 后重新预检。",
    retryable: true
  },
  {
    pattern: /job name does not match|任务名必须|regex of doris/i,
    severity: "error",
    title: "CCR 任务名不合法",
    summary: "Doris CCR 对任务名有严格限制，当前名称无法被 Syncer 接受。",
    suggestion: "使用英文字母开头，只包含英文字母、数字和下划线的名称，例如 sync_cz 或 ccr_job_01。",
    retryable: true
  },
  {
    pattern: /cannot unmarshal number|invalid character|unexpected token|json:/i,
    severity: "error",
    title: "Syncer 请求格式不兼容",
    summary: "Syncer 无法解析控制台发送的 JSON，通常是字段类型或版本协议不匹配。",
    suggestion: "检查 Syncer 版本和请求字段；端口应按字符串传给 Syncer。升级后端后重新提交。",
    retryable: true
  },
  {
    pattern: /\bEOF\b|socket hang up|ECONNRESET|fetch failed/i,
    severity: "warning",
    title: "Syncer 连接中断",
    summary: "控制台向 Syncer 请求状态或延迟时连接被提前关闭，可能是 Syncer 正在重启、任务尚未就绪或网络不稳定。",
    suggestion: "先确认 Syncer 进程和端口可用，稍后刷新任务；如果持续出现，请查看 Syncer 日志。",
    retryable: true
  },
  {
    pattern: /state\(RESTORE\).*not NORMAL|not NORMAL.*ALTER|Do not allow doing ALTER/i,
    severity: "error",
    title: "表状态不是 NORMAL",
    summary: "Doris 表处于 RESTORE 等非 NORMAL 状态，Syncer 无法执行 CCR 需要的 ALTER 操作。",
    suggestion: "等待恢复任务完成，确认表状态恢复 NORMAL 后再执行 desync 或重新创建同步。",
    retryable: true
  },
  {
    pattern: /binlog.*(not enable|disabled|false)|binlog_enable.*false/i,
    severity: "error",
    title: "源库或源表未开启 Binlog",
    summary: "CCR 依赖源端库表 Binlog，未开启时无法进行增量同步。",
    suggestion: "按 Doris CCR 文档为源库或源表开启 binlog.enable=true，然后重新预检。",
    retryable: true
  },
  {
    pattern: /access denied|denied|privilege|permission/i,
    severity: "error",
    title: "账号权限不足",
    summary: "当前 Doris 账号没有执行 CCR 所需的查询或管理权限。",
    suggestion: "为源端和目标端账号补齐库表查询、ALTER、CCR 相关权限后重试。",
    retryable: true
  }
];

export function diagnoseMessage(message: string | undefined, source?: string): JobDiagnostic[] {
  if (!message) return [];
  const matched = rules
    .filter((rule) => rule.pattern.test(message))
    .map((rule) => ({
      severity: rule.severity,
      title: rule.title,
      summary: rule.summary,
      suggestion: rule.suggestion,
      retryable: rule.retryable,
      source: source ? `${source}: ${message}` : message
    }));

  if (matched.length) return matched;
  return [
    {
      severity: "warning",
      title: "未分类的 CCR 异常",
      summary: "控制台收到了 Doris 或 Syncer 返回的异常，但暂时没有匹配到明确规则。",
      suggestion: "查看原始错误和 Syncer 日志，确认网络、任务状态、库表状态和账号权限。",
      retryable: true,
      source: source ? `${source}: ${message}` : message
    }
  ];
}

export function inferLifecycle(status?: string, error?: string): JobLifecycle {
  const value = `${status ?? ""} ${error ?? ""}`;
  if (/ended_desynced|desync|desynced|ended/i.test(value)) return "desynced";
  if (/paused|pause/i.test(value)) return "paused";
  if (/fail|error|exception|denied|not normal|EOF/i.test(value)) return "failed";
  if (/running|normal|success|ok/i.test(value)) return "running";
  return "unknown";
}
