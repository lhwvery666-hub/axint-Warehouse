import { prisma } from '../lib/prisma'

async function clearImportData() {
  try {
    console.log('🗑️  正在清空导入数据...\n')

    // 步骤 1：统计当前数据
    console.log('📊 当前数据统计:')
    const deviceCount = await prisma.device_Inventory.count()
    const autoImportedProducts = await prisma.product_Catalog.count({
      where: {
        category: '未分类'
      }
    })
    const totalProducts = await prisma.product_Catalog.count()

    console.log(`  - Device_Inventory (设备库存): ${deviceCount} 条`)
    console.log(`  - Product_Catalog (自动导入型号): ${autoImportedProducts} 条`)
    console.log(`  - Product_Catalog (总型号数): ${totalProducts} 条\n`)

    if (deviceCount === 0 && autoImportedProducts === 0) {
      console.log('✅ 数据库中没有导入数据，无需清空')
      return
    }

    console.log('⚠️  警告：即将删除所有导入的数据，此操作不可逆！')
    console.log('正在执行清空操作...\n')

    // 步骤 2：清空 Device_Inventory 表
    if (deviceCount > 0) {
      console.log('🔄 正在清空 Device_Inventory 表...')
      const deletedDevices = await prisma.device_Inventory.deleteMany({})
      console.log(`✅ 已删除 ${deletedDevices.count} 条设备记录\n`)
    }

    // 步骤 3：清空自动导入的 Product_Catalog 数据（category = '未分类'）
    if (autoImportedProducts > 0) {
      console.log('🔄 正在清空自动导入的产品型号（category = "未分类"）...')
      const deletedProducts = await prisma.product_Catalog.deleteMany({
        where: {
          category: '未分类'
        }
      })
      console.log(`✅ 已删除 ${deletedProducts.count} 个自动导入的型号\n`)
    }

    // 步骤 4：验证结果
    const remainingDevices = await prisma.device_Inventory.count()
    const remainingAutoProducts = await prisma.product_Catalog.count({
      where: {
        category: '未分类'
      }
    })
    const remainingTotalProducts = await prisma.product_Catalog.count()

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ 清空完成！')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    console.log('📊 清空后的数据统计:')
    console.log(`  - Device_Inventory (设备库存): ${remainingDevices} 条`)
    console.log(`  - Product_Catalog (自动导入型号): ${remainingAutoProducts} 条`)
    console.log(`  - Product_Catalog (手动维护型号): ${remainingTotalProducts - remainingAutoProducts} 条`)
    console.log(`  - Product_Catalog (总型号数): ${remainingTotalProducts} 条\n`)

    if (remainingDevices === 0) {
      console.log('✅ Device_Inventory 表已清空，可以开始测试上传！')
    } else {
      console.log(`⚠️  警告：Device_Inventory 表中仍有 ${remainingDevices} 条记录`)
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

clearImportData()
  .then(() => {
    console.log('\n脚本执行完成')
    process.exit(0)
  })
  .catch((error) => {
    console.error('脚本执行失败:', error)
    process.exit(1)
  })
