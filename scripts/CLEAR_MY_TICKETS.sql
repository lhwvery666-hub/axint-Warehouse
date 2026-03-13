-- ========================================
-- 删除指定用户创建的所有维修工单
-- 用途: 清理测试数据
-- ========================================

-- ⚠️ 请根据实际情况修改以下变量
DECLARE @UserName NVARCHAR(100) = '李现场';  -- 修改为您的用户名
DECLARE @UserId INT;

-- 获取用户ID
SELECT @UserId = Id FROM Users WHERE Username = @UserName OR RealName = @UserName;

IF @UserId IS NULL
BEGIN
    PRINT '❌ 未找到用户: ' + @UserName;
    PRINT '请检查用户名是否正确';
    RETURN;
END

PRINT '========================================';
PRINT '用户信息:';
PRINT '  用户ID: ' + CAST(@UserId AS NVARCHAR(20));
PRINT '  用户名: ' + @UserName;
PRINT '========================================';
PRINT '';

-- 统计要删除的数据
DECLARE @TicketCount INT;
DECLARE @BatchCount INT;

SELECT @TicketCount = COUNT(*) 
FROM Repair_Tickets 
WHERE ReportByUserID = @UserId;

SELECT @BatchCount = COUNT(DISTINCT BatchId) 
FROM Repair_Tickets 
WHERE ReportByUserID = @UserId;

PRINT '将要删除的数据:';
PRINT '  工单数量: ' + CAST(@TicketCount AS NVARCHAR(20));
PRINT '  批次数量: ' + CAST(@BatchCount AS NVARCHAR(20));
PRINT '';

IF @TicketCount = 0
BEGIN
    PRINT '✅ 该用户没有创建任何工单';
    RETURN;
END

-- 显示将要删除的批次
PRINT '将要删除的批次:';
SELECT DISTINCT 
    BatchId AS '批次ID',
    ProjectName AS '项目名称',
    COUNT(*) AS '设备数量',
    MAX(Status) AS '状态',
    MAX(CreatedAt) AS '创建时间'
FROM Repair_Tickets
WHERE ReportByUserID = @UserId
GROUP BY BatchId, ProjectName
ORDER BY MAX(CreatedAt) DESC;

PRINT '';
PRINT '========================================';
PRINT '⚠️  确认要删除吗？';
PRINT '========================================';
PRINT '';
PRINT '如果确认，请继续执行下面的删除操作...';
PRINT '';

-- ========================================
-- 开始删除操作
-- ========================================
BEGIN TRANSACTION;

BEGIN TRY
    -- 1. 删除该用户工单的历史记录
    DELETE FROM Repair_Ticket_History
    WHERE BatchId IN (
        SELECT DISTINCT BatchId 
        FROM Repair_Tickets 
        WHERE ReportByUserID = @UserId
    );
    
    PRINT '✅ 已删除工单历史记录';

    -- 2. 删除该用户的工单
    DELETE FROM Repair_Tickets
    WHERE ReportByUserID = @UserId;
    
    PRINT '✅ 已删除工单: ' + CAST(@TicketCount AS NVARCHAR(20)) + ' 条';

    -- 提交事务
    COMMIT TRANSACTION;
    
    PRINT '';
    PRINT '========================================';
    PRINT '✅ 删除完成！';
    PRINT '========================================';
    
    -- 验证结果
    DECLARE @RemainingCount INT;
    SELECT @RemainingCount = COUNT(*) 
    FROM Repair_Tickets 
    WHERE ReportByUserID = @UserId;
    
    PRINT '';
    PRINT '验证结果: 剩余 ' + CAST(@RemainingCount AS NVARCHAR(20)) + ' 条工单';
    
END TRY
BEGIN CATCH
    -- 回滚事务
    ROLLBACK TRANSACTION;
    
    PRINT '';
    PRINT '========================================';
    PRINT '❌ 删除失败！';
    PRINT '========================================';
    PRINT '';
    PRINT '错误信息:';
    PRINT '  ' + ERROR_MESSAGE();
    PRINT '';
    
END CATCH;
