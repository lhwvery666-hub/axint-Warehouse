import {
  RepairAction,
  TicketActionType,
  TicketStatus,
  UserRole,
  normalizeTicketStatus,
} from "@/lib/enums"

const REPORTER_MASKED_FACTORY_STATUSES = new Set<TicketStatus>([
  TicketStatus.PENDING_FACTORY,
  TicketStatus.FACTORY_FINISHED,
])

const REPORTER_HIDDEN_FACTORY_ACTIONS = new Set<string>([
  TicketActionType.RMA_REQUEST,
  TicketActionType.FACTORY_RETURN_CONFIRMED,
])

/**
 * 现场人员只看到公开维修进度；返厂是内部执行状态。
 * 内部角色始终获得数据库中的真实规范状态。
 */
export function getVisibleTicketStatus(
  status: string | null | undefined,
  role: UserRole
): TicketStatus {
  const normalized = normalizeTicketStatus(status || "") ?? TicketStatus.CREATED
  if (role === UserRole.REPORTER && REPORTER_MASKED_FACTORY_STATUSES.has(normalized)) {
    return TicketStatus.TECHNICIAN_REPAIRING
  }
  return normalized
}

/** 现场人员不得通过维修动作字段得知设备已返厂。 */
export function getVisibleRepairAction(
  action: string | null | undefined,
  role: UserRole
): string | null {
  if (role === UserRole.REPORTER && action === RepairAction.RMA) {
    return null
  }
  return action || null
}

export function canViewFactoryDetails(role: UserRole): boolean {
  return role !== UserRole.REPORTER
}

export function isFactoryHistoryAction(actionType: string | null | undefined): boolean {
  return Boolean(actionType && REPORTER_HIDDEN_FACTORY_ACTIONS.has(actionType))
}

const INTERNAL_TICKET_FIELDS = new Set([
  "deviceName", "materialCode", "fullSpec", "specification", "manufacturer",
  "supplier", "supplierName", "warehouse", "location", "purchasePrice",
  "factoryRepairDate", "factoryTrackingNum", "factoryReceivedDate", "factoryShipDate",
  "isOutsourced", "repairNotes", "faultPoint",
])

/** Keep customer prices/logistics; internal catalog and factory fields never leave this boundary. */
export function projectTicketForViewer<T extends object>(
  data: T,
  role: UserRole
): Partial<T> {
  if (role !== UserRole.REPORTER) return data
  return Object.fromEntries(Object.entries(data).filter(([key]) => !INTERNAL_TICKET_FIELDS.has(key))) as Partial<T>
}
