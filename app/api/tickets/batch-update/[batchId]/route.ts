import { NextResponse } from "next/server"
import { DB_FIELDS, UserRole, TicketActionType, TicketStatus, SPECIAL_VALUES, DEFAULT_VALUES, isPendingSNPlaceholder, normalizeTicketStatus } from "@/lib/enums"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import { sumDeviceQuantity } from "@/lib/device-quantity"
import { preserveBatchDeviceFields } from "@/lib/batch-device-fields"
import { isSignedRepairReport } from "@/lib/repair-report-policy"
import {
  BatchDeviceReconciliationError,
  planBatchDeviceReconciliation,
} from "@/lib/batch-device-reconciliation"

const imageFieldSchema = z.union([
  z.array(z.string().trim().min(1).max(2048)).max(20),
  z.string().max(50000),
  z.null(),
])

const batchDeviceSchema = z.object({
  deviceId: z.number().int().positive().optional(),
  serialNumber: z.string().trim().max(100).optional(),
  modelName: z.string().trim().max(200).optional(),
  deviceName: z.string().trim().max(200).optional(),
  faultDescription: z.string().trim().max(10000).optional(),
  materialCode: z.string().trim().max(100).optional(),
  category: z.string().trim().max(200).optional(),
  subCategory: z.string().trim().max(200).optional(),
  repairCost: z.union([
    z.number().finite().nonnegative(),
    z.string().trim().regex(/^\d+(?:\.\d{1,2})?$/).max(50),
    z.null(),
  ]).optional(),
  quantity: z.number().int().min(1).max(100000).optional(),
  deviceImages: imageFieldSchema.optional(),
  damageImages: imageFieldSchema.optional(),
}).strict()

const batchUpdateSchema = z.object({
  senderAddress: z.string().trim().max(500).optional(),
  projectName: z.string().trim().max(500).optional(),
  contactInfo: z.string().trim().max(200).optional(),
  projectLocation: z.string().trim().max(200).optional(),
  trackingNumber: z.string().trim().max(200).optional(),
  expressCompany: z.string().trim().max(100).optional(),
  category: z.string().trim().max(200).optional(),
  subCategory: z.string().trim().max(200).optional(),
  warrantyStatusOverride: z.string().trim().max(50).nullable().optional(),
  faultCategory: z.string().trim().max(50).nullable().optional(),
  repairAction: z.string().trim().max(50).nullable().optional(),
  repairNotes: z.string().trim().max(10000).nullable().optional(),
  expectedDeviceIds: z.array(z.number().int().positive()).min(1).max(500),
  deletedDeviceIds: z.array(z.number().int().positive()).max(500).default([]),
  devices: z.array(batchDeviceSchema).min(1).max(500),
}).strict()

// ─── 类型定义 ────────────────────────────────────────────────────────────────────

/**
 * 批次级别的数据库现有值（用于与前端提交值做真正的 Diff 对比）
 */
interface ExistingBatch {
  status: string
  senderAddress: string | null
  projectName: string | null
  contactInfo: string | null
  projectLocation: string | null
  trackingNumberIn: string | null
  courierCompany: string | null
  category: string | null
  subCategory: string | null
}

/**
 * 设备级别的数据库现有值（扩展后含全部可比较字段）
 */
interface ExistingDevice {
  status: string
  sn: string
  modelName: string
  deviceName: string | null
  faultDescription: string | null
  materialCode: string | null
  category: string | null
  subCategory: string | null
  repairCost: string | null
  quantity: number
  // 3W1H 工作台字段
  warrantyStatusOverride: string | null
  faultCategory: string | null
  repairAction: string | null
  repairNotes: string | null
  // 图片字段（DB 中存储的原始 JSON 字符串）
  devicePhotos: string | null
  damageImages: string | null
}

interface DeviceUpdateResult {
  data: Prisma.Repair_TicketsUncheckedUpdateInput
  changedLabels: string[]
}

// ─── 纯函数辅助 ──────────────────────────────────────────────────────────────────

/**
 * 空值归一化：null / undefined / 空字符串 全部视为 ""，其余转为 trim 后的字符串。
 * 用于对比前端提交值与数据库存量值，防止 null vs "" 的误判。
 */
function norm(v: unknown): string {
  if (v === null || v === undefined) return ""
  return String(v).trim()
}

/**
 * 将前端传入的图片字段（数组 / JSON 字符串 / 单条 URL / null / undefined）
 * 统一转换为可写入数据库的字符串：
 *   - undefined  → undefined（不更新此字段）
 *   - null / []  → null      （清空此字段）
 *   - string[]   → JSON.stringify(arr)
 *   - string     → 验证 JSON 后原样返回，否则包装为 JSON 数组
 */
function parseImageField(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null || (Array.isArray(value) && (value as unknown[]).length === 0)) return null
  if (Array.isArray(value)) return JSON.stringify(value)
  if (typeof value === "string") {
    try { JSON.parse(value); return value } catch { return JSON.stringify([value]) }
  }
  return undefined
}

// ─── 核心函数：构建单台设备的 UPDATE 字段列表 + 真正 Diff 日志 ──────────────────

/**
 * 根据新提交的设备数据与数据库现有值做**字段级真正对比（Diff）**，
 * 只有字段值发生实际变化时才记录到 changedLabels，消除全量提交引起的假日志。
 *
 * This is a save-only path. Field changes never change workflow status.
 */
function buildDeviceUpdateFields(
  device: Record<string, unknown>,
  existing: ExistingDevice,
  userRole: string,
  body: Record<string, unknown>
): DeviceUpdateResult {
  device = preserveBatchDeviceFields(device, existing)
  const changedLabels: string[] = []

  const newSn    = (device.serialNumber as string) || SPECIAL_VALUES.PENDING_VERIFY
  const newModel = (device.modelName    as string) || DEFAULT_VALUES.GENERIC_MODEL
  const newQuantity = Number(device.quantity) > 0 ? Number(device.quantity) : 1

  // Prisma parameterizes every value, so user-entered text is never assembled
  // into a raw SQL fragment.
  const data: Prisma.Repair_TicketsUncheckedUpdateInput = {
    deviceSn: newSn,
    modelName: newModel,
    deviceName: norm(device.deviceName) || null,
    problem: norm(device.faultDescription),
    materialCode: norm(device.materialCode) || null,
    Quantity: newQuantity,
  }

  if (device.category !== undefined) data.Category = norm(device.category) || null
  if (device.subCategory !== undefined) data.SubCategory = norm(device.subCategory) || null

  // ⚠️ 曾经的 bug：不同代码路径写入的"无序列号"占位值不统一（"PENDING"/"PENDING_VERIFY"/"待验证"/空），
  // 如果只做精确字符串比较，占位值 A → 占位值 B 会被误判为"设备身份变更"，
  // 导致本来无 SN 的易耗品/待补录设备，只要保存一次报告就被强行打回「待仓库确认」，永远卡在仓库阶段。
  // 修复：占位值之间互相切换不算身份变更，只有"两者不都是占位值，且序列号确实不同"才算真正变更。
  const snActuallyChanged =
    isPendingSNPlaceholder(newSn) && isPendingSNPlaceholder(existing.sn)
      ? false
      : norm(newSn) !== norm(existing.sn)

  // ── 变更摘要：基础字段（真正 Diff，空值归一化后对比）────────────────────────
  if (snActuallyChanged)                                                   changedLabels.push(`序列号: ${existing.sn || "空"} → ${newSn}`)
  if (norm(newModel)                   !== norm(existing.modelName))       changedLabels.push(`型号: ${existing.modelName || "空"} → ${newModel}`)
  if (norm(device.faultDescription)    !== norm(existing.faultDescription)) changedLabels.push("故障描述")
  if (norm(device.materialCode)        !== norm(existing.materialCode))    changedLabels.push("物料编码")
  if (norm(device.deviceName)          !== norm(existing.deviceName))      changedLabels.push("设备名称")
  if (device.category !== undefined && norm(device.category) !== norm(existing.category)) changedLabels.push("一级分类")
  if (device.subCategory !== undefined && norm(device.subCategory) !== norm(existing.subCategory)) changedLabels.push("二级分类")
  if (newQuantity                      !== existing.quantity)              changedLabels.push(`数量: ${existing.quantity} → ${newQuantity}`)

  // 维修费用属于普通信息保存；修改后不会自动回退或清空签字。
  if (userRole === UserRole.TECHNICIAN && device.repairCost !== undefined) {
    const newCostRaw = device.repairCost
    const newCostStr = newCostRaw !== null ? String(newCostRaw) : null
    const oldCostNormalized = existing.repairCost !== null ? String(parseFloat(existing.repairCost)) : null
    const newCostNormalized = newCostStr           !== null ? String(parseFloat(newCostStr))          : null
    const costChanged = newCostNormalized !== oldCostNormalized

    if (costChanged) {
      changedLabels.push(`维修费用: ${existing.repairCost ?? "未设置"} → ${newCostRaw}`)
    }

    if (newCostRaw !== null && newCostRaw !== undefined) {
      data.RepairCost = new Prisma.Decimal(String(newCostRaw))
    } else {
      data.RepairCost = null
    }
  }

  // ── 3W1H 字段（Rule 3 范畴：静默写入，只有真正变化才记日志）─────────────────
  if (body.warrantyStatusOverride !== undefined) {
    const newVal = body.warrantyStatusOverride
    data.WarrantyStatusOverride = newVal ? String(newVal) : null
    if (norm(newVal) !== norm(existing.warrantyStatusOverride)) changedLabels.push("保修状态覆盖")
  }
  if (body.faultCategory !== undefined) {
    const newVal = body.faultCategory
    data.FaultCategory = newVal ? String(newVal) : null
    if (norm(newVal) !== norm(existing.faultCategory)) changedLabels.push("故障分类")
  }
  if (body.repairAction !== undefined) {
    const newVal = body.repairAction
    data.RepairAction = newVal ? String(newVal) : null
    if (norm(newVal) !== norm(existing.repairAction)) changedLabels.push("维修动作")
  }
  if (body.repairNotes !== undefined) {
    const newVal = body.repairNotes
    data.RepairNotes = newVal ? String(newVal) : null
    if (norm(newVal) !== norm(existing.repairNotes)) changedLabels.push("处理说明")
  }

  // ── 图片字段（静默写入，Diff 对比：序列化后与数据库存量比较）────────────────
  const deviceImagesValue = parseImageField(device.deviceImages)
  const damageImagesValue = parseImageField(device.damageImages)

  if (deviceImagesValue !== undefined) {
    data.devicePhotos = deviceImagesValue
    // 只有序列化结果与 DB 存量不同时才记为变更
    if (norm(deviceImagesValue) !== norm(existing.devicePhotos)) changedLabels.push("设备照片")
  }
  if (damageImagesValue !== undefined) {
    data.DamageImages = damageImagesValue
    if (norm(damageImagesValue) !== norm(existing.damageImages)) changedLabels.push("损坏照片")
  }

  return { data, changedLabels }
}

// ─── API 处理函数 ────────────────────────────────────────────────────────────────

/**
 * PUT /api/tickets/batch-update/[batchId]
 *
 * 字段级智能更新接口：
 *  - 所有变更记录均基于真实 Diff（新旧值对比），消除全量提交引起的假日志
 *  - 保存字段但不改变状态；状态只允许由专用“发送流程”接口推进
 */
export async function PUT(
  request: Request,
  context: { params: Promise<{ batchId: string }> }
) {
  const authResult = await checkUserRole([
    UserRole.REPORTER,
    UserRole.WAREHOUSE,
    UserRole.TECHNICIAN,
    UserRole.BUSINESS,
    UserRole.ADMIN,
  ])
  if (isErrorResponse(authResult)) return authResult

  try {
    const resolvedParams = await context.params
    const batchId = resolvedParams.batchId

    if (!batchId) {
      return NextResponse.json({ success: false, message: "批次ID不能为空" }, { status: 400 })
    }

    const { userId, normalizedRole } = authResult

    const numericUserId = Number(userId)
    if (!Number.isSafeInteger(numericUserId)) {
      return NextResponse.json({ success: false, message: "登录身份无效" }, { status: 401 })
    }

    const user = {
      id:       numericUserId,
      username: authResult.username,
      realName: authResult.realName || authResult.username,
      role:     normalizedRole,
    }

    const parsedBody = batchUpdateSchema.safeParse(
      await request.json().catch(() => null)
    )
    if (!parsedBody.success) {
      return NextResponse.json({ success: false, message: "请求参数无效" }, { status: 400 })
    }
    const body = parsedBody.data
    const {
      senderAddress,
      projectName,
      contactInfo,
      projectLocation,
      trackingNumber,
      expressCompany,
      category,
      subCategory,
      devices,
    } = body as {
      senderAddress?: string
      projectName?: string
      contactInfo?: string
      projectLocation?: string
      trackingNumber?: string
      expressCompany?: string
      category?: string
      subCategory?: string
      devices: Record<string, unknown>[]
    }

    // 事务前：检测可选列是否存在
    const optColCheck = await prisma.$queryRaw<{ COLUMN_NAME: string }[]>(
      Prisma.sql`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_NAME = 'Repair_Tickets'
                   AND LOWER(COLUMN_NAME) = 'repaircost'`
    )
    const optCols       = new Set(optColCheck.map(r => r.COLUMN_NAME.toLowerCase()))
    const hasRepairCost = optCols.has("repaircost")

    // ── 事务 ────────────────────────────────────────────────────────────────────
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {

      // 1. 验证批次存在，同时查出批次级别旧值（供 Diff 对比）
      const batchCheckResult = await tx.$queryRaw(Prisma.sql`
        SELECT
          ${Prisma.raw(DB_FIELDS.ID)},
          ${Prisma.raw(DB_FIELDS.STATUS)},
          ${Prisma.raw(DB_FIELDS.REPORT_BY_USER_ID)},
          ${Prisma.raw(DB_FIELDS.SENDER_ADDRESS)},
          ${Prisma.raw(DB_FIELDS.PROJECT_NAME)},
          ${Prisma.raw(DB_FIELDS.CONTACT_INFO)},
          ${Prisma.raw(DB_FIELDS.PROJECT_LOCATION)},
          ${Prisma.raw(DB_FIELDS.TRACKING_NUMBER_IN)},
          ${Prisma.raw(DB_FIELDS.COURIER_COMPANY)},
          ${Prisma.raw(DB_FIELDS.CATEGORY)},
          ${Prisma.raw(DB_FIELDS.SUB_CATEGORY)},
          [SignedReportPhoto], [ReporterConfirmedAt]
        FROM Repair_Tickets WITH (UPDLOCK, HOLDLOCK)
        WHERE ${Prisma.raw(DB_FIELDS.BATCH_ID)} = ${batchId}
      `) as Record<string, unknown>[]

      if (batchCheckResult.length === 0) throw new Error("批次不存在")

      const firstRecord   = batchCheckResult[0]
      const currentStatus = (firstRecord.Status as string) || (firstRecord[DB_FIELDS.STATUS] as string) || ""
      const batchOwnerId = Number(firstRecord[DB_FIELDS.REPORT_BY_USER_ID])

      if (
        normalizedRole === UserRole.REPORTER &&
        batchCheckResult.some((row) => Number(row[DB_FIELDS.REPORT_BY_USER_ID]) !== user.id)
      ) {
        throw new Error("BATCH_FORBIDDEN")
      }

      const allowedStatusesByRole: Record<UserRole, ReadonlySet<string>> = {
        [UserRole.REPORTER]: new Set([
          TicketStatus.CREATED,
          TicketStatus.WAREHOUSE_CONFIRMING,
        ]),
        [UserRole.WAREHOUSE]: new Set([
          TicketStatus.CREATED,
          TicketStatus.WAREHOUSE_CONFIRMING,
          TicketStatus.WAREHOUSE_CONFIRMED,
          TicketStatus.WAREHOUSE_SHIPPING,
          TicketStatus.PENDING_SHIPMENT,
        ]),
        [UserRole.TECHNICIAN]: new Set([
          TicketStatus.WAREHOUSE_CONFIRMED,
          TicketStatus.IN_REPAIR,
          TicketStatus.PROCESSING,
          TicketStatus.PENDING_REPORTER_CONFIRM,
          TicketStatus.TECHNICIAN_REPAIRING,
          TicketStatus.BUSINESS_REVIEW,
          TicketStatus.WAREHOUSE_SHIPPING,
        ]),
        [UserRole.BUSINESS]: new Set([
          TicketStatus.BUSINESS_REVIEW,
          TicketStatus.ADMIN_REVIEW,
          TicketStatus.WAREHOUSE_SHIPPING,
          TicketStatus.PENDING_SHIPMENT,
        ]),
        [UserRole.ADMIN]: new Set(Object.values(TicketStatus).filter(
          (status) => ![TicketStatus.COMPLETED, TicketStatus.CANCELLED, TicketStatus.DELETED].includes(status)
        )),
      }
      const allowedStatuses = allowedStatusesByRole[normalizedRole]
      const forbiddenState = batchCheckResult.some((row) => {
        const rawStatus = String(row[DB_FIELDS.STATUS] ?? "")
        return !allowedStatuses.has(normalizeTicketStatus(rawStatus) ?? rawStatus)
      })
      if (forbiddenState) {
        throw new Error("BATCH_STATE_FORBIDDEN")
      }

      console.log(`🔍 [批次更新] batchId=${batchId} 状态=${currentStatus} 操作人=${user.username} 角色=${user.role}`)

      if (currentStatus === TicketStatus.COMPLETED || currentStatus === TicketStatus.CANCELLED) {
        throw new Error("已完成或已取消状态的工单不允许修改")
      }

      // 批次级旧值结构（用于 Diff）
      const existingBatch: ExistingBatch = {
        status:          currentStatus,
        senderAddress:   (firstRecord[DB_FIELDS.SENDER_ADDRESS]     as string | null) ?? null,
        projectName:     (firstRecord[DB_FIELDS.PROJECT_NAME]       as string | null) ?? null,
        contactInfo:     (firstRecord[DB_FIELDS.CONTACT_INFO]       as string | null) ?? null,
        projectLocation: (firstRecord[DB_FIELDS.PROJECT_LOCATION]   as string | null) ?? null,
        // TrackingNumber_In 含下划线，需要方括号访问
        trackingNumberIn:(firstRecord[DB_FIELDS.TRACKING_NUMBER_IN] as string | null) ?? null,
        courierCompany:  (firstRecord[DB_FIELDS.COURIER_COMPANY]    as string | null) ?? null,
        category:        (firstRecord[DB_FIELDS.CATEGORY]           as string | null) ?? null,
        subCategory:     (firstRecord[DB_FIELDS.SUB_CATEGORY]       as string | null) ?? null,
      }

      // 2. 获取现有设备全量字段（含所有可比较列），用于设备级 Diff
      const repairCostSelect = hasRepairCost ? `, RepairCost` : ``
      const existingDevicesResult = await tx.$queryRaw(Prisma.sql`
        SELECT
          ${Prisma.raw(DB_FIELDS.ID)},
          ${Prisma.raw(DB_FIELDS.DEVICE_SN)},
          ${Prisma.raw(DB_FIELDS.STATUS)},
          ${Prisma.raw(DB_FIELDS.MODEL_NAME)},
          ${Prisma.raw(DB_FIELDS.DEVICE_NAME)},
          ${Prisma.raw(DB_FIELDS.PROBLEM)},
          ${Prisma.raw(DB_FIELDS.MATERIAL_CODE)},
          ${Prisma.raw(DB_FIELDS.QUANTITY)},
          ${Prisma.raw(DB_FIELDS.CATEGORY)},
          ${Prisma.raw(DB_FIELDS.SUB_CATEGORY)},
          WarrantyStatusOverride,
          FaultCategory,
          RepairAction,
          RepairNotes,
          DevicePhotos,
          DamageImages
          ${Prisma.raw(repairCostSelect)}
        FROM Repair_Tickets
        WHERE ${Prisma.raw(DB_FIELDS.BATCH_ID)} = ${batchId}
        ORDER BY ${Prisma.raw(DB_FIELDS.ID)} ASC
      `) as Record<string, unknown>[]

      const existingDeviceIds = existingDevicesResult
        .map(r => (r.Id as number) || (r[DB_FIELDS.ID] as number) || 0)
        .filter(id => id > 0)

      const existingDeviceMap = new Map<number, ExistingDevice>()
      for (const row of existingDevicesResult) {
        const id = (row.Id as number) || (row[DB_FIELDS.ID] as number) || 0
        if (id > 0) {
          existingDeviceMap.set(id, {
            status:     (row.Status    as string) || (row[DB_FIELDS.STATUS]     as string) || "",
            sn:         (row.DeviceSN  as string) || (row[DB_FIELDS.DEVICE_SN]  as string) || "",
            modelName:  (row.ModelName as string) || (row[DB_FIELDS.MODEL_NAME] as string) || "",
            deviceName:       (row.DeviceName   as string | null) ?? null,
            faultDescription: (row.Problem      as string | null) ?? null,
            materialCode:     (row.MaterialCode as string | null) ?? null,
            quantity:         Number(row.Quantity ?? row[DB_FIELDS.QUANTITY]) || 1,
            category:         (row.Category    as string | null) ?? null,
            subCategory:      (row.SubCategory as string | null) ?? null,
            repairCost: hasRepairCost
              ? (row.RepairCost != null ? String(row.RepairCost) : null)
              : null,
            warrantyStatusOverride: (row.WarrantyStatusOverride as string | null) ?? null,
            faultCategory:          (row.FaultCategory          as string | null) ?? null,
            repairAction:           (row.RepairAction           as string | null) ?? null,
            repairNotes:            (row.RepairNotes            as string | null) ?? null,
            devicePhotos:           (row.DevicePhotos           as string | null) ?? null,
            damageImages:           (row.DamageImages           as string | null) ?? null,
          })
        }
      }

      const reconciliationPlan = planBatchDeviceReconciliation(
        existingDeviceIds,
        devices.map((device) => ({
          deviceId: typeof device.deviceId === "number" ? device.deviceId : undefined,
        })),
        { expectedDeviceIds: body.expectedDeviceIds, deletedDeviceIds: body.deletedDeviceIds },
      )

      // 3. 更新批次基础信息（所有设备共享）
      // 收集批次级别真实变更摘要（空值归一化后对比新旧值）
      const batchChangedLabels: string[] = []
      if (senderAddress   !== undefined && norm(senderAddress)   !== norm(existingBatch.senderAddress))   batchChangedLabels.push("寄件地址")
      if (projectName     !== undefined && norm(projectName)     !== norm(existingBatch.projectName))     batchChangedLabels.push("客户名称")
      if (contactInfo     !== undefined && norm(contactInfo)     !== norm(existingBatch.contactInfo))     batchChangedLabels.push("联系人信息")
      if (projectLocation !== undefined && norm(projectLocation) !== norm(existingBatch.projectLocation)) batchChangedLabels.push("项目地址")
      if (trackingNumber  !== undefined && norm(trackingNumber)  !== norm(existingBatch.trackingNumberIn)) batchChangedLabels.push("物流单号")
      if (expressCompany  !== undefined && norm(expressCompany)  !== norm(existingBatch.courierCompany))  batchChangedLabels.push("快递公司")
      const hasPerDeviceClassification = devices.some(
        (device) => device.category !== undefined || device.subCategory !== undefined,
      )
      if (!hasPerDeviceClassification && category !== undefined && norm(category) !== norm(existingBatch.category)) {
        batchChangedLabels.push("设备类别")
      }
      if (!hasPerDeviceClassification && subCategory !== undefined && norm(subCategory) !== norm(existingBatch.subCategory)) {
        batchChangedLabels.push("设备子类别")
      }

      // A saved signature protects report identity/content/amounts, not independent logistics or photos.
      if (batchCheckResult.some(isSignedRepairReport)) {
        const reportChanged = batchChangedLabels.some((label) => !["物流单号", "快递公司"].includes(label)) ||
          reconciliationPlan.deletes.length > 0 || reconciliationPlan.inserts.length > 0 ||
          reconciliationPlan.updates.some(({ submittedIndex, deviceId }) => {
            const existing = existingDeviceMap.get(deviceId)
            return !existing || buildDeviceUpdateFields(devices[submittedIndex], existing, user.role, body)
              .changedLabels.some((label) => !["设备照片", "损坏照片"].includes(label))
          })
        if (reportChanged) throw new Error("SIGNED_REPORT_LOCKED")
      }

      // Only submitted batch fields are changed; photo-only retries must not clear customer data.
      const batchData: Prisma.Repair_TicketsUncheckedUpdateManyInput = {}
      if (senderAddress !== undefined) batchData.senderAddress = senderAddress || null
      if (projectName !== undefined) batchData.ProjectName = projectName || null
      if (contactInfo !== undefined) batchData.contactInfo = contactInfo || null
      if (projectLocation !== undefined) batchData.projectLocation = projectLocation || null
      if (trackingNumber !== undefined) batchData.trackingNumberIn = trackingNumber || null
      if (expressCompany !== undefined) batchData.CourierCompany = expressCompany || null
      if (!hasPerDeviceClassification && category !== undefined) batchData.Category = category || null
      if (!hasPerDeviceClassification && subCategory !== undefined) batchData.SubCategory = subCategory || null
      if (Object.keys(batchData).length > 0) {
        await tx.repair_Tickets.updateMany({ where: { batchId }, data: batchData })
      }

      // 4. 使用稳定 ID；删除必须显式提交，成员快照已在任何写入前校验。
      const removedIds = new Set(reconciliationPlan.deletes)
      const deviceCount = sumDeviceQuantity([
        ...existingDeviceIds.filter((id) => !removedIds.has(id)).map((id) => {
          const submitted = devices.find((device) => device.deviceId === id)
          return { quantity: Number(submitted?.quantity ?? existingDeviceMap.get(id)?.quantity) || 1 }
        }),
        ...reconciliationPlan.inserts.map((index) => ({ quantity: Number(devices[index].quantity) || 1 })),
      ])
      const allDeviceChangeSummaries: string[] = []


      /** 执行单台已有设备的参数化 UPDATE。 */
      const processExistingDevice = async (device: Record<string, unknown>, deviceId: number) => {
        const existing = existingDeviceMap.get(deviceId)
        if (!existing) throw new Error("DEVICE_NOT_IN_BATCH")

        const { data, changedLabels } =
          buildDeviceUpdateFields(device, existing, user.role, body)

        if (changedLabels.length > 0) {
          allDeviceChangeSummaries.push(`设备${deviceId}：${changedLabels.join("、")}`)
        }

        await tx.repair_Tickets.update({ where: { id: deviceId }, data })
      }

      for (const update of reconciliationPlan.updates) {
        await processExistingDevice(devices[update.submittedIndex], update.deviceId)
      }

      for (const deviceId of reconciliationPlan.deletes) {
        const deleteResult = await tx.repair_Tickets.deleteMany({
          where: { id: deviceId, batchId },
        })
        if (deleteResult.count !== 1) throw new Error("DEVICE_NOT_IN_BATCH")
        allDeviceChangeSummaries.push(`设备${deviceId}：已删除`)
      }

      for (const submittedIndex of reconciliationPlan.inserts) {
        const device = devices[submittedIndex]
        const createdDevice = await tx.repair_Tickets.create({
          data: {
            batchId,
            deviceSn: norm(device.serialNumber) || SPECIAL_VALUES.PENDING_VERIFY,
            status: currentStatus,
            modelName: norm(device.modelName) || DEFAULT_VALUES.GENERIC_MODEL,
            deviceName: norm(device.deviceName) || null,
            problem: norm(device.faultDescription),
            Category: norm(device.category) || norm(category) || null,
            SubCategory: norm(device.subCategory) || norm(subCategory) || null,
            materialCode: norm(device.materialCode) || null,
            Quantity: Number(device.quantity) || 1,
            ProjectName: projectName ?? existingBatch.projectName,
            contactInfo: contactInfo ?? existingBatch.contactInfo,
            projectLocation: projectLocation ?? existingBatch.projectLocation,
            senderAddress: senderAddress ?? existingBatch.senderAddress,
            trackingNumberIn: trackingNumber ?? existingBatch.trackingNumberIn,
            CourierCompany: expressCompany ?? existingBatch.courierCompany,
            ReportByUserID: Number.isSafeInteger(batchOwnerId) ? batchOwnerId : null,
            ReportTime: new Date(),
            devicePhotos: parseImageField(device.deviceImages),
            DamageImages: parseImageField(device.damageImages),
          },
          select: { id: true },
        })
        allDeviceChangeSummaries.push(
          `新增设备${createdDevice.id}：${norm(device.serialNumber) || "待核"}`,
        )
      }

      // 5. 写入操作日志（只在有真实变更时才有内容）
      const descParts: string[] = []

      if (batchChangedLabels.length > 0) {
        descParts.push(`[批次信息] ${batchChangedLabels.join("、")}`)
      }
      if (allDeviceChangeSummaries.length > 0) {
        descParts.push(`[设备信息] ${allDeviceChangeSummaries.join("；")}`)
      }

      const description = descParts.join(" | ")

      if (description) {
        await tx.repair_Ticket_History.create({
          data: {
            batchId,
            actionType:   TicketActionType.BATCH_UPDATED,
            operatorId:   user.id,
            // 优先使用真实姓名，回退到用户名（遵守 cursorrules §5）
            operatorName: user.realName || user.username || user.id.toString(),
            description,
          }
        })
      }

      return { currentStatus, deviceCount, description }
    })

    console.log(
      `✅ [批次更新] batchId=${batchId} 设备数=${result.deviceCount}`,
      result.description
    )

    return NextResponse.json({
      success: true,
      message: `工单信息已保存，共 ${result.deviceCount} 台设备，状态未改变`,
      data: {
        batchId,
        deviceCount:   result.deviceCount,
        status:        result.currentStatus,
        changed:       Boolean(result.description),
        rollbackCount: 0,
      }
    })

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "更新工单失败"
    console.error("批次工单更新失败:", error)

    if (error instanceof BatchDeviceReconciliationError || errorMessage === "DEVICE_NOT_IN_BATCH") {
      return NextResponse.json(
        { success: false, message: "设备清单已变化，请刷新后重新编辑" },
        { status: 409 },
      )
    }

    if (errorMessage === "SIGNED_REPORT_LOCKED") {
      return NextResponse.json({ success: false, message: "报告已签字，设备身份、数量、报告内容和金额不可修改" }, { status: 409 })
    }
    if (errorMessage === "批次不存在") {
      return NextResponse.json({ success: false, message: errorMessage }, { status: 404 })
    }
    if (errorMessage === "BATCH_FORBIDDEN") {
      return NextResponse.json({ success: false, message: "您无权修改该批次" }, { status: 403 })
    }
    if (errorMessage === "BATCH_STATE_FORBIDDEN") {
      return NextResponse.json({ success: false, message: "当前批次状态不允许该角色修改" }, { status: 409 })
    }
    if (errorMessage === "已完成或已取消状态的工单不允许修改") {
      return NextResponse.json({ success: false, message: errorMessage }, { status: 403 })
    }
    return NextResponse.json({ success: false, message: "更新工单失败，请稍后重试" }, { status: 500 })
  }
}
