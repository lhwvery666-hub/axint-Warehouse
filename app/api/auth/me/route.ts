import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"
import { getUserQueryConfig } from "@/lib/field-checks"
import { getCurrentUserRole } from "@/lib/auth-utils"

// GET /api/auth/me
// 获取当前登录用户信息（通过 session token 验证）
export async function GET() {
  const authenticatedUser = await getCurrentUserRole()
  if (!authenticatedUser) {
    return NextResponse.json(
      { success: false, message: "未登录或会话已过期" },
      { status: 401 }
    )
  }

  try {
    const userId = authenticatedUser.userId

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
