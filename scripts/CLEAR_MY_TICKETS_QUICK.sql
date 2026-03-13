-- ========================================
-- 快速删除当前用户的所有工单（简化版）
-- ========================================

-- 修改这里：填入您的用户名
DECLARE @UserName NVARCHAR(100) = '李现场';

-- 获取用户ID
DECLARE @UserId INT;
SELECT @UserId = Id FROM Users WHERE Username = @UserName OR RealName = @UserName;

-- 删除历史记录
DELETE FROM Repair_Ticket_History
WHERE BatchId IN (
    SELECT DISTINCT BatchId 
    FROM Repair_Tickets 
    WHERE ReportByUserID = @UserId
);

-- 删除工单
DELETE FROM Repair_Tickets
WHERE ReportByUserID = @UserId;

-- 显示结果
PRINT '✅ 删除完成！';

-- 验证
SELECT COUNT(*) AS '剩余工单数' 
FROM Repair_Tickets 
WHERE ReportByUserID = @UserId;
