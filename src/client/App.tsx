import {
  Alert,
  App as AntApp,
  AutoComplete,
  Button,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Layout,
  List,
  Menu,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography
} from "antd";
import {
  ApiOutlined,
  CloudSyncOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  FileSearchOutlined,
  InfoCircleOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined
} from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import logoUrl from "./assets/ccr-logo-app.png";
import type { CcrJob, CheckStatus, Cluster, CreateJobRequest, DorisDatabaseMetadata, DorisTableMetadata, JobDetail, JobDiagnostic, JobMetric, JobOperation, OperationLog, PreflightReport, Syncer } from "../shared/types";
import { CCR_JOB_NAME_HELP, CCR_JOB_NAME_PATTERN } from "../shared/validation";

type PageKey = "dashboard" | "clusters" | "syncers" | "jobs" | "logs";

const { Sider, Content } = Layout;

export default function App() {
  const { message, modal } = AntApp.useApp();
  const [page, setPage] = useState<PageKey>("dashboard");
  const [loading, setLoading] = useState(false);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [syncers, setSyncers] = useState<Syncer[]>([]);
  const [jobs, setJobs] = useState<CcrJob[]>([]);
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [clusterModal, setClusterModal] = useState<Cluster | null | "new">(null);
  const [syncerModal, setSyncerModal] = useState<Syncer | null | "new">(null);
  const [jobModalOpen, setJobModalOpen] = useState(false);
  const [jobDetailName, setJobDetailName] = useState<string>();
  const [jobDetail, setJobDetail] = useState<JobDetail>();
  const [dashboard, setDashboard] = useState({
    syncerCount: 0,
    jobCount: 0,
    unhealthySyncers: 0,
    abnormalJobs: 0,
    maxLag: 0
  });

  const refreshAll = async () => {
    setLoading(true);
    try {
      const [dashboardResult, clusterResult, syncerResult, jobsResult, logResult] = await Promise.all([
        api.dashboard(),
        api.listClusters(),
        api.listSyncers(),
        api.listJobs(),
        api.listLogs({})
      ]);
      setDashboard(dashboardResult);
      setClusters(clusterResult);
      setSyncers(syncerResult);
      setJobs(jobsResult.localJobs);
      setLogs(logResult);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshAll();
  }, []);

  const run = async <T,>(task: () => Promise<T>, successText: string) => {
    setLoading(true);
    try {
      const result = await task();
      message.success(successText);
      await refreshAll();
      if (jobDetailName) {
        await loadJobDetail(jobDetailName);
      }
      return result;
    } catch (error) {
      message.error(error instanceof Error ? error.message : "操作失败");
      return undefined;
    } finally {
      setLoading(false);
    }
  };

  const loadJobDetail = async (name: string) => {
    const detail = await api.jobDetail(name);
    setJobDetailName(name);
    setJobDetail(detail);
  };

  const openJobDetail = async (name: string) => {
    setLoading(true);
    try {
      await loadJobDetail(name);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "任务详情加载失败");
    } finally {
      setLoading(false);
    }
  };

  const menuItems = [
    { key: "dashboard", icon: <CloudSyncOutlined />, label: "仪表盘" },
    { key: "clusters", icon: <DatabaseOutlined />, label: "集群" },
    { key: "syncers", icon: <ApiOutlined />, label: "Syncer" },
    { key: "jobs", icon: <PlayCircleOutlined />, label: "任务" },
    { key: "logs", icon: <FileSearchOutlined />, label: "日志" }
  ];

  const sourceOptions = clusters.filter((item) => item.role === "source").map((item) => ({ value: item.id, label: item.name }));
  const targetOptions = clusters.filter((item) => item.role === "target").map((item) => ({ value: item.id, label: item.name }));
  const syncerOptions = syncers.map((item) => ({ value: item.id, label: item.name }));

  return (
    <Layout className="app-shell">
      <Sider className="app-sider" width={210}>
        <div className="brand">
          <img className="brand-logo" src={logoUrl} alt="" aria-hidden="true" />
          <span>Doris CCR Console</span>
        </div>
        <Menu theme="light" mode="inline" selectedKeys={[page]} items={menuItems} onClick={(item) => setPage(item.key as PageKey)} />
      </Sider>
      <Content className="content">
        {page === "dashboard" && <Dashboard dashboard={dashboard} syncers={syncers} jobs={jobs} onRefresh={refreshAll} loading={loading} />}
        {page === "clusters" && <ClustersPage clusters={clusters} loading={loading} onRun={run} onEdit={setClusterModal} />}
        {page === "syncers" && <SyncersPage syncers={syncers} loading={loading} onRun={run} onEdit={setSyncerModal} />}
        {page === "jobs" && (
          <JobsPage
            syncers={syncers}
            jobs={jobs}
            loading={loading}
            onRun={run}
            onCreate={() => setJobModalOpen(true)}
            onDetail={openJobDetail}
            confirmDesync={(job) =>
              modal.confirm({
                title: `结束同步关系：${job.name}`,
                content: "desync 会结束 CCR 同步关系，结束后不可恢复，只能重新创建任务。请确认该任务不再需要继续增量同步。",
                okText: "确认结束同步",
                okButtonProps: { danger: true },
                cancelText: "取消",
                onOk: () => run(() => api.desyncJob(job.name), "已结束同步关系")
              })
            }
          />
        )}
        {page === "logs" && <LogsPage logs={logs} jobs={jobs} loading={loading} onFilter={async (filter) => setLogs(await api.listLogs(filter))} />}
      </Content>

      <Modal title={clusterModal && clusterModal !== "new" ? "编辑集群" : "新增集群"} open={clusterModal !== null} footer={null} onCancel={() => setClusterModal(null)} destroyOnHidden width={560}>
        <ClusterForm
          record={clusterModal && clusterModal !== "new" ? clusterModal : undefined}
          onCancel={() => setClusterModal(null)}
          onTest={async (values) => {
            const result = await api.testClusterDraft(values);
            message[result.ok ? "success" : "warning"](result.results.map((item) => item.message).join("；"));
          }}
          onSubmit={(values) =>
            run(
              () => (clusterModal && clusterModal !== "new" ? api.updateCluster(clusterModal.id, values) : api.createCluster(values)),
              clusterModal && clusterModal !== "new" ? "集群已更新" : "集群已创建"
            ).then(() => setClusterModal(null))
          }
        />
      </Modal>

      <Modal title={syncerModal && syncerModal !== "new" ? "编辑 Syncer" : "新增 Syncer"} open={syncerModal !== null} footer={null} onCancel={() => setSyncerModal(null)} destroyOnHidden width={520}>
        <SyncerForm
          record={syncerModal && syncerModal !== "new" ? syncerModal : undefined}
          onCancel={() => setSyncerModal(null)}
          onTest={async (values) => {
            const result = await api.testSyncerDraft(values);
            message.success(`Syncer 连接成功，版本：${result.version}`);
          }}
          onSubmit={(values) =>
            run(
              () => (syncerModal && syncerModal !== "new" ? api.updateSyncer(syncerModal.id, values) : api.createSyncer(values)),
              syncerModal && syncerModal !== "new" ? "Syncer 已更新" : "Syncer 已创建"
            ).then(() => setSyncerModal(null))
          }
        />
      </Modal>

      <Modal title="创建 CCR 任务" open={jobModalOpen} footer={null} onCancel={() => setJobModalOpen(false)} destroyOnHidden width={980}>
        <JobForm
          syncers={syncerOptions}
          sources={sourceOptions}
          targets={targetOptions}
          onCancel={() => setJobModalOpen(false)}
          onPreflight={api.preflightJob}
          onListDatabases={api.listClusterDatabases}
          onListTables={api.listClusterTables}
          onSubmit={(values) => run(() => api.createJob(values), "CCR 任务已创建").then(() => setJobModalOpen(false))}
        />
      </Modal>

      <JobDetailDrawer
        open={Boolean(jobDetailName)}
        detail={jobDetail}
        syncers={syncers}
        clusters={clusters}
        loading={loading}
        onClose={() => {
          setJobDetailName(undefined);
          setJobDetail(undefined);
        }}
        onRefresh={() => jobDetailName && run(() => api.refreshJob(jobDetailName), "任务快照已刷新")}
      />
    </Layout>
  );
}

function Dashboard({
  dashboard,
  syncers,
  jobs,
  loading,
  onRefresh
}: {
  dashboard: { syncerCount: number; jobCount: number; unhealthySyncers: number; abnormalJobs: number; maxLag: number };
  syncers: Syncer[];
  jobs: CcrJob[];
  loading: boolean;
  onRefresh: () => Promise<void>;
}) {
  return (
    <>
      <div className="toolbar">
        <h1 className="page-title">仪表盘</h1>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void onRefresh()}>
          刷新
        </Button>
      </div>
      <div className="metric-grid">
        <Metric label="Syncer 实例" value={dashboard.syncerCount} />
        <Metric label="CCR 任务" value={dashboard.jobCount} />
        <Metric label="异常 Syncer" value={dashboard.unhealthySyncers} tone="danger" />
        <Metric label="最大延迟" value={dashboard.maxLag} />
      </div>
      <div className="panel">
        <Typography.Title level={5}>最近任务</Typography.Title>
        <Table size="small" rowKey="id" loading={loading} dataSource={jobs.slice(0, 8)} pagination={false} columns={jobColumns(syncers)} />
      </div>
    </>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: "danger" }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value" style={{ color: tone === "danger" && value > 0 ? "#c2410c" : undefined }}>
        {value}
      </div>
    </div>
  );
}

function ClustersPage({
  clusters,
  loading,
  onRun,
  onEdit
}: {
  clusters: Cluster[];
  loading: boolean;
  onRun: <T>(task: () => Promise<T>, success: string) => Promise<T | undefined>;
  onEdit: (record: Cluster | "new") => void;
}) {
  return (
    <>
      <div className="toolbar">
        <h1 className="page-title">集群管理</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => onEdit("new")}>
          新增集群
        </Button>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={clusters}
        columns={[
          { title: "名称", dataIndex: "name" },
          { title: "角色", dataIndex: "role", render: (role) => <Tag color={role === "source" ? "blue" : "green"}>{role === "source" ? "源端" : "目标端"}</Tag> },
          { title: "Host", dataIndex: "host" },
          { title: "Query Port", dataIndex: "queryPort" },
          { title: "Thrift Port", dataIndex: "thriftPort" },
          { title: "用户", dataIndex: "user" },
          {
            title: "操作",
            render: (_, record) => (
              <Space>
                <Button size="small" onClick={() => onEdit(record)}>
                  编辑
                </Button>
                <Button size="small" onClick={() => void onRun(() => api.testCluster(record.id), "连通性测试完成")}>
                  测试
                </Button>
                <Popconfirm title="删除该集群？" onConfirm={() => void onRun(() => api.deleteCluster(record.id), "集群已删除")}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            )
          }
        ]}
      />
    </>
  );
}

function ClusterForm({
  record,
  onSubmit,
  onCancel,
  onTest
}: {
  record?: Cluster;
  onSubmit: (values: Partial<Cluster>) => Promise<void>;
  onCancel: () => void;
  onTest: (values: Partial<Cluster>) => Promise<void>;
}) {
  const { message } = AntApp.useApp();
  const [form] = Form.useForm();
  const [testing, setTesting] = useState(false);

  const testCurrent = async () => {
    try {
      const values = await form.validateFields(["host", "queryPort", "thriftPort", "name", "role", "user", "password"]);
      setTesting(true);
      await onTest(values);
    } catch (error) {
      if (error instanceof Error) message.error(error.message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Form form={form} layout="vertical" initialValues={record ?? { role: "source", queryPort: 9030, thriftPort: 9020 }} onFinish={onSubmit}>
      <Form.Item name="name" label="集群名称" rules={[{ required: true }]}>
        <Input />
      </Form.Item>
      <Form.Item name="role" label="角色" rules={[{ required: true }]}>
        <Select options={[{ value: "source", label: "源端" }, { value: "target", label: "目标端" }]} />
      </Form.Item>
      <Form.Item name="host" label="FE Host" rules={[{ required: true }]}>
        <Input />
      </Form.Item>
      <Space.Compact block>
        <Form.Item name="queryPort" label="FE Query Port" rules={[{ required: true }]} style={{ width: "50%" }}>
          <InputNumber min={1} max={65535} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="thriftPort" label="FE Thrift Port" rules={[{ required: true }]} style={{ width: "50%" }}>
          <InputNumber min={1} max={65535} style={{ width: "100%" }} />
        </Form.Item>
      </Space.Compact>
      <Form.Item name="user" label="用户" rules={[{ required: true }]}>
        <Input />
      </Form.Item>
      <Form.Item name="password" label="密码">
        <Input.Password placeholder={record ? "留空保持原密码" : undefined} />
      </Form.Item>
      <Space className="form-actions">
        <Button onClick={onCancel}>取消</Button>
        <Button onClick={() => void testCurrent()} loading={testing}>
          测试
        </Button>
        <Button htmlType="submit" type="primary">
          保存
        </Button>
      </Space>
    </Form>
  );
}

function SyncersPage({
  syncers,
  loading,
  onRun,
  onEdit
}: {
  syncers: Syncer[];
  loading: boolean;
  onRun: <T>(task: () => Promise<T>, success: string) => Promise<T | undefined>;
  onEdit: (record: Syncer | "new") => void;
}) {
  return (
    <>
      <div className="toolbar">
        <h1 className="page-title">Syncer 管理</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => onEdit("new")}>
          新增 Syncer
        </Button>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={syncers}
        columns={[
          { title: "名称", dataIndex: "name" },
          { title: "地址", render: (_, record) => `${record.host}:${record.port}` },
          { title: "健康", dataIndex: "lastHealth", render: healthTag },
          { title: "版本", dataIndex: "lastVersion", render: (value) => value || "-" },
          {
            title: "操作",
            render: (_, record) => (
              <Space>
                <Button size="small" onClick={() => onEdit(record)}>
                  编辑
                </Button>
                <Button size="small" onClick={() => void onRun(() => api.testSyncer(record.id), "Syncer 测试完成")}>
                  测试
                </Button>
                <Popconfirm title="删除该 Syncer？" onConfirm={() => void onRun(() => api.deleteSyncer(record.id), "Syncer 已删除")}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            )
          }
        ]}
      />
    </>
  );
}

function SyncerForm({
  record,
  onSubmit,
  onCancel,
  onTest
}: {
  record?: Syncer;
  onSubmit: (values: Partial<Syncer>) => Promise<void>;
  onCancel: () => void;
  onTest: (values: Partial<Syncer>) => Promise<void>;
}) {
  const { message } = AntApp.useApp();
  const [form] = Form.useForm();
  const [testing, setTesting] = useState(false);

  const testCurrent = async () => {
    try {
      const values = await form.validateFields(["name", "host", "port"]);
      setTesting(true);
      await onTest(values);
    } catch (error) {
      if (error instanceof Error) message.error(error.message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Form form={form} layout="vertical" initialValues={record ?? { port: 9190 }} onFinish={onSubmit}>
      <Form.Item name="name" label="Syncer 名称" rules={[{ required: true }]}>
        <Input />
      </Form.Item>
      <Form.Item name="host" label="Host" rules={[{ required: true }]}>
        <Input />
      </Form.Item>
      <Form.Item name="port" label="HTTP Port" rules={[{ required: true }]}>
        <InputNumber min={1} max={65535} style={{ width: "100%" }} />
      </Form.Item>
      <Space className="form-actions">
        <Button onClick={onCancel}>取消</Button>
        <Button onClick={() => void testCurrent()} loading={testing}>
          测试
        </Button>
        <Button htmlType="submit" type="primary">
          保存
        </Button>
      </Space>
    </Form>
  );
}

function JobsPage({
  syncers,
  jobs,
  loading,
  onRun,
  onCreate,
  onDetail,
  confirmDesync
}: {
  syncers: Syncer[];
  jobs: CcrJob[];
  loading: boolean;
  onRun: <T>(task: () => Promise<T>, success: string) => Promise<T | undefined>;
  onCreate: () => void;
  onDetail: (name: string) => Promise<void>;
  confirmDesync: (job: CcrJob) => void;
}) {
  return (
    <>
      <div className="toolbar">
        <h1 className="page-title">任务管理</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
          创建任务
        </Button>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={jobs}
        columns={[
          ...jobColumns(syncers, onDetail),
          {
            title: "操作",
            fixed: "right",
            render: (_, record) => {
              const ended = isEndedJob(record);
              const paused = isPausedJob(record);
              return (
                <Space wrap>
                  <Button size="small" icon={<InfoCircleOutlined />} onClick={() => void onDetail(record.name)}>
                    详情
                  </Button>
                  <Button size="small" disabled={ended} icon={<ReloadOutlined />} onClick={() => void onRun(() => api.refreshJob(record.name), "任务快照已刷新")}>
                    刷新
                  </Button>
                  <Button size="small" disabled={ended || paused} title={paused ? "任务已暂停" : "暂停"} icon={<PauseCircleOutlined />} onClick={() => void onRun(() => api.pauseJob(record.name), "任务已暂停")} />
                  <Button size="small" disabled={ended || !paused} title={ended ? "已结束同步，不能恢复" : paused ? "恢复" : "只有暂停任务可以恢复"} icon={<PlayCircleOutlined />} onClick={() => void onRun(() => api.resumeJob(record.name), "任务已恢复")} />
                  <Popconfirm title="删除该 CCR 任务？" onConfirm={() => void onRun(() => api.deleteJob(record.name), "任务已删除")}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                  <Button size="small" danger disabled={ended} title={ended ? "已结束同步，不可恢复" : "结束同步后不可恢复"} icon={<StopOutlined />} onClick={() => confirmDesync(record)}>
                    结束同步
                  </Button>
                </Space>
              );
            }
          }
        ]}
        scroll={{ x: 1240 }}
      />
    </>
  );
}

function JobForm({
  syncers,
  sources,
  targets,
  onSubmit,
  onCancel,
  onPreflight,
  onListDatabases,
  onListTables
}: {
  syncers: Array<{ value: number; label: string }>;
  sources: Array<{ value: number; label: string }>;
  targets: Array<{ value: number; label: string }>;
  onSubmit: (values: CreateJobRequest) => Promise<void>;
  onCancel: () => void;
  onPreflight: (values: CreateJobRequest) => Promise<PreflightReport>;
  onListDatabases: (clusterId: number) => Promise<{ items: DorisDatabaseMetadata[] }>;
  onListTables: (clusterId: number, database: string) => Promise<{ items: DorisTableMetadata[] }>;
}) {
  const { message, modal } = AntApp.useApp();
  const [form] = Form.useForm<CreateJobRequest>();
  const syncType = Form.useWatch("syncType", form);
  const sourceClusterId = Form.useWatch("sourceClusterId", form);
  const targetClusterId = Form.useWatch("targetClusterId", form);
  const sourceDatabase = Form.useWatch("sourceDatabase", form);
  const targetDatabase = Form.useWatch("targetDatabase", form);
  const targetTable = Form.useWatch("targetTable", form);
  const [report, setReport] = useState<PreflightReport>();
  const [preflighting, setPreflighting] = useState(false);
  const [sourceDatabases, setSourceDatabases] = useState<Array<{ value: string; label: string }>>([]);
  const [targetDatabases, setTargetDatabases] = useState<Array<{ value: string; label: string }>>([]);
  const [sourceTables, setSourceTables] = useState<Array<{ value: string; label: string }>>([]);
  const [targetTables, setTargetTables] = useState<Array<{ value: string; label: string }>>([]);
  const [metadataLoading, setMetadataLoading] = useState<string>();

  const loadDatabases = async (kind: "source" | "target", clusterId?: number) => {
    if (!clusterId) return;
    setMetadataLoading(`${kind}-databases`);
    try {
      const result = await onListDatabases(clusterId);
      const options = result.items.map((item) => ({ value: item.name, label: `${item.name} (${item.tableCount})` }));
      if (kind === "source") setSourceDatabases(options);
      else setTargetDatabases(options);
    } catch (error) {
      message.warning(error instanceof Error ? error.message : "库元数据拉取失败，可继续手动输入");
    } finally {
      setMetadataLoading(undefined);
    }
  };

  const loadTables = async (kind: "source" | "target", clusterId?: number, database?: string) => {
    if (!clusterId || !database?.trim()) return;
    setMetadataLoading(`${kind}-tables`);
    try {
      const result = await onListTables(clusterId, database.trim());
      const options = result.items.map((item) => ({ value: item.name, label: item.type ? `${item.name} · ${item.type}` : item.name }));
      if (kind === "source") setSourceTables(options);
      else setTargetTables(options);
    } catch (error) {
      message.warning(error instanceof Error ? error.message : "表元数据拉取失败，可继续手动输入");
    } finally {
      setMetadataLoading(undefined);
    }
  };

  useEffect(() => {
    setSourceDatabases([]);
    setSourceTables([]);
    form.setFieldsValue({ sourceDatabase: undefined, sourceTable: undefined });
    void loadDatabases("source", sourceClusterId);
  }, [sourceClusterId]);

  useEffect(() => {
    setTargetDatabases([]);
    setTargetTables([]);
    form.setFieldsValue({ targetDatabase: undefined, targetTable: undefined });
    void loadDatabases("target", targetClusterId);
  }, [targetClusterId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSourceTables([]);
      form.setFieldsValue({ sourceTable: undefined });
      void loadTables("source", sourceClusterId, sourceDatabase);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [sourceClusterId, sourceDatabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTargetTables([]);
      void loadTables("target", targetClusterId, targetDatabase);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [targetClusterId, targetDatabase]);

  const targetTableExists = Boolean(targetTable && targetTables.some((item) => item.value === targetTable));

  const runPreflight = async () => {
    const values = await form.validateFields();
    setPreflighting(true);
    try {
      const result = await onPreflight(values);
      setReport(result);
      if (result.ok) {
        message.success("预检通过");
      } else {
        message.warning("预检发现阻断项");
      }
      return result;
    } finally {
      setPreflighting(false);
    }
  };

  const submitWithPreflight = async () => {
    const result = report ?? (await runPreflight());
    if (!result.canContinue) {
      message.error("预检存在失败项，请修复后再创建");
      return;
    }
    const warnings = result.checks.filter((item) => item.status === "warning").length;
    const values = await form.validateFields();
    if (warnings > 0) {
      modal.confirm({
        title: "预检存在警告，仍要创建吗？",
        content: `当前还有 ${warnings} 个需要人工确认的项目。创建前请确认 binlog、版本兼容和权限已经满足要求。`,
        okText: "继续创建",
        cancelText: "返回检查",
        onOk: () => onSubmit(values)
      });
      return;
    }
    await onSubmit(values);
  };

  return (
    <Form form={form} layout="vertical" initialValues={{ syncType: "database" }} onValuesChange={() => setReport(undefined)}>
      <div className="job-form-grid">
        <div className="job-form-fields">
          <Form.Item name="name" label="任务名" rules={[{ required: true, message: "请输入任务名" }, { pattern: CCR_JOB_NAME_PATTERN, message: CCR_JOB_NAME_HELP }]}>
            <Input placeholder="例如 sync_cz 或 ccr_job_01" />
          </Form.Item>
          <Form.Item name="syncerId" label="Syncer" rules={[{ required: true }]}>
            <Select options={syncers} />
          </Form.Item>
          <Space.Compact block>
            <Form.Item name="sourceClusterId" label="源集群" rules={[{ required: true }]} style={{ width: "50%" }}>
              <Select options={sources} />
            </Form.Item>
            <Form.Item name="targetClusterId" label="目标集群" rules={[{ required: true }]} style={{ width: "50%" }}>
              <Select options={targets} />
            </Form.Item>
          </Space.Compact>
          <Form.Item name="syncType" label="同步类型" rules={[{ required: true }]}>
            <Select options={[{ value: "database", label: "库级同步" }, { value: "table", label: "表级同步" }]} />
          </Form.Item>
          <Space.Compact block>
            <Form.Item name="sourceDatabase" label="源库" rules={[{ required: true }]} style={{ width: "50%" }}>
              <AutoComplete
                options={sourceDatabases}
                placeholder={metadataLoading === "source-databases" ? "正在拉取源库..." : "选择或输入源库"}
                filterOption={(input, option) => String(option?.value ?? "").toLowerCase().includes(input.toLowerCase())}
              />
            </Form.Item>
            <Form.Item name="targetDatabase" label="目标库" rules={[{ required: true }]} style={{ width: "50%" }}>
              <AutoComplete
                options={targetDatabases}
                placeholder={metadataLoading === "target-databases" ? "正在拉取目标库..." : "选择或输入目标库"}
                filterOption={(input, option) => String(option?.value ?? "").toLowerCase().includes(input.toLowerCase())}
              />
            </Form.Item>
          </Space.Compact>
          {syncType === "table" && (
            <>
              <Space.Compact block>
                <Form.Item name="sourceTable" label="源表" rules={[{ required: true }]} style={{ width: "50%" }}>
                  <AutoComplete
                    options={sourceTables}
                    placeholder={metadataLoading === "source-tables" ? "正在拉取源表..." : "选择或输入源表"}
                    filterOption={(input, option) => String(option?.value ?? "").toLowerCase().includes(input.toLowerCase())}
                  />
                </Form.Item>
                <Form.Item name="targetTable" label="目标表" rules={[{ required: true }]} style={{ width: "50%" }}>
                  <AutoComplete
                    options={targetTables}
                    placeholder={metadataLoading === "target-tables" ? "正在拉取目标表..." : "输入一个不存在的目标表名"}
                    filterOption={(input, option) => String(option?.value ?? "").toLowerCase().includes(input.toLowerCase())}
                  />
                </Form.Item>
              </Space.Compact>
              {targetTableExists && <Alert className="metadata-warning" type="warning" showIcon message="目标表已存在，表级 CCR 创建时通常需要填写一个不存在的目标表名。" />}
            </>
          )}
        </div>
        <div className="job-form-preflight">
          {report ? (
            <PreflightPanel report={report} />
          ) : (
            <div className="preflight-placeholder">
              <InfoCircleOutlined />
              <Typography.Text strong>创建前建议先预检</Typography.Text>
              <Typography.Text type="secondary">会检查 Syncer、Doris 端口、源表、目标表占用、binlog 与版本兼容提示。</Typography.Text>
            </div>
          )}
        </div>
      </div>
      <Space className="form-actions job-form-actions">
        <Button onClick={onCancel}>取消</Button>
        <Button onClick={() => void runPreflight()} loading={preflighting}>
          预检
        </Button>
        <Button type="primary" onClick={() => void submitWithPreflight()} loading={preflighting}>
          创建
        </Button>
      </Space>
    </Form>
  );
}

function PreflightPanel({ report }: { report: PreflightReport }) {
  const failed = report.checks.filter((item) => item.status === "failed").length;
  const warnings = report.checks.filter((item) => item.status === "warning").length;
  return (
    <div className="preflight-panel">
      <Alert
        type={failed ? "error" : warnings ? "warning" : "success"}
        showIcon
        message={failed ? `预检存在 ${failed} 个失败项` : warnings ? `预检通过，但有 ${warnings} 个警告` : "预检通过"}
        description={`检查时间：${formatDateTime(report.checkedAt)}`}
      />
      <List
        size="small"
        dataSource={report.checks}
        renderItem={(item) => (
          <List.Item>
            <List.Item.Meta
              title={
                <Space>
                  {checkTag(item.status)}
                  <span>{item.label}</span>
                </Space>
              }
              description={
                <>
                  <div>{item.message}</div>
                  {item.suggestion && <div className="subtle-text">{item.suggestion}</div>}
                </>
              }
            />
          </List.Item>
        )}
      />
    </div>
  );
}

function JobDetailDrawer({
  open,
  detail,
  syncers,
  clusters,
  loading,
  onClose,
  onRefresh
}: {
  open: boolean;
  detail?: JobDetail;
  syncers: Syncer[];
  clusters: Cluster[];
  loading: boolean;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const syncerName = new Map(syncers.map((syncer) => [syncer.id, syncer.name]));
  const clusterName = new Map(clusters.map((cluster) => [cluster.id, cluster.name]));
  const metrics = useMemo(() => [...(detail?.metrics ?? [])].reverse(), [detail]);
  const maxLag = Math.max(0, ...metrics.map((item) => Number(item.lag)).filter(Number.isFinite));
  const failedRefreshes = metrics.filter((item) => !item.success).length;

  return (
    <Drawer
      title={detail?.job.name ?? "任务详情"}
      open={open}
      onClose={onClose}
      width={720}
      extra={
        <Button icon={<ReloadOutlined />} loading={loading} disabled={detail ? isEndedJob(detail.job) : true} onClick={onRefresh}>
          刷新快照
        </Button>
      }
    >
      {detail && (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label="生命周期">{renderLifecycle(detail.job)}</Descriptions.Item>
            <Descriptions.Item label="Syncer">{syncerName.get(detail.job.syncerId) ?? detail.job.syncerId}</Descriptions.Item>
            <Descriptions.Item label="源集群">{clusterName.get(detail.job.sourceClusterId) ?? detail.job.sourceClusterId}</Descriptions.Item>
            <Descriptions.Item label="目标集群">{clusterName.get(detail.job.targetClusterId) ?? detail.job.targetClusterId}</Descriptions.Item>
            <Descriptions.Item label="源库/表">{`${detail.job.sourceDatabase}${detail.job.sourceTable ? `.${detail.job.sourceTable}` : ""}`}</Descriptions.Item>
            <Descriptions.Item label="目标库/表">{`${detail.job.targetDatabase}${detail.job.targetTable ? `.${detail.job.targetTable}` : ""}`}</Descriptions.Item>
            <Descriptions.Item label="最近状态">{renderJobStatus(detail.job.lastStatus)}</Descriptions.Item>
            <Descriptions.Item label="最近延迟">{detail.job.lastLag || "-"}</Descriptions.Item>
            <Descriptions.Item label="最近检查">{detail.job.lastCheckedAt ? formatDateTime(detail.job.lastCheckedAt) : "-"}</Descriptions.Item>
            <Descriptions.Item label="最近错误">{detail.job.lastError || "-"}</Descriptions.Item>
          </Descriptions>

          <div className="detail-grid">
            <Metric label="最大延迟" value={maxLag} />
            <Metric label="刷新失败" value={failedRefreshes} tone={failedRefreshes ? "danger" : undefined} />
          </div>

          <section className="detail-section">
            <Typography.Title level={5}>延迟历史</Typography.Title>
            <LagSparkline metrics={metrics} />
          </section>

          <section className="detail-section">
            <Typography.Title level={5}>诊断</Typography.Title>
            {detail.diagnostics.length ? <DiagnosticList diagnostics={detail.diagnostics} /> : <Alert type="success" showIcon message="暂无诊断异常" />}
          </section>

          <section className="detail-section">
            <Typography.Title level={5}>原始 Syncer 快照</Typography.Title>
            <pre className="raw-block">{JSON.stringify(detail.rawSnapshot ?? {}, null, 2)}</pre>
          </section>

          <section className="detail-section">
            <Typography.Title level={5}>最近操作</Typography.Title>
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={detail.logs.slice(0, 8)}
              columns={[
                { title: "时间", dataIndex: "createdAt", render: formatDateTime },
                { title: "操作", dataIndex: "action" },
                { title: "结果", dataIndex: "success", render: (value) => <Tag color={value ? "green" : "red"}>{value ? "成功" : "失败"}</Tag> },
                { title: "消息", dataIndex: "message" }
              ]}
            />
          </section>
        </Space>
      )}
    </Drawer>
  );
}

function LagSparkline({ metrics }: { metrics: JobMetric[] }) {
  const values = metrics.map((item) => Number(item.lag)).filter(Number.isFinite);
  const max = Math.max(1, ...values);
  if (!values.length) return <div className="empty-state">暂无延迟数据</div>;
  return (
    <div className="lag-chart">
      {values.slice(-40).map((value, index) => (
        <span key={`${index}-${value}`} className="lag-bar" style={{ height: `${Math.max(8, (value / max) * 100)}%` }} title={`${value}`} />
      ))}
    </div>
  );
}

function DiagnosticList({ diagnostics }: { diagnostics: JobDiagnostic[] }) {
  return (
    <List
      size="small"
      dataSource={diagnostics}
      renderItem={(item) => (
        <List.Item>
          <List.Item.Meta
            title={
              <Space>
                <Tag color={item.severity === "error" ? "red" : item.severity === "warning" ? "orange" : "blue"}>{item.severity}</Tag>
                <span>{item.title}</span>
              </Space>
            }
            description={
              <>
                <div>{item.summary}</div>
                <div className="subtle-text">{item.suggestion}</div>
                {item.source && <div className="diagnostic-source">{item.source}</div>}
              </>
            }
          />
        </List.Item>
      )}
    />
  );
}

function LogsPage({
  logs,
  jobs,
  loading,
  onFilter
}: {
  logs: OperationLog[];
  jobs: CcrJob[];
  loading: boolean;
  onFilter: (filter: { jobName?: string; action?: JobOperation }) => Promise<void>;
}) {
  const [jobName, setJobName] = useState<string>();
  const [action, setAction] = useState<JobOperation>();
  const actions: JobOperation[] = ["create", "preflight", "pause", "resume", "delete", "desync", "refresh", "refresh_status", "refresh_lag", "test_cluster", "test_syncer"];
  return (
    <>
      <div className="toolbar">
        <h1 className="page-title">操作日志</h1>
        <Space wrap>
          <Select allowClear placeholder="任务" style={{ width: 180 }} options={jobs.map((job) => ({ value: job.name, label: job.name }))} value={jobName} onChange={setJobName} />
          <Select allowClear placeholder="操作" style={{ width: 180 }} options={actions.map((item) => ({ value: item, label: item }))} value={action} onChange={setAction} />
          <Button icon={<ReloadOutlined />} onClick={() => void onFilter({ jobName, action })}>
            筛选
          </Button>
        </Space>
      </div>
      <Table
        rowKey="id"
        loading={loading}
        dataSource={logs}
        columns={[
          { title: "时间", dataIndex: "createdAt", render: formatDateTime },
          { title: "任务", dataIndex: "jobName", render: (value) => value || "-" },
          { title: "操作", dataIndex: "action" },
          { title: "结果", dataIndex: "success", render: (value) => <Tag color={value ? "green" : "red"}>{value ? "成功" : "失败"}</Tag> },
          { title: "消息", dataIndex: "message" }
        ]}
      />
    </>
  );
}

function jobColumns(syncers: Syncer[], onDetail?: (name: string) => Promise<void>) {
  const syncerName = new Map(syncers.map((syncer) => [syncer.id, syncer.name]));
  return [
    {
      title: "任务名",
      dataIndex: "name",
      render: (value: string) =>
        onDetail ? (
          <Button type="link" className="link-button" onClick={() => void onDetail(value)}>
            {value}
          </Button>
        ) : (
          value
        )
    },
    { title: "生命周期", render: (_: unknown, record: CcrJob) => renderLifecycle(record) },
    { title: "Syncer", dataIndex: "syncerId", render: (id: number) => syncerName.get(id) ?? id },
    { title: "类型", dataIndex: "syncType", render: (value: string) => (value === "database" ? "库级" : "表级") },
    { title: "源库/表", render: (_: unknown, record: CcrJob) => `${record.sourceDatabase}${record.sourceTable ? `.${record.sourceTable}` : ""}` },
    { title: "目标库/表", render: (_: unknown, record: CcrJob) => `${record.targetDatabase}${record.targetTable ? `.${record.targetTable}` : ""}` },
    { title: "最近状态", dataIndex: "lastStatus", render: renderJobStatus },
    { title: "最近延迟", dataIndex: "lastLag", render: (value: string) => value || "-" }
  ];
}

function isPausedJob(job: CcrJob) {
  return job.lifecycle === "paused" || /paused|pause/i.test(job.lastStatus ?? "");
}

function isEndedJob(job: CcrJob) {
  return job.lifecycle === "desynced" || /ended_desynced|desync|ended/i.test(job.lastStatus ?? "");
}

function renderLifecycle(job: CcrJob) {
  const map = {
    running: ["green", "运行中"],
    paused: ["orange", "已暂停"],
    failed: ["red", "异常"],
    deleted: ["default", "已删除"],
    desynced: ["red", "已结束同步"],
    unknown: ["default", "未知"]
  } as const;
  const [color, text] = map[job.lifecycle ?? "unknown"];
  return <Tag color={color}>{text}</Tag>;
}

function renderJobStatus(value?: string) {
  if (!value) return "-";
  if (/ended_desynced|desync|ended/i.test(value)) return <Tag color="red">已结束同步</Tag>;
  if (/paused|pause/i.test(value)) return <Tag color="orange">已暂停</Tag>;
  if (/running|normal/i.test(value)) return <Tag color="green">运行中</Tag>;
  return <span className="status-text">{value}</span>;
}

function healthTag(value: Syncer["lastHealth"]) {
  const color = value === "healthy" ? "green" : value === "unhealthy" ? "red" : "default";
  const text = value === "healthy" ? "健康" : value === "unhealthy" ? "异常" : "未知";
  return <Tag color={color}>{text}</Tag>;
}

function checkTag(value: CheckStatus) {
  if (value === "passed") return <Tag color="green">通过</Tag>;
  if (value === "warning") return <Tag color="orange">警告</Tag>;
  return <Tag color="red">失败</Tag>;
}

function formatDateTime(value: string) {
  if (!value) return "-";
  return value.replace("T", " ").replace(/\.\d{3}Z$/, "");
}
