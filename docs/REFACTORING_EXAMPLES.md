# 硬编码重构示例详解

本文档提供了详细的重构示例，展示如何将硬编码字符串替换为枚举。

---

## 📋 示例 1：状态比较重构

### 文件：`components/repair-detail.tsx`

#### Before（重构前）：
```typescript
// 状态比较 - 硬编码字符串
if (status === "Cancelled" || status === "cancelled") {
  return false;
}

if (status === "created" || status === "pending") {
  // 待处理逻辑
} else if (status === "in_repair" || status === "processing") {
  // 维修中逻辑
} else if (status === "admin_review") {
  // 待商务处理逻辑
}

// getStatusBadge 函数
const getStatusBadge = (status: string) => {
  const statusLower = status.toLowerCase();
  if (statusLower === "scrapped" || status === "Scrapped") {
    return <Badge>已报废</Badge>;
  }
  if (statusLower === "return_unrepaired" || status === "Return_Unrepaired") {
    return <Badge>拒修退回</Badge>;
  }
  if (statusLower === "cancelled" || status === "Cancelled") {
    return <Badge>已取消</Badge>;
  }
  // ... 更多状态
}
```

#### After（重构后）：
```typescript
import { 
  TicketStatus, 
  normalizeTicketStatus, 
  TICKET_STATUS_LABELS,
  isTerminalStatus 
} from "@/lib/enums";

// 状态比较 - 使用枚举
const normalizedStatus = normalizeTicketStatus(status);
if (normalizedStatus === TicketStatus.CANCELLED) {
  return false;
}

if (normalizedStatus === TicketStatus.CREATED) {
  // 待处理逻辑
} else if (normalizedStatus === TicketStatus.IN_REPAIR) {
  // 维修中逻辑
} else if (normalizedStatus === TicketStatus.ADMIN_REVIEW) {
  // 待商务处理逻辑
}

// getStatusBadge 函数
const getStatusBadge = (status: string) => {
  const normalizedStatus = normalizeTicketStatus(status);
  if (!normalizedStatus) return null;
  
  const label = TICKET_STATUS_LABELS[normalizedStatus];
  
  switch (normalizedStatus) {
    case TicketStatus.SCRAPPED:
      return <Badge className="bg-red-100 text-red-800">已报废</Badge>;
    case TicketStatus.RETURN_UNREPAIRED:
      return <Badge className="bg-orange-100 text-orange-800">拒修退回</Badge>;
    case TicketStatus.CANCELLED:
      return <Badge className="bg-gray-100 text-gray-800">已取消</Badge>;
    case TicketStatus.COMPLETED:
      return <Badge className="bg-green-100 text-green-800">已完成</Badge>;
    // ... 更多状态
    default:
      return <Badge>{label}</Badge>;
  }
}
```

---

## 📋 示例 2：API 路由状态验证重构

### 文件：`app/api/tickets/[id]/update/route.ts`

#### Before（重构前）：
```typescript
// 硬编码的状态列表
const validStatuses = [
  "Created", "Pending",
  "In_Repair", "Processing",
  "Pending_Factory",
  "Factory_Finished",
  "Admin_Review",
  "Pending_Shipment",
  "Completed",
  "Unrepairable",
  "Deleted",
  "Delayed",
  "Scrapped",
  "Return_Unrepaired",
  "Cancelled",
];

const statusMap: Record<string, string> = {
  "created": "Created",
  "in_repair": "In_Repair",
  "pending": "Created",
  "processing": "In_Repair",
  "completed": "Completed",
  "scrapped": "Scrapped",
  "return_unrepaired": "Return_Unrepaired",
  "cancelled": "Cancelled",
};

// 状态验证
if (!validStatuses.includes(status)) {
  return NextResponse.json({ error: "无效的状态" }, { status: 400 });
}

// 状态映射
const dbStatus = statusMap[status.toLowerCase()] || status;
```

#### After（重构后）：
```typescript
import { 
  TicketStatus, 
  VALID_TICKET_STATUSES,
  normalizeTicketStatus,
  isValidTicketStatus 
} from "@/lib/enums";

// 状态验证
if (!isValidTicketStatus(status)) {
  return NextResponse.json(
    { error: `无效的状态: ${status}` }, 
    { status: 400 }
  );
}

// 状态映射 - 使用工具函数
const dbStatus = normalizeTicketStatus(status) || TicketStatus.CREATED;
```

---

## 📋 示例 3：角色权限检查重构

### 文件：`components/dashboard.tsx`

#### Before（重构前）：
```typescript
// 硬编码的角色和状态
const userRole = user?.role || "technician";

if (status === "Cancelled" || status === "cancelled") {
  return false;
}

if (userRole === "technician") {
  return status === "Created" || status === "created" || 
         status === "In_Repair" || status === "in_repair" ||
         status === "Processing" || status === "processing" ||
         status === "Delayed" || status === "delayed";
} else if (userRole === "admin" || userRole === "business") {
  return status === "Admin_Review" || status === "admin_review";
} else if (userRole === "warehouse") {
  return status === "Pending_Shipment" || status === "pending_shipment" ||
         status === "Return_Unrepaired" || status === "return_unrepaired";
}
```

#### After（重构后）：
```typescript
import { 
  UserRole, 
  TicketStatus, 
  normalizeTicketStatus,
  normalizeUserRole,
  isTerminalStatus,
  getPendingStatusesForRole 
} from "@/lib/enums";

const userRole = normalizeUserRole(user?.role) || UserRole.TECHNICIAN;
const normalizedStatus = normalizeTicketStatus(status);

// 排除终止状态
if (normalizedStatus === TicketStatus.CANCELLED || isTerminalStatus(normalizedStatus)) {
  return false;
}

// 使用工具函数获取角色对应的待处理状态
const pendingStatuses = getPendingStatusesForRole(userRole);
return pendingStatuses.includes(normalizedStatus);
```

---

## 📋 示例 4：路由重定向重构

### 文件：`context/auth-context.tsx`

#### Before（重构前）：
```typescript
// 硬编码的角色映射和路由
const dbRole = (backendUser.role || "").toLowerCase().trim()
const mappedRole: UserRole =
  dbRole === "admin"
    ? "admin"
    : dbRole === "technician" || dbRole === "维修工程师" || dbRole === "维修人员"
    ? "technician"
    : dbRole === "warehouse" || dbRole === "仓库管理员" || dbRole === "仓库"
    ? "warehouse"
    : dbRole === "reporter" || dbRole === "现场报告人员" || dbRole === "现场人员"
    ? "reporter"
    : dbRole === "business" || dbRole === "商务" || dbRole === "商务人员"
    ? "business"
    : null

// 重定向
if (mappedRole === "technician") {
  router.push("/technician/tasks")
} else if (mappedRole === "reporter") {
  router.push("/report")
} else if (mappedRole === "admin") {
  router.push("/admin/users")
} else if (mappedRole === "warehouse") {
  router.push("/warehouse/dashboard")
} else if (mappedRole === "business") {
  router.push("/business")
}
```

#### After（重构后）：
```typescript
import { 
  normalizeUserRole, 
  UserRole, 
  ROUTES 
} from "@/lib/enums";

// 使用工具函数进行角色映射
const mappedRole = normalizeUserRole(backendUser.role);

if (!mappedRole) {
  // 处理无效角色
  return;
}

// 使用路由常量
const roleRoutes: Record<UserRole, string> = {
  [UserRole.TECHNICIAN]: ROUTES.TECHNICIAN_TASKS,
  [UserRole.REPORTER]: ROUTES.REPORTER_REPORT,
  [UserRole.ADMIN]: ROUTES.ADMIN_USERS,
  [UserRole.WAREHOUSE]: ROUTES.WAREHOUSE_DASHBOARD,
  [UserRole.BUSINESS]: ROUTES.BUSINESS_DASHBOARD,
};

router.push(roleRoutes[mappedRole]);
```

---

## 📋 示例 5：状态筛选重构

### 文件：`app/business/page.tsx`

#### Before（重构前）：
```typescript
// 硬编码的状态筛选
const pendingTickets = repairs.filter(r => 
  r.status === "created" || r.status === "pending"
).length;

const inRepairTickets = repairs.filter(r => 
  r.status === "in_repair" || r.status === "processing"
).length;

const adminReviewTickets = repairs.filter(r => 
  r.status === "admin_review"
).length;

const completedTickets = repairs.filter(r => 
  r.status === "completed"
).length;
```

#### After（重构后）：
```typescript
import { 
  TicketStatus, 
  normalizeTicketStatus 
} from "@/lib/enums";

// 使用枚举进行状态筛选
const pendingTickets = repairs.filter(r => 
  normalizeTicketStatus(r.status) === TicketStatus.CREATED
).length;

const inRepairTickets = repairs.filter(r => 
  normalizeTicketStatus(r.status) === TicketStatus.IN_REPAIR
).length;

const adminReviewTickets = repairs.filter(r => 
  normalizeTicketStatus(r.status) === TicketStatus.ADMIN_REVIEW
).length;

const completedTickets = repairs.filter(r => 
  normalizeTicketStatus(r.status) === TicketStatus.COMPLETED
).length;
```

---

## 📋 示例 6：数据库字段名称重构

### 文件：`app/api/tickets/[id]/route.ts`

#### Before（重构前）：
```typescript
// 硬编码的字段名称
const deviceSnColumn = mapColumn("DeviceSN", "DeviceSN")
const modelNameColumn = mapColumn("ModelName", "ModelName")
const statusColumn = mapColumn("Status", "Status")
const cancelRequestStatusColumn = mapColumn("CancelRequestStatus", "CancelRequestStatus")
```

#### After（重构后）：
```typescript
import { DB_FIELDS } from "@/lib/enums";

// 使用常量
const deviceSnColumn = mapColumn(DB_FIELDS.DEVICE_SN, DB_FIELDS.DEVICE_SN)
const modelNameColumn = mapColumn(DB_FIELDS.MODEL_NAME, DB_FIELDS.MODEL_NAME)
const statusColumn = mapColumn(DB_FIELDS.STATUS, DB_FIELDS.STATUS)
const cancelRequestStatusColumn = mapColumn(
  DB_FIELDS.CANCEL_REQUEST_STATUS, 
  DB_FIELDS.CANCEL_REQUEST_STATUS
)
```

---

## 📋 示例 7：取消申请状态重构

### 文件：`components/repair-detail.tsx`

#### Before（重构前）：
```typescript
// 硬编码的取消申请状态
if (cancelRequestStatus === "Pending") {
  // 待审批逻辑
} else if (cancelRequestStatus === "Approved") {
  // 已批准逻辑
} else if (cancelRequestStatus === "Rejected") {
  // 已拒绝逻辑
}

// 设置取消申请状态
setRepairData({
  ...repairData,
  cancelRequestStatus: "Pending",
  ...
})
```

#### After（重构后）：
```typescript
import { CancelRequestStatus } from "@/lib/enums";

// 使用枚举
if (cancelRequestStatus === CancelRequestStatus.PENDING) {
  // 待审批逻辑
} else if (cancelRequestStatus === CancelRequestStatus.APPROVED) {
  // 已批准逻辑
} else if (cancelRequestStatus === CancelRequestStatus.REJECTED) {
  // 已拒绝逻辑
}

// 设置取消申请状态
setRepairData({
  ...repairData,
  cancelRequestStatus: CancelRequestStatus.PENDING,
  ...
})
```

---

## 📋 示例 8：特殊值重构

### 文件：`components/repair-form.tsx`

#### Before（重构前）：
```typescript
// 硬编码的特殊值
if (productSN.toUpperCase() === "PENDING") {
  // 待验证逻辑
}

if (productSN === "PENDING_VERIFY") {
  // 待验证逻辑
}
```

#### After（重构后）：
```typescript
import { SPECIAL_VALUES } from "@/lib/enums";

// 使用常量
if (productSN.toUpperCase() === SPECIAL_VALUES.PENDING_VERIFY) {
  // 待验证逻辑
}

if (productSN === SPECIAL_VALUES.PENDING_VERIFY) {
  // 待验证逻辑
}
```

---

## 📋 示例 9：工作流工具函数重构

### 文件：`lib/workflow-utils.ts`

#### Before（重构前）：
```typescript
export const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    role: "technician",
    status: "Created",
    label: "待维修",
    requiredFields: ["faultPoint", "materialCode", "deviceName", "fullSpec"],
  },
  {
    role: "technician",
    status: "In_Repair",
    label: "维修中",
    requiredFields: ["faultPoint", "materialCode", "deviceName", "fullSpec"],
  },
  {
    role: "admin",
    status: "Admin_Review",
    label: "待商务处理",
    requiredFields: ["repairCost", "clientName", "isInvoiced"],
  },
  {
    role: "warehouse",
    status: "Pending_Shipment",
    label: "待发货",
    requiredFields: ["receivedDate", "factoryShipDate", "returnDate", "returnQuantity", "returnTrackingNum"],
  },
];

export const TERMINAL_STATUSES = ["Scrapped", "Return_Unrepaired", "Cancelled", "Completed", "Unrepairable", "Deleted"];

export function getPendingStatusesForRole(role: string): string[] {
  const roleMap: Record<string, string[]> = {
    technician: ["Created", "In_Repair"],
    admin: ["Admin_Review"],
    business: ["Admin_Review"],
    warehouse: ["Pending_Shipment", "Return_Unrepaired"],
  };
  return roleMap[role] || [];
}
```

#### After（重构后）：
```typescript
import { TicketStatus, UserRole, TERMINAL_STATUSES } from "@/lib/enums";

export const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    role: UserRole.TECHNICIAN,
    status: TicketStatus.CREATED,
    label: "待维修",
    requiredFields: ["faultPoint", "materialCode", "deviceName", "fullSpec"],
  },
  {
    role: UserRole.TECHNICIAN,
    status: TicketStatus.IN_REPAIR,
    label: "维修中",
    requiredFields: ["faultPoint", "materialCode", "deviceName", "fullSpec"],
  },
  {
    role: UserRole.ADMIN,
    status: TicketStatus.ADMIN_REVIEW,
    label: "待商务处理",
    requiredFields: ["repairCost", "clientName", "isInvoiced"],
  },
  {
    role: UserRole.WAREHOUSE,
    status: TicketStatus.PENDING_SHIPMENT,
    label: "待发货",
    requiredFields: ["receivedDate", "factoryShipDate", "returnDate", "returnQuantity", "returnTrackingNum"],
  },
];

// 使用枚举中的 TERMINAL_STATUSES
// export const TERMINAL_STATUSES = ... (已在 enums.ts 中定义)

export function getPendingStatusesForRole(role: UserRole | string): TicketStatus[] {
  const roleMap: Record<UserRole, TicketStatus[]> = {
    [UserRole.TECHNICIAN]: [TicketStatus.CREATED, TicketStatus.IN_REPAIR],
    [UserRole.ADMIN]: [TicketStatus.ADMIN_REVIEW],
    [UserRole.BUSINESS]: [TicketStatus.ADMIN_REVIEW],
    [UserRole.WAREHOUSE]: [TicketStatus.PENDING_SHIPMENT, TicketStatus.RETURN_UNREPAIRED],
  };
  
  // 如果传入的是字符串，先规范化
  const normalizedRole = typeof role === "string" 
    ? normalizeUserRole(role) 
    : role;
  
  return normalizedRole ? roleMap[normalizedRole] || [] : [];
}
```

---

## 📋 示例 10：API 路由路径重构

### 文件：`app/business/page.tsx`

#### Before（重构前）：
```typescript
// 硬编码的 API 路径
fetch("/api/users")
  .then(res => res.json())

// 硬编码的路由路径
href: "/repairs?status=admin_review"
href: "/repairs"
href: "/repairs?status=pending_shipment"
```

#### After（重构后）：
```typescript
import { API_ROUTES, ROUTES, TicketStatus } from "@/lib/enums";

// 使用 API 路径常量
fetch(API_ROUTES.USERS)
  .then(res => res.json())

// 使用路由常量
href: `${ROUTES.REPAIRS}?status=${TicketStatus.ADMIN_REVIEW}`
href: ROUTES.REPAIRS
href: `${ROUTES.REPAIRS}?status=${TicketStatus.PENDING_SHIPMENT}`
```

---

## 🎯 重构最佳实践

1. **统一导入**：在文件顶部统一导入需要的枚举和工具函数
2. **使用工具函数**：优先使用 `normalizeTicketStatus` 和 `normalizeUserRole` 处理大小写和兼容性问题
3. **类型安全**：使用 TypeScript 枚举提供编译时类型检查
4. **向后兼容**：确保重构后的代码仍然支持旧的状态值
5. **测试覆盖**：重构后测试所有状态转换和边界情况

---

## ⚠️ 注意事项

1. **不要一次性重构所有文件**：按阶段进行，先重构核心 API 路由
2. **保持向后兼容**：数据库中的状态值可能仍然是旧格式，需要兼容处理
3. **测试状态转换**：确保所有状态转换逻辑在重构后仍然正确
4. **检查边界情况**：处理 `null`、`undefined` 和空字符串的情况
