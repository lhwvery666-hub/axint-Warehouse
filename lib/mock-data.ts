// 模拟业务数据

// 项目地点
export const LOCATIONS: { id: string; name: string; address: string; city: string }[] = [];

// 物流公司
export const LOGISTICS: { id: string; name: string }[] = [];

// 用户账号类型（前端仅用于展示，不包含密码）
export interface User {
  id: string;
  username: string;
  realName: string; // 实名
  role: "technician" | "reporter" | "admin" | "warehouse";
  avatar?: string;
  phone?: string;
}

// 为避免在前端硬编码账号密码，这里不再提供默认用户列表
export const USERS: User[] = [];

// 爱克信设备库 - 更新数据结构
export interface Device {
  id: string;
  name: string;
  model: string;
  type?: string;
  status?: "active" | "inactive" | "maintenance";
}

// 更新设备数据库
export const VALID_DEVICES: Device[] = [];

// 设备ID验证函数
export function checkDeviceID(id: string): { valid: boolean; device?: Device } {
  const device = VALID_DEVICES.find(device => device.id === id);
  if (device) {
    return { valid: true, device };
  }
  return { valid: false };
}

// 工单状态
export type RepairStatus = "pending" | "processing" | "completed" | "delayed";

// 优先级
export type PriorityLevel = "low" | "medium" | "high" | "critical";

// 模拟工单数据
export interface RepairTask {
  id: string;
  deviceId: string;
  deviceName: string;
  location: string;
  fault: string;
  status: RepairStatus;
  priority: PriorityLevel;
  reportedAt: string;
  expectedCompletionDate?: Date;
  reporterName?: string;
  assignedTo?: string;
}

// 工单数据现在从数据库 API 获取，不再使用 localStorage
export const REPAIR_TASKS: RepairTask[] = [];