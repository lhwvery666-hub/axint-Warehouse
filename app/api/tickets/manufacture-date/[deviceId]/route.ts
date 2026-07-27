import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getDbConnection } from "@/lib/db-config"
import { DB_FIELDS, UserRole, TicketActionType, TicketStatus, normalizeTicketStatus } from "@/lib/enums"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"

// PUT /api/tickets/manufacture-date/[deviceId]
// 更新设备出厂日期（仓库管理员可随时修改）
// 若当前批次状态已超过 Warehouse_Confirming，则自动将批次所有设备回退至 Warehouse_Confirming
export async function PUT(
  request: Request,
  context: { params: Promise<{ deviceId: string }> } | { params: { deviceId: string } }
) {
  try {
    const resolvedParams =
      "then" in (context as unknown as { params: { then?: unknown } }).params
        ? await (context as { params: Promise<{ deviceId: string }> }).params
        : (context as { params: { deviceId: string } }).params

    const deviceId = resolvedParams.deviceId
    const body = await request.json() as { manufactureDate?: string; warrantyStatus?: string }
    const { manufactureDate, warrantyStatus: manualWarrantyStatus } = body

    if (!deviceId) {
      return NextResponse.json(
        { success: false, message: "设备ID不能为空" },
        { status: 400 }
      )
    }

    // 权限检查：允许管理员和仓库管理员修改出厂日期
    const authResult = await checkUserRole([UserRole.ADMIN, UserRole.WAREHOUSE])
    if (isErrorResponse(authResult)) {
      return authResult
    }

    const cookieStore = await cookies()
    const userIdCookie = cookieStore.get("userId")?.value || null

    const pool = await getDbConnection()

    // 查询设备当前状态及 BatchId
    const deviceResult = await pool
      .request()
      .input("deviceId", deviceId)
      .query(`
        SELECT ${DB_FIELDS.ID}, ${DB_FIELDS.DEVICE_SN}, ${DB_FIELDS.BATCH_ID}, ${DB_FIELDS.STATUS}
        FROM Repair_Tickets
        WHERE ${DB_FIELDS.ID} = @deviceId
      `)

    if (deviceResult.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "设备不存在" },
        { status: 404 }
      )
    }

    const deviceRow = deviceResult.recordset[0] as {
      [key: string]: unknown
    }
    const currentStatus = deviceRow[DB_FIELDS.STATUS] as string | null
    const batchId = deviceRow[DB_FIELDS.BATCH_ID] as string | null
    const deviceSn = deviceRow[DB_FIELDS.DEVICE_SN] as string | null

    // ── 保修状态：优先使用手动传入值，否则自动计算（1年内为保内）──────────────
    let warrantyStatus: string | null = null
    if (manualWarrantyStatus) {
      warrantyStatus = manualWarrantyStatus
    } else if (manufactureDate) {
      const mfgDate = new Date(manufactureDate)
      const now = new Date()
      const diffYears = (now.getTime() - mfgDate.getTime()) / (1000 * 60 * 60 * 24 * 365)
      warrantyStatus = diffYears <= 1 ? "InWarranty" : "OutOfWarranty"
    }

    // ── 只更新日期和保修字段，绝不触碰 Status（状态回退由下方逻辑单独处理）───
    await pool
      .request()
      .input("deviceId", deviceId)
      .input("manufactureDate", manufactureDate ? new Date(manufactureDate) : null)
      .input("warrantyStatus", warrantyStatus)
      .query(`
        UPDATE Repair_Tickets
        SET ManufactureDate = @manufactureDate,
            WarrantyStatus  = @warrantyStatus
        WHERE ${DB_FIELDS.ID} = @deviceId
      `)

    // ── 状态回退判断：若批次状态已超过仓库确认，则将整批回退至 Warehouse_Confirming ──
    // 只要不是 Created / Warehouse_Confirming / 终止状态，均认为需要回退
    const SKIP_REVERT_STATUSES = new Set<string>([
      TicketStatus.CREATED,
      TicketStatus.WAREHOUSE_CONFIRMING,
      TicketStatus.COMPLETED,
      TicketStatus.CANCELLED,
      TicketStatus.DELETED,
      TicketStatus.UNREPAIRABLE,
      TicketStatus.SCRAPPED,
      TicketStatus.RETURN_UNREPAIRED,
      TicketStatus.REJECTED_NO_RETURN,
    ])

    // ⚠️ 用 normalizeTicketStatus 归一化后再比较，避免大小写/历史脏数据导致误判需要回退
    const normalizedCurrentStatus = normalizeTicketStatus(currentStatus)
    let didRevert = false
    if (batchId && normalizedCurrentStatus && !SKIP_REVERT_STATUSES.has(normalizedCurrentStatus)) {
      // 将该批次所有设备回退至 Warehouse_Confirming
      await pool
        .request()
        .input("batchId", batchId)
        .input("revertStatus", TicketStatus.WAREHOUSE_CONFIRMING)
        .query(`
          UPDATE Repair_Tickets
          SET ${DB_FIELDS.STATUS} = @revertStatus
          WHERE ${DB_FIELDS.BATCH_ID} = @batchId
        `)
      didRevert = true
      console.log(`🔄 批次 ${batchId} 状态已由 "${currentStatus}" 回退至 "${TicketStatus.WAREHOUSE_CONFIRMING}"`)
    }

    console.log(`✅ 设备出厂日期已更新: ${deviceId}, 保修状态: ${warrantyStatus}, 状态回退: ${didRevert}`)

    // ── 写入操作日志（使用原始 SQL + 动态列检测，确保兼容各版本数据库结构）────
    if (batchId) {
      try {
        let operatorName = "仓库管理员"
        if (userIdCookie) {
          try {
            const userRow = await pool
              .request()
              .input("userId", userIdCookie)
              .query(`SELECT TOP 1 RealName, Username FROM Users WHERE UserID = @userId`)
            operatorName =
              userRow.recordset[0]?.RealName || userRow.recordset[0]?.Username || operatorName
          } catch (_) { /* 忽略，使用默认名称 */ }
        }

        const formattedDate = manufactureDate
          ? new Date(manufactureDate).toISOString().slice(0, 10)
          : "（已清空）"

        const warrantyLabel =
          warrantyStatus === "InWarranty" ? "保内" :
          warrantyStatus === "OutOfWarranty" ? "过保" : warrantyStatus || "未知"

        const description = didRevert
          ? `仓库人员重新核对设备出厂日期（设备SN：${deviceSn || deviceId}，新日期：${formattedDate}，保修判定：${warrantyLabel}），批次状态已从"${currentStatus}"回退至"仓库确认中"`
          : `仓库人员更新设备出厂日期（设备SN：${deviceSn || deviceId}，新日期：${formattedDate}，保修判定：${warrantyLabel}）`

        // 动态检测 Repair_Ticket_History 表的列，兼容不同版本数据库
        const histColCheck = await pool.request().query(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_NAME = 'Repair_Ticket_History'
            AND COLUMN_NAME IN ('BatchId','OperatorId','OperatorName','Description','OldStatus','NewStatus','TicketID')
        `)
        const histCols = new Set(
          histColCheck.recordset.map((r: Record<string, unknown>) => (r.COLUMN_NAME as string).toLowerCase())
        )

        const insertCols: string[] = ['ActionType', 'CreatedAt']
        const insertVals: string[] = ['@actionType', '@createdAt']
        const histReq = pool.request()
          .input('actionType', TicketActionType.MANUFACTURE_DATE_OVERRIDE)
          .input('createdAt', new Date())

        if (histCols.has('batchid')) {
          insertCols.push('BatchId'); insertVals.push('@batchId')
          histReq.input('batchId', batchId)
        }
        if (histCols.has('ticketid')) {
          insertCols.push('TicketID'); insertVals.push('@ticketId')
          histReq.input('ticketId', String(deviceId))
        }
        if (histCols.has('operatorid') && userIdCookie) {
          insertCols.push('OperatorId'); insertVals.push('@operatorId')
          histReq.input('operatorId', Number(userIdCookie))
        }
        if (histCols.has('operatorname')) {
          insertCols.push('OperatorName'); insertVals.push('@operatorName')
          histReq.input('operatorName', operatorName)
        }
        if (histCols.has('description')) {
          insertCols.push('Description'); insertVals.push('@description')
          histReq.input('description', description)
        }
        if (histCols.has('oldstatus')) {
          insertCols.push('OldStatus'); insertVals.push('@oldStatus')
          histReq.input('oldStatus', currentStatus || null)
        }
        if (histCols.has('newstatus')) {
          insertCols.push('NewStatus'); insertVals.push('@newStatus')
          histReq.input('newStatus', didRevert ? TicketStatus.WAREHOUSE_CONFIRMING : (currentStatus || null))
        }

        await histReq.query(`
          INSERT INTO Repair_Ticket_History (${insertCols.join(', ')})
          VALUES (${insertVals.join(', ')})
        `)

        console.log(`✅ [ManufactureDateOverride] 操作日志已写入，batchId=${batchId}, deviceId=${deviceId}, didRevert=${didRevert}`)
      } catch (logError) {
        console.error(`❌ [ManufactureDateOverride] 写入操作日志失败:`, logError)
      }
    }

    return NextResponse.json({
      success: true,
      message: didRevert
        ? `出厂日期已更新，批次状态已回退至仓库确认中`
        : `出厂日期已更新`,
      data: { warrantyStatus, didRevert },
    })
  } catch (error: unknown) {
    console.error("更新出厂日期失败:", error)
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "更新出厂日期失败" },
      { status: 500 }
    )
  }
}
