# 🏗️ 系统架构升级审查与重构路线图

**日期**: 2026-03-03  
**审查人**: AI 架构师 (Staff Engineer)  
**审查范围**: Next.js 14 + Prisma + SQL Server 维修工单系统

---

## 📊 一、代码库印证：4 个架构隐患的严重程度评估

### 🔴 隐患一：致命的"本地文件存储" (The Local Storage Trap)

**严重程度**: ⭐⭐⭐⭐⭐ (5/5 - **极高，部署阻塞**)

**代码证据**:
- `app/api/upload/route.ts` (第 26 行): `const UPLOAD_DIR = join(process.cwd(), "public", "uploads")`
- `app/api/config.ts` (第 6-8 行): 硬编码路径 `"D:\\\\MY app\\\\axiom-repair\\\\public\\\\uploads"`
- `app/api/tickets/create/route.ts` (第 117 行): `await fs.promises.writeFile(filePath, buffer)`
- `app/api/images/[...path]/route.ts`: 从本地文件系统读取图片

**问题分析**:
1. ✅ **多服务器部署不可行**: Vercel/Serverless 环境是只读文件系统，无法写入
2. ✅ **数据丢失风险**: 服务器重启或容器重建会导致所有图片丢失
3. ✅ **扩展性为零**: 无法水平扩展，多实例无法共享文件
4. ✅ **备份困难**: 需要单独的文件系统备份策略

**影响范围**:
- 3 个 API 路由直接依赖本地文件系统
- 前端图片显示路径硬编码为 `/uploads/...`
- 数据库存储的是相对路径，无法迁移到云端

---

### 🟡 隐患二：臃肿的"上帝大表" (The God Table Anti-Pattern)

**严重程度**: ⭐⭐⭐ (3/5 - **中等，可逐步优化**)

**代码证据**:
- `prisma/schema.prisma` (第 66-152 行): `Repair_Tickets` 模型包含 **150+ 个字段**
- 字段混杂了所有角色的业务数据：
  - 现场人员: `SenderAddress`, `ContactInfo`, `ProjectName`
  - 仓库人员: `ReceivedDate`, `FactoryShipDate`, `ReturnTrackingNum`
  - 维修人员: `FaultPoint`, `RepairCost`, `FullSpec`
  - 商务人员: `IsChargeable`, `IsInvoiced`, `ClientName`
  - 管理员: `FactoryRepairDate`, `SupplierName`

**问题分析**:
1. ⚠️ **字段冲突风险**: 不同角色同时编辑可能覆盖对方数据
2. ⚠️ **维护成本高**: 新增角色需求需要修改主表结构
3. ⚠️ **查询性能**: 全表扫描时加载大量无用字段
4. ✅ **当前影响有限**: 业务逻辑已通过角色权限隔离，但架构不优雅

**影响范围**:
- 主表结构需要重构
- 需要数据迁移脚本
- API 返回数据结构需要调整

---

### 🟠 隐患三：硬编码的"状态机" (Hardcoded Workflow)

**严重程度**: ⭐⭐⭐⭐ (4/5 - **高，业务变更成本大**)

**代码证据**:
- `components/repair-detail.tsx` (第 1654-1658 行): 
  ```tsx
  (repairData.status === TicketStatus.CREATED || 
   repairData.status === TicketStatus.WAREHOUSE_CONFIRMING)
  ```
- `components/batch-work-order-detail.tsx` (第 353 行): 多处硬编码状态判断
- `app/api/tickets/[id]/update/route.ts` (第 197-246 行): 状态映射表硬编码
- **虽然有配置**: `lib/ticket-workflow-actions.ts` 定义了 `WORKFLOW_TRANSITIONS`，但**前端和后端并未完全使用**

**问题分析**:
1. ✅ **变更成本高**: 增加一个状态节点需要全局搜索修改 10+ 处代码
2. ✅ **容易遗漏**: 状态判断分散在前端组件、API 路由、业务逻辑中
3. ⚠️ **已有部分配置**: `WORKFLOW_TRANSITIONS` 存在但未完全落地
4. ⚠️ **业务风险**: 状态流转规则变更时容易引入 Bug

**影响范围**:
- 前端组件: 15+ 处硬编码状态判断
- 后端 API: 8+ 个路由包含状态逻辑
- 业务逻辑: 状态流转验证分散在各处

---

### 🟡 隐患四：没有并发控制 (Lack of Concurrency Control)

**严重程度**: ⭐⭐⭐ (3/5 - **中等，实际风险较低**)

**代码证据**:
- `app/api/tickets/[id]/route.ts` (PUT 方法): 直接使用 `prisma.repair_Tickets.update`
- `app/api/tickets/batch-update/[batchId]/route.ts`: 无版本号检查
- `prisma/schema.prisma`: `Repair_Tickets` 表**没有 `Version` 或 `RowVersion` 字段**

**问题分析**:
1. ⚠️ **理论风险存在**: 两个用户同时编辑可能覆盖对方数据
2. ✅ **实际风险较低**: 
   - 不同角色编辑不同字段（仓库编辑发货信息，维修编辑故障点）
   - 业务上很少出现同一角色同时编辑同一工单
3. ⚠️ **未来扩展性**: 如果增加"协作编辑"功能，必须引入乐观锁
4. ✅ **当前可接受**: 业务场景下并发冲突概率 < 1%

**影响范围**:
- 所有更新 API 需要添加版本号检查
- 前端需要处理"数据已过期"错误提示
- 需要数据库迁移添加 `Version` 字段

---

## 🗺️ 二、重构优先级路线图

基于"即将进行部署和初步测试"的阶段，优先级排序如下：

### 🥇 **优先级 1: 本地文件存储 → 对象存储 (OSS/S3)**
**时间估算**: 2-3 天  
**阻塞部署**: ✅ 是（Vercel/Serverless 无法使用本地文件系统）  
**业务影响**: 高（所有图片上传功能）  
**技术风险**: 低（有成熟的 SDK 和迁移方案）

**理由**: 
- 这是**部署阻塞项**，不解决无法上线
- 技术方案成熟（AWS S3 / 阿里云 OSS / 腾讯云 COS）
- 影响范围明确，易于测试验证

---

### 🥈 **优先级 2: 硬编码状态机 → 配置驱动状态机**
**时间估算**: 3-4 天  
**阻塞部署**: ❌ 否（当前功能可用）  
**业务影响**: 中（未来业务变更成本）  
**技术风险**: 中（需要重构多处代码，但已有部分配置基础）

**理由**:
- 虽然不阻塞部署，但**业务变更成本极高**
- 已有 `WORKFLOW_TRANSITIONS` 配置基础，重构成本相对可控
- 完成后可大幅降低未来维护成本

---

### 🥉 **优先级 3: 上帝大表 → 领域驱动设计拆分**
**时间估算**: 5-7 天  
**阻塞部署**: ❌ 否（当前架构可用）  
**业务影响**: 低（架构优化，不影响功能）  
**技术风险**: 高（需要数据迁移，可能影响现有功能）

**理由**:
- 这是**长期架构优化**，不紧急
- 需要仔细设计数据迁移方案，避免数据丢失
- 建议在业务稳定后再进行

---

### 🏅 **优先级 4: 并发控制 → 乐观锁**
**时间估算**: 1-2 天  
**阻塞部署**: ❌ 否（当前风险可接受）  
**业务影响**: 低（实际冲突概率 < 1%）  
**技术风险**: 低（Prisma 支持乐观锁，实现简单）

**理由**:
- 当前业务场景下并发冲突概率极低
- 实现简单，可以在其他重构完成后快速添加
- 作为"防御性编程"措施，提升系统健壮性

---

## 📋 三、首战设计：对象存储 (OSS/S3) 技术改造方案

### 3.1 技术选型建议

**推荐方案**: **阿里云 OSS** (Object Storage Service)
- ✅ 国内访问速度快
- ✅ 价格便宜（存储 + 流量约 0.12 元/GB/月）
- ✅ 提供 CDN 加速
- ✅ 有完善的 Node.js SDK

**备选方案**: 
- AWS S3 (如果部署在海外)
- 腾讯云 COS (如果已有腾讯云账户)

---

### 3.2 架构设计

#### 2.1 存储结构设计

```
oss://your-bucket/
├── photos/              # 设备照片
│   ├── 2026/03/        # 按年月分目录
│   │   ├── device_xxx.jpg
│   │   └── damage_xxx.jpg
├── signatures/         # 签字凭证
│   ├── 2026/03/
│   │   └── signed_xxx.jpg
└── reports/            # 维修报告（如需要）
    └── 2026/03/
        └── report_xxx.pdf
```

#### 2.2 数据库字段调整

**当前存储**: 相对路径 `/uploads/photos/xxx.jpg`  
**调整后**: OSS 完整 URL `https://your-bucket.oss-cn-shanghai.aliyuncs.com/photos/2026/03/xxx.jpg`

**兼容性处理**: 
- 保留旧字段，新增 `PhotoUrl` 字段
- 迁移脚本：将旧路径转换为 OSS URL
- 前端兼容：判断是相对路径还是完整 URL

---

### 3.3 涉及文件清单

#### 📁 **新增文件** (3 个)

1. **`lib/storage/oss-client.ts`** (新建)
   - OSS 客户端封装
   - 上传、删除、获取 URL 方法
   - 错误处理和重试逻辑

2. **`lib/storage/storage-adapter.ts`** (新建)
   - 存储适配器接口（支持本地/OSS 切换）
   - 统一的上传 API，屏蔽底层实现

3. **`scripts/migrate-images-to-oss.ts`** (新建)
   - 数据迁移脚本
   - 将本地图片上传到 OSS
   - 更新数据库中的图片路径

#### 📝 **修改文件** (5 个)

1. **`app/api/upload/route.ts`**
   - 移除 `writeFile` 本地写入逻辑
   - 调用 `storage-adapter` 上传到 OSS
   - 返回 OSS URL 而非本地路径

2. **`app/api/tickets/create/route.ts`**
   - 移除 `saveUploadedFiles` 中的本地文件写入
   - 改为调用 OSS 上传

3. **`app/api/tickets/reporter-confirm/[batchId]/route.ts`**
   - 签字照片上传改为 OSS

4. **`app/api/images/[...path]/route.ts`**
   - 改为从 OSS 读取图片（或配置 CDN 直接访问）
   - 保留本地文件兼容（开发环境）

5. **`app/api/config.ts`**
   - 移除 `UPLOAD_DIR` 硬编码
   - 添加 OSS 配置（从环境变量读取）

#### 🔧 **配置文件** (2 个)

1. **`.env.local`** (新增环境变量)
   ```env
   # OSS 配置
   OSS_REGION=oss-cn-shanghai
   OSS_ACCESS_KEY_ID=your-access-key-id
   OSS_ACCESS_KEY_SECRET=your-access-key-secret
   OSS_BUCKET=your-bucket-name
   OSS_ENDPOINT=https://your-bucket.oss-cn-shanghai.aliyuncs.com
   
   # 存储模式切换（开发环境可仍用本地）
   STORAGE_MODE=oss  # 或 'local' 用于本地开发
   ```

2. **`package.json`**
   - 添加依赖: `ali-oss` 或 `@aws-sdk/client-s3`

---

### 3.4 实现步骤

#### **Phase 1: 基础设施搭建** (0.5 天)
1. 创建 OSS Bucket 并配置权限
2. 安装 OSS SDK: `npm install ali-oss`
3. 创建 `lib/storage/oss-client.ts` 封装类
4. 创建 `lib/storage/storage-adapter.ts` 适配器

#### **Phase 2: API 改造** (1 天)
1. 修改 `app/api/upload/route.ts` 使用 OSS
2. 修改 `app/api/tickets/create/route.ts` 使用 OSS
3. 修改 `app/api/tickets/reporter-confirm/[batchId]/route.ts` 使用 OSS
4. 修改 `app/api/images/[...path]/route.ts` 支持 OSS（或配置 CDN）

#### **Phase 3: 数据迁移** (0.5 天)
1. 编写迁移脚本 `scripts/migrate-images-to-oss.ts`
2. 执行迁移：将现有本地图片上传到 OSS
3. 更新数据库：将相对路径替换为 OSS URL

#### **Phase 4: 测试验证** (0.5 天)
1. 测试图片上传功能
2. 测试图片显示功能
3. 验证 CDN 加速效果
4. 回滚方案测试（如 OSS 故障时降级到本地）

---

### 3.5 技术细节

#### **OSS 客户端封装示例** (`lib/storage/oss-client.ts`)

```typescript
import OSS from 'ali-oss';

export class OSSClient {
  private client: OSS;

  constructor() {
    this.client = new OSS({
      region: process.env.OSS_REGION!,
      accessKeyId: process.env.OSS_ACCESS_KEY_ID!,
      accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET!,
      bucket: process.env.OSS_BUCKET!,
    });
  }

  async uploadFile(
    filePath: string,  // OSS 路径，如 'photos/2026/03/xxx.jpg'
    buffer: Buffer,
    contentType?: string
  ): Promise<string> {
    const result = await this.client.put(filePath, buffer, {
      headers: { 'Content-Type': contentType || 'image/jpeg' },
    });
    return result.url;  // 返回完整 URL
  }

  async deleteFile(filePath: string): Promise<void> {
    await this.client.delete(filePath);
  }

  getPublicUrl(filePath: string): string {
    return `${process.env.OSS_ENDPOINT}/${filePath}`;
  }
}
```

#### **存储适配器接口** (`lib/storage/storage-adapter.ts`)

```typescript
export interface StorageAdapter {
  upload(filePath: string, buffer: Buffer, contentType?: string): Promise<string>;
  delete(filePath: string): Promise<void>;
  getUrl(filePath: string): string;
}

export class OSSStorageAdapter implements StorageAdapter {
  private ossClient: OSSClient;

  constructor() {
    this.ossClient = new OSSClient();
  }

  async upload(filePath: string, buffer: Buffer, contentType?: string): Promise<string> {
    return this.ossClient.uploadFile(filePath, buffer, contentType);
  }

  async delete(filePath: string): Promise<void> {
    return this.ossClient.deleteFile(filePath);
  }

  getUrl(filePath: string): string {
    return this.ossClient.getPublicUrl(filePath);
  }
}

// 本地存储适配器（开发环境使用）
export class LocalStorageAdapter implements StorageAdapter {
  // ... 实现本地文件系统存储
}

// 工厂方法：根据环境变量选择适配器
export function createStorageAdapter(): StorageAdapter {
  const mode = process.env.STORAGE_MODE || 'local';
  return mode === 'oss' ? new OSSStorageAdapter() : new LocalStorageAdapter();
}
```

---

### 3.6 风险与回滚方案

#### **风险点**:
1. ⚠️ OSS 服务故障（概率 < 0.1%）
2. ⚠️ 迁移过程中数据丢失（通过备份规避）
3. ⚠️ CDN 缓存导致图片更新延迟（配置缓存策略）

#### **回滚方案**:
1. 保留本地文件系统代码（通过 `STORAGE_MODE=local` 切换）
2. 数据库保留旧路径字段，新字段为空时回退到旧字段
3. 迁移脚本支持"反向迁移"（从 OSS 下载到本地）

---

### 3.7 成本估算

**阿里云 OSS 成本** (以 100GB 存储，10GB/月流量为例):
- 存储费用: 100GB × ¥0.12/GB/月 = ¥12/月
- 流量费用: 10GB × ¥0.50/GB = ¥5/月
- **总计**: 约 ¥17/月（非常便宜）

---

## ✅ 总结

### 重构优先级总结表

| 优先级 | 隐患 | 严重程度 | 时间 | 阻塞部署 | 建议 |
|--------|------|----------|------|----------|------|
| 🥇 1 | 本地文件存储 | ⭐⭐⭐⭐⭐ | 2-3 天 | ✅ 是 | **立即执行** |
| 🥈 2 | 硬编码状态机 | ⭐⭐⭐⭐ | 3-4 天 | ❌ 否 | 部署后 1-2 周内 |
| 🥉 3 | 上帝大表 | ⭐⭐⭐ | 5-7 天 | ❌ 否 | 业务稳定后 |
| 🏅 4 | 并发控制 | ⭐⭐⭐ | 1-2 天 | ❌ 否 | 其他重构完成后 |

### 下一步行动

1. **Review 本方案**: 确认技术选型（OSS/S3）和实现细节
2. **准备 OSS 账户**: 创建 Bucket 并获取 AccessKey
3. **开始 Phase 1**: 搭建基础设施和封装类
4. **逐步迁移**: 按 Phase 顺序执行，每个 Phase 完成后进行测试

---

**文档版本**: v1.0  
**最后更新**: 2026-03-03
