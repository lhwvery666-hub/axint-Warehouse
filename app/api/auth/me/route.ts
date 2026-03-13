import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"
import { cookies } from "next/headers"
import { getUserQueryConfig } from "@/lib/field-checks"

// GET /api/auth/me
// 获取当前登录用户信息（通过 session token 验证）
export async function GET() {
  try {
    // 从 cookie 或 header 获取用户 session token
    // 这里简化处理，实际应该使用 JWT 或 session
    const cookieStore = await cookies()
    const userId = cookieStore.get("userId")?.value || null
    
    if (!userId) {
      return NextResponse.json(
        { success: false, message: "未登录" },
        { status: 401 }
      )
    }

    const pool = await getDbConnection()

    // 使用统一的字段检查工具
    const queryConfig = await getUserQueryConfig(['UserID', 'Username', 'Role', 'RealName'])

    const result = await pool
      .request()
      .input("userId", userId)
      .query(`
        SELECT TOP 1 ${queryConfig.fields}
        FROM Users
        WHERE UserID = @userId
        ${queryConfig.conditions}
      `)

    if (result.recordset.length === 0) {
      // 如果存在 IsDeleted 字段，再精确检查是否是已注销账号
      if (queryConfig.hasIsDeleted) {
        const deletedCheck = await pool
          .request()
          .input("userId", userId)
          .query(`
            SELECT TOP 1 IsDeleted 
            FROM Users 
            WHERE UserID = @userId
          `)

        if (deletedCheck.recordset.length > 0 && deletedCheck.recordset[0].IsDeleted) {
          return NextResponse.json(
            { success: false, message: "账号已注销，如需恢复请联系管理员" },
            { status: 403 }
          )
        }
      }

      return NextResponse.json(
        { success: false, message: "用户不存在" },
        { status: 404 }
      )
    }

    const user = result.recordset[0]

    return NextResponse.json({
      success: true,
      user: {
        id: user.UserID?.toString() || "",
        username: user.Username || "",
        role: user.Role || "",
        realName: user.RealName || "",
        phone: queryConfig.hasPhoneNumber ? (user.PhoneNumber || "") : "",
      },
    })
  } catch (error: any) {
    console.error("获取用户信息失败:", error)
    return NextResponse.json(
      {
        success: false,
        message: "获取用户信息时发生错误",
        error: error?.message || "未知错误",
      },
      { status: 500 }
    )
  }
}
