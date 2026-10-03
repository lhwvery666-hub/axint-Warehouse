import { NextResponse } from "next/server"
import * as sql from "mssql"
import { z } from "zod"
import { getDbConnection } from "@/lib/db-config"
import { TicketActionType, TicketStatus, UserRole } from "@/lib/enums"
import { ALL_USER_ROLES, checkUserRole, isErrorResponse } from "@/lib/auth-utils"
import { buildShippingPlan, getSavedShippingAllocation, summarizeShippingPlan, type ShippingPlanRow } from "@/lib/shipping-plan"
import { mergeRepairReportContent } from "@/lib/repair-report-policy"

interface ShippingRow extends ShippingPlanRow {
  Status: string; ReportByUserID: number | null; ReturnDate: Date | null; ReturnTrackingNum: string | null
  ReturnQuantity: number | null; WarehouseShippedAt: Date | null; WarehouseShippedBy: string | null
}
const batchSchema = z.string().trim().min(1).max(100)
const bodySchema = z.object({
  shippingType: z.enum(["return", "stock"]),
  returnDate: z.string().datetime().nullable().optional(),
  returnTrackingNum: z.string().trim().max(200).optional(),
  returnQuantity: z.number().int().min(0).max(100000).optional(),
  allocations: z.array(z.object({ deviceId: z.number().int().positive(), stockQuantity: z.number().int().min(0).max(100000) }).strict()).min(1).max(500).optional(),
}).strict()
const fields = `[Id], [Quantity], [Status], [ReportByUserID], [RepairReportContent], [ShippingType],
  [ReturnDate], [ReturnTrackingNum], [ReturnQuantity], [WarehouseShippedAt], [WarehouseShippedBy]`

export async function GET(_request: Request, context: { params: Promise<{ batchId: string }> }) {
  const auth = await checkUserRole(ALL_USER_ROLES)
  if (isErrorResponse(auth)) return auth
  try {
    const batch = batchSchema.safeParse((await context.params).batchId)
    if (!batch.success) return NextResponse.json({ success: false, message: "批次号无效" }, { status: 400 })
    const pool = await getDbConnection()
    const result = await pool.request().input("batchId", sql.NVarChar(100), batch.data).query<ShippingRow>(`
      SELECT ${fields} FROM [dbo].[Repair_Tickets] WHERE [BatchId] = @batchId AND [Status] <> 'Deleted' ORDER BY [Id];
    `)
    const rows = result.recordset
    if (!rows.length || (auth.normalizedRole === UserRole.REPORTER && rows.some(row => row.ReportByUserID !== Number(auth.userId)))) {
      return NextResponse.json({ success: false, message: "批次不存在或无权访问" }, { status: 404 })
    }
    const plan = rows.map(getSavedShippingAllocation)
    const summary = summarizeShippingPlan(plan)
    const saved = rows.find(row => row.ReturnTrackingNum || row.ReturnDate) ?? rows[0]
    return NextResponse.json({ success: true, data: {
      ...summary, allocations: plan,
      shippingType: rows.some(row => row.ShippingType) ? summary.shippingType : null,
      returnDate: saved.ReturnDate, returnTrackingNum: saved.ReturnTrackingNum,
      shippedAt: rows[0].WarehouseShippedAt, shippedBy: rows[0].WarehouseShippedBy,
    } })
  } catch (error: unknown) {
    console.error("获取发货信息失败:", error)
    return NextResponse.json({ success: false, message: "获取发货信息失败" }, { status: 500 })
  }
}

export async function PUT(request: Request, context: { params: Promise<{ batchId: string }> }) {
  const auth = await checkUserRole([UserRole.WAREHOUSE, UserRole.ADMIN])
  if (isErrorResponse(auth)) return auth
  let transaction: sql.Transaction | null = null
  try {
    const batch = batchSchema.safeParse((await context.params).batchId)
    const body = bodySchema.safeParse(await request.json().catch(() => null))
    if (!batch.success || !body.success) return NextResponse.json({ success: false, message: "请求参数无效" }, { status: 400 })
    const pool = await getDbConnection()
    transaction = new sql.Transaction(pool)
    await transaction.begin()
    const result = await new sql.Request(transaction).input("batchId", sql.NVarChar(100), batch.data).query<ShippingRow>(`
      SELECT ${fields} FROM [dbo].[Repair_Tickets] WITH (UPDLOCK, HOLDLOCK)
      WHERE [BatchId] = @batchId AND [Status] <> 'Deleted' ORDER BY [Id];
    `)
    const rows = result.recordset
    const allowed = new Set<string>([TicketStatus.WAREHOUSE_SHIPPING, TicketStatus.PENDING_SHIPMENT, TicketStatus.COMPLETED])
    if (!rows.length || rows.some(row => !allowed.has(row.Status))) {
      await transaction.rollback(); transaction = null
      return NextResponse.json({ success: false, message: "批次状态已变化，请刷新" }, { status: 409 })
    }
    let plan
    try { plan = buildShippingPlan(rows, body.data.allocations, body.data.shippingType === "stock") }
    catch (error: unknown) {
      await transaction.rollback(); transaction = null
      return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "发货分配无效" }, { status: 409 })
    }
    const summary = summarizeShippingPlan(plan)
    const tracking = body.data.returnTrackingNum?.replace(/\s+/g, "") || null
    const completedPlanChanged = rows.some(row => row.Status === TicketStatus.COMPLETED &&
      getSavedShippingAllocation(row).stockQuantity !== plan.find(item => item.deviceId === row.Id)?.stockQuantity)
    if (completedPlanChanged || (body.data.returnQuantity !== undefined && body.data.returnQuantity !== summary.returnQuantity) ||
      (summary.returnQuantity > 0 && (!body.data.returnDate || !tracking))) {
      await transaction.rollback(); transaction = null
      return NextResponse.json({ success: false, message: completedPlanChanged ? "已完成批次不能更改出入库分配" : "必须一次发回全部需返回设备；请核对分配、发货日期和快递单号" }, { status: 400 })
    }
    for (const row of rows) {
      const allocation = plan.find(item => item.deviceId === row.Id)!
      await new sql.Request(transaction)
        .input("id", sql.Int, row.Id)
        .input("shippingType", sql.NVarChar(50), allocation.returnQuantity > 0 ? "return" : "stock")
        .input("returnDate", sql.DateTime2, allocation.returnQuantity > 0 ? new Date(body.data.returnDate!) : null)
        .input("tracking", sql.NVarChar(200), allocation.returnQuantity > 0 ? tracking : null)
        .input("returnQuantity", sql.Int, allocation.returnQuantity)
        .input("reportContent", sql.NVarChar(sql.MAX), mergeRepairReportContent(row.RepairReportContent, { shippingAllocation: allocation }))
        .query(`UPDATE [dbo].[Repair_Tickets] SET [ShippingType] = @shippingType, [ReturnDate] = @returnDate,
          [ReturnTrackingNum] = @tracking, [ReturnQuantity] = @returnQuantity, [RepairReportContent] = @reportContent,
          [UpdatedAt] = GETUTCDATE() WHERE [Id] = @id;`)
    }
    await new sql.Request(transaction)
      .input("batchId", sql.NVarChar(100), batch.data)
      .input("actionType", sql.NVarChar(50), TicketActionType.BATCH_UPDATED)
      .input("operatorId", sql.Int, Number(auth.userId))
      .input("operatorName", sql.NVarChar(100), auth.realName || auth.username)
      .input("description", sql.NVarChar(sql.MAX), `保存发货信息：一次发回 ${summary.returnQuantity} 台，入库 ${summary.stockQuantity} 台；流程状态保持不变`)
      .query(`INSERT INTO [dbo].[Repair_Ticket_History] ([BatchId], [ActionType], [OperatorId], [OperatorName], [Description], [CreatedAt])
        VALUES (@batchId, @actionType, @operatorId, @operatorName, @description, GETUTCDATE());`)
    await transaction.commit(); transaction = null
    return NextResponse.json({ success: true, message: "发货分配和物流信息已保存", data: summary })
  } catch (error: unknown) {
    if (transaction) { try { await transaction.rollback() } catch {} finally { transaction = null } }
    console.error("保存发货信息失败:", error)
    return NextResponse.json({ success: false, message: "保存发货信息失败" }, { status: 500 })
  }
}
