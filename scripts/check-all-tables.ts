/**
 * 检查数据库中的所有表
 */

import { getDbConnection } from '../lib/db-config'

async function checkAllTables() {
  try {
    console.log('正在连接数据库...')
    const pool = await getDbConnection()
    console.log('数据库连接成功！\n')

    // 查询所有表
    const result = await pool.request().query(`
      SELECT TABLE_NAME, TABLE_TYPE
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `)

    console.log(`数据库中现有的表（共 ${result.recordset.length} 个）:\n`)
    
    for (const row of result.recordset) {
      console.log(`  - ${row.TABLE_NAME}`)
    }

    console.log('\n')

  } catch (error: any) {
    console.error('❌ 检查失败:', error)
    console.error('错误详情:', error.message)
  }
}

checkAllTables()
  .then(() => {
    console.log('检查完成')
    process.exit(0)
  })
  .catch((error) => {
    console.error('脚本执行失败:', error)
    process.exit(1)
  })
