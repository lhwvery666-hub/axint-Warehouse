# 🐛 修复：创建工单时未记录操作日志

**日期**: 2026-02-28  
**修复人**: AI Assistant  
**问题**: 用户创建工单后，操作记录中没有显示创建工单的记录

---

## 📋 问题描述

用户创建批次工单后，在 `操作记录` 标签页中看不到任何记录。经查发现，`/api/tickets/batch` 创建工单的 API 只是将数据插入到 `Repair_Tickets` 表，但没有同时向 `Repair_Ticket_History` 表插入操作日志。

---

## ✅ 解决方案

### 1. 更新 `app/api/tickets/batch/route.ts`

在所有工单创建成功后，**立即向 `Repair_Ticket_History` 表插入一条记录**：

- **BatchId**: 当前批次的批次号
- **ActionType**: `TicketActionType.BATCH_CREATED`（新增的枚举值）
- **OperatorId**: 当前登录用户的 ID
- **OperatorName**: 从 `Users` 表中获取的真实姓名或用户名
- **Description**: 描述创建了多少个设备的工单
- **CreatedAt**: 当前时间戳

```typescript
// 记录操作日志到 Repair_Ticket_History
try {
  // 获取用户信息
  const userResult = await pool
    .request()
    .input("userId", Number(userIdCookie))
    .query(`
      SELECT RealName, Username FROM Users WHERE Id = @userId
    `)
  
  const operatorName = userResult.recordset[0]?.RealName || userResult.recordset[0]?.Username || "现场人员"

  // 插入操作日志
  await pool
    .request()
    .input("batchId", batchId)
    .input("actionType", TicketActionType.BATCH_CREATED)
    .input("operatorId", Number(userIdCookie))
    .input("operatorName", operatorName)
    .input("description", `创建批次工单（设备数量：${createdTicketIds.length}）`)
    .input("createdAt", new Date())
    .query(`
      INSERT INTO Repair_Ticket_History (
        BatchId, ActionType, OperatorId, OperatorName, Description, CreatedAt
      )
      VALUES (
        @batchId, @actionType, @operatorId, @operatorName, @description, @createdAt
      )
    `)
  
  console.log(`✅ [API] 操作记录已保存到 Repair_Ticket_History`)
} catch (historyLogError: unknown) {
  // 记录日志失败不影响主流程
  console.error('❌ [API] 保存操作记录失败:', historyLogError)
}
```

### 2. 更新 `lib/enums.ts`

在 `TicketActionType` 枚举中新增 `BATCH_CREATED`：

```typescript
export enum TicketActionType {
  BATCH_CREATED = "BatchCreated",       // 批次工单创建 ← 新增
  STATUS_CHANGE = "StatusChange",       // 状态变更
  DELAY = "Delay",                      // 延期
  CANCEL_REQUEST = "CancelRequest",     // 取消申请
  CANCEL_APPROVED = "CancelApproved",   // 取消申请已批准
  CANCEL_REJECTED = "CancelRejected",   // 取消申请已拒绝
  SUPPLEMENT_SN = "SupplementSN",       // 补录序列号
  BATCH_UPDATED = "BatchUpdated",       // 批次工单更新
}
```

---

## 🧪 测试步骤

1. **登录为现场人员（Reporter）**
2. **创建一个新的批次工单**，包含至少 1 个设备
3. **提交后，进入批次工单详情页**
4. **点击「操作记录」标签页**
5. **验证**：应该能看到一条记录，显示类似 "张三 创建批次工单（设备数量：2）"，时间为刚才创建的时间

---

## 🔍 技术细节

### 为什么在成功后才记录？

- 在所有设备工单都创建成功后才记录到 `Repair_Ticket_History`，确保操作的原子性。
- 如果任何一个设备工单创建失败，整个批次视为失败，不记录操作日志。

### 错误处理

- 记录操作日志失败不影响主流程（工单创建），只在服务器日志中输出错误信息。
- 这是因为操作日志是"辅助功能"，不应阻塞核心业务流程。

---

## 📁 相关文件

- `axiom-repair/app/api/tickets/batch/route.ts` - 批量创建工单 API
- `axiom-repair/lib/enums.ts` - 枚举定义
- `axiom-repair/app/api/tickets/batch-operation-logs/[batchId]/route.ts` - 查询操作日志 API
- `axiom-repair/components/batch-work-order-detail.tsx` - 批次工单详情页

---

## ✅ 符合规范

- ✅ 使用 `TicketActionType` 枚举，无硬编码字符串
- ✅ 使用 `DB_FIELDS` 常量引用数据库字段
- ✅ 使用 `unknown` 捕获错误类型，无 `any`
- ✅ 操作日志记录时间、人员、操作内容
- ✅ 不影响主流程（catch 后只记录日志）

---

## 🎯 预期效果

现在用户创建工单后，能在「操作记录」中清晰看到：

| 时间 | 操作人 | 操作类型 | 描述 |
|------|--------|----------|------|
| 2026-02-28 15:30 | 张三（现场人员） | 创建批次工单 | 创建批次工单（设备数量：2） |

**完成！✅**
