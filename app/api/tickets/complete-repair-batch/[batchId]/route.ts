import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getDbConnection } from "@/lib/db-config"
import { DB_FIELDS, TicketStatus, TicketActionType, FinalOutcome, FINAL_OUTCOME_LABELS, TICKET_STATUS_LABELS, normalizeTicketStatus } from "@/lib/enums"

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
        SELECT ${DB_FIELDS.ID}, ${DB_FIELDS.STATUS}, ${DB_FIELDS.DEVICE_SN}, RepairReportContent, ${DB_FIELDS.REPAIR_COST}
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
      status: string
      finalOutcome: string | null
      deviceSN: string | null
      repairCost: number
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
      const rawCost = row[DB_FIELDS.REPAIR_COST] ?? row.RepairCost
      return {
        id: String(row[DB_FIELDS.ID] ?? row.Id ?? ""),
        status: String(row[DB_FIELDS.STATUS] ?? row.Status ?? ""),
        deviceSN: (row[DB_FIELDS.DEVICE_SN] ?? row.DeviceSN ?? null) as string | null,
        finalOutcome,
        repairCost: Number(rawCost) || 0,
      }
    })

    // ── 防御性校验：批次必须处于"维修作业中"（Technician_Repairing），才允许提交完工结果 ──
    // 该状态代表现场已签字回传、维修人员已进入实际动手维修阶段。
    // 缺少此校验时，理论上可以从任意状态（如尚未签字的 Pending_Reporter_Confirm）直接跳转到
    // 商务审核/仓库发货，跳过现场签字环节，造成状态机被绕过（“倒置”风险）。
    const invalidStatusDevices = deviceRows.filter(d => d.status !== TicketStatus.TECHNICIAN_REPAIRING)
    if (invalidStatusDevices.length > 0) {
      const normalized = normalizeTicketStatus(invalidStatusDevices[0].status)
      const currentStatusLabel = normalized ? TICKET_STATUS_LABELS[normalized] : (invalidStatusDevices[0].status || "未知状态")
      return NextResponse.json(
        {
          success: false,
          message: `当前批次状态为"${currentStatusLabel}"，不是"维修作业中"，无法提交完工结果。请确认现场人员已签字回传，且维修人员已开始实际维修后再操作。`,
        },
        { status: 403 }
      )
    }

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

    // ── 任务2：免费工单状态机短路 ────────────────────────────────────────────
    // 按整批次汇总费用（RepairCost 为 null 按 0 计），若批次总费用为 0，
    // 说明这批设备全部免费维修，无需走商务审核（收款/开票），直接进入待发货。
    const totalCost = deviceRows.reduce((sum, d) => sum + d.repairCost, 0)
    const isFreeBatch = totalCost === 0

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
    const BUSINESS_REVIEW_SKIP_OPERATOR = "系统自动（免费维修跳过商务审核）"

    for (const device of deviceRows) {
      const finalOutcome = device.finalOutcome as FinalOutcome
      const targetStatus = isFreeBatch
        ? TicketStatus.WAREHOUSE_SHIPPING
        : (STATUS_MAP[finalOutcome] ?? TicketStatus.BUSINESS_REVIEW)

      if (isFreeBatch) {
        // 免费批次：直接跳过商务审核，同时把收款/开票标记为"已满足"，
        // 避免这批工单在"财务跟进"视图里被误判为未结清。
        await pool
          .request()
          .input("deviceId", device.id)
          .input("newStatus", targetStatus)
          .input("updatedAt", new Date())
          .input("operatorName", operatorName)
          .input("skipOperator", BUSINESS_REVIEW_SKIP_OPERATOR)
          .query(`
            UPDATE Repair_Tickets
            SET 
              ${DB_FIELDS.STATUS}             = @newStatus,
              ${DB_FIELDS.UPDATED_AT}         = @updatedAt,
              TechnicianCompletedAt           = GETUTCDATE(),
              TechnicianCompletedBy           = @operatorName,
              ${DB_FIELDS.IS_CHARGEABLE}      = 0,
              ${DB_FIELDS.IS_PAYMENT_RECEIVED} = 1,
              BusinessReviewedAt              = GETUTCDATE(),
              BusinessReviewedBy              = @skipOperator
            WHERE ${DB_FIELDS.ID} = @deviceId
          `)
      } else {
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
      }
      summaryParts.push(`${device.deviceSN || device.id}（${OUTCOME_LABELS[finalOutcome] ?? finalOutcome}）`)
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

    // 免费批次：额外写入一条"系统自动跳过商务审核"的操作记录，保证操作时间线完整、可追溯
    if (isFreeBatch) {
      try {
        const skipHistReq = pool
          .request()
          .input("batchId",     batchId)
          .input("actionType",  TicketActionType.BUSINESS_REVIEW_SKIPPED)
          .input("operatorName", BUSINESS_REVIEW_SKIP_OPERATOR)
          .input("description", `批次总费用为 0（免费维修），系统自动跳过商务审核，直接进入仓库发货，共 ${deviceRows.length} 台设备`)
          .input("createdAt",   new Date())

        await skipHistReq.query(`
          INSERT INTO Repair_Ticket_History (BatchId, ActionType, OperatorName, Description, CreatedAt)
          VALUES (@batchId, @actionType, @operatorName, @description, @createdAt)
        `)
        console.log(`[Complete Repair] 免费批次跳过商务审核记录已写入 Repair_Ticket_History`)
      } catch (skipHistoryErr: unknown) {
        const msg = skipHistoryErr instanceof Error ? skipHistoryErr.message : "未知错误"
        console.error(`[Complete Repair] 写入跳过商务审核记录失败（非致命）: ${msg}`)
      }
    }

    return NextResponse.json({
      success: true,
      message: isFreeBatch ? `${description}（免费维修，已自动跳过商务审核，直接进入仓库发货）` : description,
      data: {
        batchId,
        deviceCount: deviceRows.length,
        completedCount,
        scrappedCount,
        returnCount,
        totalCost,
        businessReviewSkipped: isFreeBatch,
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
