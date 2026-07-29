import { NextResponse } from "next/server"
import { DB_FIELDS, UserRole, TicketActionType, TicketStatus, SPECIAL_VALUES, DEFAULT_VALUES, isPendingSNPlaceholder, normalizeTicketStatus } from "@/lib/enums"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { z } from "zod"

const imageFieldSchema = z.union([
  z.array(z.string().trim().min(1).max(2048)).max(20),
  z.string().max(50000),
  z.null(),
])

const batchDeviceSchema = z.object({
  serialNumber: z.string().trim().max(100).optional(),
  modelName: z.string().trim().max(200).optional(),
  deviceName: z.string().trim().max(200).optional(),
  faultDescription: z.string().trim().max(10000).optional(),
  materialCode: z.string().trim().max(100).optional(),
  repairCost: z.union([z.number().finite().nonnegative(), z.string().trim().max(50), z.null()]).optional(),
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
  devices: z.array(batchDeviceSchema).min(1).max(500),
}).strict()

// ─── 状态机回退规则集合（模块级常量，避免在事务内重复构造）────────────────────────

/**
 * Rule 1 守卫集合：
 * 在这些状态下，若设备 SN 或型号发生变更，必须将状态回退至「待仓库确认」
 * 注意：Created 不在此列（批次初建未曾仓库确认过，SN变更后保持 Created，仍在待确认列表中可见）
 */
const STATUSES_NEED_WAREHOUSE_RECONFIRM = new Set<string>([
  TicketStatus.WAREHOUSE_CONFIRMING,  // 已在等待确认中，SN再次变更时保持该状态（幂等）
  TicketStatus.WAREHOUSE_CONFIRMED,
  TicketStatus.IN_REPAIR,
  TicketStatus.TECHNICIAN_REPAIRING,
  TicketStatus.PENDING_REPORTER_CONFIRM,
  TicketStatus.BUSINESS_REVIEW,
  TicketStatus.WAREHOUSE_SHIPPING,
  TicketStatus.WAREHOUSE_RECEIVED,
  TicketStatus.PROCESSING,
  TicketStatus.ADMIN_REVIEW,
  TicketStatus.PENDING_SHIPMENT,
  // 返厂流程中也需重新确认（设备身份发生变更）
  TicketStatus.PENDING_FACTORY,
  TicketStatus.FACTORY_FINISHED,
])

/**
 * Rule 2 守卫集合：
 * 在这些状态下，若 TECHNICIAN 修改了 RepairCost，必须将状态回退至「待现场确认」
 * 并清空 SignedReportPhoto
 */
const STATUSES_NEED_REPORTER_RECONFIRM_ON_COST = new Set<string>([
  TicketStatus.TECHNICIAN_REPAIRING,
  TicketStatus.PENDING_REPORTER_CONFIRM,
  TicketStatus.BUSINESS_REVIEW,
  TicketStatus.WAREHOUSE_SHIPPING,
  TicketStatus.ADMIN_REVIEW,
  TicketStatus.PENDING_SHIPMENT,
])

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
  repairCost: string | null
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
  updateFields: string[]
  statusRollback: { newStatus: string; reason: string } | null
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
 * ■ Rule 1（任何角色）：
 *   SN 或型号变更 + 当前状态已过仓库确认 → 回退至 WAREHOUSE_CONFIRMING
 *
 * ■ Rule 2（仅 TECHNICIAN 角色）：
 *   RepairCost 变更 + 当前状态已到维修进行中或更后 → 回退至 PENDING_REPORTER_CONFIRM + 清签字
 *
 * ■ Rule 3（BUSINESS / WAREHOUSE 角色专属字段）：
 *   静默写入，不触发任何回退。
 */
function buildDeviceUpdateFields(
  device: Record<string, unknown>,
  existing: ExistingDevice,
  userRole: string,
  body: Record<string, unknown>
): DeviceUpdateResult {
  const changedLabels: string[] = []
  let statusRollback: { newStatus: string; reason: string } | null = null

  const newSn    = (device.serialNumber as string) || SPECIAL_VALUES.PENDING_VERIFY
  const newModel = (device.modelName    as string) || DEFAULT_VALUES.GENERIC_MODEL

  // ── 基础设备字段（始终覆盖写入）──────────────────────────────────────────────
  const updateFields: string[] = [
    `${DB_FIELDS.DEVICE_SN}     = N'${newSn.replace(/'/g, "''")}'`,
    `${DB_FIELDS.MODEL_NAME}    = N'${newModel.replace(/'/g, "''")}'`,
    `${DB_FIELDS.DEVICE_NAME}   = ${device.deviceName   ? `N'${(device.deviceName   as string).replace(/'/g, "''")}'` : "NULL"}`,
    `${DB_FIELDS.PROBLEM}       = N'${((device.faultDescription as string) || "").replace(/'/g, "''")}'`,
    `${DB_FIELDS.MATERIAL_CODE} = ${device.materialCode ? `N'${(device.materialCode as string).replace(/'/g, "''")}'` : "NULL"}`,
  ]

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

  // ── Rule 1：设备身份变更 → 回退至「待仓库确认」────────────────────────────────
  // 归一化后再比较，避免历史脏数据/大小写差异导致该守卫规则误判或漏判
  const normalizedExistingStatus = normalizeTicketStatus(existing.status)
  const identityChanged = snActuallyChanged || norm(newModel) !== norm(existing.modelName)
  if (identityChanged && normalizedExistingStatus && STATUSES_NEED_WAREHOUSE_RECONFIRM.has(normalizedExistingStatus)) {
    updateFields.push(`${DB_FIELDS.STATUS} = N'${TicketStatus.WAREHOUSE_CONFIRMING}'`)
    statusRollback = { newStatus: TicketStatus.WAREHOUSE_CONFIRMING, reason: "设备身份（SN/型号）变更" }
    console.log(`🔄 [Rule1 回退] SN: ${existing.sn}→${newSn}，型号: ${existing.modelName}→${newModel}，状态回退至 Warehouse_Confirming`)
  }

  // ── Rule 2：维修费用变更（仅 TECHNICIAN）→ 回退至「待现场确认」+ 清签字────────
  if (userRole === UserRole.TECHNICIAN && device.repairCost !== undefined) {
    const newCostRaw = device.repairCost
    const newCostStr = newCostRaw !== null ? String(newCostRaw) : null
    const oldCostNormalized = existing.repairCost !== null ? String(parseFloat(existing.repairCost)) : null
    const newCostNormalized = newCostStr           !== null ? String(parseFloat(newCostStr))          : null
    const costChanged = newCostNormalized !== oldCostNormalized

    if (costChanged && normalizedExistingStatus && STATUSES_NEED_REPORTER_RECONFIRM_ON_COST.has(normalizedExistingStatus)) {
      statusRollback = { newStatus: TicketStatus.PENDING_REPORTER_CONFIRM, reason: "维修费用变更" }
      updateFields.push(`${DB_FIELDS.STATUS} = N'${TicketStatus.PENDING_REPORTER_CONFIRM}'`)
      updateFields.push(`${DB_FIELDS.SIGNED_REPORT_PHOTO} = NULL`)
      changedLabels.push(`维修费用: ${existing.repairCost ?? "未设置"} → ${newCostRaw}（已回退至待现场确认，签字凭证已清空）`)
      console.log(`🔄 [Rule2 回退] 费用 ${existing.repairCost} → ${newCostRaw}，状态回退至 Pending_Reporter_Confirm，签字已清空`)
    } else if (costChanged) {
      changedLabels.push(`维修费用: ${existing.repairCost ?? "未设置"} → ${newCostRaw}`)
    }

    if (newCostRaw !== null && newCostRaw !== undefined) {
      updateFields.push(`RepairCost = ${parseFloat(String(newCostRaw))}`)
    } else {
      updateFields.push(`RepairCost = NULL`)
    }
  }

  // ── 3W1H 字段（Rule 3 范畴：静默写入，只有真正变化才记日志）─────────────────
  if (body.warrantyStatusOverride !== undefined) {
    const newVal = body.warrantyStatusOverride
    if (!newVal) updateFields.push("WarrantyStatusOverride = NULL")
    else updateFields.push(`WarrantyStatusOverride = N'${String(newVal).replace(/'/g, "''")}'`)
    if (norm(newVal) !== norm(existing.warrantyStatusOverride)) changedLabels.push("保修状态覆盖")
  }
  if (body.faultCategory !== undefined) {
    const newVal = body.faultCategory
    if (!newVal) updateFields.push("FaultCategory = NULL")
    else updateFields.push(`FaultCategory = N'${String(newVal).replace(/'/g, "''")}'`)
    if (norm(newVal) !== norm(existing.faultCategory)) changedLabels.push("故障分类")
  }
  if (body.repairAction !== undefined) {
    const newVal = body.repairAction
    if (!newVal) updateFields.push("RepairAction = NULL")
    else updateFields.push(`RepairAction = N'${String(newVal).replace(/'/g, "''")}'`)
    if (norm(newVal) !== norm(existing.repairAction)) changedLabels.push("维修动作")
  }
  if (body.repairNotes !== undefined) {
    const newVal = body.repairNotes
    if (!newVal) updateFields.push("RepairNotes = NULL")
    else updateFields.push(`RepairNotes = N'${String(newVal).replace(/'/g, "''")}'`)
    if (norm(newVal) !== norm(existing.repairNotes)) changedLabels.push("处理说明")
  }

  // ── 图片字段（静默写入，Diff 对比：序列化后与数据库存量比较）────────────────
  const deviceImagesValue = parseImageField(device.deviceImages)
  const damageImagesValue = parseImageField(device.damageImages)

  if (deviceImagesValue !== undefined) {
    updateFields.push(deviceImagesValue === null
      ? "DevicePhotos = NULL"
      : `DevicePhotos = N'${deviceImagesValue.replace(/'/g, "''")}'`)
    // 只有序列化结果与 DB 存量不同时才记为变更
    if (norm(deviceImagesValue) !== norm(existing.devicePhotos)) changedLabels.push("设备照片")
  }
  if (damageImagesValue !== undefined) {
    updateFields.push(damageImagesValue === null
      ? "DamageImages = NULL"
      : `DamageImages = N'${damageImagesValue.replace(/'/g, "''")}'`)
    if (norm(damageImagesValue) !== norm(existing.damageImages)) changedLabels.push("损坏照片")
  }

  return { updateFields, statusRollback, changedLabels }
}

// ─── API 处理函数 ────────────────────────────────────────────────────────────────

/**
 * PUT /api/tickets/batch-update/[batchId]
 *
 * 字段级智能更新接口：
 *  - 所有变更记录均基于真实 Diff（新旧值对比），消除全量提交引起的假日志
 *  - Rule 1: SN/型号身份变更 → 回退至「待仓库确认」（任何角色）
 *  - Rule 2: 维修费用变更    → 回退至「待现场确认」+ 清签字（仅 TECHNICIAN）
 *  - Rule 3: 商务/仓库专属字段修改 → 静默写入，不触发任何回退
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
    const body: Record<string, unknown> = parsedBody.data
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
          ${Prisma.raw(DB_FIELDS.SUB_CATEGORY)}
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
          TicketStatus.WAREHOUSE_CONFIRMED,
          TicketStatus.IN_REPAIR,
          TicketStatus.PENDING_REPORTER_CONFIRM,
          TicketStatus.TECHNICIAN_REPAIRING,
          TicketStatus.BUSINESS_REVIEW,
          TicketStatus.WAREHOUSE_SHIPPING,
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
          WarrantyStatusOverride,
          FaultCategory,
          RepairAction,
          RepairNotes,
          DevicePhotos,
          DamageImages
          ${Prisma.raw(repairCostSelect)}
        FROM Repair_Tickets
        WHERE ${Prisma.raw(DB_FIELDS.BATCH_ID)} = ${batchId}
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

      // 3. 更新批次基础信息（所有设备共享）
      // 收集批次级别真实变更摘要（空值归一化后对比新旧值）
      const batchChangedLabels: string[] = []
      if (senderAddress   !== undefined && norm(senderAddress)   !== norm(existingBatch.senderAddress))   batchChangedLabels.push("寄件地址")
      if (projectName     !== undefined && norm(projectName)     !== norm(existingBatch.projectName))     batchChangedLabels.push("客户名称")
      if (contactInfo     !== undefined && norm(contactInfo)     !== norm(existingBatch.contactInfo))     batchChangedLabels.push("联系人信息")
      if (projectLocation !== undefined && norm(projectLocation) !== norm(existingBatch.projectLocation)) batchChangedLabels.push("项目地址")
      if (trackingNumber  !== undefined && norm(trackingNumber)  !== norm(existingBatch.trackingNumberIn)) batchChangedLabels.push("物流单号")
      if (expressCompany  !== undefined && norm(expressCompany)  !== norm(existingBatch.courierCompany))  batchChangedLabels.push("快递公司")
      if (category        !== undefined && norm(category)        !== norm(existingBatch.category))        batchChangedLabels.push("设备类别")
      if (subCategory     !== undefined && norm(subCategory)     !== norm(existingBatch.subCategory))     batchChangedLabels.push("设备子类别")

      for (const deviceId of existingDeviceIds) {
        await tx.$executeRaw(Prisma.sql`
          UPDATE Repair_Tickets
          SET
            ${Prisma.raw(DB_FIELDS.SENDER_ADDRESS)}     = ${senderAddress    || null},
            ${Prisma.raw(DB_FIELDS.PROJECT_NAME)}       = ${projectName      || null},
            ${Prisma.raw(DB_FIELDS.CONTACT_INFO)}       = ${contactInfo      || null},
            ${Prisma.raw(DB_FIELDS.PROJECT_LOCATION)}   = ${projectLocation  || null},
            ${Prisma.raw(DB_FIELDS.TRACKING_NUMBER_IN)} = ${trackingNumber   || null},
            ${Prisma.raw(DB_FIELDS.COURIER_COMPANY)}    = ${expressCompany   || null},
            ${Prisma.raw(DB_FIELDS.CATEGORY)}           = ${category         || null},
            ${Prisma.raw(DB_FIELDS.SUB_CATEGORY)}       = ${subCategory      || null},
            ${Prisma.raw(DB_FIELDS.UPDATED_AT)}         = GETUTCDATE()
          WHERE ${Prisma.raw(DB_FIELDS.ID)} = ${deviceId}
        `)
      }

      // 4. 处理设备信息（三分支：数量相同 / 减少 / 增加）
      const deviceCount   = devices.length
      const existingCount = existingDeviceIds.length

      const allDeviceChangeSummaries: string[] = []
      const rollbackEvents: { deviceId: number; rollback: { newStatus: string; reason: string } }[] = []

      /** 执行单台已有设备的 UPDATE（复用于三个分支） */
      const processExistingDevice = async (device: Record<string, unknown>, deviceId: number) => {
        const existing = existingDeviceMap.get(deviceId)
        if (!existing) return

        const { updateFields, statusRollback, changedLabels } =
          buildDeviceUpdateFields(device, existing, user.role, body)

        if (changedLabels.length > 0) {
          allDeviceChangeSummaries.push(`设备${deviceId}：${changedLabels.join("、")}`)
        }
        if (statusRollback) {
          rollbackEvents.push({ deviceId, rollback: statusRollback })
        }

        await tx.$executeRaw(Prisma.sql`
          UPDATE Repair_Tickets
          SET ${Prisma.raw(updateFields.join(", "))}
          WHERE ${Prisma.raw(DB_FIELDS.ID)} = ${deviceId}
        `)
      }

      if (deviceCount === existingCount) {
        for (let i = 0; i < deviceCount; i++) {
          await processExistingDevice(devices[i], existingDeviceIds[i])
        }
      } else if (deviceCount < existingCount) {
        for (let i = 0; i < deviceCount; i++) {
          await processExistingDevice(devices[i], existingDeviceIds[i])
        }
        for (let i = deviceCount; i < existingCount; i++) {
          await tx.$executeRaw(Prisma.sql`
            DELETE FROM Repair_Tickets
            WHERE ${Prisma.raw(DB_FIELDS.ID)} = ${existingDeviceIds[i]}
          `)
          allDeviceChangeSummaries.push(`设备${existingDeviceIds[i]}：已删除`)
        }
      } else {
        for (let i = 0; i < existingCount; i++) {
          await processExistingDevice(devices[i], existingDeviceIds[i])
        }
        for (let i = existingCount; i < deviceCount; i++) {
          const device = devices[i]
          await tx.$executeRaw(Prisma.sql`
            INSERT INTO Repair_Tickets (
              ${Prisma.raw(DB_FIELDS.BATCH_ID)},
              ${Prisma.raw(DB_FIELDS.DEVICE_SN)},
              ${Prisma.raw(DB_FIELDS.STATUS)},
              ${Prisma.raw(DB_FIELDS.MODEL_NAME)},
              ${Prisma.raw(DB_FIELDS.DEVICE_NAME)},
              ${Prisma.raw(DB_FIELDS.PROBLEM)},
              ${Prisma.raw(DB_FIELDS.CATEGORY)},
              ${Prisma.raw(DB_FIELDS.SUB_CATEGORY)},
              ${Prisma.raw(DB_FIELDS.MATERIAL_CODE)},
              ${Prisma.raw(DB_FIELDS.QUANTITY)},
              ${Prisma.raw(DB_FIELDS.PROJECT_NAME)},
              ${Prisma.raw(DB_FIELDS.CONTACT_INFO)},
              ${Prisma.raw(DB_FIELDS.PROJECT_LOCATION)},
              ${Prisma.raw(DB_FIELDS.SENDER_ADDRESS)},
              ${Prisma.raw(DB_FIELDS.TRACKING_NUMBER_IN)},
              ${Prisma.raw(DB_FIELDS.COURIER_COMPANY)},
              ${Prisma.raw(DB_FIELDS.REPORT_BY_USER_ID)},
              ${Prisma.raw(DB_FIELDS.REPORT_TIME)}
            )
            VALUES (
              ${batchId},
              ${(device.serialNumber    as string) || SPECIAL_VALUES.PENDING_VERIFY},
              ${TicketStatus.WAREHOUSE_CONFIRMING},
              ${(device.modelName       as string) || DEFAULT_VALUES.GENERIC_MODEL},
              ${(device.deviceName      as string) || null},
              ${(device.faultDescription as string) || ""},
              ${category     || null},
              ${subCategory  || null},
              ${(device.materialCode as string) || null},
              ${1},
              ${projectName     || null},
              ${contactInfo     || null},
              ${projectLocation || null},
              ${senderAddress   || null},
              ${trackingNumber  || null},
              ${expressCompany  || null},
              ${Number.isSafeInteger(batchOwnerId) ? batchOwnerId : null},
              GETUTCDATE()
            )
          `)
          allDeviceChangeSummaries.push(`新增设备：${(device.serialNumber as string) || "待核"}`)
        }
      }

      // 5. 写入操作日志（只在有真实变更时才有内容）
      const descParts: string[] = []

      if (batchChangedLabels.length > 0) {
        descParts.push(`[批次信息] ${batchChangedLabels.join("、")}`)
      }
      if (allDeviceChangeSummaries.length > 0) {
        descParts.push(`[设备信息] ${allDeviceChangeSummaries.join("；")}`)
      }
      if (rollbackEvents.length > 0) {
        const rollbackDesc = rollbackEvents
          .map(e => `设备${e.deviceId} 因「${e.rollback.reason}」回退至「${e.rollback.newStatus}」`)
          .join("；")
        descParts.push(`[状态回退] ${rollbackDesc}`)
      }

      const description = descParts.length > 0
        ? descParts.join(" | ")
        : `提交了工单编辑（无字段变更，共 ${deviceCount} 台设备）`

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

      for (const { deviceId, rollback } of rollbackEvents) {
        await tx.repair_Ticket_History.create({
          data: {
            batchId,
            actionType:   TicketActionType.REWIND_UPDATE,
            operatorId:   user.id,
            operatorName: user.realName || user.username || user.id.toString(),
            newStatus:    rollback.newStatus,
            description:  `设备 ${deviceId}：因「${rollback.reason}」自动回退至「${rollback.newStatus}」`,
          }
        })
      }

      return { currentStatus, deviceCount, rollbackCount: rollbackEvents.length, description }
    })

    console.log(
      `✅ [批次更新] batchId=${batchId} 设备数=${result.deviceCount} 回退数=${result.rollbackCount}`,
      result.description
    )

    return NextResponse.json({
      success: true,
      message: `工单信息已更新，共 ${result.deviceCount} 台设备${result.rollbackCount > 0 ? `，${result.rollbackCount} 台触发状态回退` : ""}`,
      data: {
        batchId,
        deviceCount:   result.deviceCount,
        status:        result.currentStatus,
        rollbackCount: result.rollbackCount,
      }
    })

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "更新工单失败"
    console.error("批次工单更新失败:", error)

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
