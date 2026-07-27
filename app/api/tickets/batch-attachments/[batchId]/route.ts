import { NextResponse } from "next/server"
import { getDbConnection } from "@/lib/db-config"
import { cookies } from "next/headers"

async function ensureTable(pool: Awaited<ReturnType<typeof getDbConnection>>) {
  await pool.request().query(`
    IF NOT EXISTS (
      SELECT * FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME = 'Batch_Stamp_Attachments'
    )
    CREATE TABLE Batch_Stamp_Attachments (
      Id             INT IDENTITY(1,1) PRIMARY KEY,
      BatchId        NVARCHAR(100)  NOT NULL,
      FileName       NVARCHAR(255)  NOT NULL,
      OriginalName   NVARCHAR(255)  NOT NULL,
      FilePath       NVARCHAR(1000) NOT NULL,
      MimeType       NVARCHAR(100)  NOT NULL DEFAULT 'application/octet-stream',
      FileSize       BIGINT         NOT NULL DEFAULT 0,
      UploadedById   INT,
      UploadedByName NVARCHAR(100),
      UploadedByRole NVARCHAR(50),
      CreatedAt      DATETIME       NOT NULL DEFAULT GETUTCDATE()
    )
  `)
}

async function getCurrentUser() {
  const cookieStore = await cookies()
  const userCookie = cookieStore.get("user")
  if (!userCookie?.value) return null
  try { return JSON.parse(userCookie.value) } catch { return null }
}

// GET /api/tickets/batch-attachments/[batchId]
export async function GET(
  _request: Request,
  context: { params: Promise<{ batchId: string }> | { batchId: string } }
) {
  const cookieStore = await cookies()
  if (!cookieStore.get("session")) {
    return NextResponse.json({ success: false, message: "未登录" }, { status: 401 })
  }
  const { batchId } = await Promise.resolve(context.params)
  const pool = await getDbConnection()
  await ensureTable(pool)
  const result = await pool.request().input("batchId", batchId).query(`
    SELECT Id, BatchId, FileName, OriginalName, FilePath, MimeType, FileSize,
           UploadedById, UploadedByName, UploadedByRole, CreatedAt
    FROM Batch_Stamp_Attachments
    WHERE BatchId = @batchId
    ORDER BY CreatedAt DESC
  `)
  return NextResponse.json({
    success: true,
    data: result.recordset.map((r: Record<string, unknown>) => ({
      id: r.Id,
      batchId: r.BatchId,
      fileName: r.FileName,
      originalName: r.OriginalName,
      filePath: r.FilePath,
      mimeType: r.MimeType,
      fileSize: r.FileSize,
      uploadedById: r.UploadedById,
      uploadedByName: r.UploadedByName,
      uploadedByRole: r.UploadedByRole,
      createdAt: r.CreatedAt,
    })),
  })
}

// POST /api/tickets/batch-attachments/[batchId]
export async function POST(
  request: Request,
  context: { params: Promise<{ batchId: string }> | { batchId: string } }
) {
  const cookieStore = await cookies()
  if (!cookieStore.get("session")) {
    return NextResponse.json({ success: false, message: "未登录" }, { status: 401 })
  }
  const user = await getCurrentUser()
  const { batchId } = await Promise.resolve(context.params)
  const body = await request.json()
  const { fileName, originalName, filePath, mimeType, fileSize } = body
  if (!filePath || !originalName) {
    return NextResponse.json({ success: false, message: "缺少必要字段" }, { status: 400 })
  }
  const pool = await getDbConnection()
  await ensureTable(pool)
  const result = await pool.request()
    .input("batchId", batchId)
    .input("fileName", fileName || originalName)
    .input("originalName", originalName)
    .input("filePath", filePath)
    .input("mimeType", mimeType || "application/octet-stream")
    .input("fileSize", fileSize || 0)
    .input("uploadedById", user?.id ?? null)
    .input("uploadedByName", user?.realName || user?.username || null)
    .input("uploadedByRole", user?.role || null)
    .query(`
      INSERT INTO Batch_Stamp_Attachments
        (BatchId, FileName, OriginalName, FilePath, MimeType, FileSize, UploadedById, UploadedByName, UploadedByRole)
      VALUES
        (@batchId, @fileName, @originalName, @filePath, @mimeType, @fileSize, @uploadedById, @uploadedByName, @uploadedByRole);
      SELECT SCOPE_IDENTITY() AS Id
    `)
  return NextResponse.json({ success: true, data: { id: result.recordset[0]?.Id } })
}

// DELETE /api/tickets/batch-attachments/[batchId]?id=xxx
export async function DELETE(
  request: Request,
  context: { params: Promise<{ batchId: string }> | { batchId: string } }
) {
  const cookieStore = await cookies()
  if (!cookieStore.get("session")) {
    return NextResponse.json({ success: false, message: "未登录" }, { status: 401 })
  }
  const user = await getCurrentUser()
  const { batchId } = await Promise.resolve(context.params)
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ success: false, message: "缺少附件ID" }, { status: 400 })
  const pool = await getDbConnection()
  await ensureTable(pool)
  // 只有上传者或管理员可以删除
  const check = await pool.request().input("id", Number(id)).input("batchId", batchId)
    .query(`SELECT UploadedById FROM Batch_Stamp_Attachments WHERE Id=@id AND BatchId=@batchId`)
  if (check.recordset.length === 0) {
    return NextResponse.json({ success: false, message: "附件不存在" }, { status: 404 })
  }
  const ownerId = check.recordset[0].UploadedById
  if (user?.role !== "admin" && String(ownerId) !== String(user?.id)) {
    return NextResponse.json({ success: false, message: "无权删除" }, { status: 403 })
  }
  await pool.request().input("id", Number(id)).query(`DELETE FROM Batch_Stamp_Attachments WHERE Id=@id`)
  return NextResponse.json({ success: true })
}
