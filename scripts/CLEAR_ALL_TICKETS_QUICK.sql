-- ========================================
-- 快速清空所有维修工单（简化版）
-- ⚠️ 警告: 此脚本将立即删除所有工单数据！
-- ========================================

-- 1. 删除历史记录
DELETE FROM Repair_Ticket_History;

-- 2. 删除所有工单
DELETE FROM Repair_Tickets;

-- 3. 重置自增ID
DBCC CHECKIDENT ('Repair_Tickets', RESEED, 0);
DBCC CHECKIDENT ('Repair_Ticket_History', RESEED, 0);

-- 4. 验证结果
SELECT COUNT(*) AS '剩余工单数' FROM Repair_Tickets;
SELECT COUNT(*) AS '剩余历史记录数' FROM Repair_Ticket_History;

PRINT '✅ 清空完成！';
