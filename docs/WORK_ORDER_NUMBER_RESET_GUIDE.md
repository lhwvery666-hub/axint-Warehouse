# 工单编号重置指南

## 📋 概述

本指南说明如何清除所有维修工单并重置工单编号为 `wx00001` 格式。

---

## ⚠️ 重要警告

**此操作将删除以下所有数据，且不可恢复：**

- ✅ 所有维修工单 (`Repair_Tickets`)
- ✅ 所有批次记录 (`Batch`)
- ✅ 所有工单历史 (`Repair_Ticket_History`)
- ✅ 所有工单消息 (`TicketMessage`)

**请确保已备份数据再执行此操作！**

---

## 🚀 执行步骤

### 步骤 1：运行重置脚本

```bash
npm run reset-tickets
```

或

```bash
npx tsx scripts/reset-tickets-and-sequence.ts
```

### 步骤 2：查看执行结果

脚本将执行以下操作：

1. **统计当前数据**
   - 显示各表的记录数量

2. **删除所有工单相关数据**
   - 按依赖顺序删除（消息 → 历史 → 工单 → 批次）

3. **创建工单编号序列表** (`Ticket_Sequence`)
   - 初始值：0（第一个工单将是 `wx00001`）
   - 前缀：`wx`

4. **创建工单编号生成存储过程** (`sp_GetNextWorkOrderNumber`)
   - 供 API 调用
   - 确保并发安全

5. **验证结果**
   - 显示剩余工单数量
   - 显示序列当前值
   - 测试生成工单编号

---

## 📝 执行示例

```bash
$ npm run reset-tickets

🚀 开始执行维修工单重置操作...

✅ 数据库连接成功！

📊 正在统计当前数据...

当前数据库统计：
  - 维修工单 (Repair_Tickets)：156 条
  - 批次 (Batch)：23 条
  - 工单历史 (Repair_Ticket_History)：512 条
  - 工单消息 (TicketMessage)：89 条

⚠️  即将删除 780 条记录，此操作不可逆！

🗑️  开始清除数据...

正在删除工单消息 (TicketMessage)...
✅ 已删除 89 条工单消息

正在删除工单历史记录 (Repair_Ticket_History)...
✅ 已删除 512 条历史记录

正在删除所有维修工单 (Repair_Tickets)...
✅ 已删除 156 个维修工单

正在删除所有批次 (Batch)...
✅ 已删除 23 个批次

🔢 正在创建/重置工单编号序列表...

正在删除旧的序列表...
✅ 已删除旧序列表

正在创建新序列表...
✅ 序列表创建成功

正在初始化序列值...
✅ 序列值初始化成功（下一个工单编号将是 wx00001）

📝 正在创建工单编号生成函数...

正在创建新函数...
✅ 函数创建成功

📋 正在创建工单编号生成存储过程...

正在创建新存储过程...
✅ 存储过程创建成功

🔍 正在验证结果...

验证结果：
  - 剩余工单数量：0 条
  - 序列当前值：1
  - 序列前缀：wx
  - 测试生成工单编号：wx00001

✅ 重置成功！下一个工单编号将是：wx00002

🎉 所有操作完成！
```

---

## 🔧 在代码中使用新的工单编号

### 方法 1：使用 TypeScript 工具函数（推荐）

```typescript
import { getNextWorkOrderNumber } from '@/lib/work-order-number';

// 在创建工单时
async function createTicket() {
  const workOrderNumber = await getNextWorkOrderNumber();
  console.log(workOrderNumber); // 输出：wx00001
  
  // 使用工单编号创建工单
  await pool.request()
    .input('workOrderNumber', workOrderNumber)
    .query(`
      INSERT INTO Repair_Tickets (WorkOrderNumber, ...)
      VALUES (@workOrderNumber, ...)
    `);
}
```

### 方法 2：直接调用存储过程

```typescript
import sql from 'mssql';
import { getDbConnection } from '@/lib/db-config';

async function createTicket() {
  const pool = await getDbConnection();
  
  // 调用存储过程获取工单编号
  const result = await pool.request()
    .output('workOrderNumber', sql.NVarChar(20))
    .execute('sp_GetNextWorkOrderNumber');
  
  const workOrderNumber = result.output.workOrderNumber;
  console.log(workOrderNumber); // 输出：wx00001
  
  // 使用工单编号创建工单
  await pool.request()
    .input('workOrderNumber', workOrderNumber)
    .query(`
      INSERT INTO Repair_Tickets (WorkOrderNumber, ...)
      VALUES (@workOrderNumber, ...)
    `);
}
```

---

## 📊 数据库表结构

### Ticket_Sequence 表

| 列名 | 类型 | 说明 |
|------|------|------|
| `SequenceType` | NVARCHAR(50) | 序列类型（'WorkOrder'） |
| `CurrentValue` | INT | 当前序列值（从0开始） |
| `Prefix` | NVARCHAR(10) | 工单编号前缀（'wx'） |
| `UpdatedAt` | DATETIME2 | 最后更新时间 |

**示例数据：**
```sql
SequenceType | CurrentValue | Prefix | UpdatedAt
WorkOrder    | 42           | wx     | 2026-02-26 10:30:00
```

**生成的工单编号：** `wx00043`

---

## 🔍 查询当前序列状态

### 使用 TypeScript

```typescript
import { getCurrentSequenceValue, previewNextWorkOrderNumber } from '@/lib/work-order-number';

// 获取当前序列值
const sequence = await getCurrentSequenceValue();
console.log(sequence);
// 输出：{ currentValue: 42, prefix: 'wx', updatedAt: 2026-02-26T... }

// 预览下一个工单编号（不实际生成）
const nextNumber = await previewNextWorkOrderNumber();
console.log(nextNumber);
// 输出：wx00043
```

### 使用 SQL

```sql
-- 查询当前序列值
SELECT * FROM Ticket_Sequence WHERE SequenceType = 'WorkOrder'

-- 查询最新的工单编号
SELECT TOP 1 WorkOrderNumber 
FROM Repair_Tickets 
ORDER BY ID DESC
```

---

## 🛠️ 故障排除

### 问题 1：执行脚本失败

**错误信息：**
```
无法连接到数据库
```

**解决方法：**
1. 检查 `.env.local` 文件中的数据库连接配置
2. 确保数据库服务正在运行
3. 检查网络连接

### 问题 2：工单编号生成失败

**错误信息：**
```
工单编号生成存储过程不存在
```

**解决方法：**
```bash
# 重新运行重置脚本
npm run reset-tickets
```

### 问题 3：工单编号重复

**可能原因：**
- 并发创建工单时未使用存储过程
- 手动修改了序列表

**解决方法：**
1. 检查代码是否使用了 `getNextWorkOrderNumber()`
2. 不要手动修改 `Ticket_Sequence` 表
3. 重新运行重置脚本

---

## 📖 相关文档

- [工单动作驱动工作流系统](./TICKET_ACTION_BAR_SYSTEM.md)
- [状态聚合系统](./STATUS_AGGREGATION_SYSTEM.md)
- [批次工单系统](./BATCH_WORKFLOW_SYSTEM.md)

---

## ⚡ 快速参考

### 重置工单并清空数据
```bash
npm run reset-tickets
```

### 在代码中生成新工单编号
```typescript
import { getNextWorkOrderNumber } from '@/lib/work-order-number';
const workOrderNumber = await getNextWorkOrderNumber();
```

### 查看当前序列值
```typescript
import { getCurrentSequenceValue } from '@/lib/work-order-number';
const sequence = await getCurrentSequenceValue();
console.log(sequence.currentValue);
```

### 预览下一个工单编号
```typescript
import { previewNextWorkOrderNumber } from '@/lib/work-order-number';
const nextNumber = await previewNextWorkOrderNumber();
console.log(nextNumber); // wx00043
```

---

**最后更新**：2026-02-26  
**版本**：1.0.0  
**维护者**：架构师 (Arch)
