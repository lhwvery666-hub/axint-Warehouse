import { NextResponse } from "next/server"
import * as sql from "mssql"
import { z } from "zod"
import { getDbConnection } from "@/lib/db-config"
import { TicketActionType, TicketStatus, UserRole } from "@/lib/enums"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"
import { buildShippingPlan, getSavedShippingAllocation, summarizeShippingPlan } from "@/lib/shipping-plan"

const batchIdSchema = z.string().trim().min(1).max(100)

interface ShippingDeviceRow {
  Id: number
  Status: string
  Quantity: number | null
  RepairReportContent: string | null
  ShippingType: string | null
  ReturnDate: Date | null
  ReturnTrackingNum: string | null
  ReturnQuantity: number | null
}

async function rollback(transaction: sql.Transaction | null): Promise<null> {
  if (!transaction) return null
  try {
    await transaction.rollback()
  } catch (rollbackError) {
    console.error("[Warehouse Shipping] 事务回滚失败:", rollbackError)
  }
  return null
}

// POST /api/tickets/warehouse-shipping-batch/[batchId]
// This endpoint only advances persisted shipping data to Completed.
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

    const devicesResult = await new sql.Request(transaction)
      .input("batchId", sql.NVarChar(100), batchId)
      .query<ShippingDeviceRow>(`
        SELECT [Id], [Status], [Quantity], [RepairReportContent], [ShippingType],
               [ReturnDate], [ReturnTrackingNum], [ReturnQuantity]
        FROM [dbo].[Repair_Tickets] WITH (UPDLOCK, HOLDLOCK)
        WHERE [BatchId] = @batchId AND [Status] <> 'Deleted'
        ORDER BY [Id] ASC;
      `)
    const devices = devicesResult.recordset
    if (devices.length === 0) {
      transaction = await rollback(transaction)
      return NextResponse.json({ success: false, message: "批次工单不存在" }, { status: 404 })
    }
    if (devices.some(device => ![TicketStatus.WAREHOUSE_SHIPPING, TicketStatus.PENDING_SHIPMENT].includes(device.Status as TicketStatus))) {
      transaction = await rollback(transaction)
      return NextResponse.json(
        { success: false, message: "批次状态已变化，请刷新页面后重试" },
        { status: 409 }
      )
    }

    let plan
    try {
      plan = buildShippingPlan(devices, devices.map(getSavedShippingAllocation))
    } catch (error: unknown) {
      transaction = await rollback(transaction)
      return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "发货分配无效" }, { status: 409 })
    }
    const summary = summarizeShippingPlan(plan)
    const shippingType = summary.shippingType
    const returning = devices.filter(device => plan.find(item => item.deviceId === device.Id)!.returnQuantity > 0)
    const saved = returning[0] ?? devices[0]
    const invalidPlan = devices.some(device => {
      const allocation = plan.find(item => item.deviceId === device.Id)!
      return !device.ShippingType || device.ReturnQuantity !== allocation.returnQuantity ||
        (allocation.returnQuantity > 0 && (!device.ReturnDate || !device.ReturnTrackingNum ||
          device.ReturnTrackingNum !== saved.ReturnTrackingNum ||
          device.ReturnDate.getTime() !== saved.ReturnDate?.getTime()))
    })
    if (invalidPlan) {
      transaction = await rollback(transaction)
      return NextResponse.json({ success: false, message: "请先保存每台设备的入库/发回分配；需返回的设备必须使用同一批物流一次发回" }, { status: 409 })
    }

    const operatorName = authResult.realName || authResult.username
    const updateResult = await new sql.Request(transaction)
      .input("batchId", sql.NVarChar(100), batchId)
      .input("expectedStatus", sql.NVarChar(50), TicketStatus.WAREHOUSE_SHIPPING)
      .input("legacyExpectedStatus", sql.NVarChar(50), TicketStatus.PENDING_SHIPMENT)
      .input("newStatus", sql.NVarChar(50), TicketStatus.COMPLETED)
      .input("operatorName", sql.NVarChar(100), operatorName)
      .query(`
        UPDATE [dbo].[Repair_Tickets]
        SET [Status] = @newStatus,
            [WarehouseShippedAt] = GETUTCDATE(),
            [WarehouseShippedBy] = @operatorName,
            [UpdatedAt] = GETUTCDATE()
        WHERE [BatchId] = @batchId
          AND [Status] IN (@expectedStatus, @legacyExpectedStatus);
      `)
    if (updateResult.rowsAffected[0] !== devices.length) {
      transaction = await rollback(transaction)
      return NextResponse.json(
        { success: false, message: "批次状态已被其他操作更新，请刷新后重试" },
        { status: 409 }
      )
    }

    const deviceCount = summary.deviceCount
    const shippingDescription = shippingType === "return"
      ? `发回客户 ${summary.returnQuantity} 台（快递单号：${saved.ReturnTrackingNum}），入库 ${summary.stockQuantity} 台`
      : "产品入库存储"
    await new sql.Request(transaction)
      .input("batchId", sql.NVarChar(100), batchId)
      .input("actionType", sql.NVarChar(50), TicketActionType.WAREHOUSE_SHIPPED)
      .input("operatorId", sql.Int, operatorId)
      .input("operatorName", sql.NVarChar(100), operatorName)
      .input("description", sql.NVarChar(sql.MAX), `仓库发送流程，${shippingDescription}，共 ${deviceCount} 台设备`)
      .input("oldStatus", sql.NVarChar(50), TicketStatus.WAREHOUSE_SHIPPING)
      .input("newStatus", sql.NVarChar(50), TicketStatus.COMPLETED)
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
      message: shippingType === "return"
        ? `发送流程成功：${summary.returnQuantity} 台已发回客户，${summary.stockQuantity} 台已入库`
        : `发送流程成功，共 ${deviceCount} 台设备已入库`,
      data: { batchId, ...summary, newStatus: TicketStatus.COMPLETED },
    })
  } catch (error: unknown) {
    console.error("[Warehouse Shipping] 发送流程失败:", error)
    transaction = await rollback(transaction)
    return NextResponse.json(
      { success: false, message: "发送流程失败，请稍后重试" },
      { status: 500 }
    )
  }
}
