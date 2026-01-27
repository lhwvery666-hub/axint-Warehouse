/**
 * 清理用户账号脚本
 * 只保留4个测试账号，删除其他所有账号
 * 
 * 运行方式: npm run cleanup-users
 * 或: tsx scripts/cleanup-users.ts
 */

import sql from 'mssql'
import bcrypt from 'bcryptjs'
import { dbConfig } from '../lib/db-config'

// 要保留的4个测试账号
const keepUsers = ['admin', 'tech', 'warehouse', 'reporter']

async function cleanupUsers() {
  let pool: sql.ConnectionPool | null = null

  try {
    console.log('正在连接数据库...')
    pool = await sql.connect(dbConfig)
    console.log('数据库连接成功！\n')

    // 1. 获取所有用户
    const allUsersResult = await pool.request().query(`
      SELECT UserID, Username, Role, RealName
      FROM Users
    `)

    const allUsers = allUsersResult.recordset
    console.log(`当前共有 ${allUsers.length} 个用户\n`)

    // 2. 找出需要删除的用户
    const usersToDelete = allUsers.filter((user: any) => 
      !keepUsers.includes(user.Username)
    )

    if (usersToDelete.length === 0) {
      console.log('✅ 没有需要删除的用户，所有账号都是测试账号')
      return
    }

    console.log(`将删除 ${usersToDelete.length} 个用户:`)
    usersToDelete.forEach((user: any) => {
      console.log(`  - ${user.Username} (${user.RealName || '未知'}) - ${user.Role || '无角色'}`)
    })
    console.log('')

    // 3. 删除用户
    let deletedCount = 0
    for (const user of usersToDelete) {
      try {
        await pool
          .request()
          .input('userId', user.UserID)
          .query('DELETE FROM Users WHERE UserID = @userId')
        
        console.log(`✅ 已删除: ${user.Username}`)
        deletedCount++
      } catch (error: any) {
        console.error(`❌ 删除用户 "${user.Username}" 失败:`, error.message)
      }
    }

    // 4. 确保4个测试账号存在且密码正确
    console.log('\n正在检查测试账号...')
    const testUsers = [
      { username: 'admin', realName: '系统管理员', role: 'Admin' },
      { username: 'tech', realName: '维修工程师', role: 'Technician' },
      { username: 'warehouse', realName: '仓库管理员', role: 'Warehouse' },
      { username: 'reporter', realName: '现场报告人员', role: 'Reporter' }
    ]

    for (const testUser of testUsers) {
      const checkResult = await pool
        .request()
        .input('username', sql.NVarChar, testUser.username)
        .query('SELECT UserID, Password, Role FROM Users WHERE Username = @username')

      if (checkResult.recordset.length > 0) {
        const existingUser = checkResult.recordset[0]
        
        // 检查密码是否需要更新
        const password = existingUser.Password
        const needsPasswordUpdate = !password || (!password.startsWith('$2a$') && !password.startsWith('$2b$') && !password.startsWith('$2y$') && password !== '111111')
        
        // 检查角色是否正确
        const needsRoleUpdate = existingUser.Role !== testUser.role

        if (needsPasswordUpdate || needsRoleUpdate) {
          const saltRounds = 10
          const hashedPassword = await bcrypt.hash('111111', saltRounds)
          
          const updates: string[] = []
          const request = pool.request()
          
          if (needsPasswordUpdate) {
            updates.push('Password = @password')
            request.input('password', sql.NVarChar, hashedPassword)
          }
          
          if (needsRoleUpdate) {
            updates.push('Role = @role')
            request.input('role', sql.NVarChar, testUser.role)
          }
          
          request.input('username', sql.NVarChar, testUser.username)
          
          await request.query(`
            UPDATE Users 
            SET ${updates.join(', ')}
            WHERE Username = @username
          `)
          
          console.log(`✅ 更新账号: ${testUser.username} (${needsPasswordUpdate ? '密码' : ''}${needsPasswordUpdate && needsRoleUpdate ? '和' : ''}${needsRoleUpdate ? '角色' : ''})`)
        } else {
          console.log(`✓ 账号正常: ${testUser.username}`)
        }
      } else {
        // 创建缺失的测试账号
        const saltRounds = 10
        const hashedPassword = await bcrypt.hash('111111', saltRounds)
        
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
        
        if (hasCreatedAt && hasUpdatedAt) {
          await pool
            .request()
            .input('username', sql.NVarChar, testUser.username)
            .input('password', sql.NVarChar, hashedPassword)
            .input('realName', sql.NVarChar, testUser.realName)
            .input('role', sql.NVarChar, testUser.role)
            .query(`
              INSERT INTO Users (Username, Password, RealName, Role, CreatedAt, UpdatedAt)
              VALUES (@username, @password, @realName, @role, GETDATE(), GETDATE())
            `)
        } else {
          await pool
            .request()
            .input('username', sql.NVarChar, testUser.username)
            .input('password', sql.NVarChar, hashedPassword)
            .input('realName', sql.NVarChar, testUser.realName)
            .input('role', sql.NVarChar, testUser.role)
            .query(`
              INSERT INTO Users (Username, Password, RealName, Role)
              VALUES (@username, @password, @realName, @role)
            `)
        }
        
        console.log(`✅ 创建账号: ${testUser.username}`)
      }
    }

    // 5. 显示最终结果
    const finalResult = await pool.request().query(`
      SELECT Username, Role, RealName
      FROM Users
      ORDER BY Username
    `)

    console.log('\n✅ 清理完成！')
    console.log('\n最终账号列表:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    finalResult.recordset.forEach((user: any) => {
      console.log(`用户名: ${user.Username.padEnd(12)} | 角色: ${(user.Role || '无').padEnd(12)} | 姓名: ${user.RealName || '未知'}`)
    })
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`\n总共 ${finalResult.recordset.length} 个账号，密码统一为: 111111\n`)

  } catch (error: any) {
    console.error('❌ 清理用户失败:', error)
    process.exit(1)
  } finally {
    if (pool) {
      await pool.close()
      console.log('数据库连接已关闭')
    }
  }
}

// 运行脚本
cleanupUsers()
  .then(() => {
    console.log('脚本执行完成')
    process.exit(0)
  })
  .catch((error) => {
    console.error('脚本执行失败:', error)
    process.exit(1)
  })
