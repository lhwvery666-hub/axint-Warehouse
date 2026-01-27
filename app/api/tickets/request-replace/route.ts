import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"

// POST /api/tickets/request-replace
// 现场人员申请换货：仅更新工单状态为 Replacement_Pending
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { ticketId } = body ?? {}

    if (!ticketId) {
      return NextResponse.json(
        { success: false, message: "ticketId 为必填项" },
        { status: 400 }
      )
    }

    const pool = await getDbConnection()

    // 1. 检查工单是否存在
    const ticketResult = await pool
      .request()
      .input("ticketId", ticketId)
      .query(
        `
        SELECT TOP 1 Id, Status
        FROM Repair_Tickets
        WHERE Id = @ticketId
      `
      )

    if (ticketResult.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "工单不存在" },
        { status: 404 }
      )
    }

    // 2. 更新状态为 Replacement_Pending
    await pool
      .request()
      .input("ticketId", ticketId)
      .input("status", "Replacement_Pending")
      .input("updatedAt", new Date().toISOString())
      .query(
        `
        UPDATE Repair_Tickets
        SET Status = @status,
            UpdatedAt = @updatedAt
        WHERE Id = @ticketId
      `
      )

    return NextResponse.json(
      {
        success: true,
        message: "换货申请已提交，等待仓库处理",
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error("申请换货失败:", error)
    return NextResponse.json(
      {
        success: false,
        message: "申请换货时发生错误",
        error: error?.message || "未知错误",
      },
      { status: 500 }
    )
  }
}

