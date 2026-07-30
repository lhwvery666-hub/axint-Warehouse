import { NextResponse } from "next/server"
import * as sql from "mssql"
import { z } from "zod"
import { getDbConnection } from "@/lib/db-config"
import {
  ALL_USER_ROLES,
  checkUserRole,
  isErrorResponse,
  type AuthenticatedUser,
} from "@/lib/auth-utils"
import { UserRole } from "@/lib/enums"
import { getStorageAdapter } from "@/lib/storage/storage-adapter"
import { createUploadStoragePath, validateUploadedFile } from "@/lib/storage/upload-security"

const batchIdSchema = z.string().trim().min(1).max(100)
const attachmentIdSchema = z.coerce.number().int().positive()

interface BatchOwnerRow {
  ReportByUserID: number | null
}

interface AttachmentRow {
  Id: number
  FilePath: string
}

async function verifyBatchAccess(
  request: sql.Request,
  batchId: string,
  user: AuthenticatedUser
): Promise<"allowed" | "not_found" | "forbidden"> {
  const result = await request
    .input("accessBatchId", sql.NVarChar(100), batchId)
    .query<BatchOwnerRow>(`
      SELECT [ReportByUserID]
      FROM [dbo].[Repair_Tickets]
      WHERE [BatchId] = @accessBatchId;
    `)
  if (result.recordset.length === 0) return "not_found"
  if (user.normalizedRole !== UserRole.REPORTER) return "allowed"
  const userId = Number(user.userId)
  return Number.isSafeInteger(userId) && result.recordset.every((row) => row.ReportByUserID === userId)
    ? "allowed"
    : "forbidden"
}

function accessError(access: "not_found" | "forbidden") {
  return access === "not_found"
    ? NextResponse.json({ success: false, message: "批次不存在" }, { status: 404 })
    : NextResponse.json({ success: false, message: "您无权访问该批次附件" }, { status: 403 })
}

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
    const pool = await getDbConnection()
    const access = await verifyBatchAccess(pool.request(), batchId, authResult)
    if (access !== "allowed") return accessError(access)

    const result = await pool.request()
      .input("batchId", sql.NVarChar(100), batchId)
      .query(`
        SELECT [Id], [BatchId], [FileName], [OriginalName], [FilePath], [MimeType],
               [FileSize], [UploadedById], [UploadedByName], [UploadedByRole], [CreatedAt]
        FROM [dbo].[Batch_Stamp_Attachments]
        WHERE [BatchId] = @batchId
        ORDER BY [CreatedAt] DESC;
      `)
    return NextResponse.json({
      success: true,
      message: "附件查询成功",
      data: result.recordset.map((row: Record<string, unknown>) => ({
        id: row.Id,
        batchId: row.BatchId,
        fileName: row.FileName,
        originalName: row.OriginalName,
        filePath: row.FilePath,
        mimeType: row.MimeType,
        fileSize: row.FileSize,
        uploadedById: row.UploadedById,
        uploadedByName: row.UploadedByName,
        uploadedByRole: row.UploadedByRole,
        createdAt: row.CreatedAt,
      })),
    })
  } catch (error: unknown) {
    console.error("[Batch Attachments API] 查询失败:", error)
    return NextResponse.json({ success: false, message: "查询附件失败" }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ batchId: string }> }
) {
  const authResult = await checkUserRole(ALL_USER_ROLES)
  if (isErrorResponse(authResult)) return authResult

  let transaction: sql.Transaction | null = null
  let newlyUploadedPath: string | null = null
  try {
    const parsedBatchId = batchIdSchema.safeParse((await context.params).batchId)
    if (!parsedBatchId.success) {
      return NextResponse.json({ success: false, message: "批次ID无效" }, { status: 400 })
    }
    const userId = Number(authResult.userId)
    if (!Number.isSafeInteger(userId)) {
      return NextResponse.json({ success: false, message: "登录身份无效" }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, message: "请选择附件" }, { status: 400 })
    }
    const validation = await validateUploadedFile(file, "stamp_attachment")
    if (!validation.success) {
      return NextResponse.json({ success: false, message: validation.message }, { status: 400 })
    }

    const batchId = parsedBatchId.data
    const pool = await getDbConnection()
    transaction = new sql.Transaction(pool)
    await transaction.begin()
    const access = await verifyBatchAccess(new sql.Request(transaction), batchId, authResult)
    if (access !== "allowed") {
      await transaction.rollback()
      transaction = null
      return accessError(access)
    }

    const storagePath = createUploadStoragePath(
      "stamp_attachment",
      authResult.userId,
      validation.extension
    )
    const storage = getStorageAdapter()
    newlyUploadedPath = await storage.upload(storagePath, file, validation.mimeType)
    const fileName = storagePath.split("/").pop() || "attachment"

    const result = await new sql.Request(transaction)
      .input("batchId", sql.NVarChar(100), batchId)
      .input("fileName", sql.NVarChar(255), fileName)
      .input("originalName", sql.NVarChar(255), validation.originalName)
      .input("filePath", sql.NVarChar(1000), newlyUploadedPath)
      .input("mimeType", sql.NVarChar(100), validation.mimeType)
      .input("fileSize", sql.BigInt, file.size)
      .input("uploadedById", sql.Int, userId)
      .input("uploadedByName", sql.NVarChar(100), authResult.realName || authResult.username)
      .input("uploadedByRole", sql.NVarChar(50), authResult.userRole)
      .query<{ Id: number }>(`
        INSERT INTO [dbo].[Batch_Stamp_Attachments] (
          [BatchId], [FileName], [OriginalName], [FilePath], [MimeType], [FileSize],
          [UploadedById], [UploadedByName], [UploadedByRole]
        )
        OUTPUT inserted.[Id]
        VALUES (
          @batchId, @fileName, @originalName, @filePath, @mimeType, @fileSize,
          @uploadedById, @uploadedByName, @uploadedByRole
        );
      `)
    await transaction.commit()
    transaction = null
    newlyUploadedPath = null

    return NextResponse.json({
      success: true,
      message: "附件上传成功",
      data: { id: result.recordset[0]?.Id },
    })
  } catch (error: unknown) {
    console.error("[Batch Attachments API] 创建失败:", error)
    if (transaction) {
      try {
        await transaction.rollback()
      } catch (rollbackError) {
        console.error("[Batch Attachments API] 事务回滚失败:", rollbackError)
      } finally {
        transaction = null
      }
    }
    if (newlyUploadedPath) {
      try {
        await getStorageAdapter().delete(newlyUploadedPath)
      } catch (cleanupError) {
        console.error("[Batch Attachments API] 清理失败上传文件失败:", cleanupError)
      }
    }
    return NextResponse.json({ success: false, message: "保存附件失败" }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ batchId: string }> }
) {
  const authResult = await checkUserRole(ALL_USER_ROLES)
  if (isErrorResponse(authResult)) return authResult

  let transaction: sql.Transaction | null = null
  try {
    const parsedBatchId = batchIdSchema.safeParse((await context.params).batchId)
    const parsedAttachmentId = attachmentIdSchema.safeParse(
      new URL(request.url).searchParams.get("id")
    )
    if (!parsedBatchId.success || !parsedAttachmentId.success) {
      return NextResponse.json({ success: false, message: "批次ID或附件ID无效" }, { status: 400 })
    }
    const userId = Number(authResult.userId)
    if (!Number.isSafeInteger(userId)) {
      return NextResponse.json({ success: false, message: "登录身份无效" }, { status: 401 })
    }

    const batchId = parsedBatchId.data
    const pool = await getDbConnection()
    transaction = new sql.Transaction(pool)
    await transaction.begin()
    const access = await verifyBatchAccess(new sql.Request(transaction), batchId, authResult)
    if (access !== "allowed") {
      await transaction.rollback()
      transaction = null
      return accessError(access)
    }

    const ownerPredicate = authResult.normalizedRole === UserRole.ADMIN
      ? ""
      : "AND [UploadedById] = @userId"
    const attachmentResult = await new sql.Request(transaction)
      .input("attachmentId", sql.Int, parsedAttachmentId.data)
      .input("batchId", sql.NVarChar(100), batchId)
      .input("userId", sql.Int, userId)
      .query<AttachmentRow>(`
        SELECT [Id], [FilePath]
        FROM [dbo].[Batch_Stamp_Attachments] WITH (UPDLOCK, HOLDLOCK)
        WHERE [Id] = @attachmentId
          AND [BatchId] = @batchId
          ${ownerPredicate};
      `)
    const attachment = attachmentResult.recordset[0]
    if (!attachment) {
      await transaction.rollback()
      transaction = null
      return NextResponse.json(
        { success: false, message: "附件不存在或无权删除" },
        { status: 404 }
      )
    }

    const deleteResult = await new sql.Request(transaction)
      .input("attachmentId", sql.Int, parsedAttachmentId.data)
      .input("batchId", sql.NVarChar(100), batchId)
      .query(`
        DELETE FROM [dbo].[Batch_Stamp_Attachments]
        WHERE [Id] = @attachmentId AND [BatchId] = @batchId;
      `)
    if (deleteResult.rowsAffected[0] !== 1) {
      throw new Error("ATTACHMENT_CONFLICT")
    }

    await getStorageAdapter().delete(attachment.FilePath)
    await transaction.commit()
    transaction = null
    return NextResponse.json({ success: true, message: "附件已删除" })
  } catch (error: unknown) {
    console.error("[Batch Attachments API] 删除失败:", error)
    if (transaction) {
      try {
        await transaction.rollback()
      } catch (rollbackError) {
        console.error("[Batch Attachments API] 事务回滚失败:", rollbackError)
      } finally {
        transaction = null
      }
    }
    const conflict = error instanceof Error && error.message === "ATTACHMENT_CONFLICT"
    return NextResponse.json(
      { success: false, message: conflict ? "附件状态已变化，请刷新后重试" : "删除附件失败" },
      { status: conflict ? 409 : 500 }
    )
  }
}
