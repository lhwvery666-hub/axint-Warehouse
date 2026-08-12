import { NextResponse } from "next/server"
import * as sql from "mssql"
import { z } from "zod"
import { getDbConnection } from "@/lib/db-config"
import {
  FinalOutcome,
  FINAL_OUTCOME_LABELS,
  TicketActionType,
  TicketStatus,
  UserRole,
} from "@/lib/enums"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"
import { sumDeviceQuantity } from "@/lib/device-quantity"

const batchIdSchema = z.string().trim().min(1).max(100)

interface RepairDeviceRow {
  Id: number
  Status: string
  DeviceSN: string | null
  quantity: number | null
  RepairReportContent: string | null
  RepairCost: number | null
}

interface ParsedRepairDevice extends RepairDeviceRow {
  finalOutcome: FinalOutcome | null
}

async function rollback(transaction: sql.Transaction | null): Promise<null> {
  if (!transaction) return null
  try {
    await transaction.rollback()
  } catch (rollbackError) {
    console.error("[Complete Repair Batch] 事务回滚失败:", rollbackError)
  }
  return null
}

function parseFinalOutcome(content: string | null): FinalOutcome | null {
  if (!content) return null
  try {
    const parsed: unknown = JSON.parse(content)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
    const value = (parsed as Record<string, unknown>).finalOutcome
    return Object.values(FinalOutcome).includes(value as FinalOutcome)
      ? value as FinalOutcome
      : null
  } catch {
    return null
  }
}

// POST /api/tickets/complete-repair-batch/[batchId]
// Advance-only endpoint: final outcomes and costs must already be saved.
export async function POST(
  _request: Request,
  context: { params: Promise<{ batchId: string }> }
) {
  const authResult = await checkUserRole([UserRole.ADMIN, UserRole.TECHNICIAN])
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
      .query<RepairDeviceRow>(`
        SELECT [Id], [Status], [DeviceSN], [Quantity] AS [quantity],
               [RepairReportContent], [RepairCost]
        FROM [dbo].[Repair_Tickets] WITH (UPDLOCK, HOLDLOCK)
        WHERE [BatchId] = @batchId AND [Status] <> 'Deleted'
        ORDER BY [Id] ASC;
      `)
    const devices: ParsedRepairDevice[] = devicesResult.recordset.map(device => ({
      ...device,
      finalOutcome: parseFinalOutcome(device.RepairReportContent),
    }))
    if (devices.length === 0) {
      transaction = await rollback(transaction)
      return NextResponse.json({ success: false, message: "批次工单不存在" }, { status: 404 })
    }
    const repairingStatuses = new Set<string>([
      TicketStatus.TECHNICIAN_REPAIRING,
      TicketStatus.FACTORY_FINISHED,
    ])
    if (devices.some(device => !repairingStatuses.has(device.Status))) {
      transaction = await rollback(transaction)
      return NextResponse.json(
        { success: false, message: "批次状态已变化，请刷新页面后重试" },
        { status: 409 }
      )
    }
    const missingOutcomes = devices.filter(device => !device.finalOutcome)
    if (missingOutcomes.length > 0) {
      transaction = await rollback(transaction)
      return NextResponse.json(
        {
          success: false,
          message: `还有 ${sumDeviceQuantity(missingOutcomes)} 台设备未保存最终处理结果，请先点击“保存信息”`,
        },
        { status: 400 }
      )
    }

    const totalCost = devices.reduce((sum, device) => sum + Number(device.RepairCost || 0), 0)
    const isFreeBatch = totalCost === 0
    const nextStatus = isFreeBatch
      ? TicketStatus.WAREHOUSE_SHIPPING
      : TicketStatus.BUSINESS_REVIEW
    const operatorName = authResult.realName || authResult.username

    for (const device of devices) {
      const updateResult = await new sql.Request(transaction)
        .input("deviceId", sql.Int, device.Id)
        .input("expectedStatus", sql.NVarChar(50), device.Status)
        .input("newStatus", sql.NVarChar(50), nextStatus)
        .input("operatorName", sql.NVarChar(100), operatorName)
        .input("isChargeable", sql.Bit, isFreeBatch ? 0 : 1)
        .input("paymentSatisfied", sql.Bit, isFreeBatch ? 1 : 0)
        .input("businessOperator", sql.NVarChar(100), isFreeBatch ? "系统自动（免费维修）" : null)
        .query(`
          UPDATE [dbo].[Repair_Tickets]
          SET [Status] = @newStatus,
              [IsChargeable] = @isChargeable,
              [IsPaymentReceived] = CASE WHEN @isChargeable = 0 THEN @paymentSatisfied ELSE [IsPaymentReceived] END,
              [TechnicianCompletedAt] = GETUTCDATE(),
              [TechnicianCompletedBy] = @operatorName,
              [BusinessReviewedAt] = CASE WHEN @isChargeable = 0 THEN GETUTCDATE() ELSE [BusinessReviewedAt] END,
              [BusinessReviewedBy] = CASE WHEN @isChargeable = 0 THEN @businessOperator ELSE [BusinessReviewedBy] END,
              [UpdatedAt] = GETUTCDATE()
          WHERE [Id] = @deviceId AND [Status] = @expectedStatus;
        `)
      if (updateResult.rowsAffected[0] !== 1) {
        transaction = await rollback(transaction)
        return NextResponse.json(
          { success: false, message: "批次状态已被其他操作更新，请刷新后重试" },
          { status: 409 }
        )
      }
    }

    const deviceCount = sumDeviceQuantity(devices)
    const completedCount = sumDeviceQuantity(devices.filter(device => device.finalOutcome === FinalOutcome.COMPLETED))
    const scrappedCount = sumDeviceQuantity(devices.filter(device => device.finalOutcome === FinalOutcome.SCRAPPED))
    const returnCount = sumDeviceQuantity(devices.filter(device => device.finalOutcome === FinalOutcome.RETURN_UNREPAIRED))
    const outcomeSummary = devices
      .map(device => `${device.DeviceSN || device.Id}（${FINAL_OUTCOME_LABELS[device.finalOutcome!]}）`)
      .join("、")

    const sourceStatusSummary = [...new Set(devices.map(device => device.Status))].join("|")
    await new sql.Request(transaction)
      .input("batchId", sql.NVarChar(100), batchId)
      .input("actionType", sql.NVarChar(50), TicketActionType.TECHNICIAN_COMPLETED)
      .input("operatorId", sql.Int, operatorId)
      .input("operatorName", sql.NVarChar(100), operatorName)
      .input("description", sql.NVarChar(sql.MAX), `维修发送流程，共 ${deviceCount} 台：${outcomeSummary}`)
      .input("oldStatus", sql.NVarChar(50), sourceStatusSummary)
      .input("newStatus", sql.NVarChar(50), nextStatus)
      .query(`
        INSERT INTO [dbo].[Repair_Ticket_History] (
          [BatchId], [ActionType], [OperatorId], [OperatorName], [Description],
          [OldStatus], [NewStatus], [CreatedAt]
        ) VALUES (
          @batchId, @actionType, @operatorId, @operatorName, @description,
          @oldStatus, @newStatus, GETUTCDATE()
        );
      `)

    if (isFreeBatch) {
      await new sql.Request(transaction)
        .input("batchId", sql.NVarChar(100), batchId)
        .input("actionType", sql.NVarChar(50), TicketActionType.BUSINESS_REVIEW_SKIPPED)
        .input("operatorName", sql.NVarChar(100), "系统自动（免费维修）")
        .input("description", sql.NVarChar(sql.MAX), `批次总费用为 0，自动进入待仓库发货，共 ${deviceCount} 台设备`)
        .input("oldStatus", sql.NVarChar(50), sourceStatusSummary)
        .input("newStatus", sql.NVarChar(50), TicketStatus.WAREHOUSE_SHIPPING)
        .query(`
          INSERT INTO [dbo].[Repair_Ticket_History] (
            [BatchId], [ActionType], [OperatorName], [Description],
            [OldStatus], [NewStatus], [CreatedAt]
          ) VALUES (
            @batchId, @actionType, @operatorName, @description,
            @oldStatus, @newStatus, GETUTCDATE()
          );
        `)
    }

    await transaction.commit()
    transaction = null
    return NextResponse.json({
      success: true,
      message: isFreeBatch
        ? "发送流程成功：免费维修已进入待仓库发货"
        : "发送流程成功：收费维修已进入待商务审核",
      data: {
        batchId,
        deviceCount,
        completedCount,
        scrappedCount,
        returnCount,
        totalCost,
        businessReviewSkipped: isFreeBatch,
        newStatus: nextStatus,
      },
    })
  } catch (error: unknown) {
    console.error("[Complete Repair Batch] 发送流程失败:", error)
    transaction = await rollback(transaction)
    return NextResponse.json(
      { success: false, message: "发送流程失败，请稍后重试" },
      { status: 500 }
    )
  }
}
