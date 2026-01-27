/**
 * 系统枚举和常量定义
 * 统一管理所有硬编码的字符串和数字，避免 Magic Strings/Numbers
 */

// ==================== 工单状态枚举 ====================
/**
 * 工单状态枚举
 * 对应数据库 Repair_Tickets 表的 Status 字段
 */
export enum TicketStatus {
  // 正常流程状态
  CREATED = "Created",                    // 待维修
  PENDING = "Pending",                   // 待处理（兼容旧状态，映射到 Created）
  IN_REPAIR = "In_Repair",               // 维修中
  PROCESSING = "Processing",              // 处理中（兼容旧状态，映射到 In_Repair）
  
  // 返厂流程状态
  PENDING_FACTORY = "Pending_Factory",    // 待返厂/返厂中
  FACTORY_FINISHED = "Factory_Finished",  // 原厂修回/待复检
  
  // 商务流程状态
  ADMIN_REVIEW = "Admin_Review",          // 待商务处理
  PENDING_SHIPMENT = "Pending_Shipment",  // 待发货
  
  // 完成状态
  COMPLETED = "Completed",                // 已完成
  UNREPAIRABLE = "Unrepairable",          // 无法维修
  
  // 终止状态
  SCRAPPED = "Scrapped",                  // 已报废
  RETURN_UNREPAIRED = "Return_Unrepaired", // 拒修退回
  CANCELLED = "Cancelled",                // 已取消
  
  // 其他状态
  DELAYED = "Delayed",                    // 已延期
  DELETED = "Deleted",                    // 已删除（回收站）
}

/**
 * 工单状态显示标签映射
 */
export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  [TicketStatus.CREATED]: "待处理",
  [TicketStatus.PENDING]: "待处理",
  [TicketStatus.IN_REPAIR]: "维修中",
  [TicketStatus.PROCESSING]: "维修中",
  [TicketStatus.PENDING_FACTORY]: "待返厂",
  [TicketStatus.FACTORY_FINISHED]: "待复检",
  [TicketStatus.ADMIN_REVIEW]: "待商务处理",
  [TicketStatus.PENDING_SHIPMENT]: "待发货",
  [TicketStatus.COMPLETED]: "已完成",
  [TicketStatus.UNREPAIRABLE]: "无法维修",
  [TicketStatus.SCRAPPED]: "已报废",
  [TicketStatus.RETURN_UNREPAIRED]: "拒修退回",
  [TicketStatus.CANCELLED]: "已取消",
  [TicketStatus.DELAYED]: "已延期",
  [TicketStatus.DELETED]: "已删除",
};

/**
 * 工单状态到小写的映射（用于兼容性）
 */
export const TICKET_STATUS_MAP: Record<string, TicketStatus> = {
  // 新状态
  "created": TicketStatus.CREATED,
  "in_repair": TicketStatus.IN_REPAIR,
  "pending_factory": TicketStatus.PENDING_FACTORY,
  "factory_finished": TicketStatus.FACTORY_FINISHED,
  "admin_review": TicketStatus.ADMIN_REVIEW,
  "pending_shipment": TicketStatus.PENDING_SHIPMENT,
  // 旧状态（向后兼容）
  "pending": TicketStatus.CREATED,
  "processing": TicketStatus.IN_REPAIR,
  "completed": TicketStatus.COMPLETED,
  "unrepairable": TicketStatus.UNREPAIRABLE,
  "deleted": TicketStatus.DELETED,
  "delayed": TicketStatus.DELAYED,
  // 终止状态
  "scrapped": TicketStatus.SCRAPPED,
  "return_unrepaired": TicketStatus.RETURN_UNREPAIRED,
  "cancelled": TicketStatus.CANCELLED,
};

/**
 * 终止状态列表（这些状态不会出现在待办列表中）
 */
export const TERMINAL_STATUSES: TicketStatus[] = [
  TicketStatus.SCRAPPED,
  TicketStatus.RETURN_UNREPAIRED,
  TicketStatus.CANCELLED,
  TicketStatus.COMPLETED,
  TicketStatus.UNREPAIRABLE,
  TicketStatus.DELETED,
];

/**
 * 有效状态列表（所有可能的状态）
 */
export const VALID_TICKET_STATUSES: TicketStatus[] = [
  TicketStatus.CREATED,
  TicketStatus.PENDING,
  TicketStatus.IN_REPAIR,
  TicketStatus.PROCESSING,
  TicketStatus.PENDING_FACTORY,
  TicketStatus.FACTORY_FINISHED,
  TicketStatus.ADMIN_REVIEW,
  TicketStatus.PENDING_SHIPMENT,
  TicketStatus.COMPLETED,
  TicketStatus.UNREPAIRABLE,
  TicketStatus.DELETED,
  TicketStatus.DELAYED,
  TicketStatus.SCRAPPED,
  TicketStatus.RETURN_UNREPAIRED,
  TicketStatus.CANCELLED,
];

// ==================== 用户角色枚举 ====================
/**
 * 用户角色枚举
 * 对应数据库 Users 表的 Role 字段
 */
export enum UserRole {
  TECHNICIAN = "technician",           // 维修工程师
  REPORTER = "reporter",               // 现场报告人员
  ADMIN = "admin",                     // 管理员
  WAREHOUSE = "warehouse",             // 仓库管理员
  BUSINESS = "business",               // 商务人员
}

/**
 * 数据库角色字符串到前端角色的映射
 * 支持多种数据库中的角色名称格式
 */
export const DB_ROLE_TO_USER_ROLE: Record<string, UserRole> = {
  // 英文角色名
  "admin": UserRole.ADMIN,
  "technician": UserRole.TECHNICIAN,
  "warehouse": UserRole.WAREHOUSE,
  "warehouse_manager": UserRole.WAREHOUSE,
  "warehousemanager": UserRole.WAREHOUSE,
  "warehouse_admin": UserRole.WAREHOUSE,
  "warehouseadmin": UserRole.WAREHOUSE,
  "reporter": UserRole.REPORTER,
  "site": UserRole.REPORTER,
  "fieldreporter": UserRole.REPORTER,
  "business": UserRole.BUSINESS,
  
  // 中文角色名
  "维修工程师": UserRole.TECHNICIAN,
  "维修人员": UserRole.TECHNICIAN,
  "现场报告人员": UserRole.REPORTER,
  "现场人员": UserRole.REPORTER,
  "仓库管理员": UserRole.WAREHOUSE,
  "仓库": UserRole.WAREHOUSE,
  "商务": UserRole.BUSINESS,
  "商务人员": UserRole.BUSINESS,
  "商务管理员": UserRole.BUSINESS,
};

/**
 * 用户角色显示标签映射
 */
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.TECHNICIAN]: "维修工程师",
  [UserRole.REPORTER]: "现场报告人员",
  [UserRole.ADMIN]: "管理员",
  [UserRole.WAREHOUSE]: "仓库管理员",
  [UserRole.BUSINESS]: "商务人员",
};

// ==================== 取消申请状态枚举 ====================
/**
 * 取消申请状态枚举
 */
export enum CancelRequestStatus {
  PENDING = "Pending",     // 待审批
  APPROVED = "Approved",   // 已批准
  REJECTED = "Rejected",   // 已拒绝
}

// ==================== 操作类型枚举 ====================
/**
 * 工单历史记录操作类型枚举
 */
export enum TicketActionType {
  STATUS_CHANGE = "StatusChange",       // 状态变更
  DELAY = "Delay",                      // 延期
  CANCEL_REQUEST = "CancelRequest",     // 取消申请
  CANCEL_APPROVED = "CancelApproved",   // 取消申请已批准
  CANCEL_REJECTED = "CancelRejected",  // 取消申请已拒绝
  SUPPLEMENT_SN = "SupplementSN",       // 补录序列号
}

// ==================== 路由路径常量 ====================
/**
 * 应用路由路径常量
 */
export const ROUTES = {
  HOME: "/",
  LOGIN: "/login",
  REGISTER: "/register",
  
  // 角色特定路由
  TECHNICIAN_TASKS: "/technician/tasks",
  REPORTER_REPORT: "/report",
  ADMIN_USERS: "/admin/users",
  ADMIN_DATABASE: "/admin/database",
  WAREHOUSE_DASHBOARD: "/warehouse/dashboard",
  WAREHOUSE_TICKETS: "/warehouse/tickets",
  BUSINESS_DASHBOARD: "/business",
  BUSINESS_PROFILE: "/business/profile",
  
  // 通用路由
  REPAIRS: "/repairs",
  RECYCLE_BIN: "/recycle-bin",
} as const;

// ==================== API 路径常量 ====================
/**
 * API 路径常量
 */
export const API_ROUTES = {
  AUTH_LOGIN: "/api/auth/login",
  AUTH_LOGOUT: "/api/auth/logout",
  AUTH_ME: "/api/auth/me",
  AUTH_REGISTER: "/api/auth/register",
  
  TICKETS: "/api/tickets",
  TICKETS_EXPORT: "/api/tickets/export",
  TICKET_DETAIL: (id: string) => `/api/tickets/${id}`,
  TICKET_UPDATE: (id: string) => `/api/tickets/${id}/update`,
  
  USERS: "/api/users",
  USER_DETAIL: (id: string) => `/api/users/${id}`,
} as const;

// ==================== 字段名称常量 ====================
/**
 * 数据库字段名称常量（用于动态查询）
 */
export const DB_FIELDS = {
  // 主键
  ID: "ID",
  
  // 基础字段
  STATUS: "Status",
  DEVICE_SN: "DeviceSN",
  PRODUCT_SN: "ProductSN",
  MODEL_NAME: "ModelName",
  DEVICE_NAME: "DeviceName",
  MATERIAL_CODE: "MaterialCode",
  PROJECT_LOCATION: "ProjectLocation",
  FAULT_DESCRIPTION: "FaultDescription",
  REPORT_TIME: "ReportTime",
  REPORT_BY_USER_ID: "ReportByUserID",
  
  // 现场人员字段
  SUBMIT_DATE: "SubmitDate",
  TRACKING_NUMBER_IN: "TrackingNumber_In",
  SENDER_ADDRESS: "SenderAddress",
  CONTACT_INFO: "ContactInfo",
  PROJECT_NAME: "ProjectName",
  CATEGORY: "Category",
  QUANTITY: "Quantity",
  FULL_SPEC: "FullSpec",
  
  // 维修人员字段
  FAULT_POINT: "FaultPoint",
  SUPPLIER_NAME: "SupplierName",
  REPAIR_COST: "RepairCost",
  
  // 管理员/商务字段
  IS_CHARGEABLE: "IsChargeable",
  IS_PAYMENT_RECEIVED: "IsPaymentReceived",
  IS_INVOICED: "IsInvoiced",
  CLIENT_NAME: "ClientName",
  FACTORY_RECEIVED_DATE: "FactoryReceivedDate",
  FACTORY_REPAIR_DATE: "FactoryRepairDate",
  FACTORY_TRACKING_NUM: "FactoryTrackingNum",
  
  // 仓库管理员字段
  RECEIVED_DATE: "ReceivedDate",
  FACTORY_SHIP_DATE: "FactoryShipDate",
  RETURN_DATE: "ReturnDate",
  RETURN_QUANTITY: "ReturnQuantity",
  RETURN_TRACKING_NUM: "ReturnTrackingNum",
  
  // 取消申请字段
  CANCEL_REQUEST_STATUS: "CancelRequestStatus",
  CANCEL_REQUEST_REASON: "CancelRequestReason",
  CANCEL_REQUEST_DATE: "CancelRequestDate",
  CANCEL_APPROVED_BY: "CancelApprovedBy",
  CANCEL_APPROVED_DATE: "CancelApprovedDate",
  
  // 其他字段
  COURIER_COMPANY: "CourierCompany",
  COURIER_NUMBER: "CourierNumber",
  DEVICE_IMAGES: "DeviceImages",
  DAMAGE_IMAGES: "DamageImages",
  WAREHOUSE: "Warehouse",
} as const;

// ==================== 特殊值常量 ====================
/**
 * 特殊值常量
 */
export const SPECIAL_VALUES = {
  // 序列号特殊值
  PENDING_VERIFY: "PENDING_VERIFY",     // 待验证（标签磨损/无法辨识）
  
  // 设备状态
  DEVICE_STATUS_IN_STOCK: "在库",        // 设备在库状态
} as const;

// ==================== 工具函数 ====================
/**
 * 将字符串状态转换为枚举（支持大小写不敏感）
 */
export function normalizeTicketStatus(status: string | null | undefined): TicketStatus | null {
  if (!status) return null;
  const normalized = status.toLowerCase().trim();
  return TICKET_STATUS_MAP[normalized] || null;
}

/**
 * 将数据库角色字符串转换为用户角色枚举
 */
export function normalizeUserRole(dbRole: string | null | undefined): UserRole | null {
  if (!dbRole) return null;
  const normalized = dbRole.toLowerCase().trim();
  return DB_ROLE_TO_USER_ROLE[normalized] || null;
}

/**
 * 检查状态是否为终止状态
 */
export function isTerminalStatus(status: string | TicketStatus): boolean {
  const normalized = typeof status === "string" 
    ? normalizeTicketStatus(status) 
    : status;
  if (!normalized) return false;
  return TERMINAL_STATUSES.includes(normalized);
}

/**
 * 检查状态是否为有效状态
 */
export function isValidTicketStatus(status: string | TicketStatus): boolean {
  const normalized = typeof status === "string" 
    ? normalizeTicketStatus(status) 
    : status;
  if (!normalized) return false;
  return VALID_TICKET_STATUSES.includes(normalized);
}
