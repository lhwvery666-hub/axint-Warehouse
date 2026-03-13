/**
 * 系统配置管理工具
 * 提供角色、状态、权限等配置的统一访问接口
 */

import { getDbConnection } from './db-config';

// 配置缓存
const configCache = new Map<string, any>();
const cacheExpiry = new Map<string, number>();
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

// ==================== 基础配置接口 ====================

export interface SystemConfig {
  key: string;
  value: any;
  type: 'string' | 'number' | 'boolean' | 'json';
  category: string;
  description?: string;
  isEditable: boolean;
}

export interface RoleConfig {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  routes: string[];
  color: string;
  icon: string;
}

export interface StatusConfig {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  category: string;
  nextStatuses: string[];
  rolesCanView: string[];
  rolesCanEdit: string[];
}

// ==================== 配置获取函数 ====================

/**
 * 获取单个配置值
 */
export async function getConfig(key: string, defaultValue?: any): Promise<any> {
  // 检查缓存
  const cached = configCache.get(key);
  const expiry = cacheExpiry.get(key);
  
  if (cached && expiry && Date.now() < expiry) {
    return cached;
  }

  try {
    const pool = await getDbConnection();
    const result = await pool.request()
      .input('key', key)
      .query(`
        SELECT ConfigValue, ConfigType 
        FROM System_Config 
        WHERE ConfigKey = @key
      `);

    if (result.recordset.length === 0) {
      return defaultValue;
    }

    const { ConfigValue, ConfigType } = result.recordset[0];
    let parsedValue = ConfigValue;

    // 根据类型解析值
    switch (ConfigType) {
      case 'number':
        parsedValue = Number(ConfigValue);
        break;
      case 'boolean':
        parsedValue = ConfigValue === 'true';
        break;
      case 'json':
        try {
          parsedValue = JSON.parse(ConfigValue);
        } catch (e) {
          console.warn(`Failed to parse JSON config for key: ${key}`);
          parsedValue = defaultValue;
        }
        break;
    }

    // 缓存结果
    configCache.set(key, parsedValue);
    cacheExpiry.set(key, Date.now() + CACHE_DURATION);

    return parsedValue;
  } catch (error) {
    console.error(`Error getting config ${key}:`, error);
    return defaultValue;
  }
}

/**
 * 获取分类配置
 */
export async function getConfigByCategory(category: string): Promise<SystemConfig[]> {
  try {
    const pool = await getDbConnection();
    const result = await pool.request()
      .input('category', category)
      .query(`
        SELECT 
          ConfigKey as key,
          ConfigValue as value,
          ConfigType as type,
          Category as category,
          Description as description,
          IsEditable as isEditable
        FROM System_Config 
        WHERE Category = @category
        ORDER BY ConfigKey
      `);

    const configs: SystemConfig[] = [];
    
    for (const row of result.recordset) {
      let parsedValue = row.value;
      
      switch (row.type) {
        case 'number':
          parsedValue = Number(row.value);
          break;
        case 'boolean':
          parsedValue = row.value === 'true';
          break;
        case 'json':
          try {
            parsedValue = JSON.parse(row.value);
          } catch (e) {
            console.warn(`Failed to parse JSON config for key: ${row.key}`);
          }
          break;
      }

      configs.push({
        key: row.key,
        value: parsedValue,
        type: row.type,
        category: row.category,
        description: row.description,
        isEditable: row.isEditable
      });
    }

    return configs;
  } catch (error) {
    console.error(`Error getting configs for category ${category}:`, error);
    return [];
  }
}

/**
 * 获取所有配置
 */
export async function getAllConfigs(): Promise<SystemConfig[]> {
  try {
    const pool = await getDbConnection();
    const result = await pool.request().query(`
      SELECT 
        ConfigKey as key,
        ConfigValue as value,
        ConfigType as type,
        Category as category,
        Description as description,
        IsEditable as isEditable
        FROM System_Config 
        ORDER BY Category, ConfigKey
    `);

    const configs: SystemConfig[] = [];
    
    for (const row of result.recordset) {
      let parsedValue = row.value;
      
      switch (row.type) {
        case 'number':
          parsedValue = Number(row.value);
          break;
        case 'boolean':
          parsedValue = row.value === 'true';
          break;
        case 'json':
          try {
            parsedValue = JSON.parse(row.value);
          } catch (e) {
            console.warn(`Failed to parse JSON config for key: ${row.key}`);
          }
          break;
      }

      configs.push({
        key: row.key,
        value: parsedValue,
        type: row.type,
        category: row.category,
        description: row.description,
        isEditable: row.isEditable
      });
    }

    return configs;
  } catch (error) {
    console.error('Error getting all configs:', error);
    return [];
  }
}

// ==================== 角色配置函数 ====================

/**
 * 获取所有角色配置
 */
export async function getAllRoles(): Promise<RoleConfig[]> {
  const roleConfigs = await getConfigByCategory('roles');
  return roleConfigs.map(config => config.value as RoleConfig);
}

/**
 * 获取单个角色配置
 */
export async function getRole(roleId: string): Promise<RoleConfig | null> {
  const roleConfig = await getConfig(`system.roles.${roleId}`);
  return roleConfig as RoleConfig || null;
}

/**
 * 检查用户是否有指定权限
 */
export async function hasPermission(userRole: string, permission: string): Promise<boolean> {
  const role = await getRole(userRole);
  if (!role) return false;
  
  return role.permissions.includes('all') || role.permissions.includes(permission);
}

/**
 * 检查用户是否可以访问指定路由
 */
export async function canAccessRoute(userRole: string, route: string): Promise<boolean> {
  const role = await getRole(userRole);
  if (!role) return false;
  
  return role.routes.includes('/admin') || // 管理员可以访问所有路由
         role.routes.includes(route) ||
         role.routes.some(r => route.startsWith(r));
}

// ==================== 状态配置函数 ====================

/**
 * 获取所有状态配置
 */
export async function getAllStatuses(): Promise<StatusConfig[]> {
  const statusConfigs = await getConfigByCategory('status');
  return statusConfigs.map(config => config.value as StatusConfig);
}

/**
 * 获取单个状态配置
 */
export async function getStatus(statusId: string): Promise<StatusConfig | null> {
  const statusConfig = await getConfig(`system.status.${statusId}`);
  return statusConfig as StatusConfig || null;
}

/**
 * 检查用户是否可以查看指定状态
 */
export async function canViewStatus(userRole: string, statusId: string): Promise<boolean> {
  const status = await getStatus(statusId);
  if (!status) return false;
  
  return status.rolesCanView.includes(userRole);
}

/**
 * 检查用户是否可以编辑指定状态
 */
export async function canEditStatus(userRole: string, statusId: string): Promise<boolean> {
  const status = await getStatus(statusId);
  if (!status) return false;
  
  return status.rolesCanEdit.includes(userRole);
}

/**
 * 获取状态的下一个可选状态
 */
export async function getNextStatuses(currentStatusId: string): Promise<string[]> {
  const status = await getStatus(currentStatusId);
  return status?.nextStatuses || [];
}

// ==================== 配置更新函数 ====================

/**
 * 更新配置值
 */
export async function updateConfig(key: string, value: any, updatedBy?: string): Promise<boolean> {
  try {
    const pool = await getDbConnection();
    
    // 获取配置类型
    const typeResult = await pool.request()
      .input('key', key)
      .query('SELECT ConfigType FROM System_Config WHERE ConfigKey = @key');
    
    if (typeResult.recordset.length === 0) {
      return false;
    }

    const configType = typeResult.recordset[0].ConfigType;
    let stringValue = value;

    // 根据类型转换值
    switch (configType) {
      case 'json':
        stringValue = JSON.stringify(value);
        break;
      default:
        stringValue = String(value);
    }

    await pool.request()
      .input('key', key)
      .input('value', stringValue)
      .input('updatedBy', updatedBy || 'system')
      .query(`
        UPDATE System_Config 
        SET ConfigValue = @value, UpdatedAt = GETDATE(), UpdatedBy = @updatedBy
        WHERE ConfigKey = @key
      `);

    // 清除缓存
    configCache.delete(key);
    cacheExpiry.delete(key);

    return true;
  } catch (error) {
    console.error(`Error updating config ${key}:`, error);
    return false;
  }
}

// ==================== 缓存管理 ====================

/**
 * 清除配置缓存
 */
export function clearConfigCache(key?: string): void {
  if (key) {
    configCache.delete(key);
    cacheExpiry.delete(key);
  } else {
    configCache.clear();
    cacheExpiry.clear();
  }
}

/**
 * 预热缓存
 */
export async function warmupCache(): Promise<void> {
  try {
    const configs = await getAllConfigs();
    for (const config of configs) {
      configCache.set(config.key, config.value);
      cacheExpiry.set(config.key, Date.now() + CACHE_DURATION);
    }
    console.log(`✅ 预热缓存完成，加载了 ${configs.length} 个配置项`);
  } catch (error) {
    console.error('❌ 预热缓存失败:', error);
  }
}

// ==================== 工具函数 ====================

/**
 * 获取公司信息
 */
export async function getCompanyInfo() {
  return {
    name: await getConfig('system.company.name', '公司名称'),
    phone: await getConfig('system.company.phone', ''),
    email: await getConfig('system.company.email', ''),
    address: await getConfig('system.company.address', '')
  };
}

/**
 * 获取用户默认路由
 */
export async function getDefaultRoute(userRole: string): Promise<string> {
  return await getConfig(`routes.default.${userRole}`, '/');
}

/**
 * 获取业务配置
 */
export async function getBusinessConfig() {
  return {
    warrantyPeriodMonths: await getConfig('business.warranty.default_period_months', 12),
    warrantyAutoCheck: await getConfig('business.warranty.auto_check', true),
    reportRequireSignature: await getConfig('business.report.require_signature', true),
    exportSplitBySerial: await getConfig('business.export.split_by_serial', true)
  };
}
