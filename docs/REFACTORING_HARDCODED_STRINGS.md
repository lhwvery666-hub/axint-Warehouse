# 硬编码字符串重构清单

## 📋 概述

本文档列出了项目中所有包含硬编码字符串的文件，以及重构方案。所有硬编码的字符串应该使用 `lib/enums.ts` 中定义的枚举和常量。

## ✅ 已创建的枚举文件

- **`lib/enums.ts`** - 统一的枚举和常量定义文件
  - `TicketStatus` - 工单状态枚举
  - `UserRole` - 用户角色枚举
  - `CancelRequestStatus` - 取消申请状态枚举
  - `TicketActionType` - 工单操作类型枚举
  - `ROUTES` - 路由路径常量
  - `API_ROUTES` - API 路径常量
  - `DB_FIELDS` - 数据库字段名称常量
  - `SPECIAL_VALUES` - 特殊值常量
  - 工具函数：`normalizeTicketStatus`, `normalizeUserRole`, `isTerminalStatus`, `isValidTicketStatus`

---

## 📁 需要重构的文件清单

### 🔴 高优先级（核心业务逻辑文件）

#### 1. **`app/api/tickets/[id]/update/route.ts`**
   - **硬编码内容**：
     - 状态字符串：`"Created"`, `"In_Repair"`, `"Admin_Review"`, `"Pending_Shipment"`, `"Completed"`, `"Scrapped"`, `"Return_Unrepaired"`, `"Cancelled"`, `"Pending_Factory"`, `"Factory_Finished"`, `"Delayed"`, `"Unrepairable"`, `"Deleted"`, `"Processing"`, `"Pending"`
     - 角色字符串：`"technician"`, `"admin"`, `"warehouse"`, `"business"`
     - 操作类型：`"request_cancel"`, `"approve_cancel"`, `"reject_cancel"`, `"delay"`, `"supplementSN"`
     - 字段名称：`"CancelRequestStatus"`, `"CancelApprovedBy"`, `"CancelApprovedDate"` 等
   
   - **重构示例**：
     ```typescript
     // Before
     const validStatuses = [
       "Created", "Pending",
       "In_Repair", "Processing",
       "Admin_Review",
       "Pending_Shipment",
       "Completed",
       "Scrapped",
       "Return_Unrepaired",
       "Cancelled",
     ]
     if (status === "Cancelled") { ... }
     
     // After
     import { TicketStatus, VALID_TICKET_STATUSES, isTerminalStatus } from "@/lib/enums"
     const validStatuses = VALID_TICKET_STATUSES
     if (status === TicketStatus.CANCELLED) { ... }
     if (isTerminalStatus(status)) { ... }
     ```

#### 2. **`app/api/tickets/[id]/route.ts`**
   - **硬编码内容**：
     - 状态映射：`"created"`, `"pending"`, `"in_repair"`, `"processing"`, `"admin_review"`, `"pending_shipment"`, `"completed"`, `"unrepairable"`
     - 字段名称：`"DeviceSN"`, `"ModelName"`, `"Status"`, `"CancelRequestStatus"` 等
   
   - **重构示例**：
     ```typescript
     // Before
     if (statusLower === "created" || statusLower === "pending") {
       mappedStatus = "Created"
     } else if (statusLower === "in_repair" || statusLower === "processing") {
       mappedStatus = "In_Repair"
     }
     
     // After
     import { normalizeTicketStatus, TicketStatus } from "@/lib/enums"
     const mappedStatus = normalizeTicketStatus(status) || TicketStatus.CREATED
     ```

#### 3. **`app/api/tickets/route.ts`**
   - **硬编码内容**：
     - 状态映射逻辑（与上面类似）
   
   - **重构示例**：同上

#### 4. **`app/api/tickets/create/route.ts`**
   - **硬编码内容**：
     - 状态值：`"Created"`
     - 特殊值：`"PENDING_VERIFY"`
   
   - **重构示例**：
     ```typescript
     // Before
     const status = "Created"
     if (productSN === "PENDING_VERIFY") { ... }
     
     // After
     import { TicketStatus, SPECIAL_VALUES } from "@/lib/enums"
     const status = TicketStatus.CREATED
     if (productSN === SPECIAL_VALUES.PENDING_VERIFY) { ... }
     ```

#### 5. **`components/repair-detail.tsx`**
   - **硬编码内容**：
     - 状态比较：`"created"`, `"pending"`, `"in_repair"`, `"processing"`, `"admin_review"`, `"pending_shipment"`, `"completed"`, `"scrapped"`, `"cancelled"`, `"return_unrepaired"`, `"Factory_Finished"`, `"Pending_Factory"`
     - 角色比较：`"technician"`, `"reporter"`, `"admin"`, `"business"`
     - 取消申请状态：`"Pending"`, `"Approved"`, `"Rejected"`
   
   - **重构示例**：
     ```typescript
     // Before
     if (status === "Cancelled" || status === "cancelled") { ... }
     if (user?.role === "technician") { ... }
     if (cancelRequestStatus === "Pending") { ... }
     
     // After
     import { TicketStatus, UserRole, CancelRequestStatus, normalizeTicketStatus } from "@/lib/enums"
     const normalizedStatus = normalizeTicketStatus(status)
     if (normalizedStatus === TicketStatus.CANCELLED) { ... }
     if (user?.role === UserRole.TECHNICIAN) { ... }
     if (cancelRequestStatus === CancelRequestStatus.PENDING) { ... }
     ```

#### 6. **`components/dashboard.tsx`**
   - **硬编码内容**：
     - 状态比较：`"Created"`, `"created"`, `"In_Repair"`, `"in_repair"`, `"Processing"`, `"processing"`, `"Delayed"`, `"delayed"`, `"Admin_Review"`, `"admin_review"`, `"Pending_Shipment"`, `"pending_shipment"`, `"Return_Unrepaired"`, `"return_unrepaired"`, `"Cancelled"`, `"cancelled"`
     - 角色比较：`"technician"`, `"admin"`, `"business"`, `"warehouse"`
   
   - **重构示例**：
     ```typescript
     // Before
     if (status === "Cancelled" || status === "cancelled") {
       return false;
     }
     if (userRole === "technician") {
       return status === "Created" || status === "created" || 
              status === "In_Repair" || status === "in_repair";
     }
     
     // After
     import { TicketStatus, UserRole, normalizeTicketStatus, isTerminalStatus } from "@/lib/enums"
     const normalizedStatus = normalizeTicketStatus(status)
     if (normalizedStatus === TicketStatus.CANCELLED) {
       return false;
     }
     if (userRole === UserRole.TECHNICIAN) {
       return normalizedStatus === TicketStatus.CREATED || 
              normalizedStatus === TicketStatus.IN_REPAIR;
     }
     ```

#### 7. **`components/repair-page.tsx`**
   - **硬编码内容**：
     - 状态比较：`"pending"`, `"created"`, `"processing"`, `"in_repair"`, `"completed"`, `"unrepairable"`, `"delayed"`
   
   - **重构示例**：
     ```typescript
     // Before
     const normalizedStatus = status === "pending" ? "created" : 
                             status === "processing" ? "in_repair" : status
     if (normalizedStatus === "created" || status === "pending") { ... }
     
     // After
     import { normalizeTicketStatus, TicketStatus } from "@/lib/enums"
     const normalizedStatus = normalizeTicketStatus(status) || TicketStatus.CREATED
     if (normalizedStatus === TicketStatus.CREATED) { ... }
     ```

#### 8. **`components/repairs-panel.tsx`**
   - **硬编码内容**：
     - 状态筛选：`"all"`, `"admin_review"`, `"pending_shipment"`, `"in_repair"`, `"completed"`
     - 状态比较：`"pending"`, `"created"`, `"processing"`, `"in_repair"`, `"pending_factory"`, `"factory_finished"`, `"admin_review"`, `"pending_shipment"`, `"completed"`, `"unrepairable"`, `"delayed"`, `"cancelled"`, `"scrapped"`, `"return_unrepaired"`
   
   - **重构示例**：
     ```typescript
     // Before
     const statusMatch = statusFilter === "all" || 
       repair.status?.toLowerCase() === statusFilter.toLowerCase()
     variant={statusFilter === "admin_review" ? "default" : "outline"}
     
     // After
     import { TicketStatus, normalizeTicketStatus } from "@/lib/enums"
     const statusMatch = statusFilter === "all" || 
       normalizeTicketStatus(repair.status) === normalizeTicketStatus(statusFilter)
     variant={statusFilter === TicketStatus.ADMIN_REVIEW.toLowerCase() ? "default" : "outline"}
     ```

#### 9. **`lib/workflow-utils.ts`**
   - **硬编码内容**：
     - 状态值：`"Created"`, `"In_Repair"`, `"Admin_Review"`, `"Pending_Shipment"`
     - 角色值：`"technician"`, `"admin"`, `"warehouse"`, `"business"`
     - 终止状态：`"Scrapped"`, `"Return_Unrepaired"`, `"Cancelled"`, `"Completed"`, `"Unrepairable"`, `"Deleted"`
   
   - **重构示例**：
     ```typescript
     // Before
     export const WORKFLOW_STEPS: WorkflowStep[] = [
       {
         role: "technician",
         status: "Created",
         label: "待维修",
         ...
       },
     ]
     export const TERMINAL_STATUSES = ["Scrapped", "Return_Unrepaired", "Cancelled", ...]
     
     // After
     import { TicketStatus, UserRole, TERMINAL_STATUSES } from "@/lib/enums"
     export const WORKFLOW_STEPS: WorkflowStep[] = [
       {
         role: UserRole.TECHNICIAN,
         status: TicketStatus.CREATED,
         label: "待维修",
         ...
       },
     ]
     // 使用枚举中的 TERMINAL_STATUSES
     ```

---

### 🟡 中优先级（页面和布局文件）

#### 10. **`app/business/page.tsx`**
   - **硬编码内容**：
     - 状态比较：`"created"`, `"pending"`, `"in_repair"`, `"processing"`, `"admin_review"`, `"completed"`, `"pending_shipment"`
   
   - **重构示例**：
     ```typescript
     // Before
     const pendingTickets = repairs.filter(r => 
       r.status === "created" || r.status === "pending"
     ).length
     
     // After
     import { TicketStatus, normalizeTicketStatus } from "@/lib/enums"
     const pendingTickets = repairs.filter(r => {
       const status = normalizeTicketStatus(r.status)
       return status === TicketStatus.CREATED
     }).length
     ```

#### 11. **`app/business/layout.tsx`**
   - **硬编码内容**：
     - 角色比较：`"business"`
     - 路由路径：`"/business"`, `"/repairs"`, `"/business/profile"`
   
   - **重构示例**：
     ```typescript
     // Before
     if (user?.role !== "business") { ... }
     href: "/business"
     
     // After
     import { UserRole, ROUTES } from "@/lib/enums"
     if (user?.role !== UserRole.BUSINESS) { ... }
     href: ROUTES.BUSINESS_DASHBOARD
     ```

#### 12. **`app/admin/layout.tsx`**
   - **硬编码内容**：
     - 角色比较：`"admin"`
     - 路由路径：`"/admin/users"`, `"/admin/database"`, `"/repairs"`
   
   - **重构示例**：同上

#### 13. **`app/page.tsx`**
   - **硬编码内容**：
     - 角色比较：`"reporter"`, `"business"`, `"admin"`, `"warehouse"`
     - 路由路径：`"/business"`, `"/admin/users"`, `"/warehouse/dashboard"`
   
   - **重构示例**：
     ```typescript
     // Before
     if (user?.role === "business") {
       router.push("/business");
     }
     
     // After
     import { UserRole, ROUTES } from "@/lib/enums"
     if (user?.role === UserRole.BUSINESS) {
       router.push(ROUTES.BUSINESS_DASHBOARD);
     }
     ```

#### 14. **`app/warehouse/tickets/page.tsx`**
   - **硬编码内容**：
     - 状态比较：`"Pending_Shipment"`, `"pending_shipment"`, `"Return_Unrepaired"`, `"return_unrepaired"`, `"Scrapped"`, `"Cancelled"`, `"Delayed"`, `"Pending_Factory"`, `"Factory_Finished"`
   
   - **重构示例**：
     ```typescript
     // Before
     .filter(ticket => {
       const status = (ticket.status || "").toString().toLowerCase()
       return status === "pending_shipment" || status === "return_unrepaired"
     })
     
     // After
     import { TicketStatus, normalizeTicketStatus } from "@/lib/enums"
     .filter(ticket => {
       const status = normalizeTicketStatus(ticket.status)
       return status === TicketStatus.PENDING_SHIPMENT || 
              status === TicketStatus.RETURN_UNREPAIRED
     })
     ```

#### 15. **`app/repairs/page.tsx`**
   - **硬编码内容**：
     - 状态比较：`"pending"`, `"created"`, `"processing"`, `"in_repair"`, `"pending_factory"`, `"factory_finished"`, `"admin_review"`, `"pending_shipment"`, `"completed"`, `"unrepairable"`, `"delayed"`
     - 角色比较：`"admin"`, `"warehouse"`
     - 路由路径：`"/admin"`, `"/"`
   
   - **重构示例**：参考上面的示例

---

### 🟢 低优先级（工具和辅助文件）

#### 16. **`context/auth-context.tsx`**
   - **硬编码内容**：
     - 角色映射：`"admin"`, `"technician"`, `"warehouse"`, `"reporter"`, `"business"`, `"维修工程师"`, `"维修人员"`, `"仓库管理员"`, `"仓库"`, `"现场报告人员"`, `"现场人员"`, `"商务"`, `"商务人员"`, `"商务管理员"`
     - 路由路径：`"/technician/tasks"`, `"/report"`, `"/admin/users"`, `"/warehouse/dashboard"`, `"/business"`
   
   - **重构示例**：
     ```typescript
     // Before
     const mappedRole: UserRole =
       dbRole === "admin"
         ? "admin"
         : dbRole === "technician" || dbRole === "维修工程师" || dbRole === "维修人员"
         ? "technician"
         : ...
     
     // After
     import { normalizeUserRole, UserRole, ROUTES } from "@/lib/enums"
     const mappedRole = normalizeUserRole(dbRole)
     if (mappedRole === UserRole.TECHNICIAN) {
       router.push(ROUTES.TECHNICIAN_TASKS)
     }
     ```

#### 17. **`components/repair-form.tsx`**
   - **硬编码内容**：
     - 特殊值：`"PENDING_VERIFY"`, `"PENDING"`
   
   - **重构示例**：
     ```typescript
     // Before
     if (productSN.toUpperCase() === "PENDING") { ... }
     
     // After
     import { SPECIAL_VALUES } from "@/lib/enums"
     if (productSN.toUpperCase() === SPECIAL_VALUES.PENDING_VERIFY) { ... }
     ```

#### 18. **`components/workflow-progress.tsx`**
   - **硬编码内容**：
     - 状态比较（如果存在）
   
   - **重构示例**：参考上面的示例

#### 19. **`app/api/tickets/export/route.ts`**
   - **硬编码内容**：
     - 字段映射和列名
   
   - **重构示例**：
     ```typescript
     // Before
     const fieldMapping = {
       deviceSerialNumber: "DeviceSN",
       status: "Status",
       ...
     }
     
     // After
     import { DB_FIELDS } from "@/lib/enums"
     const fieldMapping = {
       deviceSerialNumber: DB_FIELDS.DEVICE_SN,
       status: DB_FIELDS.STATUS,
       ...
     }
     ```

#### 20. **`components/admin/user-manager.tsx`**
   - **硬编码内容**：
     - 角色字符串：`"维修工程师"`, `"现场报告人员"`, `"管理员"`, `"仓库管理员"`, `"商务人员"`
   
   - **重构示例**：
     ```typescript
     // Before
     const roles = ["维修工程师", "现场报告人员", "管理员", "仓库管理员", "商务人员"]
     
     // After
     import { UserRole, USER_ROLE_LABELS } from "@/lib/enums"
     const roles = Object.values(UserRole).map(role => ({
       value: role,
       label: USER_ROLE_LABELS[role]
     }))
     ```

---

## 🔧 重构步骤建议

### 阶段 1：核心 API 路由（高优先级）
1. `app/api/tickets/[id]/update/route.ts`
2. `app/api/tickets/[id]/route.ts`
3. `app/api/tickets/route.ts`
4. `app/api/tickets/create/route.ts`

### 阶段 2：核心组件（高优先级）
5. `components/repair-detail.tsx`
6. `components/dashboard.tsx`
7. `components/repair-page.tsx`
8. `lib/workflow-utils.ts`

### 阶段 3：页面和布局（中优先级）
9. `app/business/page.tsx`
10. `app/business/layout.tsx`
11. `app/admin/layout.tsx`
12. `app/page.tsx`
13. `app/warehouse/tickets/page.tsx`

### 阶段 4：其他文件（低优先级）
14. 剩余的文件

---

## 📝 重构注意事项

1. **向后兼容**：确保重构后的代码仍然支持旧的状态值（通过 `normalizeTicketStatus` 函数）
2. **类型安全**：使用 TypeScript 枚举提供类型检查
3. **测试**：重构后需要测试所有状态转换和角色权限逻辑
4. **渐进式重构**：不要一次性修改所有文件，按阶段进行
5. **保持一致性**：所有文件使用相同的枚举和工具函数

---

## ✅ 重构检查清单

重构每个文件后，请检查：
- [ ] 所有硬编码的状态字符串已替换为 `TicketStatus` 枚举
- [ ] 所有硬编码的角色字符串已替换为 `UserRole` 枚举
- [ ] 所有硬编码的路由路径已替换为 `ROUTES` 常量
- [ ] 所有硬编码的字段名称已替换为 `DB_FIELDS` 常量
- [ ] 使用了 `normalizeTicketStatus` 和 `normalizeUserRole` 工具函数
- [ ] 代码通过 TypeScript 类型检查
- [ ] 功能测试通过

---

## 📚 参考文档

- `lib/enums.ts` - 枚举和常量定义
- `lib/workflow-utils.ts` - 工作流工具函数（也需要重构）
