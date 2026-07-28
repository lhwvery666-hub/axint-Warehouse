import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"
import {
  DB_FIELDS,
  FINAL_OUTCOME_LABELS,
  FinalOutcome,
  TicketActionType,
  UserRole,
} from "@/lib/enums"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"

/**
 * GET /api/tickets/[id]/final-outcome
 * 获取单台设备的维修最终处理结果（技师在 TECHNICIAN_REPAIRING 阶段填写）
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> } | { params: { id: string } }
) {
  const authResult = await checkUserRole([UserRole.TECHNICIAN, UserRole.ADMIN])
  if (isErrorResponse(authResult)) return authResult

  try {
    const resolvedParams =
      "then" in (context as any).params
        ? await (context as { params: Promise<{ id: string }> }).params
        : (context as { params: { id: string } }).params
    const deviceId = resolvedParams.id

    const pool = await getDbConnection()
    const result = await pool
      .request()
      .input("deviceId", deviceId)
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
  context: { params: Promise<{ id: string }> } | { params: { id: string } }
) {
  const authResult = await checkUserRole([UserRole.TECHNICIAN, UserRole.ADMIN])
  if (isErrorResponse(authResult)) return authResult

  try {
    const resolvedParams =
      "then" in (context as any).params
        ? await (context as { params: Promise<{ id: string }> }).params
        : (context as { params: { id: string } }).params
    const deviceId = resolvedParams.id

    const body = (await request.json()) as { finalOutcome?: unknown }
    const finalOutcome = body.finalOutcome
    const validOutcomes = Object.values(FinalOutcome)

    if (
      finalOutcome !== null &&
      (typeof finalOutcome !== "string" || !validOutcomes.includes(finalOutcome as FinalOutcome))
    ) {
      return NextResponse.json({ success: false, message: "无效的处理结果值" }, { status: 400 })
    }

    const pool = await getDbConnection()

    // 读取当前 RepairReportContent
    const currentResult = await pool
      .request()
      .input("deviceId", deviceId)
      .query(`
        SELECT TOP 1 RepairReportContent, ${DB_FIELDS.STATUS}, ${DB_FIELDS.DEVICE_SN}
        FROM Repair_Tickets
        WHERE ${DB_FIELDS.ID} = @deviceId
      `)

    if (currentResult.recordset.length === 0) {
      return NextResponse.json({ success: false, message: "设备不存在" }, { status: 404 })
    }

    const currentRaw = currentResult.recordset[0].RepairReportContent as string | null
    const currentStatus = currentResult.recordset[0][DB_FIELDS.STATUS] as string | null
    const deviceSN = currentResult.recordset[0][DB_FIELDS.DEVICE_SN] as string | null

    // 合并 finalOutcome 到现有 JSON，不覆盖其他字段
    let existing: Record<string, unknown> = {}
    try {
      if (currentRaw) existing = JSON.parse(currentRaw) as Record<string, unknown>
    } catch { /* ignore */ }

    const updated = { ...existing, finalOutcome }
    const updatedJson = JSON.stringify(updated)

    // 更新 RepairReportContent，不改变 Status
    await pool
      .request()
      .input("deviceId", deviceId)
      .input("reportContent", updatedJson)
      .query(`
        UPDATE Repair_Tickets
        SET RepairReportContent = @reportContent
        WHERE ${DB_FIELDS.ID} = @deviceId
      `)

    // 写入操作日志
    try {
      const operatorName =
        authResult.realName ||
        authResult.username ||
        "维修人员"

      const outcomeLabel = finalOutcome
        ? FINAL_OUTCOME_LABELS[finalOutcome as FinalOutcome]
        : "清除"

      await pool
        .request()
        .input("ticketId", deviceId)
        .input("actionType", TicketActionType.STATUS_CHANGE)
        .input("oldStatus", currentStatus)
        .input("newStatus", currentStatus) // 状态不变
        .input("operatorId", Number(authResult.userId))
        .input("operatorName", operatorName)
        .input(
          "description",
          `维修人员为设备 ${deviceSN || deviceId} 选择了最终处理结果：${outcomeLabel}（工单状态保持不变，等待整批提交）`
        )
        .query(`
          INSERT INTO Repair_Ticket_History (
            TicketId, ActionType, OldStatus, NewStatus, OperatorId, OperatorName, Description, CreatedAt
          ) VALUES (
            @ticketId, @actionType, @oldStatus, @newStatus, @operatorId, @operatorName, @description, GETUTCDATE()
          )
        `)
    } catch (histErr: unknown) {
      console.error("写入操作记录失败（非致命）:", histErr)
    }

    return NextResponse.json({ success: true, message: "处理结果已保存" })
  } catch (error: unknown) {
    console.error("保存最终处理结果失败:", error)
    return NextResponse.json({ success: false, message: "保存失败" }, { status: 500 })
  }
}
