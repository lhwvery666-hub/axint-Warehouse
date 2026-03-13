/**
 * 密码加密迁移脚本
 * 将数据库中的明文密码批量加密为bcrypt
 * 
 * 运行方式: npm run encrypt-passwords
 * 或: tsx scripts/encrypt-passwords.ts
 * 
 * 注意：此脚本会修改数据库中的密码，请先备份数据库
 */

import sql from 'mssql'
import bcrypt from 'bcryptjs'
import { dbConfig } from '../lib/db-config'

const saltRounds = 10

async function encryptPasswords() {
  let pool: sql.ConnectionPool | null = null

  try {
    console.log('正在连接数据库...')
    pool = await sql.connect(dbConfig)
    console.log('数据库连接成功！\n')

    // 检查是否有明文密码的用户
    const plaintextCheck = await pool
      .request()
      .query(`
        SELECT UserID, Username, Password 
        FROM Users 
        WHERE Password NOT LIKE '$2a$%' 
        AND Password NOT LIKE '$2b$%' 
        AND Password NOT LIKE '$2y$%'
        AND Password IS NOT NULL
        AND Password != ''
      `)

    if (plaintextCheck.recordset.length === 0) {
      console.log('✅ 所有用户密码都已加密，无需迁移')
      return
    }

    console.log(`发现 ${plaintextCheck.recordset.length} 个用户使用明文密码:`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    const usersToUpdate = plaintextCheck.recordset as Array<{
      UserID: string
      Username: string
      Password: string
    }>

    // 显示将要更新的用户列表
    usersToUpdate.forEach(user => {
      console.log(`用户名: ${user.Username} (ID: ${user.UserID})`)
    })
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    // 确认操作
    console.log('⚠️  警告：此操作将加密所有明文密码，请确保已备份数据库！')
    console.log('是否继续？(y/N)')
    
    // 在生产环境中，你可能想要添加交互式确认
    // 这里为了自动化，我们直接执行，但添加了5秒延迟以便取消
    console.log('将在5秒后开始加密，按 Ctrl+C 取消...')
    await new Promise(resolve => setTimeout(resolve, 5000))

    console.log('\n开始加密密码...')

    let successCount = 0
    let errorCount = 0

    for (const user of usersToUpdate) {
      try {
        // 加密密码
        const hashedPassword = await bcrypt.hash(user.Password, saltRounds)

        // 更新数据库
        await pool
          .request()
          .input('userID', sql.Int, user.UserID)
          .input('hashedPassword', sql.NVarChar, hashedPassword)
          .query(`
            UPDATE Users 
            SET Password = @hashedPassword
            WHERE UserID = @userID
          `)

        console.log(`✅ 已加密用户: ${user.Username}`)
        successCount++

      } catch (error: any) {
        console.error(`❌ 加密用户 "${user.Username}" 失败:`, error.message)
        errorCount++
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`密码加密完成！`)
    console.log(`成功: ${successCount} 个用户`)
    console.log(`失败: ${errorCount} 个用户`)
    
    if (errorCount > 0) {
      console.log('\n⚠️  部分用户密码加密失败，请检查错误信息')
    } else {
      console.log('\n✅ 所有用户密码已成功加密！')
      console.log('建议：现在可以移除登录API中的明文密码兼容逻辑')
    }

  } catch (error: any) {
    console.error('❌ 密码加密失败:', error)
    process.exit(1)
  } finally {
    if (pool) {
      await pool.close()
      console.log('\n数据库连接已关闭')
    }
  }
}

// 检查是否有明文密码（不修改数据）
async function checkPlaintextPasswords() {
  let pool: sql.ConnectionPool | null = null

  try {
    console.log('正在检查明文密码...')
    pool = await sql.connect(dbConfig)

    const result = await pool
      .request()
      .query(`
        SELECT 
          COUNT(*) as TotalUsers,
          SUM(CASE WHEN Password LIKE '$2a$%' OR Password LIKE '$2b$%' OR Password LIKE '$2y$%' THEN 1 ELSE 0 END) as EncryptedUsers,
          SUM(CASE WHEN Password NOT LIKE '$2a$%' AND Password NOT LIKE '$2b$%' AND Password NOT LIKE '$2y$%' AND Password IS NOT NULL AND Password != '' THEN 1 ELSE 0 END) as PlaintextUsers
        FROM Users
      `)

    const stats = result.recordset[0] as {
      TotalUsers: number
      EncryptedUsers: number
      PlaintextUsers: number
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`总用户数: ${stats.TotalUsers}`)
    console.log(`已加密用户: ${stats.EncryptedUsers}`)
    console.log(`明文密码用户: ${stats.PlaintextUsers}`)
    
    if (stats.PlaintextUsers > 0) {
      console.log(`\n⚠️  发现 ${stats.PlaintextUsers} 个用户使用明文密码，建议运行加密脚本`)
    } else {
      console.log('\n✅ 所有用户密码都已加密')
    }

  } catch (error: any) {
    console.error('❌ 检查失败:', error)
    process.exit(1)
  } finally {
    if (pool) {
      await pool.close()
    }
  }
}

// 命令行参数处理
const command = process.argv[2]

if (command === '--check') {
  checkPlaintextPasswords()
} else if (command === '--encrypt') {
  encryptPasswords()
} else {
  console.log('密码加密工具')
  console.log('')
  console.log('用法:')
  console.log('  npm run encrypt-passwords -- --check    # 检查明文密码')
  console.log('  npm run encrypt-passwords -- --encrypt  # 加密明文密码')
  console.log('')
  console.log('注意：加密操作会修改数据库，请先备份数据库！')
  process.exit(0)
}
