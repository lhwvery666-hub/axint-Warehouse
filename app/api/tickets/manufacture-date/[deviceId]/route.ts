import { NextResponse } from "next/server"
import * as sql from "mssql"
import { z } from "zod"
import { getDbConnection } from "@/lib/db-config"
import { TicketActionType, UserRole } from "@/lib/enums"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"
import { isSignedRepairReport } from "@/lib/repair-report-policy"

const deviceIdSchema = z.coerce.number().int().positive()
const manufactureDateSchema = z.object({
  manufactureDate: z.string().datetime().nullable().optional(),
  warrantyStatus: z.string().trim().max(50).nullable().optional(),
}).strict()

interface DeviceRow {
  Id: number
  DeviceSN: string | null
  BatchId: string | null
  Status: string
  ManufactureDate: Date | null
  WarrantyStatus: string | null
  SignedReportPhoto: string | null
  ReporterConfirmedAt: Date | null
}

async function rollback(transaction: sql.Transaction | null): Promise<null> {
  if (!transaction) return null
  try {
    await transaction.rollback()
  } catch (rollbackError) {
    console.error("[Manufacture Date] 事务回滚失败:", rollbackError)
  }
  return null
}

// PUT /api/tickets/manufacture-date/[deviceId]
// Save-only endpoint: changing a date never changes or rolls back workflow status.
export async function PUT(
  request: Request,
  context: { params: Promise<{ deviceId: string }> }
) {
  const authResult = await checkUserRole([UserRole.ADMIN, UserRole.WAREHOUSE])
  if (isErrorResponse(authResult)) return authResult

  let transaction: sql.Transaction | null = null
  try {
    const deviceIdResult = deviceIdSchema.safeParse((await context.params).deviceId)
    const bodyResult = manufactureDateSchema.safeParse(await request.json().catch(() => null))
    if (!deviceIdResult.success || !bodyResult.success) {
      return NextResponse.json({ success: false, message: "请求参数无效" }, { status: 400 })
    }
    const operatorId = Number(authResult.userId)
    if (!Number.isSafeInteger(operatorId)) {
      return NextResponse.json({ success: false, message: "登录身份无效" }, { status: 401 })
    }

    const deviceId = deviceIdResult.data
    const pool = await getDbConnection()
    transaction = new sql.Transaction(pool)
    await transaction.begin()
    const deviceResult = await new sql.Request(transaction)
      .input("deviceId", sql.Int, deviceId)
      .query<DeviceRow>(`
        SELECT [Id], [DeviceSN], [BatchId], [Status], [ManufactureDate],
               [WarrantyStatus], [SignedReportPhoto], [ReporterConfirmedAt]
        FROM [dbo].[Repair_Tickets] WITH (UPDLOCK, HOLDLOCK)
        WHERE [Id] = @deviceId;
      `)
    const device = deviceResult.recordset[0]
    if (!device) {
      transaction = await rollback(transaction)
      return NextResponse.json({ success: false, message: "设备不存在" }, { status: 404 })
    }

    const submitted = bodyResult.data
    const manufactureDate = submitted.manufactureDate === undefined
      ? device.ManufactureDate
      : submitted.manufactureDate ? new Date(submitted.manufactureDate) : null
    let warrantyStatus = submitted.warrantyStatus === undefined && submitted.manufactureDate === undefined
      ? device.WarrantyStatus
      : submitted.warrantyStatus || null
    if (!warrantyStatus && manufactureDate && Object.keys(submitted).length > 0) {
      const ageInYears = (Date.now() - manufactureDate.getTime()) / (1000 * 60 * 60 * 24 * 365)
      warrantyStatus = ageInYears <= 1 ? "InWarranty" : "OutOfWarranty"
    }
    const dateChanged = (manufactureDate?.getTime() ?? null) !== (device.ManufactureDate?.getTime() ?? null)
    const warrantyChanged = (warrantyStatus || null) !== (device.WarrantyStatus || null)
    if (!dateChanged && !warrantyChanged) {
      transaction = await rollback(transaction)
      return NextResponse.json({
        success: true,
        changed: false,
        message: "信息未发生变化，无需保存",
        data: { warrantyStatus, didRevert: false },
      })
    }
    if (isSignedRepairReport(device)) {
      transaction = await rollback(transaction)
      return NextResponse.json(
        { success: false, message: "报告已签字确认，不能修改出厂日期或保修状态" },
        { status: 409 }
      )
    }

    const updateResult = await new sql.Request(transaction)
      .input("deviceId", sql.Int, deviceId)
      .input("manufactureDate", sql.DateTime2, manufactureDate)
      .input("warrantyStatus", sql.NVarChar(50), warrantyStatus)
      .input("expectedStatus", sql.NVarChar(50), device.Status)
      .query(`
        UPDATE [dbo].[Repair_Tickets]
        SET [ManufactureDate] = @manufactureDate,
            [WarrantyStatus] = @warrantyStatus,
            [UpdatedAt] = GETUTCDATE()
        WHERE [Id] = @deviceId AND [Status] = @expectedStatus;
      `)
    if (updateResult.rowsAffected[0] !== 1) {
      transaction = await rollback(transaction)
      return NextResponse.json(
        { success: false, message: "设备状态已变化，请刷新页面后重试" },
        { status: 409 }
      )
    }

    if (device.BatchId) {
      const formattedDate = manufactureDate
        ? manufactureDate.toISOString().slice(0, 10)
        : "已清空"
      await new sql.Request(transaction)
        .input("ticketId", sql.NVarChar(50), String(deviceId))
        .input("batchId", sql.NVarChar(100), device.BatchId)
        .input("actionType", sql.NVarChar(50), TicketActionType.MANUFACTURE_DATE_OVERRIDE)
        .input("operatorId", sql.Int, operatorId)
        .input("operatorName", sql.NVarChar(100), authResult.realName || authResult.username)
        .input("description", sql.NVarChar(sql.MAX), `保存设备 ${device.DeviceSN || deviceId} 出厂日期：${formattedDate}`)
        .input("status", sql.NVarChar(50), device.Status)
        .query(`
          INSERT INTO [dbo].[Repair_Ticket_History] (
            [TicketID], [BatchId], [ActionType], [OperatorId], [OperatorName],
            [Description], [OldStatus], [NewStatus], [CreatedAt]
          ) VALUES (
            @ticketId, @batchId, @actionType, @operatorId, @operatorName,
            @description, @status, @status, GETUTCDATE()
          );
        `)
    }

    await transaction.commit()
    transaction = null
    return NextResponse.json({
      success: true,
      message: "出厂日期已保存，工单状态未改变",
      data: { warrantyStatus, didRevert: false },
    })
  } catch (error: unknown) {
    console.error("[Manufacture Date] 保存失败:", error)
    transaction = await rollback(transaction)
    return NextResponse.json(
      { success: false, message: "保存出厂日期失败，请稍后重试" },
      { status: 500 }
    )
  }
}
