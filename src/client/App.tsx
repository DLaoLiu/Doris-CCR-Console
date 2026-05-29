import {
  App as AntApp,
  Button,
  Form,
  Input,
  InputNumber,
  Layout,
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
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined
} from "@ant-design/icons";
import { useEffect, useState } from "react";
import { api } from "./api";
import type { CcrJob, Cluster, CreateJobRequest, JobOperation, OperationLog, Syncer } from "../shared/types";
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

  const run = async (task: () => Promise<unknown>, successText: string) => {
    setLoading(true);
    try {
      await task();
      message.success(successText);
      await refreshAll();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "操作失败");
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
        <div className="brand">Doris CCR Console</div>
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
            confirmDesync={(job) =>
              modal.confirm({
                title: `结束同步关系：${job.name}`,
                content: "desync 会结束 CCR 同步关系，请确认该任务不再需要继续增量同步。",
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

      <Modal title="创建 CCR 任务" open={jobModalOpen} footer={null} onCancel={() => setJobModalOpen(false)} destroyOnHidden width={640}>
        <JobForm
          syncers={syncerOptions}
          sources={sourceOptions}
          targets={targetOptions}
          onCancel={() => setJobModalOpen(false)}
          onSubmit={(values) => run(() => api.createJob(values), "CCR 任务已创建").then(() => setJobModalOpen(false))}
        />
      </Modal>
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
  onRun: (task: () => Promise<unknown>, success: string) => Promise<void>;
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
      <Space>
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
  onRun: (task: () => Promise<unknown>, success: string) => Promise<void>;
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
      <Space>
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
  confirmDesync
}: {
  syncers: Syncer[];
  jobs: CcrJob[];
  loading: boolean;
  onRun: (task: () => Promise<unknown>, success: string) => Promise<void>;
  onCreate: () => void;
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
          ...jobColumns(syncers),
          {
            title: "操作",
            fixed: "right",
            render: (_, record) => {
              const ended = isEndedJob(record);
              const paused = isPausedJob(record);
              return (
                <Space wrap>
                  <Button size="small" disabled={ended} title={ended ? "已结束同步，不能再刷新远端状态" : undefined} onClick={() => void onRun(() => api.refreshStatus(record.name), "状态已刷新")}>
                    状态
                  </Button>
                  <Button size="small" disabled={ended} title={ended ? "已结束同步，不能再刷新延迟" : undefined} onClick={() => void onRun(() => api.refreshLag(record.name), "延迟已刷新")}>
                    延迟
                  </Button>
                  <Button size="small" disabled={ended || paused} title={ended ? "已结束同步，不能暂停" : paused ? "任务已暂停" : "暂停"} icon={<PauseCircleOutlined />} onClick={() => void onRun(() => api.pauseJob(record.name), "任务已暂停")} />
                  <Button size="small" disabled={ended || !paused} title={ended ? "已结束同步，不能恢复；请重新创建 CCR 任务" : paused ? "恢复" : "只有暂停任务可以恢复"} icon={<PlayCircleOutlined />} onClick={() => void onRun(() => api.resumeJob(record.name), "任务已恢复")} />
                  <Popconfirm title="删除该 CCR 任务？" onConfirm={() => void onRun(() => api.deleteJob(record.name), "任务已删除")}>
                    <Button size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                  <Button size="small" danger disabled={ended} title={ended ? "已结束同步，不能再次结束；不可恢复，只能重新创建任务" : "结束同步后不可恢复"} icon={<StopOutlined />} onClick={() => confirmDesync(record)}>
                    结束同步
                  </Button>
                </Space>
              );
            }
          }
        ]}
        scroll={{ x: 1100 }}
      />
    </>
  );
}

function JobForm({
  syncers,
  sources,
  targets,
  onSubmit,
  onCancel
}: {
  syncers: Array<{ value: number; label: string }>;
  sources: Array<{ value: number; label: string }>;
  targets: Array<{ value: number; label: string }>;
  onSubmit: (values: CreateJobRequest) => Promise<void>;
  onCancel: () => void;
}) {
  const [form] = Form.useForm<CreateJobRequest>();
  const syncType = Form.useWatch("syncType", form);
  return (
    <Form form={form} layout="vertical" initialValues={{ syncType: "database" }} onFinish={onSubmit}>
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
          <Input />
        </Form.Item>
        <Form.Item name="targetDatabase" label="目标库" rules={[{ required: true }]} style={{ width: "50%" }}>
          <Input />
        </Form.Item>
      </Space.Compact>
      {syncType === "table" && (
        <Space.Compact block>
          <Form.Item name="sourceTable" label="源表" rules={[{ required: true }]} style={{ width: "50%" }}>
            <Input />
          </Form.Item>
          <Form.Item name="targetTable" label="目标表" rules={[{ required: true }]} style={{ width: "50%" }}>
            <Input />
          </Form.Item>
        </Space.Compact>
      )}
      <Space>
        <Button onClick={onCancel}>取消</Button>
        <Button htmlType="submit" type="primary">
          创建
        </Button>
      </Space>
    </Form>
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
  const actions: JobOperation[] = ["create", "pause", "resume", "delete", "desync", "refresh_status", "refresh_lag", "test_cluster", "test_syncer"];
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

function jobColumns(syncers: Syncer[]) {
  const syncerName = new Map(syncers.map((syncer) => [syncer.id, syncer.name]));
  return [
    { title: "任务名", dataIndex: "name" },
    { title: "Syncer", dataIndex: "syncerId", render: (id: number) => syncerName.get(id) ?? id },
    { title: "类型", dataIndex: "syncType", render: (value: string) => (value === "database" ? "库级" : "表级") },
    { title: "源库/表", render: (_: unknown, record: CcrJob) => `${record.sourceDatabase}${record.sourceTable ? `.${record.sourceTable}` : ""}` },
    { title: "目标库/表", render: (_: unknown, record: CcrJob) => `${record.targetDatabase}${record.targetTable ? `.${record.targetTable}` : ""}` },
    { title: "最近状态", dataIndex: "lastStatus", render: renderJobStatus },
    { title: "最近延迟", dataIndex: "lastLag", render: (value: string) => value || "-" }
  ];
}

function isPausedJob(job: CcrJob) {
  return /paused|pause/i.test(job.lastStatus ?? "");
}

function isEndedJob(job: CcrJob) {
  return /ended_desynced|desync|ended/i.test(job.lastStatus ?? "");
}

function renderJobStatus(value?: string) {
  if (!value) return "-";
  if (/ended_desynced|desync|ended/i.test(value)) {
    return <Tag color="red">已结束同步（不可恢复）</Tag>;
  }
  if (/paused|pause/i.test(value)) {
    return <Tag color="orange">已暂停</Tag>;
  }
  if (/running|normal/i.test(value)) {
    return <Tag color="green">运行中</Tag>;
  }
  return value;
}

function healthTag(value: Syncer["lastHealth"]) {
  const color = value === "healthy" ? "green" : value === "unhealthy" ? "red" : "default";
  const text = value === "healthy" ? "健康" : value === "unhealthy" ? "异常" : "未知";
  return <Tag color={color}>{text}</Tag>;
}

function formatDateTime(value: string) {
  if (!value) return "-";
  return value.replace("T", " ").replace(/\.\d{3}Z$/, "");
}
