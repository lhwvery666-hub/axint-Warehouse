import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { DB_FIELDS, TicketStatus, TicketActionType, normalizeTicketStatus, TICKET_STATUS_LABELS, UserRole } from "@/lib/enums"
import { TICKET_QUERY_MESSAGES } from "@/lib/api-messages"
import { ALL_USER_ROLES, checkUserRole, isErrorResponse } from "@/lib/auth-utils"

// 禁用该路由的缓存，确保详情页每次请求都命中数据库
export const dynamic = "force-dynamic"
export const revalidate = 0
export const fetchCache = "force-no-store"

// ==================== 类型定义 ====================
interface TicketRecord extends Record<string, unknown> {
  Id?: number
  BatchId?: string
  DeviceSN?: string
  ModelName?: string
  ProjectLocation?: string
  Problem?: string
  ReportByUserID?: number
  ExpressCompany?: string
  CourierCompany?: string
  TrackingNumber?: string
  CourierNumber?: string
  Status?: string
  CreatedAt?: Date
  DeviceName?: string
  MaterialCode?: string
  Warehouse?: string
  DevicePhotos?: string
  DamageImages?: string
  SubmitDate?: Date
  TrackingNumber_In?: string
  SenderAddress?: string
  ContactInfo?: string
  ProjectName?: string
  Category?: string
  Quantity?: number
  FullSpec?: string
  FaultPoint?: string
  IsChargeable?: number | boolean
  IsOutsourced?: number | boolean
  FactoryRepairDate?: Date
  FactoryTrackingNum?: string
  SupplierName?: string
  RepairCost?: number
  ClientName?: string
  IsInvoiced?: number | boolean
  FactoryReceivedDate?: Date
  ReceivedDate?: Date
  FactoryShipDate?: Date
  ReturnDate?: Date
  ReturnQuantity?: number
  ReturnTrackingNum?: string
  CancelRequestStatus?: string
  CancelRequestReason?: string
  CancelRequestDate?: Date
  CancelApprovedBy?: string
  CancelApprovedDate?: Date
  SignedReportPhoto?: string
}

interface HistoryRecord {
  actionType: string
  oldStatus?: string | null
  newStatus?: string | null
  delayTo?: string | null
  delayReason?: string | null
  createdAt: string
}

// GET /api/tickets/[id]
// 获取单个维修工单详情
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authResult = await checkUserRole(ALL_USER_ROLES)
  if (isErrorResponse(authResult)) return authResult

  try {
    const resolvedParams = await context.params

    const ticketId = resolvedParams.id

    if (!ticketId) {
      return NextResponse.json(
        { success: false, message: TICKET_QUERY_MESSAGES.ticketIdEmpty },
        { status: 400 }
      )
    }

    // 判断 ticketId 是数字还是字符串
    const isNumericId = /^\d+$/.test(ticketId)
    console.log(isNumericId 
      ? TICKET_QUERY_MESSAGES.queryByIdLog(ticketId) 
      : TICKET_QUERY_MESSAGES.queryBySnLog(ticketId)
    )

    const reporterUserId = Number(authResult.userId)
    if (authResult.normalizedRole === UserRole.REPORTER && !Number.isSafeInteger(reporterUserId)) {
      return NextResponse.json({ success: false, message: "登录身份无效" }, { status: 401 })
    }
    const identifierFilter = isNumericId
      ? Prisma.sql`[Id] = ${parseInt(ticketId, 10)}`
      : Prisma.sql`[DeviceSN] = ${ticketId}`
    const ownershipFilter = authResult.normalizedRole === UserRole.REPORTER
      ? Prisma.sql`AND [ReportByUserID] = ${reporterUserId}`
      : Prisma.empty

    const result = await prisma.$queryRaw<TicketRecord[]>(Prisma.sql`
      SELECT TOP (1)
        [Id], [BatchId], [DeviceSN], [ModelName], [ProjectLocation], [Problem],
        [ReportByUserID], [ExpressCompany], [CourierCompany], [TrackingNumber],
        [CourierNumber], [Status], [CreatedAt], [DeviceName], [MaterialCode],
        [DevicePhotos], [DamageImages], [SubmitDate], [TrackingNumber_In],
        [SenderAddress], [ContactInfo], [ProjectName], [Category], [Quantity],
        [FullSpec], [FaultPoint], [IsChargeable], [IsOutsourced],
        [FactoryRepairDate], [FactoryTrackingNum], [SupplierName], [RepairCost],
        [ClientName], [IsInvoiced], [FactoryReceivedDate], [ReceivedDate],
        [FactoryShipDate], [ReturnDate], [ReturnQuantity], [ReturnTrackingNum],
        [CancelRequestStatus], [CancelRequestReason], [CancelRequestDate],
        [CancelApprovedBy], [CancelApprovedDate], [SignedReportPhoto],
        [WarrantyStatus], [WarrantyStatusOverride], [FaultCategory], [RepairAction],
        [RepairNotes]
      FROM [dbo].[Repair_Tickets]
      WHERE ${identifierFilter} ${ownershipFilter}
      ORDER BY [Id] DESC
    `)
    const ticket: TicketRecord | null = result[0] || null

    if (!ticket) {
      return NextResponse.json(
        { success: false, message: TICKET_QUERY_MESSAGES.ticketNotFound },
        { status: 404 }
      )
    }

    // 根据设备序列号查询设备详细信息
    let deviceInfo = {
      deviceName: (ticket.ModelName as string) || "",
      modelName: "",
      materialCode: "",
      warehouse: "",
    }

    if (ticket.DeviceSN) {
      try {
        const device = await prisma.device_Inventory.findFirst({
          where: {
            serialNumber: ticket.DeviceSN as string
          },
          select: {
            deviceName: true,
            modelName: true,
            materialCode: true
          }
        })

        if (device) {
          deviceInfo = {
            deviceName: device.deviceName || (ticket.ModelName as string) || "",
            modelName: device.modelName || "",
            materialCode: device.materialCode || "",
            warehouse: "", // Device_Inventory 表中没有 warehouse 字段，从 Repair_Tickets 表获取
          }
        }
      } catch (deviceError: unknown) {
        const errorMessage = deviceError instanceof Error ? deviceError.message : "查询设备信息失败"
        console.error("查询设备信息失败:", errorMessage)
        // 查询失败时，继续使用工单表中的数据
      }
    }

    // 查询历史记录
    let expectedCompletionDate: string | null = null
    let delayReason: string | null = null
    let history: HistoryRecord[] = []

    try {
      const ticketIdForHistory = ticket.Id?.toString() || ticketId
      const historyLogs = await prisma.repair_Ticket_History.findMany({
        where: {
          ticketId: ticketIdForHistory
        },
        orderBy: {
          createdAt: 'asc'
        },
        select: {
          actionType: true,
          oldStatus: true,
          newStatus: true,
          delayTo: true,
          delayReason: true,
          createdAt: true
        }
      })

      history = historyLogs
        .filter((record) => record.actionType)
        .map((record) => ({
          actionType: record.actionType || "",
          oldStatus: record.oldStatus || null,
          newStatus: record.newStatus || null,
          delayTo: record.delayTo ? (record.delayTo instanceof Date ? record.delayTo.toISOString() : new Date(record.delayTo).toISOString()) : null,
          delayReason: record.delayReason || null,
          createdAt: record.createdAt ? (record.createdAt instanceof Date ? record.createdAt.toISOString() : new Date(record.createdAt).toISOString()) : new Date().toISOString(),
        }))

      const lastDelay = history
        .filter((h) => h.actionType === "Delay")
        .slice(-1)[0]

      if (lastDelay) {
        expectedCompletionDate = lastDelay.delayTo || null
        delayReason = lastDelay.delayReason || null
      }
    } catch (historyError: unknown) {
      const errorMessage = historyError instanceof Error ? historyError.message : "查询延期记录失败"
      console.error("查询延期记录失败:", errorMessage)
    }

    // 根据 ReportByUserID 查询报告人的真实姓名和手机号
    let reporterName = ticket.ReportByUserID?.toString() || ""
    let reporterPhone = ""

    if (ticket.ReportByUserID) {
      try {
        const user = await prisma.users.findUnique({
          where: {
            userId: ticket.ReportByUserID
          },
          select: {
            realName: true,
            Username: true,
            phoneNumber: true
          }
        })

        if (user) {
          // 优先使用 realName，如果没有则使用 Username（注意大小写）
          reporterName = user.realName || user.Username || ticket.ReportByUserID.toString()
          reporterPhone = user.phoneNumber || ""
        }
      } catch (userError: unknown) {
        const errorMessage = userError instanceof Error ? userError.message : "查询报告人信息失败"
        console.error("查询报告人信息失败:", errorMessage)
        // 查询失败时，使用用户ID作为后备
        reporterName = ticket.ReportByUserID.toString()
      }
    }

    // 状态映射：统一状态值，复用全局状态规范化工具
    const dbStatus = (ticket.Status as string) || "Created"
    const normalizedStatus = normalizeTicketStatus(dbStatus) || TicketStatus.CREATED
    const mappedStatus = normalizedStatus
    
    // 调试：记录关键字段值
    console.log("🔍 [API] 票据字段原始值:", {
      ticketId,
      Problem: ticket.Problem,
      ContactInfo: ticket.ContactInfo,
      SenderAddress: ticket.SenderAddress,
      ProjectLocation: ticket.ProjectLocation,
      ModelName: ticket.ModelName
    })

    // 辅助函数：安全获取字段值
    const getField = <T>(field: keyof TicketRecord, defaultValue: T): T => {
      const value = ticket[field]
      if (value === null || value === undefined) {
        return defaultValue
      }
      return value as T
    }

    const getDateField = (field: keyof TicketRecord): string | undefined => {
      const value = ticket[field]
      if (value instanceof Date) {
        return value.toISOString()
      }
      if (value) {
        const date = new Date(value as string | number)
        if (!isNaN(date.getTime())) {
          return date.toISOString()
        }
      }
      return undefined
    }

    const getBooleanField = (field: keyof TicketRecord): boolean => {
      const value = ticket[field]
      if (typeof value === "boolean") {
        return value
      }
      if (typeof value === "number") {
        return value === 1
      }
      if (typeof value === "string") {
        return value === "true" || value === "1"
      }
      return false
    }

    // API 继续返回 deviceImages，数据库统一读取当前真实列 DevicePhotos
    const deviceImages = (ticket.DevicePhotos as string) || ""
    const damageImages = (ticket.DamageImages as string) || ""
    const signedReportPhoto = (ticket.SignedReportPhoto as string) || null

    const responseData = {
      id: ticket.Id?.toString() || "",
      batchId: (ticket.BatchId as string) || null,
      deviceSerialNumber: (ticket.DeviceSN as string) || "",
      productSN: (ticket.DeviceSN as string) || "",  // productSN 和 deviceSN 是同一列
      deviceName: deviceInfo.deviceName || (ticket.DeviceName as string) || "",
      deviceModel: deviceInfo.modelName || (ticket.ModelName as string) || "",
      projectLocation: (ticket.ProjectLocation as string) || "",
      problem: (ticket.Problem as string) || "",
      status: mappedStatus, // 使用映射后的状态值
      reportedBy: reporterName,
      reporterPhone,
      reportedAt: getDateField("CreatedAt") || new Date().toISOString(),
      courierCompany: (ticket.CourierCompany as string) || (ticket.ExpressCompany as string) || "",
      trackingNumber: (ticket.CourierNumber as string) || (ticket.TrackingNumber as string) || "",
      materialCode: deviceInfo.materialCode || (ticket.MaterialCode as string) || "",
      warehouse: deviceInfo.warehouse || (ticket.Warehouse as string) || "",
      deviceImages, // 修复照片字段
      damageImages, // 修复照片字段
      expectedCompletionDate,
      delayReason,
      history,
      // 新字段
      submitDate: getDateField("SubmitDate"),
      trackingNumberIn: (ticket.TrackingNumber_In as string) || "",
      senderAddress: (ticket.SenderAddress as string) || "",
      contactInfo: (ticket.ContactInfo as string) || "",
      projectName: (ticket.ProjectName as string) || "",
      category: (ticket.Category as string) || "",
      modelName: (ticket.ModelName as string) || "",
      quantity: (ticket.Quantity as number) || 1,
      faultDescription: (ticket.Problem as string) || "",
      fullSpec: (ticket.FullSpec as string) || "",
      faultPoint: (ticket.FaultPoint as string) || "",
      isChargeable: getBooleanField("IsChargeable"),
      isOutsourced: getBooleanField("IsOutsourced"),
      factoryRepairDate: getDateField("FactoryRepairDate"),
      factoryTrackingNum: (ticket.FactoryTrackingNum as string) || "",
      supplierName: (ticket.SupplierName as string) || "",
      repairCost: (ticket.RepairCost as number) || null,
      clientName: (ticket.ClientName as string) || "",
      isInvoiced: getBooleanField("IsInvoiced"),
      factoryReceivedDate: getDateField("FactoryReceivedDate"),
      receivedDate: getDateField("ReceivedDate"),
      factoryShipDate: getDateField("FactoryShipDate"),
      returnDate: getDateField("ReturnDate"),
      returnQuantity: (ticket.ReturnQuantity as number) || 1,
      returnTrackingNum: (ticket.ReturnTrackingNum as string) || "",
      // 取消申请相关字段
      cancelRequestStatus: (ticket.CancelRequestStatus as string) || null,
      cancelRequestReason: (ticket.CancelRequestReason as string) || null,
      cancelRequestDate: getDateField("CancelRequestDate") || null,
      cancelApprovedBy: (ticket.CancelApprovedBy as string) || null,
      cancelApprovedDate: getDateField("CancelApprovedDate") || null,
      // 签字报告照片
      signedReportPhoto, // 修复照片字段
      // 3W1H 相关字段（如果已有历史数据，则一并返回）
      warrantyStatus: (ticket.WarrantyStatus as string) || null,
      warrantyStatusOverride: (ticket.WarrantyStatusOverride as string) || null,
      faultCategory: (ticket.FaultCategory as string) || null,
      repairAction: (ticket.RepairAction as string) || null,
      repairNotes: (ticket.RepairNotes as string) || null,
    }

    console.log("✅ [API] 返回数据:", responseData)
    
    return NextResponse.json({
      success: true,
      data: responseData,
    })
  } catch (error: unknown) {
    console.error(TICKET_QUERY_MESSAGES.getFailed, error)
    return NextResponse.json(
      {
        success: false,
        message: TICKET_QUERY_MESSAGES.getError,
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
  const authResult = await checkUserRole([UserRole.ADMIN, UserRole.TECHNICIAN])
  if (isErrorResponse(authResult)) return authResult

  try {
    const body = await request.json().catch(() => ({}))
    
    // 兼容 Next.js 新版本中 params 可能为 Promise 的情况
    const resolvedParams = await Promise.resolve(context.params)

    const ticketId = resolvedParams.id

    if (!ticketId) {
      return NextResponse.json(
        { success: false, message: TICKET_QUERY_MESSAGES.ticketIdEmpty },
        { status: 400 }
      )
    }

    // 判断 ticketId 是数字还是字符串
    const isNumericId = /^\d+$/.test(ticketId)
    console.log(`🔍 [PUT] ` + (isNumericId 
      ? TICKET_QUERY_MESSAGES.queryByIdLog(ticketId) 
      : TICKET_QUERY_MESSAGES.queryBySnLog(ticketId)
    ))

    // 检查工单是否存在，并获取当前状态
    let currentTicket: TicketRecord | null = null

    if (isNumericId) {
      const result = await prisma.$queryRaw<TicketRecord[]>(Prisma.sql`
        SELECT TOP 1 Id, Status, DeviceSN as ProductSN, ModelName, MaterialCode, FullSpec, FaultPoint
        FROM Repair_Tickets
        WHERE Id = ${parseInt(ticketId, 10)}
      `)
      currentTicket = result[0] || null
    } else {
      const result = await prisma.$queryRaw<TicketRecord[]>(Prisma.sql`
        SELECT TOP 1 Id, Status, DeviceSN as ProductSN, ModelName, MaterialCode, FullSpec, FaultPoint
        FROM Repair_Tickets
        WHERE DeviceSN = ${ticketId}
      `)
      currentTicket = result[0] || null
    }

    if (!currentTicket || !currentTicket.Id) {
      return NextResponse.json(
        { success: false, message: TICKET_QUERY_MESSAGES.ticketNotFound },
        { status: 404 }
      )
    }

    const actualTicketId = currentTicket.Id as number
    console.log(`✅ [PUT] 找到工单，实际ID: ${actualTicketId}, DeviceSN: ${currentTicket.ProductSN}`)

    const currentStatus = (currentTicket.Status as string) || ""

    // 构建更新数据对象（使用 Prisma 的 update 方法）
    const updateData: Record<string, unknown> = {}

    // ===== 状态流转逻辑变量初始化 =====
    // 状态变更只允许通过两种方式触发：
    //   1. 前端显式传入 body.status（各工作流节点的专用操作）
    //   2. 专用工作流 API（如 warehouse-confirm-batch、reporter-confirm、batch-repair-report 等）
    //   3. 填写返厂快递单号时自动更新为 PENDING_FACTORY（新增）
    let newStatus: string | null = null

    // 字段映射：前端字段名 -> Prisma 字段名
    const fieldMappings: Record<string, string> = {
      submitDate: "SubmitDate",
      trackingNumberIn: "TrackingNumber_In",
      senderAddress: "SenderAddress",
      contactInfo: "ContactInfo",
      projectName: "ProjectName",
      category: "Category",
      modelName: "ModelName",
      quantity: "Quantity",
      productSN: "DeviceSN",
      faultDescription: "Problem",
      materialCode: "MaterialCode",
      deviceName: "DeviceName",
      fullSpec: "FullSpec",
      faultPoint: "FaultPoint",
      isChargeable: "IsChargeable",
      factoryRepairDate: "FactoryRepairDate",
      factoryTrackingNum: "FactoryTrackingNum",
      supplierName: "SupplierName",
      repairCost: "RepairCost",
      clientName: "ClientName",
      isInvoiced: "IsInvoiced",
      factoryReceivedDate: "FactoryReceivedDate",
      receivedDate: "ReceivedDate",
      factoryShipDate: "FactoryShipDate",
      returnDate: "ReturnDate",
      returnQuantity: "ReturnQuantity",
      returnTrackingNum: "ReturnTrackingNum",
      status: "Status",
      // 照片字段
      deviceImages: "DevicePhotos",
      damageImages: "DamageImages",
      // 3W1H 新字段（维修工作台）
      warrantyStatusOverride: "WarrantyStatusOverride",
      faultCategory: "FaultCategory",
      repairAction: "RepairAction",
      repairNotes: "RepairNotes",
    }

    // 记录哪些字段被更新了（用于自动状态流转和物料代码匹配）
    let faultPointUpdated = false
    let returnTrackingNumUpdated = false
    let productSNUpdated = false
    let modelNameUpdated = false

    // 处理每个字段
    for (const [fieldName, dbFieldName] of Object.entries(fieldMappings)) {
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
        updateData[dbFieldName] = null
      } else if (fieldName === "isChargeable" || fieldName === "isInvoiced") {
        // 布尔值
        const boolValue = value === true || value === "true" || value === 1 || value === "1"
        updateData[dbFieldName] = boolValue
      } else if (fieldName === "quantity" || fieldName === "returnQuantity") {
        // 整数
        const intValue = Number(value)
        if (!isNaN(intValue)) {
          updateData[dbFieldName] = intValue
        }
      } else if (fieldName === "repairCost") {
        // 小数
        const decimalValue = Number(value)
        if (!isNaN(decimalValue)) {
          updateData[dbFieldName] = decimalValue
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
          updateData[dbFieldName] = dateValue
        }
      } else if (fieldName === "deviceImages" || fieldName === "damageImages") {
        // 照片字段：如果是数组，转换为 JSON 字符串；如果是字符串，直接使用
        if (Array.isArray(value)) {
          updateData[dbFieldName] = JSON.stringify(value)
        } else if (typeof value === "string") {
          // 如果已经是 JSON 字符串，直接使用；否则包装成数组
          try {
            JSON.parse(value) // 验证是否为有效 JSON
            updateData[dbFieldName] = value
          } catch {
            // 不是有效 JSON，包装成数组
            updateData[dbFieldName] = JSON.stringify([value])
          }
        } else {
          updateData[dbFieldName] = null
        }
      } else {
        // 字符串
        updateData[dbFieldName] = String(value).trim()
      }
    }

    // 检查是否填写了返厂快递单号（在字段处理完成后）
    if (body.factoryTrackingNum !== undefined && body.factoryTrackingNum !== null && body.factoryTrackingNum !== "") {
      // 如果填写了返厂快递单号，且当前状态不是 PENDING_FACTORY，则自动更新状态
      const normalizedCurrentStatus = normalizeTicketStatus(currentStatus)
      if (normalizedCurrentStatus !== TicketStatus.PENDING_FACTORY) {
        newStatus = TicketStatus.PENDING_FACTORY
        // 使用 fieldMappings 中定义的数据库列名（确保一致性）
        const statusDbField = fieldMappings.status
        updateData[statusDbField] = TicketStatus.PENDING_FACTORY
        console.log(`✅ [返厂申请] 检测到返厂快递单号填写，自动更新状态为 ${TicketStatus.PENDING_FACTORY}`)
      }
    }

    // 如果没有要更新的字段，直接返回
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({
        success: true,
        message: TICKET_QUERY_MESSAGES.updateNoFields,
      })
    }

    // ===== 物料代码匹配逻辑 =====
    // 如果 ProductSN 或 ModelName 被更新，尝试从 Inventory 表自动补全 MaterialCode 和 FullSpec
    if ((productSNUpdated || modelNameUpdated) && (!currentTicket.MaterialCode || !currentTicket.FullSpec)) {
      try {
        const productSN = (body.productSN as string) || (currentTicket.ProductSN as string)
        const modelName = (body.modelName as string) || (currentTicket.ModelName as string)

        if (productSN && productSN !== "PENDING") {
          const device = await prisma.device_Inventory.findFirst({
            where: {
              serialNumber: productSN
            },
            select: {
              materialCode: true,
              modelName: true,
              deviceName: true
            }
          })

          if (device) {
            // 如果 MaterialCode 为空，尝试从 Inventory 补全
            if (!currentTicket.MaterialCode && device.materialCode) {
              updateData["MaterialCode"] = device.materialCode
            }

            // 如果 FullSpec 为空，尝试从 Inventory 补全（使用 ModelName 或 DeviceName）
            if (!currentTicket.FullSpec) {
              const fullSpecValue = device.modelName || device.deviceName || modelName
              if (fullSpecValue) {
                updateData["FullSpec"] = fullSpecValue
              }
            }
          }
        }
      } catch (inventoryError: unknown) {
        const errorMessage = inventoryError instanceof Error ? inventoryError.message : "自动补全物料代码失败"
        console.error("自动补全物料代码失败:", errorMessage)
        // 不影响主流程，继续执行
      }
    }

    // ===== 状态流转逻辑说明 =====
    // ⚠️ 所有自动流转规则已禁用（遗留逻辑，与新工作流冲突）：
    //
    // ❌ 原规则1（已删除）：填写 FaultPoint 时自动跳转到 Admin_Review
    //    → 与新流程冲突：维修人员保存报告后状态应保持 In_Repair，
    //      必须通过"发送给现场人员"显式操作才能推进流程。
    //
    // ❌ 原规则2（已删除）：填写 repairCost/clientName 时从 Admin_Review 跳转到 Pending_Shipment
    //    → 商务流转由专用商务审核 API 负责。
    //
    // ❌ 原规则3（已删除）：填写 ReturnTrackingNum 时自动标记为 Completed
    //    → 仓库发货由专用 warehouse-shipping-batch API 负责。
    //
    // ✅ 新增规则：填写返厂快递单号（factoryTrackingNum）时，自动更新状态为 PENDING_FACTORY
    //    → 这样批次会出现在仓库的"待发货批次"列表中

    // 执行更新（使用 Prisma $executeRaw 配合 Prisma.sql 确保参数安全）
    // 参考 batch-update 的实现方式，使用 Prisma.sql 模板
    if (Object.keys(updateData).length > 0) {
      const updateFields: string[] = []

      for (const [key, value] of Object.entries(updateData)) {
        if (value === null) {
          updateFields.push(`[${key}] = NULL`)
        } else if (typeof value === "string") {
          // 转义单引号，防止 SQL 注入
          const escapedValue = value.replace(/'/g, "''")
          updateFields.push(`[${key}] = N'${escapedValue}'`)
        } else if (value instanceof Date) {
          updateFields.push(`[${key}] = '${value.toISOString()}'`)
        } else if (typeof value === "number") {
          updateFields.push(`[${key}] = ${value}`)
        } else if (typeof value === "boolean") {
          updateFields.push(`[${key}] = ${value ? 1 : 0}`)
        }
      }

      // 使用 Prisma.sql 模板构建 SQL（字段名来自白名单 fieldMappings，值是类型安全的）
      await prisma.$executeRaw(Prisma.sql`
        UPDATE Repair_Tickets
        SET ${Prisma.raw(updateFields.join(", "))}
        WHERE Id = ${actualTicketId}
      `)
    }

    // 记录状态变更历史（如果有状态变更）或填写返厂快递单号
    const finalStatus = (body.status as string) || newStatus || currentStatus
    const statusChanged = finalStatus !== currentStatus
    const factoryTrackingNumUpdated = body.factoryTrackingNum !== undefined && 
                                       body.factoryTrackingNum !== null && 
                                       body.factoryTrackingNum !== ""
    
    // 如果状态变更或填写了返厂快递单号，都需要写入操作记录
    if (statusChanged || factoryTrackingNumUpdated) {
      try {
        // 获取用户信息用于操作记录
        const cookieStore = await import("next/headers").then(m => m.cookies())
        const userIdCookie = cookieStore.get("userId")?.value
        
        if (!userIdCookie) {
          throw new Error("未找到用户ID，无法记录操作历史")
        }
        
        const userIdNum = parseInt(userIdCookie, 10)
        if (isNaN(userIdNum)) {
          throw new Error(`无效的用户ID：${userIdCookie}`)
        }
        
        // 查询用户信息
        const userResult = await prisma.$queryRaw<Array<{ RealName?: string; Username?: string }>>(Prisma.sql`
          SELECT TOP 1 RealName, Username FROM Users WHERE UserID = ${userIdNum}
        `)
        
        if (userResult.length === 0) {
          throw new Error(`用户不存在：UserID=${userIdNum}`)
        }
        
        const operatorName = userResult[0].RealName || userResult[0].Username
        if (!operatorName) {
          throw new Error(`用户信息不完整：UserID=${userIdNum}，RealName 和 Username 均为空`)
        }
        
        const operatorId = userIdNum
        
        // 获取批次ID（如果有）
        const batchResult = await prisma.$queryRaw<Array<{ BatchId?: string }>>(Prisma.sql`
          SELECT TOP 1 BatchId FROM Repair_Tickets WHERE Id = ${actualTicketId}
        `)
        const batchId = batchResult[0]?.BatchId || null
        
        // 判断是否是返厂申请（状态变更为 PENDING_FACTORY 或填写了返厂快递单号）
        const normalizedFinalStatus = normalizeTicketStatus(finalStatus)
        const isRMARequest = normalizedFinalStatus === TicketStatus.PENDING_FACTORY || factoryTrackingNumUpdated
        
        // 构建操作描述
        let description: string
        if (factoryTrackingNumUpdated && statusChanged) {
          // 填写快递单号并更新状态
          description = `返厂维修申请已提交（快递单号：${body.factoryTrackingNum}），状态已更新为待返厂`
        } else if (factoryTrackingNumUpdated) {
          // 只填写快递单号，状态未变化（可能已经是 PENDING_FACTORY）
          description = `填写返厂快递单号：${body.factoryTrackingNum}`
        } else {
          // 普通状态变更（使用中文标签）
          const currentStatusLabel = TICKET_STATUS_LABELS[normalizeTicketStatus(currentStatus) as TicketStatus] || currentStatus
          const finalStatusLabel = TICKET_STATUS_LABELS[normalizeTicketStatus(finalStatus) as TicketStatus] || finalStatus
          description = `状态变更：${currentStatusLabel} → ${finalStatusLabel}`
        }
        
        // 构建操作记录数据
        const historyData: {
          ticketId: string
          batchId: string | null
          actionType: string
          oldStatus: string | null
          newStatus: string
          operatorName: string
          description: string
          operatorId: number
          delayTo?: null
          delayReason?: null
        } = {
          ticketId: actualTicketId.toString(),
          batchId: batchId,
          actionType: isRMARequest ? TicketActionType.RMA_REQUEST : TicketActionType.STATUS_CHANGE,
          oldStatus: currentStatus || null,
          newStatus: finalStatus,
          operatorName: operatorName,
          description: description,
          operatorId: operatorId,
          delayTo: null,
          delayReason: null
        }
        
        await prisma.repair_Ticket_History.create({
          data: historyData
        })
        
        console.log(`✅ [操作记录] 已写入：${description}`)
      } catch (historyError: unknown) {
        const errorMessage = historyError instanceof Error ? historyError.message : "记录状态变更历史失败"
        console.error("记录状态变更历史失败:", errorMessage)
        // 操作记录失败不影响主流程，只记录错误日志
      }
    }

    return NextResponse.json({
      success: true,
      message: TICKET_QUERY_MESSAGES.updateSuccess,
      data: {
        updatedFields: Object.keys(updateData).length,
        statusChanged: statusChanged,
        oldStatus: currentStatus,
        newStatus: finalStatus,
        autoStatusChange: newStatus ? `状态自动流转: ${currentStatus} -> ${newStatus}` : null,
        materialCodeAutoFilled: productSNUpdated || modelNameUpdated,
      },
    })
  } catch (error: unknown) {
    console.error(TICKET_QUERY_MESSAGES.updateFailed, error)
    return NextResponse.json(
      {
        success: false,
        message: TICKET_QUERY_MESSAGES.updateError,
      },
      { status: 500 }
    )
  }
}

// DELETE /api/tickets/[id]
// 彻底删除单个维修工单
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authResult = await checkUserRole([UserRole.ADMIN, UserRole.REPORTER])
  if (isErrorResponse(authResult)) return authResult

  try {
    const resolvedParams = await context.params

    const ticketId = resolvedParams.id

    if (!ticketId) {
      return NextResponse.json(
        { success: false, message: TICKET_QUERY_MESSAGES.ticketIdEmpty },
        { status: 400 }
      )
    }

    if (!/^\d+$/.test(ticketId)) {
      return NextResponse.json(
        { success: false, message: "删除操作必须使用数字工单ID" },
        { status: 400 }
      )
    }

    const numericTicketId = Number(ticketId)
    const operatorId = Number(authResult.userId)
    if (!Number.isSafeInteger(numericTicketId) || !Number.isSafeInteger(operatorId)) {
      return NextResponse.json(
        { success: false, message: "身份或工单参数无效" },
        { status: 400 }
      )
    }

    interface DeletedTicketRow {
      Id: number
      TicketId: string | null
      BatchId: string | null
      Status: string
    }

    const ownershipFilter = authResult.normalizedRole === UserRole.REPORTER
      ? Prisma.sql`AND [ReportByUserID] = ${operatorId}`
      : Prisma.empty

    const deleted = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<DeletedTicketRow[]>(Prisma.sql`
        DELETE FROM [dbo].[Repair_Tickets]
        OUTPUT deleted.[Id], deleted.[TicketId], deleted.[BatchId], deleted.[Status]
        WHERE [Id] = ${numericTicketId} ${ownershipFilter};
      `)
      const row = rows[0]
      if (!row) return null

      await tx.repair_Ticket_History.create({
        data: {
          ticketId: row.TicketId ?? String(row.Id),
          batchId: row.BatchId,
          actionType: TicketActionType.STATUS_CHANGE,
          oldStatus: row.Status,
          newStatus: TicketStatus.DELETED,
          operatorId,
          operatorName: authResult.realName || authResult.username,
          description: "物理删除工单",
        },
      })
      return row
    })

    if (!deleted) {
      return NextResponse.json(
        { success: false, message: "工单不存在或您无权删除" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: TICKET_QUERY_MESSAGES.deleteSuccess,
    })
  } catch (error: unknown) {
    console.error(TICKET_QUERY_MESSAGES.deleteFailed, error)
    return NextResponse.json(
      {
        success: false,
        message: TICKET_QUERY_MESSAGES.deleteError,
      },
      { status: 500 }
    )
  }
}
