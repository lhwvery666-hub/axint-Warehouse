# 退回修改功能 - 剩余实现指南

## ✅ 已完成（4/8）

1. ✅ 数据库添加退回修改字段
2. ✅ enums.ts 添加新状态
3. ✅ 创建退回API
4. ✅ 商务审核页添加退回按钮和对话框

---

## 📋 待实现（4/8）

### 5. 仓库发货页添加「退回修改」按钮

**文件**: `components/warehouse-batch-shipping.tsx`

**步骤**：
1. 导入 `RotateCcw`, `Textarea`, `Dialog` 组件
2. 添加状态：
   ```typescript
   const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false)
   const [rejectReason, setRejectReason] = useState("")
   const [isRejecting, setIsRejecting] = useState(false)
   ```
3. 添加退回处理函数（复用商务页的 `handleRejectToReporter`）
4. 在"确认发货/入库"按钮旁添加"退回修改"按钮
5. 在组件末尾添加退回对话框（复用商务页的Dialog结构）

---

### 6. 修改批次详情页：报告人可重新编辑退回的工单

**文件**: `components/batch-work-order-detail.tsx`

**步骤**：
1. 检查工单状态是否为 `TicketStatus.PENDING_REPORTER_REVISION`
2. 如果是，显示红色提示框：
   ```typescript
   {batchInfo.status === TicketStatus.PENDING_REPORTER_REVISION && user?.role === UserRole.REPORTER && (
     <Alert className="border-orange-300 bg-orange-50">
       <AlertCircle className="h-5 w-5 text-orange-600" />
       <AlertDescription>
         <p className="font-semibold text-orange-900 mb-2">
           ⚠️ 此工单已被退回，需要修改
         </p>
         <p className="text-sm text-orange-800 mb-2">
           退回原因：{batchInfo.revisionRequestReason}
         </p>
         <p className="text-xs text-orange-700">
           退回人：{batchInfo.revisionRequestedBy} | 
           退回时间：{format(new Date(batchInfo.revisionRequestDate), 'yyyy-MM-dd HH:mm')}
         </p>
       </AlertDescription>
     </Alert>
   )}
   ```
3. 启用 `BatchInfoEditor` 的编辑功能
4. 显示"重新提交"按钮，调用新API `/api/tickets/resubmit-after-revision/[batchId]`

---

### 7. 各环节预填充历史数据

#### 7.1 维修环节预填充

**文件**: `components/repair-detail.tsx`

**位置**: `loadTicketData` 函数中，在设置 `repairData` 时保留历史数据：

```typescript
setRepairData({
  ...ticket,
  // 保留已填写的维修数据
  repairCost: ticket.repairCost || "",
  supplierName: ticket.supplierName || "",
  faultPoint: ticket.faultPoint || "",
  // ... 其他字段
})
```

#### 7.2 商务环节预填充

**文件**: `components/business-batch-review.tsx`

**位置**: `fetchBusinessInfo` 函数中已经实现了数据加载，确保退回后再次进入时数据保留：

```typescript
// 已有代码，确认无误即可
setIsChargeable(!!result.data.isChargeable)
setIsPaymentReceived(!!result.data.isPaymentReceived)
setIsInvoiced(!!result.data.isInvoiced)
setTotalCost(result.data.totalCost?.toString() || "")
setClientName(result.data.clientName || "")
```

#### 7.3 仓库环节预填充

**文件**: `components/warehouse-batch-shipping.tsx`

**位置**: `fetchShippingInfo` 函数中已经实现了数据加载，确保退回后再次进入时数据保留。

---

### 8. 操作日志记录退回和重新提交动作

#### 8.1 添加新的操作日志类型

**文件**: `lib/enums.ts`

```typescript
export enum OperationLogType {
  // ... 现有类型
  REJECTED_TO_REPORTER = "Rejected_To_Reporter",       // 退回给报告人
  RESUBMITTED_BY_REPORTER = "Resubmitted_By_Reporter", // 报告人重新提交
}

export const OPERATION_LOG_TYPE_LABELS: Record<OperationLogType, string> = {
  // ... 现有标签
  [OperationLogType.REJECTED_TO_REPORTER]: "退回了工单要求修改",
  [OperationLogType.RESUBMITTED_BY_REPORTER]: "重新提交了修改后的工单",
}
```

#### 8.2 修改退回API记录日志

**文件**: `app/api/tickets/reject-to-reporter/[batchId]/route.ts`

在事务中添加操作日志记录（已在第158行实现）。

#### 8.3 创建重新提交API

**文件**: `app/api/tickets/resubmit-after-revision/[batchId]/route.ts`

```typescript
// POST 重新提交修改后的工单
// 1. 验证权限：只有报告人可以重新提交
// 2. 验证状态：必须是 PENDING_REPORTER_REVISION
// 3. 更新状态为 CREATED（重新进入流程）
// 4. 增加 SubmitDate 时间戳
// 5. 记录操作日志
```

---

## 🎯 测试流程

1. **创建工单** → 仓库确认 → 维修 → 商务审核
2. **商务点击"退回修改"** → 填写原因 → 确认
3. **报告人登录** → 看到红色提示框 → 查看退回原因
4. **报告人修改信息** → 点击"重新提交"
5. **工单重新进入流程** → 仓库确认（预填充历史数据） → 维修（预填充历史数据） → 商务审核（预填充历史数据）
6. **查看操作日志** → 确认退回和重新提交记录正确

---

## 📝 注意事项

1. 所有API必须使用 `checkUserRole` 进行权限验证
2. 所有状态字符串必须使用 `TicketStatus` 枚举
3. 所有数据库事务必须使用 `BEGIN TRAN` 和 `COMMIT/ROLLBACK`
4. 错误处理必须使用 `catch (error: unknown)` + 类型守卫
5. 操作日志必须记录操作人、时间和详细原因

---

## 🚀 快速实现建议

由于剩余功能与已完成的商务审核页类似，可以：
1. **仓库发货页**：复制商务审核页的退回实现
2. **批次详情页**：添加状态判断和提示框
3. **预填充**：确认现有加载逻辑正确
4. **操作日志**：在 enums.ts 添加类型，创建重新提交API

**预计工作量**：2-3小时完成全部剩余功能。
