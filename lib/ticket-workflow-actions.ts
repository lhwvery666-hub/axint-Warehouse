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
  CONFIRM_SIGNATURE = "confirm_signature",       // 核对凭证并转交商务
  
  // 现场人员动作
  UPLOAD_SIGNATURE = "upload_signature",         // 上传签字凭证
  
  // 商务人员动作
  CONFIRM_PAYMENT = "confirm_payment",           // 确认收费完结，通知发货
}

/**
 * 动作显示标签映射
 */
export const TICKET_ACTION_LABELS: Record<TicketAction, string> = {
  [TicketAction.CONFIRM_RECEIPT]: "核对设备并确认收货",
  [TicketAction.CONFIRM_SHIPMENT]: "确认出库发货",
  [TicketAction.SEND_REPORT_FOR_SIGN]: "发送维修报告至现场确认",
  [TicketAction.CONFIRM_SIGNATURE]: "核对凭证并转交商务",
  [TicketAction.UPLOAD_SIGNATURE]: "上传签字凭证",
  [TicketAction.CONFIRM_PAYMENT]: "确认收费完结，通知发货",
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
  
  // 4. 待现场确认 -> 维修进行中（签字已上传）
  {
    currentStatus: TicketStatus.PENDING_REPORTER_CONFIRM,
    allowedRole: UserRole.REPORTER,
    action: TicketAction.UPLOAD_SIGNATURE,
    nextStatus: TicketStatus.TECHNICIAN_REPAIRING,
    requiresValidation: false, // 上传操作本身就是验证
  },
  
  // 5. 维修进行中（签字已上传）-> 商务审核
  {
    currentStatus: TicketStatus.TECHNICIAN_REPAIRING,
    allowedRole: UserRole.TECHNICIAN,
    action: TicketAction.CONFIRM_SIGNATURE,
    nextStatus: TicketStatus.BUSINESS_REVIEW,
    requiresValidation: false,
  },
  
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
];

// ==================== 工具函数 ====================

/**
 * 获取当前状态下当前角色可执行的动作
 * @param currentStatus 当前工单状态
 * @param currentUserRole 当前用户角色
 * @returns 可执行的工作流流转规则，如果没有则返回 null
 */
export function getAvailableAction(
  currentStatus: TicketStatus,
  currentUserRole: UserRole
): WorkflowTransition | null {
  return WORKFLOW_TRANSITIONS.find(
    (transition) =>
      transition.currentStatus === currentStatus &&
      transition.allowedRole === currentUserRole
  ) || null;
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
