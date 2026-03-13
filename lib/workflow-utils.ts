/**
 * 工单工作流工具函数
 * 定义工单在不同角色之间的流转规则和填写要求
 *
 * 注意：这里禁止直接使用字符串表示状态和角色，必须使用 `lib/enums.ts` 中的枚举，
 * 以避免 Magic Strings 并保持与数据库的一致性。
 */

import {
  TicketStatus,
  UserRole,
  TERMINAL_STATUSES,
  normalizeTicketStatus,
} from "@/lib/enums";

// ==================== 聚合状态定义 ====================
/**
 * 聚合状态：将多个详细状态归类为更简洁的业务阶段
 * 用于状态筛选和统计展示
 */
export enum AggregatedStatus {
  PENDING_RECEIVE = "pending_receive",    // 待接单（仓库尚未填写出厂日期）
  INSPECTING = "inspecting",             // 检测中（仓库已确认出厂日期，维修报告发出前）
  PENDING_SIGNATURE = "pending_signature", // 待签字（维修报告已发，等待现场签字）
  IN_REPAIR = "in_repair",                // 维修中（现场已签字，维修人员正在维修）
  PENDING_REVIEW = "pending_review",       // 待审核（商务审核）
  PENDING_SHIPPING = "pending_shipping",   // 待发货（仓库发货）
  COMPLETED = "completed",                 // 已完成
  ABNORMAL = "abnormal",                   // 异常
}

/**
 * 详细状态到聚合状态的映射表
 * 统一管理状态映射关系，避免在函数中硬编码
 */
export const STATUS_TO_AGGREGATED_MAP: Record<TicketStatus, AggregatedStatus> = {
  // 待接单：工单创建 → 仓库确认
  [TicketStatus.CREATED]: AggregatedStatus.PENDING_RECEIVE,
  [TicketStatus.WAREHOUSE_CONFIRMING]: AggregatedStatus.PENDING_RECEIVE,
  [TicketStatus.PENDING]: AggregatedStatus.PENDING_RECEIVE, // 兼容旧状态
  
  // 检测中：仓库已填写出厂日期（已确认），等待维修报告发出
  [TicketStatus.WAREHOUSE_CONFIRMED]: AggregatedStatus.INSPECTING,
  [TicketStatus.IN_REPAIR]: AggregatedStatus.INSPECTING,           // 兼容旧状态（检测阶段）
  [TicketStatus.PROCESSING]: AggregatedStatus.INSPECTING,          // 兼容旧状态
  [TicketStatus.WAREHOUSE_RECEIVED]: AggregatedStatus.INSPECTING,  // 兼容旧状态
  
  // 维修中：现场已签字，维修人员正在维修
  [TicketStatus.TECHNICIAN_REPAIRING]: AggregatedStatus.IN_REPAIR,
  
  // 待签字：等待现场人员签字
  [TicketStatus.PENDING_REPORTER_CONFIRM]: AggregatedStatus.PENDING_SIGNATURE,
  
  // 待审核：商务审核
  [TicketStatus.BUSINESS_REVIEW]: AggregatedStatus.PENDING_REVIEW,
  [TicketStatus.ADMIN_REVIEW]: AggregatedStatus.PENDING_REVIEW, // 兼容旧状态
  [TicketStatus.PENDING_PAYMENT]: AggregatedStatus.PENDING_REVIEW,
  
  // 待发货：仓库发货
  [TicketStatus.WAREHOUSE_SHIPPING]: AggregatedStatus.PENDING_SHIPPING,
  [TicketStatus.PENDING_SHIPMENT]: AggregatedStatus.PENDING_SHIPPING, // 兼容旧状态
  
  // 已完成
  [TicketStatus.COMPLETED]: AggregatedStatus.COMPLETED,
  
  // 异常状态
  [TicketStatus.UNREPAIRABLE]: AggregatedStatus.ABNORMAL,
  [TicketStatus.SCRAPPED]: AggregatedStatus.ABNORMAL,
  [TicketStatus.RETURN_UNREPAIRED]: AggregatedStatus.ABNORMAL,
  [TicketStatus.REJECTED_NO_RETURN]: AggregatedStatus.ABNORMAL,
  [TicketStatus.CANCELLED]: AggregatedStatus.ABNORMAL,
  [TicketStatus.DELETED]: AggregatedStatus.ABNORMAL,
  
  // 特殊流程状态 - 映射到最接近的阶段
  [TicketStatus.WARRANTY_CHECKING]: AggregatedStatus.INSPECTING,    // 保修检测，属于检测阶段
  [TicketStatus.IN_WARRANTY_REPAIR]: AggregatedStatus.IN_REPAIR,    // 保修内维修
  [TicketStatus.IN_WARRANTY_REPLACE]: AggregatedStatus.IN_REPAIR,   // 保修内换货
  [TicketStatus.OUT_WARRANTY_REPORT]: AggregatedStatus.IN_REPAIR,   // 过保维修报告
  [TicketStatus.CUSTOMER_CONFIRM]: AggregatedStatus.PENDING_SIGNATURE,
  [TicketStatus.OUT_WARRANTY_REPAIR]: AggregatedStatus.IN_REPAIR,
  [TicketStatus.PENDING_FACTORY]: AggregatedStatus.IN_REPAIR,
  [TicketStatus.FACTORY_FINISHED]: AggregatedStatus.IN_REPAIR,
  [TicketStatus.DELAYED]: AggregatedStatus.ABNORMAL,
};

/**
 * 聚合状态显示配置
 * 类型安全的配置对象，确保所有聚合状态都有对应的配置
 */
export const AGGREGATED_STATUS_CONFIG: Record<
  AggregatedStatus,
  {
    label: string;
    color: string;
    icon: string;
    description: string;
  }
> = {
  [AggregatedStatus.PENDING_RECEIVE]: {
    label: "待接单",
    color: "blue",
    icon: "📥",
    description: "工单已创建，等待仓库确认"
  },
  [AggregatedStatus.INSPECTING]: {
    label: "检测中",
    color: "indigo",
    icon: "🔍",
    description: "仓库已确认出厂日期，维修人员检测中"
  },
  [AggregatedStatus.IN_REPAIR]: {
    label: "维修中",
    color: "yellow",
    icon: "🔧",
    description: "现场已签字确认，维修人员正在维修"
  },
  [AggregatedStatus.PENDING_SIGNATURE]: {
    label: "待签字",
    color: "purple",
    icon: "✍️",
    description: "等待现场签字确认"
  },
  [AggregatedStatus.PENDING_REVIEW]: {
    label: "待审核",
    color: "orange",
    icon: "📋",
    description: "等待商务审核"
  },
  [AggregatedStatus.PENDING_SHIPPING]: {
    label: "待发货",
    color: "cyan",
    icon: "📦",
    description: "等待仓库发货"
  },
  [AggregatedStatus.COMPLETED]: {
    label: "已完成",
    color: "green",
    icon: "✅",
    description: "工单已完成"
  },
  [AggregatedStatus.ABNORMAL]: {
    label: "异常",
    color: "red",
    icon: "⚠️",
    description: "无法维修或已取消"
  },
};

export interface WorkflowStep {
  role: UserRole.TECHNICIAN | UserRole.ADMIN | UserRole.WAREHOUSE;
  status: TicketStatus;
  label: string;
  requiredFields: string[];
  optionalFields?: string[];
}

export interface FieldStatus {
  field: string;
  label: string;
  filled: boolean;
  required: boolean;
}

export interface TicketProgress {
  currentStep: WorkflowStep | null;
  nextStep: WorkflowStep | null;
  fields: FieldStatus[];
  completionRate: number;
  canProceed: boolean;
}

// 工作流步骤定义（严格使用枚举）
export const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    role: UserRole.TECHNICIAN,
    status: TicketStatus.CREATED,
    label: "待维修",
    requiredFields: ["faultPoint", "materialCode", "deviceName", "fullSpec"],
    optionalFields: ["supplierName"],
  },
  {
    role: UserRole.TECHNICIAN,
    status: TicketStatus.IN_REPAIR,
    label: "维修中",
    requiredFields: ["faultPoint", "materialCode", "deviceName", "fullSpec"],
    optionalFields: ["supplierName"],
  },
  {
    role: UserRole.ADMIN,
    status: TicketStatus.ADMIN_REVIEW,
    label: "待商务处理",
    requiredFields: ["repairCost", "clientName", "isInvoiced"],
    optionalFields: ["factoryRepairDate", "factoryTrackingNum"],
  },
  {
    role: UserRole.WAREHOUSE,
    status: TicketStatus.PENDING_SHIPMENT,
    label: "待发货",
    requiredFields: ["receivedDate", "factoryShipDate", "returnDate", "returnQuantity", "returnTrackingNum"],
  },
];

// 状态流转规则（使用枚举键值）
export const STATUS_TRANSITIONS: Record<TicketStatus, TicketStatus> = {
  [TicketStatus.CREATED]: TicketStatus.IN_REPAIR, // 维修人员开始处理
  [TicketStatus.IN_REPAIR]: TicketStatus.ADMIN_REVIEW, // 维修人员填写完成
  [TicketStatus.ADMIN_REVIEW]: TicketStatus.PENDING_SHIPMENT, // 管理员填写完成
  [TicketStatus.PENDING_SHIPMENT]: TicketStatus.COMPLETED, // 仓库人员填写快递单号
};

// 获取当前步骤
export function getCurrentStep(status: string | TicketStatus): WorkflowStep | null {
  const normalized = typeof status === "string" ? normalizeTicketStatus(status) : status;
  if (!normalized) return null;
  return WORKFLOW_STEPS.find((step) => step.status === normalized) || null;
}

// 获取下一步骤
export function getNextStep(status: string | TicketStatus): WorkflowStep | null {
  const normalized = typeof status === "string" ? normalizeTicketStatus(status) : status;
  if (!normalized) return null;
  const nextStatus = STATUS_TRANSITIONS[normalized];
  if (!nextStatus) return null;
  return WORKFLOW_STEPS.find((step) => step.status === nextStatus) || null;
}

// 检查字段是否已填写
export function checkFieldFilled(field: string, ticket: any): boolean {
  const fieldMap: Record<string, string[]> = {
    // 维修人员字段
    faultPoint: ["FaultPoint", "faultPoint"],
    materialCode: ["MaterialCode", "materialCode"],
    deviceName: ["DeviceName", "deviceName"],
    fullSpec: ["FullSpec", "fullSpec"],
    supplierName: ["SupplierName", "supplierName"],
    
    // 管理员字段
    repairCost: ["RepairCost", "repairCost"],
    clientName: ["ClientName", "clientName"],
    isInvoiced: ["IsInvoiced", "isInvoiced"],
    factoryRepairDate: ["FactoryRepairDate", "factoryRepairDate"],
    factoryTrackingNum: ["FactoryTrackingNum", "factoryTrackingNum"],
    
    // 仓库管理员字段
    receivedDate: ["ReceivedDate", "receivedDate"],
    factoryShipDate: ["FactoryShipDate", "factoryShipDate"],
    returnDate: ["ReturnDate", "returnDate"],
    returnQuantity: ["ReturnQuantity", "returnQuantity"],
    returnTrackingNum: ["ReturnTrackingNum", "returnTrackingNum"],
  };

  const fieldKeys = fieldMap[field] || [field];
  return fieldKeys.some(key => {
    const value = ticket[key];
    if (value === null || value === undefined) return false;
    if (typeof value === "string" && value.trim() === "") return false;
    if (typeof value === "number" && isNaN(value)) return false;
    if (typeof value === "boolean") return true; // 布尔值总是有效的
    return true;
  });
}

// 计算工单填写进度
export function calculateProgress(ticket: any, step: WorkflowStep | null): TicketProgress {
  if (!step) {
    return {
      currentStep: null,
      nextStep: null,
      fields: [],
      completionRate: 0,
      canProceed: false,
    };
  }

  const allFields = [...step.requiredFields, ...(step.optionalFields || [])];
  const fields: FieldStatus[] = allFields.map(field => {
    const fieldLabels: Record<string, string> = {
      faultPoint: "故障点",
      materialCode: "物料代码",
      deviceName: "设备名称",
      fullSpec: "完整规格",
      supplierName: "供应商名称",
      repairCost: "维修费用",
      clientName: "客户名称",
      isInvoiced: "是否开票",
      factoryRepairDate: "返厂日期",
      factoryTrackingNum: "返厂快递单号",
      receivedDate: "收到日期",
      factoryShipDate: "出厂日期",
      returnDate: "返还日期",
      returnQuantity: "返还数量",
      returnTrackingNum: "返还快递单号",
    };

    return {
      field,
      label: fieldLabels[field] || field,
      filled: checkFieldFilled(field, ticket),
      required: step.requiredFields.includes(field),
    };
  });

  const requiredFilled = fields.filter(f => f.required && f.filled).length;
  const totalRequired = step.requiredFields.length;
  const completionRate = totalRequired > 0 ? (requiredFilled / totalRequired) * 100 : 0;
  const canProceed = fields.filter(f => f.required).every(f => f.filled);

  return {
    currentStep: step,
    nextStep: getNextStep(step.status),
    fields,
    completionRate: Math.round(completionRate),
    canProceed,
  };
}

// 检查状态是否为终止状态
export function isTerminalStatus(status: string): boolean {
  const normalized = normalizeTicketStatus(status);
  if (!normalized) return false;
  return TERMINAL_STATUSES.includes(normalized);
}

// 根据角色获取待处理的工单状态
export function getPendingStatusesForRole(role: string): TicketStatus[] {
  const roleMap: Record<UserRole, TicketStatus[]> = {
    [UserRole.TECHNICIAN]: [TicketStatus.CREATED, TicketStatus.IN_REPAIR, TicketStatus.PROCESSING, TicketStatus.DELAYED],
    [UserRole.ADMIN]: [TicketStatus.ADMIN_REVIEW],
    [UserRole.BUSINESS]: [TicketStatus.ADMIN_REVIEW],
    [UserRole.WAREHOUSE]: [TicketStatus.PENDING_SHIPMENT, TicketStatus.RETURN_UNREPAIRED],
  };

  // 字符串角色先归一化到枚举
  const normalizedRole = (role || "").toLowerCase().trim() as UserRole;
  if (normalizedRole in roleMap) {
    return roleMap[normalizedRole as UserRole];
  }
  return [];
}

// 检查工单是否应该显示给某个角色（排除终止状态，除非是仓库查看Return_Unrepaired）
export function shouldShowToRole(ticket: any, role: string): boolean {
  const normalizedStatus = normalizeTicketStatus((ticket.status || "").toString());
  if (!normalizedStatus) return false;

  // Cancelled 状态永远不显示在待办列表
  if (normalizedStatus === TicketStatus.CANCELLED) {
    return false;
  }

  const normalizedRole = (role || "").toLowerCase().trim() as UserRole;

  // 仓库可以额外查看 Return_Unrepaired 状态的工单
  if (normalizedRole === UserRole.WAREHOUSE && normalizedStatus === TicketStatus.RETURN_UNREPAIRED) {
    return true;
  }

  const pendingStatuses = getPendingStatusesForRole(normalizedRole);
  return pendingStatuses.includes(normalizedStatus);
}

// ==================== 聚合状态工具函数 ====================

/**
 * 编译时验证：检查映射表是否覆盖了所有 TicketStatus
 * 这个类型断言会在编译时失败，如果映射表缺少任何状态
 */
type ValidateStatusMapping = {
  [K in TicketStatus]: K extends keyof typeof STATUS_TO_AGGREGATED_MAP ? true : never;
};

/**
 * 运行时验证：检查映射表的完整性
 * @internal 仅供开发和测试使用
 * @throws {Error} 如果映射表不完整
 */
export function validateStatusMapping(): void {
  const allStatuses = Object.values(TicketStatus);
  const mappedStatuses = Object.keys(STATUS_TO_AGGREGATED_MAP);
  
  const missingStatuses = allStatuses.filter(
    status => !mappedStatuses.includes(status)
  );
  
  if (missingStatuses.length > 0) {
    throw new Error(
      `[CRITICAL] 状态映射表不完整！缺少以下状态的映射: ${missingStatuses.join(", ")}`
    );
  }
}

/**
 * 工单状态优先级映射表
 * 用于批次工单状态聚合时判断哪个状态的进度更高
 * 数字越大表示进度越靠后
 */
export const STATUS_PRIORITY: Record<TicketStatus, number> = {
  // 标准工作流（优先级1-9）
  [TicketStatus.CREATED]: 1,
  [TicketStatus.WAREHOUSE_CONFIRMING]: 2,
  [TicketStatus.WAREHOUSE_CONFIRMED]: 3,
  [TicketStatus.IN_REPAIR]: 4,
  [TicketStatus.PENDING_REPORTER_CONFIRM]: 5,
  [TicketStatus.TECHNICIAN_REPAIRING]: 6,
  [TicketStatus.BUSINESS_REVIEW]: 7,
  [TicketStatus.WAREHOUSE_SHIPPING]: 8,
  [TicketStatus.COMPLETED]: 9,
  
  // 兼容旧状态
  [TicketStatus.PENDING]: 1,
  [TicketStatus.PROCESSING]: 4,
  [TicketStatus.WAREHOUSE_RECEIVED]: 2,
  [TicketStatus.ADMIN_REVIEW]: 7,
  [TicketStatus.PENDING_SHIPMENT]: 8,
  
  // 特殊流程状态
  [TicketStatus.WARRANTY_CHECKING]: 3,
  [TicketStatus.IN_WARRANTY_REPAIR]: 4,
  [TicketStatus.IN_WARRANTY_REPLACE]: 4,
  [TicketStatus.OUT_WARRANTY_REPORT]: 4,
  [TicketStatus.CUSTOMER_CONFIRM]: 5,
  [TicketStatus.OUT_WARRANTY_REPAIR]: 6,
  [TicketStatus.PENDING_FACTORY]: 6,
  [TicketStatus.FACTORY_FINISHED]: 6,
  [TicketStatus.PENDING_PAYMENT]: 7,
  
  // 终止状态（优先级较低，不影响批次进度）
  [TicketStatus.UNREPAIRABLE]: 0,
  [TicketStatus.SCRAPPED]: 0,
  [TicketStatus.RETURN_UNREPAIRED]: 0,
  [TicketStatus.REJECTED_NO_RETURN]: 0,
  [TicketStatus.CANCELLED]: 0,
  [TicketStatus.DELAYED]: 0,
  [TicketStatus.DELETED]: -1,
};

/**
 * 获取批次工单的聚合状态
 * 返回批次中进度最高的状态
 * @param tickets 批次中的工单列表
 * @returns 进度最高的状态
 */
export function getBatchAggregatedStatus(tickets: TicketLike[]): TicketStatus {
  if (!tickets || tickets.length === 0) {
    return TicketStatus.CREATED;
  }
  
  let highestStatus = TicketStatus.CREATED;
  let highestPriority = 0;
  
  tickets.forEach(ticket => {
    const status = ticket.status || ticket.Status;
    const normalized = typeof status === "string" ? normalizeTicketStatus(status) : status;
    
    if (normalized) {
      const priority = STATUS_PRIORITY[normalized] || 0;
      if (priority > highestPriority) {
        highestPriority = priority;
        highestStatus = normalized;
      }
    }
  });
  
  return highestStatus;
}

// 开发环境自动验证映射表完整性
if (process.env.NODE_ENV === "development") {
  try {
    validateStatusMapping();
    console.log("✅ [workflow-utils] 状态映射表验证通过");
  } catch (error) {
    console.error("❌ [workflow-utils] 状态映射表验证失败:", error);
    // 在开发环境中抛出错误，强制修复
    throw error;
  }
}

/**
 * 将详细的工单状态映射到聚合状态
 * @param status 工单状态（TicketStatus 或字符串）
 * @returns 聚合状态
 * @throws {Error} 如果状态无法识别（开发环境）
 */
export function getAggregatedStatus(status: string | TicketStatus | null | undefined): AggregatedStatus {
  // 处理空值
  if (!status) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[getAggregatedStatus] 收到空状态值，返回 ABNORMAL");
    }
    return AggregatedStatus.ABNORMAL;
  }
  
  // 规范化状态
  const normalized = typeof status === "string" ? normalizeTicketStatus(status) : status;
  
  if (!normalized) {
    if (process.env.NODE_ENV === "development") {
      console.warn(`[getAggregatedStatus] 无法规范化状态: "${status}"，返回 ABNORMAL`);
    }
    return AggregatedStatus.ABNORMAL;
  }
  
  // 从映射表查找
  const aggregatedStatus = STATUS_TO_AGGREGATED_MAP[normalized];
  
  if (!aggregatedStatus) {
    // 这种情况理论上不应该发生（如果映射表完整）
    if (process.env.NODE_ENV === "development") {
      console.error(`[getAggregatedStatus] 映射表缺失状态: "${normalized}"，请检查 STATUS_TO_AGGREGATED_MAP`);
    }
    return AggregatedStatus.ABNORMAL;
  }
  
  return aggregatedStatus;
}

/**
 * 获取聚合状态的显示信息
 * @param aggregatedStatus 聚合状态
 * @returns 状态显示配置
 */
export function getAggregatedStatusInfo(aggregatedStatus: AggregatedStatus) {
  return AGGREGATED_STATUS_CONFIG[aggregatedStatus];
}

/**
 * 工单对象的最小类型定义
 */
interface TicketLike {
  status?: string | TicketStatus | null;
  Status?: string | TicketStatus | null;
}

/**
 * 统计工单列表的各聚合状态数量
 * @param tickets 工单列表
 * @returns 各聚合状态的数量统计
 * @example
 * ```ts
 * const tickets = await fetchTickets();
 * const counts = countByAggregatedStatus(tickets);
 * console.log(`待接单: ${counts[AggregatedStatus.PENDING_RECEIVE]}`);
 * ```
 */
export function countByAggregatedStatus(tickets: TicketLike[]): Record<AggregatedStatus, number> {
  // 初始化计数器（确保所有状态都有初始值）
  const counts: Record<AggregatedStatus, number> = {
    [AggregatedStatus.PENDING_RECEIVE]: 0,
    [AggregatedStatus.INSPECTING]: 0,
    [AggregatedStatus.PENDING_SIGNATURE]: 0,
    [AggregatedStatus.IN_REPAIR]: 0,
    [AggregatedStatus.PENDING_REVIEW]: 0,
    [AggregatedStatus.PENDING_SHIPPING]: 0,
    [AggregatedStatus.COMPLETED]: 0,
    [AggregatedStatus.ABNORMAL]: 0,
  };

  // 验证输入
  if (!Array.isArray(tickets)) {
    if (process.env.NODE_ENV === "development") {
      console.error("[countByAggregatedStatus] 输入不是数组:", tickets);
    }
    return counts;
  }

  // 统计各状态数量
  tickets.forEach((ticket, index) => {
    if (!ticket) {
      if (process.env.NODE_ENV === "development") {
        console.warn(`[countByAggregatedStatus] 工单列表索引 ${index} 为空`);
      }
      return;
    }
    
    // 兼容不同的字段名（status 或 Status）
    const status = ticket.status || ticket.Status;
    const aggregatedStatus = getAggregatedStatus(status);
    counts[aggregatedStatus]++;
  });

  return counts;
}
