import { NextResponse } from "next/server"
import * as sql from "mssql"
import { z } from "zod"
import { getDbConnection } from "@/lib/db-config"
import { TicketStatus, UserRole, TicketActionType } from "@/lib/enums"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"
import { isSignedRepairReport, sumRepairCosts } from "@/lib/repair-report-policy"

interface BusinessRow {
  Id: number; Status: string; RepairCost: number | null; IsPaymentReceived: boolean | null
  IsInvoiced: boolean | null; ClientName: string | null; BusinessReviewedAt: Date | null; BusinessReviewedBy: string | null
  SignedReportPhoto: string | null; ReporterConfirmedAt: Date | null
}
const batchSchema = z.string().trim().min(1).max(100)
const bodySchema = z.object({
  isChargeable: z.boolean().optional(),
  isPaymentReceived: z.boolean(), isInvoiced: z.boolean(),
  // Accept a matching legacy total, but never use it to update device amounts.
  totalCost: z.number().finite().nonnegative().nullable().optional(),
  clientName: z.string().trim().max(200).nullable().optional(),
}).strict()

export async function GET(_request: Request, context: { params: Promise<{ batchId: string }> }) {
  const auth = await checkUserRole([UserRole.ADMIN, UserRole.BUSINESS])
  if (isErrorResponse(auth)) return auth
  try {
    const batch = batchSchema.safeParse((await context.params).batchId)
    if (!batch.success) return NextResponse.json({ success: false, message: "批次号无效" }, { status: 400 })
    const pool = await getDbConnection()
    const result = await pool.request().input("batchId", sql.NVarChar(100), batch.data).query<BusinessRow>(`
      SELECT [Id], [Status], [RepairCost], [IsPaymentReceived], [IsInvoiced], [ClientName], [BusinessReviewedAt], [BusinessReviewedBy], [SignedReportPhoto], [ReporterConfirmedAt]
      FROM [dbo].[Repair_Tickets] WHERE [BatchId] = @batchId AND [Status] <> 'Deleted' ORDER BY [Id];
    `)
    if (!result.recordset.length) return NextResponse.json({ success: false, message: "批次不存在" }, { status: 404 })
    const rows = result.recordset
    const totalCost = sumRepairCosts(rows)
    return NextResponse.json({ success: true, data: {
      isChargeable: totalCost > 0, isPaymentReceived: rows.every(row => Boolean(row.IsPaymentReceived)),
      isInvoiced: rows.every(row => Boolean(row.IsInvoiced)), totalCost,
      clientName: rows[0].ClientName, reviewedAt: rows[0].BusinessReviewedAt, reviewedBy: rows[0].BusinessReviewedBy,
      reportLocked: rows.some(isSignedRepairReport),
    } })
  } catch (error: unknown) {
    console.error("获取商务信息失败:", error)
    return NextResponse.json({ success: false, message: "获取商务信息失败" }, { status: 500 })
  }
}

export async function PUT(request: Request, context: { params: Promise<{ batchId: string }> }) {
  const auth = await checkUserRole([UserRole.ADMIN, UserRole.BUSINESS])
  if (isErrorResponse(auth)) return auth
  let transaction: sql.Transaction | null = null
  try {
    const batch = batchSchema.safeParse((await context.params).batchId)
    const body = bodySchema.safeParse(await request.json().catch(() => null))
    if (!batch.success || !body.success) return NextResponse.json({ success: false, message: "请求参数无效" }, { status: 400 })
    const pool = await getDbConnection()
    transaction = new sql.Transaction(pool)
    await transaction.begin()
    const result = await new sql.Request(transaction).input("batchId", sql.NVarChar(100), batch.data).query<BusinessRow>(`
      SELECT [Id], [Status], [RepairCost], [IsPaymentReceived], [IsInvoiced], [ClientName], [BusinessReviewedAt], [BusinessReviewedBy], [SignedReportPhoto], [ReporterConfirmedAt]
      FROM [dbo].[Repair_Tickets] WITH (UPDLOCK, HOLDLOCK)
      WHERE [BatchId] = @batchId AND [Status] <> 'Deleted' ORDER BY [Id];
    `)
    const rows = result.recordset
    const allowed = new Set<string>([TicketStatus.BUSINESS_REVIEW, TicketStatus.WAREHOUSE_SHIPPING, TicketStatus.COMPLETED])
    const totalCost = sumRepairCosts(rows)
    if (!rows.length || rows.some(row => !allowed.has(row.Status)) ||
      (body.data.totalCost != null && Math.round(body.data.totalCost * 100) !== Math.round(totalCost * 100))) {
      await transaction.rollback(); transaction = null
      return NextResponse.json({ success: false, message: "批次状态或费用已变化，请刷新；费用由各设备维修费用自动合计" }, { status: 409 })
    }
    if (rows.some(isSignedRepairReport) && body.data.clientName !== undefined &&
      rows.some(row => String(row.ClientName ?? "").trim() !== String(body.data.clientName ?? "").trim())) {
      await transaction.rollback(); transaction = null
      return NextResponse.json({ success: false, message: "报告已签字，客户名称不能再修改；收款和开票信息可继续更新" }, { status: 409 })
    }
    await new sql.Request(transaction)
      .input("batchId", sql.NVarChar(100), batch.data)
      .input("isChargeable", sql.Bit, totalCost > 0)
      .input("isPaymentReceived", sql.Bit, body.data.isPaymentReceived)
      .input("isInvoiced", sql.Bit, body.data.isInvoiced)
      .input("updateClientName", sql.Bit, body.data.clientName !== undefined)
      .input("clientName", sql.NVarChar(200), body.data.clientName ?? null)
      .query(`UPDATE [dbo].[Repair_Tickets] SET [IsChargeable] = @isChargeable,
        [IsPaymentReceived] = @isPaymentReceived, [IsInvoiced] = @isInvoiced,
        [ClientName] = CASE WHEN @updateClientName = 1 THEN @clientName ELSE [ClientName] END, [UpdatedAt] = GETUTCDATE()
        WHERE [BatchId] = @batchId AND [Status] <> 'Deleted';`)
    await new sql.Request(transaction)
      .input("batchId", sql.NVarChar(100), batch.data)
      .input("actionType", sql.NVarChar(50), TicketActionType.BATCH_UPDATED)
      .input("operatorId", sql.Int, Number(auth.userId))
      .input("operatorName", sql.NVarChar(100), auth.realName || auth.username)
      .input("description", sql.NVarChar(sql.MAX), `保存财务跟进：总费用 ${totalCost} 元，${body.data.isPaymentReceived ? "已收款" : "未收款"}，${body.data.isInvoiced ? "已开票" : "未开票"}；设备费用保持原值`)
      .query(`INSERT INTO [dbo].[Repair_Ticket_History] ([BatchId], [ActionType], [OperatorId], [OperatorName], [Description], [CreatedAt])
        VALUES (@batchId, @actionType, @operatorId, @operatorName, @description, GETUTCDATE());`)
    await transaction.commit(); transaction = null
    return NextResponse.json({ success: true, message: "财务信息已保存", data: { totalCost } })
  } catch (error: unknown) {
    if (transaction) { try { await transaction.rollback() } catch {} finally { transaction = null } }
    console.error("保存商务信息失败:", error)
    return NextResponse.json({ success: false, message: "保存商务信息失败" }, { status: 500 })
  }
}
