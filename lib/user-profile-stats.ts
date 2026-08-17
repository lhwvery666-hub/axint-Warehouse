import { normalizeTicketStatus, TicketStatus, UserRole } from "@/lib/enums"

export interface ProfileStatSource {
  id: string
  batchId?: string | null
  workOrderNumber?: string
  status: string
}

export type ProfileStatTone = "blue" | "amber" | "green" | "violet"

export interface ProfileStat {
  label: string
  value: number
  description: string
  tone: ProfileStatTone
}

const TERMINAL_STATUSES = new Set<TicketStatus>([
  TicketStatus.COMPLETED,
  TicketStatus.UNREPAIRABLE,
  TicketStatus.SCRAPPED,
  TicketStatus.RETURN_UNREPAIRED,
  TicketStatus.REJECTED_NO_RETURN,
  TicketStatus.CANCELLED,
  TicketStatus.DELETED,
])

function uniqueTickets(repairs: ProfileStatSource[]): ProfileStatSource[] {
  const unique = new Map<string, ProfileStatSource>()

  repairs.forEach((repair) => {
    const key = repair.batchId?.trim()
      || repair.workOrderNumber?.trim()
      || repair.id
    if (!unique.has(key)) unique.set(key, repair)
  })

  return Array.from(unique.values())
}

function countStatus(
  repairs: ProfileStatSource[],
  statuses: ReadonlySet<TicketStatus>
): number {
  return repairs.filter((repair) => {
    const status = normalizeTicketStatus(repair.status)
    return status !== null && statuses.has(status)
  }).length
}

export function buildUserProfileStats(
  role: UserRole,
  source: ProfileStatSource[]
): ProfileStat[] {
  const repairs = uniqueTickets(source)
  const total = repairs.length
  const completed = countStatus(repairs, new Set([TicketStatus.COMPLETED]))
  const active = repairs.filter((repair) => {
    const status = normalizeTicketStatus(repair.status)
    return status !== null && !TERMINAL_STATUSES.has(status)
  }).length

  if (role === UserRole.REPORTER) {
    return [
      { label: "我的工单", value: total, description: "当前账号提交的工单", tone: "blue" },
      {
        label: "待我确认",
        value: countStatus(repairs, new Set([TicketStatus.PENDING_REPORTER_CONFIRM])),
        description: "等待签字凭证确认",
        tone: "amber",
      },
      { label: "处理中", value: active, description: "尚未结束的工单", tone: "violet" },
      { label: "已完成", value: completed, description: "流程已结束的工单", tone: "green" },
    ]
  }

  if (role === UserRole.TECHNICIAN) {
    return [
      {
        label: "待检查",
        value: countStatus(repairs, new Set([TicketStatus.IN_REPAIR])),
        description: "等待检查并出具报告",
        tone: "blue",
      },
      {
        label: "维修作业中",
        value: countStatus(repairs, new Set([
          TicketStatus.TECHNICIAN_REPAIRING,
          TicketStatus.FACTORY_FINISHED,
        ])),
        description: "等待最终维修确认",
        tone: "amber",
      },
      { label: "进行中", value: active, description: "当前未结束的工单", tone: "violet" },
      { label: "已完成", value: completed, description: "流程已结束的工单", tone: "green" },
    ]
  }

  if (role === UserRole.WAREHOUSE) {
    return [
      {
        label: "待仓库确认",
        value: countStatus(repairs, new Set([
          TicketStatus.CREATED,
          TicketStatus.WAREHOUSE_CONFIRMING,
        ])),
        description: "等待核对设备信息",
        tone: "blue",
      },
      {
        label: "待处理发货",
        value: countStatus(repairs, new Set([
          TicketStatus.WAREHOUSE_SHIPPING,
          TicketStatus.PENDING_FACTORY,
        ])),
        description: "客户发货或返厂跟进",
        tone: "amber",
      },
      { label: "进行中", value: active, description: "当前未结束的工单", tone: "violet" },
      { label: "已完成", value: completed, description: "流程已结束的工单", tone: "green" },
    ]
  }

  if (role === UserRole.BUSINESS) {
    return [
      {
        label: "待商务审核",
        value: countStatus(repairs, new Set([
          TicketStatus.BUSINESS_REVIEW,
          TicketStatus.PENDING_PAYMENT,
        ])),
        description: "等待收费与开票确认",
        tone: "amber",
      },
      { label: "进行中", value: active, description: "当前未结束的工单", tone: "violet" },
      { label: "已完成", value: completed, description: "流程已结束的工单", tone: "green" },
      { label: "可见工单", value: total, description: "当前权限范围内工单", tone: "blue" },
    ]
  }

  const abnormal = repairs.filter((repair) => {
    const status = normalizeTicketStatus(repair.status)
    return status !== null
      && TERMINAL_STATUSES.has(status)
      && status !== TicketStatus.COMPLETED
  }).length

  return [
    { label: "全部工单", value: total, description: "系统当前工单总数", tone: "blue" },
    { label: "进行中", value: active, description: "尚未结束的工单", tone: "violet" },
    { label: "已完成", value: completed, description: "正常完成的工单", tone: "green" },
    { label: "异常结束", value: abnormal, description: "取消、报废或拒修工单", tone: "amber" },
  ]
}
