import { prisma } from '../lib/prisma'

interface ProductData {
  category: string
  subCategory: string
  modelName: string
  modelCode: string
  description?: string
  manufacturer?: string
}

async function seedProductCatalog() {
  try {
    console.log('正在连接数据库...')
    console.log('数据库连接成功！\n')

    // 准备所有产品数据
    const products: ProductData[] = [
      // ==================== 控制器 ====================
      // 通用选项
      {
        category: '控制器',
        subCategory: '通用',
        modelName: '通用',
        modelCode: 'CTRL-GENERAL',
        description: '通用型号',
        manufacturer: '爱克信'
      },
      // 主控制器
      {
        category: '控制器',
        subCategory: '主控制器',
        modelName: 'AX-TNC8',
        modelCode: 'CTRL-MAIN-TNC8',
        description: 'AX-TNC8 主控制器',
        manufacturer: '爱克信'
      },
      {
        category: '控制器',
        subCategory: '主控制器',
        modelName: 'AX-TNC16',
        modelCode: 'CTRL-MAIN-TNC16',
        description: 'AX-TNC16 主控制器',
        manufacturer: '爱克信'
      },
      {
        category: '控制器',
        subCategory: '主控制器',
        modelName: 'AX-TNC32',
        modelCode: 'CTRL-MAIN-TNC32',
        description: 'AX-TNC32 主控制器',
        manufacturer: '爱克信'
      },
      {
        category: '控制器',
        subCategory: '主控制器',
        modelName: 'UNC-500',
        modelCode: 'CTRL-MAIN-UNC500',
        description: 'UNC-500 主控制器',
        manufacturer: '爱克信'
      },
      {
        category: '控制器',
        subCategory: '主控制器',
        modelName: 'UNC-100',
        modelCode: 'CTRL-MAIN-UNC100',
        description: 'UNC-100 主控制器',
        manufacturer: '爱克信'
      },
      // 门禁控制器
      {
        category: '控制器',
        subCategory: '门禁控制器',
        modelName: 'AX-TRC1',
        modelCode: 'CTRL-ACCESS-TRC1',
        description: 'AX-TRC1 门禁控制器',
        manufacturer: '爱克信'
      },
      {
        category: '控制器',
        subCategory: '门禁控制器',
        modelName: 'AX-TRC2',
        modelCode: 'CTRL-ACCESS-TRC2',
        description: 'AX-TRC2 门禁控制器',
        manufacturer: '爱克信'
      },
      {
        category: '控制器',
        subCategory: '门禁控制器',
        modelName: 'AX-TRC4',
        modelCode: 'CTRL-ACCESS-TRC4',
        description: 'AX-TRC4 门禁控制器',
        manufacturer: '爱克信'
      },
      {
        category: '控制器',
        subCategory: '门禁控制器',
        modelName: 'RC-2-I',
        modelCode: 'CTRL-ACCESS-RC2I',
        description: 'RC-2-I 门禁控制器',
        manufacturer: '爱克信'
      },
      {
        category: '控制器',
        subCategory: '门禁控制器',
        modelName: 'IRC-2000',
        modelCode: 'CTRL-ACCESS-IRC2000',
        description: 'IRC-2000 门禁控制器',
        manufacturer: '爱克信'
      },
      {
        category: '控制器',
        subCategory: '门禁控制器',
        modelName: 'URC-2000',
        modelCode: 'CTRL-ACCESS-URC2000',
        description: 'URC-2000 门禁控制器',
        manufacturer: '爱克信'
      },
      // 其他控制器
      {
        category: '控制器',
        subCategory: '其他控制器',
        modelName: 'IOC-16',
        modelCode: 'CTRL-OTHER-IOC16',
        description: 'IOC-16 其他控制器',
        manufacturer: '爱克信'
      },
      {
        category: '控制器',
        subCategory: '其他控制器',
        modelName: 'EC-16',
        modelCode: 'CTRL-OTHER-EC16',
        description: 'EC-16 其他控制器',
        manufacturer: '爱克信'
      },

      // ==================== 锁具 ====================
      // 通用选项
      {
        category: '锁具',
        subCategory: '通用',
        modelName: '通用',
        modelCode: 'LOCK-GENERAL',
        description: '通用型号',
        manufacturer: '爱克信'
      },
      // 爱克信锁具
      {
        category: '锁具',
        subCategory: '爱克信',
        modelName: 'AX-ML71',
        modelCode: 'LOCK-AX-ML71',
        description: '单门磁力锁',
        manufacturer: '爱克信'
      },
      {
        category: '锁具',
        subCategory: '爱克信',
        modelName: 'AX-ML71-2',
        modelCode: 'LOCK-AX-ML71-2',
        description: '双门磁力锁',
        manufacturer: '爱克信'
      },
      {
        category: '锁具',
        subCategory: '爱克信',
        modelName: 'AX-BL71',
        modelCode: 'LOCK-AX-BL71',
        description: '电插锁',
        manufacturer: '爱克信'
      },
      {
        category: '锁具',
        subCategory: '爱克信',
        modelName: 'AX-SL20',
        modelCode: 'LOCK-AX-SL20',
        description: '阴极锁',
        manufacturer: '爱克信'
      },
      {
        category: '锁具',
        subCategory: '爱克信',
        modelName: 'AX-DL07',
        modelCode: 'LOCK-AX-DL07',
        description: '机电锁',
        manufacturer: '爱克信'
      },
      {
        category: '锁具',
        subCategory: '爱克信',
        modelName: 'AX-ML71-SS',
        modelCode: 'LOCK-AX-ML71-SS',
        description: '单门不锈钢锁',
        manufacturer: '爱克信'
      },
      {
        category: '锁具',
        subCategory: '爱克信',
        modelName: 'AX-ML71-2-SS',
        modelCode: 'LOCK-AX-ML71-2-SS',
        description: '双门不锈钢锁',
        manufacturer: '爱克信'
      },

      // ==================== 生物识别 ====================
      // 通用选项
      {
        category: '生物识别',
        subCategory: '通用',
        modelName: '通用',
        modelCode: 'BIO-GENERAL',
        description: '通用型号',
        manufacturer: '爱克信'
      },
      // 人脸机
      {
        category: '生物识别',
        subCategory: '人脸机',
        modelName: 'R100',
        modelCode: 'BIO-FACE-R100',
        description: 'R100 人脸识别设备',
        manufacturer: '爱克信'
      },
      {
        category: '生物识别',
        subCategory: '人脸机',
        modelName: 'AX-7CW',
        modelCode: 'BIO-FACE-AX7CW',
        description: 'AX-7CW 人脸识别设备',
        manufacturer: '爱克信'
      },
      // 指纹机
      {
        category: '生物识别',
        subCategory: '指纹机',
        modelName: 'AX-BR01',
        modelCode: 'BIO-FP-BR01',
        description: 'AX-BR01 指纹识别设备',
        manufacturer: '爱克信'
      },
      {
        category: '生物识别',
        subCategory: '指纹机',
        modelName: 'AX-BR02',
        modelCode: 'BIO-FP-BR02',
        description: 'AX-BR02 指纹识别设备',
        manufacturer: '爱克信'
      },
      {
        category: '生物识别',
        subCategory: '指纹机',
        modelName: 'AX-BR03',
        modelCode: 'BIO-FP-BR03',
        description: 'AX-BR03 指纹识别设备',
        manufacturer: '爱克信'
      },

      // ==================== 读卡器 ====================
      // 通用选项
      {
        category: '读卡器',
        subCategory: '通用',
        modelName: '通用',
        modelCode: 'READER-GENERAL',
        description: '通用型号',
        manufacturer: '爱克信'
      },
      // 读卡器
      {
        category: '读卡器',
        subCategory: '读卡器',
        modelName: 'AX-7CW',
        modelCode: 'READER-CARD-AX7CW',
        description: 'AX-7CW 读卡器',
        manufacturer: '爱克信'
      },
      {
        category: '读卡器',
        subCategory: '读卡器',
        modelName: 'AX-7CW/pin',
        modelCode: 'READER-CARD-AX7CW-PIN',
        description: 'AX-7CW/pin 读卡器（带密码）',
        manufacturer: '爱克信'
      },
      {
        category: '读卡器',
        subCategory: '读卡器',
        modelName: 'AX-R86',
        modelCode: 'READER-CARD-R86',
        description: 'AX-R86 读卡器',
        manufacturer: '爱克信'
      },
      {
        category: '读卡器',
        subCategory: '读卡器',
        modelName: 'AX-RK86',
        modelCode: 'READER-CARD-RK86',
        description: 'AX-RK86 读卡器',
        manufacturer: '爱克信'
      },
      // 发卡器
      {
        category: '读卡器',
        subCategory: '发卡器',
        modelName: 'AX-CER',
        modelCode: 'READER-ENCODER-CER',
        description: 'AX-CER 发卡器',
        manufacturer: '爱克信'
      },
      {
        category: '读卡器',
        subCategory: '发卡器',
        modelName: 'AX-7CW/mp',
        modelCode: 'READER-ENCODER-AX7CW-MP',
        description: 'AX-7CW/mp 发卡器',
        manufacturer: '爱克信'
      },
      {
        category: '读卡器',
        subCategory: '发卡器',
        modelName: 'AX-7CW/FP',
        modelCode: 'READER-ENCODER-AX7CW-FP',
        description: 'AX-7CW/FP 发卡器',
        manufacturer: '爱克信'
      },
      // 二维码
      {
        category: '读卡器',
        subCategory: '二维码',
        modelName: 'AX-R800',
        modelCode: 'READER-QR-R800',
        description: 'AX-R800 二维码读取器',
        manufacturer: '爱克信'
      },

      // ==================== 开关配件 ====================
      // 通用选项
      {
        category: '开关配件',
        subCategory: '通用',
        modelName: '通用',
        modelCode: 'ACCESSORY-GENERAL',
        description: '通用型号',
        manufacturer: '爱克信'
      },
      // 开关
      {
        category: '开关配件',
        subCategory: '开关',
        modelName: 'AX-EB51',
        modelCode: 'ACCESSORY-SWITCH-EB51',
        description: 'AX-EB51 开关',
        manufacturer: '爱克信'
      },
      {
        category: '开关配件',
        subCategory: '开关',
        modelName: 'KF102',
        modelCode: 'ACCESSORY-SWITCH-KF102',
        description: 'KF102 开关',
        manufacturer: '爱克信'
      },
      // 电源
      {
        category: '开关配件',
        subCategory: '电源',
        modelName: '通用电源',
        modelCode: 'ACCESSORY-POWER-GENERAL',
        description: '通用电源',
        manufacturer: '爱克信'
      },
      // 空开
      {
        category: '开关配件',
        subCategory: '空开',
        modelName: '通用空开',
        modelCode: 'ACCESSORY-BREAKER-GENERAL',
        description: '通用空开',
        manufacturer: '爱克信'
      }
    ]

    console.log(`准备导入 ${products.length} 个产品型号...\n`)

    let created = 0
    let skipped = 0

    // 使用事务批量处理
    for (const product of products) {
      try {
        // 检查是否已存在相同的 modelCode
        const existing = await prisma.product_Catalog.findFirst({
          where: {
            modelCode: product.modelCode
          }
        })

        if (existing) {
          console.log(`⏭️  跳过（已存在）: ${product.category} > ${product.subCategory} > ${product.modelName}`)
          skipped++
        } else {
          await prisma.product_Catalog.create({
            data: {
              category: product.category,
              subCategory: product.subCategory,
              modelName: product.modelName,
              modelCode: product.modelCode,
              description: product.description || '',
              manufacturer: product.manufacturer || '爱克信',
              defaultWarrantyMonths: 12,
              isActive: true
            }
          })
          console.log(`✅ 已创建: ${product.category} > ${product.subCategory} > ${product.modelName}`)
          created++
        }
      } catch (error: any) {
        console.error(`❌ 导入失败: ${product.modelName}`, error.message)
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ 产品目录数据填充完成！')
    console.log(`   - 成功创建: ${created} 个`)
    console.log(`   - 跳过（已存在）: ${skipped} 个`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    // 显示统计信息
    const categories = await prisma.product_Catalog.groupBy({
      by: ['category'],
      _count: true
    })

    console.log('按类别统计:')
    for (const cat of categories) {
      console.log(`  - ${cat.category}: ${cat._count} 个型号`)
    }

  } catch (error: any) {
    console.error('❌ 数据填充失败:', error)
    console.error('错误详情:', error.message)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
    console.log('\n数据库连接已关闭')
  }
}

seedProductCatalog()
  .then(() => {
    console.log('脚本执行完成')
    process.exit(0)
  })
  .catch((error) => {
    console.error('脚本执行失败:', error)
    process.exit(1)
  })
