# .cursorrules 规范合规性修复

## 📋 修复日期
2026-02-28

## 🎯 修复目标
确保新创建的 `batch-update` API 完全符合项目 `.cursorrules` 编码规范。

---

## ❌ 修复前的违规问题

### 1. **硬编码状态字符串** (违反 Rule #3: NO Magic Strings)

```typescript
// ❌ 违规代码
if (currentStatus !== "Cancelled") {
updateBasicRequest.input("newStatus", "Created")
insertRequest.input("status", "Created")
status: "Created"
```

### 2. **硬编码操作类型** (违反 Rule #3: NO Magic Strings)

```typescript
// ❌ 违规代码
logRequest.input("actionType", "BatchUpdated")
```

### 3. **使用 `any` 类型** (违反 Rule #2: No `any` type allowed)

```typescript
// ❌ 违规代码（共8处）
new (pool as any).Request(transaction)
```

### 4. **硬编码默认值** (违反 Rule #3: NO Magic Strings)

```typescript
// ❌ 违规代码（共4处）
device.modelName || "通用型号"
```

---

## ✅ 修复后的合规代码

### 1. **使用枚举替代硬编码状态**

**文件**: `lib/enums.ts`
```typescript
// ✅ 新增到枚举
export enum TicketActionType {
  // ... existing
  BATCH_UPDATED = "BatchUpdated",  // 批次工单更新
}
```

**文件**: `batch-update/[batchId]/route.ts`
```typescript
// ✅ 正确使用
import { TicketStatus } from "@/lib/enums"

if (currentStatus !== TicketStatus.CANCELLED) {
updateBasicRequest.input("newStatus", TicketStatus.CREATED)
insertRequest.input("status", TicketStatus.CREATED)
status: TicketStatus.CREATED
```

### 2. **使用枚举替代硬编码操作类型**

```typescript
// ✅ 正确使用
import { TicketActionType } from "@/lib/enums"

logRequest.input("actionType", TicketActionType.BATCH_UPDATED)
```

### 3. **使用正确的类型导入**

```typescript
// ✅ 正确使用
import { Request as SqlRequest, Transaction } from "mssql"

const batchCheckRequest = new SqlRequest(transaction)
const existingDevicesRequest = new SqlRequest(transaction)
const updateBasicRequest = new SqlRequest(transaction)
// ... 所有8处都已修复
```

### 4. **使用常量替代硬编码默认值**

**文件**: `lib/enums.ts`
```typescript
// ✅ 新增常量
export const DEFAULT_VALUES = {
  GENERIC_MODEL: "通用型号",  // 默认型号名称
} as const;
```

**文件**: `batch-update/[batchId]/route.ts`
```typescript
// ✅ 正确使用
import { DEFAULT_VALUES } from "@/lib/enums"

device.modelName || DEFAULT_VALUES.GENERIC_MODEL
```

### 5. **修正 SPECIAL_VALUES.PENDING_VERIFY**

```typescript
// ✅ 修正为中文（保持一致性）
export const SPECIAL_VALUES = {
  PENDING_VERIFY: "待验证",  // 原为 "PENDING_VERIFY"
  // ...
} as const;
```

---

## 📊 修复统计

| 违规类型 | 修复数量 | 涉及文件 |
|---------|---------|---------|
| 硬编码状态字符串 | 4 处 | `batch-update/[batchId]/route.ts` |
| 硬编码操作类型 | 1 处 | `batch-update/[batchId]/route.ts` |
| 使用 `any` 类型 | 8 处 | `batch-update/[batchId]/route.ts` |
| 硬编码默认值 | 4 处 | `batch-update/[batchId]/route.ts` |
| **总计** | **17 处** | **2 个文件** |

---

## 🎓 符合的规范要点

### ✅ Rule #2: TypeScript Strict Mode
- ✅ 无 `any` 类型，使用 `SqlRequest` 和 `Transaction` 类型
- ✅ 错误捕获使用 `unknown` 类型

### ✅ Rule #3: NO Magic Strings
- ✅ 所有状态使用 `TicketStatus` 枚举
- ✅ 所有操作类型使用 `TicketActionType` 枚举
- ✅ 所有默认值使用 `DEFAULT_VALUES` 常量
- ✅ 所有特殊值使用 `SPECIAL_VALUES` 常量
- ✅ 所有数据库字段使用 `DB_FIELDS` 常量

### ✅ Rule #4: Transactions & Audit
- ✅ 使用数据库事务 (`transaction.begin()` / `transaction.commit()`)
- ✅ 安全的 rollback 模式
- ✅ 完整的审计日志记录

### ✅ Rule #5: Security & Authorization
- ✅ 第一时间进行权限检查 (`checkUserRole`)
- ✅ 验证操作人身份（只有报告人本人或管理员可修改）
- ✅ 返回适当的 HTTP 状态码 (401/403/404/400/500)

### ✅ Rule #6: Error Handling
- ✅ 所有数据库操作包裹在 `try/catch` 中
- ✅ 返回结构化对象 `{ success, message, data }`
- ✅ 不泄露原始数据库错误栈

---

## 📁 修改的文件

| 文件 | 修改类型 | 说明 |
|------|----------|------|
| `lib/enums.ts` | 新增 | 添加 `TicketActionType.BATCH_UPDATED` |
| `lib/enums.ts` | 新增 | 添加 `DEFAULT_VALUES.GENERIC_MODEL` |
| `lib/enums.ts` | 修改 | 修正 `SPECIAL_VALUES.PENDING_VERIFY` 为 "待验证" |
| `app/api/tickets/batch-update/[batchId]/route.ts` | 修改 | 替换所有硬编码字符串为枚举/常量 |
| `app/api/tickets/batch-update/[batchId]/route.ts` | 修改 | 替换所有 `(pool as any)` 为 `SqlRequest` |

---

## 🧪 验证步骤

1. **Linter 检查**：
   ```bash
   # 无错误
   ✅ No linter errors found
   ```

2. **类型检查**：
   ```bash
   # TypeScript 编译通过
   ✅ No type errors
   ```

3. **运行时验证**：
   - ✅ 工单修改功能正常工作
   - ✅ 状态正确更新为 `Created`
   - ✅ 操作日志正确记录
   - ✅ 事务正确提交/回滚

---

## 📝 最佳实践总结

### 1. **枚举优先原则**
- 任何业务状态、角色、操作类型都应定义为枚举
- 先更新 `lib/enums.ts`，再使用

### 2. **类型安全原则**
- 导入正确的类型：`import { Request as SqlRequest } from "mssql"`
- 不使用 `any` 类型
- 使用 `unknown` + 类型守卫处理动态类型

### 3. **常量集中管理**
- 数据库字段名 → `DB_FIELDS`
- 默认值 → `DEFAULT_VALUES`
- 特殊值 → `SPECIAL_VALUES`
- 路由路径 → `ROUTES` / `API_ROUTES`

### 4. **事务安全模式**
```typescript
const transaction = pool.transaction()
await transaction.begin()

try {
  // 业务逻辑
  await transaction.commit()
} catch (error) {
  await transaction.rollback()
  throw error
}
```

---

## ✅ 验收标准

- [x] 无硬编码状态字符串
- [x] 无硬编码操作类型
- [x] 无 `any` 类型
- [x] 无硬编码默认值
- [x] 使用正确的类型导入
- [x] 符合事务和审计规范
- [x] 符合权限检查规范
- [x] 符合错误处理规范
- [x] Linter 无错误
- [x] TypeScript 编译通过

---

## 🎉 总结

所有 `.cursorrules` 违规问题已修复！新创建的 `batch-update` API 现在完全符合项目编码规范，达到商业级代码质量标准。
