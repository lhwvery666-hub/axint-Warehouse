import bcrypt from "bcryptjs"
import { NextResponse } from "next/server"
import * as sql from "mssql"
import { z } from "zod"
import { getDbConnection } from "@/lib/db-config"
import { ALL_USER_ROLES, checkUserRole, isErrorResponse } from "@/lib/auth-utils"
import { normalizeUserRole, UserRole } from "@/lib/enums"
import { canAccessUserResource } from "@/lib/user-profile-policy"

const userIdSchema = z.coerce.number().int().positive()
const phoneSchema = z.union([
  z.string().regex(/^1[3-9]\d{9}$/, "手机号格式不正确"),
  z.literal(""),
  z.null(),
])
const selfUpdateSchema = z.object({
  realName: z.string().trim().min(1).max(100).optional(),
  phoneNumber: phoneSchema.optional(),
}).strict()
const adminUpdateSchema = selfUpdateSchema.extend({
  username: z.string().trim().min(1).max(100).optional(),
  password: z.string().min(1).max(128).optional(),
  role: z.string().trim().min(1).max(50).nullable().optional(),
}).strict()

interface UserRow {
  UserID: number
  Username: string
  Role: string
  RealName: string | null
  PhoneNumber: string | null
  CreatedAt: Date | null
  UpdatedAt: Date | null
}

interface UserUpdate {
  username?: string
  password?: string
  realName?: string
  phoneNumber?: string | null
  role?: string | null
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authResult = await checkUserRole(ALL_USER_ROLES)
  if (isErrorResponse(authResult)) return authResult

  try {
    const parsedUserId = userIdSchema.safeParse((await context.params).id)
    const requesterId = Number(authResult.userId)
    if (!parsedUserId.success || !Number.isSafeInteger(requesterId)) {
      return NextResponse.json({ success: false, message: "用户ID无效" }, { status: 400 })
    }
    if (!canAccessUserResource(requesterId, authResult.normalizedRole, parsedUserId.data)) {
      return NextResponse.json({ success: false, message: "您无权查看该用户" }, { status: 403 })
    }

    const pool = await getDbConnection()
    const result = await pool.request()
      .input("userId", sql.Int, parsedUserId.data)
      .query<UserRow>(`
        SELECT [UserID], [Username], [Role], [RealName], [PhoneNumber], [CreatedAt], [UpdatedAt]
        FROM [dbo].[Users]
        WHERE [UserID] = @userId AND ISNULL([IsDeleted], 0) = 0;
      `)
    const row = result.recordset[0]
    if (!row) {
      return NextResponse.json({ success: false, message: "用户不存在" }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      message: "用户信息查询成功",
      data: {
        id: String(row.UserID),
        username: row.Username,
        role: row.Role,
        realName: row.RealName || "",
        phoneNumber: row.PhoneNumber || "",
        createdAt: row.CreatedAt?.toISOString() || null,
        updatedAt: row.UpdatedAt?.toISOString() || null,
      },
    })
  } catch (error: unknown) {
    console.error("[Users API] 获取用户信息失败:", error)
    return NextResponse.json({ success: false, message: "获取用户信息失败" }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authResult = await checkUserRole(ALL_USER_ROLES)
  if (isErrorResponse(authResult)) return authResult

  let transaction: sql.Transaction | null = null
  try {
    const parsedUserId = userIdSchema.safeParse((await context.params).id)
    const requesterId = Number(authResult.userId)
    if (!parsedUserId.success || !Number.isSafeInteger(requesterId)) {
      return NextResponse.json({ success: false, message: "用户ID无效" }, { status: 400 })
    }
    const targetUserId = parsedUserId.data
    if (!canAccessUserResource(requesterId, authResult.normalizedRole, targetUserId)) {
      return NextResponse.json({ success: false, message: "您只能修改自己的个人资料" }, { status: 403 })
    }

    const rawBody: unknown = await request.json().catch(() => null)
    const parsedBody = authResult.normalizedRole === UserRole.ADMIN
      ? adminUpdateSchema.safeParse(rawBody)
      : selfUpdateSchema.safeParse(rawBody)
    if (!parsedBody.success) {
      return NextResponse.json(
        { success: false, message: "更新字段或格式无效" },
        { status: 400 }
      )
    }
    const update: UserUpdate = parsedBody.data
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ success: false, message: "没有要更新的字段" }, { status: 400 })
    }
    if (update.role !== undefined && update.role !== null) {
      const normalizedRole = normalizeUserRole(update.role)
      if (!normalizedRole && update.role.toLowerCase() !== "user") {
        return NextResponse.json({ success: false, message: "角色值无效" }, { status: 400 })
      }
    }

    const pool = await getDbConnection()
    transaction = new sql.Transaction(pool)
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE)
    const currentResult = await new sql.Request(transaction)
      .input("userId", sql.Int, targetUserId)
      .query<{ UserID: number }>(`
        SELECT [UserID]
        FROM [dbo].[Users] WITH (UPDLOCK, HOLDLOCK)
        WHERE [UserID] = @userId AND ISNULL([IsDeleted], 0) = 0;
      `)
    if (!currentResult.recordset[0]) {
      await transaction.rollback()
      transaction = null
      return NextResponse.json({ success: false, message: "用户不存在" }, { status: 404 })
    }

    if (update.username !== undefined) {
      const usernameResult = await new sql.Request(transaction)
        .input("username", sql.NVarChar(100), update.username)
        .input("userId", sql.Int, targetUserId)
        .query(`
          SELECT TOP 1 [UserID]
          FROM [dbo].[Users] WITH (UPDLOCK, HOLDLOCK)
          WHERE [Username] = @username AND [UserID] <> @userId;
        `)
      if (usernameResult.recordset.length > 0) {
        await transaction.rollback()
        transaction = null
        return NextResponse.json({ success: false, message: "用户名已存在" }, { status: 409 })
      }
    }
    if (update.phoneNumber) {
      const phoneResult = await new sql.Request(transaction)
        .input("phoneNumber", sql.NVarChar(20), update.phoneNumber)
        .input("userId", sql.Int, targetUserId)
        .query(`
          SELECT TOP 1 [UserID]
          FROM [dbo].[Users] WITH (UPDLOCK, HOLDLOCK)
          WHERE [PhoneNumber] = @phoneNumber AND [UserID] <> @userId;
        `)
      if (phoneResult.recordset.length > 0) {
        await transaction.rollback()
        transaction = null
        return NextResponse.json({ success: false, message: "该手机号已被其他用户使用" }, { status: 409 })
      }
    }

    const updates: string[] = []
    const updateRequest = new sql.Request(transaction).input("userId", sql.Int, targetUserId)
    if (update.username !== undefined) {
      updates.push("[Username] = @username")
      updateRequest.input("username", sql.NVarChar(100), update.username)
    }
    if (update.password !== undefined) {
      updates.push("[Password] = @password")
      updateRequest.input("password", sql.NVarChar(255), await bcrypt.hash(update.password, 10))
    }
    if (update.realName !== undefined) {
      updates.push("[RealName] = @realName")
      updateRequest.input("realName", sql.NVarChar(100), update.realName)
    }
    if (update.phoneNumber !== undefined) {
      updates.push("[PhoneNumber] = @phoneNumber")
      updateRequest.input("phoneNumber", sql.NVarChar(20), update.phoneNumber || null)
    }
    if (update.role !== undefined) {
      updates.push("[Role] = @role")
      updateRequest.input("role", sql.NVarChar(50), update.role || "User")
    }
    updates.push("[UpdatedAt] = SYSUTCDATETIME()")

    const updateResult = await updateRequest.query(`
      UPDATE [dbo].[Users]
      SET ${updates.join(", ")}
      WHERE [UserID] = @userId AND ISNULL([IsDeleted], 0) = 0;
    `)
    if (updateResult.rowsAffected[0] !== 1) {
      throw new Error("USER_UPDATE_CONFLICT")
    }

    await transaction.commit()
    transaction = null
    return NextResponse.json({ success: true, message: "用户信息更新成功" })
  } catch (error: unknown) {
    console.error("[Users API] 更新用户失败:", error)
    if (transaction) {
      try {
        await transaction.rollback()
      } catch (rollbackError) {
        console.error("[Users API] 事务回滚失败:", rollbackError)
      } finally {
        transaction = null
      }
    }
    const conflict = error instanceof Error && error.message === "USER_UPDATE_CONFLICT"
    return NextResponse.json(
      { success: false, message: conflict ? "用户信息已变化，请刷新后重试" : "更新用户失败" },
      { status: conflict ? 409 : 500 }
    )
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authResult = await checkUserRole([UserRole.ADMIN])
  if (isErrorResponse(authResult)) return authResult

  try {
    const parsedUserId = userIdSchema.safeParse((await context.params).id)
    const requesterId = Number(authResult.userId)
    if (!parsedUserId.success || !Number.isSafeInteger(requesterId)) {
      return NextResponse.json({ success: false, message: "用户ID无效" }, { status: 400 })
    }
    if (parsedUserId.data === requesterId) {
      return NextResponse.json({ success: false, message: "不能注销当前登录账号" }, { status: 400 })
    }

    const pool = await getDbConnection()
    const userResult = await pool.request()
      .input("userId", sql.Int, parsedUserId.data)
      .query<{ Role: string }>(`
        SELECT [Role]
        FROM [dbo].[Users]
        WHERE [UserID] = @userId AND ISNULL([IsDeleted], 0) = 0;
      `)
    const user = userResult.recordset[0]
    if (!user) {
      return NextResponse.json({ success: false, message: "用户不存在" }, { status: 404 })
    }
    if (normalizeUserRole(user.Role) === UserRole.ADMIN) {
      return NextResponse.json({ success: false, message: "不能注销管理员账号" }, { status: 400 })
    }

    const result = await pool.request()
      .input("userId", sql.Int, parsedUserId.data)
      .query(`
        UPDATE [dbo].[Users]
        SET [IsDeleted] = 1, [UpdatedAt] = SYSUTCDATETIME()
        WHERE [UserID] = @userId AND ISNULL([IsDeleted], 0) = 0;
      `)
    if (result.rowsAffected[0] !== 1) {
      return NextResponse.json({ success: false, message: "用户状态已变化" }, { status: 409 })
    }

    return NextResponse.json({ success: true, message: "用户已注销，历史工单数据仍保留" })
  } catch (error: unknown) {
    console.error("[Users API] 注销用户失败:", error)
    return NextResponse.json({ success: false, message: "注销用户失败" }, { status: 500 })
  }
}
