# 仓库确认批次 API 紧急 Bug 修复

**修复日期**: 2026-02-26  
**文件**: `app/api/tickets/warehouse-confirm-batch/[batchId]/route.ts`  
**状态**: ✅ 已修复

---

## 🐛 错误描述

### 错误 1: Invalid column name 'ActionDescription'
**错误原因**: 历史记录表 `Repair_Ticket_History` 中不存在 `ActionDescription` 字段。

**根本原因**: 代码中使用了错误的字段名。根据数据库 schema (Prisma)，正确的字段名应该是：
- ✅ `ActionBy` (操作人)
- ✅ `ActionNote` (操作备注)

**错误字段名**:
- ❌ `OperatorID`
- ❌ `OperatorName`
- ❌ `ActionDescription`

### 错误 2: Transaction has not begun
**错误原因**: 双重事务回滚导致的连环错误。

**场景**:
1. 内部 try-catch 块捕获事务执行错误
2. 内部 catch 块回滚事务
3. 内部 catch 块抛出错误
4. 外部 catch 块捕获错误，再次尝试回滚**已经结束的事务**
5. 触发 `Transaction has not begun` 错误，**掩盖了真实的业务错误**

---

## ✅ 修复方案

### 修复 1: 使用正确的字段名

**修复前** (错误示例):
```typescript
INSERT INTO [dbo].[Repair_Ticket_History] (
  TicketID, ActionType, OldStatus, NewStatus, 
  OperatorID, OperatorName, ActionDescription, CreatedAt  // ❌ 错误字段名
)
VALUES (
  @ticketId, @actionType, @oldStatus, @newStatus,
  @operatorId, @operatorName, @actionDescription, @createdAt
)
```

**修复后** (✅ 正确):
```typescript
INSERT INTO [dbo].[Repair_Ticket_History] (
  TicketID, ActionType, OldStatus, NewStatus, 
  ActionBy, ActionNote, CreatedAt  // ✅ 正确字段名
)
VALUES (
  @ticketId, @actionType, @oldStatus, @newStatus,
  @actionBy, @actionNote, GETDATE()
)
```

### 修复 2: 防止双重回滚

**关键修改**: 在内部 catch 块回滚成功后，将 `transaction` 设置为 `null`，防止外部 catch 块再次回滚。

```typescript
} catch (transactionError: any) {
  // 事务执行失败，安全回滚
  console.error("[Warehouse Confirm Batch] 事务执行失败:", transactionError);
  if (transaction) {
    try {
      await transaction.rollback();
      transaction = null; // ⚠️ 关键：回滚成功后标记为null
    } catch (rollbackError) {
      // 忽略回滚本身的错误，避免掩盖原始错误
      console.error("事务回滚时发生忽略的错误:", rollbackError);
    }
  }
  throw transactionError;
}
```

**外部 catch 块** (已经是安全的):
```typescript
} catch (error: any) {
  // 安全回滚：只有在事务已存在且未完成时才回滚
  if (transaction) {  // ✅ 如果内部已回滚，这里 transaction 为 null，不会再次回滚
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      // 忽略回滚本身的错误，避免掩盖原始错误
      console.error("事务回滚时发生忽略的错误:", rollbackError);
    }
  }
  
  console.error("[Warehouse Confirm Batch] 发生错误:", error);
  return NextResponse.json(
    { 
      success: false, 
      message: "操作失败: " + (error instanceof Error ? error.message : "未知错误")
    },
    { status: 500 }
  );
}
```

---

## 📋 Repair_Ticket_History 表结构参考

根据 `prisma/schema.prisma` 和 `scripts/restore-table-structures.ts`：

```sql
CREATE TABLE Repair_Ticket_History (
  HistoryID INT IDENTITY(1,1) PRIMARY KEY,
  TicketID NVARCHAR(50) NOT NULL,
  ActionType NVARCHAR(50) NOT NULL,
  OldStatus NVARCHAR(50) NULL,
  NewStatus NVARCHAR(50) NULL,
  ActionBy NVARCHAR(100) NULL,      -- ✅ 操作人
  ActionNote NVARCHAR(MAX) NULL,     -- ✅ 操作备注
  DelayTo DATETIME2 NULL,
  DelayReason NVARCHAR(500) NULL,
  CreatedAt DATETIME2 DEFAULT GETDATE()
)
```

**字段说明**:
- `ActionBy`: 操作人姓名 (对应 `RealName` 或 `Username`)
- `ActionNote`: 操作备注/描述 (自由文本)

---

## 🔍 如何验证修复

### 1. 检查字段名是否正确

在代码中搜索，确保没有使用错误的字段名：

```bash
# 应该返回 0 结果
grep -r "ActionDescription\|OperatorID\|OperatorName" app/api/tickets/warehouse-confirm-batch/
```

### 2. 测试仓库确认流程

1. 仓库管理员登录
2. 进入待确认批次列表
3. 选择一个批次
4. 填写所有设备的出厂日期
5. 点击"确认"按钮
6. **预期结果**: 
   - ✅ 成功提示："批次设备已确认，共 X 台设备，状态已更新为'仓库已确认'"
   - ✅ 设备状态更新为 `WAREHOUSE_CONFIRMED`
   - ✅ 历史记录表中新增审计日志

### 3. 检查数据库记录

```sql
-- 查看最新的历史记录
SELECT TOP 10 
  HistoryID, TicketID, ActionType, 
  ActionBy, ActionNote, CreatedAt
FROM Repair_Ticket_History
ORDER BY CreatedAt DESC;

-- 验证仓库确认记录
SELECT * FROM Repair_Ticket_History
WHERE ActionType = 'StatusChange'
AND NewStatus = 'WarehouseConfirmed'
ORDER BY CreatedAt DESC;
```

---

## 🚨 常见问题

### Q1: 修复后还是报错 "Invalid column name"?

**可能原因**:
1. 浏览器缓存了旧版本代码 → **解决**: 强制刷新 (Ctrl+Shift+R)
2. Next.js 开发服务器需要重启 → **解决**: 重启 `npm run dev`
3. 数据库字段真的不存在 → **解决**: 运行 `npm run add-workflow-fields`

### Q2: 修复后还是报错 "Transaction has not begun"?

**检查清单**:
- [ ] 确认内部 catch 块中有 `transaction = null`
- [ ] 确认外部 catch 块的 rollback 有 try-catch 包裹
- [ ] 确认数据库连接池没有被意外关闭

### Q3: 如何查看真实的业务错误（不被回滚错误掩盖）?

查看日志中的 `[Warehouse Confirm Batch] 事务执行失败:` 消息，这里显示的是**真实的业务错误**。

回滚错误（如 "Transaction has not begun"）会被记录到 `事务回滚时发生忽略的错误:` 中，不会干扰错误诊断。

---

## 📚 相关文档

- [工作流字段迁移文档](./WORKFLOW_FIELDS_MIGRATION.md)
- [数据库连接池修复](./DATABASE_CONNECTION_POOL_FIX.md)
- [工单号重置指南](./WORK_ORDER_NUMBER_RESET_GUIDE.md)

---

## ✅ 修复验证

- [x] 字段名修复：使用 `ActionBy, ActionNote`
- [x] 事务回滚修复：防止双重回滚
- [x] Linter 检查通过
- [x] 符合 `.cursorrules` 规范
- [x] 审计日志完整
- [x] 错误处理健壮

**修复完成时间**: 2026-02-26  
**修复状态**: ✅ 已测试并部署
