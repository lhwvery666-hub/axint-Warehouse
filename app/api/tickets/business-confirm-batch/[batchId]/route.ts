import { NextResponse } from "next/server"
import * as sql from "mssql"
import { z } from "zod"
import { getDbConnection } from "@/lib/db-config"
import { TicketActionType, TicketStatus, UserRole } from "@/lib/enums"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"
import { sumDeviceQuantity } from "@/lib/device-quantity"

const batchIdSchema = z.string().trim().min(1).max(100)

interface BusinessDeviceRow {
  Id: number
  Status: string
  quantity: number | null
  IsChargeable: boolean | number | null
  IsPaymentReceived: boolean | number | null
  IsInvoiced: boolean | number | null
  RepairCost: number | null
}

async function rollback(transaction: sql.Transaction | null): Promise<null> {
  if (!transaction) return null
  try {
    await transaction.rollback()
  } catch (rollbackError) {
    console.error("[Business Confirm] 事务回滚失败:", rollbackError)
  }
  return null
}

// POST /api/tickets/business-confirm-batch/[batchId]
// Advance-only endpoint: business fields must already have been saved.
export async function POST(
  _request: Request,
  context: { params: Promise<{ batchId: string }> }
) {
  const authResult = await checkUserRole([UserRole.ADMIN, UserRole.BUSINESS])
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
      .query<BusinessDeviceRow>(`
        SELECT [Id], [Status], [Quantity] AS [quantity], [IsChargeable],
               [IsPaymentReceived], [IsInvoiced], [RepairCost]
        FROM [dbo].[Repair_Tickets] WITH (UPDLOCK, HOLDLOCK)
        WHERE [BatchId] = @batchId AND [Status] <> 'Deleted'
        ORDER BY [Id] ASC;
      `)
    const devices = devicesResult.recordset
    if (devices.length === 0) {
      transaction = await rollback(transaction)
      return NextResponse.json({ success: false, message: "批次工单不存在" }, { status: 404 })
    }
    if (devices.some(device => device.Status !== TicketStatus.BUSINESS_REVIEW)) {
      transaction = await rollback(transaction)
      return NextResponse.json(
        { success: false, message: "批次状态已变化，请刷新页面后重试" },
        { status: 409 }
      )
    }
    const businessInfo = devices[0]
    if (Boolean(businessInfo.IsChargeable) && (businessInfo.RepairCost === null || businessInfo.RepairCost < 0)) {
      transaction = await rollback(transaction)
      return NextResponse.json(
        { success: false, message: "请先点击“保存信息”并填写维修费用" },
        { status: 400 }
      )
    }

    const operatorName = authResult.realName || authResult.username
    const updateResult = await new sql.Request(transaction)
      .input("batchId", sql.NVarChar(100), batchId)
      .input("expectedStatus", sql.NVarChar(50), TicketStatus.BUSINESS_REVIEW)
      .input("newStatus", sql.NVarChar(50), TicketStatus.WAREHOUSE_SHIPPING)
      .input("operatorName", sql.NVarChar(100), operatorName)
      .query(`
        UPDATE [dbo].[Repair_Tickets]
        SET [Status] = @newStatus,
            [BusinessReviewedAt] = GETUTCDATE(),
            [BusinessReviewedBy] = @operatorName,
            [UpdatedAt] = GETUTCDATE()
        WHERE [BatchId] = @batchId AND [Status] = @expectedStatus;
      `)
    if (updateResult.rowsAffected[0] !== devices.length) {
      transaction = await rollback(transaction)
      return NextResponse.json(
        { success: false, message: "批次状态已被其他操作更新，请刷新后重试" },
        { status: 409 }
      )
    }

    const deviceCount = sumDeviceQuantity(devices)
    const chargeDescription = Boolean(businessInfo.IsChargeable)
      ? `有偿维修，${Boolean(businessInfo.IsPaymentReceived) ? "已收款" : "未收款"}，${Boolean(businessInfo.IsInvoiced) ? "已开票" : "未开票"}`
      : "免费维修"
    await new sql.Request(transaction)
      .input("batchId", sql.NVarChar(100), batchId)
      .input("actionType", sql.NVarChar(50), TicketActionType.BUSINESS_REVIEWED)
      .input("operatorId", sql.Int, operatorId)
      .input("operatorName", sql.NVarChar(100), operatorName)
      .input("description", sql.NVarChar(sql.MAX), `商务发送流程（${chargeDescription}），共 ${deviceCount} 台设备`)
      .input("oldStatus", sql.NVarChar(50), TicketStatus.BUSINESS_REVIEW)
      .input("newStatus", sql.NVarChar(50), TicketStatus.WAREHOUSE_SHIPPING)
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
      message: `发送流程成功，共 ${deviceCount} 台设备进入待仓库发货`,
      data: { batchId, deviceCount, newStatus: TicketStatus.WAREHOUSE_SHIPPING },
    })
  } catch (error: unknown) {
    console.error("[Business Confirm] 发送流程失败:", error)
    transaction = await rollback(transaction)
    return NextResponse.json(
      { success: false, message: "发送流程失败，请稍后重试" },
      { status: 500 }
    )
  }
}
