import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getDbConnection } from "@/lib/db-config"
import { UserRole, normalizeUserRole } from "@/lib/enums"
import { getUserQueryConfig } from "@/lib/field-checks"
import { verifySessionToken } from "@/lib/session"

export const ALL_USER_ROLES: readonly UserRole[] = [
  UserRole.ADMIN,
  UserRole.BUSINESS,
  UserRole.REPORTER,
  UserRole.TECHNICIAN,
  UserRole.WAREHOUSE,
]

export interface AuthenticatedUser {
  userId: string
  userRole: string
  normalizedRole: UserRole
  username: string
  realName: string
}

interface CurrentUser extends Omit<AuthenticatedUser, "normalizedRole"> {
  normalizedRole: UserRole | null
}

interface UserRow {
  UserID: number | string
  Username: string | null
  Role: string | null
  RealName: string | null
}

/**
 * 从服务端 Cookie 取得用户 ID，并始终从数据库读取真实用户与角色。
 * 不信任客户端提交的 userRole Cookie，避免伪造角色或角色变更后权限未及时失效。
 */
export async function getCurrentUserRole(): Promise<CurrentUser | null> {
  try {
    const cookieStore = await cookies()
    const userIdCookie = cookieStore.get("userId")?.value
    const sessionUserId = verifySessionToken(cookieStore.get("session")?.value)

    if (
      !sessionUserId ||
      !userIdCookie ||
      !/^\d+$/.test(userIdCookie) ||
      sessionUserId !== userIdCookie
    ) {
      return null
    }

    const pool = await getDbConnection()
    const queryConfig = await getUserQueryConfig([
      "UserID",
      "Username",
      "Role",
      "RealName",
    ])
    const userResult = await pool
      .request()
      .input("userId", Number(sessionUserId))
      .query(`
        SELECT TOP 1 ${queryConfig.fields}
        FROM Users
        WHERE UserID = @userId
        ${queryConfig.conditions}
      `)

    if (userResult.recordset.length === 0) {
      return null
    }

    const user = userResult.recordset[0] as UserRow
    const userRole = user.Role || ""

    return {
      userId: String(user.UserID),
      userRole,
      normalizedRole: normalizeUserRole(userRole),
      username: user.Username || "",
      realName: user.RealName || "",
    }
  } catch (error: unknown) {
    console.error("[Auth Utils] 获取当前用户失败:", error)
    return null
  }
}

/**
 * 验证当前用户是否具备指定角色。
 */
export async function checkUserRole(
  allowedRoles: readonly UserRole[]
): Promise<AuthenticatedUser | NextResponse> {
  const userInfo = await getCurrentUserRole()

  if (!userInfo) {
    return NextResponse.json(
      { success: false, message: "未登录或用户不存在" },
      { status: 401 }
    )
  }

  if (!userInfo.normalizedRole || !allowedRoles.includes(userInfo.normalizedRole)) {
    console.error(
      `[Auth Utils] 权限不足：实际角色="${userInfo.userRole}"，允许角色="${allowedRoles.join(", ")}"`
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
    username: userInfo.username,
    realName: userInfo.realName,
  }
}

export function isErrorResponse(result: unknown): result is NextResponse {
  return result instanceof NextResponse
}
