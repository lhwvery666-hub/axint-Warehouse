import { NextResponse } from "next/server"
import * as sql from "mssql"
import { z } from "zod"
import { getDbConnection } from "@/lib/db-config"
import {
  DB_FIELDS,
  FINAL_OUTCOME_LABELS,
  FinalOutcome,
  TicketActionType,
  TicketStatus,
  UserRole,
} from "@/lib/enums"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"

const deviceIdSchema = z.coerce.number().int().positive()
const finalOutcomeSchema = z.object({
  finalOutcome: z.nativeEnum(FinalOutcome).nullable(),
}).strict()

interface FinalOutcomeRow {
  RepairReportContent: string | null
  Status: string
  DeviceSN: string | null
}

async function rollback(transaction: sql.Transaction | null): Promise<null> {
  if (!transaction) return null
  try {
    await transaction.rollback()
  } catch (rollbackError: unknown) {
    console.error("[Final Outcome API] 事务回滚失败:", rollbackError)
  }
  return null
}

/**
 * GET /api/tickets/[id]/final-outcome
 * 获取单台设备的维修最终处理结果（技师在 TECHNICIAN_REPAIRING 阶段填写）
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authResult = await checkUserRole([UserRole.TECHNICIAN, UserRole.ADMIN])
  if (isErrorResponse(authResult)) return authResult

  try {
    const parsedId = deviceIdSchema.safeParse((await context.params).id)
    if (!parsedId.success) {
      return NextResponse.json({ success: false, message: "设备编号无效" }, { status: 400 })
    }

    const pool = await getDbConnection()
    const result = await pool
      .request()
      .input("deviceId", sql.Int, parsedId.data)
      .query(`
        SELECT TOP 1 RepairReportContent
        FROM Repair_Tickets
        WHERE ${DB_FIELDS.ID} = @deviceId
      `)

    if (result.recordset.length === 0) {
      return NextResponse.json({ success: false, message: "设备不存在" }, { status: 404 })
    }

    let finalOutcome: string | null = null
    try {
      const raw = result.recordset[0].RepairReportContent as string | null
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>
        finalOutcome = (parsed.finalOutcome as string | null) ?? null
      }
    } catch {
      // JSON 解析失败时返回 null
    }

    return NextResponse.json({ success: true, data: { finalOutcome } })
  } catch (error: unknown) {
    console.error("查询最终处理结果失败:", error)
    return NextResponse.json({ success: false, message: "查询失败" }, { status: 500 })
  }
}

/**
 * PATCH /api/tickets/[id]/final-outcome
 * 保存单台设备的最终处理结果，不改变工单状态。
 * finalOutcome 值：
 *   "Completed"         → 维修完成
 *   "Scrapped"          → 无需维修，报废
 *   "ReturnUnrepaired"  → 无需维修，寄回
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authResult = await checkUserRole([UserRole.TECHNICIAN, UserRole.ADMIN])
  if (isErrorResponse(authResult)) return authResult

  let transaction: sql.Transaction | null = null
  try {
    const parsedId = deviceIdSchema.safeParse((await context.params).id)
    const parsedBody = finalOutcomeSchema.safeParse(await request.json().catch(() => null))
    if (!parsedId.success || !parsedBody.success) {
      return NextResponse.json({ success: false, message: "请求参数无效" }, { status: 400 })
    }

    const operatorId = Number(authResult.userId)
    if (!Number.isSafeInteger(operatorId)) {
      return NextResponse.json({ success: false, message: "登录身份无效" }, { status: 401 })
    }
    const deviceId = parsedId.data
    const finalOutcome = parsedBody.data.finalOutcome
    const pool = await getDbConnection()
    transaction = new sql.Transaction(pool)
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE)

    const currentResult = await new sql.Request(transaction)
      .input("deviceId", sql.Int, deviceId)
      .query<FinalOutcomeRow>(`
        SELECT TOP (1)
               [RepairReportContent], [${DB_FIELDS.STATUS}] AS [Status],
               [${DB_FIELDS.DEVICE_SN}] AS [DeviceSN]
        FROM [dbo].[Repair_Tickets] WITH (UPDLOCK, HOLDLOCK)
        WHERE [${DB_FIELDS.ID}] = @deviceId;
      `)

    if (currentResult.recordset.length === 0) {
      transaction = await rollback(transaction)
      return NextResponse.json({ success: false, message: "设备不存在" }, { status: 404 })
    }

    const current = currentResult.recordset[0]
    const allowedStatuses = new Set<string>([
      TicketStatus.TECHNICIAN_REPAIRING,
      TicketStatus.FACTORY_FINISHED,
    ])
    if (!allowedStatuses.has(current.Status)) {
      transaction = await rollback(transaction)
      return NextResponse.json(
        { success: false, message: "当前设备不在维修作业中，不能确认最终处理结果" },
        { status: 409 }
      )
    }

    let existing: Record<string, unknown> = {}
    try {
      if (current.RepairReportContent) {
        existing = JSON.parse(current.RepairReportContent) as Record<string, unknown>
      }
    } catch { /* ignore */ }

    const previousOutcome = existing.finalOutcome ?? null
    if (previousOutcome === finalOutcome) {
      transaction = await rollback(transaction)
      return NextResponse.json({
        success: true,
        message: "处理结果未发生变化，无需重复保存",
        data: { changed: false },
      })
    }

    const updated = { ...existing, finalOutcome }
    const updatedJson = JSON.stringify(updated)

    const updateResult = await new sql.Request(transaction)
      .input("deviceId", sql.Int, deviceId)
      .input("expectedStatus", sql.NVarChar(50), current.Status)
      .input("reportContent", sql.NVarChar(sql.MAX), updatedJson)
      .query(`
        UPDATE [dbo].[Repair_Tickets]
        SET [RepairReportContent] = @reportContent,
            [UpdatedAt] = GETUTCDATE()
        WHERE [${DB_FIELDS.ID}] = @deviceId
          AND [${DB_FIELDS.STATUS}] = @expectedStatus;
      `)
    if (updateResult.rowsAffected[0] !== 1) {
      transaction = await rollback(transaction)
      return NextResponse.json(
        { success: false, message: "设备状态已变化，请刷新后重试" },
        { status: 409 }
      )
    }

    const operatorName = authResult.realName || authResult.username || "维修人员"
    const outcomeLabel = finalOutcome ? FINAL_OUTCOME_LABELS[finalOutcome] : "清除"
    await new sql.Request(transaction)
      .input("ticketId", sql.NVarChar(50), String(deviceId))
      .input("actionType", sql.NVarChar(50), TicketActionType.STATUS_CHANGE)
      .input("oldStatus", sql.NVarChar(50), current.Status)
      .input("newStatus", sql.NVarChar(50), current.Status)
      .input("operatorId", sql.Int, operatorId)
      .input("operatorName", sql.NVarChar(100), operatorName)
      .input(
        "description",
        sql.NVarChar(sql.MAX),
        `维修人员为设备 ${current.DeviceSN || deviceId} 选择了最终处理结果：${outcomeLabel}（工单状态保持不变，等待整批提交）`
      )
      .query(`
        INSERT INTO [dbo].[Repair_Ticket_History] (
          [TicketId], [ActionType], [OldStatus], [NewStatus],
          [OperatorId], [OperatorName], [Description], [CreatedAt]
        ) VALUES (
          @ticketId, @actionType, @oldStatus, @newStatus,
          @operatorId, @operatorName, @description, GETUTCDATE()
        );
      `)

    await transaction.commit()
    transaction = null
    return NextResponse.json({
      success: true,
      message: "处理结果已保存",
      data: { changed: true },
    })
  } catch (error: unknown) {
    console.error("保存最终处理结果失败:", error)
    transaction = await rollback(transaction)
    return NextResponse.json({ success: false, message: "保存失败" }, { status: 500 })
  }
}
