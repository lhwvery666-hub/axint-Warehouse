import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"
import { cookies } from "next/headers"

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

    // 检查表是否有 PhoneNumber 字段
    const phoneColumnCheck = await pool
      .request()
      .query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'Users' AND COLUMN_NAME = 'PhoneNumber'
      `)
    const hasPhoneNumber = phoneColumnCheck.recordset.length > 0

    const result = await pool
      .request()
      .input("userId", userId)
      .query(`
        SELECT TOP 1 UserID, Username, Role, RealName${hasPhoneNumber ? ', PhoneNumber' : ''}
        FROM Users
        WHERE UserID = @userId
      `)

    if (result.recordset.length === 0) {
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
        phone: hasPhoneNumber ? (user.PhoneNumber || "") : "",
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
