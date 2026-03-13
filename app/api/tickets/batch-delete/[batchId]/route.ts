import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"
import { DB_FIELDS, UserRole, TicketStatus } from "@/lib/enums"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"

// DELETE /api/tickets/batch-delete/[batchId]
// 现场人员硬删除已取消的批次工单
export async function DELETE(
  request: Request,
  context: { params: Promise<{ batchId: string }> } | { params: { batchId: string } }
) {
  try {
    // 1. 权限验证（第一行，遵守 cursorrules）
    const authCheck = await checkUserRole([UserRole.REPORTER, UserRole.ADMIN])
    if (isErrorResponse(authCheck)) {
      console.error("❌ [删除工单] 权限验证失败")
      return authCheck
    }

    // 2. 解析参数
    const resolvedParams =
      "then" in (context as any).params
        ? await (context as { params: Promise<{ batchId: string }> }).params
        : (context as { params: { batchId: string } }).params

    const batchId = resolvedParams.batchId

    if (!batchId) {
      return NextResponse.json(
        { success: false, message: "批次号不能为空" },
        { status: 400 }
      )
    }

    console.log("🗑️ [删除工单] 开始删除", { batchId, userId: authCheck.userId })

    const pool = await getDbConnection()

    // 3. 验证批次状态（只能删除已取消的工单）
    const statusResult = await pool
      .request()
      .input("batchId", batchId)
      .query(`
        SELECT TOP 1 ${DB_FIELDS.STATUS}
        FROM Repair_Tickets
        WHERE ${DB_FIELDS.BATCH_ID} = @batchId
      `)

    if (statusResult.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "批次工单不存在" },
        { status: 404 }
      )
    }

    const currentStatus = statusResult.recordset[0][DB_FIELDS.STATUS]
    if (currentStatus !== TicketStatus.CANCELLED && currentStatus !== "Cancelled") {
      return NextResponse.json(
        { success: false, message: "只能删除已取消的工单" },
        { status: 400 }
      )
    }

    // 4. 硬删除（不保留数据）
    const deleteResult = await pool
      .request()
      .input("batchId", batchId)
      .query(`
        DELETE FROM Repair_Tickets
        WHERE ${DB_FIELDS.BATCH_ID} = @batchId
      `)

    const deletedCount = deleteResult.rowsAffected[0] || 0

    console.log(`✅ [删除工单] 成功删除 ${deletedCount} 台设备`)

    return NextResponse.json({
      success: true,
      message: `批次工单已删除，共删除 ${deletedCount} 台设备`,
      data: {
        batchId,
        deletedCount
      }
    })

  } catch (error: unknown) {
    console.error("❌ [删除工单] 失败:", error)
    const errorMessage = error instanceof Error ? error.message : "删除工单失败"
    return NextResponse.json(
      { 
        success: false, 
        message: errorMessage
      },
      { status: 500 }
    )
  }
}
