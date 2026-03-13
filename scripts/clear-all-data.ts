import { prisma } from '../lib/prisma'

/**
 * ⚠️  危险脚本：清空所有表的数据（保留表结构）
 * 用于完全重置数据库，重新开始测试
 */
async function clearAllData() {
  try {
    console.log('🚨 正在清空所有数据库表...\n')
    console.log('⚠️  警告：此操作将删除所有数据，包括用户、工单、批次等！\n')

    // 步骤 1：统计当前数据
    console.log('📊 当前数据统计:')
    const stats = {
      users: await prisma.users.count(),
      devices: await prisma.device_Inventory.count(),
      products: await prisma.product_Catalog.count(),
      tickets: await prisma.repair_Tickets.count(),
      batches: await prisma.batch.count(),
      projects: await prisma.project.count(),
      customers: await prisma.customer.count(),
      systemConfig: await prisma.system_Config.count(),
      history: await prisma.repair_Ticket_History.count(),
    }

    console.log(`  - Users (用户): ${stats.users} 条`)
    console.log(`  - Device_Inventory (设备库存): ${stats.devices} 条`)
    console.log(`  - Product_Catalog (产品目录): ${stats.products} 条`)
    console.log(`  - Repair_Tickets (维修工单): ${stats.tickets} 条`)
    console.log(`  - Batch (批次): ${stats.batches} 条`)
    console.log(`  - Project (项目): ${stats.projects} 条`)
    console.log(`  - Customer (客户): ${stats.customers} 条`)
    console.log(`  - System_Config (系统配置): ${stats.systemConfig} 条`)
    console.log(`  - Repair_Ticket_History (工单历史): ${stats.history} 条\n`)

    const totalRecords = Object.values(stats).reduce((sum, count) => sum + count, 0)

    if (totalRecords === 0) {
      console.log('✅ 数据库中没有数据，无需清空')
      return
    }

    console.log('正在执行清空操作...\n')

    // 步骤 2：按依赖顺序删除数据
    console.log('🔄 正在清空 Repair_Ticket_History（工单历史）...')
    await prisma.repair_Ticket_History.deleteMany({})
    console.log('✅ 已清空\n')

    console.log('🔄 正在清空 Repair_Tickets（维修工单）...')
    await prisma.repair_Tickets.deleteMany({})
    console.log('✅ 已清空\n')

    console.log('🔄 正在清空 Batch（批次）...')
    await prisma.batch.deleteMany({})
    console.log('✅ 已清空\n')

    console.log('🔄 正在清空 Device_Inventory（设备库存）...')
    await prisma.device_Inventory.deleteMany({})
    console.log('✅ 已清空\n')

    console.log('🔄 正在清空 Product_Catalog（产品目录）...')
    await prisma.product_Catalog.deleteMany({})
    console.log('✅ 已清空\n')

    console.log('🔄 正在清空 Project（项目）...')
    await prisma.project.deleteMany({})
    console.log('✅ 已清空\n')

    console.log('🔄 正在清空 Customer（客户）...')
    await prisma.customer.deleteMany({})
    console.log('✅ 已清空\n')

    console.log('🔄 正在清空 System_Config（系统配置）...')
    await prisma.system_Config.deleteMany({})
    console.log('✅ 已清空\n')

    console.log('🔄 正在清空 Users（用户）...')
    await prisma.users.deleteMany({})
    console.log('✅ 已清空\n')

    // 步骤 3：验证结果
    const finalStats = {
      users: await prisma.users.count(),
      devices: await prisma.device_Inventory.count(),
      products: await prisma.product_Catalog.count(),
      tickets: await prisma.repair_Tickets.count(),
      batches: await prisma.batch.count(),
      projects: await prisma.project.count(),
      customers: await prisma.customer.count(),
      systemConfig: await prisma.system_Config.count(),
      history: await prisma.repair_Ticket_History.count(),
    }

    const remainingRecords = Object.values(finalStats).reduce((sum, count) => sum + count, 0)

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ 所有数据已清空！')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    console.log('📊 清空后的数据统计:')
    console.log(`  - 剩余记录总数: ${remainingRecords} 条\n`)

    if (remainingRecords === 0) {
      console.log('✅ 数据库已完全清空！')
      console.log('\n📝 下一步操作建议:')
      console.log('  1. 运行 `npx tsx scripts/create-test-users.ts` 创建测试用户')
      console.log('  2. 运行 `npx tsx scripts/seed-catalog.ts` 填充产品目录')
      console.log('  3. 上传 Excel 文件导入设备库存')
    } else {
      console.log(`⚠️  警告：数据库中仍有 ${remainingRecords} 条记录未删除`)
    }

  } catch (error: any) {
    console.error('❌ 清空数据失败:', error)
    console.error('错误详情:', error.message)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
    console.log('\n数据库连接已关闭')
  }
}

clearAllData()
  .then(() => {
    console.log('\n脚本执行完成')
    process.exit(0)
  })
  .catch((error) => {
    console.error('脚本执行失败:', error)
    process.exit(1)
  })
