import { TicketStatus, UserRole, normalizeTicketStatus } from "@/lib/enums"

const WAREHOUSE_EDITABLE_STATUSES = new Set<TicketStatus>([
  TicketStatus.CREATED,
  TicketStatus.WAREHOUSE_CONFIRMING,
  TicketStatus.WAREHOUSE_CONFIRMED,
])

const TECHNICIAN_EDITABLE_STATUSES = new Set<TicketStatus>([
  TicketStatus.WAREHOUSE_CONFIRMED,
  TicketStatus.IN_REPAIR,
  TicketStatus.PROCESSING,
  TicketStatus.WARRANTY_CHECKING,
  TicketStatus.IN_WARRANTY_REPAIR,
  TicketStatus.IN_WARRANTY_REPLACE,
  TicketStatus.OUT_WARRANTY_REPORT,
  TicketStatus.OUT_WARRANTY_REPAIR,
  TicketStatus.TECHNICIAN_REPAIRING,
])

/**
 * 产品名称和型号属于工单设备身份信息，只允许内部执行角色在自己的业务阶段更正。
 * 已进入现场确认、商务、发货或结束阶段后锁定，避免已经签字/审核的报告与工单数据不一致。
 */
export function canEditDeviceIdentity(
  role: UserRole | string | null | undefined,
  status: TicketStatus | string | null | undefined,
): boolean {
  const normalizedStatus = normalizeTicketStatus(status)
  if (!normalizedStatus) return false

  if (role === UserRole.WAREHOUSE) {
    return WAREHOUSE_EDITABLE_STATUSES.has(normalizedStatus)
  }
  if (role === UserRole.TECHNICIAN) {
    return TECHNICIAN_EDITABLE_STATUSES.has(normalizedStatus)
  }
  return false
}

/**
 * 三级分类由仓库在收货核对阶段完善。维修工程师可以查看结果，
 * 但不能再通过设备身份入口改写分类，避免分类口径在维修阶段继续漂移。
 */
export function canEditDeviceClassification(
  role: UserRole | string | null | undefined,
  status: TicketStatus | string | null | undefined,
): boolean {
  const normalizedStatus = normalizeTicketStatus(status)
  return role === UserRole.WAREHOUSE
    && normalizedStatus !== null
    && WAREHOUSE_EDITABLE_STATUSES.has(normalizedStatus)
}
