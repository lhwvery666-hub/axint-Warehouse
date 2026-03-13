# 🔧 修复：退回修改功能问题

**日期**: 2026-02-28  
**修复人**: AI Assistant

---

## 📋 问题清单

### 问题1：退回修改返回400错误
**描述**: 点击"退回修改"按钮后，返回400错误，日志显示 `用户 undefined 退回批次`

**原因**:
- `checkUserRole` 只返回 `userId`, `userRole`, `normalizedRole`，没有 `realName` 或 `username`
- API 代码中使用了 `currentUser.realName || currentUser.username`，导致 `undefined`

### 问题2：状态验证过严
**描述**: 只允许从 `BUSINESS_REVIEW`, `WAREHOUSE_SHIPPING`, `COMPLETED` 状态退回，但仓库在 `WAREHOUSE_CONFIRMED` 状态下也需要退回功能

### 问题3：维修人员无法操作工作台
**描述**: 退回后状态变成 `PENDING_REPORTER_REVISION`，但维修人员工作台没有处理这个状态，导致无法操作

### 问题4：报告人编辑后状态不重置
**描述**: 报告人编辑被退回的工单后，状态仍然是 `PENDING_REPORTER_REVISION`，没有重置为 `CREATED`，导致工单无法重新进入正常流程

### 问题5：缺少退回提示
**描述**: 报告人在批次详情页看不到工单已被退回的提示，不知道需要修改

---

## ✅ 修复方案

### 修复1：用户信息获取 (`app/api/tickets/reject-to-reporter/[batchId]/route.ts`)

**修复前**:
```typescript
const currentUser = authResult
console.log(`📤 [退回修改] 用户 ${currentUser.realName} 退回批次 ${batchId}`)
// currentUser.realName 是 undefined
```

**修复后**:
```typescript
const currentUser = authResult

// 从数据库查询用户详细信息（获取 realName 和 username）
const pool = await getDbConnection()
const userInfoResult = await pool
  .request()
  .input("userId", currentUser.userId)
  .query(`
    SELECT TOP 1 RealName, Username
    FROM Users
    WHERE UserID = @userId
  `)

const userRealName = userInfoResult.recordset.length > 0 
  ? (userInfoResult.recordset[0].RealName || userInfoResult.recordset[0].Username || currentUser.userId)
  : currentUser.userId

console.log(`📤 [退回修改] 用户 ${userRealName} 退回批次 ${batchId}`)
```

**关键变化**:
- ✅ 从数据库查询用户的 `RealName` 和 `Username`
- ✅ 优先使用 `RealName`，如果没有则使用 `Username`，最后使用 `userId`
- ✅ 所有使用 `currentUser.realName || currentUser.username` 的地方都改为 `userRealName`

---

### 修复2：扩展允许退回的状态 (`app/api/tickets/reject-to-reporter/[batchId]/route.ts`)

**修复前**:
```typescript
const allowedStatuses = [
  TicketStatus.BUSINESS_REVIEW,
  TicketStatus.WAREHOUSE_SHIPPING,
  TicketStatus.COMPLETED
]
```

**修复后**:
```typescript
// 允许从以下状态退回：商务审核、待发货、已完成、仓库已确认
const allowedStatuses = [
  TicketStatus.BUSINESS_REVIEW,
  TicketStatus.WAREHOUSE_SHIPPING,
  TicketStatus.COMPLETED,
  TicketStatus.WAREHOUSE_CONFIRMED
]
```

**关键变化**:
- ✅ 添加 `TicketStatus.WAREHOUSE_CONFIRMED` 到允许退回的状态列表
- ✅ 更新错误提示信息，明确列出允许退回的状态

---

### 修复3：维修人员工作台状态处理 (`components/repair-detail.tsx`)

**修复前**:
- 没有处理 `PENDING_REPORTER_REVISION` 状态
- 维修人员看不到退回提示

**修复后**:
```typescript
// 编辑权限判断
(user?.role === UserRole.ADMIN || 
 repairData.cancelRequestStatus === "Pending" ||
 repairData.status === TicketStatus.PENDING_REPORTER_REVISION ||  // 新增
 (user?.role === UserRole.TECHNICIAN && 
  (repairData.status === TicketStatus.CREATED || 
   repairData.status === TicketStatus.WAREHOUSE_CONFIRMING) &&
  !repairData.manufactureDate)
) && "pointer-events-none opacity-75"

// 退回提示
{repairData.status === TicketStatus.PENDING_REPORTER_REVISION && (
  <Alert className="mb-4 border-orange-300 bg-orange-50 pointer-events-auto">
    <AlertCircle className="h-4 w-4 text-orange-600" />
    <AlertDescription className="text-orange-800">
      <p className="font-semibold mb-1">📝 工单已退回给报告人修改</p>
      <p className="text-sm">
        此工单已被退回给现场人员修改，请等待现场人员完成修改并重新提交后再进行操作。
      </p>
    </AlertDescription>
  </Alert>
)}
```

**关键变化**:
- ✅ 添加 `PENDING_REPORTER_REVISION` 状态到编辑权限判断（锁定工作台）
- ✅ 添加退回提示，告知维修人员工单已被退回

---

### 修复4：报告人编辑后状态重置 (`app/api/tickets/batch-update/[batchId]/route.ts`)

**修复前**:
```typescript
// 只有已取消的工单才重置状态为 Created
const shouldResetStatus = currentStatus === TicketStatus.CANCELLED
```

**修复后**:
```typescript
// 已取消或待报告人修改的工单，编辑后重置状态为 Created
const shouldResetStatus = currentStatus === TicketStatus.CANCELLED || currentStatus === TicketStatus.PENDING_REPORTER_REVISION
```

**关键变化**:
- ✅ 添加 `PENDING_REPORTER_REVISION` 状态到重置条件
- ✅ 报告人编辑被退回的工单后，状态会重置为 `CREATED`，工单重新进入正常流程

---

### 修复5：批次详情页退回提示 (`components/batch-work-order-detail.tsx`)

**修复前**:
- 没有退回提示
- 报告人不知道工单已被退回

**修复后**:
```typescript
{/* 待报告人修改的提示（工单被退回） */}
{batchInfo.status === TicketStatus.PENDING_REPORTER_REVISION && user?.role === UserRole.REPORTER && (
  <Alert className="border-orange-300 bg-orange-50">
    <AlertCircle className="h-5 w-5 text-orange-600" />
    <AlertDescription>
      <p className="font-semibold text-orange-900 mb-2">
        ⚠️ 此工单已被退回，需要修改
      </p>
      {batchInfo.revisionRequestReason && (
        <p className="text-sm text-orange-800 mb-2">
          <strong>退回原因：</strong>{batchInfo.revisionRequestReason}
        </p>
      )}
      {batchInfo.revisionRequestedBy && (
        <p className="text-xs text-orange-700 mb-3">
          退回人：{batchInfo.revisionRequestedBy}
          {batchInfo.revisionRequestDate && ` | 退回时间：${format(new Date(batchInfo.revisionRequestDate), 'yyyy-MM-dd HH:mm', { locale: zhCN })}`}
        </p>
      )}
      <p className="text-sm text-orange-800">
        请点击"编辑工单"按钮修改工单信息，修改完成后工单将重新进入正常流程。
      </p>
    </AlertDescription>
  </Alert>
)}
```

**关键变化**:
- ✅ 添加退回提示，显示退回原因、退回人、退回时间
- ✅ 提示报告人点击"编辑工单"按钮修改工单信息

---

### 修复6：批次设备API返回退回字段 (`app/api/tickets/batch-devices/[batchId]/route.ts`)

**修复前**:
- 没有查询和返回退回相关字段
- 前端无法获取退回信息

**修复后**:
```typescript
// 检查字段是否存在
const hasRevisionRequestedBy = columnNames.some(c => c.toLowerCase() === 'revisionrequestedby')
const hasRevisionRequestReason = columnNames.some(c => c.toLowerCase() === 'revisionrequestreason')
const hasRevisionRequestDate = columnNames.some(c => c.toLowerCase() === 'revisionrequestdate')

// 添加到查询字段
if (hasRevisionRequestedBy) selectFields += ', RevisionRequestedBy'
if (hasRevisionRequestReason) selectFields += ', RevisionRequestReason'
if (hasRevisionRequestDate) selectFields += ', RevisionRequestDate'

// 添加到返回数据
const batchInfo = {
  // ... 其他字段
  revisionRequestedBy: hasRevisionRequestedBy ? (result.recordset[0].RevisionRequestedBy || null) : null,
  revisionRequestReason: hasRevisionRequestReason ? (result.recordset[0].RevisionRequestReason || null) : null,
  revisionRequestDate: hasRevisionRequestDate ? (result.recordset[0].RevisionRequestDate || null) : null,
}
```

**关键变化**:
- ✅ 动态检查退回相关字段是否存在
- ✅ 添加到查询字段列表
- ✅ 添加到返回的 `batchInfo` 对象中

---

## 🎯 修复效果

### 修复前

**问题1**:
- ❌ 退回修改返回400错误
- ❌ 日志显示 `用户 undefined 退回批次`

**问题2**:
- ❌ 仓库在 `WAREHOUSE_CONFIRMED` 状态下无法退回

**问题3**:
- ❌ 退回后维修人员看不到提示
- ❌ 工作台状态不明确

**问题4**:
- ❌ 报告人编辑后状态不重置
- ❌ 工单无法重新进入正常流程

**问题5**:
- ❌ 报告人不知道工单已被退回
- ❌ 缺少退回原因和时间信息

### 修复后

**问题1**:
- ✅ 正确获取用户信息（`RealName` 或 `Username`）
- ✅ 日志显示正确的用户名

**问题2**:
- ✅ 仓库可以在 `WAREHOUSE_CONFIRMED` 状态下退回

**问题3**:
- ✅ 维修人员看到退回提示
- ✅ 工作台被正确锁定

**问题4**:
- ✅ 报告人编辑后状态重置为 `CREATED`
- ✅ 工单重新进入正常流程

**问题5**:
- ✅ 报告人看到退回提示
- ✅ 显示退回原因、退回人、退回时间
- ✅ 提示如何修改工单

---

## 📁 修改的文件

1. ✅ `app/api/tickets/reject-to-reporter/[batchId]/route.ts`
   - 从数据库查询用户信息
   - 扩展允许退回的状态列表
   - 修复所有用户信息引用

2. ✅ `components/repair-detail.tsx`
   - 添加 `PENDING_REPORTER_REVISION` 状态处理
   - 添加退回提示
   - 锁定工作台编辑

3. ✅ `app/api/tickets/batch-update/[batchId]/route.ts`
   - 添加 `PENDING_REPORTER_REVISION` 状态到重置条件
   - 报告人编辑后状态重置为 `CREATED`

4. ✅ `components/batch-work-order-detail.tsx`
   - 添加退回提示（显示退回原因、退回人、退回时间）
   - 提示报告人如何修改工单

5. ✅ `app/api/tickets/batch-devices/[batchId]/route.ts`
   - 添加退回相关字段的查询和返回

---

## 🧪 测试验证

### 测试1：退回修改功能
1. **以仓库管理员身份登录**
2. **进入批次工单详情页（状态为 `WAREHOUSE_CONFIRMED`）**
3. **点击"退回修改"按钮**
4. **填写退回原因**
5. **提交退回**
6. **验证**：
   - ✅ 返回成功（不是400错误）
   - ✅ 日志显示正确的用户名（不是 `undefined`）
   - ✅ 工单状态变为 `PENDING_REPORTER_REVISION`

### 测试2：维修人员工作台
1. **工单被退回后（状态为 `PENDING_REPORTER_REVISION`）**
2. **以维修人员身份进入工作台**
3. **验证**：
   - ✅ 显示"工单已退回给报告人修改"提示
   - ✅ 工作台被锁定，无法编辑

### 测试3：报告人编辑工单
1. **工单被退回后（状态为 `PENDING_REPORTER_REVISION`）**
2. **以报告人身份进入批次详情页**
3. **验证**：
   - ✅ 显示退回提示（退回原因、退回人、退回时间）
   - ✅ 可以点击"编辑工单"按钮
4. **编辑工单并提交**
5. **验证**：
   - ✅ 工单状态重置为 `CREATED`
   - ✅ 工单重新进入正常流程

---

## ✅ 符合规范

- ✅ **NO Magic Strings**: 使用 `TicketStatus` 枚举
- ✅ **User Experience**: 提供清晰的提示信息
- ✅ **Business Logic**: 符合实际业务流程
- ✅ **Error Handling**: 正确处理用户信息缺失的情况
- ✅ **Database Integrity**: 使用参数化查询，防止SQL注入

---

**修复完成！现在退回修改功能可以正常工作了！** 🚀

**重要提示**：
- 退回后，报告人需要编辑工单并重新提交，工单才会重新进入正常流程
- 维修人员在工单被退回期间无法操作工作台（这是正确的行为）
- 不需要新建工单，直接编辑现有工单即可
