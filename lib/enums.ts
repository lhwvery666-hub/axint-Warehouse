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
  // === 新的标准工作流程 ===
  CREATED = "Created",                    // 1. 待处理（现场人员已创建）
  WAREHOUSE_CONFIRMING = "Warehouse_Confirming",  // 2. 仓库确认中（待确认设备信息并填写出厂日期）
  WAREHOUSE_CONFIRMED = "Warehouse_Confirmed",    // 3. 仓库已确认（出厂日期已填写，待维修人员检查）
  IN_REPAIR = "In_Repair",               // 4. 维修检查中（维修人员检查并完成报告）
  PENDING_REPORTER_CONFIRM = "Pending_Reporter_Confirm", // 5. 待现场确认（等待现场签字）
  TECHNICIAN_REPAIRING = "Technician_Repairing",  // 6. 维修作业中（收到签字，维修人员实际动手维修）
  BUSINESS_REVIEW = "Business_Review",    // 7. 商务审核（确认收款和开票）
  WAREHOUSE_SHIPPING = "Warehouse_Shipping",  // 8. 仓库发货（出库发回或入库）
  COMPLETED = "Completed",                // 9. 已完成
  
  // === 兼容旧状态 ===
  PENDING = "Pending",                   // 待处理（映射到 Created）
  PROCESSING = "Processing",              // 处理中（映射到 In_Repair）
  WAREHOUSE_RECEIVED = "Warehouse_Received",  // 仓库已收货（映射到 Warehouse_Confirming）
  ADMIN_REVIEW = "Admin_Review",          // 待商务处理（映射到 Business_Review）
  PENDING_SHIPMENT = "Pending_Shipment",  // 待发货（映射到 Warehouse_Shipping）
  
  // === 特殊流程状态 ===
  // 保修检查流程
  WARRANTY_CHECKING = "Warranty_Checking",    // 保修检查中
  
  // 保内流程
  IN_WARRANTY_REPAIR = "In_Warranty_Repair",  // 保内维修中
  IN_WARRANTY_REPLACE = "In_Warranty_Replace", // 保内需更换
  
  // 过保流程
  OUT_WARRANTY_REPORT = "Out_Warranty_Report", // 过保-待生成维修报告
  CUSTOMER_CONFIRM = "Customer_Confirm",       // 待客户确认维修
  OUT_WARRANTY_REPAIR = "Out_Warranty_Repair", // 过保-收费维修中
  
  // 返厂流程状态
  PENDING_FACTORY = "Pending_Factory",    // 待返厂/返厂中
  FACTORY_FINISHED = "Factory_Finished",  // 原厂修回/待复检
  
  // 其他商务状态
  PENDING_PAYMENT = "Pending_Payment",    // 待收款
  
  // === 终止状态 ===
  UNREPAIRABLE = "Unrepairable",          // 无法维修
  SCRAPPED = "Scrapped",                  // 已报废
  RETURN_UNREPAIRED = "Return_Unrepaired", // 拒修退回
  REJECTED_NO_RETURN = "Rejected_No_Return", // 拒修不回寄（入库待报废）
  CANCELLED = "Cancelled",                // 已取消
  
  // === 其他状态 ===
  DELAYED = "Delayed",                    // 已延期
  DELETED = "Deleted",                    // 已删除（回收站）
}

/**
 * 工单状态显示标签映射
 */
export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  // 新标准流程
  [TicketStatus.CREATED]: "待处理",
  [TicketStatus.WAREHOUSE_CONFIRMING]: "待仓库确认",
  [TicketStatus.WAREHOUSE_CONFIRMED]: "仓库已确认",
  [TicketStatus.IN_REPAIR]: "维修检查中",
  [TicketStatus.PENDING_REPORTER_CONFIRM]: "待现场确认",
  [TicketStatus.TECHNICIAN_REPAIRING]: "维修作业中",
  [TicketStatus.BUSINESS_REVIEW]: "待商务审核",
  [TicketStatus.WAREHOUSE_SHIPPING]: "待仓库发货",
  [TicketStatus.COMPLETED]: "已完成",
  
  // 兼容旧状态
  [TicketStatus.PENDING]: "待处理",
  [TicketStatus.PROCESSING]: "维修检查中",
  [TicketStatus.WAREHOUSE_RECEIVED]: "仓库已收货",
  [TicketStatus.ADMIN_REVIEW]: "待商务处理",
  [TicketStatus.PENDING_SHIPMENT]: "待发货",
  
  // 特殊流程
  [TicketStatus.WARRANTY_CHECKING]: "保修检查中",
  [TicketStatus.IN_WARRANTY_REPAIR]: "保内维修中",
  [TicketStatus.IN_WARRANTY_REPLACE]: "保内需更换",
  [TicketStatus.OUT_WARRANTY_REPORT]: "待生成维修报告",
  [TicketStatus.CUSTOMER_CONFIRM]: "待客户确认",
  [TicketStatus.OUT_WARRANTY_REPAIR]: "过保维修中",
  [TicketStatus.PENDING_FACTORY]: "待返厂",
  [TicketStatus.FACTORY_FINISHED]: "待复检",
  [TicketStatus.PENDING_PAYMENT]: "待收款",
  
  // 终止状态
  [TicketStatus.UNREPAIRABLE]: "无法维修",
  [TicketStatus.SCRAPPED]: "已报废",
  [TicketStatus.RETURN_UNREPAIRED]: "拒修退回",
  [TicketStatus.REJECTED_NO_RETURN]: "拒修不回寄",
  [TicketStatus.CANCELLED]: "已取消",
  [TicketStatus.DELAYED]: "已延期",
  [TicketStatus.DELETED]: "已删除",
};

/**
 * 工单状态到小写的映射（用于兼容性）
 */
export const TICKET_STATUS_MAP: Record<string, TicketStatus> = {
  // 新标准流程状态
  "created": TicketStatus.CREATED,
  "warehouse_confirming": TicketStatus.WAREHOUSE_CONFIRMING,
  "warehouse_confirmed": TicketStatus.WAREHOUSE_CONFIRMED,
  "in_repair": TicketStatus.IN_REPAIR,
  "pending_reporter_confirm": TicketStatus.PENDING_REPORTER_CONFIRM,
  "technician_repairing": TicketStatus.TECHNICIAN_REPAIRING,
  "business_review": TicketStatus.BUSINESS_REVIEW,
  "warehouse_shipping": TicketStatus.WAREHOUSE_SHIPPING,
  "completed": TicketStatus.COMPLETED,
  
  // 兼容旧状态
  "pending": TicketStatus.CREATED,
  "processing": TicketStatus.IN_REPAIR,
  "warehouse_received": TicketStatus.WAREHOUSE_CONFIRMING,
  "admin_review": TicketStatus.BUSINESS_REVIEW,
  "pending_shipment": TicketStatus.WAREHOUSE_SHIPPING,
  
  // 特殊流程状态
  "warranty_checking": TicketStatus.WARRANTY_CHECKING,
  "in_warranty_repair": TicketStatus.IN_WARRANTY_REPAIR,
  "in_warranty_replace": TicketStatus.IN_WARRANTY_REPLACE,
  "out_warranty_report": TicketStatus.OUT_WARRANTY_REPORT,
  "customer_confirm": TicketStatus.CUSTOMER_CONFIRM,
  "out_warranty_repair": TicketStatus.OUT_WARRANTY_REPAIR,
  "pending_factory": TicketStatus.PENDING_FACTORY,
  "factory_finished": TicketStatus.FACTORY_FINISHED,
  "pending_payment": TicketStatus.PENDING_PAYMENT,
  
  // 终止状态
  "unrepairable": TicketStatus.UNREPAIRABLE,
  "scrapped": TicketStatus.SCRAPPED,
  "return_unrepaired": TicketStatus.RETURN_UNREPAIRED,
  "rejected_no_return": TicketStatus.REJECTED_NO_RETURN,
  "cancelled": TicketStatus.CANCELLED,
  "deleted": TicketStatus.DELETED,
  "delayed": TicketStatus.DELAYED,
};

/**
 * 终止状态列表（这些状态不会出现在待办列表中）
 */
export const TERMINAL_STATUSES: TicketStatus[] = [
  TicketStatus.SCRAPPED,
  TicketStatus.RETURN_UNREPAIRED,
  TicketStatus.REJECTED_NO_RETURN,
  TicketStatus.CANCELLED,
  TicketStatus.COMPLETED,
  TicketStatus.UNREPAIRABLE,
  TicketStatus.DELETED,
];

/**
 * 有效状态列表（所有可能的状态）
 */
export const VALID_TICKET_STATUSES: TicketStatus[] = [
  // 新标准流程
  TicketStatus.CREATED,
  TicketStatus.WAREHOUSE_CONFIRMING,
  TicketStatus.WAREHOUSE_CONFIRMED,
  TicketStatus.IN_REPAIR,
  TicketStatus.PENDING_REPORTER_CONFIRM,
  TicketStatus.TECHNICIAN_REPAIRING,
  TicketStatus.BUSINESS_REVIEW,
  TicketStatus.WAREHOUSE_SHIPPING,
  TicketStatus.COMPLETED,
  
  // 兼容旧状态
  TicketStatus.PENDING,
  TicketStatus.PROCESSING,
  TicketStatus.WAREHOUSE_RECEIVED,
  TicketStatus.ADMIN_REVIEW,
  TicketStatus.PENDING_SHIPMENT,
  
  // 特殊流程
  TicketStatus.WARRANTY_CHECKING,
  TicketStatus.IN_WARRANTY_REPAIR,
  TicketStatus.IN_WARRANTY_REPLACE,
  TicketStatus.OUT_WARRANTY_REPORT,
  TicketStatus.CUSTOMER_CONFIRM,
  TicketStatus.OUT_WARRANTY_REPAIR,
  TicketStatus.PENDING_FACTORY,
  TicketStatus.FACTORY_FINISHED,
  TicketStatus.PENDING_PAYMENT,
  
  // 终止状态
  TicketStatus.UNREPAIRABLE,
  TicketStatus.SCRAPPED,
  TicketStatus.RETURN_UNREPAIRED,
  TicketStatus.REJECTED_NO_RETURN,
  TicketStatus.CANCELLED,
  TicketStatus.DELETED,
  TicketStatus.DELAYED,
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
  BATCH_CREATED = "BatchCreated",                     // 批次工单创建
  STATUS_CHANGE = "StatusChange",                     // 状态变更（通用，保留兼容）
  // 工作流各节点专属动作类型（精确映射到 OperationLogType）
  WAREHOUSE_CONFIRMED = "WarehouseConfirmed",         // 仓库确认
  REPAIR_REPORT_SUBMITTED = "RepairReportSubmitted",  // 维修报告提交（发送流程，现场可签字）
  REPAIR_REPORT_REVISED = "RepairReportRevised",      // 维修报告修订（已发送后再次修改，含金额变动记录）
  REPORTER_CONFIRMED = "ReporterConfirmed",           // 现场人员签字确认回传
  TECHNICIAN_COMPLETED = "TechnicianCompleted",       // 维修人员完成维修
  BUSINESS_REVIEWED = "BusinessReviewed",             // 商务审核完成
  BUSINESS_REVIEW_SKIPPED = "BusinessReviewSkipped",  // 免费维修，系统自动跳过商务审核
  WAREHOUSE_SHIPPED = "WarehouseShipped",             // 仓库发货/入库完成
  // 其他动作
  DELAY = "Delay",                                    // 延期
  CANCEL_REQUEST = "CancelRequest",                   // 取消申请
  CANCEL_APPROVED = "CancelApproved",                 // 取消申请已批准
  CANCEL_REJECTED = "CancelRejected",                 // 取消申请已拒绝
  SUPPLEMENT_SN = "SupplementSN",                     // 补录序列号
  BATCH_UPDATED = "BatchUpdated",                     // 批次工单更新
  REWIND_UPDATE = "Rewind_Update",                    // 状态自动回溯更新（编辑导致状态回退）
  MANUFACTURE_DATE_OVERRIDE = "ManufactureDateOverride", // 仓库人员在后期流程中特权修改出厂日期（不改变工单状态）
  RMA_REQUEST = "RMA_Request",                        // 返厂维修申请（填写返厂快递单号）
  FACTORY_RETURN_CONFIRMED = "FactoryReturnConfirmed", // 确认整批原厂返修设备已寄回
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

// ==================== 操作日志类型 ====================
/**
 * 批次工单操作日志类型枚举
 */
export enum OperationLogType {
  CREATED = "created",                          // 工单创建
  SUBMITTED = "submitted",                      // 工单提交（现场人员完成填写）
  WAREHOUSE_CONFIRMED = "warehouse_confirmed",   // 仓库确认
  REPAIR_REPORT_GENERATED = "repair_report_generated", // 维修报告生成（维修人员填写完成）
  REPORTER_CONFIRMED = "reporter_confirmed",     // 现场确认（签字回传）
  TECHNICIAN_COMPLETED = "technician_completed", // 维修完成
  BUSINESS_REVIEWED = "business_reviewed",       // 商务审核
  BUSINESS_REVIEW_SKIPPED = "business_review_skipped", // 免费维修，系统自动跳过商务审核
  WAREHOUSE_SHIPPED = "warehouse_shipped",       // 仓库发货
}

/**
 * 操作日志类型中文标签
 */
export const OPERATION_LOG_TYPE_LABELS: Record<OperationLogType, string> = {
  [OperationLogType.CREATED]: "创建了批次工单",
  [OperationLogType.SUBMITTED]: "提交了工单至仓库",
  [OperationLogType.WAREHOUSE_CONFIRMED]: "确认了设备信息并填写出厂日期",
  [OperationLogType.REPAIR_REPORT_GENERATED]: "生成了维修报告并发送现场签字",
  [OperationLogType.REPORTER_CONFIRMED]: "现场人员确认签字并回传",
  [OperationLogType.TECHNICIAN_COMPLETED]: "完成了维修并更新报告",
  [OperationLogType.BUSINESS_REVIEWED]: "完成了商务审核",
  [OperationLogType.BUSINESS_REVIEW_SKIPPED]: "免费维修，系统自动跳过商务审核",
  [OperationLogType.WAREHOUSE_SHIPPED]: "完成了发货/入库操作",
};

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
  PRODUCT_SN: "DeviceSN",  // 与 DEVICE_SN 指向同一列
  BATCH_ID: "BatchId",
  MODEL_NAME: "ModelName",
  DEVICE_NAME: "DeviceName",
  MATERIAL_CODE: "MaterialCode",
  PROJECT_LOCATION: "ProjectLocation",
  PROBLEM: "Problem",
  FAULT_DESCRIPTION: "FaultDescription",
  REPORT_TIME: "ReportTime",
  REPORT_BY_USER_ID: "ReportByUserID",
  CREATED_AT: "CreatedAt",  // 创建时间
  UPDATED_AT: "UpdatedAt",  // 更新时间
  
  // 现场人员字段
  SUBMIT_DATE: "SubmitDate",
  TRACKING_NUMBER_IN: "TrackingNumber_In",
  SENDER_ADDRESS: "SenderAddress",
  CONTACT_INFO: "ContactInfo",
  PROJECT_NAME: "ProjectName",
  CATEGORY: "Category",
  SUB_CATEGORY: "SubCategory",
  QUANTITY: "Quantity",
  FULL_SPEC: "FullSpec",
  
  // 维修人员字段
  FAULT_POINT: "FaultPoint",
  SUPPLIER_NAME: "SupplierName",
  REPAIR_COST: "RepairCost",
  REPAIR_ACTION: "RepairAction",    // 维修动作枚举值
  REPAIR_NOTES: "RepairNotes",      // 处理说明
  
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
  SHIPPING_TYPE: "ShippingType",  // 发货方式（return=发回客户, stock=入库）
  
  // 工作流时间戳字段（记录各环节完成时间和操作人）
  WAREHOUSE_CONFIRMED_AT: "WarehouseConfirmedAt",      // 仓库确认时间
  WAREHOUSE_CONFIRMED_BY: "WarehouseConfirmedBy",      // 仓库确认人
  TECHNICIAN_COMPLETED_AT: "TechnicianCompletedAt",    // 维修完成时间
  TECHNICIAN_COMPLETED_BY: "TechnicianCompletedBy",    // 维修完成人
  BUSINESS_REVIEWED_AT: "BusinessReviewedAt",          // 商务审核时间
  BUSINESS_REVIEWED_BY: "BusinessReviewedBy",          // 商务审核人
  WAREHOUSE_SHIPPED_AT: "WarehouseShippedAt",          // 仓库发货时间
  WAREHOUSE_SHIPPED_BY: "WarehouseShippedBy",          // 仓库发货人
  REPORTER_CONFIRMED_AT: "ReporterConfirmedAt",        // 现场确认时间
  
  // 取消申请字段
  CANCEL_REQUEST_STATUS: "CancelRequestStatus",
  CANCEL_REQUEST_REASON: "CancelRequestReason",
  CANCEL_REQUEST_DATE: "CancelRequestDate",
  CANCEL_APPROVED_BY: "CancelApprovedBy",
  CANCEL_APPROVED_DATE: "CancelApprovedDate",
  
  // 退回修改字段
  REVISION_REQUESTED_BY: "RevisionRequestedBy",
  REVISION_REQUEST_REASON: "RevisionRequestReason",
  REVISION_REQUEST_DATE: "RevisionRequestDate",
  REVISION_COUNT: "RevisionCount",
  
  // 其他字段
  COURIER_COMPANY: "CourierCompany",
  COURIER_NUMBER: "CourierNumber",
  DEVICE_PHOTOS: "DevicePhotos",
  DAMAGE_IMAGES: "DamageImages",
  WAREHOUSE: "Warehouse",
  WORK_ORDER_NUMBER: "WorkOrderNumber",
  
  // 现场确认字段（维修报告）
  SIGNED_REPORT_PHOTO: "SignedReportPhoto",  // 签字报告照片路径
  SIGNED_PHOTO_VIEWED_BY: "SignedPhotoViewedBy",  // 签字照片查看人（维修人员ID）
  SIGNED_PHOTO_VIEWED_AT: "SignedPhotoViewedAt",  // 签字照片查看时间
  SIGNED_PHOTO_MODIFY_REQUEST: "SignedPhotoModifyRequest",  // 签字照片修改申请记录（JSON）
  
  // 保修状态字段
  WARRANTY_STATUS: "WarrantyStatus",              // 系统计算保修状态（InWarranty/OutOfWarranty/Unknown）
  WARRANTY_STATUS_OVERRIDE: "WarrantyStatusOverride", // 人工覆盖保修状态（优先级高于系统计算）
  
  // Repair_Ticket_History 表字段（操作记录）
  HISTORY_ID: "HistoryID",
  HISTORY_TICKET_ID: "TicketID",
  HISTORY_BATCH_ID: "BatchId",
  HISTORY_ACTION_TYPE: "ActionType",
  HISTORY_OLD_STATUS: "OldStatus",
  HISTORY_NEW_STATUS: "NewStatus",
  HISTORY_ACTION_BY: "ActionBy",
  HISTORY_ACTION_NOTE: "ActionNote",
  HISTORY_OPERATOR_ID: "OperatorId",
  HISTORY_OPERATOR_NAME: "OperatorName",
  HISTORY_DESCRIPTION: "Description",
  HISTORY_CREATED_AT: "CreatedAt",
  
  // 其他基础字段
  REPORTED_BY: "ReportedBy",  // 报告人
} as const;

// ==================== 特殊值常量 ====================
/**
 * 特殊值常量
 */
export const SPECIAL_VALUES = {
  // 序列号特殊值
  PENDING_VERIFY: "待验证",     // 待验证（标签磨损/无法辨识）

  // 设备库存表 (Device_Inventory) Status 字段常量
  // ⚠️ 这些值来自 Device_Inventory 表，不是 Repair_Tickets.Status，不得与 TicketStatus 混用
  DEVICE_STATUS_IN_STOCK: "在库",        // 设备在库
  DEVICE_STATUS_OUT_STOCK: "出库",       // 设备已出库
  DEVICE_STATUS_IN_STOCK_EN: "In Stock", // 兼容英文值
  DEVICE_STATUS_OUT_STOCK_EN: "Out Stock", // 兼容英文值
  DEVICE_STATUS_REPAIRING: "维修中",     // 设备维修中（送修后更新至此状态）
} as const;

/**
 * 默认值常量
 */
export const DEFAULT_VALUES = {
  GENERIC_MODEL: "通用型号",     // 默认型号名称
} as const;

/**
 * 判断序列号是否为"待验证/无序列号"占位值。
 * ⚠️ 历史遗留问题：不同代码路径写入的占位值并不统一（"PENDING"、"PENDING_VERIFY"、"待验证"、
 * 空字符串、null 均代表"暂无真实序列号"），如果只做精确字符串比较，会把"占位值 A → 占位值 B"
 * 误判为"设备身份变更"，从而触发不必要的状态回退（如仓库确认后又被打回待确认）。
 * 所有需要比较 SN 是否发生"实质变化"的地方，都应先用本函数判断，而不是直接 === 比较原始字符串。
 */
export function isPendingSNPlaceholder(sn: string | null | undefined): boolean {
  if (!sn) return true;
  const upper = sn.trim().toUpperCase();
  return upper === "" || upper === "PENDING" || upper === "PENDING_VERIFY" || sn.trim() === SPECIAL_VALUES.PENDING_VERIFY;
}

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

// ==================== 保修状态枚举 ====================
/**
 * 保修状态枚举
 */
export enum WarrantyStatus {
  IN_WARRANTY = "InWarranty",           // 保内
  OUT_OF_WARRANTY = "OutOfWarranty",    // 过保
  UNKNOWN = "Unknown",                   // 未知（未检查）
}

export const WARRANTY_STATUS_LABELS: Record<WarrantyStatus, string> = {
  [WarrantyStatus.IN_WARRANTY]: "保内",
  [WarrantyStatus.OUT_OF_WARRANTY]: "过保",
  [WarrantyStatus.UNKNOWN]: "未知",
};

// ==================== 故障分类枚举 ====================
/**
 * 故障分类（用于维修工作台 3W1H 中的 What 维度）
 */
export enum FaultCategory {
  HARDWARE = "Hardware",   // 硬件损坏
  SOFTWARE = "Software",   // 软件故障
  HUMAN = "Human",         // 人为损坏
  AGING = "Aging",         // 自然老化
  OTHER = "Other",         // 其他
}

export const FAULT_CATEGORY_LABELS: Record<FaultCategory, string> = {
  [FaultCategory.HARDWARE]: "硬件损坏",
  [FaultCategory.SOFTWARE]: "软件故障",
  [FaultCategory.HUMAN]: "人为损坏",
  [FaultCategory.AGING]: "自然老化",
  [FaultCategory.OTHER]: "其他",
};

// ==================== 维修动作枚举 ====================
/**
 * 维修动作（用于维修工作台 3W1H 中的 How 维度）
 */
export enum RepairAction {
  ON_SITE_REPAIR   = "OnSiteRepair",      // 直接维修（旧名"现场修复"，标签已更新，DB 值不变）
  PART_REPLACEMENT = "PartReplacement",   // 更换配件
  REPLACE_DEVICE   = "ReplaceDevice",     // 更换设备
  RMA              = "RMA",               // 返厂维修（仅内部可见，现场人员不得看到）
  SCRAP            = "Scrap",             // 报废处理（保留兼容旧数据，不在下拉菜单中显示）
}

/**
 * 维修动作中文标签
 * ⚠️ 注意：对现场人员（REPORTER）显示时，RMA 应被替换为"维修"，不得透露返厂信息。
 */
export const REPAIR_ACTION_LABELS: Record<RepairAction, string> = {
  [RepairAction.ON_SITE_REPAIR]:   "直接维修",
  [RepairAction.PART_REPLACEMENT]: "更换配件",
  [RepairAction.REPLACE_DEVICE]:   "更换设备",
  [RepairAction.RMA]:              "返厂维修",
  [RepairAction.SCRAP]:            "报废处理",   // 兼容旧数据，不在维修动作下拉中展示
};

// ==================== 客户确认状态枚举 ====================
/**
 * 客户确认状态枚举
 */
export enum CustomerConfirmation {
  PENDING = "Pending",     // 待确认
  AGREED = "Agreed",       // 同意维修
  REJECTED = "Rejected",   // 拒绝维修
}

export const CUSTOMER_CONFIRMATION_LABELS: Record<CustomerConfirmation, string> = {
  [CustomerConfirmation.PENDING]: "待确认",
  [CustomerConfirmation.AGREED]: "同意维修",
  [CustomerConfirmation.REJECTED]: "拒绝维修",
};

// ==================== 维修最终处置结果枚举 ====================
/**
 * 维修人员提交最终处置结果时使用的枚举
 * 对应数据库 RepairReportContent.finalOutcome 字段的值
 */
export enum FinalOutcome {
  COMPLETED        = "Completed",        // 维修完成，正常返还
  SCRAPPED         = "Scrapped",         // 入库处理（报废/存库）
  RETURN_UNREPAIRED = "ReturnUnrepaired", // 无需维修，原件退回
}

export const FINAL_OUTCOME_LABELS: Record<FinalOutcome, string> = {
  [FinalOutcome.COMPLETED]:         "维修完成",
  [FinalOutcome.SCRAPPED]:          "入库处理",
  [FinalOutcome.RETURN_UNREPAIRED]: "无需维修退回",
};

// ==================== 维修结果枚举 ====================
/**
 * 维修结果枚举
 */
export enum RepairResult {
  REPAIRED = "Repaired",               // 已修复
  NEED_REPLACEMENT = "NeedReplacement", // 需更换
  UNREPAIRABLE = "Unrepairable",        // 无法维修
}

export const REPAIR_RESULT_LABELS: Record<RepairResult, string> = {
  [RepairResult.REPAIRED]: "已修复",
  [RepairResult.NEED_REPLACEMENT]: "需更换",
  [RepairResult.UNREPAIRABLE]: "无法维修",
};

// ==================== 保修工具函数 ====================
/**
 * 计算保修状态
 * @param manufactureDate 出厂日期
 * @param warrantyPeriodMonths 保修期（月）
 * @returns 保修状态
 */
export function calculateWarrantyStatus(
  manufactureDate: Date | string | null,
  warrantyPeriodMonths: number = 12
): WarrantyStatus {
  if (!manufactureDate) {
    return WarrantyStatus.UNKNOWN;
  }

  const mfgDate = typeof manufactureDate === 'string' ? new Date(manufactureDate) : manufactureDate;
  const now = new Date();
  const monthsDiff = (now.getFullYear() - mfgDate.getFullYear()) * 12 + (now.getMonth() - mfgDate.getMonth());

  return monthsDiff <= warrantyPeriodMonths ? WarrantyStatus.IN_WARRANTY : WarrantyStatus.OUT_OF_WARRANTY;
}

/**
 * 判断是否需要生成维修报告
 * @param warrantyStatus 保修状态
 * @returns 是否需要生成维修报告
 */
export function needRepairReport(warrantyStatus: WarrantyStatus): boolean {
  return warrantyStatus === WarrantyStatus.OUT_OF_WARRANTY;
}
