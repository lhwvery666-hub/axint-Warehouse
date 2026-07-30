/**
 * 工单工作流动作定义
 * 定义每个状态下每个角色可以执行的操作
 * 
 * 业务闭环：现场 -> 仓库 -> 维修 -> 现场签字 -> 维修确认 -> 商务 -> 仓库发货 -> 完成
 */

import { TicketStatus, UserRole } from "@/lib/enums";

// ==================== 工作流动作枚举 ====================

/**
 * 工单工作流动作类型
 */
export enum TicketAction {
  // 仓库动作
  CONFIRM_RECEIPT = "confirm_receipt",          // 核对设备并确认收货
  CONFIRM_SHIPMENT = "confirm_shipment",        // 确认出库发货
  
  // 维修人员动作
  SEND_REPORT_FOR_SIGN = "send_report_for_sign", // 发送维修报告至现场确认
  REQUEST_FACTORY_REPAIR = "request_factory_repair", // 提交整批返厂维修申请
  /**
   * @deprecated 遗留动作，未被任何前端组件触发。
   * 该动作原本允许维修人员在"维修作业中"（Technician_Repairing）状态下
   * 直接核对签字凭证并一步转交商务审核，会跳过"手动确认完工/选择处理结果"这一步，
   * 与当前批次流程（complete-repair-batch 要求先填 finalOutcome 再手动提交）相冲突，
   * 属于可能导致状态机被绕过（跳步）的技术债。保留枚举值仅为兼容历史操作日志中可能存在的记录，
   * 对应的流转规则已从 WORKFLOW_TRANSITIONS 中移除，不应再被任何新代码使用。
   */
  CONFIRM_SIGNATURE = "confirm_signature",       // 核对凭证并转交商务（已废弃，勿使用）
  
  // 现场人员动作
  UPLOAD_SIGNATURE = "upload_signature",         // 上传签字凭证
  
  // 商务人员动作
  CONFIRM_PAYMENT = "confirm_payment",           // 确认收费完结，通知发货
  CONFIRM_FACTORY_RETURN = "confirm_factory_return", // 确认整批原厂返修设备已寄回
}

/**
 * 动作显示标签映射
 */
export const TICKET_ACTION_LABELS: Record<TicketAction, string> = {
  [TicketAction.CONFIRM_RECEIPT]: "核对设备并确认收货",
  [TicketAction.CONFIRM_SHIPMENT]: "确认出库发货",
  [TicketAction.SEND_REPORT_FOR_SIGN]: "发送维修报告至现场确认",
  [TicketAction.REQUEST_FACTORY_REPAIR]: "提交整批返厂维修申请",
  [TicketAction.CONFIRM_SIGNATURE]: "核对凭证并转交商务",
  [TicketAction.UPLOAD_SIGNATURE]: "上传签字凭证",
  [TicketAction.CONFIRM_PAYMENT]: "确认收费完结，通知发货",
  [TicketAction.CONFIRM_FACTORY_RETURN]: "确认收到整批原厂返修设备",
};

// ==================== 状态流转规则定义 ====================

/**
 * 状态流转规则接口
 */
export interface WorkflowTransition {
  currentStatus: TicketStatus;      // 当前状态
  allowedRole: UserRole;             // 允许执行的角色
  action: TicketAction;              // 执行的动作
  nextStatus: TicketStatus;          // 下一个状态
  requiresValidation?: boolean;      // 是否需要前置条件验证
  validationKey?: string;            // 验证键（用于前端判断）
}

/**
 * 完整的工作流流转规则表
 * 严格控制每个状态下每个角色只能执行特定的操作
 */
export const WORKFLOW_TRANSITIONS: WorkflowTransition[] = [
  // 1. 待处理 -> 仓库确认中
  {
    currentStatus: TicketStatus.CREATED,
    allowedRole: UserRole.WAREHOUSE,
    action: TicketAction.CONFIRM_RECEIPT,
    nextStatus: TicketStatus.WAREHOUSE_CONFIRMED,
    requiresValidation: true,
    validationKey: "all_devices_have_shipping_date",
  },
  
  // 2. 仓库已确认 -> 维修检查中
  // （自动流转，无需用户操作，当仓库确认后自动进入维修）
  
  // 3. 维修检查中 -> 待现场确认（待签字）
  {
    currentStatus: TicketStatus.IN_REPAIR,
    allowedRole: UserRole.TECHNICIAN,
    action: TicketAction.SEND_REPORT_FOR_SIGN,
    nextStatus: TicketStatus.PENDING_REPORTER_CONFIRM,
    requiresValidation: true,
    validationKey: "repair_report_complete",
  },
  {
    currentStatus: TicketStatus.IN_REPAIR,
    allowedRole: UserRole.TECHNICIAN,
    action: TicketAction.REQUEST_FACTORY_REPAIR,
    nextStatus: TicketStatus.PENDING_FACTORY,
    requiresValidation: true,
    validationKey: "factory_repair_details_complete",
  },
  {
    currentStatus: TicketStatus.TECHNICIAN_REPAIRING,
    allowedRole: UserRole.TECHNICIAN,
    action: TicketAction.REQUEST_FACTORY_REPAIR,
    nextStatus: TicketStatus.PENDING_FACTORY,
    requiresValidation: true,
    validationKey: "factory_repair_details_complete",
  },
  {
    currentStatus: TicketStatus.IN_REPAIR,
    allowedRole: UserRole.ADMIN,
    action: TicketAction.REQUEST_FACTORY_REPAIR,
    nextStatus: TicketStatus.PENDING_FACTORY,
    requiresValidation: true,
    validationKey: "factory_repair_details_complete",
  },
  {
    currentStatus: TicketStatus.TECHNICIAN_REPAIRING,
    allowedRole: UserRole.ADMIN,
    action: TicketAction.REQUEST_FACTORY_REPAIR,
    nextStatus: TicketStatus.PENDING_FACTORY,
    requiresValidation: true,
    validationKey: "factory_repair_details_complete",
  },
  
  // 4. 待现场确认 -> 维修进行中（签字已上传）
  {
    currentStatus: TicketStatus.PENDING_REPORTER_CONFIRM,
    allowedRole: UserRole.REPORTER,
    action: TicketAction.UPLOAD_SIGNATURE,
    nextStatus: TicketStatus.TECHNICIAN_REPAIRING,
    requiresValidation: false, // 上传操作本身就是验证
  },
  
  // 5. 维修作业中（签字已上传）-> 商务审核 / 仓库发货
  // ⚠️ 技术债清理：这里原本有一条 CONFIRM_SIGNATURE 规则，允许维修人员在
  // TECHNICIAN_REPAIRING 状态下"一步转交商务"，直接跳到 BUSINESS_REVIEW，
  // 完全跳过"选择每台设备最终处理结果 + 手动点击提交完工"这两步，是可能导致
  // 状态机被绕过（跳步）的死代码路径（未被任何前端组件实际触发）。
  // 该状态下真正生效的流转规则是 POST /api/tickets/complete-repair-batch/[batchId]，
  // 它会校验 finalOutcome 是否填写完整、当前状态是否确实为 TECHNICIAN_REPAIRING，
  // 再决定流转到 BUSINESS_REVIEW 或（免费批次）WAREHOUSE_SHIPPING。
  // 因此这里不再声明对应的 WORKFLOW_TRANSITIONS 规则，避免未来被误接到某个按钮上。
  
  // 6. 商务审核 -> 待仓库发货
  {
    currentStatus: TicketStatus.BUSINESS_REVIEW,
    allowedRole: UserRole.BUSINESS,
    action: TicketAction.CONFIRM_PAYMENT,
    nextStatus: TicketStatus.WAREHOUSE_SHIPPING,
    requiresValidation: false,
  },
  
  // 7. 待仓库发货 -> 已完成
  {
    currentStatus: TicketStatus.WAREHOUSE_SHIPPING,
    allowedRole: UserRole.WAREHOUSE,
    action: TicketAction.CONFIRM_SHIPMENT,
    nextStatus: TicketStatus.COMPLETED,
    requiresValidation: false,
  },
  {
    currentStatus: TicketStatus.PENDING_FACTORY,
    allowedRole: UserRole.ADMIN,
    action: TicketAction.CONFIRM_FACTORY_RETURN,
    nextStatus: TicketStatus.FACTORY_FINISHED,
    requiresValidation: false,
  },
  {
    currentStatus: TicketStatus.PENDING_FACTORY,
    allowedRole: UserRole.BUSINESS,
    action: TicketAction.CONFIRM_FACTORY_RETURN,
    nextStatus: TicketStatus.FACTORY_FINISHED,
    requiresValidation: false,
  },
];

// ==================== 工具函数 ====================

/**
 * 获取当前状态下当前角色可执行的动作
 * @param currentStatus 当前工单状态
 * @param currentUserRole 当前用户角色
 * @returns 可执行的工作流流转规则，如果没有则返回 null
 */
export function getAvailableActions(
  currentStatus: TicketStatus,
  currentUserRole: UserRole
): WorkflowTransition[] {
  return WORKFLOW_TRANSITIONS.filter(
    (transition) =>
      transition.currentStatus === currentStatus &&
      transition.allowedRole === currentUserRole
  );
}

/**
 * 检查用户是否有权限执行指定动作
 * @param action 要执行的动作
 * @param currentStatus 当前工单状态
 * @param currentUserRole 当前用户角色
 * @returns 是否有权限
 */
export function canExecuteAction(
  action: TicketAction,
  currentStatus: TicketStatus,
  currentUserRole: UserRole
): boolean {
  const transition = WORKFLOW_TRANSITIONS.find(
    (t) =>
      t.action === action &&
      t.currentStatus === currentStatus &&
      t.allowedRole === currentUserRole
  );
  return !!transition;
}

/**
 * 根据动作和已验证的用户角色获取唯一的服务端流转规则。
 *
 * 服务端必须使用该函数决定 expectedStatus，不能相信客户端提交的 currentStatus。
 */
export function getTransitionsForActionAndRole(
  action: TicketAction,
  currentUserRole: UserRole
): WorkflowTransition[] {
  return WORKFLOW_TRANSITIONS.filter(
    (transition) =>
      transition.action === action &&
      transition.allowedRole === currentUserRole
  );
}

/**
 * 获取动作执行后的下一个状态
 * @param action 执行的动作
 * @param currentStatus 当前状态
 * @returns 下一个状态，如果找不到则返回 null
 */
export function getNextStatusForAction(
  action: TicketAction,
  currentStatus: TicketStatus
): TicketStatus | null {
  const transition = WORKFLOW_TRANSITIONS.find(
    (t) => t.action === action && t.currentStatus === currentStatus
  );
  return transition?.nextStatus || null;
}

/**
 * 验证动作是否需要前置条件检查
 * @param action 要执行的动作
 * @param currentStatus 当前状态
 * @returns 是否需要验证
 */
export function requiresValidation(
  action: TicketAction,
  currentStatus: TicketStatus
): boolean {
  const transition = WORKFLOW_TRANSITIONS.find(
    (t) => t.action === action && t.currentStatus === currentStatus
  );
  return transition?.requiresValidation || false;
}
