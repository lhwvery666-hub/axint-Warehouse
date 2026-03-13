/**
 * 数据库清理脚本（安全版）：仅清除测试工单数据
 * 用途：保留用户数据，只清除工单相关数据
 * 
 * 与 clear-all-tickets.ts 的区别：
 * - 不会清除用户表（Users）
 * - 不会清除设备库存（Device_Inventory）
 * - 不会清除产品目录（Product_Catalog）
 * - 不会清除项目和客户信息（Project、Customer、Batch）
 * 
 * 运行方式：npx tsx scripts/clear-tickets-safe.ts
 */

import { getDbConnection } from '../lib/db-config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearTicketsSafe() {
  try {
    console.log('🧹 开始清理工单数据（安全模式）...\n');
    console.log('ℹ️  此脚本将清除：');
    console.log('  ✓ 工单记录');
    console.log('  ✓ 工单历史');
    console.log('  ✓ 工单聊天消息');
    console.log('  ✓ 客户历史记录\n');
    console.log('ℹ️  此脚本将保留：');
    console.log('  ✓ 用户账号');
    console.log('  ✓ 设备库存');
    console.log('  ✓ 产品目录');
    console.log('  ✓ 项目和客户信息\n');

    const pool = await getDbConnection();
    let totalDeleted = 0;

    // 1. 清除工单聊天消息
    try {
      console.log('📨 清理工单聊天消息...');
      const result = await prisma.ticketMessage.deleteMany({});
      console.log(`✅ 清理了 ${result.count} 条聊天消息`);
      totalDeleted += result.count;
    } catch (error) {
      console.warn('⚠️  清理聊天消息失败（表可能不存在）');
    }

    // 2. 清除工单历史记录
    try {
      console.log('📝 清理工单历史记录...');
      const result = await pool.request().query(`
        DELETE FROM Repair_Ticket_History
      `);
      const count = result.rowsAffected[0] || 0;
      console.log(`✅ 清理了 ${count} 条历史记录`);
      totalDeleted += count;
    } catch (error) {
      console.warn('⚠️  清理历史记录失败');
    }

    // 3. 清除客户历史记录
    try {
      console.log('👥 清理客户历史记录...');
      const result = await pool.request().query(`
        DELETE FROM Customer_History
      `);
      const count = result.rowsAffected[0] || 0;
      console.log(`✅ 清理了 ${count} 条客户历史`);
      totalDeleted += count;
    } catch (error) {
      console.warn('⚠️  清理客户历史失败');
    }

    // 4. 清除主工单表
    try {
      console.log('🎫 清理主工单表...');
      const result = await pool.request().query(`
        DELETE FROM Repair_Tickets
      `);
      const count = result.rowsAffected[0] || 0;
      console.log(`✅ 清理了 ${count} 条工单`);
      totalDeleted += count;
    } catch (error) {
      console.error('❌ 清理主工单表失败:', error);
      throw error;
    }

    // 5. 清除新工单表（如果存在）
    try {
      console.log('🆕 清理新工单表...');
      const result = await pool.request().query(`
        DELETE FROM Repair_Tickets_New
      `);
      const count = result.rowsAffected[0] || 0;
      console.log(`✅ 清理了 ${count} 条新工单`);
      totalDeleted += count;
    } catch (error) {
      console.warn('⚠️  新工单表不存在，跳过');
    }

    // 6. 重置自增ID
    const tables = ['Repair_Tickets', 'Repair_Ticket_History', 'TicketMessage'];
    for (const table of tables) {
      try {
        await pool.request().query(`
          DBCC CHECKIDENT ('${table}', RESEED, 0)
        `);
        console.log(`✅ ${table} 自增ID已重置`);
      } catch (error) {
        console.warn(`⚠️  ${table} 重置ID失败（表可能不存在）`);
      }
    }

    console.log('\n🎉 工单数据清理完成！');
    console.log(`📊 共清理了 ${totalDeleted} 条记录\n`);

  } catch (error: any) {
    console.error('\n❌ 清理失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 执行清理
clearTicketsSafe()
  .then(() => {
    console.log('✅ 脚本执行成功');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  });
