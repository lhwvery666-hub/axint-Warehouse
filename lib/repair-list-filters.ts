import { TicketStatus, normalizeTicketStatus } from "@/lib/enums"

export const ALL_REPAIR_STATUS_FILTER = "all"

export const REPAIR_STATUS_FILTER_OPTIONS = [
  { value: TicketStatus.CREATED, label: "待处理" },
  { value: TicketStatus.WAREHOUSE_CONFIRMING, label: "待仓库确认" },
  { value: TicketStatus.WAREHOUSE_CONFIRMED, label: "仓库已确认" },
  { value: TicketStatus.IN_REPAIR, label: "维修检查中" },
  { value: TicketStatus.PENDING_REPORTER_CONFIRM, label: "待现场确认" },
  { value: TicketStatus.TECHNICIAN_REPAIRING, label: "维修作业中" },
  { value: TicketStatus.BUSINESS_REVIEW, label: "待商务审核" },
  { value: TicketStatus.WAREHOUSE_SHIPPING, label: "待仓库发货" },
  { value: TicketStatus.COMPLETED, label: "已完成" },
  { value: TicketStatus.UNREPAIRABLE, label: "无法维修" },
  { value: TicketStatus.DELAYED, label: "已延期" },
] as const

export interface RepairListFilterRecord {
  id?: string | number | null
  batchId?: string | null
  workOrderNumber?: string | null
  customerName?: string | null
  clientName?: string | null
  projectName?: string | null
  projectLocation?: string | null
  contactInfo?: string | null
  reportedBy?: string | null
  reportedByUsername?: string | null
  reportedByUserId?: string | number | null
  deviceSerialNumber?: string | null
  productSN?: string | null
  deviceModel?: string | null
  deviceName?: string | null
  category?: string | null
  deviceSerials?: string | null
  deviceModels?: string | null
  status?: string | null
  statuses?: string | null
  devices?: readonly RepairListFilterRecord[]
}

export interface RepairListFilters {
  workOrderQuery: string
  customerQuery: string
  deviceQuery: string
  status: string
}

export type RepairTimeRange = "all" | "today" | "week" | "month" | "custom"

export interface RepairDateRange {
  from?: Date
  to?: Date
}

export interface FinancialFollowupFilterRecord {
  status?: string | null
  statuses?: string | null
  isPaymentReceived?: boolean | number | null
  isInvoiced?: boolean | number | null
}

export interface FinancialFollowupFilters {
  pendingShipment: boolean
  unpaid: boolean
  notInvoiced: boolean
}

function normalizeSearchValue(value: string | number | null | undefined): string {
  return value == null ? "" : String(value).trim().toLocaleLowerCase("zh-CN")
}

function matchesAnyField(
  query: string,
  values: ReadonlyArray<string | number | null | undefined>,
): boolean {
  const normalizedQuery = normalizeSearchValue(query)
  if (!normalizedQuery) return true

  return values.some((value) => normalizeSearchValue(value).includes(normalizedQuery))
}

function parseFilterDate(value: string | Date | null | undefined): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  const source = value?.trim()
  if (!source) return null

  const parsed = new Date(source)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function isSameLocalDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
}

/**
 * Match a complete API/SQL timestamp against the repair list time selector.
 * ISO timestamps must stay intact so timezone conversion can happen correctly.
 */
export function matchesRepairTimeRange(
  value: string | Date | null | undefined,
  range: RepairTimeRange | string,
  dateRange: RepairDateRange = {},
  now = new Date(),
): boolean {
  if (range === "all") return true

  const taskDate = parseFilterDate(value)
  if (!taskDate) return false

  if (range === "today") return isSameLocalDay(taskDate, now)

  if (range === "week") {
    const weekStart = new Date(now)
    weekStart.setDate(weekStart.getDate() - 7)
    return taskDate >= weekStart
  }

  if (range === "month") {
    const monthStart = new Date(now)
    monthStart.setMonth(monthStart.getMonth() - 1)
    return taskDate >= monthStart
  }

  if (range === "custom") {
    if (!dateRange.from) return true

    const start = new Date(dateRange.from)
    start.setHours(0, 0, 0, 0)
    if (taskDate < start) return false

    if (!dateRange.to) return true
    const end = new Date(dateRange.to)
    end.setHours(23, 59, 59, 999)
    return taskDate <= end
  }

  return true
}

/**
 * Financial follow-up point filters use AND semantics. An unchecked point does
 * not restrict the result. Warehouse_Shipping means the batch is waiting to ship.
 */
export function matchesFinancialFollowupFilters(
  batch: FinancialFollowupFilterRecord,
  filters: FinancialFollowupFilters,
): boolean {
  const statuses = (batch.statuses || batch.status || "")
    .split("|")
    .map((status) => normalizeTicketStatus(status))
    .filter((status): status is TicketStatus => status !== null)

  const isPendingShipment = statuses.includes(TicketStatus.WAREHOUSE_SHIPPING)
  const isUnpaid = !Boolean(batch.isPaymentReceived)
  const isNotInvoiced = !Boolean(batch.isInvoiced)

  return (!filters.pendingShipment || isPendingShipment) &&
    (!filters.unpaid || isUnpaid) &&
    (!filters.notInvoiced || isNotInvoiced)
}

/**
 * Match the repair list's combined filters.
 * Every non-empty filter is combined with AND, while each field searches both
 * the grouped batch record and all nested device records.
 */
export function matchesRepairListFilters(
  task: RepairListFilterRecord,
  filters: RepairListFilters,
): boolean {
  const records = [task, ...(task.devices ?? [])]

  const matchesWorkOrder = matchesAnyField(
    filters.workOrderQuery,
    records.flatMap((record) => [record.batchId, record.workOrderNumber, record.id]),
  )

  const matchesCustomer = matchesAnyField(
    filters.customerQuery,
    records.flatMap((record) => [
      record.customerName,
      record.clientName,
      record.projectName,
      record.projectLocation,
      record.contactInfo,
      record.reportedBy,
      record.reportedByUsername,
      record.reportedByUserId,
    ]),
  )

  const matchesDevice = matchesAnyField(
    filters.deviceQuery,
    records.flatMap((record) => [
      record.deviceSerialNumber,
      record.productSN,
      record.deviceModel,
      record.deviceName,
      record.category,
      record.deviceSerials,
      record.deviceModels,
    ]),
  )

  const statusValues = task.statuses
    ? task.statuses.split("|")
    : [task.status ?? ""]
  const matchesStatus =
    filters.status === ALL_REPAIR_STATUS_FILTER ||
    statusValues.some((status) => normalizeTicketStatus(status) === filters.status)

  return matchesWorkOrder && matchesCustomer && matchesDevice && matchesStatus
}
