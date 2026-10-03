import { z } from "zod"
import { TicketStatus, normalizeTicketStatus } from "@/lib/enums"

export const CORRECTION_ACTION = {
  REQUESTED: "CorrectionRequested",
  APPROVED: "CorrectionApproved",
  REJECTED: "CorrectionRejected",
} as const

export const CORRECTION_STATE = {
  PENDING: "Correction_Pending",
  APPROVED: "Correction_Approved",
  REJECTED: "Correction_Rejected",
} as const

export const CORRECTION_IMPACT = {
  NONE: "none",
  REPAIR_REVIEW: "repair_review",
  WAREHOUSE_REVIEW: "warehouse_review",
} as const

export type CorrectionImpact = typeof CORRECTION_IMPACT[keyof typeof CORRECTION_IMPACT]
export type CorrectionValue = string | number | null

export interface CorrectionChange {
  scope: "batch" | "device"
  deviceId?: number
  field: string
  label: string
  oldValue: CorrectionValue
  newValue: CorrectionValue
  impact: CorrectionImpact
}

/** After signature, only logistics that do not alter the report may be corrected. */
export function correctionAffectsSignedReport(changes: readonly CorrectionChange[]): boolean {
  return changes.some((change) => change.scope !== "batch" ||
    !["trackingNumber", "expressCompany"].includes(change.field))
}

export interface CorrectionDeviceVersion {
  deviceId: number
  status: string
  updatedAt: string | null
}

export interface CorrectionRequestPayload {
  version: 1
  batchId: string
  reason: string
  requestedById: number
  requestedByName: string
  requestedAt: string
  impact: CorrectionImpact
  changes: CorrectionChange[]
  deviceVersions: CorrectionDeviceVersion[]
}

const optionalText = (max: number) => z.string().trim().max(max).optional()

export const correctionDeviceSchema = z.object({
  deviceId: z.number().int().positive(),
  serialNumber: optionalText(100),
  modelName: optionalText(200),
  deviceName: optionalText(200),
  category: optionalText(200),
  subCategory: optionalText(200),
  faultDescription: optionalText(10000),
  quantity: z.number().int().min(1).max(100000).optional(),
}).strict()

export const correctionRequestSchema = z.object({
  batchId: z.string().trim().min(1).max(50),
  reason: z.string().trim().min(5).max(500),
  senderAddress: optionalText(500),
  projectName: optionalText(500),
  contactInfo: optionalText(200),
  projectLocation: optionalText(200),
  trackingNumber: optionalText(200),
  expressCompany: optionalText(100),
  devices: z.array(correctionDeviceSchema).min(1).max(500),
}).strict()

export type CorrectionRequestInput = z.infer<typeof correctionRequestSchema>

const IMPACT_PRIORITY: Record<CorrectionImpact, number> = {
  [CORRECTION_IMPACT.NONE]: 0,
  [CORRECTION_IMPACT.REPAIR_REVIEW]: 1,
  [CORRECTION_IMPACT.WAREHOUSE_REVIEW]: 2,
}

export function getHighestCorrectionImpact(changes: readonly CorrectionChange[]): CorrectionImpact {
  return changes.reduce<CorrectionImpact>((highest, change) => (
    IMPACT_PRIORITY[change.impact] > IMPACT_PRIORITY[highest] ? change.impact : highest
  ), CORRECTION_IMPACT.NONE)
}

export function getCorrectionRollbackTarget(impact: CorrectionImpact): TicketStatus | null {
  if (impact === CORRECTION_IMPACT.WAREHOUSE_REVIEW) return TicketStatus.WAREHOUSE_CONFIRMING
  if (impact === CORRECTION_IMPACT.REPAIR_REVIEW) return TicketStatus.IN_REPAIR
  return null
}

export function correctionHistoryKey(requestId: number): string {
  return `CORR:${requestId}`
}

export function canReporterEditDirectly(status: string | null | undefined): boolean {
  const normalized = normalizeTicketStatus(status || "")
  return normalized === TicketStatus.CREATED || normalized === TicketStatus.WAREHOUSE_CONFIRMING
}

export function isCorrectionTerminalStatus(status: string | null | undefined): boolean {
  const normalized = normalizeTicketStatus(status || "")
  return [
    TicketStatus.COMPLETED,
    TicketStatus.CANCELLED,
    TicketStatus.DELETED,
    TicketStatus.UNREPAIRABLE,
    TicketStatus.SCRAPPED,
    TicketStatus.RETURN_UNREPAIRED,
    TicketStatus.REJECTED_NO_RETURN,
  ].includes(normalized as TicketStatus)
}

export function correctionValueEquals(left: unknown, right: unknown): boolean {
  if (left === null || left === undefined || left === "") {
    return right === null || right === undefined || right === ""
  }
  if (typeof left === "number" || typeof right === "number") {
    return Number(left) === Number(right)
  }
  return String(left).trim() === String(right).trim()
}
