import { NextResponse } from "next/server"
import * as sql from "mssql"
import { z } from "zod"
import { getDbConnection } from "@/lib/db-config"
import { TicketActionType, UserRole } from "@/lib/enums"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"
import { sumDeviceQuantity } from "@/lib/device-quantity"

const requestSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
  userId: z.unknown().optional(),
}).strict()
const batchIdSchema = z.string().trim().min(1).max(100)

interface CancelGuardRow {
  Id: number
  quantity: number | null
  Status: string
  ReportByUserID: number | null
  CancelRequestStatus: string | null
}

export async function POST(
  request: Request,
  context: { params: Promise<{ batchId: string }> }
) {
  const authResult = await checkUserRole([UserRole.REPORTER, UserRole.ADMIN])
  if (isErrorResponse(authResult)) return authResult

  let transaction: sql.Transaction | null = null
  try {
    const parsedBody = requestSchema.safeParse(await request.json().catch(() => null))
    const parsedBatchId = batchIdSchema.safeParse((await context.params).batchId)
    if (!parsedBody.success || !parsedBatchId.success) {
      return NextResponse.json({ success: false, message: "请求参数无效" }, { status: 400 })
    }
    const batchId = parsedBatchId.data
    const operatorId = Number(authResult.userId)
    if (!Number.isSafeInteger(operatorId)) {
      return NextResponse.json({ success: false, message: "登录身份无效" }, { status: 401 })
    }

    const pool = await getDbConnection()
    transaction = new sql.Transaction(pool)
    await transaction.begin()
    const guard = await new sql.Request(transaction)
      .input("batchId", sql.NVarChar(100), batchId)
      .query<CancelGuardRow>(`
        SELECT [Id], [Quantity] AS [quantity], [Status], [ReportByUserID], [CancelRequestStatus]
        FROM [dbo].[Repair_Tickets] WITH (UPDLOCK, HOLDLOCK)
        WHERE [BatchId] = @batchId;
      `)
    if (guard.recordset.length === 0) {
      await transaction.rollback()
      transaction = null
      return NextResponse.json({ success: false, message: "批次工单不存在" }, { status: 404 })
    }
    if (
      authResult.normalizedRole === UserRole.REPORTER &&
      guard.recordset.some((row) => row.ReportByUserID !== operatorId)
    ) {
      await transaction.rollback()
      transaction = null
      return NextResponse.json({ success: false, message: "您无权取消该批次" }, { status: 403 })
    }
    if (guard.recordset.some((row) =>
      ["Completed", "Cancelled", "Scrapped", "Deleted"].includes(row.Status) ||
      row.CancelRequestStatus === "Pending"
    )) {
      await transaction.rollback()
      transaction = null
      return NextResponse.json(
        { success: false, message: "批次状态已变化或已有待审批取消申请" },
        { status: 409 }
      )
    }

    const updateResult = await new sql.Request(transaction)
      .input("batchId", sql.NVarChar(100), batchId)
      .input("reason", sql.NVarChar(sql.MAX), parsedBody.data.reason)
      .query(`
        UPDATE [dbo].[Repair_Tickets]
        SET [CancelRequestStatus] = 'Pending',
            [CancelRequestReason] = @reason,
            [CancelRequestDate] = GETUTCDATE(),
            [UpdatedAt] = GETUTCDATE()
        WHERE [BatchId] = @batchId
          AND [Status] NOT IN ('Completed', 'Cancelled', 'Scrapped', 'Deleted')
          AND ISNULL([CancelRequestStatus], '') <> 'Pending';
      `)
    if (updateResult.rowsAffected[0] !== guard.recordset.length) {
      throw new Error("BATCH_CONFLICT")
    }
    const deviceCount = sumDeviceQuantity(guard.recordset)

    await new sql.Request(transaction)
      .input("batchId", sql.NVarChar(100), batchId)
      .input("actionType", sql.NVarChar(50), TicketActionType.CANCEL_REQUEST)
      .input("operatorId", sql.Int, operatorId)
      .input("operatorName", sql.NVarChar(100), authResult.realName || authResult.username)
      .input("description", sql.NVarChar(sql.MAX), `申请取消批次：${parsedBody.data.reason}`)
      .query(`
        INSERT INTO [dbo].[Repair_Ticket_History] (
          [BatchId], [ActionType], [OperatorId], [OperatorName], [Description], [CreatedAt]
        ) VALUES (@batchId, @actionType, @operatorId, @operatorName, @description, GETUTCDATE());
      `)
    await transaction.commit()
    transaction = null
    return NextResponse.json({
      success: true,
      message: `批次工单取消申请已提交，共 ${deviceCount} 台设备等待审批`,
      data: { batchId, deviceCount },
    })
  } catch (error: unknown) {
    console.error("[Batch Cancel API] 申请失败:", error)
    if (transaction) {
      try { await transaction.rollback() } catch (rollbackError) {
        console.error("[Batch Cancel API] 事务回滚失败:", rollbackError)
      } finally { transaction = null }
    }
    const status = error instanceof Error && error.message === "BATCH_CONFLICT" ? 409 : 500
    const message = status === 409 ? "批次状态已变化，请刷新后重试" : "申请取消批次失败"
    return NextResponse.json({ success: false, message }, { status })
  }
}
