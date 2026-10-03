import { isSignedRepairReport } from "@/lib/repair-report-policy"
import { NextResponse } from "next/server"
import * as sql from "mssql"
import { z } from "zod"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"
import { getDbConnection } from "@/lib/db-config"
import { TicketActionType, TicketStatus, UserRole, normalizeTicketStatus } from "@/lib/enums"

const batchIdSchema = z.string().trim().min(1).max(100)
const batchInfoSchema = z.object({
  projectName: z.string().trim().max(500).optional(),
  contactInfo: z.string().trim().max(200).optional(),
  projectLocation: z.string().trim().max(200).optional(),
  senderAddress: z.string().trim().max(500).optional(),
}).strict()

interface BatchInfoRow {
  SignedReportPhoto: string | null
  ReporterConfirmedAt: Date | null
  Id: number
  Status: string
  ReportByUserID: number
  ProjectName: string | null
  ContactInfo: string | null
  ProjectLocation: string | null
  SenderAddress: string | null
}

function normalizeValue(value: string | null | undefined): string {
  return value?.trim() || ""
}

async function rollback(transaction: sql.Transaction | null): Promise<null> {
  if (!transaction) return null
  try {
    await transaction.rollback()
  } catch (error: unknown) {
    console.error("[Batch Info API] 回滚事务失败:", error)
  }
  return null
}

// PUT /api/tickets/batch-info/[batchId]
// 现场人员只可在仓库确认前直接编辑；后续阶段必须走“修改申请”。
export async function PUT(
  request: Request,
  context: { params: Promise<{ batchId: string }> }
) {
  const authResult = await checkUserRole([UserRole.ADMIN, UserRole.REPORTER])
  if (isErrorResponse(authResult)) return authResult

  let transaction: sql.Transaction | null = null
  try {
    const parsedBatchId = batchIdSchema.safeParse((await context.params).batchId)
    const parsedBody = batchInfoSchema.safeParse(await request.json().catch(() => null))
    if (!parsedBatchId.success || !parsedBody.success) {
      return NextResponse.json({ success: false, message: "请求参数无效" }, { status: 400 })
    }
    if (Object.keys(parsedBody.data).length === 0) {
      return NextResponse.json({ success: false, message: "没有需要更新的字段" }, { status: 400 })
    }

    const operatorId = Number(authResult.userId)
    if (!Number.isSafeInteger(operatorId)) {
      return NextResponse.json({ success: false, message: "登录身份无效" }, { status: 401 })
    }

    const batchId = parsedBatchId.data
    const pool = await getDbConnection()
    transaction = new sql.Transaction(pool)
    await transaction.begin()

    const batchResult = await new sql.Request(transaction)
      .input("batchId", sql.NVarChar(100), batchId)
      .query<BatchInfoRow>(`
        SELECT [Id], [Status], [ReportByUserID], [ProjectName], [ContactInfo],
               [ProjectLocation], [SenderAddress], [SignedReportPhoto], [ReporterConfirmedAt]
        FROM [dbo].[Repair_Tickets] WITH (UPDLOCK, HOLDLOCK)
        WHERE [BatchId] = @batchId AND [Status] <> 'Deleted';
      `)

    const rows = batchResult.recordset
    if (rows.length === 0) {
      transaction = await rollback(transaction)
      return NextResponse.json({ success: false, message: "批次不存在" }, { status: 404 })
    }

    if (authResult.normalizedRole === UserRole.REPORTER) {
      if (rows.some((row) => Number(row.ReportByUserID) !== operatorId)) {
        transaction = await rollback(transaction)
        return NextResponse.json({ success: false, message: "无权修改该批次" }, { status: 403 })
      }
      const mayEditDirectly = rows.every((row) => {
        const status = normalizeTicketStatus(row.Status) || row.Status
        return status === TicketStatus.CREATED || status === TicketStatus.WAREHOUSE_CONFIRMING
      })
      if (!mayEditDirectly) {
        transaction = await rollback(transaction)
        return NextResponse.json(
          { success: false, message: "仓库确认后的工单不能直接修改，请提交修改申请" },
          { status: 409 }
        )
      }
    } else if (rows.some((row) => [TicketStatus.COMPLETED, TicketStatus.CANCELLED, TicketStatus.DELETED]
      .includes((normalizeTicketStatus(row.Status) || row.Status) as TicketStatus))) {
      transaction = await rollback(transaction)
      return NextResponse.json({ success: false, message: "已结束工单不能直接修改" }, { status: 409 })
    }

    const first = rows[0]
    const body = parsedBody.data
    const changes: string[] = []
    const updateFields: string[] = []
    const updateRequest = new sql.Request(transaction)
      .input("batchId", sql.NVarChar(100), batchId)

    const addTextChange = (
      inputKey: keyof typeof body,
      column: string,
      parameter: string,
      label: string,
      oldValue: string | null,
      maxLength: number
    ) => {
      const newValue = body[inputKey]
      if (newValue === undefined || normalizeValue(newValue) === normalizeValue(oldValue)) return
      updateFields.push(`[${column}] = @${parameter}`)
      updateRequest.input(parameter, sql.NVarChar(maxLength), newValue || null)
      changes.push(`${label}：${normalizeValue(oldValue) || "未填写"} → ${normalizeValue(newValue) || "未填写"}`)
    }

    addTextChange("projectName", "ProjectName", "projectName", "客户名称", first.ProjectName, 500)
    addTextChange("contactInfo", "ContactInfo", "contactInfo", "联系信息", first.ContactInfo, 200)
    addTextChange("projectLocation", "ProjectLocation", "projectLocation", "项目名称", first.ProjectLocation, 200)
    addTextChange("senderAddress", "SenderAddress", "senderAddress", "寄件地址", first.SenderAddress, 500)

    if (updateFields.length === 0) {
      transaction = await rollback(transaction)
      return NextResponse.json({ success: true, changed: false, message: "信息未发生变化，无需保存" })
    }

    if (rows.some(isSignedRepairReport)) {
      transaction = await rollback(transaction)
      return NextResponse.json({ success: false, message: "报告已签字确认，不能修改报告中的客户资料" }, { status: 409 })
    }

    updateFields.push("[UpdatedAt] = GETUTCDATE()")
    await updateRequest.query(`
      UPDATE [dbo].[Repair_Tickets]
      SET ${updateFields.join(", ")}
      WHERE [BatchId] = @batchId AND [Status] <> 'Deleted';
    `)

    const description = `[批次信息] ${changes.join("；")}`
    await new sql.Request(transaction)
      .input("batchId", sql.NVarChar(100), batchId)
      .input("actionType", sql.NVarChar(50), TicketActionType.BATCH_UPDATED)
      .input("operatorId", sql.Int, operatorId)
      .input("operatorName", sql.NVarChar(100), authResult.realName || authResult.username)
      .input("description", sql.NVarChar(sql.MAX), description)
      .query(`
        INSERT INTO [dbo].[Repair_Ticket_History] (
          [BatchId], [ActionType], [OperatorId], [OperatorName], [Description], [CreatedAt]
        ) VALUES (@batchId, @actionType, @operatorId, @operatorName, @description, GETUTCDATE());
      `)

    await transaction.commit()
    transaction = null
    return NextResponse.json({ success: true, changed: true, message: "批次信息已更新" })
  } catch (error: unknown) {
    console.error("[Batch Info API] 更新失败:", error)
    transaction = await rollback(transaction)
    return NextResponse.json({ success: false, message: "更新批次信息失败" }, { status: 500 })
  }
}
