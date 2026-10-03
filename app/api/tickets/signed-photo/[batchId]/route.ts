import { NextResponse } from "next/server"
import * as sql from "mssql"
import { z } from "zod"
import { getDbConnection } from "@/lib/db-config"
import { UserRole } from "@/lib/enums"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"

const batchIdSchema = z.string().trim().min(1).max(100)
/** 记录维修人员查看签字照片；报告在凭证保存时即已锁定。 */
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

/** Signed evidence is immutable. Legacy withdrawal/replacement paths are retired. */
export async function DELETE() {
  const authResult = await checkUserRole([UserRole.ADMIN, UserRole.REPORTER])
  if (isErrorResponse(authResult)) return authResult
  return NextResponse.json({ success: false, message: "签字凭证保存后不可删除或撤回，已签报告保持锁定" }, { status: 410 })
}
export async function PUT() {
  const authResult = await checkUserRole([UserRole.ADMIN, UserRole.REPORTER])
  if (isErrorResponse(authResult)) return authResult
  return NextResponse.json({ success: false, message: "签字后的报告和凭证不可替换或修改" }, { status: 410 })
}
