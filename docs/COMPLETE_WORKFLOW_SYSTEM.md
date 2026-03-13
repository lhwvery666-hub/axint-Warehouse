# 完整工作流程系统

## 概述

本文档详细说明维修工单系统的完整工作流程，涉及4个角色、9个核心步骤，确保每个环节都有明确的责任人和操作界面。

## 工作流程图

```
现场人员创建工单
    ↓
[Warehouse_Confirming] 仓库管理员确认设备信息并填写出厂日期
    ↓
[Warehouse_Confirmed] 仓库已确认，待维修人员检查
    ↓
[In_Repair] 维修人员检查设备并完成维修报告
    ↓
[Pending_Reporter_Confirm] 现场人员查看报告并签字回传
    ↓
[Technician_Repairing] 维修人员收到签字后开始维修
    ↓
[Business_Review] 商务人员确认收款和开票
    ↓
[Warehouse_Shipping] 仓库管理员出库发回或入库
    ↓
[Completed] 已完成
```

## 详细流程说明

### 步骤1: 现场人员创建工单

**角色**: 现场人员 (Reporter)  
**状态**: `Created` → `Warehouse_Confirming`  
**界面**: `/report` - 故障报修表单  
**操作**: 
- 填写项目信息、联系人、快递信息
- 添加多个设备（批次工单）
- 填写每个设备的序列号、型号、故障描述
- 上传设备照片
- 提交后生成批次号（例如：WO2602249788）

**关键点**:
- ✅ 创建批次工单时，初始状态为 `Warehouse_Confirming`（待仓库确认）
- ✅ 批次中的所有设备共享相同的批次号
- ✅ 界面会明确提示"批次工单模式"

**数据库变化**:
```sql
INSERT INTO Repair_Tickets (
  BatchId, Status, DeviceSN, ProjectName, ContactInfo, ...
) VALUES (
  'WO2602249788', 'Warehouse_Confirming', 'N77E1406', ...
)
```

---

### 步骤2: 仓库管理员确认设备信息并填写出厂日期

**角色**: 仓库管理员 (Warehouse)  
**状态**: `Warehouse_Confirming` → `Warehouse_Confirmed`  
**界面**: `/warehouse/dashboard` - 待确认批次列表  
**操作**:
1. 查看待确认的批次工单列表
2. 点击某个批次进入确认界面
3. 核对批次中所有设备的信息
4. 为每台设备填写出厂日期（用于计算保修期）
5. 点击"确认批次设备"按钮

**关键点**:
- ✅ 必须为所有设备填写出厂日期
- ✅ 出厂日期自动计算保修状态（保内/过保）
- ✅ 确认后，维修人员才能看到并处理此批次

**界面组件**: `WarehouseBatchConfirm`

**API**: `POST /api/tickets/warehouse-confirm-batch/[batchId]`

**数据库变化**:
```sql
UPDATE Repair_Tickets
SET 
  Status = 'Warehouse_Confirmed',
  ManufactureDate = '2024-06-15',
  WarrantyStatus = 'InWarranty', -- 自动计算
  WarehouseConfirmedAt = GETDATE(),
  WarehouseConfirmedBy = '张三'
WHERE BatchId = 'WO2602249788'
```

---

### 步骤3: 维修人员检查设备并完成维修报告

**角色**: 维修人员 (Technician)  
**状态**: `Warehouse_Confirmed` → `In_Repair` → `Pending_Reporter_Confirm`  
**界面**: `/batch/[id]` - 批次工单详情页  
**操作**:
1. 在工单列表看到状态为"仓库已确认"的批次
2. 进入批次详情页
3. **查看出厂日期和保修状态**（仓库已填写）
4. 点击"编辑维修报告"按钮
5. 检查设备，填写：
   - 故障点
   - 维修方案
   - 维修费用
   - 是否需要返厂
6. 保存并发送给现场人员确认

**关键点**:
- ✅ 只有在 `Warehouse_Confirmed` 后才能编辑维修报告
- ✅ 维修人员可以看到每个设备的出厂日期和保修状态
- ✅ 编辑维修报告在弹窗中进行（不跳转页面）

**数据库变化**:
```sql
UPDATE Repair_Tickets
SET 
  Status = 'Pending_Reporter_Confirm',
  FaultPoint = '电源模块损坏',
  RepairCost = 500,
  UpdatedAt = GETDATE()
WHERE BatchId = 'WO2602249788'
```

---

### 步骤4: 现场人员查看报告并签字回传

**角色**: 现场人员 (Reporter)  
**状态**: `Pending_Reporter_Confirm` → `Technician_Repairing`  
**界面**: `/report` - 任务详情弹窗  
**操作**:
1. 在工单列表看到"待现场确认"的工单
2. 点击工单，弹出详情窗口
3. 点击"查看维修报告"
4. 查看维修方案、费用等信息
5. 在报告上签字（手写或盖章）
6. 拍照上传签字后的报告

**关键点**:
- ✅ 现场人员不能修改维修报告内容
- ✅ 必须上传签字照片
- ✅ 上传后，维修人员立即收到通知

**API**: `POST /api/tickets/reporter-confirm/[batchId]`

**数据库变化**:
```sql
UPDATE Repair_Tickets
SET 
  Status = 'Technician_Repairing',
  SignedReportPhoto = '/uploads/signed-reports/xxx.jpg',
  ReporterConfirmedAt = GETDATE()
WHERE BatchId = 'WO2602249788'
```

---

### 步骤5: 维修人员收到签字后开始维修

**角色**: 维修人员 (Technician)  
**状态**: `Technician_Repairing` → `Business_Review`  
**界面**: `/batch/[id]` - 批次工单详情页  
**操作**:
1. 收到现场人员签字回传的通知
2. 查看签字凭证
3. 开始实际维修工作
4. 维修完成后，点击"完成维修"按钮
5. 工单自动转至商务审核

**关键点**:
- ✅ 维修人员可以查看签字凭证图片
- ✅ 完成维修后，状态自动变为 `Business_Review`
- ✅ 可以通过聊天功能与现场人员沟通

**数据库变化**:
```sql
UPDATE Repair_Tickets
SET 
  Status = 'Business_Review',
  TechnicianCompletedAt = GETDATE(),
  UpdatedAt = GETDATE()
WHERE BatchId = 'WO2602249788'
```

---

### 步骤6: 商务人员确认收款和开票

**角色**: 商务人员 (Business)  
**状态**: `Business_Review` → `Warehouse_Shipping`  
**界面**: `/business` - 商务审核页面  
**操作**:
1. 查看待审核的批次工单列表
2. 点击某个批次进入审核界面
3. 确认是否收费：
   - **保内维修** → 不收费 → 直接审核通过
   - **过保维修** → 收费 → 填写维修费用
4. 如果收费：
   - 确认是否已收款 ✅ 必填
   - 确认是否已开票 ☑️ 选填
   - 填写客户名称和总费用
5. 点击"完成审核"按钮

**关键点**:
- ✅ 收费项目必须确认收款后才能审核通过
- ✅ 不收费项目可以直接审核通过
- ✅ 审核完成后，工单转至仓库发货环节

**界面组件**: `BusinessBatchReview`

**API**: `POST /api/tickets/business-confirm-batch/[batchId]`

**数据库变化**:
```sql
UPDATE Repair_Tickets
SET 
  Status = 'Warehouse_Shipping',
  IsChargeable = 1,
  IsPaymentReceived = 1,
  IsInvoiced = 1,
  RepairCost = 1000,
  ClientName = '广州分公司',
  BusinessReviewedAt = GETDATE(),
  BusinessReviewedBy = '李四'
WHERE BatchId = 'WO2602249788'
```

---

### 步骤7: 仓库管理员出库发回或入库

**角色**: 仓库管理员 (Warehouse)  
**状态**: `Warehouse_Shipping` → `Completed`  
**界面**: `/warehouse/dashboard` - 待发货批次列表  
**操作**:
1. 查看待发货的批次工单列表
2. 点击某个批次进入发货界面
3. 选择处理方式：
   - **发回客户**: 填写发货日期、快递单号、发货数量
   - **产品入库**: 设备入库存储，不发回客户
4. 点击"确认发货"或"确认入库"按钮

**关键点**:
- ✅ 发回客户必须填写完整的快递信息
- ✅ 产品入库不需要填写快递信息
- ✅ 完成后，批次工单状态变为"已完成"

**界面组件**: `WarehouseBatchShipping`

**API**: `POST /api/tickets/warehouse-shipping-batch/[batchId]`

**数据库变化（发回客户）**:
```sql
UPDATE Repair_Tickets
SET 
  Status = 'Completed',
  ReturnDate = '2026-02-26',
  ReturnTrackingNum = 'SF1234567890',
  ReturnQuantity = 2,
  ShippingType = 'return',
  WarehouseShippedAt = GETDATE(),
  WarehouseShippedBy = '王五'
WHERE BatchId = 'WO2602249788'
```

**数据库变化（产品入库）**:
```sql
UPDATE Repair_Tickets
SET 
  Status = 'Completed',
  ShippingType = 'stock',
  WarehouseShippedAt = GETDATE(),
  WarehouseShippedBy = '王五'
WHERE BatchId = 'WO2602249788'
```

---

### 步骤8: 已完成

**状态**: `Completed`  
**说明**: 批次工单流程结束，所有设备已完成处理

---

## 角色权限矩阵

| 步骤 | 状态 | 现场人员 | 仓库管理员 | 维修人员 | 商务人员 |
|-----|-----|---------|-----------|---------|---------|
| 1. 创建工单 | Created → Warehouse_Confirming | ✅ 创建 | 🔍 查看 | 🔍 查看 | 🔍 查看 |
| 2. 仓库确认 | Warehouse_Confirming → Warehouse_Confirmed | 🔍 查看 | ✅ 确认并填写出厂日期 | 🔍 查看 | 🔍 查看 |
| 3. 维修检查 | Warehouse_Confirmed → Pending_Reporter_Confirm | 🔍 查看 | 🔍 查看 | ✅ 检查并填写报告 | 🔍 查看 |
| 4. 现场签字 | Pending_Reporter_Confirm → Technician_Repairing | ✅ 签字回传 | 🔍 查看 | 🔍 查看 | 🔍 查看 |
| 5. 维修进行 | Technician_Repairing → Business_Review | 🔍 查看 | 🔍 查看 | ✅ 维修并完成 | 🔍 查看 |
| 6. 商务审核 | Business_Review → Warehouse_Shipping | 🔍 查看 | 🔍 查看 | 🔍 查看 | ✅ 确认收款和开票 |
| 7. 仓库发货 | Warehouse_Shipping → Completed | 🔍 查看 | ✅ 出库发回/入库 | 🔍 查看 | 🔍 查看 |
| 8. 已完成 | Completed | 🔍 查看 | 🔍 查看 | 🔍 查看 | 🔍 查看 |

**图例：**
- ✅ = 可操作
- 🔍 = 只读查看
- ❌ = 不可见

---

## 核心状态定义

### 新增的核心状态

| 状态代码 | 中文名称 | 责任角色 | 说明 |
|---------|---------|---------|-----|
| `Warehouse_Confirming` | 待仓库确认 | 仓库管理员 | 等待仓库确认设备信息并填写出厂日期 |
| `Warehouse_Confirmed` | 仓库已确认 | 维修人员 | 出厂日期已填写，等待维修人员检查 |
| `Technician_Repairing` | 维修进行中 | 维修人员 | 收到现场签字，维修人员正在维修 |
| `Business_Review` | 待商务审核 | 商务人员 | 等待商务确认收款和开票 |
| `Warehouse_Shipping` | 待仓库发货 | 仓库管理员 | 等待仓库出库发回或入库 |

### 保留的状态（向后兼容）

| 旧状态 | 映射到 | 说明 |
|-------|-------|-----|
| `Pending` | `Created` | 待处理 |
| `Processing` | `In_Repair` | 维修中 |
| `Warehouse_Received` | `Warehouse_Confirming` | 仓库已收货 |
| `Admin_Review` | `Business_Review` | 待商务处理 |
| `Pending_Shipment` | `Warehouse_Shipping` | 待发货 |

---

## 界面组件

### 1. 仓库确认组件

**组件**: `WarehouseBatchConfirm`  
**文件**: `components/warehouse-batch-confirm.tsx`

**功能**:
- 显示批次基础信息
- 显示设备清单
- 为每个设备提供出厂日期选择器
- 确认按钮：只有当所有设备都填写了出厂日期才能点击

**界面截图（文字描述）**:
```
┌─────────────────────────────────────────┐
│ ← 仓库确认批次设备           [待确认]     │
│ 批次号：WO2602249788 | 共 2 台设备       │
├─────────────────────────────────────────┤
│ ℹ️ 仓库确认流程说明                      │
│ 请核对批次中所有设备的信息，并为每台设备  │
│ 填写出厂日期。确认后，工单状态将变更为    │
│ "待维修检查"，维修人员即可开始处理。     │
├─────────────────────────────────────────┤
│ 📦 批次基础信息                          │
│ 项目名称: 广州分公司维修项目              │
│ 项目位置: 广州分公司-前台                │
│ 联系信息: 王一 13603050631               │
│ 产品类别: 开天配件 / 通用电源             │
│ 设备数量: 2 台                           │
├─────────────────────────────────────────┤
│ 设备清单及出厂日期         [1/2 已填写]  │
│ ┌───────────────────────────────────┐  │
│ │ 序号 序列号  型号  出厂日期        │  │
│ │  1  N77E1406 NC100 [选择日期] ⚠️  │  │
│ │  2  N77I0963 NC100 2024-06-15 ✅  │  │
│ └───────────────────────────────────┘  │
├─────────────────────────────────────────┤
│ ✅ 准备确认批次设备                      │
│ 确认后，批次状态将变更为"仓库已确认"，   │
│ 维修人员即可开始处理此批次工单           │
│                    [确认批次设备 (2台)]  │
└─────────────────────────────────────────┘
```

### 2. 商务审核组件

**组件**: `BusinessBatchReview`  
**文件**: `components/business-batch-review.tsx`

**功能**:
- 显示批次基础信息和设备清单
- 确认是否收费
- 如果收费：填写费用、客户名称、确认收款、确认开票
- 完成审核按钮

**界面截图（文字描述）**:
```
┌─────────────────────────────────────────┐
│ ← 商务审核              [待商务审核]      │
│ 批次号：WO2602249788 | 共 2 台设备       │
├─────────────────────────────────────────┤
│ ℹ️ 商务审核流程说明                      │
│ 请确认此批次工单的收款和开票情况。        │
│ 审核完成后，批次状态将变更为"待仓库发货" │
├─────────────────────────────────────────┤
│ 📦 批次基础信息                          │
│ ...                                     │
├─────────────────────────────────────────┤
│ 💰 收款与开票确认                        │
│                                         │
│ 是否需要收费              [开关: 否]     │
│ 过保维修或需更换配件的设备需要收费        │
│                                         │
│ [如果收费 = 是]                          │
│ ┌───────────────────────────────────┐  │
│ │ 维修总费用 (元) *                  │  │
│ │ [1000]                            │  │
│ │                                   │  │
│ │ 客户名称                          │  │
│ │ [广州分公司]                       │  │
│ │                                   │  │
│ │ 是否已收款 *        [开关: 是] ✅  │  │
│ │ 确认客户已支付维修费用             │  │
│ │                                   │  │
│ │ 是否已开票          [开关: 是] ✅  │  │
│ │ 确认是否已为客户开具发票           │  │
│ └───────────────────────────────────┘  │
├─────────────────────────────────────────┤
│ ✅ 完成商务审核                          │
│ 确认收款和开票情况后，批次工单将转至     │
│ 仓库发货环节                            │
│                         [完成审核]      │
└─────────────────────────────────────────┘
```

### 3. 仓库发货组件

**组件**: `WarehouseBatchShipping`  
**文件**: `components/warehouse-batch-shipping.tsx`

**功能**:
- 显示批次基础信息和设备清单
- 选择发货方式：发回客户 或 产品入库
- 如果发回客户：填写发货日期、快递单号、发货数量
- 完成按钮

**界面截图（文字描述）**:
```
┌─────────────────────────────────────────┐
│ ← 仓库发货处理            [待发货]        │
│ 批次号：WO2602249788 | 共 2 台设备       │
├─────────────────────────────────────────┤
│ ℹ️ 仓库发货流程说明                      │
│ 请选择处理方式：发回客户 或 产品入库。    │
│ 完成后，批次工单将标记为"已完成"。       │
├─────────────────────────────────────────┤
│ 📦 批次基础信息                          │
│ ...                                     │
├─────────────────────────────────────────┤
│ 🚚 发货方式                              │
│                                         │
│ ○ 🚚 发回客户                            │
│   设备已维修完成，发回给客户              │
│                                         │
│ ● 📦 产品入库                            │
│   设备暂不发回，先入库存储                │
│                                         │
│ [如果选择发回客户]                       │
│ ┌───────────────────────────────────┐  │
│ │ 发货日期 *     [2026-02-26]       │  │
│ │ 发货数量 *     [2]                │  │
│ │ 快递单号 *     [SF1234567890]     │  │
│ └───────────────────────────────────┘  │
├─────────────────────────────────────────┤
│ ✅ 完成发货并结束流程                    │
│ 设备将发回客户，批次工单状态将变更为     │
│ "已完成"                                │
│                         [确认发货]      │
└─────────────────────────────────────────┘
```

---

## API端点总结

| API路径 | 方法 | 功能 | 角色 |
|--------|-----|------|-----|
| `/api/tickets/batch` | POST | 创建批次工单 | 现场人员 |
| `/api/tickets/warehouse-pending-batches` | GET | 获取待确认批次列表 | 仓库管理员 |
| `/api/tickets/warehouse-confirm-batch/[batchId]` | POST | 确认批次并填写出厂日期 | 仓库管理员 |
| `/api/tickets/batch-devices/[batchId]` | GET | 获取批次设备列表 | 所有角色 |
| `/api/tickets/reporter-confirm/[batchId]` | POST | 现场签字回传 | 现场人员 |
| `/api/tickets/business-confirm-batch/[batchId]` | POST | 商务审核 | 商务人员 |
| `/api/tickets/warehouse-shipping-batch/[batchId]` | POST | 仓库发货 | 仓库管理员 |

---

## 时间线组件

### 9步流程时间线

**组件**: `RepairStatusTimeline`  
**文件**: `components/repair-status-timeline.tsx`

**显示效果（桌面端）**:
```
◉─────◉─────◉─────◉─────◉─────◉─────◉─────◉─────◉
创建  仓库  待检查 检查  签字  维修  商务  发货  完成
```

**流程步骤：**
1. **工单创建** - 现场人员提交
2. **仓库确认** - 确认设备信息
3. **待维修检查** - 出厂日期已填
4. **维修检查** - 检查并填报告
5. **现场签字** - 等待签字回传
6. **维修中** - 维修人员维修
7. **商务审核** - 收款和开票
8. **仓库发货** - 出库或入库
9. **已完成** - 流程结束

**响应式设计**:
- 桌面端：横向滚动，紧凑显示
- 移动端：垂直布局，清晰可读

---

## 数据库字段

### Repair_Tickets 表新增字段

| 字段名 | 类型 | 说明 | 示例值 |
|-------|-----|------|-------|
| `ManufactureDate` | DATETIME | 出厂日期 | 2024-06-15 |
| `WarrantyStatus` | VARCHAR(50) | 保修状态 | InWarranty / OutOfWarranty |
| `WarehouseConfirmedAt` | DATETIME | 仓库确认时间 | 2026-02-25 10:30:00 |
| `WarehouseConfirmedBy` | VARCHAR(100) | 仓库确认人 | 张三 |
| `TechnicianCompletedAt` | DATETIME | 维修完成时间 | 2026-02-25 14:00:00 |
| `BusinessReviewedAt` | DATETIME | 商务审核时间 | 2026-02-25 16:00:00 |
| `BusinessReviewedBy` | VARCHAR(100) | 商务审核人 | 李四 |
| `ShippingType` | VARCHAR(50) | 发货方式 | return / stock |
| `WarehouseShippedAt` | DATETIME | 仓库发货时间 | 2026-02-26 09:00:00 |
| `WarehouseShippedBy` | VARCHAR(100) | 仓库发货人 | 王五 |

---

## 工作流程示例

### 示例：广州分公司2台通用电源维修

#### 1. 现场人员创建批次工单

**时间**: 2026-02-25 09:00  
**操作人**: 王一（现场人员）  
**操作**: 
- 添加2台设备（N77E1406, N77I0963）
- 填写项目信息：广州分公司-前台
- 填写联系人：王一 13603050631
- 提交

**结果**:
- ✅ 生成批次号：WO2602249788
- ✅ 2台设备状态：`Warehouse_Confirming`
- ✅ 仓库管理员收到待确认通知

---

#### 2. 仓库管理员确认

**时间**: 2026-02-25 10:00  
**操作人**: 张三（仓库管理员）  
**操作**:
- 登录仓库管理工作台
- 看到待确认批次：WO2602249788 (2台设备)
- 点击进入确认界面
- 为设备1填写出厂日期：2024-06-15
- 为设备2填写出厂日期：2024-07-20
- 点击"确认批次设备 (2台)"

**结果**:
- ✅ 系统自动计算保修状态：
  - 设备1 (2024-06-15): 保内 ✅
  - 设备2 (2024-07-20): 保内 ✅
- ✅ 2台设备状态：`Warehouse_Confirmed`
- ✅ 维修人员收到通知，可以开始处理

---

#### 3. 维修人员检查并填写报告

**时间**: 2026-02-25 11:00  
**操作人**: 李明（维修人员）  
**操作**:
- 进入批次工单详情页
- 查看设备列表，看到出厂日期和保修状态
- 点击"编辑维修报告"
- 检查设备，填写：
  - 故障点：电源模块损坏
  - 维修方案：更换电源模块
  - 维修费用：0元（保内免费）
- 保存并发送给现场确认

**结果**:
- ✅ 2台设备状态：`Pending_Reporter_Confirm`
- ✅ 现场人员收到通知，可以查看报告

---

#### 4. 现场人员签字回传

**时间**: 2026-02-25 13:00  
**操作人**: 王一（现场人员）  
**操作**:
- 打开工单详情弹窗
- 点击"查看维修报告"
- 打印维修报告
- 在报告上签字盖章
- 拍照上传签字后的报告

**结果**:
- ✅ 签字照片已上传
- ✅ 2台设备状态：`Technician_Repairing`
- ✅ 维修人员收到签字回传通知

---

#### 5. 维修人员开始维修

**时间**: 2026-02-25 14:00  
**操作人**: 李明（维修人员）  
**操作**:
- 查看签字凭证
- 开始实际维修工作
- 更换电源模块
- 测试设备正常
- 点击"完成维修"按钮

**结果**:
- ✅ 2台设备状态：`Business_Review`
- ✅ 商务人员收到审核通知

---

#### 6. 商务人员审核

**时间**: 2026-02-25 16:00  
**操作人**: 赵丽（商务人员）  
**操作**:
- 进入商务审核页面
- 查看批次：WO2602249788
- 确认：是否收费 = **否**（保内免费）
- 点击"完成审核"

**结果**:
- ✅ 2台设备状态：`Warehouse_Shipping`
- ✅ 仓库管理员收到发货通知

---

#### 7. 仓库管理员发货

**时间**: 2026-02-26 09:00  
**操作人**: 张三（仓库管理员）  
**操作**:
- 进入仓库发货页面
- 查看批次：WO2602249788
- 选择：**发回客户**
- 填写发货信息：
  - 发货日期：2026-02-26
  - 快递单号：SF1234567890
  - 发货数量：2
- 点击"确认发货"

**结果**:
- ✅ 2台设备状态：`Completed`
- ✅ 批次工单流程结束
- ✅ 所有角色可以查看完整的工单历史

---

## 状态流转规则

### 正常流程

```
Created 
    ↓ (仅由系统创建时自动设置)
Warehouse_Confirming 
    ↓ (仓库管理员确认并填写出厂日期)
Warehouse_Confirmed 
    ↓ (维修人员填写维修报告)
Pending_Reporter_Confirm 
    ↓ (现场人员签字回传)
Technician_Repairing 
    ↓ (维修人员完成维修)
Business_Review 
    ↓ (商务人员审核通过)
Warehouse_Shipping 
    ↓ (仓库管理员发货)
Completed
```

### 取消流程

在任意步骤（除了 `Completed`），现场人员都可以申请取消批次工单：

```
任意状态
    ↓ (现场人员申请取消)
CancelRequestStatus = Pending
    ↓ (商务人员审批)
如果批准 → Status = Cancelled
如果拒绝 → 保持原状态，CancelRequestStatus = Rejected
```

---

## 实施清单

### 已完成 ✅

- [x] 更新状态枚举 (`lib/enums.ts`)
- [x] 更新时间线组件（9步流程）
- [x] 创建仓库确认组件 (`WarehouseBatchConfirm`)
- [x] 创建仓库确认API (`/api/tickets/warehouse-confirm-batch/[batchId]`)
- [x] 创建商务审核组件 (`BusinessBatchReview`)
- [x] 创建商务审核API (`/api/tickets/business-confirm-batch/[batchId]`)
- [x] 创建仓库发货组件 (`WarehouseBatchShipping`)
- [x] 创建仓库发货API (`/api/tickets/warehouse-shipping-batch/[batchId]`)
- [x] 修改批次创建API，初始状态为 `Warehouse_Confirming`
- [x] 修改批次详情页，显示出厂日期和保修状态
- [x] 修改批次详情页，仓库未确认时禁用"编辑维修报告"

### 待实施 🚧

- [ ] 修改批次详情页的按钮，根据当前状态显示不同的操作按钮
- [ ] 创建商务人员的批次列表页面
- [ ] 创建仓库管理员的发货列表页面
- [ ] 添加状态变更的历史记录
- [ ] 添加各角色的工作台视图
- [ ] 添加通知系统，状态变更时自动通知相关角色

---

## 相关文档

- [BATCH_ORDER_UI_ENHANCEMENT.md](./BATCH_ORDER_UI_ENHANCEMENT.md) - 批次工单界面优化
- [BATCH_CANCEL_CLARIFICATION.md](./BATCH_CANCEL_CLARIFICATION.md) - 批次工单取消功能
- [REPAIR_STATUS_TIMELINE.md](./REPAIR_STATUS_TIMELINE.md) - 工单流程时间线

---

**创建时间**: 2026-02-25  
**版本**: v2.0.0  
**状态**: ✅ 核心功能已完成，待集成和测试
