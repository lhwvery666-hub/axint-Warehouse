/**
 * 数据库清理脚本：清除所有工单数据
 * 用途：测试前清空所有工单相关数据
 * 
 * ⚠️ 警告：此操作不可逆！请谨慎使用！
 * 
 * 运行方式：npx tsx scripts/clear-all-tickets.ts
 */

import { getDbConnection } from '../lib/db-config';
import { PrismaClient } from '@prisma/client';
import * as readline from 'readline';

const prisma = new PrismaClient();

// 创建命令行交互接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 询问用户确认
function askConfirmation(): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question('⚠️  确定要清除所有工单数据吗？此操作不可逆！(输入 YES 确认): ', (answer) => {
      rl.close();
      resolve(answer.trim() === 'YES');
    });
  });
}

async function clearAllTickets() {
  try {
    console.log('🧹 准备清理所有工单数据...\n');

    // 第一步：询问确认
    const confirmed = await askConfirmation();
    
    if (!confirmed) {
      console.log('❌ 已取消清理操作');
      return;
    }

    console.log('\n🚀 开始清理...\n');

    const pool = await getDbConnection();

    // 1. 清除工单聊天消息（TicketMessage）
    try {
      console.log('📨 清理工单聊天消息...');
      await prisma.ticketMessage.deleteMany({});
      console.log('✅ 工单聊天消息清理完成');
    } catch (error) {
      console.warn('⚠️  清理聊天消息失败（表可能不存在）:', error);
    }

    // 2. 清除工单历史记录（Repair_Ticket_History）
    try {
      console.log('📝 清理工单历史记录...');
      const historyResult = await pool.request().query(`
        DELETE FROM Repair_Ticket_History
      `);
      console.log(`✅ 清理了 ${historyResult.rowsAffected[0]} 条历史记录`);
    } catch (error) {
      console.warn('⚠️  清理历史记录失败:', error);
    }

    // 3. 清除客户历史记录（Customer_History）
    try {
      console.log('👥 清理客户历史记录...');
      const customerHistoryResult = await pool.request().query(`
        DELETE FROM Customer_History
      `);
      console.log(`✅ 清理了 ${customerHistoryResult.rowsAffected[0]} 条客户历史记录`);
    } catch (error) {
      console.warn('⚠️  清理客户历史记录失败:', error);
    }

    // 4. 清除主工单表（Repair_Tickets）
    try {
      console.log('🎫 清理主工单表...');
      const ticketsResult = await pool.request().query(`
        DELETE FROM Repair_Tickets
      `);
      console.log(`✅ 清理了 ${ticketsResult.rowsAffected[0]} 条工单记录`);
    } catch (error) {
      console.error('❌ 清理主工单表失败:', error);
      throw error;
    }

    // 5. 清除新工单表（Repair_Tickets_New，如果存在）
    try {
      console.log('🆕 清理新工单表...');
      const ticketsNewResult = await pool.request().query(`
        DELETE FROM Repair_Tickets_New
      `);
      console.log(`✅ 清理了 ${ticketsNewResult.rowsAffected[0]} 条新工单记录`);
    } catch (error) {
      console.warn('⚠️  清理新工单表失败（表可能不存在）:', error);
    }

    // 6. 重置自增ID（可选）
    try {
      console.log('🔄 重置主工单表自增ID...');
      await pool.request().query(`
        DBCC CHECKIDENT ('Repair_Tickets', RESEED, 0)
      `);
      console.log('✅ 主工单表自增ID已重置');
    } catch (error) {
      console.warn('⚠️  重置自增ID失败:', error);
    }

    try {
      console.log('🔄 重置历史记录表自增ID...');
      await pool.request().query(`
        DBCC CHECKIDENT ('Repair_Ticket_History', RESEED, 0)
      `);
      console.log('✅ 历史记录表自增ID已重置');
    } catch (error) {
      console.warn('⚠️  重置历史记录表自增ID失败:', error);
    }

    try {
      console.log('🔄 重置聊天消息表自增ID...');
      await pool.request().query(`
        DBCC CHECKIDENT ('TicketMessage', RESEED, 0)
      `);
      console.log('✅ 聊天消息表自增ID已重置');
    } catch (error) {
      console.warn('⚠️  重置聊天消息表自增ID失败:', error);
    }

    console.log('\n🎉 所有工单数据清理完成！\n');
    console.log('📊 清理统计:');
    console.log('  - 工单记录: 已清空');
    console.log('  - 历史记录: 已清空');
    console.log('  - 聊天消息: 已清空');
    console.log('  - 客户历史: 已清空');
    console.log('  - 自增ID: 已重置\n');

  } catch (error: any) {
    console.error('\n❌ 清理失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 执行清理
clearAllTickets()
  .then(() => {
    console.log('✅ 脚本执行成功');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  });
