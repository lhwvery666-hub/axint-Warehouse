/**
 * 重置维修工单脚本
 * 
 * 功能：
 * 1. 清除所有维修工单数据
 * 2. 清除所有批次数据
 * 3. 清除所有工单历史记录
 * 4. 清除所有工单消息
 * 5. 创建/重置工单编号序列表（从 wx00001 开始）
 * 
 * ⚠️ 警告：此操作不可逆，将删除所有维修工单相关数据！
 * 
 * 运行方式: npm run reset-tickets
 * 或: npx tsx scripts/reset-tickets-and-sequence.ts
 */

import sql from 'mssql';
import { getDbConnection } from '../lib/db-config';

async function resetTicketsAndSequence() {
  let pool: sql.ConnectionPool | null = null;

  try {
    console.log('🚀 开始执行维修工单重置操作...\n');
    
    pool = await getDbConnection();
    console.log('✅ 数据库连接成功！\n');

    // ==================== 步骤 1：统计当前数据 ====================
    
    console.log('📊 正在统计当前数据...\n');

    const ticketsCountResult = await pool.request().query(`
      SELECT COUNT(*) as count FROM [dbo].[Repair_Tickets]
    `);
    const ticketsCount = ticketsCountResult.recordset[0]?.count || 0;

    let batchesCount = 0;
    try {
      const batchesCountResult = await pool.request().query(`
        SELECT COUNT(*) as count FROM [dbo].[Batch]
      `);
      batchesCount = batchesCountResult.recordset[0]?.count || 0;
    } catch (error) {
      console.log('⚠️  提示：Batch 表不存在，跳过批次统计');
    }

    let historyCount = 0;
    try {
      const historyCountResult = await pool.request().query(`
        SELECT COUNT(*) as count FROM [dbo].[Repair_Ticket_History]
      `);
      historyCount = historyCountResult.recordset[0]?.count || 0;
    } catch (error) {
      console.log('⚠️  提示：Repair_Ticket_History 表不存在，跳过历史统计');
    }

    let messagesCount = 0;
    try {
      const messagesCountResult = await pool.request().query(`
        SELECT COUNT(*) as count FROM [dbo].[TicketMessage]
      `);
      messagesCount = messagesCountResult.recordset[0]?.count || 0;
    } catch (error) {
      console.log('⚠️  提示：TicketMessage 表不存在，跳过消息统计');
    }

    console.log('当前数据库统计：');
    console.log(`  - 维修工单 (Repair_Tickets)：${ticketsCount} 条`);
    console.log(`  - 批次 (Batch)：${batchesCount} 条`);
    console.log(`  - 工单历史 (Repair_Ticket_History)：${historyCount} 条`);
    console.log(`  - 工单消息 (TicketMessage)：${messagesCount} 条\n`);

    const totalRecords = ticketsCount + batchesCount + historyCount + messagesCount;

    if (totalRecords === 0) {
      console.log('✅ 数据库中没有工单数据，无需清除\n');
    } else {
      console.log(`⚠️  即将删除 ${totalRecords} 条记录，此操作不可逆！\n`);
    }

    // ==================== 步骤 2：按依赖顺序删除数据 ====================

    console.log('🗑️  开始清除数据...\n');

    // 2.1 删除工单消息
    if (messagesCount > 0) {
      console.log('正在删除工单消息 (TicketMessage)...');
      try {
        await pool.request().query(`
          DELETE FROM [dbo].[TicketMessage]
        `);
        console.log(`✅ 已删除 ${messagesCount} 条工单消息\n`);
      } catch (error) {
        console.log('⚠️  跳过工单消息删除\n');
      }
    }

    // 2.2 删除工单历史记录
    if (historyCount > 0) {
      console.log('正在删除工单历史记录 (Repair_Ticket_History)...');
      try {
        await pool.request().query(`
          DELETE FROM [dbo].[Repair_Ticket_History]
        `);
        console.log(`✅ 已删除 ${historyCount} 条历史记录\n`);
      } catch (error) {
        console.log('⚠️  跳过工单历史删除\n');
      }
    }

    // 2.3 删除所有维修工单
    if (ticketsCount > 0) {
      console.log('正在删除所有维修工单 (Repair_Tickets)...');
      await pool.request().query(`
        DELETE FROM [dbo].[Repair_Tickets]
      `);
      console.log(`✅ 已删除 ${ticketsCount} 个维修工单\n`);
    }

    // 2.4 删除所有批次
    if (batchesCount > 0) {
      console.log('正在删除所有批次 (Batch)...');
      try {
        await pool.request().query(`
          DELETE FROM [dbo].[Batch]
        `);
        console.log(`✅ 已删除 ${batchesCount} 个批次\n`);
      } catch (error) {
        console.log('⚠️  跳过批次删除\n');
      }
    }

    // ==================== 步骤 3：创建/重置工单编号序列表 ====================

    console.log('🔢 正在创建/重置工单编号序列表...\n');

    // 3.1 检查序列表是否存在
    const tableExistsResult = await pool.request().query(`
      SELECT OBJECT_ID('dbo.Ticket_Sequence', 'U') as tableId
    `);
    const tableExists = tableExistsResult.recordset[0]?.tableId !== null;

    if (tableExists) {
      // 删除旧的序列表
      console.log('正在删除旧的序列表...');
      await pool.request().query(`
        DROP TABLE [dbo].[Ticket_Sequence]
      `);
      console.log('✅ 已删除旧序列表\n');
    }

    // 3.2 创建新的序列表
    console.log('正在创建新序列表...');
    await pool.request().query(`
      CREATE TABLE [dbo].[Ticket_Sequence] (
        [SequenceType] NVARCHAR(50) PRIMARY KEY NOT NULL,
        [CurrentValue] INT NOT NULL DEFAULT 0,
        [Prefix] NVARCHAR(10) NOT NULL DEFAULT 'wx',
        [UpdatedAt] DATETIME2 NOT NULL DEFAULT GETDATE()
      )
    `);
    console.log('✅ 序列表创建成功\n');

    // 3.3 初始化序列值（从 0 开始，第一个工单将是 wx00001）
    console.log('正在初始化序列值...');
    await pool.request().query(`
      INSERT INTO [dbo].[Ticket_Sequence] 
        ([SequenceType], [CurrentValue], [Prefix], [UpdatedAt])
      VALUES 
        ('WorkOrder', 0, 'wx', GETDATE())
    `);
    console.log('✅ 序列值初始化成功（下一个工单编号将是 wx00001）\n');

    // ==================== 步骤 4：创建存储过程（供 API 调用） ====================

    console.log('📋 正在创建工单编号生成存储过程...\n');

    // 5.1 检查存储过程是否存在
    const procExistsResult = await pool.request().query(`
      SELECT OBJECT_ID('dbo.sp_GetNextWorkOrderNumber', 'P') as procId
    `);
    const procExists = procExistsResult.recordset[0]?.procId !== null;

    if (procExists) {
      console.log('正在删除旧的存储过程...');
      await pool.request().query(`
        DROP PROCEDURE [dbo].[sp_GetNextWorkOrderNumber]
      `);
      console.log('✅ 已删除旧存储过程\n');
    }

    // 5.2 创建新的存储过程
    console.log('正在创建新存储过程...');
    await pool.request().query(`
      CREATE PROCEDURE [dbo].[sp_GetNextWorkOrderNumber]
        @WorkOrderNumber NVARCHAR(20) OUTPUT
      AS
      BEGIN
        SET NOCOUNT ON;
        
        DECLARE @NextValue INT
        DECLARE @Prefix NVARCHAR(10)
        
        -- 获取并更新序列值（原子操作，使用事务确保并发安全）
        BEGIN TRANSACTION
        
        UPDATE [dbo].[Ticket_Sequence]
        SET 
          @NextValue = [CurrentValue] = [CurrentValue] + 1,
          @Prefix = [Prefix],
          [UpdatedAt] = GETDATE()
        WHERE [SequenceType] = 'WorkOrder'
        
        -- 生成工单编号（格式：wx00001, wx00002, ...）
        SET @WorkOrderNumber = @Prefix + RIGHT('00000' + CAST(@NextValue AS NVARCHAR), 5)
        
        COMMIT TRANSACTION
      END
    `);
    console.log('✅ 存储过程创建成功\n');

    // ==================== 步骤 6：验证结果 ====================

    console.log('🔍 正在验证结果...\n');

    // 验证工单数量
    const finalTicketsResult = await pool.request().query(`
      SELECT COUNT(*) as count FROM [dbo].[Repair_Tickets]
    `);
    const finalTicketsCount = finalTicketsResult.recordset[0]?.count || 0;

    // 验证序列表
    const sequenceResult = await pool.request().query(`
      SELECT * FROM [dbo].[Ticket_Sequence] WHERE [SequenceType] = 'WorkOrder'
    `);
    const sequence = sequenceResult.recordset[0];

    // 预览下一个工单编号（不实际生成，不消耗序列）
    const nextValue = (sequence?.CurrentValue || 0) + 1;
    const previewNumber = `${sequence?.Prefix}${nextValue.toString().padStart(5, '0')}`;

    console.log('验证结果：');
    console.log(`  - 剩余工单数量：${finalTicketsCount} 条`);
    console.log(`  - 序列当前值：${sequence?.CurrentValue}`);
    console.log(`  - 序列前缀：${sequence?.Prefix}`);
    console.log(`  - 下一个工单编号（预览）：${previewNumber}\n`);

    if (finalTicketsCount === 0 && previewNumber === 'wx00001') {
      console.log('✅ 重置成功！第一个工单编号将是：wx00001\n');
    } else {
      console.log('⚠️  重置可能未完全成功，请手动检查\n');
    }

    // ==================== 步骤 7：使用说明 ====================

    console.log('📖 使用说明：');
    console.log('');
    console.log('在创建工单的 API 中调用存储过程获取新编号：');
    console.log('');
    console.log('```typescript');
    console.log('// TypeScript 示例');
    console.log('const result = await pool.request()');
    console.log('  .output("workOrderNumber", sql.NVarChar(20))');
    console.log('  .execute("sp_GetNextWorkOrderNumber");');
    console.log('');
    console.log('const workOrderNumber = result.output.workOrderNumber;');
    console.log('console.log(workOrderNumber); // 输出：wx00001');
    console.log('```');
    console.log('');

    console.log('🎉 所有操作完成！\n');

  } catch (error: any) {
    console.error('❌ 执行失败:', error.message);
    console.error('详细错误:', error);
    process.exit(1);
  } finally {
    if (pool) {
      try {
        await pool.close();
        console.log('数据库连接已关闭');
      } catch (closeError) {
        console.error('关闭数据库连接失败:', closeError);
      }
    }
  }
}

// 执行脚本
resetTicketsAndSequence().catch((error) => {
  console.error('脚本执行失败:', error);
  process.exit(1);
});
