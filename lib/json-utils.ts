/**
 * JSON安全解析工具函数
 * 用于安全解析维修报告内容，防止JSON格式错误导致页面崩溃
 */

/**
 * 安全解析JSON字符串
 * @param jsonString - 要解析的JSON字符串
 * @param defaultValue - 解析失败时返回的默认值
 * @returns 解析后的对象或默认值
 */
export function safeJsonParse<T = any>(
  jsonString: string | null | undefined,
  defaultValue: T
): T {
  // 如果输入为空，返回默认值
  if (!jsonString || typeof jsonString !== 'string' || jsonString.trim() === '') {
    return defaultValue;
  }

  try {
    const parsed = JSON.parse(jsonString);
    // 验证解析结果是否为对象或数组
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as T;
    }
    return defaultValue;
  } catch (error) {
    console.warn('JSON解析失败:', error, '原始字符串:', jsonString.substring(0, 100));
    return defaultValue;
  }
}

/**
 * 维修报告内容的默认结构
 */
export interface RepairReportContent {
  items?: Array<{
    deviceModel?: string;
    quantity?: number;
    serialNumber?: string;
    repairContent?: string;
    repairCost?: number;
    improvements?: string;
  }>;
  totalQuantity?: number;
  totalCost?: number;
  remarks?: string;
  customerName?: string;
  projectName?: string;
  customerAddress?: string;
  contactInfo?: string;
  from?: string;
  isOutOfWarranty?: string;
}

/**
 * 默认的维修报告内容结构
 */
export const DEFAULT_REPAIR_REPORT_CONTENT: RepairReportContent = {
  items: [],
  totalQuantity: 0,
  totalCost: 0,
  remarks: '',
  customerName: '',
  projectName: '',
  customerAddress: '',
  contactInfo: '',
  from: '',
  isOutOfWarranty: '',
};

/**
 * 安全解析维修报告内容
 * @param jsonString - 维修报告内容的JSON字符串
 * @returns 解析后的维修报告内容，如果解析失败返回默认结构
 */
export function safeParseRepairReportContent(
  jsonString: string | null | undefined
): RepairReportContent {
  return safeJsonParse<RepairReportContent>(
    jsonString,
    DEFAULT_REPAIR_REPORT_CONTENT
  );
}
