# 工作流字段数据库迁移

## 📋 迁移概述

**日期**: 2026-02-26  
**目的**: 为 `Repair_Tickets` 表添加完整的工作流跟踪字段  
**迁移脚本**: `scripts/add-workflow-fields.ts`  

---

## ✅ 迁移结果

### 成功添加的字段 (14个)

| 字段名 | 类型 | 说明 | 所属阶段 |
|--------|------|------|----------|
| `ManufactureDate` | DATETIME | 出厂日期 | 仓库确认 |
| `WarrantyStatus` | NVARCHAR(50) | 保修状态 (InWarranty/OutOfWarranty/Unknown) | 仓库确认 |
| `WarehouseConfirmedAt` | DATETIME | 仓库确认时间 | 仓库确认 |
| `WarehouseConfirmedBy` | NVARCHAR(100) | 仓库确认人 | 仓库确认 |
| `TechnicianCompletedAt` | DATETIME | 维修完成时间 | 维修阶段 |
| `TechnicianCompletedBy` | NVARCHAR(100) | 维修完成人 | 维修阶段 |
| `BusinessReviewedAt` | DATETIME | 商务审核时间 | 商务审核 |
| `BusinessReviewedBy` | NVARCHAR(100) | 商务审核人 | 商务审核 |
| `ShippingType` | NVARCHAR(50) | 发货方式 (return/stock) | 仓库发货 |
| `WarehouseShippedAt` | DATETIME | 仓库发货时间 | 仓库发货 |
| `WarehouseShippedBy` | NVARCHAR(100) | 仓库发货人 | 仓库发货 |
| `ReporterConfirmedAt` | DATETIME | 现场确认时间 | 签字确认 |
| `IsPaymentReceived` | BIT | 是否已收款 | 商务审核 |
| `DeletedAt` | DATETIME | 删除时间 | 系统管理 |

### 已存在的字段 (6个)

这些字段在之前的迁移中已经添加：

| 字段名 | 说明 |
|--------|------|
| `SignedReportPhoto` | 签字凭证照片路径 |
| `SignedPhotoViewedBy` | 签字凭证查看人 |
| `SignedPhotoViewedAt` | 签字凭证查看时间 |
| `SignedPhotoModifyRequest` | 签字凭证修改请求（JSON格式）|
| `CourierCompany` | 快递公司 |
| `CourierNumber` | 快递单号 |

---

## 🎯 字段用途说明

### 1. 仓库确认阶段

当仓库管理员确认收到设备并填写出厂日期时，系统会记录：
- `ManufactureDate`: 设备出厂日期（用于计算保修状态）
- `WarrantyStatus`: 自动计算的保修状态
- `WarehouseConfirmedAt`: 确认的精确时间
- `WarehouseConfirmedBy`: 操作人员姓名

**相关 API**: `/api/tickets/warehouse-confirm-batch/[batchId]`

### 2. 维修完成阶段

维修人员完成维修并提交报告时：
- `TechnicianCompletedAt`: 维修完成时间
- `TechnicianCompletedBy`: 维修人员姓名

**相关 API**: `/api/tickets/complete-repair-batch/[batchId]`

### 3. 商务审核阶段

商务人员审核费用和开票信息时：
- `BusinessReviewedAt`: 审核时间
- `BusinessReviewedBy`: 审核人员姓名
- `IsPaymentReceived`: 是否已收到付款

**相关 API**: `/api/tickets/business-confirm-batch/[batchId]`

### 4. 仓库发货阶段

仓库管理员发货时：
- `ShippingType`: 发货方式 (`return`=发回客户, `stock`=入库)
- `WarehouseShippedAt`: 发货时间
- `WarehouseShippedBy`: 发货人员姓名

**相关 API**: `/api/tickets/warehouse-shipping-batch/[batchId]`

### 5. 现场确认阶段

现场人员签字确认时：
- `ReporterConfirmedAt`: 签字确认时间

**相关 API**: `/api/tickets/reporter-confirm/[batchId]`

### 6. 系统管理

软删除支持：
- `DeletedAt`: 记录删除时间（用于软删除，不是物理删除）

---

## 🔄 工作流完整性

添加这些字段后，系统现在可以完整追踪以下流程：

```
1. 现场人员报修 → 创建工单
   ↓
2. 仓库确认收货 → WarehouseConfirmedAt, WarehouseConfirmedBy
   ↓
3. 维修检测/维修 → TechnicianCompletedAt, TechnicianCompletedBy
   ↓
4. 现场签字确认 → ReporterConfirmedAt
   ↓
5. 商务审核收费 → BusinessReviewedAt, BusinessReviewedBy, IsPaymentReceived
   ↓
6. 仓库发货/入库 → WarehouseShippedAt, WarehouseShippedBy, ShippingType
   ↓
7. 工单完成
```

---

## 📝 审计日志支持

所有关键操作都会记录到 `Repair_Ticket_History` 表，包括：
- 操作类型 (`ActionType`)
- 操作人员 (`OperatorID`, `OperatorName`)
- 状态变更 (`OldStatus`, `NewStatus`)
- 操作描述 (`ActionDescription`)
- 操作时间 (`CreatedAt`)

---

## 🚀 如何运行迁移

```bash
# 添加工作流字段
npm run add-workflow-fields
```

迁移脚本特点：
- ✅ **幂等性**: 可以多次运行，不会重复添加字段
- ✅ **安全性**: 只添加新字段，不修改或删除现有数据
- ✅ **详细日志**: 清晰显示每个字段的添加状态
- ✅ **错误处理**: 如果部分字段添加失败，会显示详细错误信息

---

## 📊 数据完整性

### 约束和验证

所有新增字段均为 `NULL` 可选，确保：
1. 不影响现有数据
2. 向后兼容
3. 逐步完善工作流数据

### 数据类型选择

- `DATETIME`: 用于时间戳，精度到毫秒
- `NVARCHAR`: 支持 Unicode，适合中文姓名和描述
- `BIT`: 布尔值，节省存储空间

---

## 🔒 权限控制

这些字段与 API 权限系统配合：

| 角色 | 可操作字段 | API 路由 |
|------|-----------|---------|
| 仓库管理员 (Warehouse) | WarehouseConfirmedAt/By, WarehouseShippedAt/By, ShippingType | `/api/tickets/warehouse-*` |
| 维修人员 (Technician) | TechnicianCompletedAt/By | `/api/tickets/complete-repair-batch/[batchId]` |
| 商务人员 (Commerce) | BusinessReviewedAt/By, IsPaymentReceived | `/api/tickets/business-confirm-batch/[batchId]` |
| 现场人员 (Reporter) | ReporterConfirmedAt | `/api/tickets/reporter-confirm/[batchId]` |

---

## 📚 相关文档

- [工单号重置指南](./WORK_ORDER_NUMBER_RESET_GUIDE.md)
- [数据库连接池修复](./DATABASE_CONNECTION_POOL_FIX.md)
- [状态聚合系统](./STATUS_AGGREGATION_SYSTEM.md)
- [数据库结构更新](./DATABASE_SCHEMA_UPDATE.md)

---

## ⚠️ 注意事项

1. **事务支持**: 所有涉及这些字段的更新操作都应该在数据库事务中进行
2. **审计日志**: 每次更新这些字段时，必须同步更新 `Repair_Ticket_History` 表
3. **时区处理**: 所有时间戳使用服务器本地时间（中国标准时间）
4. **枚举一致性**: `WarrantyStatus` 和 `ShippingType` 的值应与代码中的枚举保持一致

---

## 📞 故障排查

### 问题1: `Invalid column name 'WarehouseConfirmedBy'`

**原因**: 数据库迁移未执行

**解决方案**:
```bash
npm run add-workflow-fields
```

### 问题2: 迁移失败或部分字段未添加

**排查步骤**:
1. 检查数据库连接配置 (`lib/db-config.ts`)
2. 确认数据库用户有 `ALTER TABLE` 权限
3. 查看终端输出的详细错误信息
4. 手动连接数据库执行 SQL:
   ```sql
   SELECT COLUMN_NAME 
   FROM INFORMATION_SCHEMA.COLUMNS 
   WHERE TABLE_NAME = 'Repair_Tickets'
   ORDER BY ORDINAL_POSITION;
   ```

---

**迁移完成时间**: 2026-02-26  
**迁移状态**: ✅ 成功  
**影响范围**: `Repair_Tickets` 表 + 所有工作流相关 API
