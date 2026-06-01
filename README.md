# Doris CCR Console

Doris CCR Console 是一套面向 Apache Doris CCR Syncer 的轻量级 Web 控制台。它把 CCR Syncer HTTP API、Doris 集群连接、CCR 任务创建、任务状态、延迟、预检、诊断和操作日志封装成一个可视化工具。

如果你没有用过 CCR，可以把它理解为：**用来管理 Doris 跨集群、跨库表数据同步任务的控制台**。你仍然需要自己准备 Doris 集群和 CCR Syncer，本项目负责把日常配置、创建、暂停、恢复、排障这些动作做成 Web 页面。

## 适合谁

- 已经有 Doris 源集群和目标集群，希望做 CCR 数据同步的人。
- 已经部署了 CCR Syncer，但不想手工调用 HTTP API 的人。
- 需要查看 CCR 任务状态、延迟、失败原因、操作日志的人。
- 希望在创建任务前先检查库表、端口、Syncer、目标表占用等风险的人。

## 你需要先准备什么

在使用这个控制台之前，请先确认这些基础条件：

- 源端 Doris FE 可访问。
- 目标端 Doris FE 可访问。
- CCR Syncer 已启动，并且控制台所在机器能访问 Syncer HTTP 端口。
- Doris 账号有访问 `information_schema`、库表元数据和创建 CCR 任务所需的权限。
- 源端和目标端 FE 已按 CCR 要求启用相关 binlog 配置。
- 表级同步时：源表必须存在，目标表通常不能提前存在。

本项目不会自动安装 Doris、不会自动安装 Syncer，也不会自动修改 Doris 配置。

## 核心概念

**集群**

一条 Doris FE 连接配置。控制台里会区分“源端”和“目标端”。每个集群需要填写：

- FE Host
- FE Query Port
- FE Thrift Port
- 用户名
- 密码

密码会加密保存到本地 SQLite。

**Syncer**

CCR Syncer 的 HTTP 服务地址。控制台通过它创建、查询、暂停、恢复、删除和结束 CCR 任务。

**库级同步**

同步一个数据库。通常需要源库存在、目标库满足 CCR 创建要求。

**表级同步**

同步一个表。正常条件是：

- 源库存在
- 源表存在
- 目标库存在
- 目标表不存在

如果目标表已经存在，Syncer 可能返回：

```text
[normal] dest table xxx.xxx already exists
```

这是 Doris CCR 的保护逻辑，避免直接接管或覆盖一个已有表。

## 主要功能

- 仪表盘：查看 Syncer 数量、CCR 任务数量、异常数量和最大延迟。
- 集群管理：维护源端和目标端 Doris 连接，支持端口连通性测试。
- Syncer 管理：维护 CCR Syncer 地址，支持版本和健康检测。
- 元数据拉取：根据集群连接自动拉取 Doris 库表列表，创建任务时可选择或手动输入。
- 任务管理：创建库级或表级 CCR，刷新状态和延迟，暂停、恢复、删除、结束同步。
- 创建前预检：检查 Syncer、Doris 端口、库表存在性、目标表占用、binlog/版本兼容提示。
- 任务详情：查看生命周期、最近状态、最近延迟、延迟历史、诊断、原始 Syncer 快照、操作日志。
- 诊断规则：识别常见错误，例如 binlog 未开启、目标表已存在、EOF、权限不足、表状态异常。
- 操作日志：记录创建、刷新、暂停、恢复、删除、desync、预检等操作结果。

## 快速开始

推荐使用 `pnpm`。

```bash
pnpm install
pnpm run dev
```

默认地址：

- Web UI: `http://127.0.0.1:5173`
- Backend API: `http://127.0.0.1:3100`

开发模式下，Vite 前端会把 `/api` 请求代理到后端。

## 最快部署：Docker Compose

推荐生产或内网测试优先使用 Docker Compose。它会在容器里完成构建并启动 Node/Fastify 服务，后端会同时托管前端页面和 `/api/*`。

```bash
git clone https://github.com/DLaoLiu/Doris-CCR-Console.git
cd Doris-CCR-Console
cp .env.example .env
docker compose up -d --build
```

默认访问：

```text
http://服务器IP:3100
```

数据会保存到宿主机当前目录的 `./data`：

- `./data/ccr-console.db`
- `./data/secret.key`

升级时请保留 `./data`，否则本地保存的集群、Syncer、任务和加密密钥会丢失。

常用命令：

```bash
docker compose ps
docker compose logs -f
docker compose restart
docker compose down
```

如果要改端口，编辑 `.env`：

```env
CCR_CONSOLE_PORT=8080
```

然后重启：

```bash
docker compose up -d
```

## 第一次怎么用

1. 打开控制台。
2. 进入“集群”，新增源端 Doris 集群。
3. 进入“集群”，新增目标端 Doris 集群。
4. 分别点击“测试”，确认 FE Query Port 和 Thrift Port 可连通。
5. 进入“Syncer”，新增 CCR Syncer 地址。
6. 点击 Syncer “测试”，确认能读取版本。
7. 进入“任务”，点击“创建任务”。
8. 选择 Syncer、源集群、目标集群。
9. 选择或输入源库、目标库；如果是表级同步，再选择或输入源表、目标表。
10. 点击“预检”。
11. 如果预检有失败项，先按提示修复。
12. 预检通过后点击“创建”。

创建后可以在任务列表里刷新状态、刷新延迟、查看详情、暂停、恢复、删除或结束同步关系。

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
- `CCR_CONSOLE_SECRET`: 凭据加密密钥。不设置时自动生成 `.ccr-console/secret.key`

注意：当前版本不内置登录系统。如果把 `HOST` 设置为 `0.0.0.0`，请只在可信网络或 Nginx 访问控制后面使用。

## 构建后能不能直接用 Nginx 代理

可以，但要注意：**这个项目不是纯静态前端，不能只把 `dist-web` 丢给 Nginx 就完整运行。**

原因是：

- 前端页面在 `dist-web`
- 后端 API 在 Node/Fastify
- SQLite 数据、Doris 密码加密、Syncer API 代理、Doris 元数据拉取都在后端

所以生产运行至少需要一个 Node 后端进程：

```bash
pnpm install --prod
pnpm run build
HOST=127.0.0.1 PORT=3100 pnpm run start
```

构建后，Fastify 后端会自动托管 `dist-web`，因此最简单的部署方式是让 Nginx 把所有请求都反向代理到 Node 后端。

### 推荐 Nginx 配置

```nginx
server {
    listen 80;
    server_name ccr-console.example.com;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

这种方式最省心：静态页面和 `/api/*` 都交给 Node 后端处理。

如果你使用 Docker Compose，Nginx 反代目标就是容器映射出来的端口：

```nginx
server {
    listen 80;
    server_name ccr-console.example.com;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 也可以让 Nginx 托管静态文件

如果你希望 Nginx 直接托管前端静态资源，也可以这样：

```nginx
server {
    listen 80;
    server_name ccr-console.example.com;

    root /opt/doris-ccr-console/dist-web;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3100/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

这种方式仍然必须启动 Node 后端，否则 `/api/*`、数据库、Syncer 代理和元数据拉取都不可用。

## 生产运行建议

- 用进程管理器运行后端，例如 `systemd`、`pm2` 或容器。
- 固定 `DATA_DIR`，避免升级或换目录后找不到 SQLite 数据库。
- 备份 `.ccr-console/ccr-console.db` 和 `.ccr-console/secret.key`。
- 不要把服务裸露到公网，除非外层有登录、VPN、IP 白名单或其他访问控制。
- 如果 Nginx 对外提供 HTTPS，后端可以继续只监听 `127.0.0.1:3100`。

## 常见问题

**为什么表级同步时目标表不能已经存在？**

因为 CCR Syncer 会根据源表结构在目标库创建目标表，并维护同步关系。目标表提前存在时，Syncer 无法确认它的结构、数据和同步标记是否安全，所以会拒绝创建。

**为什么元数据拉取失败？**

常见原因：

- Doris FE Query Port 不通。
- 用户名或密码错误。
- Doris 账号没有访问 `information_schema` 的权限。
- 网络、防火墙或代理阻断。

**为什么预检有警告但不是失败？**

有些内容控制台无法直接确认，例如所有 FE 的 `fe.conf`、完整版本兼容关系等。这类项目会提示人工确认，不会直接阻断创建。

**为什么没有登录系统？**

当前版本定位为本地/内网运维工具。默认只监听 `127.0.0.1`。如果要多人使用，建议先放在 VPN、堡垒机或带登录的 Nginx/网关后面。

## 技术栈

- Frontend: React, Vite, TypeScript, Ant Design
- Backend: Node.js, Fastify, TypeScript
- Storage: SQLite, better-sqlite3
- Doris metadata: mysql2
- Test: Vitest, Testing Library

## GitHub 仓库简介

Apache Doris CCR Syncer 的轻量级 Web 控制台，支持 Doris 集群配置、Syncer 管理、库表元数据拉取、CCR 任务创建、预检诊断、状态/延迟查看、暂停恢复、结束同步和操作日志。
