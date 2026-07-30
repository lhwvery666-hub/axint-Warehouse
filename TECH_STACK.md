# 📚 技术栈说明文档

## 📋 项目概述

**项目名称**: axiom-repair  
**项目类型**: Next.js 全栈 Web 应用  
**主要功能**: 维修工单管理系统

---

## 🔧 核心技术栈

### Node.js 版本

- **推荐版本**: Node.js 20.x
- **最低版本**: Node.js 18.0.0+
- **Docker 基础镜像**: `node:20-alpine`

**验证方式**:
```bash
node --version
# 应显示 v20.x.x 或更高
```

---

### Next.js 版本

- **当前版本**: `16.0.10`
- **React 版本**: `19.2.0`
- **React DOM 版本**: `19.2.0`

**关键配置** (`next.config.mjs`):
```javascript
{
  output: 'standalone',  // 生产环境独立打包模式
  typescript: {
    ignoreBuildErrors: true
  },
  images: {
    unoptimized: true
  }
}
```

**构建命令**:
```bash
npm run build
```

---

### Prisma ORM 配置

- **Prisma 版本**: `^5.0.0`
- **Prisma Client 版本**: `^5.0.0`
- **数据库提供者**: `sqlserver` (SQL Server)

**配置文件**: `prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlserver"
  url      = env("DATABASE_URL")
}
```

**环境变量**:
```bash
DATABASE_URL="sqlserver://localhost:1433;database=AxinRepairDB;user=AxinUser;password=replace-with-a-url-encoded-password;trustServerCertificate=true"
```

**常用 Prisma 命令**:
```bash
# 生成 Prisma Client
npm run prisma:generate

# 推送 Schema 到数据库（开发环境）
npm run prisma:push

# 打开 Prisma Studio（数据库可视化工具）
npm run prisma:studio
```

---

### SQL Server 连接配置

#### 数据库信息

- **数据库名称**: `AxinRepairDB`
- **服务器地址**: `localhost` (生产环境根据实际情况配置)
- **端口**: `1433` (SQL Server 默认端口)
- **认证方式**: SQL Server 身份验证

#### 连接参数

**环境变量配置** (`env.example`):

```bash
# SQL Server 连接（mssql 直连，用于所有 API 路由）
DB_SERVER=localhost
DB_DATABASE=AxinRepairDB
DB_USER=AxinUser
DB_PASSWORD=replace-with-a-strong-password
DB_PORT=1433
DB_ENCRYPT=false
DB_TRUST_CERT=true
DB_POOL_MAX=10

# Prisma 连接字符串
DATABASE_URL="sqlserver://localhost:1433;database=AxinRepairDB;user=AxinUser;password=replace-with-a-url-encoded-password;trustServerCertificate=true"
```

#### 连接池配置 (`lib/db-config.ts`)

```typescript
{
  pool: {
    max: 10,                    // 最大连接数
    min: 0,                     // 最小连接数
    idleTimeoutMillis: 600000,  // 空闲超时 10 分钟
    acquireTimeoutMillis: 30000 // 获取连接超时 30 秒
  },
  options: {
    encrypt: false,                    // 是否加密
    trustServerCertificate: true,     // 信任服务器证书（内网环境）
    enableArithAbort: true           // 启用算术中止
  }
}
```

#### SQL Server 版本要求

- **最低版本**: SQL Server 2016+
- **推荐版本**: SQL Server 2019+ 或 SQL Server 2022

#### 连接要求

1. **网络连接**: 
   - 应用服务器能够访问 SQL Server 实例
   - 防火墙开放 1433 端口（或自定义端口）

2. **数据库用户权限**:
   - 需要 `SELECT`, `INSERT`, `UPDATE`, `DELETE` 权限
   - 需要执行存储过程的权限（如使用）
   - 需要创建表的权限（仅开发环境，用于 Prisma migrations）

3. **SSL/TLS 配置**:
   - 内网环境: `DB_TRUST_CERT=true` (信任自签名证书)
   - 公网环境: `DB_ENCRYPT=true` (使用 SSL 加密)

---

## 🚀 生产环境部署

### 方式一：PM2 部署（推荐）

#### 前置要求

1. Node.js 20.x 已安装
2. PM2 全局安装: `npm install -g pm2`
3. SQL Server 已配置并可访问
4. 项目代码已上传到服务器

#### 部署步骤

**1. 安装依赖**
```bash
cd axiom-repair
npm install
```

**2. 生成 Prisma Client**
```bash
npm run prisma:generate
```

**3. 配置环境变量**

编辑 `ecosystem.config.js`，修改以下配置：
```javascript
env_production: {
  DB_SERVER: 'your-sql-server-host',
  DB_DATABASE: 'AxinRepairDB',
  DB_USER: 'your-db-user',
  DB_PASSWORD: 'your-db-password',
  // ... 其他配置
}
```

或创建 `.env.production` 文件（推荐）:
```bash
cp env.example .env.production
# 编辑 .env.production，填入真实配置
```

**4. 构建应用**
```bash
npm run build
```

**5. 启动应用（PM2）**
```bash
# 首次启动
pm2 start ecosystem.config.js

# 保存进程列表
pm2 save

# 设置开机自启（可选）
pm2 startup
```

**6. 验证部署**
```bash
# 查看进程状态
pm2 status

# 查看日志
pm2 logs axiom-repair

# 检查端口监听
netstat -ano | findstr :3000
# 或
lsof -i :3000
```

#### PM2 常用命令

```bash
# 查看所有进程
pm2 list

# 查看日志
pm2 logs axiom-repair --lines 50

# 重启应用（零停机）
pm2 reload axiom-repair

# 停止应用
pm2 stop axiom-repair

# 删除进程
pm2 delete axiom-repair

# 监控
pm2 monit
```

---

### 方式二：Docker 部署

#### 前置要求

1. Docker 已安装
2. Docker Compose（可选，用于多容器编排）

#### 构建 Docker 镜像

```bash
# 构建镜像
docker build -t axiom-repair:latest .

# 查看镜像
docker images | grep axiom-repair
```

#### 运行容器

**方式 A: 直接运行**
```bash
docker run -d \
  --name axiom-repair \
  -p 3000:3000 \
  -e DB_SERVER=host.docker.internal \
  -e DB_DATABASE=AxinRepairDB \
  -e DB_USER=AxinUser \
  -e DB_PASSWORD=your-password \
  -e DB_PORT=1433 \
  -e DB_TRUST_CERT=true \
  -e DATABASE_URL="sqlserver://host.docker.internal:1433;database=AxinRepairDB;user=AxinUser;password=your-password;trustServerCertificate=true" \
  axiom-repair:latest
```

**方式 B: 使用环境变量文件**
```bash
# 创建 .env.docker 文件
cat > .env.docker << EOF
DB_SERVER=host.docker.internal
DB_DATABASE=AxinRepairDB
DB_USER=AxinUser
DB_PASSWORD=your-password
DB_PORT=1433
DB_TRUST_CERT=true
DATABASE_URL=sqlserver://host.docker.internal:1433;database=AxinRepairDB;user=AxinUser;password=your-password;trustServerCertificate=true
EOF

# 运行容器
docker run -d \
  --name axiom-repair \
  -p 3000:3000 \
  --env-file .env.docker \
  axiom-repair:latest
```

#### Docker 常用命令

```bash
# 查看运行中的容器
docker ps

# 查看日志
docker logs -f axiom-repair

# 停止容器
docker stop axiom-repair

# 启动容器
docker start axiom-repair

# 重启容器
docker restart axiom-repair

# 删除容器
docker rm axiom-repair

# 进入容器（调试用）
docker exec -it axiom-repair sh
```

---

### 方式三：直接运行（开发/测试）

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp env.example .env.local
# 编辑 .env.local，填入真实配置

# 3. 生成 Prisma Client
npm run prisma:generate

# 4. 构建应用
npm run build

# 5. 启动应用
npm start
```

应用将在 `http://localhost:3000` 启动。

---

## 📦 主要依赖包

### 核心框架
- `next`: 16.0.10 - Next.js 框架
- `react`: 19.2.0 - React 库
- `react-dom`: 19.2.0 - React DOM 渲染

### 数据库相关
- `@prisma/client`: ^5.0.0 - Prisma ORM 客户端
- `prisma`: ^5.0.0 - Prisma CLI
- `mssql`: ^11.0.1 - SQL Server 驱动

### UI 组件库
- `@radix-ui/*`: 1.x.x - 无样式 UI 组件库
- `lucide-react`: ^0.454.0 - 图标库
- `tailwindcss`: ^4.1.9 - CSS 框架
- `recharts`: 2.15.4 - 图表库

### 工具库
- `bcryptjs`: ^2.4.3 - 密码加密
- `zod`: 3.25.76 - 数据验证
- `date-fns`: 4.1.0 - 日期处理
- `react-hook-form`: ^7.60.0 - 表单管理

### 文件存储
- `@aws-sdk/client-s3`: ^3.1002.0 - AWS S3 客户端（可选）
- `@aws-sdk/s3-request-presigner`: ^3.1002.0 - S3 预签名 URL（可选）

---

## 🔍 环境变量说明

### 必需环境变量

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `DB_SERVER` | SQL Server 地址 | `localhost` |
| `DB_DATABASE` | 数据库名称 | `AxinRepairDB` |
| `DB_USER` | 数据库用户名 | `AxinUser` |
| `DB_PASSWORD` | 数据库密码 | `your-password` |
| `DB_PORT` | 数据库端口 | `1433` |
| `DATABASE_URL` | Prisma 连接字符串 | `sqlserver://...` |

### 可选环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `DB_ENCRYPT` | 是否加密连接 | `false` |
| `DB_TRUST_CERT` | 信任服务器证书 | `true` |
| `DB_POOL_MAX` | 连接池最大连接数 | `10` |
| `PORT` | 应用端口 | `3000` |
| `HOSTNAME` | 监听地址 | `0.0.0.0` |
| `STORAGE_MODE` | 存储模式 (`local`/`s3`) | `local` |
| `UPLOAD_DIR` | 上传目录 | `./public/uploads` |

---

## 🛠️ 开发环境设置

### 1. 克隆项目
```bash
git clone <repository-url>
cd axiom-repair
```

### 2. 安装依赖
```bash
npm install
```

### 3. 配置环境变量
```bash
cp env.example .env.local
# 编辑 .env.local，填入本地开发配置
```

### 4. 初始化数据库
```bash
# 生成 Prisma Client
npm run prisma:generate

# 推送 Schema 到数据库（开发环境）
npm run prisma:push

# 或使用 Prisma Migrate（生产环境推荐）
# npx prisma migrate dev
```

### 5. 启动开发服务器
```bash
npm run dev
```

应用将在 `http://localhost:3000` 启动，支持热重载。

---

## 📝 常用脚本命令

```bash
# 开发
npm run dev              # 启动开发服务器

# 构建
npm run build            # 构建生产版本
npm start                # 启动生产服务器

# Prisma
npm run prisma:generate  # 生成 Prisma Client
npm run prisma:push      # 推送 Schema 到数据库
npm run prisma:studio    # 打开 Prisma Studio

# 数据管理
npm run import-excel     # 导入 Excel 数据
npm run create-test-users # 创建测试用户

# 代码质量
npm run lint             # 运行 ESLint
```

---

## 🔐 安全注意事项

1. **密码管理**:
   - 生产环境密码不要提交到 Git
   - 使用环境变量或密钥管理服务
   - `.env.local` 和 `.env.production` 已在 `.gitignore` 中

2. **数据库连接**:
   - 生产环境使用强密码
   - 限制数据库用户权限（最小权限原则）
   - 使用 SSL/TLS 加密（公网环境）

3. **文件上传**:
   - 限制文件类型和大小
   - 使用对象存储时配置访问策略
   - 定期清理临时文件

---

## 📞 故障排查

### 数据库连接失败

1. 检查 SQL Server 服务是否运行
2. 验证防火墙设置（端口 1433）
3. 确认数据库用户权限
4. 检查连接字符串格式

**测试连接**:
```bash
# 访问测试页面
http://localhost:3000/test-db

# 或使用 API
curl http://localhost:3000/api/db/test
```

### 构建失败

1. 检查 Node.js 版本: `node --version` (应 >= 18.0.0)
2. 清理缓存: `rm -rf .next node_modules`
3. 重新安装依赖: `npm install`
4. 检查 TypeScript 错误: `npm run lint`

### PM2 进程崩溃

1. 查看日志: `pm2 logs axiom-repair`
2. 检查环境变量配置
3. 验证数据库连接
4. 检查端口占用: `netstat -ano | findstr :3000`

---

## 📚 相关文档

- [CRUD 部署指南](./CRUD_DEPLOYMENT_GUIDE.md)
- [数据库连接配置](./DB_CONNECTION.md)
- [环境变量模板](./env.example)
- [PM2 配置文件](./ecosystem.config.js)
- [Dockerfile](./Dockerfile)

---

**最后更新**: 2026-02-28  
**文档版本**: 1.0.0
