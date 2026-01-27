/**
 * 创建商务人员账号脚本
 * 账号：sw
 * 密码：111111
 * 角色：business（商务人员）
 */

import { getDbConnection } from "../lib/db-config"

async function createBusinessUser() {
  try {
    const pool = await getDbConnection()
    
    // 检查用户是否已存在
    const checkResult = await pool
      .request()
      .input("username", "sw")
      .query(`
        SELECT TOP 1 UserID, Username, Role
        FROM Users
        WHERE Username = @username
      `)

    if (checkResult.recordset.length > 0) {
      const existingUser = checkResult.recordset[0]
      console.log(`用户 "sw" 已存在，当前角色：${existingUser.Role}`)
      
      // 更新角色为 business
      await pool
        .request()
        .input("username", "sw")
        .input("role", "business")
        .query(`
          UPDATE Users
          SET Role = @role
          WHERE Username = @username
        `)
      console.log(`已更新用户 "sw" 的角色为 "business"`)
      return
    }

    // 创建新用户
    await pool
      .request()
      .input("username", "sw")
      .input("password", "111111")
      .input("role", "business")
      .input("realName", "商务人员")
      .query(`
        INSERT INTO Users (Username, Password, Role, RealName)
        VALUES (@username, @password, @role, @realName)
      `)

    console.log("✅ 商务人员账号创建成功！")
    console.log("   账号：sw")
    console.log("   密码：111111")
    console.log("   角色：business（商务人员）")
  } catch (error: any) {
    console.error("❌ 创建商务人员账号失败：", error.message)
    throw error
  } finally {
    process.exit(0)
  }
}

createBusinessUser()
