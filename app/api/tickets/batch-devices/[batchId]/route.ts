import { NextResponse } from "next/server"
import * as sql from "mssql"
import { z } from "zod"
import { getDbConnection } from "@/lib/db-config"
import { TicketActionType, TicketStatus, UserRole } from "@/lib/enums"
import { ALL_USER_ROLES, checkUserRole, isErrorResponse } from "@/lib/auth-utils"

const batchIdSchema = z.string().trim().min(1).max(100)
const newDeviceSchema = z.object({
  deviceSn: z.string().trim().min(1).max(100),
  modelName: z.string().trim().min(1).max(200),
  deviceName: z.string().trim().max(200).optional(),
  faultDescription: z.string().trim().max(10000).optional(),
  category: z.string().trim().max(200).optional(),
  subCategory: z.string().trim().max(200).optional(),
  materialCode: z.string().trim().max(100).optional(),
  quantity: z.number().int().min(1).max(100000).optional(),
}).strict()
const addDevicesSchema = z.object({
  devices: z.array(newDeviceSchema).min(1).max(500),
}).strict()
const updateDeviceSchema = z.object({
  deviceId: z.coerce.number().int().positive(),
  updates: z.object({
    deviceSn: z.string().trim().min(1).max(100).optional(),
    modelName: z.string().trim().min(1).max(200).optional(),
    deviceName: z.string().trim().max(200).nullable().optional(),
    faultDescription: z.string().trim().max(10000).optional(),
    category: z.string().trim().max(200).nullable().optional(),
    subCategory: z.string().trim().max(200).nullable().optional(),
    materialCode: z.string().trim().max(100).nullable().optional(),
    quantity: z.number().int().min(1).max(100000).optional(),
    manufactureDate: z.string().datetime().nullable().optional(),
  }).strict(),
}).strict()

interface BatchGuardRow {
  Id: number
  Status: string
  ReportByUserID: number | null
  ProjectName: string | null
  ContactInfo: string | null
}

async function rollback(transaction: sql.Transaction | null): Promise<null> {
  if (!transaction) return null
  try {
    await transaction.rollback()
  } catch (rollbackError) {
    console.error("[Batch Devices API] 事务回滚失败:", rollbackError)
  }
  return null
}

function canEditBatchRows(rows: BatchGuardRow[], role: UserRole, userId: number): boolean {
  if (rows.length === 0) return false
  if (role === UserRole.REPORTER && rows.some((row) => row.ReportByUserID !== userId)) {
    return false
  }
  return rows.every((row) =>
    row.Status === TicketStatus.CREATED || row.Status === TicketStatus.WAREHOUSE_CONFIRMING
  )
}

// GET /api/tickets/batch-devices/[batchId]
export async function GET(
  _request: Request,
  context: { params: Promise<{ batchId: string }> }
) {
  const authResult = await checkUserRole(ALL_USER_ROLES)
  if (isErrorResponse(authResult)) return authResult

  try {
    const parsedBatchId = batchIdSchema.safeParse((await context.params).batchId)
    if (!parsedBatchId.success) {
      return NextResponse.json({ success: false, message: "批次ID无效" }, { status: 400 })
    }
    const batchId = parsedBatchId.data
    const userId = Number(authResult.userId)
    if (!Number.isSafeInteger(userId)) {
      return NextResponse.json({ success: false, message: "登录身份无效" }, { status: 401 })
    }

    const reporterPredicate = authResult.normalizedRole === UserRole.REPORTER
      ? "AND [ReportByUserID] = @userId"
      : ""
    const pool = await getDbConnection()
    const result = await pool.request()
      .input("batchId", sql.NVarChar(100), batchId)
      .input("userId", sql.Int, userId)
      .query(`
        SELECT
          [Id], [DeviceSN], [ModelName], [DeviceName], [Status], [Problem],
          [MaterialCode], [FullSpec], [FaultPoint], [CreatedAt], [BatchId],
          [SignedReportPhoto], [SenderAddress], [TrackingNumber_In], [CourierCompany],
          [RepairAction], [RepairReportContent], [ProjectLocation], [ContactInfo],
          [ProjectName], [Quantity], [Category], [SubCategory], [CancelRequestStatus],
          [CancelRequestReason], [ManufactureDate], [ArrivalDate], [WarrantyStatus],
          [WarrantyStatusOverride], [DevicePhotos], [RevisionRequestedBy],
          [RevisionRequestReason], [RevisionRequestDate], [FactoryTrackingNum],
          [FactoryShipDate]
        FROM [dbo].[Repair_Tickets]
        WHERE [BatchId] = @batchId ${reporterPredicate}
        ORDER BY [Id] ASC;
      `)

    if (result.recordset.length === 0) {
      return NextResponse.json(
        { success: false, message: "未找到该批次或您无权查看" },
        { status: 404 }
      )
    }

    const devices = result.recordset.map((row: Record<string, unknown>) => ({
      id: row.Id,
      deviceSerialNumber: row.DeviceSN,
      modelName: row.ModelName,
      deviceName: row.DeviceName,
      status: row.Status,
      problem: row.Problem,
      materialCode: row.MaterialCode,
      fullSpec: row.FullSpec,
      faultPoint: row.FaultPoint,
      createdAt: row.CreatedAt,
      batchId: row.BatchId,
      cancelRequestStatus: row.CancelRequestStatus || null,
      cancelRequestReason: row.CancelRequestReason || null,
      manufactureDate: row.ManufactureDate || null,
      arrivalDate: row.ArrivalDate || null,
      warrantyStatus: row.WarrantyStatus || null,
      warrantyStatusOverride: row.WarrantyStatusOverride || null,
      deviceImages: row.DevicePhotos || null,
      repairAction: row.RepairAction || null,
      quantity: typeof row.Quantity === "number" ? row.Quantity : (parseInt(String(row.Quantity)) || 1),
      finalOutcome: (() => {
        try {
          if (!row.RepairReportContent) return null
          const parsed: unknown = JSON.parse(String(row.RepairReportContent))
          return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>).finalOutcome ?? null
            : null
        } catch {
          return null
        }
      })(),
    }))

    const first = result.recordset[0] as Record<string, unknown>
    let signedReportPhoto = typeof first.SignedReportPhoto === "string"
      ? first.SignedReportPhoto
      : null
    if (signedReportPhoto && !signedReportPhoto.startsWith("/") && !signedReportPhoto.startsWith("http")) {
      signedReportPhoto = `/${signedReportPhoto}`
    }

    return NextResponse.json({
      success: true,
      data: {
        batchInfo: {
          batchId,
          projectLocation: first.ProjectLocation || "",
          contactInfo: first.ContactInfo || "",
          projectName: first.ProjectName || "",
          quantity: first.Quantity || 0,
          category: first.Category || "",
          subCategory: first.SubCategory || "",
          deviceCount: devices.reduce((sum, device) => sum + (device.quantity || 1), 0),
          signedReportPhoto,
          status: first.Status || TicketStatus.CREATED,
          senderAddress: first.SenderAddress || "",
          trackingNumber: first.TrackingNumber_In || "",
          expressCompany: first.CourierCompany || "",
          revisionRequestedBy: first.RevisionRequestedBy || null,
          revisionRequestReason: first.RevisionRequestReason || null,
          revisionRequestDate: first.RevisionRequestDate || null,
          factoryTrackingNum: first.FactoryTrackingNum || null,
          factoryShipDate: first.FactoryShipDate || null,
        },
        devices,
      },
    })
  } catch (error: unknown) {
    console.error("[Batch Devices API] 查询失败:", error)
    return NextResponse.json(
      { success: false, message: "查询批次设备失败" },
      { status: 500 }
    )
  }
}

// POST /api/tickets/batch-devices/[batchId]
export async function POST(
  request: Request,
  context: { params: Promise<{ batchId: string }> }
) {
  const authResult = await checkUserRole([UserRole.ADMIN, UserRole.REPORTER])
  if (isErrorResponse(authResult)) return authResult

  let transaction: sql.Transaction | null = null
  try {
    const parsedBatchId = batchIdSchema.safeParse((await context.params).batchId)
    const parsedBody = addDevicesSchema.safeParse(await request.json().catch(() => null))
    if (!parsedBatchId.success || !parsedBody.success) {
      return NextResponse.json({ success: false, message: "请求参数无效" }, { status: 400 })
    }
    const batchId = parsedBatchId.data
    const userId = Number(authResult.userId)
    if (!Number.isSafeInteger(userId)) {
      return NextResponse.json({ success: false, message: "登录身份无效" }, { status: 401 })
    }

    const pool = await getDbConnection()
    transaction = new sql.Transaction(pool)
    await transaction.begin()
    const guardResult = await new sql.Request(transaction)
      .input("batchId", sql.NVarChar(100), batchId)
      .query<BatchGuardRow>(`
        SELECT [Id], [Status], [ReportByUserID], [ProjectName], [ContactInfo]
        FROM [dbo].[Repair_Tickets] WITH (UPDLOCK, HOLDLOCK)
        WHERE [BatchId] = @batchId;
      `)
    if (guardResult.recordset.length === 0) {
      transaction = await rollback(transaction)
      return NextResponse.json({ success: false, message: "批次不存在" }, { status: 404 })
    }
    if (!canEditBatchRows(guardResult.recordset, authResult.normalizedRole, userId)) {
      transaction = await rollback(transaction)
      return NextResponse.json(
        { success: false, message: "您无权修改该批次或当前状态不允许新增设备" },
        { status: 403 }
      )
    }

    const base = guardResult.recordset[0]
    const createdDeviceIds: number[] = []
    for (const device of parsedBody.data.devices) {
      const insertResult = await new sql.Request(transaction)
        .input("deviceSn", sql.NVarChar(100), device.deviceSn)
        .input("batchId", sql.NVarChar(100), batchId)
        .input("status", sql.NVarChar(50), base.Status)
        .input("modelName", sql.NVarChar(200), device.modelName)
        .input("deviceName", sql.NVarChar(200), device.deviceName ?? null)
        .input("problem", sql.NVarChar(sql.MAX), device.faultDescription ?? "")
        .input("category", sql.NVarChar(200), device.category ?? null)
        .input("subCategory", sql.NVarChar(200), device.subCategory ?? null)
        .input("materialCode", sql.NVarChar(100), device.materialCode ?? null)
        .input("quantity", sql.Int, device.quantity ?? 1)
        .input("projectName", sql.NVarChar(500), base.ProjectName)
        .input("contactInfo", sql.NVarChar(200), base.ContactInfo)
        .input("reportByUserId", sql.Int, base.ReportByUserID)
        .query<{ Id: number }>(`
          INSERT INTO [dbo].[Repair_Tickets] (
            [DeviceSN], [BatchId], [Status], [ModelName], [DeviceName], [Problem],
            [Category], [SubCategory], [MaterialCode], [Quantity], [ProjectName],
            [ContactInfo], [ReportByUserID], [ReportTime]
          )
          OUTPUT inserted.[Id]
          VALUES (
            @deviceSn, @batchId, @status, @modelName, @deviceName, @problem,
            @category, @subCategory, @materialCode, @quantity, @projectName,
            @contactInfo, @reportByUserId, GETUTCDATE()
          );
        `)
      createdDeviceIds.push(insertResult.recordset[0].Id)
    }

    await new sql.Request(transaction)
      .input("batchId", sql.NVarChar(100), batchId)
      .input("actionType", sql.NVarChar(50), TicketActionType.BATCH_UPDATED)
      .input("operatorId", sql.Int, userId)
      .input("operatorName", sql.NVarChar(100), authResult.realName || authResult.username)
      .input("description", sql.NVarChar(sql.MAX), `新增 ${createdDeviceIds.length} 台设备`)
      .query(`
        INSERT INTO [dbo].[Repair_Ticket_History] (
          [BatchId], [ActionType], [OperatorId], [OperatorName], [Description], [CreatedAt]
        ) VALUES (@batchId, @actionType, @operatorId, @operatorName, @description, GETUTCDATE());
      `)
    await transaction.commit()
    transaction = null

    return NextResponse.json({
      success: true,
      message: `成功添加 ${createdDeviceIds.length} 台设备`,
      data: { createdDeviceIds, count: createdDeviceIds.length },
    })
  } catch (error: unknown) {
    console.error("[Batch Devices API] 添加失败:", error)
    transaction = await rollback(transaction)
    return NextResponse.json({ success: false, message: "添加设备失败" }, { status: 500 })
  }
}

// PUT /api/tickets/batch-devices/[batchId]
export async function PUT(
  request: Request,
  context: { params: Promise<{ batchId: string }> }
) {
  const authResult = await checkUserRole([UserRole.ADMIN, UserRole.REPORTER])
  if (isErrorResponse(authResult)) return authResult

  let transaction: sql.Transaction | null = null
  try {
    const parsedBatchId = batchIdSchema.safeParse((await context.params).batchId)
    const parsedBody = updateDeviceSchema.safeParse(await request.json().catch(() => null))
    if (!parsedBatchId.success || !parsedBody.success) {
      return NextResponse.json({ success: false, message: "请求参数无效" }, { status: 400 })
    }
    const batchId = parsedBatchId.data
    const { deviceId, updates } = parsedBody.data
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, message: "没有需要更新的字段" }, { status: 400 })
    }
    if (authResult.normalizedRole === UserRole.REPORTER && updates.manufactureDate !== undefined) {
      return NextResponse.json({ success: false, message: "现场人员无权修改出厂日期" }, { status: 403 })
    }
    const userId = Number(authResult.userId)
    if (!Number.isSafeInteger(userId)) {
      return NextResponse.json({ success: false, message: "登录身份无效" }, { status: 401 })
    }

    const pool = await getDbConnection()
    transaction = new sql.Transaction(pool)
    await transaction.begin()
    const guardResult = await new sql.Request(transaction)
      .input("batchId", sql.NVarChar(100), batchId)
      .query<BatchGuardRow>(`
        SELECT [Id], [Status], [ReportByUserID], [ProjectName], [ContactInfo]
        FROM [dbo].[Repair_Tickets] WITH (UPDLOCK, HOLDLOCK)
        WHERE [BatchId] = @batchId;
      `)
    if (!canEditBatchRows(guardResult.recordset, authResult.normalizedRole, userId)) {
      transaction = await rollback(transaction)
      return NextResponse.json(
        { success: false, message: "您无权修改该批次或当前状态不允许编辑设备" },
        { status: 403 }
      )
    }

    const fields: string[] = []
    const updateRequest = new sql.Request(transaction)
      .input("deviceId", sql.Int, deviceId)
      .input("batchId", sql.NVarChar(100), batchId)
    const addField = (column: string, parameter: string, type: sql.ISqlType, value: unknown) => {
      fields.push(`[${column}] = @${parameter}`)
      updateRequest.input(parameter, type, value)
    }
    if (updates.deviceSn !== undefined) addField("DeviceSN", "deviceSn", sql.NVarChar(100), updates.deviceSn)
    if (updates.modelName !== undefined) addField("ModelName", "modelName", sql.NVarChar(200), updates.modelName)
    if (updates.deviceName !== undefined) addField("DeviceName", "deviceName", sql.NVarChar(200), updates.deviceName)
    if (updates.faultDescription !== undefined) addField("Problem", "problem", sql.NVarChar(sql.MAX), updates.faultDescription)
    if (updates.category !== undefined) addField("Category", "category", sql.NVarChar(200), updates.category)
    if (updates.subCategory !== undefined) addField("SubCategory", "subCategory", sql.NVarChar(200), updates.subCategory)
    if (updates.materialCode !== undefined) addField("MaterialCode", "materialCode", sql.NVarChar(100), updates.materialCode)
    if (updates.quantity !== undefined) addField("Quantity", "quantity", sql.Int(), updates.quantity)
    if (updates.manufactureDate !== undefined) addField(
      "ManufactureDate",
      "manufactureDate",
      sql.DateTime2(),
      updates.manufactureDate ? new Date(updates.manufactureDate) : null
    )
    fields.push("[UpdatedAt] = GETUTCDATE()")

    const updateResult = await updateRequest.query(`
      UPDATE [dbo].[Repair_Tickets]
      SET ${fields.join(", ")}
      WHERE [Id] = @deviceId
        AND [BatchId] = @batchId
        AND [Status] IN ('Created', 'Warehouse_Confirming');
    `)
    if (updateResult.rowsAffected[0] !== 1) {
      transaction = await rollback(transaction)
      return NextResponse.json(
        { success: false, message: "设备不存在、状态已变化或不属于该批次" },
        { status: 409 }
      )
    }

    await new sql.Request(transaction)
      .input("batchId", sql.NVarChar(100), batchId)
      .input("actionType", sql.NVarChar(50), TicketActionType.BATCH_UPDATED)
      .input("operatorId", sql.Int, userId)
      .input("operatorName", sql.NVarChar(100), authResult.realName || authResult.username)
      .input("description", sql.NVarChar(sql.MAX), `编辑设备 ${deviceId}`)
      .query(`
        INSERT INTO [dbo].[Repair_Ticket_History] (
          [BatchId], [ActionType], [OperatorId], [OperatorName], [Description], [CreatedAt]
        ) VALUES (@batchId, @actionType, @operatorId, @operatorName, @description, GETUTCDATE());
      `)
    await transaction.commit()
    transaction = null
    return NextResponse.json({ success: true, message: "设备信息已更新" })
  } catch (error: unknown) {
    console.error("[Batch Devices API] 更新失败:", error)
    transaction = await rollback(transaction)
    return NextResponse.json({ success: false, message: "更新设备失败" }, { status: 500 })
  }
}

// DELETE /api/tickets/batch-devices/[batchId]
export async function DELETE(
  request: Request,
  context: { params: Promise<{ batchId: string }> }
) {
  const authResult = await checkUserRole([UserRole.ADMIN, UserRole.REPORTER])
  if (isErrorResponse(authResult)) return authResult

  let transaction: sql.Transaction | null = null
  try {
    const parsedBatchId = batchIdSchema.safeParse((await context.params).batchId)
    const deviceIdResult = z.coerce.number().int().positive().safeParse(new URL(request.url).searchParams.get("deviceId"))
    if (!parsedBatchId.success || !deviceIdResult.success) {
      return NextResponse.json({ success: false, message: "批次ID或设备ID无效" }, { status: 400 })
    }
    const batchId = parsedBatchId.data
    const deviceId = deviceIdResult.data
    const userId = Number(authResult.userId)
    if (!Number.isSafeInteger(userId)) {
      return NextResponse.json({ success: false, message: "登录身份无效" }, { status: 401 })
    }

    const pool = await getDbConnection()
    transaction = new sql.Transaction(pool)
    await transaction.begin()
    const guardResult = await new sql.Request(transaction)
      .input("batchId", sql.NVarChar(100), batchId)
      .query<BatchGuardRow>(`
        SELECT [Id], [Status], [ReportByUserID], [ProjectName], [ContactInfo]
        FROM [dbo].[Repair_Tickets] WITH (UPDLOCK, HOLDLOCK)
        WHERE [BatchId] = @batchId AND [Status] <> 'Deleted';
      `)
    if (!canEditBatchRows(guardResult.recordset, authResult.normalizedRole, userId)) {
      transaction = await rollback(transaction)
      return NextResponse.json(
        { success: false, message: "您无权修改该批次或当前状态不允许删除设备" },
        { status: 403 }
      )
    }
    if (guardResult.recordset.length <= 1) {
      transaction = await rollback(transaction)
      return NextResponse.json(
        { success: false, message: "批次至少需要包含一台设备" },
        { status: 400 }
      )
    }

    const deleteResult = await new sql.Request(transaction)
      .input("deviceId", sql.Int, deviceId)
      .input("batchId", sql.NVarChar(100), batchId)
      .input("deletedStatus", sql.NVarChar(50), TicketStatus.DELETED)
      .query(`
        UPDATE [dbo].[Repair_Tickets]
        SET [Status] = @deletedStatus, [UpdatedAt] = GETUTCDATE()
        WHERE [Id] = @deviceId
          AND [BatchId] = @batchId
          AND [Status] IN ('Created', 'Warehouse_Confirming');
      `)
    if (deleteResult.rowsAffected[0] !== 1) {
      transaction = await rollback(transaction)
      return NextResponse.json(
        { success: false, message: "设备不存在、状态已变化或不属于该批次" },
        { status: 409 }
      )
    }

    await new sql.Request(transaction)
      .input("batchId", sql.NVarChar(100), batchId)
      .input("actionType", sql.NVarChar(50), TicketActionType.BATCH_UPDATED)
      .input("operatorId", sql.Int, userId)
      .input("operatorName", sql.NVarChar(100), authResult.realName || authResult.username)
      .input("description", sql.NVarChar(sql.MAX), `将设备 ${deviceId} 移入回收状态`)
      .query(`
        INSERT INTO [dbo].[Repair_Ticket_History] (
          [BatchId], [ActionType], [OperatorId], [OperatorName], [Description], [CreatedAt]
        ) VALUES (@batchId, @actionType, @operatorId, @operatorName, @description, GETUTCDATE());
      `)
    await transaction.commit()
    transaction = null
    return NextResponse.json({ success: true, message: "设备已删除" })
  } catch (error: unknown) {
    console.error("[Batch Devices API] 删除失败:", error)
    transaction = await rollback(transaction)
    return NextResponse.json({ success: false, message: "删除设备失败" }, { status: 500 })
  }
}
