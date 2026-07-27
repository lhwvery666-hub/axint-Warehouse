import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getDbConnection } from "@/lib/db-config"
import { UserRole, normalizeUserRole } from "@/lib/enums"

/**
 * 获取当前登录用户的角色
 * 如果 cookie 中没有 userRole，会从数据库查询并自动补充
 */
export async function getCurrentUserRole(): Promise<{
  userId: string
  userRole: string
  normalizedRole: UserRole | null
} | null> {
  try {
    const cookieStore = await cookies()
    const userIdCookie = cookieStore.get("userId")?.value
    let userRole = cookieStore.get("userRole")?.value

    if (!userIdCookie) {
      return null
    }

    // 🔧 降级逻辑：如果 userRole cookie 不存在或为 undefined，从数据库查询并补充
    if (!userRole || userRole === "undefined") {
      console.log(`[Auth Utils] ⚠️ userRole 缺失，从数据库查询用户信息 (userId: ${userIdCookie})`)
      const pool = await getDbConnection()
      const userResult = await pool
        .request()
        .input("userId", userIdCookie)
        .query(`SELECT TOP 1 Role FROM Users WHERE UserID = @userId`)
      
      if (userResult.recordset.length > 0) {
        userRole = userResult.recordset[0].Role
        // 补充设置 userRole cookie
        cookieStore.set("userRole", userRole || "", {
          httpOnly: true,
          secure: false,
          sameSite: "lax",
          maxAge: 60 * 60 * 24,
          path: "/",
        })
        console.log(`[Auth Utils] ✅ 已从数据库补充 userRole: "${userRole}"`)
      } else {
        console.error(`[Auth Utils] ❌ 用户不存在: userId=${userIdCookie}`)
        return null
      }
    }

    const normalizedRole = normalizeUserRole(userRole || "")
    
    return {
      userId: userIdCookie,
      userRole: userRole || "",
      normalizedRole,
    }
  } catch (error) {
    console.error("[Auth Utils] 获取用户角色失败:", error)
    return null
  }
}

/**
 * 检查用户是否有指定的角色权限
 * @param allowedRoles 允许的角色列表
 * @returns 如果有权限返回用户信息，否则返回 NextResponse 错误响应
 */
export async function checkUserRole(
  allowedRoles: UserRole[]
): Promise<
  | { userId: string; userRole: string; normalizedRole: UserRole }
  | NextResponse
> {
  const userInfo = await getCurrentUserRole()

  if (!userInfo) {
    return NextResponse.json(
      { success: false, message: "未登录或用户不存在" },
      { status: 401 }
    )
  }

  if (!userInfo.normalizedRole || !allowedRoles.includes(userInfo.normalizedRole)) {
    console.error(
      `[Auth Utils] 权限验证失败！原始角色="${userInfo.userRole}", 标准化角色="${userInfo.normalizedRole}", 允许的角色="${allowedRoles.join(", ")}"`
    )
    return NextResponse.json(
      { success: false, message: "权限不足" },
      { status: 403 }
    )
  }

  return {
    userId: userInfo.userId,
    userRole: userInfo.userRole,
    normalizedRole: userInfo.normalizedRole,
  }
}

/**
 * 判断是否是 NextResponse（错误响应）
 */
export function isErrorResponse(
  result: unknown
): result is NextResponse {
  return result instanceof NextResponse
}
