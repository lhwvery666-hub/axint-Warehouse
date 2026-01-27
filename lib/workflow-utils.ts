/**
 * 工单工作流工具函数
 * 定义工单在不同角色之间的流转规则和填写要求
 */

export interface WorkflowStep {
  role: "technician" | "admin" | "warehouse";
  status: string;
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

// 工作流步骤定义
export const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    role: "technician",
    status: "Created",
    label: "待维修",
    requiredFields: ["faultPoint", "materialCode", "deviceName", "fullSpec"],
    optionalFields: ["supplierName"],
  },
  {
    role: "technician",
    status: "In_Repair",
    label: "维修中",
    requiredFields: ["faultPoint", "materialCode", "deviceName", "fullSpec"],
    optionalFields: ["supplierName"],
  },
  {
    role: "admin",
    status: "Admin_Review",
    label: "待商务处理",
    requiredFields: ["repairCost", "clientName", "isInvoiced"],
    optionalFields: ["factoryRepairDate", "factoryTrackingNum"],
  },
  {
    role: "warehouse",
    status: "Pending_Shipment",
    label: "待发货",
    requiredFields: ["receivedDate", "factoryShipDate", "returnDate", "returnQuantity", "returnTrackingNum"],
  },
];

// 状态流转规则
export const STATUS_TRANSITIONS: Record<string, string> = {
  Created: "In_Repair", // 维修人员开始处理
  In_Repair: "Admin_Review", // 维修人员填写完成
  Admin_Review: "Pending_Shipment", // 管理员填写完成
  Pending_Shipment: "Completed", // 仓库人员填写快递单号
};

// 获取当前步骤
export function getCurrentStep(status: string): WorkflowStep | null {
  return WORKFLOW_STEPS.find(step => step.status === status) || null;
}

// 获取下一步骤
export function getNextStep(status: string): WorkflowStep | null {
  const nextStatus = STATUS_TRANSITIONS[status];
  if (!nextStatus) return null;
  return WORKFLOW_STEPS.find(step => step.status === nextStatus) || null;
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

// 终止状态列表（这些状态不会出现在待办列表中）
export const TERMINAL_STATUSES = ["Scrapped", "Return_Unrepaired", "Cancelled", "Completed", "Unrepairable", "Deleted"];

// 检查状态是否为终止状态
export function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.includes(status);
}

// 根据角色获取待处理的工单状态
export function getPendingStatusesForRole(role: string): string[] {
  const roleMap: Record<string, string[]> = {
    technician: ["Created", "In_Repair"],
    admin: ["Admin_Review"],
    business: ["Admin_Review"],
    warehouse: ["Pending_Shipment", "Return_Unrepaired"], // 仓库也能看到拒修退回的工单
  };
  return roleMap[role] || [];
}

// 检查工单是否应该显示给某个角色（排除终止状态，除非是仓库查看Return_Unrepaired）
export function shouldShowToRole(ticket: any, role: string): boolean {
  const status = (ticket.status || "").toString();
  
  // Cancelled状态永远不显示在待办列表
  if (status === "Cancelled") {
    return false;
  }
  
  // 仓库可以查看Return_Unrepaired状态的工单
  if (role === "warehouse" && status === "Return_Unrepaired") {
    return true;
  }
  
  const pendingStatuses = getPendingStatusesForRole(role);
  return pendingStatuses.includes(status);
}
