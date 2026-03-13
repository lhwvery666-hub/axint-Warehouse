-- ===================================
-- 维修工单系统 - 工作流程 v2.0 升级脚本
-- 版本: v2.0.0
-- 日期: 2026-02-25
-- 说明: 添加完整工作流程所需的数据库字段
-- ===================================

-- 使用您的数据库（请修改为实际数据库名）
-- USE [YourDatabaseName];
GO

PRINT '========================================';
PRINT '维修工单系统 - 工作流程 v2.0 升级';
PRINT '开始时间: ' + CONVERT(VARCHAR(20), GETDATE(), 120);
PRINT '========================================';
GO

-- ===================================
-- 1. 检查表是否存在
-- ===================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Repair_Tickets')
BEGIN
    PRINT '❌ 错误：Repair_Tickets 表不存在！';
    PRINT '请先创建基础表结构。';
    RETURN;
END
GO

PRINT '';
PRINT '✅ 表存在检查通过';
PRINT '';
GO

-- ===================================
-- 2. 添加出厂日期和保修相关字段
-- ===================================
PRINT '📦 [1/4] 添加出厂日期和保修相关字段...';
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Repair_Tickets') AND name = 'ManufactureDate')
BEGIN
    ALTER TABLE Repair_Tickets ADD ManufactureDate DATETIME NULL;
    PRINT '  ✅ ManufactureDate - 出厂日期';
END
ELSE
    PRINT '  ⏭️ ManufactureDate - 已存在';
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Repair_Tickets') AND name = 'WarrantyStatus')
BEGIN
    ALTER TABLE Repair_Tickets ADD WarrantyStatus VARCHAR(50) NULL;
    PRINT '  ✅ WarrantyStatus - 保修状态';
END
ELSE
    PRINT '  ⏭️ WarrantyStatus - 已存在';
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Repair_Tickets') AND name = 'WarehouseConfirmedAt')
BEGIN
    ALTER TABLE Repair_Tickets ADD WarehouseConfirmedAt DATETIME NULL;
    PRINT '  ✅ WarehouseConfirmedAt - 仓库确认时间';
END
ELSE
    PRINT '  ⏭️ WarehouseConfirmedAt - 已存在';
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Repair_Tickets') AND name = 'WarehouseConfirmedBy')
BEGIN
    ALTER TABLE Repair_Tickets ADD WarehouseConfirmedBy VARCHAR(100) NULL;
    PRINT '  ✅ WarehouseConfirmedBy - 仓库确认人';
END
ELSE
    PRINT '  ⏭️ WarehouseConfirmedBy - 已存在';
GO

PRINT '';
GO

-- ===================================
-- 3. 添加维修完成相关字段
-- ===================================
PRINT '🔧 [2/4] 添加维修完成相关字段...';
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Repair_Tickets') AND name = 'TechnicianCompletedAt')
BEGIN
    ALTER TABLE Repair_Tickets ADD TechnicianCompletedAt DATETIME NULL;
    PRINT '  ✅ TechnicianCompletedAt - 维修完成时间';
END
ELSE
    PRINT '  ⏭️ TechnicianCompletedAt - 已存在';
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Repair_Tickets') AND name = 'TechnicianCompletedBy')
BEGIN
    ALTER TABLE Repair_Tickets ADD TechnicianCompletedBy VARCHAR(100) NULL;
    PRINT '  ✅ TechnicianCompletedBy - 维修完成人';
END
ELSE
    PRINT '  ⏭️ TechnicianCompletedBy - 已存在';
GO

PRINT '';
GO

-- ===================================
-- 4. 添加商务审核相关字段
-- ===================================
PRINT '💰 [3/4] 添加商务审核相关字段...';
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Repair_Tickets') AND name = 'BusinessReviewedAt')
BEGIN
    ALTER TABLE Repair_Tickets ADD BusinessReviewedAt DATETIME NULL;
    PRINT '  ✅ BusinessReviewedAt - 商务审核时间';
END
ELSE
    PRINT '  ⏭️ BusinessReviewedAt - 已存在';
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Repair_Tickets') AND name = 'BusinessReviewedBy')
BEGIN
    ALTER TABLE Repair_Tickets ADD BusinessReviewedBy VARCHAR(100) NULL;
    PRINT '  ✅ BusinessReviewedBy - 商务审核人';
END
ELSE
    PRINT '  ⏭️ BusinessReviewedBy - 已存在';
GO

PRINT '';
GO

-- ===================================
-- 5. 添加仓库发货相关字段
-- ===================================
PRINT '📦 [4/4] 添加仓库发货相关字段...';
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Repair_Tickets') AND name = 'ShippingType')
BEGIN
    ALTER TABLE Repair_Tickets ADD ShippingType VARCHAR(50) NULL;
    PRINT '  ✅ ShippingType - 发货方式';
END
ELSE
    PRINT '  ⏭️ ShippingType - 已存在';
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Repair_Tickets') AND name = 'WarehouseShippedAt')
BEGIN
    ALTER TABLE Repair_Tickets ADD WarehouseShippedAt DATETIME NULL;
    PRINT '  ✅ WarehouseShippedAt - 仓库发货时间';
END
ELSE
    PRINT '  ⏭️ WarehouseShippedAt - 已存在';
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Repair_Tickets') AND name = 'WarehouseShippedBy')
BEGIN
    ALTER TABLE Repair_Tickets ADD WarehouseShippedBy VARCHAR(100) NULL;
    PRINT '  ✅ WarehouseShippedBy - 仓库发货人';
END
ELSE
    PRINT '  ⏭️ WarehouseShippedBy - 已存在';
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Repair_Tickets') AND name = 'ReporterConfirmedAt')
BEGIN
    ALTER TABLE Repair_Tickets ADD ReporterConfirmedAt DATETIME NULL;
    PRINT '  ✅ ReporterConfirmedAt - 现场确认时间';
END
ELSE
    PRINT '  ⏭️ ReporterConfirmedAt - 已存在';
GO

PRINT '';
GO

-- ===================================
-- 6. 验证字段完整性
-- ===================================
PRINT '🔍 验证字段完整性...';
GO

DECLARE @MissingFields TABLE (FieldName VARCHAR(100));
DECLARE @FieldCount INT = 0;

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

SELECT @FieldCount = COUNT(*) FROM @MissingFields;

IF @FieldCount > 0
BEGIN
    PRINT '❌ 以下字段缺失：';
    SELECT '  - ' + FieldName as 缺失字段 FROM @MissingFields;
    PRINT '';
    PRINT '请检查脚本执行是否有错误。';
END
ELSE
BEGIN
    PRINT '✅ 所有必需字段都已存在！';
END
GO

PRINT '';
GO

-- ===================================
-- 7. 创建索引（可选，提升性能）
-- ===================================
PRINT '📊 创建索引（提升查询性能）...';
GO

-- 批次号索引
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Repair_Tickets_BatchId' AND object_id = OBJECT_ID('Repair_Tickets'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Repair_Tickets_BatchId
    ON Repair_Tickets (BatchId)
    WHERE BatchId IS NOT NULL;
    PRINT '  ✅ IX_Repair_Tickets_BatchId - 批次号索引';
END
ELSE
    PRINT '  ⏭️ IX_Repair_Tickets_BatchId - 已存在';
GO

-- 状态索引
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Repair_Tickets_Status' AND object_id = OBJECT_ID('Repair_Tickets'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Repair_Tickets_Status
    ON Repair_Tickets (Status)
    WHERE Status IS NOT NULL;
    PRINT '  ✅ IX_Repair_Tickets_Status - 状态索引';
END
ELSE
    PRINT '  ⏭️ IX_Repair_Tickets_Status - 已存在';
GO

-- 创建时间索引
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Repair_Tickets_CreatedAt' AND object_id = OBJECT_ID('Repair_Tickets'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Repair_Tickets_CreatedAt
    ON Repair_Tickets (CreatedAt DESC)
    WHERE CreatedAt IS NOT NULL;
    PRINT '  ✅ IX_Repair_Tickets_CreatedAt - 创建时间索引';
END
ELSE
    PRINT '  ⏭️ IX_Repair_Tickets_CreatedAt - 已存在';
GO

PRINT '';
GO

-- ===================================
-- 8. 显示最终结果
-- ===================================
PRINT '========================================';
PRINT '✅ 升级完成！';
PRINT '完成时间: ' + CONVERT(VARCHAR(20), GETDATE(), 120);
PRINT '========================================';
PRINT '';
PRINT '新增字段列表：';
GO

SELECT 
    '  ' + COLUMN_NAME as 字段名,
    DATA_TYPE as 类型,
    CASE 
        WHEN CHARACTER_MAXIMUM_LENGTH IS NOT NULL 
        THEN '(' + CAST(CHARACTER_MAXIMUM_LENGTH AS VARCHAR) + ')'
        ELSE ''
    END as 长度,
    CASE WHEN IS_NULLABLE = 'YES' THEN '✅' ELSE '❌' END as 可空
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
ORDER BY 
    CASE COLUMN_NAME
        WHEN 'ManufactureDate' THEN 1
        WHEN 'WarrantyStatus' THEN 2
        WHEN 'WarehouseConfirmedAt' THEN 3
        WHEN 'WarehouseConfirmedBy' THEN 4
        WHEN 'TechnicianCompletedAt' THEN 5
        WHEN 'TechnicianCompletedBy' THEN 6
        WHEN 'BusinessReviewedAt' THEN 7
        WHEN 'BusinessReviewedBy' THEN 8
        WHEN 'ShippingType' THEN 9
        WHEN 'WarehouseShippedAt' THEN 10
        WHEN 'WarehouseShippedBy' THEN 11
        WHEN 'ReporterConfirmedAt' THEN 12
    END;
GO

PRINT '';
PRINT '========================================';
PRINT '下一步操作：';
PRINT '1. 部署应用代码（npm run build && npm start）';
PRINT '2. 运行测试流程（参见 docs/WORKFLOW_TEST_GUIDE.md）';
PRINT '3. 通知各角色用户新功能上线';
PRINT '========================================';
GO

-- ===================================
-- 可选：数据迁移（为旧数据补充信息）
-- ===================================
/*
PRINT '';
PRINT '🔄 可选：数据迁移（为旧数据补充出厂日期）';
PRINT '如需执行，请取消注释此段代码';
GO

-- 为已完成的保内工单设置默认出厂日期（往前推18个月）
UPDATE Repair_Tickets
SET 
    ManufactureDate = DATEADD(MONTH, -18, ISNULL(ReportTime, GETDATE())),
    WarrantyStatus = 'InWarranty'
WHERE Status = 'Completed' 
    AND IsChargeable = 0
    AND ManufactureDate IS NULL;

PRINT '  ✅ 已为保内工单设置默认出厂日期';
GO

-- 为已完成的过保工单设置默认出厂日期（往前推30个月）
UPDATE Repair_Tickets
SET 
    ManufactureDate = DATEADD(MONTH, -30, ISNULL(ReportTime, GETDATE())),
    WarrantyStatus = 'OutOfWarranty'
WHERE Status = 'Completed' 
    AND IsChargeable = 1
    AND ManufactureDate IS NULL;

PRINT '  ✅ 已为过保工单设置默认出厂日期';
GO
*/

-- ===================================
-- 脚本结束
-- ===================================
