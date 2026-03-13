/**
 * 公司信息配置
 * 用于维修报告抬头等地方显示
 */

export const COMPANY_CONFIG = {
  // 公司名称
  name: "深圳市爱克信智能股份有限公司",
  
  // 公司全称（如需要）
  fullName: "深圳市爱克信智能股份有限公司",
  
  // 公司地址
  address: "",
  
  // 联系电话
  phone: "",
  
  // 传真
  fax: "",
  
  // 邮箱
  email: "",
  
  // 维修部联系信息
  repairDept: {
    contact: "黄工",
    phone: "13530978726",
    address: "深圳市宝安区石岩街道办民生一路嘉一达科技园6栋2楼",
  },
} as const;

/**
 * 获取公司名称
 */
export function getCompanyName(): string {
  return COMPANY_CONFIG.name;
}

/**
 * 获取公司全称
 */
export function getCompanyFullName(): string {
  return COMPANY_CONFIG.fullName;
}
