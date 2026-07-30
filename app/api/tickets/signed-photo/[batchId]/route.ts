import { NextResponse } from "next/server"
import * as sql from "mssql"
import { z } from "zod"
import { getDbConnection } from "@/lib/db-config"
import { TicketActionType, TicketStatus, UserRole } from "@/lib/enums"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"
import { getStorageAdapter } from "@/lib/storage/storage-adapter"

const batchIdSchema = z.string().trim().min(1).max(100)
const modifyRequestSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
}).strict()

interface SignedPhotoRow {
  Id: number
  Status: string
  ReportByUserID: number | null
  SignedReportPhoto: string | null
  SignedPhotoViewedBy: string | null
}

/** 记录维修人员查看签字照片并锁定修改。 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ batchId: string }> }
) {
  const authResult = await checkUserRole([UserRole.TECHNICIAN])
  if (isErrorResponse(authResult)) return authResult

  try {
    const parsedBatchId = batchIdSchema.safeParse((await context.params).batchId)
    if (!parsedBatchId.success) {
      return NextResponse.json({ success: false, message: "批次ID无效" }, { status: 400 })
    }
    const operatorId = Number(authResult.userId)
    if (!Number.isSafeInteger(operatorId)) {
      return NextResponse.json({ success: false, message: "登录身份无效" }, { status: 401 })
    }

    const viewedAt = new Date()
    const pool = await getDbConnection()
    const result = await pool.request()
      .input("batchId", sql.NVarChar(100), parsedBatchId.data)
      .input("viewedBy", sql.NVarChar(100), String(operatorId))
      .query(`
        UPDATE [dbo].[Repair_Tickets]
        SET [SignedPhotoViewedBy] = @viewedBy,
            [SignedPhotoViewedAt] = SYSUTCDATETIME(),
            [UpdatedAt] = SYSUTCDATETIME()
        WHERE [BatchId] = @batchId
          AND [SignedReportPhoto] IS NOT NULL;
      `)
    if (result.rowsAffected[0] === 0) {
      return NextResponse.json(
        { success: false, message: "批次不存在或尚未上传签字照片" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "查看记录已保存",
      data: { viewedBy: String(operatorId), viewedAt: viewedAt.toISOString() },
    })
  } catch (error: unknown) {
    console.error("[Signed Photo API] 记录查看失败:", error)
    return NextResponse.json({ success: false, message: "记录查看失败" }, { status: 500 })
  }
}

/** 删除数据库记录关联的真实签字文件，并将批次回退到现场确认。 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ batchId: string }> }
) {
  const authResult = await checkUserRole([UserRole.ADMIN, UserRole.REPORTER])
  if (isErrorResponse(authResult)) return authResult

  let transaction: sql.Transaction | null = null
  try {
    const parsedBatchId = batchIdSchema.safeParse((await context.params).batchId)
    if (!parsedBatchId.success) {
      return NextResponse.json({ success: false, message: "批次ID无效" }, { status: 400 })
    }
    const operatorId = Number(authResult.userId)
    if (!Number.isSafeInteger(operatorId)) {
      return NextResponse.json({ success: false, message: "登录身份无效" }, { status: 401 })
    }

    const batchId = parsedBatchId.data
    const pool = await getDbConnection()
    transaction = new sql.Transaction(pool)
    await transaction.begin()

    const ticketResult = await new sql.Request(transaction)
      .input("batchId", sql.NVarChar(100), batchId)
      .query<SignedPhotoRow>(`
        SELECT [Id], [Status], [ReportByUserID], [SignedReportPhoto], [SignedPhotoViewedBy]
        FROM [dbo].[Repair_Tickets] WITH (UPDLOCK, HOLDLOCK)
        WHERE [BatchId] = @batchId;
      `)
    const rows = ticketResult.recordset
    if (rows.length === 0) {
      await transaction.rollback()
      transaction = null
      return NextResponse.json({ success: false, message: "批次不存在" }, { status: 404 })
    }
    if (
      authResult.normalizedRole === UserRole.REPORTER &&
      rows.some((row) => row.ReportByUserID !== operatorId)
    ) {
      await transaction.rollback()
      transaction = null
      return NextResponse.json({ success: false, message: "您无权删除该批次照片" }, { status: 403 })
    }
    if (rows.some((row) => row.SignedPhotoViewedBy)) {
      await transaction.rollback()
      transaction = null
      return NextResponse.json(
        { success: false, message: "签字照片已被维修人员查看，无法删除；如需修改请先申请" },
        { status: 403 }
      )
    }

    const statuses = new Set(rows.map((row) => row.Status))
    const paths = new Set(
      rows.map((row) => row.SignedReportPhoto).filter((value): value is string => Boolean(value))
    )
    if (
      statuses.size !== 1 ||
      ![TicketStatus.PENDING_REPORTER_CONFIRM, TicketStatus.TECHNICIAN_REPAIRING].includes(
        rows[0].Status as TicketStatus
      )
    ) {
      await transaction.rollback()
      transaction = null
      return NextResponse.json(
        { success: false, message: "当前批次状态不允许删除签字照片" },
        { status: 409 }
      )
    }
    if (paths.size !== 1 || rows.some((row) => !row.SignedReportPhoto)) {
      await transaction.rollback()
      transaction = null
      return NextResponse.json(
        { success: false, message: "批次签字照片记录不一致，请联系管理员处理" },
        { status: 409 }
      )
    }

    const photoPath = [...paths][0]
    const oldStatus = rows[0].Status
    const updateResult = await new sql.Request(transaction)
      .input("batchId", sql.NVarChar(100), batchId)
      .input("photoPath", sql.NVarChar(sql.MAX), photoPath)
      .input("pendingStatus", sql.NVarChar(50), TicketStatus.PENDING_REPORTER_CONFIRM)
      .query(`
        UPDATE [dbo].[Repair_Tickets]
        SET [SignedReportPhoto] = NULL,
            [SignedPhotoViewedBy] = NULL,
            [SignedPhotoViewedAt] = NULL,
            [Status] = @pendingStatus,
            [UpdatedAt] = SYSUTCDATETIME()
        WHERE [BatchId] = @batchId
          AND [SignedReportPhoto] = @photoPath
          AND [SignedPhotoViewedBy] IS NULL;
      `)
    if (updateResult.rowsAffected[0] !== rows.length) {
      throw new Error("SIGNED_PHOTO_CONFLICT")
    }

    await new sql.Request(transaction)
      .input("batchId", sql.NVarChar(100), batchId)
      .input("actionType", sql.NVarChar(50), TicketActionType.STATUS_CHANGE)
      .input("oldStatus", sql.NVarChar(50), oldStatus)
      .input("newStatus", sql.NVarChar(50), TicketStatus.PENDING_REPORTER_CONFIRM)
      .input("operatorId", sql.Int, operatorId)
      .input("operatorName", sql.NVarChar(100), authResult.realName || authResult.username)
      .input("description", sql.NVarChar(sql.MAX), "删除未查看的签字照片，批次回退至现场确认")
      .query(`
        INSERT INTO [dbo].[Repair_Ticket_History] (
          [BatchId], [ActionType], [OldStatus], [NewStatus],
          [OperatorId], [OperatorName], [Description], [CreatedAt]
        )
        VALUES (
          @batchId, @actionType, @oldStatus, @newStatus,
          @operatorId, @operatorName, @description, SYSUTCDATETIME()
        );
      `)

    try {
      await getStorageAdapter().delete(photoPath)
    } catch (storageError) {
      console.error("[Signed Photo API] 物理文件删除失败:", storageError)
      throw new Error("SIGNED_PHOTO_STORAGE_DELETE_FAILED")
    }

    await transaction.commit()
    transaction = null
    return NextResponse.json({ success: true, message: "签字照片已删除" })
  } catch (error: unknown) {
    console.error("[Signed Photo API] 删除失败:", error)
    if (transaction) {
      try {
        await transaction.rollback()
      } catch (rollbackError) {
        console.error("[Signed Photo API] 事务回滚失败:", rollbackError)
      } finally {
        transaction = null
      }
    }
    const code = error instanceof Error ? error.message : ""
    const conflict = code === "SIGNED_PHOTO_CONFLICT"
    const storageFailure = code === "SIGNED_PHOTO_STORAGE_DELETE_FAILED"
    return NextResponse.json(
      {
        success: false,
        message: conflict
          ? "签字照片状态已变化，请刷新后重试"
          : storageFailure
            ? "物理文件删除失败，数据库记录已回滚"
            : "删除签字照片失败",
      },
      { status: conflict ? 409 : 500 }
    )
  }
}

/** 现场人员申请修改已被查看的签字照片。 */
export async function PUT(
  request: Request,
  context: { params: Promise<{ batchId: string }> }
) {
  const authResult = await checkUserRole([UserRole.ADMIN, UserRole.REPORTER])
  if (isErrorResponse(authResult)) return authResult

  try {
    const parsedBatchId = batchIdSchema.safeParse((await context.params).batchId)
    const parsedBody = modifyRequestSchema.safeParse(await request.json().catch(() => null))
    if (!parsedBatchId.success || !parsedBody.success) {
      return NextResponse.json({ success: false, message: "批次ID或修改原因无效" }, { status: 400 })
    }
    const operatorId = Number(authResult.userId)
    if (!Number.isSafeInteger(operatorId)) {
      return NextResponse.json({ success: false, message: "登录身份无效" }, { status: 401 })
    }

    const modifyRequest = JSON.stringify({
      requestBy: String(operatorId),
      requestByName: authResult.realName || authResult.username,
      reason: parsedBody.data.reason,
      requestAt: new Date().toISOString(),
      status: "pending",
    })
    const reporterPredicate = authResult.normalizedRole === UserRole.REPORTER
      ? "AND [ReportByUserID] = @operatorId"
      : ""
    const pool = await getDbConnection()
    const result = await pool.request()
      .input("batchId", sql.NVarChar(100), parsedBatchId.data)
      .input("operatorId", sql.Int, operatorId)
      .input("modifyRequest", sql.NVarChar(sql.MAX), modifyRequest)
      .query(`
        UPDATE [dbo].[Repair_Tickets]
        SET [SignedPhotoModifyRequest] = @modifyRequest,
            [UpdatedAt] = SYSUTCDATETIME()
        WHERE [BatchId] = @batchId
          AND [SignedReportPhoto] IS NOT NULL
          AND [SignedPhotoViewedBy] IS NOT NULL
          ${reporterPredicate};
      `)
    if (result.rowsAffected[0] === 0) {
      return NextResponse.json(
        { success: false, message: "批次不存在、没有签字照片或您无权操作" },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, message: "修改申请已提交，等待管理员审批" })
  } catch (error: unknown) {
    console.error("[Signed Photo API] 提交修改申请失败:", error)
    return NextResponse.json({ success: false, message: "提交修改申请失败" }, { status: 500 })
  }
}
