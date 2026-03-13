# 工单动作驱动工作流系统

## 📋 概述

**工单动作驱动工作流系统** 是一个基于状态机的业务流程控制系统，严格控制工单在不同部门之间的流转。每个状态只允许特定角色执行特定操作，并支持前置条件验证（卡点逻辑）。

### 核心特性

1. **动作驱动**：每个状态流转由明确的动作触发，而不是随意更改状态
2. **严格权限控制**：每个动作只允许特定角色在特定状态下执行
3. **前置条件验证**：关键动作执行前自动检查必要条件是否满足
4. **事务安全**：所有状态更新使用数据库事务，确保数据一致性
5. **审计日志**：每次操作自动记录到历史表，满足审计要求

---

## 🔄 业务闭环

完整的工单生命周期如下：

```
现场人员报告故障
    ↓
[1] 仓库确认收货 (CREATED → WAREHOUSE_CONFIRMED)
    ↓
[2] 自动进入维修 (WAREHOUSE_CONFIRMED → IN_REPAIR)
    ↓
[3] 维修人员发送报告至现场 (IN_REPAIR → PENDING_REPORTER_CONFIRM)
    ↓
[4] 现场人员上传签字凭证 (PENDING_REPORTER_CONFIRM → TECHNICIAN_REPAIRING)
    ↓
[5] 维修人员核对凭证转交商务 (TECHNICIAN_REPAIRING → BUSINESS_REVIEW)
    ↓
[6] 商务确认收费 (BUSINESS_REVIEW → WAREHOUSE_SHIPPING)
    ↓
[7] 仓库发货 (WAREHOUSE_SHIPPING → COMPLETED)
    ↓
完成
```

---

## 🎯 工作流动作定义

### 枚举定义

```typescript
export enum TicketAction {
  CONFIRM_RECEIPT = "confirm_receipt",          // 核对设备并确认收货
  CONFIRM_SHIPMENT = "confirm_shipment",        // 确认出库发货
  SEND_REPORT_FOR_SIGN = "send_report_for_sign", // 发送维修报告至现场确认
  CONFIRM_SIGNATURE = "confirm_signature",       // 核对凭证并转交商务
  UPLOAD_SIGNATURE = "upload_signature",         // 上传签字凭证
  CONFIRM_PAYMENT = "confirm_payment",           // 确认收费完结，通知发货
}
```

### 状态流转规则表

| 当前状态 | 允许角色 | 动作 | 下一状态 | 需要验证 | 验证内容 |
|---------|---------|------|---------|---------|---------|
| `CREATED` | 仓库 | 确认收货 | `WAREHOUSE_CONFIRMED` | ✅ | 所有设备有出库日期 |
| `IN_REPAIR` | 维修人员 | 发送报告至现场 | `PENDING_REPORTER_CONFIRM` | ✅ | 维修报告完整 |
| `PENDING_REPORTER_CONFIRM` | 现场人员 | 上传签字凭证 | `TECHNICIAN_REPAIRING` | ❌ | - |
| `TECHNICIAN_REPAIRING` | 维修人员 | 核对凭证转商务 | `BUSINESS_REVIEW` | ❌ | - |
| `BUSINESS_REVIEW` | 商务人员 | 确认收费 | `WAREHOUSE_SHIPPING` | ❌ | - |
| `WAREHOUSE_SHIPPING` | 仓库 | 确认发货 | `COMPLETED` | ❌ | - |

---

## 🛠️ 核心文件结构

```
axiom-repair/
├── lib/
│   ├── ticket-workflow-actions.ts         # 工作流动作定义和状态机逻辑
│   └── __tests__/
│       └── ticket-workflow-actions.test.ts # 单元测试
├── components/
│   └── ticket-action-bar.tsx              # 操作栏组件
├── app/api/
│   ├── tickets/[id]/workflow-action/
│   │   └── route.ts                       # 工作流动作 API
│   └── upload/
│       └── route.ts                       # 文件上传 API
└── docs/
    └── TICKET_ACTION_BAR_SYSTEM.md        # 本文档
```

---

## 📦 核心模块详解

### 1. `lib/ticket-workflow-actions.ts`

**功能**：定义工作流动作、状态流转规则、权限检查逻辑

**核心函数**：

#### `getAvailableAction(currentStatus, currentUserRole)`
获取当前状态下当前角色可执行的动作。

```typescript
const action = getAvailableAction(TicketStatus.CREATED, UserRole.WAREHOUSE);
// 返回: { action: "confirm_receipt", nextStatus: "Warehouse_Confirmed", ... }
```

#### `canExecuteAction(action, currentStatus, currentUserRole)`
检查用户是否有权限执行指定动作。

```typescript
const canExecute = canExecuteAction(
  TicketAction.CONFIRM_RECEIPT,
  TicketStatus.CREATED,
  UserRole.WAREHOUSE
);
// 返回: true
```

#### `getNextStatusForAction(action, currentStatus)`
获取动作执行后的下一个状态。

```typescript
const nextStatus = getNextStatusForAction(
  TicketAction.CONFIRM_RECEIPT,
  TicketStatus.CREATED
);
// 返回: TicketStatus.WAREHOUSE_CONFIRMED
```

---

### 2. `components/ticket-action-bar.tsx`

**功能**：智能操作栏组件，根据状态和角色渲染唯一正确的操作按钮

**核心特性**：

1. **自动判断可用动作**：基于当前状态和用户角色
2. **前置条件验证**：自动检查并阻止不满足条件的操作
3. **文件上传支持**：内置签字凭证上传对话框
4. **错误提示**：清晰的验证失败和操作失败提示

**使用示例**：

```tsx
<TicketActionBar
  ticket={{
    id: "TICKET-001",
    status: TicketStatus.CREATED,
    faultPoint: "电源故障",
    repairCost: 500,
  }}
  currentUser={{
    id: "USER-123",
    name: "张三",
    role: UserRole.WAREHOUSE,
  }}
  onActionSuccess={() => {
    // 刷新工单数据
    loadTicketData();
  }}
/>
```

---

### 3. `app/api/tickets/[id]/workflow-action/route.ts`

**功能**：工作流动作 API，执行状态流转

**安全特性**：

1. ✅ **第一行权限校验**（遵守 .cursorrules）
2. ✅ **数据库事务**（状态更新 + 历史记录）
3. ✅ **审计日志**（记录操作人、时间、动作）
4. ✅ **结构化返回**（`{ success, message, data }`）

**请求格式**：

```json
{
  "action": "confirm_receipt",
  "currentStatus": "Created",
  "userRole": "warehouse"
}
```

**返回格式**：

```json
{
  "success": true,
  "message": "操作成功：核对设备并确认收货",
  "data": {
    "ticketId": "TICKET-001",
    "oldStatus": "Created",
    "newStatus": "Warehouse_Confirmed",
    "action": "confirm_receipt",
    "operator": {
      "id": "USER-123",
      "name": "张三",
      "role": "warehouse"
    }
  }
}
```

---

### 4. `app/api/upload/route.ts`

**功能**：文件上传 API，用于签字凭证、设备照片等

**安全特性**：

1. ✅ **文件大小限制**（最大 10MB）
2. ✅ **文件类型限制**（仅支持图片和 PDF）
3. ✅ **安全文件名**（避免路径注入攻击）
4. ✅ **权限校验**（必须登录）

**请求格式**：

```javascript
const formData = new FormData();
formData.append("file", fileBlob);
formData.append("ticketId", "TICKET-001");
formData.append("type", "signature");

fetch("/api/upload", {
  method: "POST",
  body: formData,
});
```

**返回格式**：

```json
{
  "success": true,
  "message": "文件上传成功",
  "data": {
    "fileName": "USER123_1706182400000_abc123.jpg",
    "originalName": "签字凭证.jpg",
    "filePath": "/uploads/signatures/USER123_1706182400000_abc123.jpg",
    "fileSize": 524288,
    "mimeType": "image/jpeg",
    "uploadType": "signature",
    "ticketId": "TICKET-001"
  }
}
```

---

## 🔒 前置条件验证（卡点逻辑）

### 验证类型

#### 1. 批次设备出库日期验证

**触发时机**：仓库确认收货时

**验证规则**：
- 如果是批次工单，所有设备必须录入出库日期
- 否则禁用操作按钮并提示

**实现代码**：

```typescript
function validateAllDevicesHaveShippingDate(ticket: TicketData): ValidationResult {
  if (!ticket.batchId || !ticket.devices || ticket.devices.length === 0) {
    return { valid: true };
  }

  const devicesWithoutDate = ticket.devices.filter(
    (device) => !device.shippingDate || device.shippingDate.trim() === ""
  );

  if (devicesWithoutDate.length > 0) {
    return {
      valid: false,
      message: `请先录入所有设备的出库日期（还有 ${devicesWithoutDate.length} 台设备未录入）`,
    };
  }

  return { valid: true };
}
```

#### 2. 维修报告完整性验证

**触发时机**：维修人员发送报告至现场确认时

**验证规则**：
- 必须填写故障原因（`faultPoint`）
- 必须填写维修费用（`repairCost`）

**实现代码**：

```typescript
function validateRepairReportComplete(ticket: TicketData): ValidationResult {
  const missingFields: string[] = [];

  if (!ticket.faultPoint || ticket.faultPoint.trim() === "") {
    missingFields.push("故障原因");
  }

  if (ticket.repairCost === null || ticket.repairCost === undefined) {
    missingFields.push("维修费用");
  }

  if (missingFields.length > 0) {
    return {
      valid: false,
      message: `请先完善维修报告：缺少 ${missingFields.join("、")}`,
    };
  }

  return { valid: true };
}
```

---

## 🧪 测试

### 运行单元测试

```bash
npm test lib/__tests__/ticket-workflow-actions.test.ts
```

### 测试覆盖范围

1. ✅ 工作流流转规则完整性
2. ✅ 权限控制正确性
3. ✅ 状态流转逻辑
4. ✅ 前置条件验证
5. ✅ 完整业务闭环

---

## 📝 使用指南

### 1. 添加新的工作流动作

**步骤 1**：在 `lib/ticket-workflow-actions.ts` 中添加新动作

```typescript
export enum TicketAction {
  // ... 现有动作
  NEW_ACTION = "new_action", // 新动作
}

export const TICKET_ACTION_LABELS: Record<TicketAction, string> = {
  // ... 现有标签
  [TicketAction.NEW_ACTION]: "执行新动作",
};
```

**步骤 2**：在 `WORKFLOW_TRANSITIONS` 中添加流转规则

```typescript
export const WORKFLOW_TRANSITIONS: WorkflowTransition[] = [
  // ... 现有规则
  {
    currentStatus: TicketStatus.SOME_STATUS,
    allowedRole: UserRole.SOME_ROLE,
    action: TicketAction.NEW_ACTION,
    nextStatus: TicketStatus.NEXT_STATUS,
    requiresValidation: true,
    validationKey: "new_validation",
  },
];
```

**步骤 3**：如果需要验证，在 `ticket-action-bar.tsx` 中添加验证函数

```typescript
function validateNewCondition(ticket: TicketData): ValidationResult {
  // 验证逻辑
  return { valid: true };
}

function runValidation(validationKey: string, ticket: TicketData): ValidationResult {
  switch (validationKey) {
    // ... 现有验证
    case "new_validation":
      return validateNewCondition(ticket);
    default:
      return { valid: true };
  }
}
```

**步骤 4**：编写单元测试

```typescript
it("应该允许某角色在某状态下执行新动作", () => {
  const canExecute = canExecuteAction(
    TicketAction.NEW_ACTION,
    TicketStatus.SOME_STATUS,
    UserRole.SOME_ROLE
  );
  expect(canExecute).toBe(true);
});
```

---

### 2. 修改前置条件验证

直接在 `ticket-action-bar.tsx` 的验证函数中修改逻辑即可，系统会自动应用。

---

### 3. 调试建议

1. **检查权限**：确认当前用户角色是否正确
2. **检查状态**：确认工单当前状态是否正确
3. **检查验证**：查看浏览器控制台的验证错误信息
4. **检查日志**：查看服务器日志的 API 调用记录

---

## ⚠️ 注意事项

### 1. 严格遵守 .cursorrules

- ✅ 所有 API 第一行必须进行权限校验
- ✅ 使用枚举，禁止 Magic Strings
- ✅ 状态更新必须使用事务
- ✅ 必须记录审计日志

### 2. 数据库表要求

确保以下表存在：

```sql
-- 工单表（必须有以下字段）
Repair_Tickets:
  - ID (主键)
  - Status (状态)
  - SignedReportPhoto (签字凭证路径)
  - UpdatedAt (更新时间)

-- 历史记录表
Repair_Ticket_History:
  - TicketID (工单ID)
  - ActionType (操作类型)
  - OldStatus (旧状态)
  - NewStatus (新状态)
  - OperatorID (操作人ID)
  - OperatorName (操作人姓名)
  - ActionDescription (操作描述)
  - CreatedAt (创建时间)
```

### 3. 文件上传目录

确保以下目录存在且有写权限：

```
public/
└── uploads/
    ├── signatures/    # 签字凭证
    └── photos/        # 设备照片
```

---

## 🚀 未来扩展

1. **多语言支持**：动作标签和验证提示国际化
2. **自定义验证规则**：通过配置文件定义验证规则
3. **工作流可视化**：图形化显示当前工单在流程中的位置
4. **批量操作**：支持批量执行相同动作
5. **通知推送**：动作完成后自动通知下一环节负责人

---

## 📞 技术支持

如有问题，请查阅：
- [工单更新 API 文档](./TICKET_UPDATE_API.md)
- [状态聚合系统文档](./STATUS_AGGREGATION_SYSTEM.md)
- [重构指南](./REFACTORING_HARDCODED_STRINGS.md)

---

**最后更新**：2026-02-26  
**版本**：1.0.0  
**维护者**：架构师 (Arch)
