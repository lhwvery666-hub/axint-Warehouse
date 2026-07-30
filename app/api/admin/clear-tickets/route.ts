import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { cookies } from "next/headers"
import { UserRole, normalizeUserRole } from "@/lib/enums"
import { getDbConnection } from "@/lib/db-config"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"

/**
 * DELETE /api/admin/clear-tickets
 * 精准清空所有维修工单及其历史流水（仅限管理员）
 *
 * 安全边界：只操作以下两张表
 *   - Repair_Ticket_History（工单历史流水，先删，避免外键约束）
 *   - Repair_Tickets（工单主表，后删）
 *
 * 绝不触碰：Users / Devices / Batches 等基础数据
 *
 * 使用 Prisma $transaction 保证原子性：两步同时成功或全部回滚。
 */
export async function DELETE() {
  const authResult = await checkUserRole([UserRole.ADMIN])
  if (isErrorResponse(authResult)) return authResult

  try {
    // ── 1. 身份校验：读取 Cookie ──────────────────────────────────────
    const cookieStore = await cookies()
    const userId = cookieStore.get("userId")?.value ?? null

    if (!userId) {
      return NextResponse.json(
        { success: false, message: "未登录，无权执行此操作" },
        { status: 401 }
      )
    }

    // ── 2. 权限校验：仅管理员 ──────────────────────────────────────────
    const pool = await getDbConnection()
    const userResult = await pool
      .request()
      .input("userId", userId)
      .query(`SELECT TOP 1 Role FROM Users WHERE UserID = @userId`)

    if (userResult.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "用户不存在" },
        { status: 403 }
      )
    }

    const normalizedRole = normalizeUserRole(userResult.recordset[0].Role)
    if (normalizedRole !== UserRole.ADMIN) {
      return NextResponse.json(
        { success: false, message: "权限不足：仅管理员可执行此操作" },
        { status: 403 }
      )
    }

    // ── 3. 事务删除：先历史流水，再工单主表 ──────────────────────────
    //    顺序严格遵守外键依赖方向，确保不报约束错误
    const [deletedHistory, deletedTickets] = await prisma.$transaction([
      prisma.repair_Ticket_History.deleteMany(),
      prisma.repair_Tickets.deleteMany(),
    ])

    console.log(
      `🗑️  [clear-tickets] 清空完成 ` +
      `— 历史流水: ${deletedHistory.count} 条 ` +
      `— 工单主表: ${deletedTickets.count} 条`
    )

    return NextResponse.json({
      success: true,
      message: "清理完成",
      deletedCount: {
        history: deletedHistory.count,
        tickets: deletedTickets.count,
      },
    })
  } catch (error: any) {
    console.error("❌ [clear-tickets] 清空失败:", error)
    return NextResponse.json(
      { success: false, message: error.message || "清空失败，请稍后重试" },
      { status: 500 }
    )
  }
}
