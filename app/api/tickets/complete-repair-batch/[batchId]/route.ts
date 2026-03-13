import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getDbConnection } from "@/lib/db-config"
import { DB_FIELDS, TicketStatus, TicketActionType, FinalOutcome, FINAL_OUTCOME_LABELS } from "@/lib/enums"

// POST /api/tickets/complete-repair-batch/[batchId]
// 维修人员完成批次维修
export async function POST(
  request: Request,
  context: { params: Promise<{ batchId: string }> } | { params: { batchId: string } }
) {
  try {
    const resolvedParams =
      "then" in (context as any).params
        ? await (context as { params: Promise<{ batchId: string }> }).params
        : (context as { params: { batchId: string } }).params

    const batchId = resolvedParams.batchId

    if (!batchId) {
      return NextResponse.json(
        { success: false, message: "批次号不能为空" },
        { status: 400 }
      )
    }

    // 验证用户权限
    const cookieStore = await cookies()
    const userIdCookie = cookieStore.get("userId")?.value || null
    if (!userIdCookie) {
      return NextResponse.json(
        { success: false, message: "未登录" },
        { status: 401 }
      )
    }

    const pool = await getDbConnection()

    const userResult = await pool
      .request()
      .input("userId", userIdCookie)
      .query(`
        SELECT TOP 1 Role, RealName, Username
        FROM Users
        WHERE UserID = @userId
      `)

    if (userResult.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "用户不存在" },
        { status: 403 }
      )
    }

    const userRole = userResult.recordset[0].Role || ""
    const isTechnician = userRole.toLowerCase().includes("technician") || userRole === "维修人员" || userRole === "维修工程师"

    if (!isTechnician) {
      return NextResponse.json(
        { success: false, message: "只有维修人员可以完成维修" },
        { status: 403 }
      )
    }

    // 查询批次中的所有设备及其最终处理结果
    const devicesResult = await pool
      .request()
      .input("batchId", batchId)
      .query(`
        SELECT ${DB_FIELDS.ID}, ${DB_FIELDS.STATUS}, ${DB_FIELDS.DEVICE_SN}, RepairReportContent
        FROM Repair_Tickets
        WHERE ${DB_FIELDS.BATCH_ID} = @batchId
      `)

    if (devicesResult.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "批次工单不存在" },
        { status: 404 }
      )
    }

    // 使用枚举标签（来自 lib/enums.ts），避免魔法字符串
    const OUTCOME_LABELS = FINAL_OUTCOME_LABELS

    interface DeviceRow {
      id: string
      finalOutcome: string | null
      deviceSN: string | null
    }

    const deviceRows: DeviceRow[] = devicesResult.recordset.map((row: Record<string, unknown>) => {
      let finalOutcome: string | null = null
      try {
        const raw = row.RepairReportContent as string | null
        if (raw) {
          const parsed = JSON.parse(raw) as Record<string, unknown>
          finalOutcome = (parsed.finalOutcome as string | null) ?? null
        }
      } catch { /* ignore */ }
      return {
        id: String(row[DB_FIELDS.ID] ?? row.Id ?? ""),
        deviceSN: (row[DB_FIELDS.DEVICE_SN] ?? row.DeviceSN ?? null) as string | null,
        finalOutcome,
      }
    })

    // 确保所有设备都已选择最终处理结果
    const missingOutcome = deviceRows.filter(d => !d.finalOutcome)
    if (missingOutcome.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `还有 ${missingOutcome.length} 台设备未选择最终处理结果，请先在设备详情页完成选择。`,
        },
        { status: 400 }
      )
    }

    const operatorName = userResult.recordset[0].RealName || userResult.recordset[0].Username || "维修人员"

    // 按 finalOutcome 分组，设置下一阶段状态（使用 FinalOutcome 枚举，禁止魔法字符串）
    //   所有处理结果都必须经过：商务审核 → 仓库发货 → 最终终态
    //   finalOutcome 信息保存在 RepairReportContent.finalOutcome 中，
    //   商务人员和仓库人员可以据此进行相应处理（收款/免费/入库/退回）
    const STATUS_MAP: Record<FinalOutcome, TicketStatus> = {
      [FinalOutcome.COMPLETED]:         TicketStatus.BUSINESS_REVIEW, // 维修完成 → 商务审核（收款开票）→ 仓库发货
      [FinalOutcome.SCRAPPED]:          TicketStatus.BUSINESS_REVIEW, // 入库处理 → 商务审核（确认处置）→ 仓库入库
      [FinalOutcome.RETURN_UNREPAIRED]: TicketStatus.BUSINESS_REVIEW, // 无需维修寄回 → 商务审核（确认）→ 仓库发货退回
    }

    const summaryParts: string[] = []

    for (const device of deviceRows) {
      const targetStatus = STATUS_MAP[device.finalOutcome!] ?? TicketStatus.BUSINESS_REVIEW
      await pool
        .request()
        .input("deviceId", device.id)
        .input("newStatus", targetStatus)
        .input("updatedAt", new Date())
        .input("operatorName", operatorName)
        .query(`
          UPDATE Repair_Tickets
          SET 
            ${DB_FIELDS.STATUS}        = @newStatus,
            ${DB_FIELDS.UPDATED_AT}    = @updatedAt,
            TechnicianCompletedAt      = GETUTCDATE(),
            TechnicianCompletedBy      = @operatorName
          WHERE ${DB_FIELDS.ID} = @deviceId
        `)
      summaryParts.push(`${device.deviceSN || device.id}（${OUTCOME_LABELS[device.finalOutcome!] ?? device.finalOutcome}）`)
    }

    // 写入操作记录（使用 FinalOutcome 枚举，禁止魔法字符串）
    const completedCount  = deviceRows.filter(d => d.finalOutcome === FinalOutcome.COMPLETED).length
    const scrappedCount   = deviceRows.filter(d => d.finalOutcome === FinalOutcome.SCRAPPED).length
    const returnCount     = deviceRows.filter(d => d.finalOutcome === FinalOutcome.RETURN_UNREPAIRED).length

    const description =
      `维修人员完成整批设备维修，提交最终处理结果（共 ${deviceRows.length} 台）：` +
      [
        completedCount  > 0 ? `维修完成 ${completedCount} 台`  : "",
        scrappedCount   > 0 ? `入库处理 ${scrappedCount} 台`   : "",
        returnCount     > 0 ? `寄回 ${returnCount} 台`          : "",
      ].filter(Boolean).join("，")

    // OperatorId 必须是合法整数，否则 SQL Server INT 列会报错导致日志静默丢失
    const operatorIdNum = parseInt(userIdCookie, 10)
    const safeOperatorId = isNaN(operatorIdNum) ? null : operatorIdNum

    try {
      const histReq = pool
        .request()
        .input("batchId",      batchId)
        .input("actionType",   TicketActionType.TECHNICIAN_COMPLETED)
        .input("operatorName", operatorName)
        .input("description",  description)
        .input("createdAt",    new Date())

      // operatorId 可空，只在有效时才传入
      if (safeOperatorId !== null) {
        histReq.input("operatorId", safeOperatorId)
      }

      const insertSql = safeOperatorId !== null
        ? `INSERT INTO Repair_Ticket_History (BatchId, ActionType, OperatorId, OperatorName, Description, CreatedAt)
           VALUES (@batchId, @actionType, @operatorId, @operatorName, @description, @createdAt)`
        : `INSERT INTO Repair_Ticket_History (BatchId, ActionType, OperatorName, Description, CreatedAt)
           VALUES (@batchId, @actionType, @operatorName, @description, @createdAt)`

      await histReq.query(insertSql)
      console.log(`[Complete Repair] 操作记录已写入 Repair_Ticket_History`)
    } catch (historyErr: unknown) {
      const msg = historyErr instanceof Error ? historyErr.message : "未知错误"
      console.error(`[Complete Repair] 写入操作记录失败（非致命）: ${msg}`)
    }

    return NextResponse.json({
      success: true,
      message: description,
      data: {
        batchId,
        deviceCount: deviceRows.length,
        completedCount,
        scrappedCount,
        returnCount,
      }
    })

  } catch (error: any) {
    console.error("完成维修失败:", error)
    return NextResponse.json(
      { 
        success: false, 
        message: error.message || "完成维修失败" 
      },
      { status: 500 }
    )
  }
}
