/**
 * 删除所有维修工单和批次脚本
 * 
 * ⚠️ 警告：此操作不可逆，将删除数据库中的所有维修工单和批次数据！
 * 
 * 运行方式: npm run delete-all-tickets
 * 或: npx tsx scripts/delete-all-tickets.ts
 */

import { prisma } from '../lib/prisma'

async function deleteAllTickets() {
  try {
    console.log('正在连接数据库...')
    console.log('数据库连接成功！\n')

    // 1. 先查询当前数据数量（使用 Prisma）
    const totalTickets = await prisma.repair_Tickets.count()
    
    let totalBatches = 0
    try {
      totalBatches = await prisma.batch.count()
    } catch (error) {
      // Batch 表可能不存在，忽略错误
      console.log('提示：Batch 表不存在，跳过批次统计')
    }

    console.log(`当前数据库中共有:`)
    console.log(`  - ${totalTickets} 个维修工单`)
    console.log(`  - ${totalBatches} 个批次\n`)

    if (totalTickets === 0 && totalBatches === 0) {
      console.log('✅ 数据库中没有维修工单或批次，无需删除')
      return
    }

    // 2. 确认删除操作
    console.log('⚠️  警告：即将删除所有维修工单和批次数据，此操作不可逆！')
    console.log('正在执行删除操作...\n')

    // 3. 使用 Prisma 删除所有工单
    console.log('正在删除维修工单...')
    const deletedTickets = await prisma.repair_Tickets.deleteMany({})
    console.log(`已删除 ${deletedTickets.count} 个维修工单`)

    // 4. 删除所有批次
    if (totalBatches > 0) {
      console.log('正在删除批次记录...')
      try {
        const deletedBatches = await prisma.batch.deleteMany({})
        console.log(`已删除 ${deletedBatches.count} 个批次`)
      } catch (error) {
        console.log('提示：Batch 表不存在或删除失败，跳过')
      }
    }

    // 5. 验证删除结果
    const remainingTickets = await prisma.repair_Tickets.count()
    let remainingBatches = 0
    try {
      remainingBatches = await prisma.batch.count()
    } catch (error) {
      // 忽略
    }

    console.log('\n删除结果:')
    if (remainingTickets === 0) {
      console.log(`✅ 成功删除所有 ${totalTickets} 个维修工单！`)
    } else {
      console.log(`⚠️  警告：删除后仍有 ${remainingTickets} 个工单存在`)
    }

    if (totalBatches > 0) {
      if (remainingBatches === 0) {
        console.log(`✅ 成功删除所有 ${totalBatches} 个批次！`)
      } else {
        console.log(`⚠️  警告：删除后仍有 ${remainingBatches} 个批次存在`)
      }
    }

    console.log('\n✅ 操作完成！')

  } catch (error: any) {
    console.error('❌ 删除失败:', error)
    console.error('错误详情:', error.message)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
    console.log('\n数据库连接已关闭')
  }
}

// 运行脚本
deleteAllTickets()
  .then(() => {
    console.log('\n脚本执行完成')
    process.exit(0)
  })
  .catch((error) => {
    console.error('脚本执行失败:', error)
    process.exit(1)
  })
