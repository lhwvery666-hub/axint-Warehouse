/**
 * 快速修复 Repair_Tickets 的 Id 列
 * 直接执行SQL添加IDENTITY
 */

import { getDbConnection } from '../lib/db-config'
import * as fs from 'fs'
import * as path from 'path'

async function quickFix() {
  console.log('🔧 快速修复 Repair_Tickets 的 Id 列...\n')

  try {
    const pool = await getDbConnection()

    // 读取SQL文件
    const sqlPath = path.join(__dirname, 'add-identity-to-id.sql')
    const sqlContent = fs.readFileSync(sqlPath, 'utf-8')

    // 分割SQL语句（按GO分割）
    const sqlStatements = sqlContent
      .split(/\nGO\n/gi)
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--') && !s.startsWith('USE'))

    console.log(`📝 准备执行 ${sqlStatements.length} 条SQL语句\n`)

    // 逐条执行
    for (let i = 0; i < sqlStatements.length; i++) {
      const statement = sqlStatements[i]
      if (!statement) continue

      try {
        const result = await pool.request().query(statement)
        
        if (result.recordset && result.recordset.length > 0) {
          console.log(`✅ 步骤 ${i + 1}:`)
          console.table(result.recordset)
        } else if (result.rowsAffected && result.rowsAffected[0] > 0) {
          console.log(`✅ 步骤 ${i + 1}: 影响 ${result.rowsAffected[0]} 行`)
        } else {
          console.log(`✅ 步骤 ${i + 1}: 执行成功`)
        }
      } catch (err: any) {
        console.error(`❌ 步骤 ${i + 1} 失败:`, err.message)
        console.log('SQL:', statement.substring(0, 100) + '...')
      }
    }

    console.log('\n✅ 修复完成！')
    console.log('📝 请重启开发服务器以应用更改')

  } catch (error: any) {
    console.error('\n❌ 修复失败:', error.message)
    process.exit(1)
  }
}

quickFix().then(() => process.exit(0))
