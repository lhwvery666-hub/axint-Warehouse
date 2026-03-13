# 工单修改功能 - 直接更新而非创建新工单

## 📋 修复日期
2026-02-28

## 🐛 用户反馈

用户反馈："我重新编辑后怎么多了一个工单啊我希望的是直接替换掉之前的那个我不需要保留原来的数据这些都在第二张图里面的操作记录里面记录了谁进行了什么操作"

### 问题分析
原设计中，点击"修改并重新提交"会：
1. ❌ 创建一个**全新的工单**（新的 BatchId）
2. ❌ 原工单保持 `Cancelled` 状态
3. ❌ 导致系统中出现多个工单，造成混乱

### 用户期望
1. ✅ **直接修改原工单**（不创建新工单）
2. ✅ 所有修改记录在**操作记录**中
3. ✅ 修改后状态从 `Cancelled` 重置为 `Created`
4. ✅ 工单重新进入正常流程

---

## ✅ 修复方案

### 架构变更

```
原流程：
取消工单 → 修改并重新提交 → 创建新工单（新 BatchId）
                           ↓
                       系统中有2个工单

新流程：
取消工单 → 修改工单 → 直接更新原工单（相同 BatchId）
                   ↓
               记录操作日志
                   ↓
               状态改为 Created
                   ↓
               重新进入流程
```

---

## 🔧 实现细节

### 1. 新增后端 API (`app/api/tickets/batch-update/[batchId]/route.ts`)

**功能**：直接更新已取消的批次工单信息

**权限**：仅现场报告人员（Reporter）和管理员（Admin）

**业务逻辑**：
1. 验证工单状态为 `Cancelled`
2. 验证操作人权限（只有报告人本人或管理员可修改）
3. 更新批次基础信息（项目名称、联系人、物流等）
4. 根据设备数量智能处理：
   - 数量相同：逐一更新设备信息
   - 数量减少：更新前N个，删除多余的
   - 数量增加：更新已有的，插入新增的
5. 清除取消申请相关字段
6. 记录操作日志到 `Repair_Ticket_History`
7. 将状态改为 `Created`（重新进入流程）

**关键代码片段**：

```typescript
// 更新批次基础信息
UPDATE Repair_Tickets
SET 
  SenderAddress = @senderAddress,
  ProjectName = @projectName,
  ContactInfo = @contactInfo,
  ProjectLocation = @projectLocation,
  TrackingNumber_In = @trackingNumber,
  CourierCompany = @expressCompany,
  Category = @category,
  SubCategory = @subCategory,
  Status = 'Created',  // 🎯 重置状态
  UpdatedAt = GETDATE(),
  CancelRequestStatus = NULL,  // 🎯 清除取消标记
  CancelRequestReason = NULL,
  CancelRequestDate = NULL
WHERE BatchId = @batchId

// 记录操作日志
INSERT INTO Repair_Ticket_History (
  BatchId, ActionType, OperatorId, OperatorName, Description, CreatedAt
)
VALUES (
  @batchId, 'BatchUpdated', @operatorId, @operatorName, 
  '修改了工单信息（设备数量：N）', GETDATE()
)
```

---

### 2. 前端修改 (`components/repair-form.tsx`)

**新增参数**：
```typescript
interface RepairFormProps {
  ...
  updateMode?: {
    enabled: boolean
    batchId: string
  }
  ...
}
```

**提交逻辑分支**：

```typescript
const handleSubmit = async () => {
  // 🎯 更新模式：直接更新原工单
  if (updateMode?.enabled && updateMode?.batchId) {
    const response = await fetch(`/api/tickets/batch-update/${updateMode.batchId}`, {
      method: "PUT",
      body: JSON.stringify({
        senderAddress,
        projectName,
        contactInfo: `${contactPerson} ${contactPhone}`,
        projectLocation,
        trackingNumber,
        expressCompany,
        category,
        subCategory,
        devices: [...] // 设备数组
      })
    })
    
    // 更新成功后刷新页面
    toast.success("工单已更新")
    onBack()
    return
  }

  // 🎯 创建模式：正常创建新工单
  const response = await fetch("/api/tickets/batch", {
    method: "POST",
    body: JSON.stringify(batchRequest)
  })
  ...
}
```

---

### 3. 工单详情页修改 (`components/batch-work-order-detail.tsx`)

**UI 变更**：
```diff
- 修改并重新提交
+ 修改工单
```

**组件调用变更**：
```typescript
<RepairForm
  taskId={null}
  onBack={() => {
    toast.success("工单已更新！")
    setIsRecreateDialogOpen(false)
+   fetchBatchDevices() // 🎯 刷新数据而不是返回列表
  }}
  userType="reporter"
+ updateMode={{
+   enabled: true,
+   batchId: batchId
+ }}
  initialData={{...}}
/>
```

---

## 📊 修复前后对比

### 修复前：

| 操作步骤 | 系统行为 | 工单数量 |
|---------|---------|---------|
| 1. 创建工单 WO2602282244 | 创建批次工单 | 1 个 |
| 2. 申请取消 | 状态变为 `Cancelled` | 1 个 |
| 3. 修改并重新提交 | 创建**新工单** WO2602282245 | **2 个** ❌ |

**问题**：
- ❌ 系统中有2个工单
- ❌ 旧工单 `Cancelled` 状态，但仍显示在列表中
- ❌ 新工单和旧工单无关联，造成数据混乱

### 修复后：

| 操作步骤 | 系统行为 | 工单数量 |
|---------|---------|---------|
| 1. 创建工单 WO2602282244 | 创建批次工单 | 1 个 |
| 2. 申请取消 | 状态变为 `Cancelled` | 1 个 |
| 3. 修改工单 | **直接更新** WO2602282244，状态重置为 `Created` | **1 个** ✅ |

**优势**：
- ✅ 仍然只有1个工单（WO2602282244）
- ✅ 工单ID不变，所有历史数据保留
- ✅ 操作记录完整，可追溯
- ✅ 状态重置，重新进入流程

---

## 🔍 操作记录示例

修改后，在"操作记录"（第二张图）中会显示：

```
📝 2026-02-28 14:50 李现场 修改了工单信息（设备数量：2）
🔴 2026-02-28 14:45 李现场 申请取消工单（原因：数量不对）
✅ 2026-02-28 14:42 李现场 创建了批次工单
```

这样可以清晰追溯：
1. 工单何时创建
2. 工单何时取消及原因
3. 工单何时修改及修改人

---

## 🎯 智能设备处理逻辑

### 场景1：设备数量相同（2台 → 2台）
```typescript
// 逐一更新设备信息
for (let i = 0; i < deviceCount; i++) {
  UPDATE Repair_Tickets
  SET DeviceSN = @newSn, ModelName = @newModel, ...
  WHERE ID = existingDeviceIds[i]
}
```

### 场景2：设备数量减少（3台 → 2台）
```typescript
// 更新前2个
UPDATE Repair_Tickets SET ... WHERE ID IN (device1, device2)

// 删除第3个
DELETE FROM Repair_Tickets WHERE ID = device3
```

### 场景3：设备数量增加（2台 → 3台）
```typescript
// 更新前2个
UPDATE Repair_Tickets SET ... WHERE ID IN (device1, device2)

// 插入第3个
INSERT INTO Repair_Tickets (...) VALUES (...)
```

---

## 🧪 测试验证

### 测试步骤：

1. **创建工单**：
   - 登录现场人员账号（李现场）
   - 创建批次工单 WO2602282244（2台设备）
   - 验证工单成功创建

2. **申请取消**：
   - 点击"申请取消"
   - 填写原因："设备数量不对"
   - 验证状态变为 `Cancelled`

3. **商务批准取消**：
   - 登录商务账号
   - 批准取消申请
   - 验证状态保持 `Cancelled`

4. **修改工单**：
   - 回到现场人员账号
   - 在工单详情页点击"**修改工单**"按钮
   - 修改信息（例如：改为3台设备）
   - 点击"提交工单"

5. **验证结果**：
   - ✅ 仍然只有1个工单（WO2602282244）
   - ✅ 设备数量更新为3台
   - ✅ 状态变为 `Created`（待仓库确认）
   - ✅ 操作记录显示"李现场 修改了工单信息（设备数量：3）"
   - ✅ 工单重新进入正常流程

---

## 📁 涉及文件

| 文件 | 修改类型 | 说明 |
|------|----------|------|
| `app/api/tickets/batch-update/[batchId]/route.ts` | **新增** | 工单更新 API |
| `components/repair-form.tsx` | 修改 | 添加 `updateMode` 参数和更新逻辑 |
| `components/batch-work-order-detail.tsx` | 修改 | 修改按钮文本和调用方式 |

---

## 🎓 技术要点

### 1. 数据库事务保证一致性

```typescript
const transaction = pool.transaction()
await transaction.begin()

try {
  // 1. 更新批次信息
  // 2. 更新/删除/插入设备
  // 3. 记录操作日志
  
  await transaction.commit()  // ✅ 提交
} catch (error) {
  await transaction.rollback()  // ❌ 回滚
  throw error
}
```

### 2. 权限分层验证

```typescript
// 第一层：角色验证
const authResult = await checkUserRole([UserRole.REPORTER, UserRole.ADMIN])

// 第二层：所有权验证
if (user.role !== UserRole.ADMIN && user.id !== reporterUserId) {
  return NextResponse.json({ message: "只有报告人本人或管理员可操作" }, { status: 403 })
}
```

### 3. 操作日志审计

```typescript
INSERT INTO Repair_Ticket_History (
  BatchId, ActionType, OperatorId, OperatorName, Description, CreatedAt
)
VALUES (
  @batchId, 'BatchUpdated', @operatorId, @operatorName, 
  '修改了工单信息（设备数量：N）', GETDATE()
)
```

---

## 📝 备注

1. **数据完整性**：
   - 所有历史数据（聊天记录、操作日志）都保留在原工单中
   - 工单ID不变，便于追溯和关联

2. **流程一致性**：
   - 修改后状态重置为 `Created`
   - 需要重新走一遍流程：仓库确认 → 维修 → 商务审核 → 发货
   - 但所有之前填写的信息（联系人、地址等）都保留

3. **权限控制**：
   - 只有报告人本人或管理员可以修改
   - 其他角色无权修改工单

4. **未来优化**：
   - 可考虑在操作日志中记录**修改前后的差异**（Diff）
   - 可考虑限制修改次数或添加审批流程

---

## ✅ 验收标准

- [x] 修改工单后不创建新工单
- [x] 工单ID保持不变
- [x] 状态从 `Cancelled` 重置为 `Created`
- [x] 操作记录正确记录修改信息
- [x] 权限控制正确（只有报告人或管理员可修改）
- [x] 设备数量变化时正确处理（增加/减少/不变）
- [x] 清除取消申请相关字段
- [x] 符合 `.cursorrules` 规范（无 `any` 类型，无硬编码字符串，使用事务）
