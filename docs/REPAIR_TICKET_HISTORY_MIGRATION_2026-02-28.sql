-- =====================================================
-- Repair_Ticket_History 表结构升级
-- 添加批次级别的操作记录支持
-- =====================================================

USE AxinRepairDB;
GO

PRINT '开始升级 Repair_Ticket_History 表结构...';

-- 1. 添加批次相关字段
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'Repair_Ticket_History') AND name = 'BatchId')
BEGIN
    PRINT '添加 BatchId 字段...';
    ALTER TABLE Repair_Ticket_History
    ADD BatchId NVARCHAR(50) NULL;
    
    -- 创建索引
    CREATE INDEX IX_Repair_Ticket_History_BatchId ON Repair_Ticket_History(BatchId);
    PRINT '✅ BatchId 字段添加成功';
END
ELSE
BEGIN
    PRINT '⚠️  BatchId 字段已存在，跳过';
END

-- 2. 添加操作人ID字段（用于关联用户表）
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'Repair_Ticket_History') AND name = 'OperatorId')
BEGIN
    PRINT '添加 OperatorId 字段...';
    ALTER TABLE Repair_Ticket_History
    ADD OperatorId INT NULL;
    PRINT '✅ OperatorId 字段添加成功';
END
ELSE
BEGIN
    PRINT '⚠️  OperatorId 字段已存在，跳过';
END

-- 3. 添加操作人姓名字段（冗余存储，方便查询）
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'Repair_Ticket_History') AND name = 'OperatorName')
BEGIN
    PRINT '添加 OperatorName 字段...';
    ALTER TABLE Repair_Ticket_History
    ADD OperatorName NVARCHAR(100) NULL;
    PRINT '✅ OperatorName 字段添加成功';
END
ELSE
BEGIN
    PRINT '⚠️  OperatorName 字段已存在，跳过';
END

-- 4. 添加操作描述字段（更灵活的描述）
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'Repair_Ticket_History') AND name = 'Description')
BEGIN
    PRINT '添加 Description 字段...';
    ALTER TABLE Repair_Ticket_History
    ADD Description NVARCHAR(MAX) NULL;
    PRINT '✅ Description 字段添加成功';
END
ELSE
BEGIN
    PRINT '⚠️  Description 字段已存在，跳过';
END

-- 5. 将 TicketID 改为可空（批次级别操作不需要 TicketID）
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'Repair_Ticket_History') AND name = 'TicketID' AND is_nullable = 0)
BEGIN
    PRINT '将 TicketID 改为可空...';
    ALTER TABLE Repair_Ticket_History
    ALTER COLUMN TicketID NVARCHAR(50) NULL;
    PRINT '✅ TicketID 已改为可空';
END
ELSE
BEGIN
    PRINT '⚠️  TicketID 已是可空，跳过';
END

PRINT '';
PRINT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
PRINT '✅ Repair_Ticket_History 表结构升级完成！';
PRINT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
PRINT '';
PRINT '新增字段：';
PRINT '  - BatchId       批次ID（批次级别操作记录）';
PRINT '  - OperatorId    操作人ID（关联用户表）';
PRINT '  - OperatorName  操作人姓名（冗余存储）';
PRINT '  - Description   操作描述（更灵活）';
PRINT '';
PRINT '修改字段：';
PRINT '  - TicketID      改为可空（批次操作不需要）';
PRINT '';
PRINT '⚠️  注意：';
PRINT '  - 旧字段（ActionBy, ActionNote）保留兼容性';
PRINT '  - 新API应使用新字段（OperatorName, Description）';
PRINT '  - 批次操作记录使用 BatchId，单个工单操作使用 TicketID';
GO

-- 验证字段
PRINT '验证新字段...';
SELECT 
    COLUMN_NAME AS '字段名',
    DATA_TYPE AS '数据类型',
    CHARACTER_MAXIMUM_LENGTH AS '长度',
    IS_NULLABLE AS '可空'
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'Repair_Ticket_History'
ORDER BY ORDINAL_POSITION;
GO
