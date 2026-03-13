# 批次工单取消功能优化

## 优化背景

用户反馈：在批次工单详情页中，"取消工单"按钮的位置和功能不够明确，容易产生误解：
- ❌ 点击设备详情弹窗中的"申请取消维修订单"，不知道会取消整个批次还是只取消单个设备
- ❌ 按钮位置不够明显（隐藏在设备详情弹窗内）
- ❌ 批次工单应该在主界面提供统一的取消入口

## 优化方案

### 核心原则

**批次工单 = 一个整体订单**
- 取消批次工单 = 取消所有设备
- 不允许单独取消批次中的某一台设备
- 取消操作应该在批次主界面，而不是设备详情弹窗中

## 实现细节

### 1. 批次工单主界面添加取消按钮

**文件**: `components/batch-work-order-detail.tsx`

在工单基础信息卡片的按钮区域，添加"申请取消批次工单"按钮：

```typescript
<div className="flex gap-2 flex-wrap">
  {/* 编辑维修报告 */}
  {user?.role === "technician" && (
    <Button variant="outline" onClick={() => setIsEditDialogOpen(true)}>
      <FileText className="w-4 h-4 mr-2" />
      编辑维修报告
    </Button>
  )}
  
  {/* 查看/打印维修报告 */}
  <Button onClick={() => setIsPrintDialogOpen(true)}>
    <Printer className="w-4 h-4 mr-2" />
    {user?.role === "reporter" ? "查看维修报告" : "打印维修报告"}
  </Button>
  
  {/* 申请取消批次工单 - 新增！*/}
  {user?.role === "reporter" && 
   batchInfo?.status !== "Cancelled" && 
   batchInfo?.status !== "Completed" && (
    <Button
      variant="outline"
      className="border-destructive text-destructive hover:bg-destructive/10"
      onClick={() => setIsCancelBatchDialogOpen(true)}
    >
      <AlertCircle className="w-4 h-4 mr-2" />
      申请取消批次工单
    </Button>
  )}
</div>
```

**特点：**
- ✅ 位置明显：在主界面顶部，与"编辑维修报告"、"打印维修报告"并排
- ✅ 红色边框+红色文字：醒目的警示色
- ✅ 文案明确："申请取消批次工单"（而不是"取消工单"）
- ✅ 只有现场人员可见
- ✅ 已完成或已取消的批次不显示此按钮

### 2. 取消批次工单对话框

**UI设计：**

```
┌─────────────────────────────────────────┐
│ ⚠️ 申请取消批次工单                      │
├─────────────────────────────────────────┤
│ 此操作将取消批次工单中的所有 2 台设备，  │
│ 提交后需要商务人员审批通过才能取消。      │
│                                         │
│ ┌───────────────────────────────────┐  │
│ │ ⚠️ 重要提示                        │  │
│ │ 取消批次工单后，批次号 WO2602249788  │  │
│ │ 下的所有设备工单都将被取消，此操作   │  │
│ │ 不可恢复。                          │  │
│ └───────────────────────────────────┘  │
│                                         │
│ 取消原因 *                               │
│ ┌───────────────────────────────────┐  │
│ │ 请详细说明取消批次工单的原因...      │  │
│ │                                    │  │
│ └───────────────────────────────────┘  │
│                                         │
│        [我再想想]  [确认取消 (2台设备)]  │
└─────────────────────────────────────────┘
```

**代码：**

```typescript
<Dialog open={isCancelBatchDialogOpen} onOpenChange={setIsCancelBatchDialogOpen}>
  <DialogContent className="sm:max-w-md">
    <DialogHeader>
      <DialogTitle className="text-destructive">申请取消批次工单</DialogTitle>
      <DialogDescription>
        此操作将取消批次工单中的<span className="font-semibold text-destructive">所有 {batchInfo?.deviceCount} 台设备</span>，提交后需要商务人员审批通过才能取消。
      </DialogDescription>
    </DialogHeader>

    <Alert className="border-orange-200 bg-orange-50">
      <AlertCircle className="h-4 w-4 text-orange-600" />
      <AlertDescription className="text-orange-800 text-sm">
        <p className="font-medium mb-1">⚠️ 重要提示</p>
        <p>取消批次工单后，批次号 <span className="font-mono font-semibold">{batchId}</span> 下的所有设备工单都将被取消，此操作不可恢复。</p>
      </AlertDescription>
    </Alert>

    <div className="space-y-2">
      <label className="text-sm font-medium">
        取消原因 <span className="text-destructive">*</span>
      </label>
      <Textarea
        value={cancelBatchReason}
        onChange={(e) => setCancelBatchReason(e.target.value)}
        placeholder="请详细说明取消批次工单的原因..."
        rows={4}
        className="resize-none"
      />
    </div>

    <DialogFooter className="gap-2 sm:gap-0">
      <Button variant="outline" onClick={() => setIsCancelBatchDialogOpen(false)}>
        我再想想
      </Button>
      <Button
        variant="destructive"
        onClick={handleRequestCancelBatch}
        disabled={isSubmittingCancelBatch || !cancelBatchReason.trim()}
      >
        {isSubmittingCancelBatch ? "提交中..." : `确认取消 (${batchInfo?.deviceCount}台设备)`}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**设计要点：**
- ✅ 标题使用红色（`text-destructive`）
- ✅ 橙色警告框，强调"所有设备"、"不可恢复"
- ✅ 必填取消原因
- ✅ 确认按钮显示设备数量，让用户清楚影响范围

### 3. 隐藏设备详情弹窗中的单设备取消按钮

**问题：** 在批次工单详情页中，点击某个设备查看详情时，弹窗中会显示`RepairDetail`组件，组件中有"申请取消维修订单"按钮。这会让用户困惑：
- 这个按钮会取消整个批次吗？
- 还是只取消当前这一台设备？

**解决方案：** 在批次模式下，隐藏设备详情弹窗中的取消按钮，并显示提示信息。

**修改 `RepairDetail` 组件：**

```typescript
interface RepairDetailProps {
  taskId: string
  onBack: () => void
  inBatchMode?: boolean  // 新增：标识是否在批次工单详情页中显示
}

export default function RepairDetail({ taskId, onBack, inBatchMode = false }: RepairDetailProps) {
  // ...

  {/* 现场人员操作按钮 */}
  {user?.role === "reporter" && !inBatchMode && (
    <div className="mt-6 pt-4 border-t space-y-3">
      {/* 申请取消按钮 - 仅在非批次模式下显示 */}
      <Button onClick={() => setIsCancelRequestDialogOpen(true)}>
        申请取消维修订单
      </Button>
    </div>
  )}
  
  {/* 批次模式提示 */}
  {user?.role === "reporter" && inBatchMode && (
    <div className="mt-6 pt-4 border-t">
      <Alert className="border-blue-200 bg-blue-50">
        <AlertCircle className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-800 text-sm">
          此设备属于批次工单，如需取消请在批次工单主页面点击"申请取消批次工单"按钮。
        </AlertDescription>
      </Alert>
    </div>
  )}
}
```

**调用时传递 `inBatchMode` 参数：**

```typescript
// 在 batch-work-order-detail.tsx 中
<RepairDetail 
  taskId={selectedDeviceId} 
  onBack={() => setSelectedDeviceId(null)}
  inBatchMode={true}  // 标识在批次模式下
/>
```

### 4. 批次取消申请状态提示

在批次工单主界面，显示批次级别的取消申请状态：

```typescript
{batchInfo && devices.length > 0 && (devices[0] as any).cancelRequestStatus === "Pending" && (
  <Alert className="border-orange-200 bg-orange-50">
    <AlertCircle className="h-4 w-4 text-orange-600" />
    <AlertDescription className="text-orange-800">
      <p className="font-medium mb-2">批次工单取消申请待审批</p>
      <p className="text-sm mb-1">申请原因：{(devices[0] as any).cancelRequestReason}</p>
      <p className="text-sm mb-1">涉及设备：{batchInfo.deviceCount} 台</p>
      <p className="text-sm text-orange-600">等待商务人员审批中...</p>
    </AlertDescription>
  </Alert>
)}
```

## API实现

### 批次取消API

**路径**: `/api/tickets/batch-cancel/[batchId]`  
**方法**: `POST`

**功能：** 为批次中的所有设备提交取消申请

**请求参数：**
```json
{
  "reason": "项目取消，不需要维修了",
  "userId": "user123"
}
```

**处理逻辑：**
1. 验证用户权限（只有现场人员可申请）
2. 查询批次下的所有设备
3. 检查批次状态（已完成或已取消的批次不允许取消）
4. 为批次中的所有设备更新 `CancelRequestStatus = 'Pending'`
5. 等待商务人员审批

**响应数据：**
```json
{
  "success": true,
  "message": "批次工单取消申请已提交，共 2 台设备等待审批",
  "data": {
    "batchId": "WO2602249788",
    "deviceCount": 2
  }
}
```

**数据库更新：**
```sql
UPDATE Repair_Tickets
SET 
  CancelRequestStatus = 'Pending',
  CancelRequestReason = @cancelRequestReason,
  CancelRequestDate = GETDATE(),
  UpdatedAt = GETDATE()
WHERE BatchId = @batchId
```

### 商务审批流程

**现有的单设备审批API仍然适用：** `/api/tickets/[id]/update`

商务人员需要：
1. 查看批次工单的取消申请
2. 逐个设备审批（或批量审批）
3. 审批通过后，每个设备的 `Status` 变为 `Cancelled`
4. 批次的整体状态也会变为 `Cancelled`

## 用户流程对比

### 优化前 ❌

```
批次工单详情页
    ↓
点击查看设备1详情
    ↓
[设备详情弹窗]
    ↓
点击"申请取消维修订单" ← 用户困惑：这会取消整个批次吗？
    ↓
❌ 不明确，用户不敢点击
```

### 优化后 ✅

```
批次工单详情页（主界面）
    ↓
[明显的红色按钮] "申请取消批次工单"
    ↓
[对话框] 清晰提示：
  - 将取消所有 2 台设备
  - 显示批次号
  - 必填取消原因
  - 确认按钮："确认取消 (2台设备)"
    ↓
✅ 用户明确知道影响范围
    ↓
提交申请 → 等待商务审批
```

**设备详情弹窗：**
```
批次工单详情页
    ↓
点击查看设备1详情
    ↓
[设备详情弹窗]
    ↓
❌ 不显示"申请取消维修订单"按钮（在批次模式下隐藏）
    ↓
✅ 显示蓝色提示：
   "此设备属于批次工单，如需取消请在批次工单主页面点击
    '申请取消批次工单'按钮。"
```

## 界面布局

### 批次工单主界面

```
┌─────────────────────────────────────────────┐
│ ← 返回          批次工单详情                 │
│                 工单号：WO2602249788          │
├─────────────────────────────────────────────┤
│ [工单流程时间线]                             │
├─────────────────────────────────────────────┤
│ 📦 工单基础信息                              │
│                                             │
│  [编辑维修报告] [打印维修报告] [🔴申请取消批次工单] ← 明显！
│                                             │
│  工单号: WO2602249788                        │
│  项目名称: 广州分公司维修项目                 │
│  ...                                        │
└─────────────────────────────────────────────┘
```

### 取消批次工单对话框

```
┌─────────────────────────────────────────┐
│ ⚠️ 申请取消批次工单                      │
│ 此操作将取消批次工单中的所有 2 台设备    │
├─────────────────────────────────────────┤
│ ┌───────────────────────────────────┐  │
│ │ ⚠️ 重要提示                        │  │
│ │ 取消批次工单后，批次号 WO2602249788 │  │
│ │ 下的所有设备工单都将被取消，        │  │
│ │ 此操作不可恢复。                   │  │
│ └───────────────────────────────────┘  │
│                                         │
│ 取消原因 *                               │
│ ┌───────────────────────────────────┐  │
│ │ 请详细说明...                      │  │
│ └───────────────────────────────────┘  │
│                                         │
│      [我再想想]  [确认取消 (2台设备)]    │
└─────────────────────────────────────────┘
```

### 设备详情弹窗（批次模式）

```
┌─────────────────────────────────────────┐
│ 设备维修详情                             │
├─────────────────────────────────────────┤
│ 设备序列号: N77E1406                     │
│ 故障描述: 有问题                         │
│ ...                                     │
│                                         │
│ ┌───────────────────────────────────┐  │
│ │ ℹ️ 此设备属于批次工单，如需取消请在  │  │
│ │   批次工单主页面点击                │  │
│ │   "申请取消批次工单"按钮。          │  │
│ └───────────────────────────────────┘  │
│                                         │
│ ❌ 不显示"申请取消维修订单"按钮          │
└─────────────────────────────────────────┘
```

## 数据库字段

批次中的所有设备共享取消申请状态：

| 字段 | 设备1 | 设备2 | 说明 |
|-----|------|------|------|
| ID | 1 | 2 | 设备ID |
| BatchId | WO2602249788 | WO2602249788 | 批次号 |
| DeviceSN | N77E1406 | N77I0963 | 序列号 |
| Status | Created | Created | 当前状态 |
| CancelRequestStatus | Pending | Pending | 取消申请状态（相同）|
| CancelRequestReason | 项目取消 | 项目取消 | 取消原因（相同）|
| CancelRequestDate | 2026-02-25 | 2026-02-25 | 申请时间（相同）|

**关键点：** 批次取消会为所有设备统一设置相同的取消申请信息。

## 商务审批流程

### 方式1: 批量审批（推荐）

商务人员看到批次取消申请后，可以：
1. 在批次工单详情页看到"批次工单取消申请待审批"提示
2. 查看申请原因和涉及的设备数量
3. 一键批准/拒绝整个批次（未来功能，需要新增API）

### 方式2: 逐个审批

使用现有的单设备审批API：
- 商务人员需要进入每个设备的详情页
- 逐个点击"通过"或"拒绝"
- 适用于需要对批次中的某些设备单独处理的情况

## 状态流转

### 正常流程

```
批次工单创建
    ↓
现场人员点击"申请取消批次工单"
    ↓
填写取消原因 → 提交
    ↓
批次中所有设备：CancelRequestStatus = 'Pending'
    ↓
商务人员审批通过
    ↓
批次中所有设备：Status = 'Cancelled'
    ↓
批次工单整体状态 = 'Cancelled'
```

### 拒绝流程

```
批次工单创建
    ↓
现场人员申请取消
    ↓
商务人员审批拒绝
    ↓
批次中所有设备：CancelRequestStatus = 'Rejected'
    ↓
批次工单继续正常流程
```

## 修改的文件

| 文件 | 修改内容 | 说明 |
|-----|---------|-----|
| `components/batch-work-order-detail.tsx` | 添加"申请取消批次工单"按钮 | 主界面顶部按钮区域 |
| `components/batch-work-order-detail.tsx` | 添加取消批次工单对话框 | 完整的取消申请UI |
| `components/batch-work-order-detail.tsx` | 添加批次取消申请状态提示 | 显示待审批状态 |
| `components/batch-work-order-detail.tsx` | 添加状态管理 | `isCancelBatchDialogOpen`, `cancelBatchReason` |
| `components/batch-work-order-detail.tsx` | 添加取消申请函数 | `handleRequestCancelBatch()` |
| `components/batch-work-order-detail.tsx` | 传递 `inBatchMode` prop | 调用 `RepairDetail` 时传递 |
| `components/repair-detail.tsx` | 添加 `inBatchMode` prop | 接收批次模式标识 |
| `components/repair-detail.tsx` | 条件隐藏取消按钮 | 批次模式下不显示 |
| `components/repair-detail.tsx` | 添加批次模式提示 | 引导用户到主界面操作 |
| `app/api/tickets/batch-cancel/[batchId]/route.ts` | 新增批次取消API | 处理批次级别的取消申请 |
| `app/api/tickets/batch-devices/[batchId]/route.ts` | 添加取消状态字段 | 查询时包含 `CancelRequestStatus` |

## 测试场景

### 场景1: 申请取消批次工单

**前置条件：**
- 登录为现场人员
- 创建一个包含2台设备的批次工单
- 批次状态为 Created 或 In_Repair

**操作步骤：**
1. 进入批次工单详情页
2. 点击顶部的"申请取消批次工单"按钮
3. 填写取消原因："项目取消，不需要维修了"
4. 点击"确认取消 (2台设备)"

**预期结果：**
- ✅ 弹出成功提示："批次工单取消申请已提交，等待商务审批"
- ✅ 页面刷新后，显示"批次工单取消申请待审批"提示框
- ✅ 数据库中2台设备的 `CancelRequestStatus` 都为 `Pending`
- ✅ 按钮变灰或隐藏（已提交申请）

### 场景2: 查看设备详情（批次模式）

**前置条件：**
- 登录为现场人员
- 进入批次工单详情页

**操作步骤：**
1. 点击设备列表中的某个设备"查看详情"
2. 弹出设备详情弹窗

**预期结果：**
- ✅ 设备详情正常显示
- ✅ **不显示**"申请取消维修订单"按钮
- ✅ 显示蓝色提示："此设备属于批次工单，如需取消请在批次工单主页面点击'申请取消批次工单'按钮。"

### 场景3: 单设备工单（非批次）

**前置条件：**
- 登录为现场人员
- 创建一个单设备工单（不属于任何批次）

**操作步骤：**
1. 进入单设备工单详情页
2. 查看操作按钮

**预期结果：**
- ✅ **正常显示**"申请取消维修订单"按钮
- ✅ 点击后可以申请取消当前设备
- ✅ 不显示批次模式提示

### 场景4: 商务审批

**前置条件：**
- 登录为商务人员
- 存在待审批的批次取消申请

**操作步骤：**
1. 查看批次工单详情页或设备详情页
2. 看到"待审批：现场人员申请取消工单"提示
3. 点击"通过"或"拒绝"

**预期结果：**
- ✅ 通过：批次中所有设备状态变为 `Cancelled`
- ✅ 拒绝：批次中所有设备的 `CancelRequestStatus` 变为 `Rejected`
- ✅ 批次工单的整体状态更新

## 视觉对比

### 优化前

| 位置 | 问题 |
|-----|-----|
| 批次详情主界面 | ❌ 没有取消按钮 |
| 设备详情弹窗 | ❌ 有"申请取消维修订单"按钮，但不明确会取消什么 |
| 用户体验 | ❌ 用户不敢点击，怕误操作 |

### 优化后

| 位置 | 优化 |
|-----|-----|
| 批次详情主界面 | ✅ 红色醒目按钮："申请取消批次工单" |
| 取消对话框 | ✅ 明确提示："取消所有 2 台设备" + 批次号 + 警告 |
| 设备详情弹窗 | ✅ 隐藏取消按钮，显示引导提示 |
| 用户体验 | ✅ 清晰明确，操作有信心 |

## 相关文档

- [BATCH_ORDER_UI_ENHANCEMENT.md](./BATCH_ORDER_UI_ENHANCEMENT.md) - 批次工单界面优化
- [REPAIR_STATUS_TIMELINE.md](./REPAIR_STATUS_TIMELINE.md) - 工单流程时间线
- [DIALOG_MODE_OPTIMIZATION.md](./DIALOG_MODE_OPTIMIZATION.md) - 对话框模式优化

---

**优化时间**: 2026-02-25  
**版本**: v1.3.2  
**状态**: ✅ 已完成
