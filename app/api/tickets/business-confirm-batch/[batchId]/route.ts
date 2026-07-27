import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getDbConnection } from "@/lib/db-config"
import { DB_FIELDS, TicketStatus, TicketActionType } from "@/lib/enums"

// POST /api/tickets/business-confirm-batch/[batchId]
// 商务人员确认批次工单的收款和开票
export async function POST(
  request: Request,
  context: { params: Promise<{ batchId: string }> } | { params: { batchId: string } }
) {
  try {
    const body = await request.json()
    const { isChargeable, isPaymentReceived, isInvoiced, totalCost, clientName } = body

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

    // ⚠️ 任务3：发货授权与收款/开票解耦——不再因"收费但未收款"而硬阻断状态推进。
    // 商务可以先授权发货让货物走起来，未结清的收款/开票留给"财务跟进"视图持续处理。

    // 验证用户权限
    const cookieStore = await cookies()
    const userIdCookie = cookieStore.get("userId")?.value || null
    if (!userIdCookie) {
      return NextResponse.json(
        { success: false, message: "未登录" },
        { status: 401 }
      )
    }

    const pool = await getDbConnection()

    const userResult = await pool
      .request()
      .input("userId", userIdCookie)
      .query(`
        SELECT TOP 1 Role, RealName, Username
        FROM Users
        WHERE UserID = @userId
      `)

    if (userResult.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "用户不存在" },
        { status: 403 }
      )
    }

    const userRole = userResult.recordset[0].Role || ""
    const isBusiness = userRole.toLowerCase().includes("business") || userRole === "商务" || userRole === "商务人员"

    if (!isBusiness) {
      return NextResponse.json(
        { success: false, message: "只有商务人员可以审核批次工单" },
        { status: 403 }
      )
    }

    // 查询批次中的所有设备
    const devicesResult = await pool
      .request()
      .input("batchId", batchId)
      .query(`
        SELECT ${DB_FIELDS.ID}
        FROM Repair_Tickets
        WHERE ${DB_FIELDS.BATCH_ID} = @batchId
      `)

    if (devicesResult.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "批次工单不存在" },
        { status: 404 }
      )
    }

    // 更新批次中所有设备的商务审核信息和状态
    const updatePromises = devicesResult.recordset.map(async (device: any) => {
      return pool
        .request()
        .input("ticketId", device[DB_FIELDS.ID] || device.ID)
        .input("isChargeable", isChargeable ? 1 : 0)
        .input("isPaymentReceived", isPaymentReceived ? 1 : 0)
        .input("isInvoiced", isInvoiced ? 1 : 0)
        .input("totalCost", totalCost || null)
        .input("clientName", clientName || null)
        .input("newStatus", TicketStatus.WAREHOUSE_SHIPPING)
        .input("updatedAt", new Date())
        .query(`
          UPDATE Repair_Tickets
          SET 
            ${DB_FIELDS.IS_CHARGEABLE} = @isChargeable,
            ${DB_FIELDS.IS_PAYMENT_RECEIVED} = @isPaymentReceived,
            ${DB_FIELDS.IS_INVOICED} = @isInvoiced,
            ${DB_FIELDS.REPAIR_COST} = @totalCost,
            ${DB_FIELDS.CLIENT_NAME} = @clientName,
            ${DB_FIELDS.STATUS} = @newStatus,
            ${DB_FIELDS.UPDATED_AT} = @updatedAt,
            BusinessReviewedAt = GETUTCDATE(),
            BusinessReviewedBy = '${userResult.recordset[0].RealName || userResult.recordset[0].Username}'
          WHERE ${DB_FIELDS.ID} = @ticketId
        `)
    })

    await Promise.all(updatePromises)

    // 写入操作记录（仅写一条批次级别的记录）
    try {
      const operatorName = userResult.recordset[0].RealName || userResult.recordset[0].Username || "商务人员"
      const chargeDesc = isChargeable
        ? `有偿维修，收款状态：${isPaymentReceived ? "已收款" : "未收款"}，开票：${isInvoiced ? "已开票" : "未开票"}`
        : "免费维修"

      // OperatorId 必须是合法整数，否则 SQL Server INT 列报错导致日志丢失
      const operatorIdNum = parseInt(userIdCookie, 10)
      const safeOperatorId = isNaN(operatorIdNum) ? null : operatorIdNum

      const histReq = pool
        .request()
        .input("batchId",      batchId)
        .input("actionType",   TicketActionType.BUSINESS_REVIEWED)
        .input("operatorName", operatorName)
        .input("description",  `商务审核完成（${chargeDesc}），共 ${devicesResult.recordset.length} 台设备`)
        .input("createdAt",    new Date())

      if (safeOperatorId !== null) histReq.input("operatorId", safeOperatorId)

      const insertSql = safeOperatorId !== null
        ? `INSERT INTO Repair_Ticket_History (BatchId, ActionType, OperatorId, OperatorName, Description, CreatedAt)
           VALUES (@batchId, @actionType, @operatorId, @operatorName, @description, @createdAt)`
        : `INSERT INTO Repair_Ticket_History (BatchId, ActionType, OperatorName, Description, CreatedAt)
           VALUES (@batchId, @actionType, @operatorName, @description, @createdAt)`

      await histReq.query(insertSql)
      console.log(`[Business Confirm] 操作记录已写入 Repair_Ticket_History`)
    } catch (historyErr: unknown) {
      const msg = historyErr instanceof Error ? historyErr.message : "未知错误"
      console.error(`[Business Confirm] 写入操作记录失败（非致命）: ${msg}`)
    }

    return NextResponse.json({
      success: true,
      message: `商务审核完成，共 ${devicesResult.recordset.length} 台设备`,
      data: {
        batchId,
        deviceCount: devicesResult.recordset.length
      }
    })

  } catch (error: any) {
    console.error("商务审核失败:", error)
    return NextResponse.json(
      { 
        success: false, 
        message: error.message || "商务审核失败" 
      },
      { status: 500 }
    )
  }
}
