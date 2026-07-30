import { NextResponse } from "next/server"
import * as sql from "mssql"
import { z } from "zod"
import { getDbConnection } from "@/lib/db-config"
import { TicketActionType, TicketStatus, UserRole } from "@/lib/enums"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"
import { sumDeviceQuantity } from "@/lib/device-quantity"

const batchIdSchema = z.string().trim().min(1).max(100)

interface DeletedBatchRow {
  Id: number
  quantity: number | null
  TicketId: string | null
  Status: string
}

// DELETE /api/tickets/batch-delete/[batchId]
// 现场人员只能硬删除自己创建且整批均已取消的工单；管理员可删除任意已取消批次。
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ batchId: string }> }
) {
  const authResult = await checkUserRole([UserRole.REPORTER, UserRole.ADMIN])
  if (isErrorResponse(authResult)) return authResult

  let transaction: sql.Transaction | null = null
  try {
    const parsedBatchId = batchIdSchema.safeParse((await context.params).batchId)
    if (!parsedBatchId.success) {
      return NextResponse.json(
        { success: false, message: "批次号无效" },
        { status: 400 }
      )
    }

    const batchId = parsedBatchId.data
    const operatorId = Number(authResult.userId)
    if (!Number.isSafeInteger(operatorId)) {
      return NextResponse.json(
        { success: false, message: "登录身份无效" },
        { status: 401 }
      )
    }

    const pool = await getDbConnection()
    transaction = new sql.Transaction(pool)
    await transaction.begin()

    const reporterOwnershipFailure = authResult.normalizedRole === UserRole.REPORTER
      ? "OR [guard].[ReportByUserID] <> @operatorId OR [guard].[ReportByUserID] IS NULL"
      : ""

    const deleteResult = await new sql.Request(transaction)
      .input("batchId", sql.NVarChar(100), batchId)
      .input("operatorId", sql.Int, operatorId)
      .input("cancelledStatus", sql.NVarChar(50), TicketStatus.CANCELLED)
      .query<DeletedBatchRow>(`
        DELETE [target]
        OUTPUT deleted.[Id], deleted.[Quantity] AS [quantity], deleted.[TicketId], deleted.[Status]
        FROM [dbo].[Repair_Tickets] AS [target]
        WHERE [target].[BatchId] = @batchId
          AND NOT EXISTS (
            SELECT 1
            FROM [dbo].[Repair_Tickets] AS [guard] WITH (UPDLOCK, HOLDLOCK)
            WHERE [guard].[BatchId] = @batchId
              AND (
                [guard].[Status] <> @cancelledStatus
                ${reporterOwnershipFailure}
              )
          );
      `)

    if (deleteResult.recordset.length === 0) {
      await transaction.rollback()
      transaction = null
      return NextResponse.json(
        { success: false, message: "批次不存在、状态并非全部已取消，或您无权删除" },
        { status: 409 }
      )
    }
    const deletedDeviceCount = sumDeviceQuantity(deleteResult.recordset)

    await new sql.Request(transaction)
      .input("batchId", sql.NVarChar(100), batchId)
      .input("actionType", sql.NVarChar(50), TicketActionType.STATUS_CHANGE)
      .input("oldStatus", sql.NVarChar(50), TicketStatus.CANCELLED)
      .input("newStatus", sql.NVarChar(50), TicketStatus.DELETED)
      .input("operatorId", sql.Int, operatorId)
      .input("operatorName", sql.NVarChar(100), authResult.realName || authResult.username)
      .input("description", sql.NVarChar(sql.MAX), `物理删除已取消批次，共 ${deletedDeviceCount} 台设备`)
      .query(`
        INSERT INTO [dbo].[Repair_Ticket_History] (
          [BatchId], [ActionType], [OldStatus], [NewStatus],
          [OperatorId], [OperatorName], [Description], [CreatedAt]
        )
        VALUES (
          @batchId, @actionType, @oldStatus, @newStatus,
          @operatorId, @operatorName, @description, GETUTCDATE()
        );
      `)

    await transaction.commit()
    transaction = null

    return NextResponse.json({
      success: true,
      message: `批次工单已删除，共删除 ${deletedDeviceCount} 台设备`,
      data: { batchId, deletedCount: deletedDeviceCount },
    })
  } catch (error: unknown) {
    console.error("[Batch Delete API] 删除失败:", error)
    if (transaction) {
      try {
        await transaction.rollback()
      } catch (rollbackError) {
        console.error("[Batch Delete API] 事务回滚失败:", rollbackError)
      } finally {
        transaction = null
      }
    }
    return NextResponse.json(
      { success: false, message: "删除批次失败，请稍后重试" },
      { status: 500 }
    )
  }
}
