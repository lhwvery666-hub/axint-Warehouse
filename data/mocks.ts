// data/mocks.ts

export type Device = {
  id: number;
  model: string;
  name: string;
  type: 'controller' | 'face_terminal' | 'fingerprint' | 'reader' | 'gate';
  status: '正常' | '离线' | '故障';
  location: string; // 模拟设备所在位置
  serialNumber?: string; // 设备序列号
  warrantyStart?: string; // 保修开始时间
  warrantyEnd?: string; // 保修结束时间
};

// 虚拟数据已移除，所有数据现在从 SQL Server 数据库获取
export const MOCK_DEVICES: Device[] = [];

export const MOCK_LOGISTICS = [
  { id: 'SF001', name: '顺丰速运', speed: '极速', method: '空运' },
  { id: 'KY002', name: '跨越速运', speed: '快速', method: '陆运' },
  { id: 'DB003', name: '德邦快递', speed: '标准', method: '大件卡车' },
];