import { NextResponse } from "next/server"
import * as sql from "mssql"
import { z } from "zod"
import { getDbConnection } from "@/lib/db-config"
import { getStorageAdapter } from "@/lib/storage/storage-adapter"
import { TicketStatus, TicketActionType, SPECIAL_VALUES, UserRole } from "@/lib/enums"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"
import { createUploadStoragePath, validateUploadedFile, type UploadValidationResult } from "@/lib/storage/upload-security"
import { generateSequentialBatchId } from "@/lib/batch-number"

const optionalText = (max: number) => z.string().trim().max(max).default("")
const createSchema = z.object({
  deviceSn: optionalText(100), productSn: optionalText(100), modelName: optionalText(200),
  faultDesc: z.string().trim().min(1).max(10000),
  courierInfo: optionalText(200), courierCompany: optionalText(200), trackingNumberIn: optionalText(100),
  projectLocation: optionalText(200), projectName: optionalText(500), senderAddress: optionalText(500),
  contactInfo: optionalText(200), category: optionalText(200), subCategory: optionalText(200),
  materialCode: optionalText(100), fullSpec: optionalText(500), faultPoint: optionalText(500),
  quantity: z.coerce.number().int().min(1).max(100000).default(1),
  submitDate: z.string().optional(),
  isChargeable: z.enum(["", "true", "false", "1", "0"]).default(""),
  repairCost: z.union([z.literal(""), z.coerce.number().finite().min(0).max(9999999999999999)]).default(""),
}).refine(value => Boolean(value.deviceSn) || value.productSn === "PENDING_VERIFY", {
  message: "设备序列号为必填项", path: ["deviceSn"],
})

interface InventoryRow { SerialNumber: string; Status: string | null; ModelName: string | null; MaterialCode: string | null }
type ValidUpload = { file: File; kind: "deviceImages" | "damageImages"; validation: Extract<UploadValidationResult, { success: true }> }

/** Legacy single-device form; a single device still creates one ordinary batch. */
export async function POST(request: Request) {
  const auth = await checkUserRole([UserRole.ADMIN, UserRole.REPORTER])
  if (isErrorResponse(auth)) return auth
  const uploadedPaths: string[] = []
  let transaction: sql.Transaction | null = null
  try {
    const form = await request.formData()
    const parsed = createSchema.safeParse(Object.fromEntries(form.entries()))
    if (!parsed.success) return NextResponse.json({ success: false, message: "请检查报修字段、数量和费用" }, { status: 400 })
    const fields = parsed.data
    const userId = Number(auth.userId)
    const submitDate = fields.submitDate ? new Date(fields.submitDate) : new Date()
    if (!Number.isSafeInteger(userId) || userId < 1 || !Number.isFinite(submitDate.getTime())) {
      return NextResponse.json({ success: false, message: "登录身份或报修日期无效" }, { status: 400 })
    }

    const entries = (["deviceImages", "damageImages"] as const).flatMap(kind => form.getAll(kind).map(file => ({ kind, file })))
    if (entries.length > 20) return NextResponse.json({ success: false, message: "一次最多上传 20 张照片" }, { status: 400 })
    const uploads: ValidUpload[] = []
    // Validate the whole set before database access or storage writes.
    for (const entry of entries) {
      if (!(entry.file instanceof File)) return NextResponse.json({ success: false, message: "照片参数无效" }, { status: 400 })
      const validation = await validateUploadedFile(entry.file, entry.kind === "deviceImages" ? "device_photo" : "damage_photo")
      if (!validation.success) return NextResponse.json({ success: false, message: validation.message }, { status: 400 })
      uploads.push({ ...entry, file: entry.file, validation })
    }

    const pool = await getDbConnection()
    // Exact column names are declared by schema.prisma; fail closed if the deployed
    // database cannot preserve ownership, batch identity or uploaded attachments.
    const columns = await pool.request().query<{ COLUMN_NAME: string }>(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'Repair_Tickets';
    `)
    const available = new Set(columns.recordset.map(row => row.COLUMN_NAME.toLowerCase()))
    const required = ["Id", "DeviceSN", "ModelName", "Problem", "Status", "ReportByUserID", "BatchId"]
    if (required.some(column => !available.has(column.toLowerCase())) ||
      (form.getAll("deviceImages").length > 0 && !available.has("devicephotos")) ||
      (form.getAll("damageImages").length > 0 && !available.has("damageimages"))) {
      return NextResponse.json({ success: false, message: "数据库结构尚未完成升级，请联系管理员" }, { status: 503 })
    }

    // The existing allocator reserves a number separately. Failed creations may
    // leave numbering gaps, but all business records below commit together.
    const batchId = await generateSequentialBatchId(pool)
    transaction = new sql.Transaction(pool)
    await transaction.begin()
    const pending = fields.deviceSn === "PENDING_VERIFY" || fields.productSn === "PENDING_VERIFY"
    const deviceSn = pending ? "PENDING" : fields.deviceSn
    let inventory: InventoryRow | undefined
    if (!pending) {
      const deviceResult = await new sql.Request(transaction)
        .input("serialNumber", sql.NVarChar(100), deviceSn)
        .query<InventoryRow>(`
          SELECT TOP 1 [SerialNumber], [Status], [ModelName], [MaterialCode]
          FROM [dbo].[Device_Inventory] WITH (UPDLOCK, HOLDLOCK)
          WHERE [SerialNumber] = @serialNumber;
        `)
      inventory = deviceResult.recordset[0]
      if (!inventory) {
        await transaction.rollback(); transaction = null
        return NextResponse.json({ success: false, message: "设备序列号不存在于设备档案中，请先录入设备信息" }, { status: 400 })
      }
    }

    const photoPaths: Record<"deviceImages" | "damageImages", string[]> = { deviceImages: [], damageImages: [] }
    for (const upload of uploads) {
      const purpose = upload.kind === "deviceImages" ? "device_photo" : "damage_photo"
      const key = createUploadStoragePath(purpose, auth.userId, upload.validation.extension)
      // Track the generated key before I/O so even a partially failed write can be cleaned.
      uploadedPaths.push(key)
      const url = await getStorageAdapter().upload(key, upload.file, upload.validation.mimeType)
      photoPaths[upload.kind].push(url)
    }

    if (inventory) {
      const status = inventory.Status || ""
      const availableStatuses: string[] = [SPECIAL_VALUES.DEVICE_STATUS_IN_STOCK, SPECIAL_VALUES.DEVICE_STATUS_OUT_STOCK,
        SPECIAL_VALUES.DEVICE_STATUS_IN_STOCK_EN, SPECIAL_VALUES.DEVICE_STATUS_OUT_STOCK_EN]
      if (availableStatuses.includes(status) || status.toLowerCase() === "instock") {
        await new sql.Request(transaction).input("serialNumber", sql.NVarChar(100), deviceSn)
          .input("status", sql.NVarChar(50), SPECIAL_VALUES.DEVICE_STATUS_REPAIRING)
          .query("UPDATE [dbo].[Device_Inventory] SET [Status] = @status WHERE [SerialNumber] = @serialNumber;")
      }
    }

    // Server-owned, schema.prisma-verified identifier allowlist.
    const values: Record<string, string | number | boolean | Date | null> = {
      DeviceSN: deviceSn, ModelName: fields.modelName || inventory?.ModelName || null,
      Problem: fields.faultDesc, Status: TicketStatus.WAREHOUSE_CONFIRMING,
      ReportByUserID: userId, ReportedBy: auth.realName || auth.username,
      BatchId: batchId, WorkOrderNumber: batchId, TicketId: batchId,
      ReportTime: new Date(), SubmitDate: submitDate, Quantity: fields.quantity,
      ProjectLocation: fields.projectLocation || null, ProjectName: fields.projectName || null,
      SenderAddress: fields.senderAddress || null, ContactInfo: fields.contactInfo || null,
      Category: fields.category || null, SubCategory: fields.subCategory || null,
      CourierCompany: fields.courierCompany || null, CourierNumber: fields.courierInfo || null,
      TrackingNumber_In: (fields.trackingNumberIn || fields.courierInfo).replace(/\s+/g, "") || null,
      MaterialCode: fields.materialCode || inventory?.MaterialCode || null,
      FullSpec: fields.fullSpec || null, FaultPoint: fields.faultPoint || null,
      IsChargeable: fields.isChargeable === "true" || fields.isChargeable === "1",
      RepairCost: fields.repairCost === "" ? null : fields.repairCost,
      DevicePhotos: photoPaths.deviceImages.length ? JSON.stringify(photoPaths.deviceImages) : null,
      DamageImages: photoPaths.damageImages.length ? JSON.stringify(photoPaths.damageImages) : null,
    }
    const insertedFields = Object.keys(values).filter(column => available.has(column.toLowerCase()))
    const insert = new sql.Request(transaction)
    for (const column of insertedFields) insert.input(column, values[column])
    const created = await insert.query<{ Id: number }>(`
      INSERT INTO [dbo].[Repair_Tickets] (${insertedFields.map(column => `[${column}]`).join(", ")})
      OUTPUT INSERTED.[Id] AS [Id]
      VALUES (${insertedFields.map(column => `@${column}`).join(", ")});
    `)
    const ticketId = created.recordset[0]?.Id
    if (!ticketId) throw new Error("No ticket identity returned")
    await new sql.Request(transaction)
      .input("ticketId", sql.NVarChar(50), String(ticketId)).input("batchId", sql.NVarChar(50), batchId)
      .input("action", sql.NVarChar(50), TicketActionType.BATCH_CREATED)
      .input("status", sql.NVarChar(50), TicketStatus.WAREHOUSE_CONFIRMING)
      .input("operatorId", sql.Int, userId).input("operatorName", sql.NVarChar(100), auth.realName || auth.username)
      .input("description", sql.NVarChar(sql.MAX), "创建报修工单")
      .query(`INSERT INTO [dbo].[Repair_Ticket_History]
        ([TicketID], [BatchId], [ActionType], [NewStatus], [OperatorId], [OperatorName], [Description], [CreatedAt])
        VALUES (@ticketId, @batchId, @action, @status, @operatorId, @operatorName, @description, GETUTCDATE());`)
    await transaction.commit(); transaction = null
    return NextResponse.json({ success: true, message: "报修工单创建成功", data: { id: ticketId, batchId } }, { status: 201 })
  } catch (error: unknown) {
    if (transaction) {
      try { await transaction.rollback() } catch { /* preserve the original failure */ } finally { transaction = null }
    }
    const cleanup = await Promise.allSettled(uploadedPaths.map(storedPath => getStorageAdapter().delete(storedPath)))
    if (cleanup.some(result => result.status === "rejected")) console.error("创建工单失败后的附件清理未完成，请检查存储服务")
    console.error("创建报修工单失败:", error)
    return NextResponse.json({ success: false, message: "创建报修工单时发生错误，请重试" }, { status: 500 })
  }
}
