-- ========================================
-- 清空所有维修工单数据
-- 创建日期: 2026-02-28
-- ⚠️ 警告: 此脚本将删除所有工单数据，请谨慎使用！
-- ========================================

-- 使用数据库
USE [axiom_repair_db];  -- 请替换为实际的数据库名称
GO

PRINT '========================================';
PRINT '开始清空维修工单数据...';
PRINT '========================================';
PRINT '';

-- ========================================
-- 1. 备份提示
-- ========================================
PRINT '⚠️  建议在执行前备份数据库！';
PRINT '   备份命令: BACKUP DATABASE [axiom_repair_db] TO DISK = ''C:\Backup\axiom_repair_db_backup.bak''';
PRINT '';
PRINT '如果您已经备份，请继续执行下面的清空操作。';
PRINT '';

-- ========================================
-- 2. 检查数据量
-- ========================================
DECLARE @TicketCount INT;
DECLARE @HistoryCount INT;

SELECT @TicketCount = COUNT(*) FROM Repair_Tickets;
SELECT @HistoryCount = COUNT(*) FROM Repair_Ticket_History;

PRINT '当前数据统计:';
PRINT '  - 工单数量: ' + CAST(@TicketCount AS NVARCHAR(20));
PRINT '  - 历史记录数量: ' + CAST(@HistoryCount AS NVARCHAR(20));
PRINT '';

-- ========================================
-- 3. 开始清空操作（使用事务）
-- ========================================
BEGIN TRANSACTION;

BEGIN TRY
    PRINT '开始清空操作...';
    PRINT '';

    -- 3.1 删除工单历史记录
    PRINT '1. 清空工单历史记录 (Repair_Ticket_History)...';
    DELETE FROM Repair_Ticket_History;
    PRINT '   ✅ 已删除 ' + CAST(@HistoryCount AS NVARCHAR(20)) + ' 条历史记录';
    PRINT '';

    -- 3.2 删除所有工单
    PRINT '2. 清空维修工单 (Repair_Tickets)...';
    DELETE FROM Repair_Tickets;
    PRINT '   ✅ 已删除 ' + CAST(@TicketCount AS NVARCHAR(20)) + ' 条工单记录';
    PRINT '';

    -- 3.3 重置自增ID（可选）
    PRINT '3. 重置自增ID...';
    DBCC CHECKIDENT ('Repair_Tickets', RESEED, 0);
    DBCC CHECKIDENT ('Repair_Ticket_History', RESEED, 0);
    PRINT '   ✅ 自增ID已重置';
    PRINT '';

    -- 提交事务
    COMMIT TRANSACTION;

    PRINT '';
    PRINT '========================================';
    PRINT '✅ 清空操作完成！';
    PRINT '========================================';
    PRINT '';
    PRINT '已清空数据:';
    PRINT '  - 工单: ' + CAST(@TicketCount AS NVARCHAR(20)) + ' 条';
    PRINT '  - 历史记录: ' + CAST(@HistoryCount AS NVARCHAR(20)) + ' 条';
    PRINT '';
    PRINT '保留数据:';
    PRINT '  - 用户账户';
    PRINT '  - 设备型号库';
    PRINT '  - 系统配置';
    PRINT '';

END TRY
BEGIN CATCH
    -- 回滚事务
    ROLLBACK TRANSACTION;

    PRINT '';
    PRINT '========================================';
    PRINT '❌ 清空操作失败！';
    PRINT '========================================';
    PRINT '';
    PRINT '错误信息:';
    PRINT '  错误号: ' + CAST(ERROR_NUMBER() AS NVARCHAR(20));
    PRINT '  错误消息: ' + ERROR_MESSAGE();
    PRINT '  错误行: ' + CAST(ERROR_LINE() AS NVARCHAR(20));
    PRINT '';
    PRINT '数据已回滚，未做任何修改。';
    PRINT '';
END CATCH;

-- ========================================
-- 4. 验证清空结果
-- ========================================
PRINT '';
PRINT '验证清空结果:';
SELECT 
    COUNT(*) AS RemainingTickets 
FROM Repair_Tickets;

SELECT 
    COUNT(*) AS RemainingHistory 
FROM Repair_Ticket_History;

PRINT '';
PRINT '如果上面显示的数量都是 0，说明清空成功！';
PRINT '';

GO

-- ========================================
-- 可选：清空上传的文件记录（如果有独立的文件表）
-- ========================================
-- 如果您的系统有独立的文件上传记录表，可以取消下面的注释
/*
PRINT '清空文件上传记录...';
DELETE FROM File_Uploads WHERE RelatedTable = 'Repair_Tickets';
PRINT '✅ 文件上传记录已清空';
*/
