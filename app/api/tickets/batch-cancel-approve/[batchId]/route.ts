import { NextResponse } from "next/server"
import * as sql from "mssql"
import { z } from "zod"
import { getDbConnection } from "@/lib/db-config"
import { TicketActionType, TicketStatus, UserRole } from "@/lib/enums"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"

const decisionSchema = z.object({
  approve: z.boolean(),
  userId: z.unknown().optional(),
}).strict()
const batchIdSchema = z.string().trim().min(1).max(100)

interface ApprovalGuardRow {
  Id: number
  Status: string
  CancelRequestStatus: string | null
}

export async function POST(
  request: Request,
  context: { params: Promise<{ batchId: string }> }
) {
  const authResult = await checkUserRole([UserRole.BUSINESS, UserRole.ADMIN])
  if (isErrorResponse(authResult)) return authResult

  let transaction: sql.Transaction | null = null
  try {
    const parsedBody = decisionSchema.safeParse(await request.json().catch(() => null))
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
      .query<ApprovalGuardRow>(`
        SELECT [Id], [Status], [CancelRequestStatus]
        FROM [dbo].[Repair_Tickets] WITH (UPDLOCK, HOLDLOCK)
        WHERE [BatchId] = @batchId;
      `)
    if (guard.recordset.length === 0) {
      await transaction.rollback()
      transaction = null
      return NextResponse.json({ success: false, message: "批次工单不存在" }, { status: 404 })
    }
    if (guard.recordset.some((row) =>
      row.CancelRequestStatus !== "Pending" ||
      [TicketStatus.COMPLETED, TicketStatus.CANCELLED, TicketStatus.DELETED].includes(row.Status as TicketStatus)
    )) {
      await transaction.rollback()
      transaction = null
      return NextResponse.json(
        { success: false, message: "取消申请已被处理或批次状态已变化" },
        { status: 409 }
      )
    }

    const approved = parsedBody.data.approve
    const decision = approved ? "Approved" : "Rejected"
    const operatorName = authResult.realName || authResult.username
    const updateResult = await new sql.Request(transaction)
      .input("batchId", sql.NVarChar(100), batchId)
      .input("decision", sql.NVarChar(50), decision)
      .input("operatorName", sql.NVarChar(100), operatorName)
      .query(`
        UPDATE [dbo].[Repair_Tickets]
        SET [CancelRequestStatus] = @decision,
            [CancelApprovedBy] = @operatorName,
            [CancelApprovedDate] = GETUTCDATE(),
            [Status] = CASE WHEN @decision = 'Approved' THEN 'Cancelled' ELSE [Status] END,
            [UpdatedAt] = GETUTCDATE()
        WHERE [BatchId] = @batchId
          AND [CancelRequestStatus] = 'Pending'
          AND [Status] NOT IN ('Completed', 'Cancelled', 'Deleted');
      `)
    if (updateResult.rowsAffected[0] !== guard.recordset.length) {
      throw new Error("BATCH_CONFLICT")
    }

    await new sql.Request(transaction)
      .input("batchId", sql.NVarChar(100), batchId)
      .input("actionType", sql.NVarChar(50), approved ? TicketActionType.CANCEL_APPROVED : TicketActionType.CANCEL_REJECTED)
      .input("oldStatus", sql.NVarChar(50), guard.recordset[0].Status)
      .input("newStatus", sql.NVarChar(50), approved ? TicketStatus.CANCELLED : guard.recordset[0].Status)
      .input("operatorId", sql.Int, operatorId)
      .input("operatorName", sql.NVarChar(100), operatorName)
      .input("description", sql.NVarChar(sql.MAX), approved ? "批准批次取消申请" : "拒绝批次取消申请")
      .query(`
        INSERT INTO [dbo].[Repair_Ticket_History] (
          [BatchId], [ActionType], [OldStatus], [NewStatus],
          [OperatorId], [OperatorName], [Description], [CreatedAt]
        ) VALUES (
          @batchId, @actionType, @oldStatus, @newStatus,
          @operatorId, @operatorName, @description, GETUTCDATE()
        );
      `)
    await transaction.commit()
    transaction = null
    return NextResponse.json({
      success: true,
      message: approved
        ? `批次取消申请已批准，共 ${guard.recordset.length} 台设备已取消`
        : `批次取消申请已拒绝，共 ${guard.recordset.length} 台设备继续正常流程`,
      data: { batchId, deviceCount: guard.recordset.length },
    })
  } catch (error: unknown) {
    console.error("[Batch Cancel Approval API] 处理失败:", error)
    if (transaction) {
      try { await transaction.rollback() } catch (rollbackError) {
        console.error("[Batch Cancel Approval API] 事务回滚失败:", rollbackError)
      } finally { transaction = null }
    }
    const status = error instanceof Error && error.message === "BATCH_CONFLICT" ? 409 : 500
    const message = status === 409 ? "批次状态已变化，请刷新后重试" : "处理取消申请失败"
    return NextResponse.json({ success: false, message }, { status })
  }
}
