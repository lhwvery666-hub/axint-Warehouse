# 数据库结构更新

## 概述

为了支持新的完整工作流程，需要在 `Repair_Tickets` 表中添加以下新字段。

---

## 新增字段清单

### 1. 出厂日期和保修相关

```sql
-- 出厂日期（仓库管理员填写）
ALTER TABLE Repair_Tickets
ADD ManufactureDate DATETIME NULL;

-- 保修状态（自动计算：InWarranty / OutOfWarranty / Unknown）
ALTER TABLE Repair_Tickets
ADD WarrantyStatus VARCHAR(50) NULL;

-- 仓库确认时间
ALTER TABLE Repair_Tickets
ADD WarehouseConfirmedAt DATETIME NULL;

-- 仓库确认人
ALTER TABLE Repair_Tickets
ADD WarehouseConfirmedBy VARCHAR(100) NULL;
```

---

### 2. 维修完成相关

```sql
-- 维修人员完成维修时间
ALTER TABLE Repair_Tickets
ADD TechnicianCompletedAt DATETIME NULL;

-- 维修人员完成人
ALTER TABLE Repair_Tickets
ADD TechnicianCompletedBy VARCHAR(100) NULL;
```

---

### 3. 商务审核相关

```sql
-- 商务审核时间
ALTER TABLE Repair_Tickets
ADD BusinessReviewedAt DATETIME NULL;

-- 商务审核人
ALTER TABLE Repair_Tickets
ADD BusinessReviewedBy VARCHAR(100) NULL;
```

---

### 4. 仓库发货相关

```sql
-- 发货方式（return=发回客户, stock=入库）
ALTER TABLE Repair_Tickets
ADD ShippingType VARCHAR(50) NULL;

-- 仓库发货时间
ALTER TABLE Repair_Tickets
ADD WarehouseShippedAt DATETIME NULL;

-- 仓库发货人
ALTER TABLE Repair_Tickets
ADD WarehouseShippedBy VARCHAR(100) NULL;
```

---

### 5. 现场确认相关

```sql
-- 现场确认时间（现场人员签字回传时间）
ALTER TABLE Repair_Tickets
ADD ReporterConfirmedAt DATETIME NULL;
```

---

## 完整的 SQL 脚本

```sql
-- ===================================
-- 维修工单系统 - 数据库结构更新
-- 版本: v2.0.0
-- 日期: 2026-02-25
-- ===================================

USE [your_database_name];
GO

-- 检查表是否存在
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Repair_Tickets')
BEGIN
    PRINT '错误：Repair_Tickets 表不存在！';
    RETURN;
END
GO

PRINT '开始更新 Repair_Tickets 表结构...';
GO

-- 1. 出厂日期和保修相关
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Repair_Tickets') AND name = 'ManufactureDate')
BEGIN
    ALTER TABLE Repair_Tickets ADD ManufactureDate DATETIME NULL;
    PRINT '✅ 已添加字段: ManufactureDate';
END
ELSE
    PRINT '⏭️ 字段已存在: ManufactureDate';
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Repair_Tickets') AND name = 'WarrantyStatus')
BEGIN
    ALTER TABLE Repair_Tickets ADD WarrantyStatus VARCHAR(50) NULL;
    PRINT '✅ 已添加字段: WarrantyStatus';
END
ELSE
    PRINT '⏭️ 字段已存在: WarrantyStatus';
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Repair_Tickets') AND name = 'WarehouseConfirmedAt')
BEGIN
    ALTER TABLE Repair_Tickets ADD WarehouseConfirmedAt DATETIME NULL;
    PRINT '✅ 已添加字段: WarehouseConfirmedAt';
END
ELSE
    PRINT '⏭️ 字段已存在: WarehouseConfirmedAt';
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Repair_Tickets') AND name = 'WarehouseConfirmedBy')
BEGIN
    ALTER TABLE Repair_Tickets ADD WarehouseConfirmedBy VARCHAR(100) NULL;
    PRINT '✅ 已添加字段: WarehouseConfirmedBy';
END
ELSE
    PRINT '⏭️ 字段已存在: WarehouseConfirmedBy';
GO

-- 2. 维修完成相关
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Repair_Tickets') AND name = 'TechnicianCompletedAt')
BEGIN
    ALTER TABLE Repair_Tickets ADD TechnicianCompletedAt DATETIME NULL;
    PRINT '✅ 已添加字段: TechnicianCompletedAt';
END
ELSE
    PRINT '⏭️ 字段已存在: TechnicianCompletedAt';
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Repair_Tickets') AND name = 'TechnicianCompletedBy')
BEGIN
    ALTER TABLE Repair_Tickets ADD TechnicianCompletedBy VARCHAR(100) NULL;
    PRINT '✅ 已添加字段: TechnicianCompletedBy';
END
ELSE
    PRINT '⏭️ 字段已存在: TechnicianCompletedBy';
GO

-- 3. 商务审核相关
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Repair_Tickets') AND name = 'BusinessReviewedAt')
BEGIN
    ALTER TABLE Repair_Tickets ADD BusinessReviewedAt DATETIME NULL;
    PRINT '✅ 已添加字段: BusinessReviewedAt';
END
ELSE
    PRINT '⏭️ 字段已存在: BusinessReviewedAt';
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Repair_Tickets') AND name = 'BusinessReviewedBy')
BEGIN
    ALTER TABLE Repair_Tickets ADD BusinessReviewedBy VARCHAR(100) NULL;
    PRINT '✅ 已添加字段: BusinessReviewedBy';
END
ELSE
    PRINT '⏭️ 字段已存在: BusinessReviewedBy';
GO

-- 4. 仓库发货相关
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Repair_Tickets') AND name = 'ShippingType')
BEGIN
    ALTER TABLE Repair_Tickets ADD ShippingType VARCHAR(50) NULL;
    PRINT '✅ 已添加字段: ShippingType';
END
ELSE
    PRINT '⏭️ 字段已存在: ShippingType';
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Repair_Tickets') AND name = 'WarehouseShippedAt')
BEGIN
    ALTER TABLE Repair_Tickets ADD WarehouseShippedAt DATETIME NULL;
    PRINT '✅ 已添加字段: WarehouseShippedAt';
END
ELSE
    PRINT '⏭️ 字段已存在: WarehouseShippedAt';
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Repair_Tickets') AND name = 'WarehouseShippedBy')
BEGIN
    ALTER TABLE Repair_Tickets ADD WarehouseShippedBy VARCHAR(100) NULL;
    PRINT '✅ 已添加字段: WarehouseShippedBy';
END
ELSE
    PRINT '⏭️ 字段已存在: WarehouseShippedBy';
GO

-- 5. 现场确认相关
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Repair_Tickets') AND name = 'ReporterConfirmedAt')
BEGIN
    ALTER TABLE Repair_Tickets ADD ReporterConfirmedAt DATETIME NULL;
    PRINT '✅ 已添加字段: ReporterConfirmedAt';
END
ELSE
    PRINT '⏭️ 字段已存在: ReporterConfirmedAt';
GO

PRINT '✅ 数据库结构更新完成！';
GO

-- 查看所有新增字段
SELECT 
    COLUMN_NAME as 字段名,
    DATA_TYPE as 数据类型,
    CHARACTER_MAXIMUM_LENGTH as 最大长度,
    IS_NULLABLE as 是否可空
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'Repair_Tickets'
    AND COLUMN_NAME IN (
        'ManufactureDate',
        'WarrantyStatus',
        'WarehouseConfirmedAt',
        'WarehouseConfirmedBy',
        'TechnicianCompletedAt',
        'TechnicianCompletedBy',
        'BusinessReviewedAt',
        'BusinessReviewedBy',
        'ShippingType',
        'WarehouseShippedAt',
        'WarehouseShippedBy',
        'ReporterConfirmedAt'
    )
ORDER BY COLUMN_NAME;
GO
```

---

## 验证脚本

运行以下查询验证字段是否添加成功：

```sql
-- 查询所有新增字段
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'Repair_Tickets'
    AND COLUMN_NAME LIKE '%Confirmed%'
    OR COLUMN_NAME LIKE '%Completed%'
    OR COLUMN_NAME LIKE '%Reviewed%'
    OR COLUMN_NAME LIKE '%Shipped%'
    OR COLUMN_NAME LIKE 'ManufactureDate'
    OR COLUMN_NAME LIKE 'WarrantyStatus'
    OR COLUMN_NAME LIKE 'ShippingType'
ORDER BY COLUMN_NAME;
```

预期结果（12行）：
```
COLUMN_NAME              DATA_TYPE    IS_NULLABLE
---------------------------------------------------
BusinessReviewedAt       datetime     YES
BusinessReviewedBy       varchar      YES
ManufactureDate          datetime     YES
ReporterConfirmedAt      datetime     YES
ShippingType             varchar      YES
TechnicianCompletedAt    datetime     YES
TechnicianCompletedBy    varchar      YES
WarehouseConfirmedAt     datetime     YES
WarehouseConfirmedBy     varchar      YES
WarehouseShippedAt       datetime     YES
WarehouseShippedBy       varchar      YES
WarrantyStatus           varchar      YES
```

---

## 字段说明

| 字段名 | 数据类型 | 用途 | 填写角色 | 示例值 |
|-------|---------|------|---------|--------|
| `ManufactureDate` | DATETIME | 设备出厂日期 | 仓库管理员 | 2024-06-15 |
| `WarrantyStatus` | VARCHAR(50) | 保修状态 | 系统自动计算 | InWarranty / OutOfWarranty |
| `WarehouseConfirmedAt` | DATETIME | 仓库确认时间 | 系统自动记录 | 2026-02-25 10:30:00 |
| `WarehouseConfirmedBy` | VARCHAR(100) | 仓库确认人 | 系统自动记录 | 张三 |
| `TechnicianCompletedAt` | DATETIME | 维修完成时间 | 系统自动记录 | 2026-02-25 14:00:00 |
| `TechnicianCompletedBy` | VARCHAR(100) | 维修完成人 | 系统自动记录 | 李明 |
| `BusinessReviewedAt` | DATETIME | 商务审核时间 | 系统自动记录 | 2026-02-25 16:00:00 |
| `BusinessReviewedBy` | VARCHAR(100) | 商务审核人 | 系统自动记录 | 赵丽 |
| `ShippingType` | VARCHAR(50) | 发货方式 | 仓库管理员 | return / stock |
| `WarehouseShippedAt` | DATETIME | 仓库发货时间 | 系统自动记录 | 2026-02-26 09:00:00 |
| `WarehouseShippedBy` | VARCHAR(100) | 仓库发货人 | 系统自动记录 | 王五 |
| `ReporterConfirmedAt` | DATETIME | 现场确认时间 | 系统自动记录 | 2026-02-25 13:00:00 |

---

## 数据迁移建议

### 迁移旧数据（可选）

如果有历史工单数据，建议进行以下迁移：

```sql
-- 为已完成的工单设置默认的出厂日期（根据报修时间往前推2年）
UPDATE Repair_Tickets
SET ManufactureDate = DATEADD(YEAR, -2, ReportTime),
    WarrantyStatus = 'OutOfWarranty'
WHERE Status = 'Completed' 
    AND ManufactureDate IS NULL;

-- 为保内维修的工单设置保修状态
UPDATE Repair_Tickets
SET WarrantyStatus = 'InWarranty'
WHERE IsChargeable = 0 
    AND Status = 'Completed' 
    AND WarrantyStatus IS NULL;

-- 为过保维修的工单设置保修状态
UPDATE Repair_Tickets
SET WarrantyStatus = 'OutOfWarranty'
WHERE IsChargeable = 1 
    AND Status = 'Completed' 
    AND WarrantyStatus IS NULL;
```

---

## 验证清单

### 字段完整性检查

运行以下查询，确保所有字段都已添加：

```sql
DECLARE @MissingFields TABLE (FieldName VARCHAR(100));

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Repair_Tickets') AND name = 'ManufactureDate')
    INSERT INTO @MissingFields VALUES ('ManufactureDate');

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Repair_Tickets') AND name = 'WarrantyStatus')
    INSERT INTO @MissingFields VALUES ('WarrantyStatus');

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Repair_Tickets') AND name = 'WarehouseConfirmedAt')
    INSERT INTO @MissingFields VALUES ('WarehouseConfirmedAt');

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Repair_Tickets') AND name = 'WarehouseConfirmedBy')
    INSERT INTO @MissingFields VALUES ('WarehouseConfirmedBy');

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Repair_Tickets') AND name = 'TechnicianCompletedAt')
    INSERT INTO @MissingFields VALUES ('TechnicianCompletedAt');

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Repair_Tickets') AND name = 'TechnicianCompletedBy')
    INSERT INTO @MissingFields VALUES ('TechnicianCompletedBy');

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Repair_Tickets') AND name = 'BusinessReviewedAt')
    INSERT INTO @MissingFields VALUES ('BusinessReviewedAt');

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Repair_Tickets') AND name = 'BusinessReviewedBy')
    INSERT INTO @MissingFields VALUES ('BusinessReviewedBy');

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Repair_Tickets') AND name = 'ShippingType')
    INSERT INTO @MissingFields VALUES ('ShippingType');

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Repair_Tickets') AND name = 'WarehouseShippedAt')
    INSERT INTO @MissingFields VALUES ('WarehouseShippedAt');

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Repair_Tickets') AND name = 'WarehouseShippedBy')
    INSERT INTO @MissingFields VALUES ('WarehouseShippedBy');

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Repair_Tickets') AND name = 'ReporterConfirmedAt')
    INSERT INTO @MissingFields VALUES ('ReporterConfirmedAt');

-- 显示缺失的字段
IF EXISTS (SELECT * FROM @MissingFields)
BEGIN
    PRINT '❌ 以下字段缺失：';
    SELECT * FROM @MissingFields;
END
ELSE
BEGIN
    PRINT '✅ 所有必需字段都已存在！';
END
GO
```

---

## 索引优化（可选）

为了提高查询性能，可以添加以下索引：

```sql
-- 为批次号添加索引（如果还没有）
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Repair_Tickets_BatchId')
BEGIN
    CREATE NONCLUSTERED INDEX IX_Repair_Tickets_BatchId
    ON Repair_Tickets (BatchId)
    WHERE BatchId IS NOT NULL;
    PRINT '✅ 已创建索引: IX_Repair_Tickets_BatchId';
END
GO

-- 为状态添加索引
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Repair_Tickets_Status')
BEGIN
    CREATE NONCLUSTERED INDEX IX_Repair_Tickets_Status
    ON Repair_Tickets (Status)
    WHERE Status IS NOT NULL;
    PRINT '✅ 已创建索引: IX_Repair_Tickets_Status';
END
GO

-- 为创建时间添加索引
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Repair_Tickets_CreatedAt')
BEGIN
    CREATE NONCLUSTERED INDEX IX_Repair_Tickets_CreatedAt
    ON Repair_Tickets (CreatedAt DESC)
    WHERE CreatedAt IS NOT NULL;
    PRINT '✅ 已创建索引: IX_Repair_Tickets_CreatedAt';
END
GO
```

---

## 回滚脚本（慎用）

如果需要回滚到旧版本，运行以下脚本：

```sql
-- ⚠️ 警告：此操作会删除所有新增字段和数据！
-- ⚠️ 请先备份数据库！

ALTER TABLE Repair_Tickets DROP COLUMN ManufactureDate;
ALTER TABLE Repair_Tickets DROP COLUMN WarrantyStatus;
ALTER TABLE Repair_Tickets DROP COLUMN WarehouseConfirmedAt;
ALTER TABLE Repair_Tickets DROP COLUMN WarehouseConfirmedBy;
ALTER TABLE Repair_Tickets DROP COLUMN TechnicianCompletedAt;
ALTER TABLE Repair_Tickets DROP COLUMN TechnicianCompletedBy;
ALTER TABLE Repair_Tickets DROP COLUMN BusinessReviewedAt;
ALTER TABLE Repair_Tickets DROP COLUMN BusinessReviewedBy;
ALTER TABLE Repair_Tickets DROP COLUMN ShippingType;
ALTER TABLE Repair_Tickets DROP COLUMN WarehouseShippedAt;
ALTER TABLE Repair_Tickets DROP COLUMN WarehouseShippedBy;
ALTER TABLE Repair_Tickets DROP COLUMN ReporterConfirmedAt;

PRINT '⚠️ 字段已删除，请谨慎操作！';
```

---

## 部署步骤

1. **备份数据库**（重要！）
   ```bash
   # 备份数据库
   sqlcmd -S your_server -d your_database -E -Q "BACKUP DATABASE your_database TO DISK='backup.bak'"
   ```

2. **运行更新脚本**
   - 复制上面的"完整的 SQL 脚本"
   - 在 SQL Server Management Studio 中执行
   - 检查输出，确保所有字段都已添加

3. **运行验证脚本**
   - 确保所有字段都存在
   - 检查是否有错误信息

4. **部署应用代码**
   ```bash
   # 安装依赖
   npm install
   
   # 构建应用
   npm run build
   
   # 启动应用
   npm start
   ```

5. **测试流程**
   - 参考 `WORKFLOW_TEST_GUIDE.md` 进行完整测试
   - 确保所有角色的功能正常

---

**创建时间**: 2026-02-25  
**版本**: v2.0.0  
**状态**: ✅ 已完成
