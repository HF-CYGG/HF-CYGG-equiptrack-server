# EquipTrack Backend Server

EquipTrack 后端服务器是一个基于 Node.js 和 Express 构建的高性能 RESTful API 服务，旨在为 EquipTrack 物资管理系统提供数据支持和业务逻辑处理。

## 🛠 技术栈

*   **Runtime**: Node.js (v18+)
*   **Framework**: Express.js
*   **Language**: TypeScript
*   **Security**: Helmet, CORS, Express Rate Limit
*   **Auth**: JSON Web Token (JWT)
*   **File Handling**: Multer (文件上传)
*   **Data Persistence**: 本地 JSON 文件存储 (无需外部数据库)

## 📂 目录结构

```text
server/
├── src/
│   ├── config/       # 环境配置 (env, constants)
│   ├── middlewares/  # 中间件 (Auth, Error Handling, Upload, Logging)
│   ├── models/       # TypeScript 类型定义与接口
│   ├── routes/       # API 路由定义
│   ├── services/     # 核心业务逻辑 (User, Equipment, Approval)
│   ├── utils/        # 工具函数 (JSON Store, ID Generator)
│   ├── app.ts        # Express App 配置
│   └── index.ts      # 服务入口
├── data/             # (自动生成) JSON 数据存储目录
├── uploads/          # (自动生成) 用户上传文件目录
├── dist/             # 编译后的 JavaScript 代码
├── .env.example      # 环境变量示例
└── Dockerfile        # Docker 构建文件
```

## 🚀 快速开始

### 1. 环境准备

确保本地已安装 Node.js (推荐 v18 或更高版本) 和 npm。

### 2. 安装依赖

```bash
npm install
# 如果在国内，推荐使用淘宝镜像
npm config set registry https://registry.npmmirror.com
npm install
```

### 3. 配置环境变量

复制 `.env.example` 文件并重命名为 `.env`：

```bash
cp .env.example .env
```

根据需要修改 `.env` 中的配置：

*   `PORT`: 服务器监听端口 (默认 3000)
*   `JWT_SECRET`: 用于签名 JWT 的密钥 (生产环境请务必修改)
*   `CORS_ORIGIN`: 允许跨域请求的来源
*   `NODE_ENV`: `development` 或 `production`

### 4. 启动服务器

#### 开发模式 (Development)
使用 `ts-node` 直接运行 TypeScript 代码，支持热重载（建议配合 nodemon 使用，虽然当前脚本直接运行）：

```bash
npm run dev
```

#### 生产模式 (Production)
先编译 TypeScript 代码为 JavaScript，然后运行编译后的代码：

```bash
npm run build
npm start
```

## 🐳 Docker 部署

本项目包含 `Dockerfile`，并通过 GitHub Actions 自动构建并推送镜像到 Docker Hub 仓库 `yemiao351/equiptrack`。

### 方式一：使用官方镜像 + docker-compose（一键部署，推荐）

在目标服务器上：

1. 创建数据目录：

    ```bash
    sudo mkdir -p /opt/equiptrack/data
    sudo mkdir -p /opt/equiptrack/uploads
    ```

2. 在任意目录（例如 `/opt/equiptrack`）创建 `docker-compose.yml`，内容如下：

    ```yaml
    version: "3.8"

    services:
      equiptrack-server:
        image: yemiao351/equiptrack:latest
        container_name: equiptrack-server
        restart: unless-stopped
        ports:
          - "13000:3000"
        volumes:
          - "/opt/equiptrack/data:/app/data"
          - "/opt/equiptrack/uploads:/app/uploads"
        environment:
          - NODE_ENV=production
    ```

3. 在该目录运行：

    ```bash
    docker compose up -d
    ```

之后每次代码更新并触发 CI 构建后，只需在同一目录执行：

```bash
docker compose pull equiptrack-server
docker compose up -d equiptrack-server
```

即可拉取最新镜像并在保留端口映射与数据挂载的前提下重建容器。

### 方式二：本地构建镜像

如需在本地自行构建镜像，也可以使用以下命令：

```bash
docker build -t equiptrack-server .
```

然后运行容器：

```bash
docker run -d \
  -p 8090:3000 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/uploads:/app/uploads \
  --name equiptrack-server \
  equiptrack-server
```

*   `-p 8090:3000`: 将容器的 3000 端口映射到宿主机的 8090 端口。
*   `-v .../data`: 挂载数据目录，确保持久化数据不丢失。
*   `-v .../uploads`: 挂载上传目录，确保持久化图片不丢失。

## 📝 API 文档

详细的 API 接口规范请参考项目根目录下的 [API_SPEC.md](../API_SPEC.md)。

主要模块包括：
*   **Auth**: 登录、注册申请
*   **Users**: 用户管理、权限控制
*   **Departments**: 部门管理
*   **Categories**: 物资类别管理
*   **Items**: 物资增删改查、借还操作
*   **Approvals**: 审批流处理
*   **Upload**: 图片上传

## 🔒 权限说明

系统内置三种角色：
1.  **Super Admin**: 全局管理员，拥有所有权限。
2.  **Admin**: 部门管理员，管理本部门物资和人员。
3.  **User**: 普通用户，仅可查看和借用。

## 💾 数据存储

本系统采用轻量级设计，所有数据以 JSON 格式存储在 `data/` 目录下。
*   无需配置 MySQL/MongoDB 等外部数据库。
*   方便备份和迁移。
*   **注意**: `data/` 和 `uploads/` 目录应在生产环境中进行定期备份。
