import { NextResponse } from "next/server"
import * as sql from "mssql"
import { z } from "zod"
import { getDbConnection } from "@/lib/db-config"
import { TicketActionType, TicketStatus, UserRole } from "@/lib/enums"
import { getStorageAdapter } from "@/lib/storage/storage-adapter"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"
import { createUploadStoragePath, validateUploadedFile } from "@/lib/storage/upload-security"

const batchIdSchema = z.string().trim().min(1).max(100)
const deviceConfirmationSchema = z.object({
  id: z.coerce.number().int().positive(),
  willReturn: z.boolean().optional(),
  isCompleted: z.boolean().optional(),
}).strict()
const devicesSchema = z.array(deviceConfirmationSchema).max(500)

interface BatchDeviceRow {
  Id: number
  Status: string
  ReportByUserID: number | null
  RepairCost: number | string | null
  RepairReportContent: string | null
  SignedReportPhoto: string | null
}

function parseExistingContent(raw: string | null): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

/**
 * PUT /api/tickets/reporter-confirm/[batchId]
 * 现场人员确认维修报告，上传签字凭证。
 */
export async function PUT(
  request: Request,
  context: { params: Promise<{ batchId: string }> }
) {
  const authResult = await checkUserRole([UserRole.ADMIN, UserRole.REPORTER])
  if (isErrorResponse(authResult)) return authResult

  let transaction: sql.Transaction | null = null
  let newlyUploadedPath: string | null = null

  try {
    const parsedBatchId = batchIdSchema.safeParse((await context.params).batchId)
    if (!parsedBatchId.success) {
      return NextResponse.json({ success: false, message: "批次ID无效" }, { status: 400 })
    }
    const batchId = parsedBatchId.data
    const operatorId = Number(authResult.userId)
    if (!Number.isSafeInteger(operatorId)) {
      return NextResponse.json({ success: false, message: "登录身份无效" }, { status: 401 })
    }

    const formData = await request.formData()
    const devicesRaw = formData.get("devices")
    const signedPhotoRaw = formData.get("signedPhoto")
    const reuseExistingPhotoRaw = formData.get("reuseExistingPhoto")

    let devices: z.infer<typeof devicesSchema> = []
    if (devicesRaw !== null) {
      if (typeof devicesRaw !== "string") {
        return NextResponse.json({ success: false, message: "设备数据格式不正确" }, { status: 400 })
      }
      let parsedJson: unknown
      try {
        parsedJson = JSON.parse(devicesRaw)
      } catch {
        return NextResponse.json({ success: false, message: "设备数据解析失败" }, { status: 400 })
      }
      const parsedDevices = devicesSchema.safeParse(parsedJson)
      if (!parsedDevices.success) {
        return NextResponse.json({ success: false, message: "设备数据格式不正确" }, { status: 400 })
      }
      devices = parsedDevices.data
    }

    const uniqueDeviceIds = new Set(devices.map((device) => device.id))
    if (uniqueDeviceIds.size !== devices.length) {
      return NextResponse.json({ success: false, message: "设备列表包含重复ID" }, { status: 400 })
    }

    if (signedPhotoRaw !== null && !(signedPhotoRaw instanceof File)) {
      return NextResponse.json({ success: false, message: "签字凭证格式无效" }, { status: 400 })
    }
    if (
      reuseExistingPhotoRaw !== null &&
      (typeof reuseExistingPhotoRaw !== "string" || reuseExistingPhotoRaw !== "true")
    ) {
      return NextResponse.json({ success: false, message: "复用签字凭证参数无效" }, { status: 400 })
    }
    const reuseExistingPhoto = reuseExistingPhotoRaw === "true"
    if (reuseExistingPhoto && signedPhotoRaw instanceof File) {
      return NextResponse.json({ success: false, message: "不能同时上传并复用签字凭证" }, { status: 400 })
    }

    const pool = await getDbConnection()
    const precheck = await pool.request()
      .input("batchId", sql.NVarChar(100), batchId)
      .query<BatchDeviceRow>(`
        SELECT [Id], [Status], [ReportByUserID], [RepairCost], [RepairReportContent], [SignedReportPhoto]
        FROM [dbo].[Repair_Tickets]
        WHERE [BatchId] = @batchId;
      `)
    if (precheck.recordset.length === 0) {
      return NextResponse.json({ success: false, message: "批次工单不存在" }, { status: 404 })
    }
    if (
      authResult.normalizedRole === UserRole.REPORTER &&
      precheck.recordset.some((row) => row.ReportByUserID !== operatorId)
    ) {
      return NextResponse.json({ success: false, message: "您无权确认该批次" }, { status: 403 })
    }
    if (precheck.recordset.some((row) => row.Status !== TicketStatus.PENDING_REPORTER_CONFIRM)) {
      return NextResponse.json(
        { success: false, message: "批次状态已变化，当前无法提交现场确认" },
        { status: 409 }
      )
    }

    const storage = getStorageAdapter()
    let signedPhotoPath: string | null = null
    if (reuseExistingPhoto) {
      const existingPaths = new Set(
        precheck.recordset
          .map((row) => row.SignedReportPhoto)
          .filter((value): value is string => Boolean(value))
      )
      if (existingPaths.size !== 1 || precheck.recordset.some((row) => !row.SignedReportPhoto)) {
        return NextResponse.json(
          { success: false, message: "当前批次没有可复用的一致签字凭证" },
          { status: 409 }
        )
      }
      try {
        signedPhotoPath = storage.getUrl([...existingPaths][0])
      } catch {
        return NextResponse.json(
          { success: false, message: "历史签字凭证路径不安全，无法复用" },
          { status: 409 }
        )
      }
    } else if (signedPhotoRaw instanceof File) {
      const validation = await validateUploadedFile(signedPhotoRaw, "signature")
      if (!validation.success) {
        return NextResponse.json(
          { success: false, message: validation.message },
          { status: 400 }
        )
      }
      const storagePath = createUploadStoragePath(
        "signature",
        authResult.userId,
        validation.extension
      )
      signedPhotoPath = await storage.upload(
        storagePath,
        signedPhotoRaw,
        validation.mimeType
      )
      newlyUploadedPath = signedPhotoPath
    }

    const totalRepairCost = precheck.recordset.reduce(
      (sum, row) => sum + (Number(row.RepairCost) || 0),
      0
    )
    const confirmWithoutPhoto = !signedPhotoPath && devices.length === 0
    if (confirmWithoutPhoto && totalRepairCost > 0) {
      return NextResponse.json(
        { success: false, message: "收费维修必须上传签字凭证" },
        { status: 400 }
      )
    }

    transaction = new sql.Transaction(pool)
    await transaction.begin()

    const lockedResult = await new sql.Request(transaction)
      .input("batchId", sql.NVarChar(100), batchId)
      .query<BatchDeviceRow>(`
        SELECT [Id], [Status], [ReportByUserID], [RepairCost], [RepairReportContent], [SignedReportPhoto]
        FROM [dbo].[Repair_Tickets] WITH (UPDLOCK, HOLDLOCK)
        WHERE [BatchId] = @batchId;
      `)
    const lockedRows = lockedResult.recordset
    const ownershipChanged =
      authResult.normalizedRole === UserRole.REPORTER &&
      lockedRows.some((row) => row.ReportByUserID !== operatorId)
    let reusedPhotoChanged = false
    if (reuseExistingPhoto && signedPhotoPath) {
      try {
        reusedPhotoChanged = lockedRows.some(
          (row) => !row.SignedReportPhoto || storage.getUrl(row.SignedReportPhoto) !== signedPhotoPath
        )
      } catch {
        reusedPhotoChanged = true
      }
    }
    const stateChanged =
      lockedRows.length !== precheck.recordset.length ||
      lockedRows.some((row) => row.Status !== TicketStatus.PENDING_REPORTER_CONFIRM) ||
      reusedPhotoChanged
    if (lockedRows.length === 0 || ownershipChanged || stateChanged) {
      throw new Error("BATCH_CONFLICT")
    }

    const rowById = new Map(lockedRows.map((row) => [row.Id, row]))
    for (const device of devices) {
      const currentRow = rowById.get(device.id)
      if (!currentRow) {
        throw new Error("DEVICE_FORBIDDEN")
      }

      const updatedContent = JSON.stringify({
        ...parseExistingContent(currentRow.RepairReportContent),
        willReturn: device.willReturn ?? true,
        isCompleted: device.isCompleted ?? false,
      })
      const deviceUpdate = await new sql.Request(transaction)
        .input("deviceId", sql.Int, device.id)
        .input("batchId", sql.NVarChar(100), batchId)
        .input("expectedStatus", sql.NVarChar(50), TicketStatus.PENDING_REPORTER_CONFIRM)
        .input("reportContent", sql.NVarChar(sql.MAX), updatedContent)
        .input("signedPhoto", sql.NVarChar(sql.MAX), signedPhotoPath)
        .query(`
          UPDATE [dbo].[Repair_Tickets]
          SET [RepairReportContent] = @reportContent,
              [SignedReportPhoto] = COALESCE(@signedPhoto, [SignedReportPhoto]),
              [UpdatedAt] = GETUTCDATE()
          WHERE [Id] = @deviceId
            AND [BatchId] = @batchId
            AND [Status] = @expectedStatus;
        `)
      if (deviceUpdate.rowsAffected[0] !== 1) {
        throw new Error("DEVICE_CONFLICT")
      }
    }

    const shouldAdvance = Boolean(signedPhotoPath) || confirmWithoutPhoto
    if (shouldAdvance) {
      const statusUpdate = await new sql.Request(transaction)
        .input("batchId", sql.NVarChar(100), batchId)
        .input("expectedStatus", sql.NVarChar(50), TicketStatus.PENDING_REPORTER_CONFIRM)
        .input("newStatus", sql.NVarChar(50), TicketStatus.TECHNICIAN_REPAIRING)
        .input("signedPhoto", sql.NVarChar(sql.MAX), signedPhotoPath)
        .query(`
          UPDATE [dbo].[Repair_Tickets]
          SET [Status] = @newStatus,
              [SignedReportPhoto] = COALESCE(@signedPhoto, [SignedReportPhoto]),
              [ReporterConfirmedAt] = GETUTCDATE(),
              [UpdatedAt] = GETUTCDATE()
          WHERE [BatchId] = @batchId
            AND [Status] = @expectedStatus;
        `)
      if (statusUpdate.rowsAffected[0] !== lockedRows.length) {
        throw new Error("BATCH_CONFLICT")
      }
    }

    const description = shouldAdvance
      ? signedPhotoPath
        ? "现场人员上传签字凭证并确认维修方案"
        : "免费维修批次由现场人员确认维修方案（无签字附件）"
      : "现场人员保存设备确认信息"
    await new sql.Request(transaction)
      .input("batchId", sql.NVarChar(100), batchId)
      .input("actionType", sql.NVarChar(50), TicketActionType.REPORTER_CONFIRMED)
      .input("oldStatus", sql.NVarChar(50), TicketStatus.PENDING_REPORTER_CONFIRM)
      .input("newStatus", sql.NVarChar(50), shouldAdvance ? TicketStatus.TECHNICIAN_REPAIRING : TicketStatus.PENDING_REPORTER_CONFIRM)
      .input("operatorId", sql.Int, operatorId)
      .input("operatorName", sql.NVarChar(100), authResult.realName || authResult.username)
      .input("description", sql.NVarChar(sql.MAX), description)
      .query(`
        INSERT INTO [dbo].[Repair_Ticket_History] (
          [BatchId], [ActionType], [OldStatus], [NewStatus],
          [OperatorId], [OperatorName], [Description], [CreatedAt]
        )
        VALUES (
          @batchId, @actionType, @oldStatus, @newStatus,
          @operatorId, @operatorName, @description, GETUTCDATE()
        );
      `)

    await transaction.commit()
    transaction = null
    newlyUploadedPath = null

    return NextResponse.json({
      success: true,
      message: shouldAdvance
        ? "现场确认成功，工单已进入维修作业阶段"
        : "确认信息已保存",
    })
  } catch (error: unknown) {
    console.error("[Reporter Confirm API] 更新失败:", error)
    if (transaction) {
      try {
        await transaction.rollback()
      } catch (rollbackError) {
        console.error("[Reporter Confirm API] 事务回滚失败:", rollbackError)
      } finally {
        transaction = null
      }
    }
    if (newlyUploadedPath) {
      try {
        await getStorageAdapter().delete(newlyUploadedPath)
      } catch (cleanupError) {
        console.error("[Reporter Confirm API] 清理失败上传文件失败:", cleanupError)
      }
    }
    const errorCode = error instanceof Error ? error.message : ""
    const message = errorCode === "DEVICE_FORBIDDEN"
      ? "设备不属于当前批次"
      : ["DEVICE_CONFLICT", "BATCH_CONFLICT"].includes(errorCode)
        ? "批次状态已变化，请刷新后重试"
        : "现场确认失败，请稍后重试"
    const status = errorCode === "DEVICE_FORBIDDEN"
      ? 403
      : ["DEVICE_CONFLICT", "BATCH_CONFLICT"].includes(errorCode)
        ? 409
        : 500
    return NextResponse.json({ success: false, message }, { status })
  }
}
