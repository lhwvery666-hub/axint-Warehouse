import { NextResponse } from "next/server"
import * as sql from "mssql"
import { z } from "zod"
import { getDbConnection } from "@/lib/db-config"
import { TicketActionType, TicketStatus, UserRole } from "@/lib/enums"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"
import { getDeviceQuantity } from "@/lib/device-quantity"

const batchIdSchema = z.string().trim().min(1).max(100)

interface WarehouseDeviceRow {
  Id: number
  Status: string
  Quantity: number | null
  ManufactureDate: Date | null
  ArrivalDate: Date | null
}

async function rollback(transaction: sql.Transaction | null): Promise<null> {
  if (!transaction) return null
  try {
    await transaction.rollback()
  } catch (rollbackError) {
    console.error("[Warehouse Confirm Batch] 事务回滚失败:", rollbackError)
  }
  return null
}

function isConfirmableWarehouseStatus(status: string): boolean {
  return [
    TicketStatus.CREATED.toLowerCase(),
    TicketStatus.WAREHOUSE_CONFIRMING.toLowerCase(),
    TicketStatus.WAREHOUSE_CONFIRMED.toLowerCase(),
  ].includes(status.trim().toLowerCase())
}

// POST /api/tickets/warehouse-confirm-batch/[batchId]
// This endpoint only advances already-saved data. It never saves form fields.
export async function POST(
  _request: Request,
  context: { params: Promise<{ batchId: string }> }
) {
  const authResult = await checkUserRole([UserRole.ADMIN, UserRole.WAREHOUSE])
  if (isErrorResponse(authResult)) return authResult

  let transaction: sql.Transaction | null = null
  try {
    const parsedBatchId = batchIdSchema.safeParse((await context.params).batchId)
    if (!parsedBatchId.success) {
      return NextResponse.json({ success: false, message: "批次号无效" }, { status: 400 })
    }

    const operatorId = Number(authResult.userId)
    if (!Number.isSafeInteger(operatorId)) {
      return NextResponse.json({ success: false, message: "登录身份无效" }, { status: 401 })
    }

    const batchId = parsedBatchId.data
    const pool = await getDbConnection()
    transaction = new sql.Transaction(pool)
    await transaction.begin()

    const lockedResult = await new sql.Request(transaction)
      .input("batchId", sql.NVarChar(100), batchId)
      .query<WarehouseDeviceRow>(`
        SELECT [Id], [Status], [Quantity], [ManufactureDate], [ArrivalDate]
        FROM [dbo].[Repair_Tickets] WITH (UPDLOCK, HOLDLOCK)
        WHERE [BatchId] = @batchId AND [Status] <> 'Deleted'
        ORDER BY [Id] ASC;
      `)
    const devices = lockedResult.recordset
    if (devices.length === 0) {
      transaction = await rollback(transaction)
      return NextResponse.json({ success: false, message: "批次不存在" }, { status: 404 })
    }

    const invalidStatuses = devices.filter(device => !isConfirmableWarehouseStatus(device.Status))
    if (invalidStatuses.length > 0) {
      transaction = await rollback(transaction)
      return NextResponse.json(
        { success: false, message: "批次状态已变化，请刷新页面后重试" },
        { status: 409 }
      )
    }

    const missingManufacture = devices.filter(device => !device.ManufactureDate)
    if (missingManufacture.length > 0) {
      const count = missingManufacture.reduce(
        (sum, device) => sum + getDeviceQuantity({ quantity: device.Quantity }),
        0
      )
      transaction = await rollback(transaction)
      return NextResponse.json(
        { success: false, message: `还有 ${count} 台设备未保存出厂日期，请先点击“保存信息”` },
        { status: 400 }
      )
    }
    const missingArrival = devices.filter(device => !device.ArrivalDate)
    if (missingArrival.length > 0) {
      const count = missingArrival.reduce(
        (sum, device) => sum + getDeviceQuantity({ quantity: device.Quantity }),
        0
      )
      transaction = await rollback(transaction)
      return NextResponse.json(
        { success: false, message: `还有 ${count} 台设备未保存到货日期，请先点击“保存信息”` },
        { status: 400 }
      )
    }

    let deviceCount = 0
    const oldStatuses = new Set<string>()
    for (const device of devices) {
      const updateResult = await new sql.Request(transaction)
        .input("ticketId", sql.Int, device.Id)
        .input("batchId", sql.NVarChar(100), batchId)
        .input("expectedStatus", sql.NVarChar(50), device.Status)
        .input("newStatus", sql.NVarChar(50), TicketStatus.IN_REPAIR)
        .input("operatorName", sql.NVarChar(100), authResult.realName || authResult.username)
        .query(`
          UPDATE [dbo].[Repair_Tickets]
          SET [Status] = @newStatus,
              [WarehouseConfirmedAt] = GETUTCDATE(),
              [WarehouseConfirmedBy] = @operatorName,
              [UpdatedAt] = GETUTCDATE()
          WHERE [Id] = @ticketId
            AND [BatchId] = @batchId
            AND [Status] = @expectedStatus;
        `)
      if (updateResult.rowsAffected[0] !== 1) {
        transaction = await rollback(transaction)
        return NextResponse.json(
          { success: false, message: "批次状态已被其他操作更新，请刷新后重试" },
          { status: 409 }
        )
      }
      oldStatuses.add(device.Status)
      deviceCount += getDeviceQuantity({ quantity: device.Quantity })
    }

    await new sql.Request(transaction)
      .input("batchId", sql.NVarChar(100), batchId)
      .input("actionType", sql.NVarChar(50), TicketActionType.WAREHOUSE_CONFIRMED)
      .input("operatorId", sql.Int, operatorId)
      .input("operatorName", sql.NVarChar(100), authResult.realName || authResult.username)
      .input("description", sql.NVarChar(sql.MAX), `仓库发送流程，共 ${deviceCount} 台设备进入维修检查中`)
      .input("oldStatus", sql.NVarChar(50), oldStatuses.size === 1 ? [...oldStatuses][0] : "Multiple")
      .input("newStatus", sql.NVarChar(50), TicketStatus.IN_REPAIR)
      .query(`
        INSERT INTO [dbo].[Repair_Ticket_History] (
          [BatchId], [ActionType], [OperatorId], [OperatorName], [Description],
          [OldStatus], [NewStatus], [CreatedAt]
        ) VALUES (
          @batchId, @actionType, @operatorId, @operatorName, @description,
          @oldStatus, @newStatus, GETUTCDATE()
        );
      `)

    await transaction.commit()
    transaction = null
    return NextResponse.json({
      success: true,
      message: `发送流程成功，共 ${deviceCount} 台设备进入维修检查中`,
      data: { batchId, deviceCount, newStatus: TicketStatus.IN_REPAIR },
    })
  } catch (error: unknown) {
    console.error("[Warehouse Confirm Batch] 发送流程失败:", error)
    transaction = await rollback(transaction)
    return NextResponse.json(
      { success: false, message: "发送流程失败，请稍后重试" },
      { status: 500 }
    )
  }
}
