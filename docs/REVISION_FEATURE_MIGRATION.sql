-- =====================================================
-- 退回修改功能 - 数据库迁移脚本
-- 创建日期: 2026-02-28
-- 功能说明: 支持下游环节退回工单给报告人修改，并保留历史数据
-- =====================================================

USE [your_database_name];
GO

-- 检查并添加字段：退回修改请求人
IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Repair_Tickets' AND COLUMN_NAME = 'RevisionRequestedBy'
)
BEGIN
    ALTER TABLE Repair_Tickets 
    ADD RevisionRequestedBy NVARCHAR(100) NULL;
    PRINT '✅ 已添加字段: RevisionRequestedBy';
END
ELSE
BEGIN
    PRINT '⚠️ 字段已存在: RevisionRequestedBy';
END
GO

-- 检查并添加字段：退回原因
IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Repair_Tickets' AND COLUMN_NAME = 'RevisionRequestReason'
)
BEGIN
    ALTER TABLE Repair_Tickets 
    ADD RevisionRequestReason NVARCHAR(500) NULL;
    PRINT '✅ 已添加字段: RevisionRequestReason';
END
ELSE
BEGIN
    PRINT '⚠️ 字段已存在: RevisionRequestReason';
END
GO

-- 检查并添加字段：退回时间
IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Repair_Tickets' AND COLUMN_NAME = 'RevisionRequestDate'
)
BEGIN
    ALTER TABLE Repair_Tickets 
    ADD RevisionRequestDate DATETIME NULL;
    PRINT '✅ 已添加字段: RevisionRequestDate';
END
ELSE
BEGIN
    PRINT '⚠️ 字段已存在: RevisionRequestDate';
END
GO

-- 检查并添加字段：退回次数
IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Repair_Tickets' AND COLUMN_NAME = 'RevisionCount'
)
BEGIN
    ALTER TABLE Repair_Tickets 
    ADD RevisionCount INT NOT NULL DEFAULT 0;
    PRINT '✅ 已添加字段: RevisionCount';
END
ELSE
BEGIN
    PRINT '⚠️ 字段已存在: RevisionCount';
END
GO

-- 验证字段是否添加成功
SELECT 
    COLUMN_NAME AS '字段名', 
    DATA_TYPE AS '数据类型', 
    CHARACTER_MAXIMUM_LENGTH AS '长度',
    IS_NULLABLE AS '可空'
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'Repair_Tickets' 
    AND COLUMN_NAME IN ('RevisionRequestedBy', 'RevisionRequestReason', 'RevisionRequestDate', 'RevisionCount')
ORDER BY ORDINAL_POSITION;
GO

PRINT '===================================';
PRINT '✅ 退回修改功能数据库迁移完成！';
PRINT '===================================';
GO
