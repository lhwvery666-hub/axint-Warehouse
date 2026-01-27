# 数据库结构升级说明

## 概述

本脚本用于升级 `Repair_Tickets` 表结构，根据最终业务表单全量对齐数据库结构。

## 新增字段

### [现场人员填报区] (创建时填)
- `SubmitDate` (提交日期) - DATETIME
- `TrackingNumber_In` (发出快递单号) - NVARCHAR(100)
- `SenderAddress` (寄件人地址) - NVARCHAR(500)
- `ContactInfo` (联系人及电话) - NVARCHAR(200)
- `ProjectName` (项目/客户名称) - NVARCHAR(200)
- `Category` (产品名称/大类) - NVARCHAR(100)
- `ModelName` (型号) - NVARCHAR(200)
- `Quantity` (数量) - INT (默认 1)
- `ProductSN` (产品序列号) - NVARCHAR(200)
- `FaultDescription` (故障描述) - NVARCHAR(MAX)

### [维修人员填写区] (维修阶段填)
- `MaterialCode` (物料代码) - NVARCHAR(100)
- `DeviceName` (物料名称) - NVARCHAR(200)
- `FullSpec` (规格型号) - NVARCHAR(500)
- `FaultPoint` (故障点) - NVARCHAR(500)

### [管理员填写区] (商务/财务阶段填)
- `IsChargeable` (是否收费) - BIT
- `FactoryRepairDate` (返厂维修日期) - DATETIME
- `FactoryTrackingNum` (返厂维修快递单号) - NVARCHAR(100)
- `SupplierName` (供应商名称) - NVARCHAR(200)
- `RepairCost` (收费金额) - DECIMAL(18,2)
- `ClientName` (客户名称) - NVARCHAR(200)
- `IsInvoiced` (是否开票) - BIT

### [仓库管理员填写区] (发货阶段填)
- `ReceivedDate` (收到日期) - DATETIME
- `FactoryShipDate` (出厂日期) - DATETIME
- `ReturnDate` (返还客户日期) - DATETIME
- `ReturnQuantity` (返还客户数量) - INT
- `ReturnTrackingNum` (返还客户快递单号) - NVARCHAR(100)

## 状态字段更新

新的状态流转：
- `Created` (待维修) - 工单创建时的初始状态
- `In_Repair` (维修中) - 维修人员开始处理
- `Admin_Review` (待商务处理) - 等待管理员处理商务/财务事项
- `Pending_Shipment` (待发货) - 等待仓库管理员发货
- `Completed` (已完成) - 工单完成

**向后兼容**：旧状态 `Pending` 和 `Processing` 会自动映射到新状态。

## 运行方式

```bash
# 使用 npm
npm run upgrade-schema

# 或使用 pnpm
pnpm upgrade-schema

# 或直接使用 tsx
tsx scripts/upgrade-repair-tickets-schema.ts
```

## 注意事项

1. **备份数据**：运行迁移脚本前，请先备份数据库
2. **字段检查**：脚本会自动检查字段是否存在，已存在的字段不会重复添加
3. **向后兼容**：脚本会保留旧字段，确保现有数据不受影响
4. **状态映射**：API 会自动将旧状态映射到新状态，前端无需立即修改

## 验证

运行脚本后，可以执行以下 SQL 查询验证字段是否已添加：

```sql
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'Repair_Tickets'
ORDER BY ORDINAL_POSITION
```
