import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"
import { cookies } from "next/headers"

// POST /api/auth/login
// 使用 SQL Server Users 表进行真实登录校验
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { username, password } = body ?? {}

    if (!username || !password) {
      return NextResponse.json(
        { success: false, message: "用户名和密码为必填项" },
        { status: 400 }
      )
    }

    const pool = await getDbConnection()

    // 检查表是否有 PhoneNumber 和 IsDeleted 字段
    const columnCheck = await pool
      .request()
      .query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'Users' AND COLUMN_NAME IN ('PhoneNumber', 'IsDeleted')
      `)
    const hasPhoneNumber = columnCheck.recordset.some((r: any) => r.COLUMN_NAME === "PhoneNumber")
    const hasIsDeleted = columnCheck.recordset.some((r: any) => r.COLUMN_NAME === "IsDeleted")

    const result = await pool
      .request()
      .input("username", username)
      .query(
        `
        SELECT TOP 1 
          UserID, 
          Username, 
          Password, 
          Role, 
          RealName${hasPhoneNumber ? ", PhoneNumber" : ""}
        FROM Users
        WHERE Username = @username
        ${hasIsDeleted ? "AND IsDeleted = 0" : ""}
      `
      )

    if (result.recordset.length === 0) {
      // 如果存在 IsDeleted 字段，再精确检查是否是已注销账号，给出更清晰提示
      if (hasIsDeleted) {
        const deletedCheck = await pool
          .request()
          .input("username", username)
          .query(`
            SELECT TOP 1 IsDeleted 
            FROM Users 
            WHERE Username = @username
          `)

        if (deletedCheck.recordset.length > 0 && deletedCheck.recordset[0].IsDeleted) {
          return NextResponse.json(
            { success: false, message: "账号已注销，如需恢复请联系管理员" },
            { status: 403 }
          )
        }
      }

      return NextResponse.json(
        { success: false, message: "账号或密码错误" },
        { status: 401 }
      )
    }

    const row = result.recordset[0] as {
      UserID: string
      Username: string
      Password: string
      Role: string
      RealName: string
      PhoneNumber?: string
    }

    // 验证密码（支持明文和 bcrypt 加密的密码）
    let passwordValid = false
    if (row.Password.startsWith('$2a$') || row.Password.startsWith('$2b$') || row.Password.startsWith('$2y$')) {
      // bcrypt 加密的密码
      const bcrypt = require('bcryptjs')
      passwordValid = await bcrypt.compare(password, row.Password)
    } else {
      // 明文密码（向后兼容）
      passwordValid = row.Password === password
    }

    if (!passwordValid) {
      return NextResponse.json(
        { success: false, message: "账号或密码错误" },
        { status: 401 }
      )
    }

    // 设置 session cookie（存储用户ID）
    // 使用会话 cookie，关闭浏览器后自动失效，需要重新登录
    const cookieStore = await cookies()
    cookieStore.set("userId", row.UserID.toString(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      // 不设置 maxAge，使用会话 cookie（关闭浏览器后失效）
      // 如果需要"记住我"功能，可以添加 maxAge: 60 * 60 * 24 * 7 (7天)
    })

    return NextResponse.json({
      success: true,
      user: {
        id: row.UserID.toString(),
        username: row.Username,
        role: row.Role,
        realName: row.RealName,
        phone: hasPhoneNumber ? (row.PhoneNumber || "") : "",
      },
    })
  } catch (error: any) {
    console.error("登录接口错误:", error)
    return NextResponse.json(
      {
        success: false,
        message: "登录服务异常，请稍后重试",
        error: error?.message || "未知错误",
      },
      { status: 500 }
    )
  }
}

