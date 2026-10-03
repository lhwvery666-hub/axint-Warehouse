import { isSignedRepairReport, mergeRepairReportContent, parseRepairReportContent, sumRepairCosts } from "@/lib/repair-report-policy"
import { NextResponse } from "next/server"
import * as sql from "mssql"
import { z } from "zod"
import { getDbConnection } from "@/lib/db-config"
import { DB_FIELDS, UserRole, REPAIR_ACTION_LABELS, RepairAction, TicketActionType } from "@/lib/enums"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"
import {
  canViewFactoryDetails,
  getVisibleRepairAction,
  getVisibleTicketStatus,
  projectTicketForViewer,
} from "@/lib/ticket-visibility"

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
    const viewerRole = authResult.normalizedRole
    const mayViewFactoryDetails = canViewFactoryDetails(viewerRole)
    const reporterUserId = Number(authResult.userId)
    if (viewerRole === UserRole.REPORTER && !Number.isSafeInteger(reporterUserId)) {
      return NextResponse.json({ success: false, message: "登录身份无效" }, { status: 401 })
    }

    if (!batchId) {
      return NextResponse.json(
        { success: false, message: "批次ID不能为空" },
        { status: 400 }
      )
    }

    console.log(`📋 获取批次维修报告: ${batchId}`)

    const pool = await getDbConnection()

    // 查询该批次下的所有设备
    const reportRequest = pool
      .request()
      .input("batchId", batchId)
    if (viewerRole === UserRole.REPORTER) {
      reportRequest.input("reporterUserId", sql.Int, reporterUserId)
    }
    const result = await reportRequest.query(`
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
          ReporterConfirmedAt,
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
          ${viewerRole === UserRole.REPORTER ? "AND ReportByUserID = @reporterUserId" : ""}
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
      reportLocked: result.recordset.some(isSignedRepairReport),
      isChargeable: sumRepairCosts(result.recordset.map(row => ({ RepairCost: row[DB_FIELDS.REPAIR_COST] ?? 0 }))) > 0,
      status: getVisibleTicketStatus(firstRecord[DB_FIELDS.STATUS], viewerRole),
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

      const rawRepairAction = row[DB_FIELDS.REPAIR_ACTION] || row.RepairAction || null
      const visibleRepairAction = getVisibleRepairAction(rawRepairAction, viewerRole)

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
        repairAction: visibleRepairAction,
        repairActionLabel: visibleRepairAction
          ? REPAIR_ACTION_LABELS[visibleRepairAction as RepairAction] ?? visibleRepairAction
          : null,
        repairNotes: row[DB_FIELDS.REPAIR_NOTES] || row.RepairNotes || "",
        isInvoiced: row.IsInvoiced || false,
        factoryRepairDate: mayViewFactoryDetails ? formatDate(row.FactoryRepairDate) : "",
        returnDate: formatDate(row.ReturnDate),
        // 优先使用技术人员人工判定的覆盖值，再回落到系统计算值
        warrantyStatus: row[DB_FIELDS.WARRANTY_STATUS_OVERRIDE] || row.WarrantyStatusOverride
          || row[DB_FIELDS.WARRANTY_STATUS] || row.WarrantyStatus || null,
        // 如果有保存的内容，使用保存的，否则使用故障点（维修人员填写的）
        repairContent: savedContent?.repairContent || (viewerRole === UserRole.REPORTER ? "" : row[DB_FIELDS.FAULT_POINT] || row.FaultPoint || ""),
        improvements: savedContent?.improvements || "",  // 从保存的内容中读取
        // 从保存的内容中读取现场确认信息
        willReturn: savedContent?.willReturn !== undefined ? savedContent.willReturn : true,
        isCompleted: savedContent?.isCompleted !== undefined ? savedContent.isCompleted : false,
      }
    })

    // 计算总计
    const totalQuantity = devices.reduce((sum, d) => sum + d.quantity, 0)
    const totalCost = sumRepairCosts(devices.map(device => ({ RepairCost: device.repairCost })))

    const reportData = {
      batchInfo,
      devices: devices.map((device) => projectTicketForViewer(device, viewerRole)),
      totalQuantity,
      totalCost,
      remarks: typeof parseRepairReportContent(firstRecord.RepairReportContent).remarks === "string"
        ? parseRepairReportContent(firstRecord.RepairReportContent).remarks : "",
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
  context: { params: Promise<{ batchId: string }> }
) {
  const authResult = await checkUserRole([UserRole.ADMIN, UserRole.TECHNICIAN])
  if (isErrorResponse(authResult)) return authResult

  let transaction: sql.Transaction | null = null

  try {
    const { batchId } = await context.params
    if (!batchId || batchId.length > 100) {
      return NextResponse.json(
        { success: false, message: "批次ID无效" },
        { status: 400 }
      )
    }

    const bodySchema = z.object({
      devices: z.array(z.object({
        id: z.coerce.number().int().positive(),
        repairContent: z.string().max(10000).default(""),
        improvements: z.string().max(10000).default(""),
        repairCost: z.coerce.number().finite().min(0).max(100000000).default(0),
      }).passthrough()).min(1).max(500),
      remarks: z.string().max(5000).optional(),
      sendToReporter: z.boolean().optional(),
      isRevision: z.boolean().optional(),
    }).strict()
    const parsedBody = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsedBody.success) {
      return NextResponse.json(
        { success: false, message: "维修报告数据格式不正确" },
        { status: 400 }
      )
    }
    if (parsedBody.data.sendToReporter === true || parsedBody.data.isRevision === true) {
      return NextResponse.json(
        { success: false, message: "保存信息不能改变流程状态，请使用独立的“发送流程”按钮" },
        { status: 400 }
      )
    }

    const devices = parsedBody.data.devices
    const requestedIds = new Set(devices.map((device) => device.id))
    if (requestedIds.size !== devices.length) {
      return NextResponse.json(
        { success: false, message: "设备列表中存在重复记录" },
        { status: 400 }
      )
    }

    const pool = await getDbConnection()
    transaction = new sql.Transaction(pool)
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE)

    interface BatchDeviceRow {
      Id: number
      Status: string
      Quantity: number | null
      RepairReportContent: string | null
      SignedReportPhoto: string | null
      ReporterConfirmedAt: Date | null
    }
    const lockedRows = await new sql.Request(transaction)
      .input("batchId", sql.NVarChar(100), batchId)
      .query<BatchDeviceRow>(`
        SELECT ${DB_FIELDS.ID} AS Id, ${DB_FIELDS.STATUS} AS Status,
               ${DB_FIELDS.QUANTITY} AS Quantity, RepairReportContent, SignedReportPhoto, ReporterConfirmedAt
        FROM Repair_Tickets WITH (UPDLOCK, HOLDLOCK)
        WHERE ${DB_FIELDS.BATCH_ID} = @batchId
          AND ${DB_FIELDS.STATUS} <> 'Deleted'
      `)

    if (lockedRows.recordset.length === 0) {
      await transaction.rollback()
      transaction = null
      return NextResponse.json(
        { success: false, message: "未找到该批次设备" },
        { status: 404 }
      )
    }
    if (lockedRows.recordset.some(isSignedRepairReport)) {
      await transaction.rollback(); transaction = null
      return NextResponse.json({ success: false, message: "维修报告已签字确认，不能再修改报告或费用" }, { status: 409 })
    }
    const persistedIds = new Set(lockedRows.recordset.map((row) => Number(row.Id)))
    if (persistedIds.size !== requestedIds.size || [...requestedIds].some((id) => !persistedIds.has(id))) {
      await transaction.rollback()
      transaction = null
      return NextResponse.json(
        { success: false, message: "设备列表已经变化，请刷新页面后重试" },
        { status: 409 }
      )
    }

    for (const device of devices) {
      const reportContent = mergeRepairReportContent(lockedRows.recordset.find(row => row.Id === device.id)!.RepairReportContent, {
        repairContent: device.repairContent,
        improvements: device.improvements,
        ...(parsedBody.data.remarks !== undefined ? { remarks: parsedBody.data.remarks } : {}),
      })
      const updated = await new sql.Request(transaction)
        .input("deviceId", sql.Int, device.id)
        .input("batchId", sql.NVarChar(100), batchId)
        .input("reportContent", sql.NVarChar(sql.MAX), reportContent)
        .input("repairCost", sql.Decimal(18, 2), device.repairCost)
        .query(`
          UPDATE Repair_Tickets
          SET RepairReportContent = @reportContent,
              ${DB_FIELDS.REPAIR_COST} = @repairCost,
              UpdatedAt = GETUTCDATE()
          WHERE ${DB_FIELDS.ID} = @deviceId
            AND ${DB_FIELDS.BATCH_ID} = @batchId
            AND ${DB_FIELDS.STATUS} <> 'Deleted'
        `)
      if (updated.rowsAffected[0] !== 1) {
        throw new Error("REPORT_SAVE_CONFLICT")
      }
    }

    const currentStatus = lockedRows.recordset[0].Status
    const totalQuantity = lockedRows.recordset.reduce(
      (sum, row) => sum + (Number(row.Quantity) > 0 ? Number(row.Quantity) : 1),
      0
    )
    await new sql.Request(transaction)
      .input("batchId", sql.NVarChar(100), batchId)
      .input("actionType", sql.NVarChar(50), TicketActionType.REPAIR_REPORT_SAVED)
      .input("operatorId", sql.Int, Number(authResult.userId))
      .input("operatorName", sql.NVarChar(100), authResult.realName || "维修人员")
      .input("oldStatus", sql.NVarChar(50), currentStatus)
      .input("newStatus", sql.NVarChar(50), currentStatus)
      .input("description", sql.NVarChar(500), `保存维修报告信息，共 ${totalQuantity} 台设备；流程状态保持不变`)
      .query(`
        INSERT INTO Repair_Ticket_History (
          BatchId, ActionType, OperatorId, OperatorName,
          OldStatus, NewStatus, Description, CreatedAt
        ) VALUES (
          @batchId, @actionType, @operatorId, @operatorName,
          @oldStatus, @newStatus, @description, GETUTCDATE()
        )
      `)

    await transaction.commit()
    transaction = null

    return NextResponse.json({
      success: true,
      message: "维修报告信息已保存，流程状态未改变",
      sentToReporter: false,
    })
  } catch (error: unknown) {
    if (transaction) {
      try {
        await transaction.rollback()
      } catch (rollbackError: unknown) {
        console.error("回滚维修报告保存事务失败:", rollbackError)
      } finally {
        transaction = null
      }
    }
    console.error("更新批次维修报告失败:", error)
    const status = error instanceof Error && error.message === "REPORT_SAVE_CONFLICT" ? 409 : 500
    return NextResponse.json(
      { success: false, message: status === 409 ? "设备数据已经变化，请刷新后重试" : "更新维修报告失败" },
      { status }
    )
  }
}
