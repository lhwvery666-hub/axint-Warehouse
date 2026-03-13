# 🔍 全局 `mssql` 残留自检报告

**生成时间**：2026-02-28  
**扫描范围**：`app/api/` 目录和 `lib/` 目录  
**扫描目标**：所有使用 `import ... from "mssql"` 或 `getDbConnection` 的文件  
**目的**：排查项目中是否还有旧的数据库驱动残留，确保架构统一，消除时区差异和连接池隐患

---

## 📊 扫描结果总览

| 类别 | 文件数 | 状态 |
|------|--------|------|
| **API 路由文件（需重构）** | 37 | 🔴 高优先级 |
| **核心库文件** | 2 | 🟡 中优先级 |
| **脚本文件（可延后）** | 8+ | 🟢 低优先级 |

---

## 🔴 第一优先级：API 路由文件（需迁移到 Prisma）

### 一、工单核心业务（Core Tickets）

#### 1. 工单创建与更新
- ✅ `app/api/tickets/batch-update/[batchId]/route.ts` - **已迁移到 Prisma**
- ✅ `app/api/tickets/batch-operation-logs/[batchId]/route.ts` - **已迁移到 Prisma**
- ❌ `app/api/tickets/create/route.ts` - 使用 `getDbConnection`
- ❌ `app/api/tickets/batch/route.ts` - 使用 `getDbConnection`
- ❌ `app/api/tickets/[id]/update/route.ts` - 使用 `getDbConnection`（2处）
- ❌ `app/api/tickets/[id]/route.ts` - 使用 `getDbConnection`（3处）

#### 2. 批次相关操作
- ❌ `app/api/tickets/batch-repair-report/[batchId]/route.ts` - 使用 `getDbConnection`（2处）
- ❌ `app/api/tickets/batch-devices/[batchId]/route.ts` - 使用 `getDbConnection`（4处）
- ❌ `app/api/tickets/batch-info/[batchId]/route.ts` - 使用 `getDbConnection`
- ❌ `app/api/tickets/batch-delete/[batchId]/route.ts` - 使用 `getDbConnection`
- ❌ `app/api/tickets/batch-cancel/[batchId]/route.ts` - 使用 `getDbConnection`
- ❌ `app/api/tickets/batch-cancel-approve/[batchId]/route.ts` - 使用 `getDbConnection`

#### 3. 仓库相关操作
- ❌ `app/api/tickets/warehouse-confirm-batch/[batchId]/route.ts` - 使用 `getDbConnection`
- ❌ `app/api/tickets/warehouse-shipping-batch/[batchId]/route.ts` - 使用 `getDbConnection`
- ❌ `app/api/tickets/warehouse-pending-batches/route.ts` - 使用 `getDbConnection`
- ❌ `app/api/tickets/warehouse-shipping-batches/route.ts` - 使用 `getDbConnection`
- ❌ `app/api/tickets/warehouse-completed-batches/route.ts` - 使用 `getDbConnection`
- ❌ `app/api/tickets/all-batches/route.ts` - 使用 `getDbConnection`
- ❌ `app/api/tickets/shipping-info/[batchId]/route.ts` - 使用 `getDbConnection`（2处）

#### 4. 维修相关操作
- ❌ `app/api/tickets/complete-repair-batch/[batchId]/route.ts` - 使用 `getDbConnection`
- ❌ `app/api/tickets/[id]/repair-report/route.ts` - 使用 `getDbConnection`（2处）
- ❌ `app/api/tickets/[id]/generate-repair-report/route.ts` - 使用 `getDbConnection`
- ❌ `app/api/tickets/[id]/set-manufacture-date/route.ts` - 使用 `getDbConnection`
- ❌ `app/api/tickets/manufacture-date/[deviceId]/route.ts` - 使用 `getDbConnection`

#### 5. 商务相关操作
- ❌ `app/api/tickets/business-pending-batches/route.ts` - 使用 `getDbConnection`
- ❌ `app/api/tickets/business-info/[batchId]/route.ts` - 使用 `getDbConnection`（2处）
- ❌ `app/api/tickets/business-confirm-batch/[batchId]/route.ts` - 使用 `getDbConnection`

#### 6. 现场人员相关操作
- ❌ `app/api/tickets/reporter-confirm/[batchId]/route.ts` - 使用 `getDbConnection`

#### 7. 工单工作流操作
- ❌ `app/api/tickets/[id]/workflow-action/route.ts` - 使用 `getDbConnection`
- ❌ `app/api/tickets/[id]/customer-confirm/route.ts` - 使用 `getDbConnection`

#### 8. 设备更换相关
- ❌ `app/api/tickets/confirm-replace/route.ts` - 使用 `import * as sql from "mssql"` + `getDbConnection`
- ❌ `app/api/tickets/request-replace/route.ts` - 使用 `getDbConnection`

#### 9. 签字照片相关
- ❌ `app/api/tickets/signed-photo/[batchId]/route.ts` - 使用 `getDbConnection`（3处）

#### 10. 工单列表与导出
- ❌ `app/api/tickets/route.ts` - 使用 `getDbConnection`
- ❌ `app/api/tickets/export/route.ts` - 使用 `getDbConnection`
- ❌ `app/api/tickets/export-excel/route.ts` - 使用 `getDbConnection`

### 二、认证与用户管理（Auth & Users）

#### 11. 认证相关
- ❌ `app/api/auth/login/route.ts` - 使用 `getDbConnection`
- ❌ `app/api/auth/register/route.ts` - 使用 `getDbConnection`
- ❌ `app/api/auth/me/route.ts` - 使用 `getDbConnection`

#### 12. 用户管理
- ❌ `app/api/users/route.ts` - 使用 `getDbConnection`
- ❌ `app/api/users/[id]/route.ts` - 使用 `getDbConnection`

### 三、系统功能（System Features）

#### 13. 系统配置
- ❌ `app/api/system-config/route.ts` - 使用 `getDbConnection`

#### 14. 设备管理
- ❌ `app/api/devices/route.ts` - 使用 `getDbConnection`

#### 15. 统计分析
- ❌ `app/api/statistics/route.ts` - 使用 `getDbConnection`

---

## 🟡 第二优先级：核心库文件

### 16. 数据库配置
- ❌ `lib/db-config.ts` - **核心文件**，导出 `getDbConnection`，使用 `import * as sql from 'mssql'`
  - ⚠️ **注意**：这是所有 API 的依赖源头，需要最后重构

### 17. 工具库
- ❌ `lib/auth-utils.ts` - 使用 `getDbConnection`（1处）
- ❌ `lib/work-order-number.ts` - 使用 `import sql from 'mssql'` + `getDbConnection`（2处）

---

## 🟢 第三优先级：脚本文件（可延后处理）

以下脚本文件使用 `mssql`，但不影响生产环境 API：

1. `scripts/add-workflow-fields.ts`
2. `scripts/reset-tickets-and-sequence.ts`
3. `scripts/add-photo-viewed-tracking.ts`
4. `scripts/clear-tickets-safe.ts`
5. `scripts/clear-all-tickets.ts`
6. `scripts/add-signed-report-photo-column.ts`
7. `scripts/quick-fix-id.ts`
8. `scripts/fix-id-final.ts`
9. `scripts/check-all-tables.ts`
10. `scripts/restore-table-structures.ts`
11. `scripts/create-test-users.ts`

---

## 📋 重构优先级建议

### 🔴 **第一优先级（立即重构）** - 核心业务流程

1. **工单创建与更新**（影响最大）
   - `app/api/tickets/create/route.ts`
   - `app/api/tickets/[id]/update/route.ts`
   - `app/api/tickets/[id]/route.ts`

2. **批次操作**（高频使用）
   - `app/api/tickets/batch-devices/[batchId]/route.ts`
   - `app/api/tickets/batch-repair-report/[batchId]/route.ts`

3. **仓库操作**（核心工作流）
   - `app/api/tickets/warehouse-confirm-batch/[batchId]/route.ts`
   - `app/api/tickets/warehouse-shipping-batch/[batchId]/route.ts`

4. **认证模块**（系统入口）
   - `app/api/auth/login/route.ts`
   - `app/api/auth/register/route.ts`
   - `app/api/auth/me/route.ts`

### 🟡 **第二优先级（逐步重构）** - 扩展功能

5. **批次列表查询**
   - `app/api/tickets/all-batches/route.ts`
   - `app/api/tickets/warehouse-pending-batches/route.ts`
   - `app/api/tickets/warehouse-shipping-batches/route.ts`
   - `app/api/tickets/warehouse-completed-batches/route.ts`
   - `app/api/tickets/business-pending-batches/route.ts`

6. **工单详情与报告**
   - `app/api/tickets/[id]/repair-report/route.ts`
   - `app/api/tickets/[id]/generate-repair-report/route.ts`

7. **用户管理**
   - `app/api/users/route.ts`
   - `app/api/users/[id]/route.ts`

### 🟢 **第三优先级（可延后）** - 辅助功能

8. **导出功能**
   - `app/api/tickets/export/route.ts`
   - `app/api/tickets/export-excel/route.ts`

9. **系统配置**
   - `app/api/system-config/route.ts`
   - `app/api/statistics/route.ts`
   - `app/api/devices/route.ts`

---

## ⚠️ 关键注意事项

### 1. 时区问题
- **当前风险**：混合使用 `mssql` 和 `Prisma` 会导致时区不一致
  - `mssql` 使用本地时间（可能 +8 小时）
  - `Prisma` 使用 UTC 时间
- **影响**：操作日志、时间戳字段可能出现 8 小时偏差

### 2. 连接池隐患
- **当前风险**：`getDbConnection()` 返回的连接池可能被意外关闭
- **影响**：高并发场景下可能出现连接池耗尽或死锁

### 3. 事务安全
- **当前风险**：手动管理事务容易出现回滚失败
- **影响**：数据不一致、事务死锁

---

## ✅ 已迁移到 Prisma 的文件

1. ✅ `app/api/tickets/batch-update/[batchId]/route.ts`
2. ✅ `app/api/tickets/batch-operation-logs/[batchId]/route.ts`

---

## 📝 重构建议

### 迁移模式（参考已完成的文件）

1. **移除旧依赖**：
   ```typescript
   // ❌ 删除
   import { getDbConnection } from "@/lib/db-config"
   import { Request as SqlRequest, Transaction } from "mssql"
   
   // ✅ 添加
   import { prisma } from "@/lib/prisma"
   import { Prisma } from "@prisma/client"
   ```

2. **事务迁移**：
   ```typescript
   // ❌ 旧方式
   const pool = await getDbConnection()
   const transaction = pool.transaction()
   await transaction.begin()
   try {
     // ...
     await transaction.commit()
   } catch {
     await transaction.rollback()
   }
   
   // ✅ 新方式
   await prisma.$transaction(async (tx) => {
     // 所有操作都在这里
   })
   ```

3. **查询迁移**：
   ```typescript
   // ❌ 旧方式
   const result = await pool.request().input("id", id).query(`SELECT ...`)
   
   // ✅ 新方式（ORM）
   const result = await prisma.repair_Tickets.findMany({ where: { ... } })
   
   // ✅ 新方式（原生 SQL，必要时）
   const result = await prisma.$queryRaw(Prisma.sql`SELECT ...`)
   ```

4. **操作日志**：
   ```typescript
   // ❌ 旧方式（手动传入时间，可能导致时区问题）
   await pool.request().query(`
     INSERT INTO Repair_Ticket_History (..., CreatedAt) VALUES (..., GETDATE())
   `)
   
   // ✅ 新方式（Prisma 自动生成 UTC 时间）
   await prisma.repair_Ticket_History.create({
     data: { ... } // 不传入 createdAt
   })
   ```

---

## 🎯 总结

- **总计**：37 个 API 路由文件需要迁移到 Prisma
- **已完成**：2 个文件
- **剩余**：35 个文件
- **核心库**：2 个文件（`lib/db-config.ts` 和 `lib/auth-utils.ts`）

**建议**：按照优先级逐步重构，确保每个文件迁移后都经过充分测试，避免影响生产环境。
