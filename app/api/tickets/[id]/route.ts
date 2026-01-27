import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"

// GET /api/tickets/[id]
// 获取单个维修工单详情
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> } | { params: { id: string } }
) {
  try {
    // 兼容 Next.js 新版本中 params 可能为 Promise 的情况
    const resolvedParams =
      "then" in (context as any).params
        ? await (context as { params: Promise<{ id: string }> }).params
        : (context as { params: { id: string } }).params

    const ticketId = resolvedParams.id

    if (!ticketId) {
      return NextResponse.json(
        { success: false, message: "工单ID不能为空" },
        { status: 400 }
      )
    }

    const pool = await getDbConnection()

    // 动态获取 Repair_Tickets 表的列名，避免大小写或命名不一致导致错误
    const columnsResult = await pool.request().query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'Repair_Tickets'
    `)
    const columnNames = columnsResult.recordset.map(row => row.COLUMN_NAME as string)

    // 优先使用主键列，其次使用名字中包含 "id" 的列，最后退回第一列
    const pkResult = await pool.request().query(`
      SELECT kcu.COLUMN_NAME
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
      JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
        ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
      WHERE tc.TABLE_NAME = 'Repair_Tickets' AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
    `)

    let idColumn: string
    if (pkResult.recordset.length > 0) {
      idColumn = pkResult.recordset[0].COLUMN_NAME as string
    } else {
      idColumn =
        columnNames.find((c) => c.toLowerCase().endsWith("id")) ||
        columnNames.find((c) => c.toLowerCase().includes("id")) ||
        columnNames[0]
    }

    const mapColumn = (preferredName: string, fallbackName: string) => {
      const foundColumn = columnNames.find(col => col.toLowerCase() === preferredName.toLowerCase())
      return foundColumn || fallbackName
    }

    const deviceSnColumn = mapColumn("DeviceSN", "DeviceSN")
    const modelNameColumn = mapColumn("ModelName", "ModelName")
    const projectLocationColumn = mapColumn("ProjectLocation", "ProjectLocation")
    const faultDescriptionColumn = mapColumn("FaultDescription", "FaultDescription")
    const reportByUserIdColumn = mapColumn("ReportByUserID", "ReportByUserID")
    const courierCompanyColumn = mapColumn("CourierCompany", "CourierCompany")
    const courierNumberColumn = mapColumn("CourierNumber", "CourierNumber")
    const statusColumn = mapColumn("Status", "Status")
    const reportTimeColumn = mapColumn("ReportTime", "ReportTime")
    const deviceNameColumn = mapColumn("DeviceName", "DeviceName")
    const materialCodeColumn = mapColumn("MaterialCode", "MaterialCode")
    const warehouseColumn = mapColumn("Warehouse", "Warehouse")
    const deviceImagesColumn = mapColumn("DeviceImages", "DeviceImages")
    const damageImagesColumn = mapColumn("DamageImages", "DamageImages")
    const productSnColumn = mapColumn("ProductSN", "ProductSN")
    
    // 新字段映射
    const submitDateColumn = mapColumn("SubmitDate", "SubmitDate")
    const trackingNumberInColumn = mapColumn("TrackingNumber_In", "TrackingNumber_In")
    const senderAddressColumn = mapColumn("SenderAddress", "SenderAddress")
    const contactInfoColumn = mapColumn("ContactInfo", "ContactInfo")
    const projectNameColumn = mapColumn("ProjectName", "ProjectName")
    const categoryColumn = mapColumn("Category", "Category")
    const quantityColumn = mapColumn("Quantity", "Quantity")
    const fullSpecColumn = mapColumn("FullSpec", "FullSpec")
    const faultPointColumn = mapColumn("FaultPoint", "FaultPoint")
    const isChargeableColumn = mapColumn("IsChargeable", "IsChargeable")
    const isOutsourcedColumn = mapColumn("IsOutsourced", "IsOutsourced")
    const factoryRepairDateColumn = mapColumn("FactoryRepairDate", "FactoryRepairDate")
    const factoryTrackingNumColumn = mapColumn("FactoryTrackingNum", "FactoryTrackingNum")
    const supplierNameColumn = mapColumn("SupplierName", "SupplierName")
    const repairCostColumn = mapColumn("RepairCost", "RepairCost")
    const clientNameColumn = mapColumn("ClientName", "ClientName")
    const isInvoicedColumn = mapColumn("IsInvoiced", "IsInvoiced")
    const factoryReceivedDateColumn = mapColumn("FactoryReceivedDate", "FactoryReceivedDate")
    const receivedDateColumn = mapColumn("ReceivedDate", "ReceivedDate")
    const factoryShipDateColumn = mapColumn("FactoryShipDate", "FactoryShipDate")
    const returnDateColumn = mapColumn("ReturnDate", "ReturnDate")
    const returnQuantityColumn = mapColumn("ReturnQuantity", "ReturnQuantity")
    const returnTrackingNumColumn = mapColumn("ReturnTrackingNum", "ReturnTrackingNum")
    // 取消申请相关字段
    const cancelRequestStatusColumn = mapColumn("CancelRequestStatus", "CancelRequestStatus")
    const cancelRequestReasonColumn = mapColumn("CancelRequestReason", "CancelRequestReason")
    const cancelRequestDateColumn = mapColumn("CancelRequestDate", "CancelRequestDate")
    const cancelApprovedByColumn = mapColumn("CancelApprovedBy", "CancelApprovedBy")
    const cancelApprovedDateColumn = mapColumn("CancelApprovedDate", "CancelApprovedDate")

    const selectColumns = [
      idColumn,
      deviceSnColumn,
      modelNameColumn,
      projectLocationColumn,
      faultDescriptionColumn,
      reportByUserIdColumn,
      courierCompanyColumn,
      courierNumberColumn,
      statusColumn,
      reportTimeColumn,
      ...(columnNames.includes(deviceNameColumn) ? [deviceNameColumn] : []),
      ...(columnNames.includes(materialCodeColumn) ? [materialCodeColumn] : []),
      ...(columnNames.includes(warehouseColumn) ? [warehouseColumn] : []),
      ...(columnNames.includes(deviceImagesColumn) ? [deviceImagesColumn] : []),
      ...(columnNames.includes(damageImagesColumn) ? [damageImagesColumn] : []),
      ...(columnNames.includes(productSnColumn) ? [productSnColumn] : []),
      // 新字段
      ...(columnNames.includes(submitDateColumn) ? [submitDateColumn] : []),
      ...(columnNames.includes(trackingNumberInColumn) ? [trackingNumberInColumn] : []),
      ...(columnNames.includes(senderAddressColumn) ? [senderAddressColumn] : []),
      ...(columnNames.includes(contactInfoColumn) ? [contactInfoColumn] : []),
      ...(columnNames.includes(projectNameColumn) ? [projectNameColumn] : []),
      ...(columnNames.includes(categoryColumn) ? [categoryColumn] : []),
      ...(columnNames.includes(quantityColumn) ? [quantityColumn] : []),
      ...(columnNames.includes(fullSpecColumn) ? [fullSpecColumn] : []),
      ...(columnNames.includes(faultPointColumn) ? [faultPointColumn] : []),
      ...(columnNames.includes(isChargeableColumn) ? [isChargeableColumn] : []),
      ...(columnNames.includes(isOutsourcedColumn) ? [isOutsourcedColumn] : []),
      ...(columnNames.includes(factoryRepairDateColumn) ? [factoryRepairDateColumn] : []),
      ...(columnNames.includes(factoryTrackingNumColumn) ? [factoryTrackingNumColumn] : []),
      ...(columnNames.includes(supplierNameColumn) ? [supplierNameColumn] : []),
      ...(columnNames.includes(repairCostColumn) ? [repairCostColumn] : []),
      ...(columnNames.includes(clientNameColumn) ? [clientNameColumn] : []),
      ...(columnNames.includes(isInvoicedColumn) ? [isInvoicedColumn] : []),
      ...(columnNames.includes(factoryReceivedDateColumn) ? [factoryReceivedDateColumn] : []),
      ...(columnNames.includes(receivedDateColumn) ? [receivedDateColumn] : []),
      ...(columnNames.includes(factoryShipDateColumn) ? [factoryShipDateColumn] : []),
      ...(columnNames.includes(returnDateColumn) ? [returnDateColumn] : []),
      ...(columnNames.includes(returnQuantityColumn) ? [returnQuantityColumn] : []),
      ...(columnNames.includes(returnTrackingNumColumn) ? [returnTrackingNumColumn] : []),
      // 取消申请相关字段
      ...(columnNames.includes(cancelRequestStatusColumn) ? [cancelRequestStatusColumn] : []),
      ...(columnNames.includes(cancelRequestReasonColumn) ? [cancelRequestReasonColumn] : []),
      ...(columnNames.includes(cancelRequestDateColumn) ? [cancelRequestDateColumn] : []),
      ...(columnNames.includes(cancelApprovedByColumn) ? [cancelApprovedByColumn] : []),
      ...(columnNames.includes(cancelApprovedDateColumn) ? [cancelApprovedDateColumn] : []),
    ]
      .filter(Boolean)
      .join(", ")

    // 查询工单信息
    const result = await pool
      .request()
      .input("ticketId", ticketId)
      .query(`
        SELECT
          ${selectColumns}
        FROM Repair_Tickets
        WHERE ${idColumn} = @ticketId
      `)

    if (result.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "工单不存在" },
        { status: 404 }
      )
    }

    const ticket = result.recordset[0]

    // 根据设备序列号查询设备详细信息
    let deviceInfo = {
      deviceName: ticket[modelNameColumn] || "",
      modelName: "",
      materialCode: "",
      warehouse: "",
    }

    // 查询历史记录（如果存在）
    let expectedCompletionDate: string | null = null
    let delayReason: string | null = null
    let history: {
      actionType: string
      oldStatus?: string | null
      newStatus?: string | null
      delayTo?: string | null
      delayReason?: string | null
      createdAt: string
    }[] = []

    try {
      const historyResult = await pool
        .request()
        .input("ticketId", ticketId.toString())
        .query(`
          IF OBJECT_ID('dbo.Repair_Ticket_History', 'U') IS NOT NULL
          BEGIN
            SELECT TicketID, ActionType, OldStatus, NewStatus, DelayTo, DelayReason, CreatedAt
            FROM [dbo].[Repair_Ticket_History]
            WHERE TicketID = @ticketId
            ORDER BY CreatedAt ASC
          END
          ELSE
          BEGIN
            SELECT CAST(NULL AS NVARCHAR(50)) AS TicketID,
                   CAST(NULL AS NVARCHAR(50)) AS ActionType,
                   CAST(NULL AS NVARCHAR(50)) AS OldStatus,
                   CAST(NULL AS NVARCHAR(50)) AS NewStatus,
                   CAST(NULL AS DATETIME) AS DelayTo,
                   CAST(NULL AS NVARCHAR(500)) AS DelayReason,
                   CAST(NULL AS DATETIME) AS CreatedAt
          END
        `)

      history = historyResult.recordset
        .filter((row: any) => row.ActionType)
        .map((row: any) => ({
          actionType: row.ActionType,
          oldStatus: row.OldStatus,
          newStatus: row.NewStatus,
          delayTo: row.DelayTo ? new Date(row.DelayTo).toISOString() : null,
          delayReason: row.DelayReason || null,
          createdAt: row.CreatedAt ? new Date(row.CreatedAt).toISOString() : new Date().toISOString(),
        }))

      const lastDelay = history
        .filter((h) => h.actionType === "Delay")
        .slice(-1)[0]

      if (lastDelay) {
        expectedCompletionDate = lastDelay.delayTo || null
        delayReason = lastDelay.delayReason || null
      }
    } catch (historyError: any) {
      console.error("查询延期记录失败:", historyError?.message)
    }

    if (ticket[deviceSnColumn]) {
      try {
        const deviceResult = await pool
          .request()
          .input("serialNumber", ticket[deviceSnColumn])
          .query(`
            SELECT TOP 1 DeviceName, ModelName, MaterialCode, Warehouse
            FROM Device_Inventory
            WHERE SerialNumber = @serialNumber
          `)

        if (deviceResult.recordset.length > 0) {
          const device = deviceResult.recordset[0]
          deviceInfo = {
            deviceName: device.DeviceName || ticket[modelNameColumn] || "",
            modelName: device.ModelName || "",
            materialCode: device.MaterialCode || "",
            warehouse: device.Warehouse || "",
          }
        }
      } catch (deviceError: any) {
        console.error("查询设备信息失败:", deviceError?.message)
        // 查询失败时，继续使用工单表中的数据
      }
    }

    // 根据 ReportByUserID 查询报告人的真实姓名和手机号
    let reporterName = ticket[reportByUserIdColumn]?.toString() || ""
    let reporterPhone = ""

    // 检查 Users 表是否有 PhoneNumber 字段
    let hasPhoneNumberColumn = false
    try {
      const phoneColumnCheck = await pool
        .request()
        .query(`
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_NAME = 'Users' AND COLUMN_NAME = 'PhoneNumber'
        `)
      hasPhoneNumberColumn = phoneColumnCheck.recordset.length > 0
    } catch (phoneCheckError: any) {
      console.error("检查 Users.PhoneNumber 字段失败:", phoneCheckError?.message)
    }

    if (ticket[reportByUserIdColumn]) {
      try {
        const userResult = await pool
          .request()
          .input("userId", ticket[reportByUserIdColumn])
          .query(`
            SELECT TOP 1 RealName, Username${hasPhoneNumberColumn ? ", PhoneNumber" : ""}
            FROM Users
            WHERE UserID = @userId
          `)

        if (userResult.recordset.length > 0) {
          const user = userResult.recordset[0]
          // 优先使用 RealName，如果没有则使用 Username
          reporterName = user.RealName || user.Username || ticket[reportByUserIdColumn]?.toString() || ""
          if (hasPhoneNumberColumn) {
            reporterPhone = user.PhoneNumber || ""
          }
        }
      } catch (userError: any) {
        console.error("查询报告人信息失败:", userError?.message)
        // 查询失败时，使用用户ID作为后备
        reporterName = ticket[reportByUserIdColumn]?.toString() || ""
      }
    }

    // 状态映射：统一状态值
    const dbStatus = ticket[statusColumn] || "Created"
    const statusLower = (dbStatus || "").toLowerCase().trim()
    let mappedStatus = dbStatus // 默认使用原始值
    
    // 统一状态值
    if (statusLower === "created" || statusLower === "pending") {
      mappedStatus = "Created"
    } else if (statusLower === "in_repair" || statusLower === "processing") {
      mappedStatus = "In_Repair"
    } else if (statusLower === "pending_factory") {
      mappedStatus = "Pending_Factory"
    } else if (statusLower === "factory_finished") {
      mappedStatus = "Factory_Finished"
    } else if (statusLower === "admin_review") {
      mappedStatus = "Admin_Review"
    } else if (statusLower === "pending_shipment") {
      mappedStatus = "Pending_Shipment"
    } else if (statusLower === "completed") {
      mappedStatus = "Completed"
    } else if (statusLower === "unrepairable") {
      mappedStatus = "Unrepairable"
    } else {
      // 如果状态未知，默认设为 Created
      mappedStatus = "Created"
    }
    
    return NextResponse.json({
      success: true,
      data: {
        id: ticket[idColumn]?.toString() || "",
        deviceSerialNumber: ticket[deviceSnColumn] || "",
        productSN: ticket[productSnColumn] || ticket[deviceSnColumn] || "",
        deviceName: deviceInfo.deviceName || ticket[deviceNameColumn] || "",
        deviceModel: deviceInfo.modelName || ticket[modelNameColumn] || "",
        projectLocation: ticket[projectLocationColumn] || "",
        problem: ticket[faultDescriptionColumn] || "",
        status: mappedStatus, // 使用映射后的状态值
        reportedBy: reporterName,
        reporterPhone,
        reportedAt: ticket[reportTimeColumn]
          ? new Date(ticket[reportTimeColumn]).toISOString()
          : new Date().toISOString(),
        courierCompany: ticket[courierCompanyColumn] || "",
        trackingNumber: ticket[courierNumberColumn] || "",
        materialCode: deviceInfo.materialCode || ticket[materialCodeColumn] || "",
        warehouse: deviceInfo.warehouse || ticket[warehouseColumn] || "",
        deviceImages: ticket[deviceImagesColumn] || "",
        damageImages: ticket[damageImagesColumn] || "",
        expectedCompletionDate,
        delayReason,
        history,
        // 新字段
        submitDate: ticket[submitDateColumn] ? new Date(ticket[submitDateColumn]).toISOString() : undefined,
        trackingNumberIn: ticket[trackingNumberInColumn] || "",
        senderAddress: ticket[senderAddressColumn] || "",
        contactInfo: ticket[contactInfoColumn] || "",
        projectName: ticket[projectNameColumn] || "",
        category: ticket[categoryColumn] || "",
        modelName: ticket[modelNameColumn] || "",
        quantity: ticket[quantityColumn] || 1,
        faultDescription: ticket[faultDescriptionColumn] || "",
        fullSpec: ticket[fullSpecColumn] || "",
        faultPoint: ticket[faultPointColumn] || "",
        isChargeable: ticket[isChargeableColumn] === 1 || ticket[isChargeableColumn] === true,
        isOutsourced: ticket[isOutsourcedColumn] === 1 || ticket[isOutsourcedColumn] === true,
        factoryRepairDate: ticket[factoryRepairDateColumn] ? new Date(ticket[factoryRepairDateColumn]).toISOString() : undefined,
        factoryTrackingNum: ticket[factoryTrackingNumColumn] || "",
        supplierName: ticket[supplierNameColumn] || "",
        repairCost: ticket[repairCostColumn] || null,
        clientName: ticket[clientNameColumn] || "",
        isInvoiced: ticket[isInvoicedColumn] === 1 || ticket[isInvoicedColumn] === true,
        factoryReceivedDate: ticket[factoryReceivedDateColumn] ? new Date(ticket[factoryReceivedDateColumn]).toISOString() : undefined,
        receivedDate: ticket[receivedDateColumn] ? new Date(ticket[receivedDateColumn]).toISOString() : undefined,
        factoryShipDate: ticket[factoryShipDateColumn] ? new Date(ticket[factoryShipDateColumn]).toISOString() : undefined,
        returnDate: ticket[returnDateColumn] ? new Date(ticket[returnDateColumn]).toISOString() : undefined,
        returnQuantity: ticket[returnQuantityColumn] || 1,
        returnTrackingNum: ticket[returnTrackingNumColumn] || "",
        // 取消申请相关字段
        cancelRequestStatus: ticket[cancelRequestStatusColumn] || null,
        cancelRequestReason: ticket[cancelRequestReasonColumn] || null,
        cancelRequestDate: ticket[cancelRequestDateColumn] ? new Date(ticket[cancelRequestDateColumn]).toISOString() : null,
        cancelApprovedBy: ticket[cancelApprovedByColumn] || null,
        cancelApprovedDate: ticket[cancelApprovedDateColumn] ? new Date(ticket[cancelApprovedDateColumn]).toISOString() : null,
      },
    })
  } catch (error: any) {
    console.error("获取维修工单详情失败:", error)
    return NextResponse.json(
      {
        success: false,
        message: "获取维修工单详情时发生错误",
        error: error?.message || "未知错误",
      },
      { status: 500 }
    )
  }
}

// PUT /api/tickets/[id]
// 更新维修工单（支持部分更新，分角色填报）
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> } | { params: { id: string } }
) {
  try {
    const body = await request.json().catch(() => ({}))
    
    // 兼容 Next.js 新版本中 params 可能为 Promise 的情况
    const resolvedParams =
      "then" in (context as any).params
        ? await (context as { params: Promise<{ id: string }> }).params
        : (context as { params: { id: string } }).params

    const ticketId = resolvedParams.id

    if (!ticketId) {
      return NextResponse.json(
        { success: false, message: "工单ID不能为空" },
        { status: 400 }
      )
    }

    const pool = await getDbConnection()

    // 获取表结构
    const columnsResult = await pool.request().query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'Repair_Tickets'
    `)
    const columnNames = columnsResult.recordset.map((row: any) => row.COLUMN_NAME as string)

    // 获取主键列
    const pkResult = await pool.request().query(`
      SELECT kcu.COLUMN_NAME
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
      JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
        ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
      WHERE tc.TABLE_NAME = 'Repair_Tickets' AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
    `)

    let idColumn: string
    if (pkResult.recordset.length > 0) {
      idColumn = pkResult.recordset[0].COLUMN_NAME as string
    } else {
      idColumn =
        columnNames.find((c) => c.toLowerCase().endsWith("id")) ||
        columnNames.find((c) => c.toLowerCase().includes("id")) ||
        columnNames[0]
    }

    // 检查工单是否存在，并获取当前状态
    const checkResult = await pool
      .request()
      .input("ticketId", ticketId)
      .query(`
        SELECT ${idColumn} as Id, Status, ProductSN, ModelName, MaterialCode, FullSpec, FaultPoint
        FROM Repair_Tickets
        WHERE ${idColumn} = @ticketId
      `)

    if (checkResult.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "工单不存在" },
        { status: 404 }
      )
    }

    const currentTicket = checkResult.recordset[0] as {
      Id: number
      Status?: string
      ProductSN?: string
      ModelName?: string
      MaterialCode?: string
      FullSpec?: string
      FaultPoint?: string
    }

    const currentStatus = (currentTicket.Status || "").toString()
    const mapColumn = (preferredName: string) => {
      return columnNames.find((col) => col.toLowerCase() === preferredName.toLowerCase()) || preferredName
    }

    // 构建动态更新语句
    const updateFields: string[] = []
    const updateRequest = pool.request().input("ticketId", ticketId)

    // 字段映射：前端字段名 -> 数据库列名
    const fieldMappings: Record<string, string> = {
      // 现场人员填报区
      submitDate: mapColumn("SubmitDate"),
      trackingNumberIn: mapColumn("TrackingNumber_In"),
      senderAddress: mapColumn("SenderAddress"),
      contactInfo: mapColumn("ContactInfo"),
      projectName: mapColumn("ProjectName"),
      category: mapColumn("Category"),
      modelName: mapColumn("ModelName"),
      quantity: mapColumn("Quantity"),
      productSN: mapColumn("ProductSN"),
      faultDescription: mapColumn("FaultDescription"),
      // 维修人员填写区
      materialCode: mapColumn("MaterialCode"),
      deviceName: mapColumn("DeviceName"),
      fullSpec: mapColumn("FullSpec"),
      faultPoint: mapColumn("FaultPoint"),
      // 管理员填写区
      isChargeable: mapColumn("IsChargeable"),
      factoryRepairDate: mapColumn("FactoryRepairDate"),
      factoryTrackingNum: mapColumn("FactoryTrackingNum"),
      supplierName: mapColumn("SupplierName"),
      repairCost: mapColumn("RepairCost"),
      clientName: mapColumn("ClientName"),
      isInvoiced: mapColumn("IsInvoiced"),
      factoryReceivedDate: mapColumn("FactoryReceivedDate"),
      // 仓库管理员填写区
      receivedDate: mapColumn("ReceivedDate"),
      factoryShipDate: mapColumn("FactoryShipDate"),
      returnDate: mapColumn("ReturnDate"),
      returnQuantity: mapColumn("ReturnQuantity"),
      returnTrackingNum: mapColumn("ReturnTrackingNum"),
      // 其他字段
      status: mapColumn("Status"),
    }

    // 记录哪些字段被更新了（用于自动状态流转和物料代码匹配）
    let faultPointUpdated = false
    let returnTrackingNumUpdated = false
    let productSNUpdated = false
    let modelNameUpdated = false

    // 处理每个字段
    for (const [fieldName, dbColumnName] of Object.entries(fieldMappings)) {
      // 检查字段是否存在
      if (!columnNames.some((col) => col.toLowerCase() === dbColumnName.toLowerCase())) {
        continue
      }

      // 检查前端是否传了这个字段
      if (!(fieldName in body)) {
        continue
      }

      const value = body[fieldName]

      // 特殊处理
      if (fieldName === "faultPoint" && value !== null && value !== undefined && value !== "") {
        faultPointUpdated = true
      }
      if (fieldName === "returnTrackingNum" && value !== null && value !== undefined && value !== "") {
        returnTrackingNumUpdated = true
      }
      if (fieldName === "productSN" && value !== null && value !== undefined && value !== currentTicket.ProductSN) {
        productSNUpdated = true
      }
      if (fieldName === "modelName" && value !== null && value !== undefined && value !== currentTicket.ModelName) {
        modelNameUpdated = true
      }

      // 处理不同类型的值
      if (value === null || value === undefined || value === "") {
        // 空值：设置为 NULL
        updateFields.push(`[${dbColumnName}] = NULL`)
      } else if (fieldName === "isChargeable" || fieldName === "isInvoiced") {
        // 布尔值
        const boolValue = value === true || value === "true" || value === 1 || value === "1" ? 1 : 0
        updateFields.push(`[${dbColumnName}] = @${fieldName}`)
        updateRequest.input(fieldName, boolValue)
      } else if (fieldName === "quantity" || fieldName === "returnQuantity") {
        // 整数
        const intValue = Number(value)
        if (!isNaN(intValue)) {
          updateFields.push(`[${dbColumnName}] = @${fieldName}`)
          updateRequest.input(fieldName, intValue)
        }
      } else if (fieldName === "repairCost") {
        // 小数
        const decimalValue = Number(value)
        if (!isNaN(decimalValue)) {
          updateFields.push(`[${dbColumnName}] = @${fieldName}`)
          updateRequest.input(fieldName, decimalValue)
        }
      } else if (
        fieldName === "submitDate" ||
        fieldName === "factoryRepairDate" ||
        fieldName === "receivedDate" ||
        fieldName === "factoryShipDate" ||
        fieldName === "returnDate"
      ) {
        // 日期时间
        const dateValue = value instanceof Date ? value : new Date(value)
        if (!isNaN(dateValue.getTime())) {
          updateFields.push(`[${dbColumnName}] = @${fieldName}`)
          updateRequest.input(fieldName, dateValue)
        }
      } else {
        // 字符串
        updateFields.push(`[${dbColumnName}] = @${fieldName}`)
        updateRequest.input(fieldName, String(value).trim())
      }
    }

    // 如果没有要更新的字段，直接返回
    if (updateFields.length === 0) {
      return NextResponse.json({
        success: true,
        message: "没有需要更新的字段",
      })
    }

    // ===== 物料代码匹配逻辑 =====
    // 如果 ProductSN 或 ModelName 被更新，尝试从 Inventory 表自动补全 MaterialCode 和 FullSpec
    if ((productSNUpdated || modelNameUpdated) && (!currentTicket.MaterialCode || !currentTicket.FullSpec)) {
      try {
        const productSN = body.productSN || currentTicket.ProductSN
        const modelName = body.modelName || currentTicket.ModelName

        if (productSN && productSN !== "PENDING") {
          const deviceResult = await pool
            .request()
            .input("serialNumber", productSN)
            .query(`
              SELECT TOP 1 MaterialCode, ModelName, DeviceName
              FROM Device_Inventory
              WHERE SerialNumber = @serialNumber
            `)

          if (deviceResult.recordset.length > 0) {
            const device = deviceResult.recordset[0] as {
              MaterialCode?: string
              ModelName?: string
              DeviceName?: string
            }

            // 如果 MaterialCode 为空，尝试从 Inventory 补全
            if (!currentTicket.MaterialCode && device.MaterialCode) {
              const materialCodeCol = mapColumn("MaterialCode")
              if (columnNames.some((col) => col.toLowerCase() === materialCodeCol.toLowerCase())) {
                updateFields.push(`[${materialCodeCol}] = @autoMaterialCode`)
                updateRequest.input("autoMaterialCode", device.MaterialCode)
              }
            }

            // 如果 FullSpec 为空，尝试从 Inventory 补全（使用 ModelName 或 DeviceName）
            if (!currentTicket.FullSpec) {
              const fullSpecValue = device.ModelName || device.DeviceName || modelName
              if (fullSpecValue) {
                const fullSpecCol = mapColumn("FullSpec")
                if (columnNames.some((col) => col.toLowerCase() === fullSpecCol.toLowerCase())) {
                  updateFields.push(`[${fullSpecCol}] = @autoFullSpec`)
                  updateRequest.input("autoFullSpec", fullSpecValue)
                }
              }
            }
          }
        }
      } catch (inventoryError: any) {
        console.error("自动补全物料代码失败:", inventoryError?.message)
        // 不影响主流程，继续执行
      }
    }

    // ===== 自动状态流转逻辑 =====
    let newStatus: string | null = null
    let statusAutoUpdated = false

    // 规则1：维修人员填完 FaultPoint 时，如果状态是待处理或维修中，自动转为待商务处理
    if (faultPointUpdated && (currentStatus === "Created" || currentStatus === "Pending" || currentStatus === "In_Repair")) {
      // 如果前端没有传 status，才自动更新
      if (!("status" in body)) {
        newStatus = "Admin_Review"
        statusAutoUpdated = true
        const statusCol = mapColumn("Status")
        if (columnNames.some((col) => col.toLowerCase() === statusCol.toLowerCase())) {
          updateFields.push(`[${statusCol}] = @autoStatus1`)
          updateRequest.input("autoStatus1", "Admin_Review")
        }
      }
    }

    // 规则2：管理员填写商务信息后，如果状态是待商务处理，自动转为待发货
    // 检查是否填写了关键商务字段（收费金额或客户名称）- 根据Excel表格，只有这两个字段是管理员填写的
    const hasAdminInfo = body.repairCost !== undefined || body.clientName !== undefined
    if (hasAdminInfo && currentStatus === "Admin_Review" && !statusAutoUpdated) {
      // 如果前端没有传 status，才自动更新
      if (!("status" in body)) {
        newStatus = "Pending_Shipment"
        statusAutoUpdated = true
        const statusCol = mapColumn("Status")
        if (columnNames.some((col) => col.toLowerCase() === statusCol.toLowerCase())) {
          updateFields.push(`[${statusCol}] = @autoStatus3`)
          updateRequest.input("autoStatus3", "Pending_Shipment")
        }
      }
    }

    // 规则3：仓库管理员填完 ReturnTrackingNum 时，自动转为已完成
    if (returnTrackingNumUpdated && !statusAutoUpdated) {
      // 如果前端没有传 status，才自动更新
      if (!("status" in body)) {
        newStatus = "Completed"
        statusAutoUpdated = true
        const statusCol = mapColumn("Status")
        if (columnNames.some((col) => col.toLowerCase() === statusCol.toLowerCase())) {
          updateFields.push(`[${statusCol}] = @autoStatus2`)
          updateRequest.input("autoStatus2", "Completed")
        }
      }
    }

    // 执行更新
    const updateSql = `
      UPDATE Repair_Tickets
      SET ${updateFields.join(", ")}
      WHERE ${idColumn} = @ticketId
    `

    await updateRequest.query(updateSql)

    // 记录状态变更历史（如果有状态变更）
    // 优先使用前端传入的 status，其次使用自动流转的 status，最后使用当前 status
    const finalStatus = body.status || newStatus || currentStatus
    const statusChanged = finalStatus !== currentStatus
    if (statusChanged) {
      try {
        const historyRequest = pool
          .request()
          .input("ticketId", ticketId.toString())
          .input("actionType", "StatusChange")
          .input("oldStatus", currentStatus || null)
          .input("newStatus", finalStatus)
          .input("delayTo", null)
          .input("delayReason", null)

        await historyRequest.query(`
          IF OBJECT_ID('dbo.Repair_Ticket_History', 'U') IS NOT NULL
          BEGIN
            INSERT INTO [dbo].[Repair_Ticket_History] (
              TicketID, ActionType, OldStatus, NewStatus, DelayTo, DelayReason
            )
            VALUES (
              @ticketId, @actionType, @oldStatus, @newStatus, @delayTo, @delayReason
            )
          END
        `)
      } catch (historyError: any) {
        console.error("记录状态变更历史失败:", historyError?.message)
      }
    }

    return NextResponse.json({
      success: true,
      message: "工单更新成功",
      data: {
        updatedFields: updateFields.length,
        statusChanged: statusChanged,
        oldStatus: currentStatus,
        newStatus: finalStatus,
        autoStatusChange: newStatus ? `状态自动流转: ${currentStatus} -> ${newStatus}` : null,
        materialCodeAutoFilled: productSNUpdated || modelNameUpdated,
      },
    })
  } catch (error: any) {
    console.error("更新工单失败:", error)
    return NextResponse.json(
      {
        success: false,
        message: "更新工单时发生错误",
        error: error?.message || "未知错误",
      },
      { status: 500 }
    )
  }
}

// DELETE /api/tickets/[id]
// 彻底删除单个维修工单
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> } | { params: { id: string } }
) {
  try {
    const resolvedParams =
      "then" in (context as any).params
        ? await (context as { params: Promise<{ id: string }> }).params
        : (context as { params: { id: string } }).params

    const ticketId = resolvedParams.id

    if (!ticketId) {
      return NextResponse.json(
        { success: false, message: "工单ID不能为空" },
        { status: 400 }
      )
    }

    const pool = await getDbConnection()

    // 获取真实主键列名
    const columnsResult = await pool.request().query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'Repair_Tickets'
    `)
    const columnNames = columnsResult.recordset.map(
      (row: any) => row.COLUMN_NAME as string
    )

    const pkResult = await pool.request().query(`
      SELECT kcu.COLUMN_NAME
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
      JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
        ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
      WHERE tc.TABLE_NAME = 'Repair_Tickets' AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
    `)

    let idColumn: string
    if (pkResult.recordset.length > 0) {
      idColumn = pkResult.recordset[0].COLUMN_NAME as string
    } else {
      idColumn =
        columnNames.find((c) => c.toLowerCase().endsWith("id")) ||
        columnNames.find((c) => c.toLowerCase().includes("id")) ||
        columnNames[0]
    }

    // 执行物理删除
    await pool
      .request()
      .input("ticketId", ticketId)
      .query(`
        DELETE FROM Repair_Tickets
        WHERE ${idColumn} = @ticketId
      `)

    return NextResponse.json({
      success: true,
      message: "工单已彻底删除",
    })
  } catch (error: any) {
    console.error("彻底删除维修工单失败:", error)
    return NextResponse.json(
      {
        success: false,
        message: "彻底删除维修工单时发生错误",
        error: error?.message || "未知错误",
      },
      { status: 500 }
    )
  }
}

