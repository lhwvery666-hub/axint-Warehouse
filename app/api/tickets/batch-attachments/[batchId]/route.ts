import { NextResponse } from "next/server"
import * as sql from "mssql"
import { z } from "zod"
import { getDbConnection } from "@/lib/db-config"
import { ALL_USER_ROLES, checkUserRole, isErrorResponse, type AuthenticatedUser } from "@/lib/auth-utils"
import { UserRole } from "@/lib/enums"

const batchIdSchema = z.string().trim().min(1).max(100)
const attachmentSchema = z.object({
  fileName: z.string().trim().min(1).max(255).optional(),
  originalName: z.string().trim().min(1).max(255),
  filePath: z.string().trim().min(1).max(2048),
  mimeType: z.enum(["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"]),
  fileSize: z.number().int().positive().max(10 * 1024 * 1024),
}).strict()

interface BatchOwnerRow {
  ReportByUserID: number | null
}

function isSafeAttachmentPath(filePath: string): boolean {
  if (filePath.includes("\0") || filePath.includes("\\") || filePath.includes("..")) return false
  if (!/\.(?:jpe?g|png|webp|pdf)$/i.test(filePath)) return false
  if (filePath.startsWith("/uploads/")) return true
  if (process.env.STORAGE_MODE?.toLowerCase() !== "s3" || !process.env.S3_ENDPOINT) return false
  try {
    const candidate = new URL(filePath)
    const endpoint = new URL(process.env.S3_ENDPOINT)
    return candidate.protocol === "https:" && candidate.origin === endpoint.origin
  } catch {
    return false
  }
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

  try {
    const parsedBatchId = batchIdSchema.safeParse((await context.params).batchId)
    const parsedBody = attachmentSchema.safeParse(await request.json().catch(() => null))
    if (!parsedBatchId.success || !parsedBody.success || !isSafeAttachmentPath(parsedBody.data.filePath)) {
      return NextResponse.json({ success: false, message: "附件参数无效" }, { status: 400 })
    }
    const batchId = parsedBatchId.data
    const userId = Number(authResult.userId)
    if (!Number.isSafeInteger(userId)) {
      return NextResponse.json({ success: false, message: "登录身份无效" }, { status: 401 })
    }
    const pool = await getDbConnection()
    const access = await verifyBatchAccess(pool.request(), batchId, authResult)
    if (access !== "allowed") return accessError(access)

    const body = parsedBody.data
    const result = await pool.request()
      .input("batchId", sql.NVarChar(100), batchId)
      .input("fileName", sql.NVarChar(255), body.fileName || body.originalName)
      .input("originalName", sql.NVarChar(255), body.originalName)
      .input("filePath", sql.NVarChar(1000), body.filePath)
      .input("mimeType", sql.NVarChar(100), body.mimeType)
      .input("fileSize", sql.BigInt, body.fileSize)
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
    return NextResponse.json({ success: true, data: { id: result.recordset[0]?.Id } })
  } catch (error: unknown) {
    console.error("[Batch Attachments API] 创建失败:", error)
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
    const attachmentId = z.coerce.number().int().positive().safeParse(new URL(request.url).searchParams.get("id"))
    if (!parsedBatchId.success || !attachmentId.success) {
      return NextResponse.json({ success: false, message: "批次ID或附件ID无效" }, { status: 400 })
    }
    const batchId = parsedBatchId.data
    const userId = Number(authResult.userId)
    if (!Number.isSafeInteger(userId)) {
      return NextResponse.json({ success: false, message: "登录身份无效" }, { status: 401 })
    }

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
    const deleteResult = await new sql.Request(transaction)
      .input("attachmentId", sql.Int, attachmentId.data)
      .input("batchId", sql.NVarChar(100), batchId)
      .input("userId", sql.Int, userId)
      .query(`
        DELETE FROM [dbo].[Batch_Stamp_Attachments]
        WHERE [Id] = @attachmentId
          AND [BatchId] = @batchId
          ${ownerPredicate};
      `)
    if (deleteResult.rowsAffected[0] !== 1) {
      await transaction.rollback()
      transaction = null
      return NextResponse.json({ success: false, message: "附件不存在或无权删除" }, { status: 404 })
    }
    await transaction.commit()
    transaction = null
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("[Batch Attachments API] 删除失败:", error)
    if (transaction) {
      try { await transaction.rollback() } catch (rollbackError) {
        console.error("[Batch Attachments API] 事务回滚失败:", rollbackError)
      } finally { transaction = null }
    }
    return NextResponse.json({ success: false, message: "删除附件失败" }, { status: 500 })
  }
}
