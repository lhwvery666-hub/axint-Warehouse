import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"
import { DB_FIELDS, UserRole, normalizeUserRole, REPAIR_ACTION_LABELS, RepairAction, TicketActionType, TERMINAL_STATUSES, normalizeTicketStatus } from "@/lib/enums"
import { cookies } from "next/headers"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"

const REPAIR_REPORT_READ_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.TECHNICIAN,
  UserRole.WAREHOUSE,
  UserRole.REPORTER,
  UserRole.BUSINESS,
]

/**
 * GET /api/tickets/batch-repair-report/[batchId]
 * 获取批次维修报告数据（用于编辑和打印）
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ batchId: string }> } | { params: { batchId: string } }
) {
  const authResult = await checkUserRole(REPAIR_REPORT_READ_ROLES)
  if (isErrorResponse(authResult)) return authResult

  try {
    const resolvedParams =
      "then" in (context as any).params
        ? await (context as { params: Promise<{ batchId: string }> }).params
        : (context as { params: { batchId: string } }).params

    const batchId = resolvedParams.batchId

    if (!batchId) {
      return NextResponse.json(
        { success: false, message: "批次ID不能为空" },
        { status: 400 }
      )
    }

    console.log(`📋 获取批次维修报告: ${batchId}`)

    const pool = await getDbConnection()

    // 查询该批次下的所有设备
    const result = await pool
      .request()
      .input("batchId", batchId)
      .query(`
        SELECT 
          ${DB_FIELDS.ID},
          ${DB_FIELDS.DEVICE_SN},
          ${DB_FIELDS.MODEL_NAME},
          ${DB_FIELDS.DEVICE_NAME},
          ${DB_FIELDS.PROBLEM},
          ${DB_FIELDS.MATERIAL_CODE},
          ${DB_FIELDS.FULL_SPEC},
          ${DB_FIELDS.FAULT_POINT},
          ${DB_FIELDS.REPAIR_COST},
          ${DB_FIELDS.BATCH_ID},
          ${DB_FIELDS.QUANTITY},
          ProjectLocation,
          ContactInfo,
          ProjectName,
          ClientName,
          SenderAddress,
          ReceivedDate,
          ReportedBy,
          TicketId,
          RepairReportContent,
          IsInvoiced,
          FactoryRepairDate,
          ReturnDate,
          ${DB_FIELDS.SIGNED_REPORT_PHOTO},
          ${DB_FIELDS.IS_CHARGEABLE},
          ${DB_FIELDS.STATUS},
          ${DB_FIELDS.SIGNED_PHOTO_VIEWED_BY},
          ${DB_FIELDS.SIGNED_PHOTO_VIEWED_AT},
          ${DB_FIELDS.SIGNED_PHOTO_MODIFY_REQUEST},
          ${DB_FIELDS.WARRANTY_STATUS},
          ${DB_FIELDS.WARRANTY_STATUS_OVERRIDE},
          ${DB_FIELDS.REPAIR_ACTION},
          ${DB_FIELDS.REPAIR_NOTES}
        FROM Repair_Tickets
        WHERE ${DB_FIELDS.BATCH_ID} = @batchId
        ORDER BY ${DB_FIELDS.ID} ASC
      `)

    if (result.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "未找到该批次的设备" },
        { status: 404 }
      )
    }

    // 格式化日期
    const formatDate = (date: any) => {
      if (!date) return ""
      const d = new Date(date)
      if (isNaN(d.getTime())) return ""
      return d.toISOString().split("T")[0]
    }

    // 从第一条记录中提取批次基础信息
    const firstRecord = result.recordset[0]
    
    // 获取签字照片路径并确保以 / 开头（兼容旧数据）
    let signedPhotoPath = firstRecord[DB_FIELDS.SIGNED_REPORT_PHOTO] || firstRecord.SignedReportPhoto || null;
    if (signedPhotoPath && !signedPhotoPath.startsWith('/') && !signedPhotoPath.startsWith('http')) {
      signedPhotoPath = '/' + signedPhotoPath;
    }
    
    // 创建工单时：customerInfo.name -> ProjectName(客户名称)，customerInfo.project -> ProjectLocation(项目名称)，customerInfo.address -> SenderAddress(客户地址)
    const batchInfo = {
      batchId: batchId,
      workOrderNumber: firstRecord.TicketId || batchId,
      projectName: firstRecord.ProjectName || "",       // 客户名称（创建工单填的）
      projectLocation: firstRecord.ProjectLocation || "", // 项目名称/位置（创建工单填的）
      contactInfo: firstRecord.ContactInfo || "",
      customerName: firstRecord.ProjectName || "",     // 兼容：与 projectName 同源，均为客户名称
      customerAddress: firstRecord.SenderAddress || "", // 客户地址（创建工单填的寄件人地址）
      receiveDate: formatDate(firstRecord.ReceivedDate),
      reporterName: firstRecord.ReportedBy || "",
      signedReportPhoto: signedPhotoPath,
      isChargeable: firstRecord[DB_FIELDS.IS_CHARGEABLE] || false,
      status: firstRecord[DB_FIELDS.STATUS] || "Created",
      signedPhotoViewedBy: firstRecord[DB_FIELDS.SIGNED_PHOTO_VIEWED_BY] || null,
      signedPhotoViewedAt: firstRecord[DB_FIELDS.SIGNED_PHOTO_VIEWED_AT] ? formatDate(firstRecord[DB_FIELDS.SIGNED_PHOTO_VIEWED_AT]) : null,
      signedPhotoModifyRequest: firstRecord[DB_FIELDS.SIGNED_PHOTO_MODIFY_REQUEST] || null,
    }

    // 构建每个设备的维修项目
    const devices = result.recordset.map((row: any) => {
      // 尝试解析已保存的维修报告内容
      let savedContent = null
      try {
        if (row.RepairReportContent) {
          savedContent = JSON.parse(row.RepairReportContent)
        }
      } catch (e) {
        console.error("解析维修报告内容失败:", e)
      }

      return {
        id: row[DB_FIELDS.ID] || row.Id,
        deviceSerialNumber: row[DB_FIELDS.DEVICE_SN] || row.DeviceSN || "未填写",
        modelName: row[DB_FIELDS.MODEL_NAME] || row.ModelName || "",
        deviceName: row[DB_FIELDS.DEVICE_NAME] || row.DeviceName || "",
        materialCode: row[DB_FIELDS.MATERIAL_CODE] || row.MaterialCode || "",
        fullSpec: row[DB_FIELDS.FULL_SPEC] || row.FullSpec || "",
        faultPoint: row[DB_FIELDS.FAULT_POINT] || row.FaultPoint || "",
        problem: row[DB_FIELDS.PROBLEM] || row.Problem || "",
        quantity: row[DB_FIELDS.QUANTITY] || row.Quantity || 1,
        repairCost: row[DB_FIELDS.REPAIR_COST] || row.RepairCost || 0,
        repairAction: row[DB_FIELDS.REPAIR_ACTION] || row.RepairAction || null,
        repairActionLabel: (() => {
          const raw = row[DB_FIELDS.REPAIR_ACTION] || row.RepairAction
          if (!raw) return null
          return REPAIR_ACTION_LABELS[raw as RepairAction] ?? raw
        })(),
        repairNotes: row[DB_FIELDS.REPAIR_NOTES] || row.RepairNotes || "",
        isInvoiced: row.IsInvoiced || false,
        factoryRepairDate: formatDate(row.FactoryRepairDate),
        returnDate: formatDate(row.ReturnDate),
        // 优先使用技术人员人工判定的覆盖值，再回落到系统计算值
        warrantyStatus: row[DB_FIELDS.WARRANTY_STATUS_OVERRIDE] || row.WarrantyStatusOverride
          || row[DB_FIELDS.WARRANTY_STATUS] || row.WarrantyStatus || null,
        // 如果有保存的内容，使用保存的，否则使用故障点（维修人员填写的）
        repairContent: savedContent?.repairContent || row[DB_FIELDS.FAULT_POINT] || row.FaultPoint || "",
        improvements: savedContent?.improvements || "",  // 从保存的内容中读取
        // 从保存的内容中读取现场确认信息
        willReturn: savedContent?.willReturn !== undefined ? savedContent.willReturn : true,
        isCompleted: savedContent?.isCompleted !== undefined ? savedContent.isCompleted : false,
      }
    })

    // 计算总计
    const totalQuantity = devices.reduce((sum, d) => sum + d.quantity, 0)
    const totalCost = devices.reduce((sum, d) => sum + d.repairCost, 0)

    const reportData = {
      batchInfo,
      devices,
      totalQuantity,
      totalCost,
      remarks: "",
    }

    return NextResponse.json({
      success: true,
      data: reportData,
    })
  } catch (error: unknown) {
    console.error("获取批次维修报告失败:", error)
    return NextResponse.json(
      { success: false, message: "获取失败" },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/tickets/batch-repair-report/[batchId]
 * 更新批次维修报告内容（只有维修人员可以填写）
 */
export async function PUT(
  request: Request,
  context: { params: Promise<{ batchId: string }> } | { params: { batchId: string } }
) {
  try {
    // 权限验证：只有维修人员可以编辑维修报告
    const cookieStore = await cookies()
    const userIdCookie = cookieStore.get("userId")?.value || null
    
    if (!userIdCookie) {
      return NextResponse.json(
        { success: false, message: "未登录，无法更新维修报告" },
        { status: 401 }
      )
    }

    const pool = await getDbConnection()
    
    // 查询用户角色
    const userResult = await pool
      .request()
      .input("userId", userIdCookie)
      .query(`
        SELECT TOP 1 Role, RealName
        FROM Users
        WHERE UserID = @userId
      `)

    if (userResult.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "用户不存在" },
        { status: 403 }
      )
    }

    const userData = userResult.recordset[0]
    const normalizedRole = normalizeUserRole(userData.Role)
    
    // 只有维修人员和管理员可以编辑维修报告
    if (normalizedRole !== UserRole.TECHNICIAN && normalizedRole !== UserRole.ADMIN) {
      return NextResponse.json(
        { 
          success: false, 
          message: "权限不足：只有维修人员和管理员可以编辑维修报告" 
        },
        { status: 403 }
      )
    }

    const resolvedParams =
      "then" in (context as any).params
        ? await (context as { params: Promise<{ batchId: string }> }).params
        : (context as { params: { batchId: string } }).params

    const batchId = resolvedParams.batchId
    const body = await request.json()
    // sendToReporter: true = 发送流程（改变状态）
    // isRevision:     true = 已发送后的修改（需要回退状态 + 写入变更日志）
    const { devices, remarks, sendToReporter, isRevision } = body

    if (!devices || !Array.isArray(devices)) {
      return NextResponse.json(
        { success: false, message: "设备数据格式不正确" },
        { status: 400 }
      )
    }

    console.log(`📝 维修人员 ${userData.RealName} 更新批次维修报告: ${batchId}, ${devices.length} 个设备, sendToReporter=${sendToReporter}, isRevision=${isRevision}`)

    // ── 若是修订模式，先读取旧值用于比对 ──
    // 只关心 repairCost（金额是最常见的修改项）
    type OldDevice = { Id: number; RepairCost: number | null; RepairReportContent: string | null }
    let oldDeviceMap: Map<number, OldDevice> = new Map()
    if (isRevision === true) {
      const oldResult = await pool
        .request()
        .input("batchId", batchId)
        .query(`
          SELECT ${DB_FIELDS.ID}, ${DB_FIELDS.REPAIR_COST}, RepairReportContent
          FROM Repair_Tickets
          WHERE ${DB_FIELDS.BATCH_ID} = @batchId
        `)
      for (const row of oldResult.recordset) {
        oldDeviceMap.set(row[DB_FIELDS.ID] ?? row.Id, {
          Id: row[DB_FIELDS.ID] ?? row.Id,
          RepairCost: row[DB_FIELDS.REPAIR_COST] ?? row.RepairCost ?? null,
          RepairReportContent: row.RepairReportContent ?? null,
        })
      }
    }

    // 逐个更新每个设备的维修报告内容
    for (const device of devices) {
      const deviceId = device.id
      if (!deviceId) { console.warn("设备ID为空，跳过"); continue }

      const reportContent = {
        repairContent: device.repairContent || "",
        improvements: device.improvements || "",
      }

      await pool
        .request()
        .input("deviceId", deviceId)
        .input("reportContent", JSON.stringify(reportContent))
        .input("repairCost", device.repairCost || 0)
        .query(`
          UPDATE Repair_Tickets
          SET 
            RepairReportContent = @reportContent,
            ${DB_FIELDS.REPAIR_COST} = @repairCost
          WHERE ${DB_FIELDS.ID} = @deviceId
        `)
    }

    // 检查是否所有设备都已填写维修内容
    const allFilled = devices.every((device: any) =>
      device.repairContent && device.repairContent.trim() !== ""
    )

    // ── 查询当前状态（用于下方逻辑判断）──
    const currentStatusResult = await pool
      .request()
      .input("batchId", batchId)
      .query(`
        SELECT TOP 1 ${DB_FIELDS.STATUS} AS CurrentStatus
        FROM Repair_Tickets
        WHERE ${DB_FIELDS.BATCH_ID} = @batchId
      `)
    const currentStatus = currentStatusResult.recordset[0]?.CurrentStatus ?? ""
    const isTerminal = TERMINAL_STATUSES.includes(normalizeTicketStatus(currentStatus) as any)

    // ────────────────────────────────────────────────────────────
    // 分支 A：修订模式（isRevision === true）
    //   → 回退状态至 In_Repair + 写入修改记录
    // ────────────────────────────────────────────────────────────
    if (isRevision === true) {
      if (!isTerminal) {
        // 回退状态
        await pool
          .request()
          .input("batchId", batchId)
          .input("newStatus", "In_Repair")
          .query(`
            UPDATE Repair_Tickets
            SET ${DB_FIELDS.STATUS} = @newStatus
            WHERE ${DB_FIELDS.BATCH_ID} = @batchId
          `)
        console.log(`🔄 [Revision] 批次 ${batchId} 状态回退至 In_Repair`)
      }

      // 构建变更摘要（金额变动优先记录）
      const changeSummaryLines: string[] = []
      for (const device of devices) {
        const old = oldDeviceMap.get(Number(device.id))
        if (!old) continue
        const oldCost = Number(old.RepairCost ?? 0)
        const newCost = Number(device.repairCost ?? 0)
        if (Math.abs(oldCost - newCost) > 0.001) {
          changeSummaryLines.push(
            `设备 ${device.deviceSerialNumber || device.id}：维修费用 ¥${oldCost.toFixed(2)} → ¥${newCost.toFixed(2)}`
          )
        }
      }
      const changeSummary = changeSummaryLines.length > 0
        ? `变更明细：\n${changeSummaryLines.join("\n")}`
        : "内容已修改（无金额变动）"

      try {
        await pool
          .request()
          .input("batchId", batchId)
          .input("actionType", TicketActionType.REPAIR_REPORT_REVISED)
          .input("operatorId", Number(userIdCookie))
          .input("operatorName", userData.RealName || "维修人员")
          .input("oldStatus", currentStatus)
          .input("newStatus", isTerminal ? currentStatus : "In_Repair")
          .input("description",
            `维修人员修改了已发送的维修报告，流程已回退至"维修检查中"，需重新发送。\n${changeSummary}`)
          .input("createdAt", new Date())
          .query(`
            INSERT INTO Repair_Ticket_History (
              BatchId, ActionType, OperatorId, OperatorName,
              OldStatus, NewStatus, Description, CreatedAt
            ) VALUES (
              @batchId, @actionType, @operatorId, @operatorName,
              @oldStatus, @newStatus, @description, @createdAt
            )
          `)
        console.log(`✅ [Revision] 修改记录已写入 Repair_Ticket_History`)
      } catch (histErr: unknown) {
        console.error(`❌ [Revision] 写入修改记录失败（非致命）:`, histErr)
      }

      return NextResponse.json({
        success: true,
        message: "报告修改已保存并记录，流程已回退至维修检查中，请重新发送流程",
        sentToReporter: false,
      })
    }

    // ────────────────────────────────────────────────────────────
    // 分支 B：发送流程（sendToReporter === true）
    //   → 状态流转至 Pending_Reporter_Confirm
    // ────────────────────────────────────────────────────────────
    if (allFilled && sendToReporter === true) {
      if (isTerminal) {
        console.log(`⛔ [终态封印] 批次 ${batchId} 当前状态为终止态（${currentStatus}），跳过 Status 更新，仅保存内容。`)
      } else {
        await pool
          .request()
          .input("batchId", batchId)
          .input("newStatus", "Pending_Reporter_Confirm")
          .query(`
            UPDATE Repair_Tickets
            SET ${DB_FIELDS.STATUS} = @newStatus
            WHERE ${DB_FIELDS.BATCH_ID} = @batchId
          `)
        console.log(`✅ 发送流程：批次 ${batchId} 状态更新为 Pending_Reporter_Confirm`)

        try {
          await pool
            .request()
            .input("batchId", batchId)
            .input("actionType", TicketActionType.REPAIR_REPORT_SUBMITTED)
            .input("operatorId", Number(userIdCookie))
            .input("operatorName", userData.RealName || "维修人员")
            .input("description", `提交维修报告并发送流程，现场人员可签字确认（共 ${devices.length} 台设备）`)
            .input("createdAt", new Date())
            .query(`
              INSERT INTO Repair_Ticket_History (
                BatchId, ActionType, OperatorId, OperatorName, Description, CreatedAt
              ) VALUES (
                @batchId, @actionType, @operatorId, @operatorName, @description, @createdAt
              )
            `)
          console.log(`✅ [Send Flow] 操作记录已写入 Repair_Ticket_History`)
        } catch (historyErr: unknown) {
          console.error(`❌ [Send Flow] 写入操作记录失败（非致命）:`, historyErr)
        }
      }
    }

    console.log(`✅ 批次维修报告更新成功`)

    return NextResponse.json({
      success: true,
      message: sendToReporter === true && allFilled
        ? "维修报告已保存并发送流程！现场人员现在可以签字确认"
        : sendToReporter === true && !allFilled
        ? "请完成所有设备的维修内容后再发送流程"
        : "维修报告已保存，可继续编辑或点击\"发送流程\"按钮",
      sentToReporter: sendToReporter === true && allFilled,
    })
  } catch (error: any) {
    console.error("更新批次维修报告失败:", error)
    return NextResponse.json(
      { success: false, message: error.message || "更新失败" },
      { status: 500 }
    )
  }
}
