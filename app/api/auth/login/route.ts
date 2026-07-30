import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"
import { cookies } from "next/headers"
import { getUserQueryConfig } from "@/lib/field-checks"
import bcrypt from "bcryptjs"
import { createSessionToken, SESSION_MAX_AGE_SECONDS } from "@/lib/session"

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

    // 使用统一的字段检查工具
    const queryConfig = await getUserQueryConfig(['UserID', 'Username', 'Password', 'Role', 'RealName'])

    const result = await pool
      .request()
      .input("username", username)
      .query(`
        SELECT TOP 1 ${queryConfig.fields}
        FROM Users
        WHERE Username = @username
        ${queryConfig.conditions}
      `)

    if (result.recordset.length === 0) {
      // 如果存在 IsDeleted 字段，再精确检查是否是已注销账号，给出更清晰提示
      if (queryConfig.hasIsDeleted) {
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

    const passwordValid = await bcrypt.compare(password, row.Password)

    if (!passwordValid) {
      return NextResponse.json(
        { success: false, message: "账号或密码错误" },
        { status: 401 }
      )
    }

    // 设置持久化 cookie（24小时有效期）
    // secure: false — 内网 HTTP 部署，Secure 标志会导致浏览器在非 HTTPS 下拒绝存储 cookie
    const COOKIE_MAX_AGE = SESSION_MAX_AGE_SECONDS
    const cookieStore = await cookies()
    cookieStore.set("session", createSessionToken(row.UserID.toString()), {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === "true",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    })
    cookieStore.set("userId", row.UserID.toString(), {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === "true",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    })
    
    cookieStore.set("userRole", row.Role || "", {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === "true",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    })

    const userPayload = {
      id: row.UserID.toString(),
      username: row.Username,
      realName: row.RealName || "",
      role: row.Role || "",
    }
    cookieStore.set("user", JSON.stringify(userPayload), {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === "true",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    })

    return NextResponse.json({
      success: true,
      user: {
        id: row.UserID.toString(),
        username: row.Username,
        role: row.Role,
        realName: row.RealName,
        phone: queryConfig.hasPhoneNumber ? (row.PhoneNumber || "") : "",
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

