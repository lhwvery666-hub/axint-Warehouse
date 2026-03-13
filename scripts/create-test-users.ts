/**
 * 创建测试用户脚本
 * 为每种角色创建一个测试账号
 * 
 * 运行方式: npm run create-test-users
 * 或: tsx scripts/create-test-users.ts
 */

import sql from 'mssql'
import bcrypt from 'bcryptjs'
import { dbConfig } from '../lib/db-config'

const testUsers = [
  {
    username: 'admin',
    password: '111111',
    realName: '系统管理员',
    role: 'Admin'
  },
  {
    username: 'wx',
    password: '111111',
    realName: '维修人员',
    role: 'Technician'
  },
  {
    username: 'ck',
    password: '111111',
    realName: '仓库',
    role: 'Warehouse'
  },
  {
    username: 'xc',
    password: '111111',
    realName: '现场',
    role: 'Reporter'
  },
  {
    username: 'sw',
    password: '111111',
    realName: '商务',
    role: 'Business'
  }
]

async function createTestUsers() {
  let pool: sql.ConnectionPool | null = null

  try {
    console.log('正在连接数据库...')
    pool = await sql.connect(dbConfig)
    console.log('数据库连接成功！\n')

    for (const user of testUsers) {
      try {
        // 检查用户是否已存在
        const checkResult = await pool
          .request()
          .input('username', sql.NVarChar, user.username)
          .query('SELECT UserID FROM Users WHERE Username = @username')

        if (checkResult.recordset.length > 0) {
          console.log(`⚠️  用户 "${user.username}" 已存在，跳过创建`)
          continue
        }

        // 加密密码
        const saltRounds = 10
        const hashedPassword = await bcrypt.hash(user.password, saltRounds)

        // 检查是否有时间戳字段
        const timestampCheck = await pool
          .request()
          .query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'Users' AND COLUMN_NAME IN ('CreatedAt', 'UpdatedAt')
          `)
        
        const hasCreatedAt = timestampCheck.recordset.some((r: any) => r.COLUMN_NAME === 'CreatedAt')
        const hasUpdatedAt = timestampCheck.recordset.some((r: any) => r.COLUMN_NAME === 'UpdatedAt')
        
        // 插入用户
        if (hasCreatedAt && hasUpdatedAt) {
          await pool
            .request()
            .input('username', sql.NVarChar, user.username)
            .input('password', sql.NVarChar, hashedPassword)
            .input('realName', sql.NVarChar, user.realName)
            .input('role', sql.NVarChar, user.role)
            .query(`
              INSERT INTO Users (Username, Password, RealName, Role, CreatedAt, UpdatedAt)
              VALUES (@username, @password, @realName, @role, GETDATE(), GETDATE())
            `)
        } else {
          await pool
            .request()
            .input('username', sql.NVarChar, user.username)
            .input('password', sql.NVarChar, hashedPassword)
            .input('realName', sql.NVarChar, user.realName)
            .input('role', sql.NVarChar, user.role)
            .query(`
              INSERT INTO Users (Username, Password, RealName, Role)
              VALUES (@username, @password, @realName, @role)
            `)
        }

        console.log(`✅ 创建用户成功: ${user.username} (${user.realName}) - 角色: ${user.role}`)
        console.log(`   用户名: ${user.username}`)
        console.log(`   密码: ${user.password}`)
        console.log('')
      } catch (error: any) {
        console.error(`❌ 创建用户 "${user.username}" 失败:`, error.message)
      }
    }

    console.log('\n✅ 测试用户创建完成！')
    console.log('\n测试账号列表:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    testUsers.forEach(user => {
      console.log(`角色: ${user.role.padEnd(12)} | 用户名: ${user.username.padEnd(12)} | 密码: ${user.password}`)
    })
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  } catch (error: any) {
    console.error('❌ 创建测试用户失败:', error)
    process.exit(1)
  } finally {
    if (pool) {
      await pool.close()
      console.log('数据库连接已关闭')
    }
  }
}

// 运行脚本
createTestUsers()
  .then(() => {
    console.log('脚本执行完成')
    process.exit(0)
  })
  .catch((error) => {
    console.error('脚本执行失败:', error)
    process.exit(1)
  })
