import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
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
  canReporterEditDirectly,
  correctionHistoryKey,
  correctionRequestSchema,
  correctionValueEquals,
  correctionAffectsSignedReport,
  getHighestCorrectionImpact,
  isCorrectionTerminalStatus,
} from "@/lib/ticket-correction"

type TicketRow = Awaited<ReturnType<typeof getBatchRows>>[number]

function getBatchRows(batchId: string) {
  return prisma.repair_Tickets.findMany({
    where: {
      batchId,
      status: { notIn: [TicketStatus.DELETED, "deleted"] },
    },
    orderBy: { id: "asc" },
  })
}

function toValue(value: unknown): string | number | null {
  if (value === null || value === undefined) return null
  if (typeof value === "number" || typeof value === "string") return value
  if (typeof value === "object" && "toString" in value) return String(value)
  return String(value)
}

function addChange(
  changes: CorrectionChange[],
  change: Omit<CorrectionChange, "oldValue" | "newValue"> & { oldValue: unknown; newValue: unknown }
) {
  if (!correctionValueEquals(change.oldValue, change.newValue)) {
    changes.push({
      ...change,
      oldValue: toValue(change.oldValue),
      newValue: toValue(change.newValue),
    })
  }
}

function buildChanges(input: ReturnType<typeof correctionRequestSchema.parse>, rows: TicketRow[]): CorrectionChange[] {
  const first = rows[0]
  const changes: CorrectionChange[] = []

  const batchFields = [
    ["senderAddress", "寄件地址", first.senderAddress, input.senderAddress],
    ["projectName", "客户名称", first.ProjectName, input.projectName],
    ["contactInfo", "联系信息", first.contactInfo, input.contactInfo],
    ["projectLocation", "项目名称", first.projectLocation, input.projectLocation],
    ["trackingNumber", "寄件快递单号", first.trackingNumberIn, input.trackingNumber],
    ["expressCompany", "寄件快递公司", first.CourierCompany, input.expressCompany],
  ] as const

  for (const [field, label, oldValue, newValue] of batchFields) {
    if (newValue !== undefined) {
      addChange(changes, {
        scope: "batch",
        field,
        label,
        oldValue,
        newValue,
        impact: CORRECTION_IMPACT.NONE,
      })
    }
  }

  const rowById = new Map(rows.map((row) => [row.id, row]))
  for (const proposed of input.devices) {
    const current = rowById.get(proposed.deviceId)
    if (!current) continue

    const fields = [
      ["serialNumber", "设备序列号", current.deviceSn, proposed.serialNumber, CORRECTION_IMPACT.WAREHOUSE_REVIEW],
      ["modelName", "产品型号", current.modelName, proposed.modelName, CORRECTION_IMPACT.WAREHOUSE_REVIEW],
      ["deviceName", "产品名称", current.deviceName, proposed.deviceName, CORRECTION_IMPACT.WAREHOUSE_REVIEW],
      ["category", "一级分类", current.Category, proposed.category, CORRECTION_IMPACT.WAREHOUSE_REVIEW],
      ["subCategory", "二级分类", current.SubCategory, proposed.subCategory, CORRECTION_IMPACT.WAREHOUSE_REVIEW],
      ["quantity", "设备数量", current.Quantity ?? 1, proposed.quantity, CORRECTION_IMPACT.WAREHOUSE_REVIEW],
      ["faultDescription", "故障描述", current.problem, proposed.faultDescription, CORRECTION_IMPACT.REPAIR_REVIEW],
    ] as const

    for (const [field, label, oldValue, newValue, impact] of fields) {
      if (newValue !== undefined) {
        addChange(changes, {
          scope: "device",
          deviceId: current.id,
          field,
          label: `设备 ${current.id} · ${label}`,
          oldValue,
          newValue,
          impact,
        })
      }
    }
  }

  return changes
}

function parsePayload(value: string | null): CorrectionRequestPayload | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as CorrectionRequestPayload
    return parsed?.version === 1 && Array.isArray(parsed.changes) ? parsed : null
  } catch {
    return null
  }
}

function serializeRequest(entry: {
  historyId: number
  newStatus: string | null
  createdAt: Date | null
  actionNote: string | null
}) {
  const payload = parsePayload(entry.actionNote)
  return payload ? {
    requestId: entry.historyId,
    batchId: payload.batchId,
    state: entry.newStatus,
    createdAt: entry.createdAt,
    reason: payload.reason,
    impact: payload.impact,
    changes: payload.changes,
    requestedByName: payload.requestedByName,
  } : null
}

export async function GET(request: Request) {
  const authResult = await checkUserRole([UserRole.REPORTER, UserRole.WAREHOUSE, UserRole.ADMIN])
  if (isErrorResponse(authResult)) return authResult

  try {
    const batchId = new URL(request.url).searchParams.get("batchId")?.trim()
    if (!batchId) {
      if (![UserRole.WAREHOUSE, UserRole.ADMIN].includes(authResult.normalizedRole)) {
        return NextResponse.json({ success: false, message: "缺少批次号" }, { status: 400 })
      }

      const pendingRequests = await prisma.repair_Ticket_History.findMany({
        where: {
          actionType: CORRECTION_ACTION.REQUESTED,
          newStatus: CORRECTION_STATE.PENDING,
        },
        orderBy: { historyId: "desc" },
        take: 100,
      })

      return NextResponse.json({
        success: true,
        data: pendingRequests.flatMap((entry) => {
          const item = serializeRequest(entry)
          return item ? [item] : []
        }),
      })
    }

    const rows = await getBatchRows(batchId)
    if (rows.length === 0) {
      return NextResponse.json({ success: false, message: "工单不存在" }, { status: 404 })
    }

    if (
      authResult.normalizedRole === UserRole.REPORTER &&
      rows.some((row) => row.ReportByUserID !== Number(authResult.userId))
    ) {
      return NextResponse.json({ success: false, message: "无权查看该工单的修改申请" }, { status: 403 })
    }

    const requests = await prisma.repair_Ticket_History.findMany({
      where: { batchId, actionType: CORRECTION_ACTION.REQUESTED },
      orderBy: { historyId: "desc" },
      take: 20,
    })

    return NextResponse.json({
      success: true,
      data: requests.flatMap((entry) => {
        const item = serializeRequest(entry)
        return item ? [item] : []
      }),
    })
  } catch (error: unknown) {
    console.error("查询工单修改申请失败:", error)
    return NextResponse.json({ success: false, message: "查询修改申请失败" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const authResult = await checkUserRole([UserRole.REPORTER])
  if (isErrorResponse(authResult)) return authResult

  try {
    const parsed = correctionRequestSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ success: false, message: "修改申请内容不完整或格式无效" }, { status: 400 })
    }

    const input = parsed.data
    const rows = await getBatchRows(input.batchId)
    if (rows.length === 0) {
      return NextResponse.json({ success: false, message: "工单不存在" }, { status: 404 })
    }

    const reporterId = Number(authResult.userId)
    if (!Number.isSafeInteger(reporterId) || rows.some((row) => row.ReportByUserID !== reporterId)) {
      return NextResponse.json({ success: false, message: "无权修改该工单" }, { status: 403 })
    }

    if (rows.some((row) => isCorrectionTerminalStatus(row.status))) {
      return NextResponse.json({ success: false, message: "已结束工单不能由现场人员申请修改，请联系管理员处理" }, { status: 409 })
    }

    if (rows.every((row) => canReporterEditDirectly(row.status))) {
      return NextResponse.json({ success: false, message: "当前仍处于仓库确认前，可直接编辑，无需申请" }, { status: 409 })
    }

    const currentIds = rows.map((row) => row.id).sort((a, b) => a - b)
    const proposedIds = input.devices.map((row) => row.deviceId).sort((a, b) => a - b)
    if (currentIds.length !== proposedIds.length || currentIds.some((id, index) => id !== proposedIds[index])) {
      return NextResponse.json({ success: false, message: "设备列表已经变化，请刷新页面后重新申请" }, { status: 409 })
    }

    const existingPending = await prisma.repair_Ticket_History.findFirst({
      where: {
        batchId: input.batchId,
        actionType: CORRECTION_ACTION.REQUESTED,
        newStatus: CORRECTION_STATE.PENDING,
      },
      select: { historyId: true },
    })
    if (existingPending) {
      return NextResponse.json({
        success: false,
        message: `该工单已有待审核修改申请（#${existingPending.historyId}）`,
      }, { status: 409 })
    }

    const changes = buildChanges(input, rows)
    if (changes.length === 0) {
      return NextResponse.json({ success: false, message: "未检测到任何实际修改" }, { status: 400 })
    }
    if (rows.some(isSignedRepairReport) && correctionAffectsSignedReport(changes)) {
      return NextResponse.json({ success: false, message: "报告已签字，客户、设备及报告信息不可修改；仅可更正物流信息" }, { status: 409 })
    }

    const result = await prisma.$transaction(async (tx) => {
      const stillPending = await tx.repair_Ticket_History.findFirst({
        where: {
          batchId: input.batchId,
          actionType: CORRECTION_ACTION.REQUESTED,
          newStatus: CORRECTION_STATE.PENDING,
        },
        select: { historyId: true },
      })
      if (stillPending) throw new Error("CORRECTION_PENDING")

      // 在 SERIALIZABLE 事务中重新读取工单快照，避免“页面读取后、申请入库前”被其他请求修改。
      // 同批次并发申请会在范围锁/冲突检测下只允许一个事务完成。
      const freshRows = await tx.repair_Tickets.findMany({
        where: {
          batchId: input.batchId,
          status: { notIn: [TicketStatus.DELETED, "deleted"] },
        },
        orderBy: { id: "asc" },
      })
      if (freshRows.length === 0) throw new Error("BATCH_NOT_FOUND")
      if (freshRows.some((row) => row.ReportByUserID !== reporterId)) throw new Error("BATCH_FORBIDDEN")
      if (freshRows.some((row) => isCorrectionTerminalStatus(row.status))) throw new Error("BATCH_TERMINAL")
      if (freshRows.every((row) => canReporterEditDirectly(row.status))) throw new Error("DIRECT_EDIT_AVAILABLE")

      const freshIds = freshRows.map((row) => row.id).sort((a, b) => a - b)
      if (freshIds.length !== proposedIds.length || freshIds.some((id, index) => id !== proposedIds[index])) {
        throw new Error("CORRECTION_STALE")
      }

      const freshChanges = buildChanges(input, freshRows)
      if (freshChanges.length === 0) throw new Error("CORRECTION_NO_CHANGES")
      if (freshRows.some(isSignedRepairReport) && correctionAffectsSignedReport(freshChanges)) {
        throw new Error("SIGNED_REPORT_LOCKED")
      }
      const impact = getHighestCorrectionImpact(freshChanges)
      const now = new Date()
      const payload: CorrectionRequestPayload = {
        version: 1,
        batchId: input.batchId,
        reason: input.reason,
        requestedById: reporterId,
        requestedByName: authResult.realName || authResult.username,
        requestedAt: now.toISOString(),
        impact,
        changes: freshChanges,
        deviceVersions: freshRows.map((row) => ({
          deviceId: row.id,
          status: normalizeTicketStatus(row.status) || row.status,
          updatedAt: row.updatedAt?.toISOString() ?? null,
        })),
      }

      const created = await tx.repair_Ticket_History.create({
        data: {
          batchId: input.batchId,
          actionType: CORRECTION_ACTION.REQUESTED,
          oldStatus: rows[0].status,
          newStatus: CORRECTION_STATE.PENDING,
          actionBy: authResult.username,
          actionNote: JSON.stringify(payload),
          operatorId: reporterId,
          operatorName: payload.requestedByName,
          description: `提交工单修改申请，共 ${freshChanges.length} 项；原因：${input.reason}`,
        },
      })

      await tx.repair_Ticket_History.update({
        where: { historyId: created.historyId },
        data: { ticketId: correctionHistoryKey(created.historyId) },
      })
      return { created, impact, changeCount: freshChanges.length }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    return NextResponse.json({
      success: true,
      message: "修改申请已提交，原工单状态保持不变",
      data: { requestId: result.created.historyId, impact: result.impact, changes: result.changeCount },
    }, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "CORRECTION_PENDING") {
      return NextResponse.json({ success: false, message: "该工单已有待审核修改申请" }, { status: 409 })
    }
    const errorCode = typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : ""
    if (errorCode === "P2034") {
      return NextResponse.json({ success: false, message: "工单数据刚刚发生变化，请刷新后重新提交" }, { status: 409 })
    }
    const domainError = error instanceof Error ? error.message : ""
    if (domainError === "SIGNED_REPORT_LOCKED") {
      return NextResponse.json({ success: false, message: "报告已签字，客户、设备及报告信息不可修改；仅可更正物流信息" }, { status: 409 })
    }
    if (["CORRECTION_STALE", "DIRECT_EDIT_AVAILABLE"].includes(domainError)) {
      return NextResponse.json({ success: false, message: "工单数据或状态刚刚发生变化，请刷新后重新提交" }, { status: 409 })
    }
    if (domainError === "CORRECTION_NO_CHANGES") {
      return NextResponse.json({ success: false, message: "未检测到任何实际修改" }, { status: 400 })
    }
    if (domainError === "BATCH_FORBIDDEN") {
      return NextResponse.json({ success: false, message: "无权修改该工单" }, { status: 403 })
    }
    if (domainError === "BATCH_TERMINAL") {
      return NextResponse.json({ success: false, message: "已结束工单不能由现场人员申请修改，请联系管理员处理" }, { status: 409 })
    }
    if (domainError === "BATCH_NOT_FOUND") {
      return NextResponse.json({ success: false, message: "工单不存在" }, { status: 404 })
    }
    console.error("提交工单修改申请失败:", error)
    return NextResponse.json({ success: false, message: "提交修改申请失败" }, { status: 500 })
  }
}
