import { NextResponse } from "next/server"
import * as sql from "mssql"
import { z } from "zod"
import { getDbConnection } from "@/lib/db-config"
import { TicketActionType, TicketStatus, UserRole } from "@/lib/enums"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"

const deviceIdSchema = z.coerce.number().int().positive()

interface FactoryTransferRow {
  Id: number
  TicketId: string | null
  BatchId: string | null
  DeviceSN: string | null
  ModelName: string | null
  Quantity: number | null
  Status: string
  SignedReportPhoto: string | null
}

interface FactoryTransferUpdateRow {
  Id: number
  OldStatus: string
  NewStatus: string
}

async function rollback(transaction: sql.Transaction | null): Promise<null> {
  if (!transaction) return null
  try {
    await transaction.rollback()
  } catch (rollbackError: unknown) {
    console.error("[Warehouse Factory Transfer] 事务回滚失败:", rollbackError)
  }
  return null
}

// POST /api/tickets/warehouse-factory-transfer-devices/[id]
// 仓库核对单台返厂设备后，移交维修人员继续维修作业并确认最终结果。
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authResult = await checkUserRole([UserRole.ADMIN, UserRole.WAREHOUSE])
  if (isErrorResponse(authResult)) return authResult

  let transaction: sql.Transaction | null = null
  try {
    const parsedId = deviceIdSchema.safeParse((await context.params).id)
    if (!parsedId.success) {
      return NextResponse.json(
        { success: false, message: "设备编号无效" },
        { status: 400 }
      )
    }

    const operatorId = Number(authResult.userId)
    if (!Number.isSafeInteger(operatorId)) {
      return NextResponse.json(
        { success: false, message: "登录身份无效" },
        { status: 401 }
      )
    }

    const pool = await getDbConnection()
    transaction = new sql.Transaction(pool)
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE)

    const deviceResult = await new sql.Request(transaction)
      .input("deviceId", sql.Int, parsedId.data)
      .query<FactoryTransferRow>(`
        SELECT [Id], [TicketId], [BatchId], [DeviceSN], [ModelName], [Quantity],
               [Status], [SignedReportPhoto]
        FROM [dbo].[Repair_Tickets] WITH (UPDLOCK, HOLDLOCK)
        WHERE [Id] = @deviceId;
      `)
    const device = deviceResult.recordset[0]
    if (!device) {
      transaction = await rollback(transaction)
      return NextResponse.json(
        { success: false, message: "返厂设备不存在" },
        { status: 404 }
      )
    }
    if (device.Status !== TicketStatus.PENDING_FACTORY) {
      transaction = await rollback(transaction)
      return NextResponse.json(
        { success: false, message: "设备状态已变化，请刷新后重试" },
        { status: 409 }
      )
    }
    if (!device.SignedReportPhoto?.trim()) {
      transaction = await rollback(transaction)
      return NextResponse.json(
        { success: false, message: "现场签字凭证尚未回传，当前设备不能执行返厂移交" },
        { status: 409 }
      )
    }

    const updateResult = await new sql.Request(transaction)
      .input("deviceId", sql.Int, device.Id)
      .input("expectedStatus", sql.NVarChar(50), TicketStatus.PENDING_FACTORY)
      .input("newStatus", sql.NVarChar(50), TicketStatus.TECHNICIAN_REPAIRING)
      .query<FactoryTransferUpdateRow>(`
        UPDATE [dbo].[Repair_Tickets]
        SET [Status] = @newStatus,
            [FactoryReceivedDate] = GETUTCDATE(),
            [UpdatedAt] = GETUTCDATE()
        OUTPUT inserted.[Id] AS [Id],
               deleted.[Status] AS [OldStatus],
               inserted.[Status] AS [NewStatus]
        WHERE [Id] = @deviceId AND [Status] = @expectedStatus;
      `)
    const updated = updateResult.recordset[0]
    if (!updated || updateResult.rowsAffected[0] !== 1) {
      transaction = await rollback(transaction)
      return NextResponse.json(
        { success: false, message: "设备状态已变化或请求重复，请刷新后重试" },
        { status: 409 }
      )
    }

    const deviceLabel = [device.DeviceSN, device.ModelName]
      .filter((value): value is string => Boolean(value?.trim()))
      .join(" / ") || `设备 ${device.Id}`
    const quantity = Number.isFinite(Number(device.Quantity)) && Number(device.Quantity) > 0
      ? Math.trunc(Number(device.Quantity))
      : 1

    await new sql.Request(transaction)
      .input("ticketId", sql.NVarChar(50), device.TicketId ?? String(device.Id))
      .input("batchId", sql.NVarChar(100), device.BatchId)
      .input("actionType", sql.NVarChar(50), TicketActionType.FACTORY_RETURN_CONFIRMED)
      .input("oldStatus", sql.NVarChar(50), updated.OldStatus)
      .input("newStatus", sql.NVarChar(50), updated.NewStatus)
      .input("operatorId", sql.Int, operatorId)
      .input("operatorName", sql.NVarChar(100), authResult.realName || authResult.username)
      .input(
        "description",
        sql.NVarChar(sql.MAX),
        `仓库已核对返厂设备并移交维修人员继续维修作业：${deviceLabel}（${quantity} 台）`
      )
      .query(`
        INSERT INTO [dbo].[Repair_Ticket_History] (
          [TicketID], [BatchId], [ActionType], [OldStatus], [NewStatus],
          [OperatorId], [OperatorName], [Description], [CreatedAt]
        ) VALUES (
          @ticketId, @batchId, @actionType, @oldStatus, @newStatus,
          @operatorId, @operatorName, @description, GETUTCDATE()
        );
      `)

    await transaction.commit()
    transaction = null
    return NextResponse.json({
      success: true,
      message: "设备已移交维修人员，现已回到维修作业中",
      data: { deviceId: device.Id, status: TicketStatus.TECHNICIAN_REPAIRING },
    })
  } catch (error: unknown) {
    console.error("[Warehouse Factory Transfer] 移交设备失败:", error)
    transaction = await rollback(transaction)
    return NextResponse.json(
      { success: false, message: "移交设备失败，请稍后重试" },
      { status: 500 }
    )
  }
}
