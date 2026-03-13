# 🔧 修复：RevisionCount 字段缺失导致退回失败

**日期**: 2026-02-28  
**修复人**: AI Assistant

---

## 📋 问题描述

**错误信息**: `Invalid column name 'RevisionCount'.`

**原因**:
- `schema.prisma` 中已定义 `RevisionCount` 字段（第124行）
- 但实际数据库表中可能还没有这个字段（Prisma schema 和数据库不同步）
- API 代码直接使用了 `RevisionCount` 字段，导致 SQL 错误

---

## ✅ 修复方案

### 修复1：动态字段检查

**文件**: `app/api/tickets/reject-to-reporter/[batchId]/route.ts`

**修复内容**:
- ✅ 在更新前动态检查字段是否存在
- ✅ 如果字段不存在，跳过该字段的更新
- ✅ 使用 `INFORMATION_SCHEMA.COLUMNS` 查询字段是否存在

**修复后的逻辑**:
```typescript
// 动态检查字段是否存在
const columnsResult = await pool.request().query(`
  SELECT COLUMN_NAME
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'Repair_Tickets'
`)
const columnNames = columnsResult.recordset.map((row: unknown) => {
  const r = row as { COLUMN_NAME: string }
  return r.COLUMN_NAME
})

const hasRevisionCount = columnNames.some(c => c.toLowerCase() === 'revisioncount')
const hasRevisionRequestedBy = columnNames.some(c => c.toLowerCase() === 'revisionrequestedby')
const hasRevisionRequestReason = columnNames.some(c => c.toLowerCase() === 'revisionrequestreason')
const hasRevisionRequestDate = columnNames.some(c => c.toLowerCase() === 'revisionrequestdate')

// 构建更新SQL（动态包含字段）
let updateFields = [
  `${DB_FIELDS.STATUS} = @newStatus`,
  `${DB_FIELDS.UPDATED_AT} = GETDATE()`
]

if (hasRevisionRequestedBy) {
  updateFields.push(`${DB_FIELDS.REVISION_REQUESTED_BY} = @requestedBy`)
}
if (hasRevisionRequestReason) {
  updateFields.push(`${DB_FIELDS.REVISION_REQUEST_REASON} = @reason`)
}
if (hasRevisionRequestDate) {
  updateFields.push(`${DB_FIELDS.REVISION_REQUEST_DATE} = @requestDate`)
}
if (hasRevisionCount) {
  updateFields.push(`${DB_FIELDS.REVISION_COUNT} = COALESCE(${DB_FIELDS.REVISION_COUNT}, 0) + 1`)
}

// 执行更新
const updateResult = await transaction.request()
  .input("batchId", batchId)
  .input("newStatus", TicketStatus.PENDING_REPORTER_REVISION)
  .input("requestedBy", userRealName)
  .input("reason", reason.trim())
  .input("requestDate", new Date())
  .query(`
    UPDATE Repair_Tickets
    SET ${updateFields.join(', ')}
    WHERE ${DB_FIELDS.BATCH_ID} = @batchId
  `)
```

**关键变化**:
- ✅ 动态检查所有退回相关字段是否存在
- ✅ 只更新存在的字段
- ✅ 如果 `RevisionCount` 不存在，跳过该字段的更新（不会报错）

---

## 🗄️ 数据库同步（可选）

### 方案1：使用 Prisma DB Push（开发环境推荐）

**命令**:
```bash
cd axiom-repair
npx prisma db push
```

**说明**:
- 将 `schema.prisma` 中的变更直接推送到数据库
- 适用于开发环境
- 不会创建迁移文件

**执行后**:
- `RevisionCount` 字段会被添加到 `Repair_Tickets` 表
- 默认值为 `0`
- 其他退回相关字段（如果缺失）也会被添加

---

### 方案2：使用 Prisma Migrate（生产环境推荐）

**步骤1：创建迁移文件**
```bash
cd axiom-repair
npx prisma migrate dev --name add_revision_fields
```

**步骤2：应用迁移**
```bash
npx prisma migrate deploy
```

**说明**:
- 创建迁移文件，记录数据库变更
- 适用于生产环境
- 可以版本控制和回滚

---

### 方案3：手动执行 SQL（不推荐）

**如果 Prisma 命令失败，可以手动执行**:

```sql
-- 检查字段是否存在
SELECT COLUMN_NAME 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'Repair_Tickets' AND COLUMN_NAME = 'RevisionCount'

-- 如果不存在，添加字段
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
  WHERE TABLE_NAME = 'Repair_Tickets' AND COLUMN_NAME = 'RevisionCount'
)
BEGIN
  ALTER TABLE Repair_Tickets
  ADD RevisionCount INT DEFAULT 0
END
```

**⚠️ 注意**: 根据 `.cursorrules`，不推荐手动执行 `ALTER TABLE`，应该使用 Prisma 工具。

---

## 🎯 修复效果

### 修复前

**问题**:
- ❌ 如果数据库中没有 `RevisionCount` 字段，API 会返回 500 错误
- ❌ 退回功能完全无法使用

### 修复后

**效果**:
- ✅ 即使数据库中没有 `RevisionCount` 字段，API 也能正常工作
- ✅ 动态检查字段存在性，只更新存在的字段
- ✅ 退回功能可以正常使用（即使字段缺失）

**后续**:
- 建议执行 `npx prisma db push` 同步数据库，添加 `RevisionCount` 字段
- 添加字段后，退回计数功能会正常工作

---

## 📁 修改的文件

1. ✅ `app/api/tickets/reject-to-reporter/[batchId]/route.ts`
   - 添加动态字段检查
   - 构建动态更新SQL
   - 只更新存在的字段

---

## 🧪 测试验证

### 测试1：字段不存在的情况
1. **确保数据库中没有 `RevisionCount` 字段**
2. **执行退回操作**
3. **验证**：
   - ✅ API 返回成功（不是 500 错误）
   - ✅ 工单状态更新为 `PENDING_REPORTER_REVISION`
   - ✅ 退回原因、退回人、退回时间正确记录
   - ⚠️ `RevisionCount` 不会被更新（因为字段不存在）

### 测试2：字段存在的情况
1. **执行 `npx prisma db push` 同步数据库**
2. **执行退回操作**
3. **验证**：
   - ✅ API 返回成功
   - ✅ 所有字段（包括 `RevisionCount`）都正确更新
   - ✅ `RevisionCount` 自动递增

---

## ✅ 符合规范

- ✅ **NO DB Column Hallucination**: 动态检查字段是否存在，不假设字段存在
- ✅ **Error Handling**: 优雅处理字段缺失的情况
- ✅ **Database Integrity**: 使用参数化查询，防止 SQL 注入
- ✅ **Type Safety**: 使用 `unknown` 类型并缩小类型

---

## 📝 执行命令

**推荐执行**（开发环境）:
```bash
cd axiom-repair
npx prisma db push
```

**或者**（生产环境）:
```bash
cd axiom-repair
npx prisma migrate dev --name add_revision_fields
npx prisma migrate deploy
```

---

**修复完成！现在退回功能可以正常工作了，即使数据库字段缺失也不会报错！** 🚀

**重要提示**：
- 代码已经修复，可以立即使用（即使字段缺失）
- 建议执行 `npx prisma db push` 同步数据库，添加缺失的字段
- 添加字段后，退回计数功能会正常工作
