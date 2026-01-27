// 设备数据模拟
export interface Device {
  id: string;         // 设备编号
  name: string;       // 设备名称
  type: string;       // 设备类型
  location?: string;  // 设备所在位置
  status: 'active' | 'inactive' | 'maintenance'; // 设备状态
}

// 模拟设备数据
export const devices: Device[] = [];

// 项目地点数据
export interface ProjectLocation {
  id: string;
  name: string;
  address: string;
  city: string;
}

// 模拟项目地点数据
export const projectLocations: ProjectLocation[] = [];

// 快递公司数据
export const expressCompanies: { id: string; name: string }[] = [];