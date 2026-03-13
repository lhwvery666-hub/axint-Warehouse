# 工单动作操作栏快速开始指南

## 🎯 5分钟上手

本指南帮助您快速理解和使用工单动作驱动工作流系统。

---

## 📦 核心概念

### 什么是"动作驱动"？

传统方式（❌ 不推荐）：
```typescript
// 随意修改状态，容易出错
updateTicketStatus(ticketId, "in_repair");
```

动作驱动方式（✅ 推荐）：
```typescript
// 通过明确的动作触发状态流转
executeAction(TicketAction.CONFIRM_RECEIPT);
```

**优势**：
- ✅ 权限自动校验（只有仓库能确认收货）
- ✅ 前置条件自动检查（所有设备有出库日期吗？）
- ✅ 状态流转自动完成（Created → Warehouse_Confirmed）
- ✅ 历史记录自动保存（谁在什么时间做了什么）

---

## 🚀 快速使用

### 1. 在工单详情页显示操作栏

```tsx
import TicketActionBar from "@/components/ticket-action-bar";
import { useAuth } from "@/context/auth-context";

function TicketDetailPage() {
  const { user } = useAuth();
  const [ticketData, setTicketData] = useState(/* ... */);

  return (
    <div>
      {/* 工单基本信息 */}
      <TicketInfoCard ticket={ticketData} />

      {/* 工作流操作栏（核心） */}
      <TicketActionBar
        ticket={{
          id: ticketData.id,
          status: ticketData.status,
          faultPoint: ticketData.faultPoint,
          repairCost: ticketData.repairCost,
        }}
        currentUser={{
          id: user.id,
          name: user.username,
          role: user.role,
        }}
        onActionSuccess={() => {
          // 操作成功后刷新数据
          loadTicketData();
        }}
      />
    </div>
  );
}
```

**就这么简单！** 组件会自动：
- 判断当前用户能执行什么操作
- 显示对应的操作按钮
- 验证前置条件
- 执行操作并更新状态

---

## 🔄 完整流程示例

### 场景：一个工单从创建到完成

#### 1️⃣ 现场人员创建工单

```typescript
// 状态：Created
// 现场人员只能看到工单信息，无操作按钮
```

#### 2️⃣ 仓库确认收货

```typescript
// 状态：Created
// 仓库人员登录后看到：

<TicketActionBar />
// 显示按钮：【核对设备并确认收货】

// 前置验证：
// - 如果是批次工单，检查所有设备是否有出库日期
// - 未通过：按钮禁用，提示"请先录入所有设备的出库日期"
// - 通过：点击按钮 → Created → Warehouse_Confirmed
```

#### 3️⃣ 维修人员检测并发送报告

```typescript
// 状态：In_Repair
// 维修人员登录后看到：

<TicketActionBar />
// 显示按钮：【发送维修报告至现场确认】

// 前置验证：
// - 检查故障原因（faultPoint）是否填写
// - 检查维修费用（repairCost）是否填写
// - 未通过：按钮禁用，提示"请先完善维修报告"
// - 通过：点击按钮 → In_Repair → Pending_Reporter_Confirm
```

#### 4️⃣ 现场人员上传签字凭证

```typescript
// 状态：Pending_Reporter_Confirm
// 现场人员登录后看到：

<TicketActionBar />
// 显示按钮：【上传签字凭证】

// 点击后弹出文件上传对话框
// 用户选择签字照片 → 上传 → Pending_Reporter_Confirm → Technician_Repairing
```

#### 5️⃣ 维修人员核对凭证

```typescript
// 状态：Technician_Repairing
// 维修人员登录后看到：

<TicketActionBar />
// 显示按钮：【核对凭证并转交商务】

// 点击按钮 → Technician_Repairing → Business_Review
```

#### 6️⃣ 商务确认收费

```typescript
// 状态：Business_Review
// 商务人员登录后看到：

<TicketActionBar />
// 显示按钮：【确认收费完结，通知发货】

// 点击按钮 → Business_Review → Warehouse_Shipping
```

#### 7️⃣ 仓库发货

```typescript
// 状态：Warehouse_Shipping
// 仓库人员登录后看到：

<TicketActionBar />
// 显示按钮：【确认出库发货】

// 点击按钮 → Warehouse_Shipping → Completed
```

#### 8️⃣ 完成

```typescript
// 状态：Completed
// 所有人都看不到操作按钮（流程已完结）
```

---

## 🛠️ API 调用示例

### 手动调用工作流动作 API

```typescript
// 示例：仓库确认收货
async function confirmReceipt(ticketId: string) {
  const response = await fetch(`/api/tickets/${ticketId}/workflow-action`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "confirm_receipt",
      currentStatus: "Created",
      userRole: "warehouse",
    }),
  });

  const result = await response.json();

  if (result.success) {
    console.log("操作成功：", result.message);
    console.log("新状态：", result.data.newStatus);
  } else {
    console.error("操作失败：", result.message);
  }
}
```

---

## 🔍 调试技巧

### 1. 为什么我看不到操作按钮？

**可能原因**：
- 当前状态下您的角色没有可执行的操作
- 工单已完成（Completed）
- 工单已取消（Cancelled）

**调试方法**：
```typescript
import { getAvailableAction } from "@/lib/ticket-workflow-actions";

const action = getAvailableAction(currentStatus, currentUserRole);
console.log("可用动作：", action); // null 表示没有可执行的操作
```

### 2. 为什么操作按钮是禁用的？

**可能原因**：
- 前置条件验证未通过
- 查看按钮下方的错误提示

**调试方法**：
- 打开浏览器控制台，查看红色的 Alert 提示
- 检查工单数据是否完整

### 3. 为什么操作失败？

**可能原因**：
- 权限不足（403）
- 状态已改变（并发冲突）
- 网络错误

**调试方法**：
```typescript
// 查看服务器日志
[Workflow Action API] 执行失败: ...
```

---

## 📋 常见问题

### Q1: 可以跳过某个环节吗？

**A**: 不可以。系统严格按照预定义的流程执行，确保业务闭环。如需特殊处理，请联系管理员。

### Q2: 可以同时执行多个动作吗？

**A**: 不可以。每个状态只允许一个动作，确保流程清晰可控。

### Q3: 如何添加新的工作流动作？

**A**: 请查阅 [完整技术文档](./TICKET_ACTION_BAR_SYSTEM.md) 的"使用指南"章节。

### Q4: 前置条件验证失败怎么办？

**A**: 根据提示完善数据后，按钮会自动解除禁用。

---

## 🎓 进阶阅读

- [完整技术文档](./TICKET_ACTION_BAR_SYSTEM.md)
- [状态聚合系统](./STATUS_AGGREGATION_SYSTEM.md)
- [工单更新 API](./TICKET_UPDATE_API.md)

---

## ✅ 核心规则总结

1. **一个状态，一个动作**：每个状态下只有一个明确的操作
2. **一个角色，一个权限**：每个动作只允许特定角色执行
3. **先验证，后执行**：关键动作必须通过前置条件验证
4. **自动记录**：所有操作自动记录到历史表
5. **事务安全**：所有更新使用数据库事务

---

**开始使用吧！** 🚀

如有问题，请查阅完整技术文档或联系技术支持。
