# Doris CCR Console

Doris CCR Console 是一套面向 Apache Doris CCR 数据同步工具的轻量级 Web 管控台。它将 CCR Syncer 的 HTTP API、任务状态、延迟查询、集群配置、操作日志和常见运维动作封装成一个开箱即用的可视化工具，帮助使用者更直观地创建、管理和排查 Doris 跨集群同步任务。

## 功能特性

- 集群管理：维护源端和目标端 Doris FE 连接信息，支持端口连通性测试。
- Syncer 管理：维护 CCR Syncer 实例，支持版本和健康检测。
- 任务管理：创建库级或表级 CCR 任务，支持状态刷新、延迟刷新、暂停、恢复、删除和结束同步。
- 操作日志：记录创建、刷新、暂停、恢复、删除、desync 等操作结果，失败信息会落库便于排查。
- 本地存储：使用 SQLite 保存控制台元数据，Doris 密码加密落库。
- 开发友好：单仓库 TypeScript 项目，前端 React + Ant Design，后端 Fastify。

## 技术栈

- Frontend: React, Vite, TypeScript, Ant Design
- Backend: Node.js, Fastify, TypeScript
- Storage: SQLite, better-sqlite3
- Test: Vitest, Testing Library

## 快速开始

```bash
pnpm install
pnpm run dev
```

默认服务：

- Web UI: `http://127.0.0.1:5173`
- Backend API: `http://127.0.0.1:3100`

如果端口被占用，Vite 会自动切换前端端口；后端默认端口可通过环境变量 `PORT` 调整。

## 常用命令

```bash
pnpm run dev        # 同时启动前端和后端开发服务
pnpm run build      # 构建后端和前端产物
pnpm run start      # 启动构建后的后端服务
pnpm run test       # 运行测试
pnpm run typecheck  # 运行 TypeScript 类型检查
```

## 运行配置

可选环境变量：

- `HOST`: 后端监听地址，默认 `127.0.0.1`
- `PORT`: 后端监听端口，默认 `3100`
- `DATA_DIR`: 控制台数据目录，默认 `.ccr-console`
- `DB_PATH`: SQLite 数据库路径，默认 `.ccr-console/ccr-console.db`
- `CCR_CONSOLE_SECRET`: 凭据加密密钥，不设置时自动生成 `.ccr-console/secret.key`

注意：当前 MVP 不内置登录系统。若将 `HOST` 设置为 `0.0.0.0`，请只在可信网络中使用。

## 任务名规则

CCR 任务名遵循 Doris/Syncer 侧命名约束：

- 必须以英文字母开头
- 只能包含英文字母、数字和下划线
- 示例：`sync_cz`、`ccr_job_01`

## 项目状态

当前版本是 MVP，重点覆盖 CCR Syncer 的核心管理流程。后续可继续扩展：

- 任务详情页和状态原始响应展示
- 延迟历史趋势和最大延迟统计
- Docker Compose 一键部署
- 多用户登录、RBAC 和审计增强
- Syncer 高可用和多实例调度视图

## GitHub 仓库简介

Apache Doris CCR Syncer 的轻量级 Web 管控台，支持集群配置、Syncer 管理、CCR 任务创建、状态/延迟查看、暂停恢复、结束同步和操作日志。
