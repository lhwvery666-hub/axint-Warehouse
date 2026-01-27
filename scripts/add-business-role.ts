/**
 * 添加商务角色到数据库
 * 此脚本确保数据库支持商务角色
 * 
 * 运行方式: npx tsx scripts/add-business-role.ts
 */

import { getDbConnection } from "../lib/db-config"

async function addBusinessRole() {
  try {
    const pool = await getDbConnection()
    
    console.log("✅ 数据库连接成功！\n")
    
    // 检查是否有用户使用商务相关角色
    const checkResult = await pool
      .request()
      .query(`
        SELECT UserID, Username, RealName, Role
        FROM Users
        WHERE Role IN ('Business', '商务', '商务人员', '商务管理员')
      `)

    if (checkResult.recordset.length > 0) {
      console.log(`📋 找到 ${checkResult.recordset.length} 个商务角色用户：`)
      checkResult.recordset.forEach((user: any) => {
        console.log(`   - ${user.Username} (${user.RealName}) - 角色: ${user.Role}`)
      })
    } else {
      console.log("ℹ️  数据库中暂无商务角色用户")
    }

    // 检查 sw 用户是否存在，如果存在但角色不是商务，则更新
    const swUserResult = await pool
      .request()
      .input("username", "sw")
      .query(`
        SELECT TOP 1 UserID, Username, RealName, Role
        FROM Users
        WHERE Username = @username
      `)

    if (swUserResult.recordset.length > 0) {
      const swUser = swUserResult.recordset[0]
      const currentRole = (swUser.Role || "").toString()
      const businessRoles = ['Business', '商务', '商务人员', '商务管理员']
      
      if (!businessRoles.includes(currentRole)) {
        console.log(`\n🔄 更新用户 "sw" 的角色为 "Business"...`)
        await pool
          .request()
          .input("username", "sw")
          .input("role", "Business")
          .query(`
            UPDATE Users
            SET Role = @role
            WHERE Username = @username
          `)
        console.log(`✅ 已更新用户 "sw" 的角色为 "Business"`)
      } else {
        console.log(`\n✅ 用户 "sw" 的角色已经是商务角色: ${currentRole}`)
      }
    } else {
      console.log(`\n⚠️  用户 "sw" 不存在，请先运行 create-business-user.ts 创建该用户`)
    }

    console.log("\n✅ 商务角色检查完成！")
    console.log("\n📝 说明：")
    console.log("   - 数据库中的 Role 字段支持以下商务角色值：")
    console.log("     • Business (推荐)")
    console.log("     • 商务")
    console.log("     • 商务人员")
    console.log("     • 商务管理员")
    console.log("   - 所有这些值都会被系统识别为商务人员角色")
    
  } catch (error: any) {
    console.error("❌ 处理失败：", error.message)
    throw error
  } finally {
    process.exit(0)
  }
}

addBusinessRole()
