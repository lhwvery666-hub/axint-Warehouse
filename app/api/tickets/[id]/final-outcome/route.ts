import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"
import { DB_FIELDS, TicketActionType } from "@/lib/enums"
import { cookies } from "next/headers"

/**
 * GET /api/tickets/[id]/final-outcome
 * 获取单台设备的维修最终处理结果（技师在 TECHNICIAN_REPAIRING 阶段填写）
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> } | { params: { id: string } }
) {
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
    const msg = error instanceof Error ? error.message : "查询失败"
    return NextResponse.json({ success: false, message: msg }, { status: 500 })
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
  try {
    const cookieStore = await cookies()
    const userIdCookie = cookieStore.get("userId")?.value || null
    if (!userIdCookie) {
      return NextResponse.json({ success: false, message: "未登录" }, { status: 401 })
    }

    const resolvedParams =
      "then" in (context as any).params
        ? await (context as { params: Promise<{ id: string }> }).params
        : (context as { params: { id: string } }).params
    const deviceId = resolvedParams.id

    const body = await request.json()
    const { finalOutcome } = body as { finalOutcome: string | null }

    const VALID_OUTCOMES = ["Completed", "Scrapped", "ReturnUnrepaired"]
    if (finalOutcome !== null && !VALID_OUTCOMES.includes(finalOutcome)) {
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
      const userResult = await pool
        .request()
        .input("userId", userIdCookie)
        .query(`SELECT TOP 1 RealName, Username FROM Users WHERE UserID = @userId`)
      const operatorName =
        userResult.recordset[0]?.RealName ||
        userResult.recordset[0]?.Username ||
        "维修人员"

      const OUTCOME_LABELS: Record<string, string> = {
        Completed: "维修完成",
        Scrapped: "无需维修，报废",
        ReturnUnrepaired: "无需维修，寄回",
      }
      const outcomeLabel = finalOutcome ? (OUTCOME_LABELS[finalOutcome] ?? finalOutcome) : "清除"

      await pool
        .request()
        .input("ticketId", deviceId)
        .input("actionType", TicketActionType.STATUS_CHANGE)
        .input("oldStatus", currentStatus)
        .input("newStatus", currentStatus) // 状态不变
        .input("operatorId", Number(userIdCookie))
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
    const msg = error instanceof Error ? error.message : "保存失败"
    console.error("保存最终处理结果失败:", error)
    return NextResponse.json({ success: false, message: msg }, { status: 500 })
  }
}
