/**
 * 系统配置管理工具
 * 从数据库读取配置，避免硬编码
 */

import { getDbConnection } from './db-config';

// 配置缓存
const configCache = new Map<string, any>();
let cacheExpiry: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

/**
 * 获取配置值
 * @param key 配置键
 * @param defaultValue 默认值
 * @returns 配置值
 */
export async function getConfig<T = string>(key: string, defaultValue?: T): Promise<T> {
  try {
    // 检查缓存
    const now = Date.now();
    if (configCache.has(key) && now < cacheExpiry) {
      return configCache.get(key) as T;
    }

    const pool = await getDbConnection();
    
    const result = await pool
      .request()
      .input('key', key)
      .query(`
        SELECT ConfigValue, ConfigType 
        FROM System_Config 
        WHERE ConfigKey = @key
      `);

    if (result.recordset.length === 0) {
      return defaultValue as T;
    }

    const { ConfigValue, ConfigType } = result.recordset[0];
    
    // 根据类型转换值
    let value: any = ConfigValue;
    switch (ConfigType) {
      case 'Number':
        value = Number(ConfigValue);
        break;
      case 'Boolean':
        value = ConfigValue.toLowerCase() === 'true';
        break;
      case 'JSON':
        value = JSON.parse(ConfigValue);
        break;
      default:
        value = ConfigValue;
    }

    // 更新缓存
    configCache.set(key, value);
    cacheExpiry = now + CACHE_DURATION;

    return value as T;
  } catch (error) {
    console.error(`获取配置失败 [${key}]:`, error);
    return defaultValue as T;
  }
}

/**
 * 获取多个配置
 * @param keys 配置键数组
 * @returns 配置对象
 */
export async function getConfigs(keys: string[]): Promise<Record<string, any>> {
  try {
    const pool = await getDbConnection();
    
    const keyList = keys.map(k => `'${k}'`).join(',');
    const result = await pool
      .request()
      .query(`
        SELECT ConfigKey, ConfigValue, ConfigType 
        FROM System_Config 
        WHERE ConfigKey IN (${keyList})
      `);

    const configs: Record<string, any> = {};
    
    for (const row of result.recordset) {
      const { ConfigKey, ConfigValue, ConfigType } = row;
      
      let value: any = ConfigValue;
      switch (ConfigType) {
        case 'Number':
          value = Number(ConfigValue);
          break;
        case 'Boolean':
          value = ConfigValue.toLowerCase() === 'true';
          break;
        case 'JSON':
          value = JSON.parse(ConfigValue);
          break;
        default:
          value = ConfigValue;
      }
      
      configs[ConfigKey] = value;
      configCache.set(ConfigKey, value);
    }

    cacheExpiry = Date.now() + CACHE_DURATION;
    return configs;
  } catch (error) {
    console.error('批量获取配置失败:', error);
    return {};
  }
}

/**
 * 设置配置值
 * @param key 配置键
 * @param value 配置值
 */
export async function setConfig(key: string, value: any): Promise<boolean> {
  try {
    const pool = await getDbConnection();
    
    // 获取配置类型
    const typeCheck = await pool
      .request()
      .input('key', key)
      .query(`
        SELECT ConfigType, IsEditable 
        FROM System_Config 
        WHERE ConfigKey = @key
      `);

    if (typeCheck.recordset.length === 0) {
      throw new Error(`配置键不存在: ${key}`);
    }

    const { ConfigType, IsEditable } = typeCheck.recordset[0];
    
    if (!IsEditable) {
      throw new Error(`配置不可编辑: ${key}`);
    }

    // 转换值为字符串
    let stringValue: string;
    switch (ConfigType) {
      case 'Number':
        stringValue = String(Number(value));
        break;
      case 'Boolean':
        stringValue = String(Boolean(value));
        break;
      case 'JSON':
        stringValue = JSON.stringify(value);
        break;
      default:
        stringValue = String(value);
    }

    // 更新配置
    await pool
      .request()
      .input('key', key)
      .input('value', stringValue)
      .query(`
        UPDATE System_Config 
        SET ConfigValue = @value, UpdatedAt = GETDATE()
        WHERE ConfigKey = @key
      `);

    // 清除缓存
    configCache.delete(key);
    
    return true;
  } catch (error) {
    console.error(`设置配置失败 [${key}]:`, error);
    return false;
  }
}

/**
 * 清除配置缓存
 */
export function clearConfigCache(): void {
  configCache.clear();
  cacheExpiry = 0;
}

/**
 * 获取所有配置（按分类）
 * @param category 配置分类
 * @returns 配置数组
 */
export async function getConfigsByCategory(category?: string): Promise<any[]> {
  try {
    const pool = await getDbConnection();
    
    const query = category
      ? `SELECT * FROM System_Config WHERE Category = @category ORDER BY ConfigKey`
      : `SELECT * FROM System_Config ORDER BY Category, ConfigKey`;

    const request = pool.request();
    if (category) {
      request.input('category', category);
    }

    const result = await request.query(query);
    return result.recordset;
  } catch (error) {
    console.error('获取配置列表失败:', error);
    return [];
  }
}

// 预定义的配置键（类型安全）
export const ConfigKeys = {
  // 保修相关
  WARRANTY_DEFAULT_PERIOD: 'warranty.default_period_months',
  WARRANTY_AUTO_CHECK: 'warranty.auto_check_enabled',
  
  // 维修报告
  REPORT_TEMPLATE: 'report.template',
  REPORT_REQUIRE_SIGNATURE: 'report.require_signature',
  
  // 工作流
  WORKFLOW_IN_WARRANTY_AUTO_APPROVE: 'workflow.in_warranty_auto_approve',
  WORKFLOW_OUT_WARRANTY_REQUIRE_CONFIRM: 'workflow.out_warranty_require_confirm',
  WORKFLOW_PAYMENT_REQUIRED: 'workflow.payment_required_for_out_warranty',
  
  // 导出
  EXPORT_SPLIT_BY_SN: 'export.split_by_serial_number',
  EXPORT_INCLUDE_DELETED: 'export.include_deleted',
  
  // 系统
  SYSTEM_COMPANY_NAME: 'system.company_name',
  SYSTEM_SUPPORT_PHONE: 'system.support_phone',
  SYSTEM_SUPPORT_EMAIL: 'system.support_email',
} as const;
