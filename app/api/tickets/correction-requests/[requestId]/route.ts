import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import { checkUserRole, isErrorResponse } from "@/lib/auth-utils"
import { prisma } from "@/lib/prisma"
import { isSignedRepairReport } from "@/lib/repair-report-policy"
import { TicketStatus, UserRole, normalizeTicketStatus } from "@/lib/enums"
import {
  CORRECTION_ACTION,
  CORRECTION_IMPACT,
  CORRECTION_STATE,
  type CorrectionChange,
  type CorrectionRequestPayload,
  correctionHistoryKey,
  correctionValueEquals,
  correctionAffectsSignedReport,
  getCorrectionRollbackTarget,
} from "@/lib/ticket-correction"

const decisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(500).optional(),
}).strict()

function parsePayload(value: string | null): CorrectionRequestPayload | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as CorrectionRequestPayload
    return parsed?.version === 1 && Array.isArray(parsed.changes) ? parsed : null
  } catch {
    return null
  }
}

function currentValue(row: Record<string, unknown>, change: CorrectionChange): unknown {
  const fields: Record<string, string> = {
    senderAddress: "senderAddress",
    projectName: "ProjectName",
    contactInfo: "contactInfo",
    projectLocation: "projectLocation",
    trackingNumber: "trackingNumberIn",
    expressCompany: "CourierCompany",
    serialNumber: "deviceSn",
    modelName: "modelName",
    deviceName: "deviceName",
    category: "Category",
    subCategory: "SubCategory",
    faultDescription: "problem",
    quantity: "Quantity",
  }
  return row[fields[change.field]]
}

function batchUpdateData(change: CorrectionChange): Prisma.Repair_TicketsUpdateManyMutationInput {
  switch (change.field) {
    case "senderAddress": return { senderAddress: change.newValue as string | null }
    case "projectName": return { ProjectName: change.newValue as string | null }
    case "contactInfo": return { contactInfo: change.newValue as string | null }
    case "projectLocation": return { projectLocation: change.newValue as string | null }
    case "trackingNumber": return { trackingNumberIn: change.newValue as string | null }
    case "expressCompany": return { CourierCompany: change.newValue as string | null }
    default: return {}
  }
}

function deviceUpdateData(change: CorrectionChange): Prisma.Repair_TicketsUpdateInput {
  switch (change.field) {
    case "serialNumber": return { deviceSn: String(change.newValue ?? "") }
    case "modelName": return { modelName: change.newValue as string | null }
    case "deviceName": return { deviceName: change.newValue as string | null }
    case "category": return { Category: change.newValue as string | null }
    case "subCategory": return { SubCategory: change.newValue as string | null }
    case "faultDescription": return { problem: change.newValue as string | null }
    case "quantity": return { Quantity: Number(change.newValue) }
    default: return {}
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ requestId: string }> }
) {
  const authResult = await checkUserRole([UserRole.WAREHOUSE, UserRole.ADMIN])
  if (isErrorResponse(authResult)) return authResult

  try {
    const { requestId: requestIdRaw } = await context.params
    const requestId = Number(requestIdRaw)
    if (!Number.isSafeInteger(requestId) || requestId <= 0) {
      return NextResponse.json({ success: false, message: "修改申请编号无效" }, { status: 400 })
    }

    const parsed = decisionSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ success: false, message: "审核参数无效" }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      const requestEntry = await tx.repair_Ticket_History.findUnique({ where: { historyId: requestId } })
      if (!requestEntry || requestEntry.actionType !== CORRECTION_ACTION.REQUESTED) {
        throw new Error("CORRECTION_NOT_FOUND")
      }

      const payload = parsePayload(requestEntry.actionNote)
      if (!payload || payload.batchId !== requestEntry.batchId) {
        throw new Error("CORRECTION_INVALID")
      }

      const targetState = parsed.data.decision === "approve"
        ? CORRECTION_STATE.APPROVED
        : CORRECTION_STATE.REJECTED
      const claimed = await tx.repair_Ticket_History.updateMany({
        where: {
          historyId: requestId,
          actionType: CORRECTION_ACTION.REQUESTED,
          newStatus: CORRECTION_STATE.PENDING,
        },
        data: { newStatus: targetState },
      })
      if (claimed.count !== 1) throw new Error("CORRECTION_DECIDED")

      const reviewerId = Number(authResult.userId)
      const reviewerName = authResult.realName || authResult.username

      if (parsed.data.decision === "reject") {
        await tx.repair_Ticket_History.create({
          data: {
            ticketId: correctionHistoryKey(requestId),
            batchId: payload.batchId,
            actionType: CORRECTION_ACTION.REJECTED,
            oldStatus: CORRECTION_STATE.PENDING,
            newStatus: CORRECTION_STATE.REJECTED,
            actionBy: authResult.username,
            actionNote: JSON.stringify({ version: 1, requestId, note: parsed.data.note || null }),
            operatorId: reviewerId,
            operatorName: reviewerName,
            description: `驳回修改申请 #${requestId}${parsed.data.note ? `；说明：${parsed.data.note}` : ""}`,
          },
        })
        return { decision: "reject", rollbackTarget: null, changedCount: 0 }
      }

      const rows = await tx.repair_Tickets.findMany({
        where: { batchId: payload.batchId },
        orderBy: { id: "asc" },
      })
      if (rows.length === 0) throw new Error("BATCH_NOT_FOUND")

      // Serializable isolation keeps the signature decision and writes on the same snapshot.
      if (rows.some(isSignedRepairReport) && (
        correctionAffectsSignedReport(payload.changes) || payload.impact !== CORRECTION_IMPACT.NONE
      )) throw new Error("SIGNED_REPORT_LOCKED")

      const rowRecords = new Map(rows.map((row) => [row.id, row as unknown as Record<string, unknown>]))
      for (const change of payload.changes) {
        const row = change.scope === "device"
          ? rowRecords.get(change.deviceId || 0)
          : rowRecords.get(rows[0].id)
        if (!row || !correctionValueEquals(currentValue(row, change), change.oldValue)) {
          throw new Error("CORRECTION_STALE")
        }
      }

      if (payload.impact !== CORRECTION_IMPACT.NONE) {
        for (const version of payload.deviceVersions) {
          const current = rowRecords.get(version.deviceId)
          const currentStatus = normalizeTicketStatus(String(current?.status || "")) || String(current?.status || "")
          const currentUpdatedAt = current?.updatedAt instanceof Date
            ? current.updatedAt.toISOString()
            : current?.updatedAt
              ? new Date(String(current.updatedAt)).toISOString()
              : null
          if (
            !current ||
            currentStatus !== version.status ||
            currentUpdatedAt !== version.updatedAt
          ) throw new Error("CORRECTION_STALE")
        }
      }

      const batchChanges = payload.changes.filter((change) => change.scope === "batch")
      for (const change of batchChanges) {
        await tx.repair_Tickets.updateMany({
          where: { batchId: payload.batchId },
          data: batchUpdateData(change),
        })
      }

      for (const change of payload.changes.filter((item) => item.scope === "device")) {
        await tx.repair_Tickets.update({
          where: { id: change.deviceId },
          data: deviceUpdateData(change),
        })
      }

      const rollbackTarget = getCorrectionRollbackTarget(payload.impact)
      if (rollbackTarget) {
        const rollbackData: Prisma.Repair_TicketsUpdateManyMutationInput = {
          status: rollbackTarget,
          repairReportContent: null,
          RepairCost: null,
          FaultPoint: null,
          FaultCategory: null,
          RepairAction: null,
          RepairNotes: null,
          SignedReportPhoto: null,
          ReporterConfirmedAt: null,
          TechnicianCompletedAt: null,
          TechnicianCompletedBy: null,
          BusinessReviewedAt: null,
          BusinessReviewedBy: null,
          WarehouseShippedAt: null,
          WarehouseShippedBy: null,
        }

        // 核心设备信息改变时需要仓库重新核对，旧的仓库确认结论一并失效。
        if (rollbackTarget === TicketStatus.WAREHOUSE_CONFIRMING) {
          rollbackData.WarehouseConfirmedAt = null
          rollbackData.WarehouseConfirmedBy = null
        }

        await tx.repair_Tickets.updateMany({
          where: { batchId: payload.batchId },
          data: rollbackData,
        })
      }

      const rollbackLabel = rollbackTarget === TicketStatus.WAREHOUSE_CONFIRMING
        ? "，流程已回退至待仓库确认"
        : rollbackTarget === TicketStatus.IN_REPAIR
          ? "，流程已回退至维修检查中"
          : "，原流程状态保持不变"

      await tx.repair_Ticket_History.create({
        data: {
          ticketId: correctionHistoryKey(requestId),
          batchId: payload.batchId,
          actionType: CORRECTION_ACTION.APPROVED,
          oldStatus: requestEntry.oldStatus,
          newStatus: rollbackTarget || requestEntry.oldStatus,
          actionBy: authResult.username,
          actionNote: JSON.stringify({
            version: 1,
            requestId,
            note: parsed.data.note || null,
            rollbackTarget,
          }),
          operatorId: reviewerId,
          operatorName: reviewerName,
          description: `批准并应用修改申请 #${requestId}，共 ${payload.changes.length} 项${rollbackLabel}`,
        },
      })

      return { decision: "approve", rollbackTarget, changedCount: payload.changes.length }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    return NextResponse.json({
      success: true,
      message: result.decision === "approve" ? "修改已审核并应用" : "修改申请已驳回",
      data: result,
    })
  } catch (error: unknown) {
    const code = error instanceof Error ? error.message : ""
    if (code === "CORRECTION_NOT_FOUND") {
      return NextResponse.json({ success: false, message: "修改申请不存在" }, { status: 404 })
    }
    if (code === "SIGNED_REPORT_LOCKED") {
      return NextResponse.json({ success: false, message: "报告已签字，不能批准会修改报告或清除签字的更正；仅可更正物流信息" }, { status: 409 })
    }
    if (code === "CORRECTION_DECIDED") {
      return NextResponse.json({ success: false, message: "该修改申请已经处理，请刷新页面" }, { status: 409 })
    }
    if (code === "CORRECTION_STALE") {
      return NextResponse.json({ success: false, message: "工单数据或流程状态已变化，不能直接应用；请驳回后重新申请" }, { status: 409 })
    }
    if (code === "BATCH_NOT_FOUND") {
      return NextResponse.json({ success: false, message: "关联工单不存在" }, { status: 404 })
    }
    if (code === "CORRECTION_INVALID") {
      return NextResponse.json({ success: false, message: "修改申请数据已损坏" }, { status: 409 })
    }
    console.error("审核工单修改申请失败:", error)
    return NextResponse.json({ success: false, message: "审核修改申请失败" }, { status: 500 })
  }
}
