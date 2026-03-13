# 👷 **架构师 (Arch):** 重大流程重构进度报告 - 状态自动回溯模式

**日期**: 2026-02-28  
**重构类型**: 废除"退回"机制，改为"随时编辑 + 状态自动回溯"模式

---

## 🎯 重构目标

### 原有问题
- ❌ "退回修改"流程死板，需要显式的退回按钮
- ❌ 需要填写退回原因，增加操作复杂度
- ❌ 状态变更为 `PENDING_REPORTER_REVISION`，需要额外的状态管理
- ❌ 不符合客户的敏捷协作需求

### 新的业务逻辑
- ✅ 开放"随时编辑"权限（终态除外）
- ✅ 编辑后**状态自动回溯**到对应节点
- ✅ **数据静默保留**，不清空下游人员填写的信息
- ✅ 操作留痕（审计日志）

---

## ✅ 已完成的任务

### 1. API 删除 ✅
- ✅ 删除 `app/api/tickets/reject-to-reporter/[batchId]/route.ts`
- ✅ 这个 API 专门用于"退回修改"，现在不再需要

### 2. 前端组件清理 (进行中 50%)

#### ✅ 已完成: `components/warehouse-batch-shipping.tsx`
- ✅ 删除 `RotateCcw` 图标导入
- ✅ 删除退回修改相关状态变量 (`isRejectDialogOpen`, `rejectReason`, `isRejecting`)
- ✅ 删除 `handleRejectToReporter` 函数
- ✅ 删除 2 个"退回修改"按钮
- ✅ 删除"退回修改对话框" (Dialog)

#### 🔄 进行中: `components/business-batch-review.tsx`
- ✅ 删除 `RotateCcw` 图标导入
- ✅ 删除退回修改相关状态变量
- ✅ 删除 `handleRejectToReporter` 函数
- ⏳ 删除 2 个"退回修改"按钮 (需要精确定位)
- ⏳ 删除"退回修改对话框"

---

## 📋 待完成的任务

### 3. 前端其他组件清理 ⏳
需要检查以下组件是否有"退回修改"相关代码：
- `components/batch-work-order-detail.tsx`
- `components/repair-detail.tsx`
- `app/api/tickets/batch-devices/[batchId]/route.ts` (如果有引用)

### 4. 重构 `batch-update` API ⏳
**核心逻辑**：
```typescript
// 状态自动回溯规则
if (现场人员修改了基础信息) {
  状态回退到 TicketStatus.CREATED
} else if (仓库人员修改了日期信息) {
  状态回退到 TicketStatus.WAREHOUSE_CONFIRMED
} else if (维修人员修改了维修信息) {
  状态回退到 TicketStatus.IN_REPAIR
}

// ⚠️ 重要：不清空下游数据，只改状态
```

### 5. 修改前端编辑权限 ⏳
- 移除对 `PENDING_REPORTER_REVISION` 状态的特殊处理
- 开放"随时编辑"权限（仅终态 `COMPLETED`, `CANCELLED` 等除外）
- 更新编辑按钮的显示逻辑

### 6. 确保数据静默保留 ⏳
- 在 `batch-update` API 中，确保只更新用户修改的字段
- 不清空任何下游字段（如仓库日期、维修信息等）

### 7. 添加操作留痕 ⏳
- 在 `Repair_Ticket_History` 表中记录：
  ```
  "[角色] 重新编辑了工单信息，流程回到 [节点]"
  ```

### 8. 清理 Schema ⏳
- 移除 `TicketStatus.PENDING_REPORTER_REVISION` 状态
- 移除 `RevisionRequest*` 相关字段（或标记为废弃）
- 更新 `lib/enums.ts` 中的状态定义

### 9. 创建重构总结文档 ⏳
- 记录完整的重构过程
- 列出所有修改的文件
- 提供测试场景和验证清单

---

## 🔍 发现的问题

### 问题 1: 前端组件删除困难
- `business-batch-review.tsx` 和 `warehouse-batch-shipping.tsx` 文件较大
- "退回修改"按钮分布在多个条件分支中
- 需要精确定位并删除，避免破坏其他功能

### 解决方案
- 使用 `grep` 精确定位所有 `onClick.*setIsRejectDialogOpen` 和 `退回修改` 文本
- 逐个删除，确保不影响其他按钮

---

## 📝 下一步计划

1. **继续清理前端组件** (当前任务)
   - 完成 `business-batch-review.tsx` 的删除
   - 检查其他组件是否有退回相关代码

2. **重构 `batch-update` API** (核心任务)
   - 实现状态自动回溯逻辑
   - 确保数据静默保留
   - 添加审计日志

3. **修改前端编辑权限**
   - 移除 `PENDING_REPORTER_REVISION` 状态的特殊处理
   - 更新编辑按钮显示逻辑

4. **清理 Schema 和枚举**
   - 移除废弃的状态和字段

5. **创建完整的重构文档**
   - 记录所有修改
   - 提供测试指南

---

## ⚠️ 注意事项

### 数据安全
- ✅ **绝对不要清空**下游人员已填写的数据
- ✅ 状态回溯只改状态，不改数据

### 业务逻辑
- ✅ 终态工单（`COMPLETED`, `CANCELLED`）**禁用所有编辑**
- ✅ 非终态工单允许随时编辑

### 审计合规
- ✅ 所有编辑操作必须记录到 `Repair_Ticket_History`
- ✅ 记录操作人、时间、状态变更

---

**当前进度**: 30% (3/9 任务完成)  
**预计完成**: 需要继续执行 6 个主要任务

**建议**: 先完成前端组件清理，再重构核心 API 逻辑，最后清理 Schema。
