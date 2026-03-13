/**
 * 数据库字段检查工具函数
 * 统一管理所有API的字段检查逻辑
 */

import { getDbConnection } from './db-config'

// 缓存字段检查结果，避免重复查询
const fieldCheckCache = new Map<string, boolean>()

/**
 * 检查 Users 表是否包含指定字段
 * @param fieldName 字段名
 * @returns 是否包含该字段
 */
export async function checkUserTableField(fieldName: string): Promise<boolean> {
  // 检查缓存
  const cacheKey = `user_${fieldName}`
  if (fieldCheckCache.has(cacheKey)) {
    return fieldCheckCache.get(cacheKey)!
  }

  try {
    const pool = await getDbConnection()
    const result = await pool
      .request()
      .query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'Users' AND COLUMN_NAME = '${fieldName}'
      `)

    const hasField = result.recordset.length > 0
    // 缓存结果
    fieldCheckCache.set(cacheKey, hasField)
    return hasField
  } catch (error) {
    console.error(`检查字段 ${fieldName} 失败:`, error)
    return false
  }
}

/**
 * 批量检查 Users 表字段
 * @param fieldNames 要检查的字段名数组
 * @returns 字段存在性映射对象
 */
export async function checkUserTableFields(fieldNames: string[]): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {}
  
  // 检查缓存中是否已有所有结果
  const uncachedFields: string[] = []
  
  for (const fieldName of fieldNames) {
    const cacheKey = `user_${fieldName}`
    if (fieldCheckCache.has(cacheKey)) {
      results[fieldName] = fieldCheckCache.get(cacheKey)!
    } else {
      uncachedFields.push(fieldName)
    }
  }

  // 如果有未缓存的字段，批量查询
  if (uncachedFields.length > 0) {
    try {
      const pool = await getDbConnection()
      const fieldNameList = uncachedFields.map(name => `'${name}'`).join(', ')
      
      const result = await pool
        .request()
        .query(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_NAME = 'Users' AND COLUMN_NAME IN (${fieldNameList})
        `)

      const foundFields = result.recordset.map((r: any) => r.COLUMN_NAME)
      
      // 设置结果和缓存
      for (const fieldName of uncachedFields) {
        const hasField = foundFields.includes(fieldName)
        results[fieldName] = hasField
        fieldCheckCache.set(`user_${fieldName}`, hasField)
      }
    } catch (error) {
      console.error('批量检查字段失败:', error)
      // 查询失败时，所有未缓存字段默认为不存在
      for (const fieldName of uncachedFields) {
        results[fieldName] = false
        fieldCheckCache.set(`user_${fieldName}`, false)
      }
    }
  }

  return results
}

/**
 * 清除字段检查缓存
 * 在数据库结构变更后调用
 */
export function clearFieldCheckCache(): void {
  fieldCheckCache.clear()
}

/**
 * 获取标准的用户查询字段和条件
 * @param baseFields 基础字段列表
 * @returns 包含字段和SQL条件的对象
 */
export async function getUserQueryConfig(baseFields: string[] = ['UserID', 'Username', 'Role', 'RealName']) {
  const fieldChecks = await checkUserTableFields(['PhoneNumber', 'IsDeleted'])
  
  const fields = [...baseFields]
  const conditions: string[] = []
  
  if (fieldChecks.PhoneNumber) {
    fields.push('PhoneNumber')
  }
  
  if (fieldChecks.IsDeleted) {
    conditions.push('IsDeleted = 0')
  }
  
  return {
    fields: fields.join(', '),
    conditions: conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '',
    hasPhoneNumber: fieldChecks.PhoneNumber,
    hasIsDeleted: fieldChecks.IsDeleted
  }
}

/**
 * 构建用户查询的 WHERE 条件
 * @param identifier 用户标识符（用户名或ID）
 * @param field 字段名（Username 或 UserID）
 * @param additionalConditions 额外的WHERE条件
 * @returns WHERE条件字符串
 */
export async function buildUserWhereClause(
  identifier: string, 
  field: string = 'Username',
  additionalConditions: string[] = []
): Promise<string> {
  const { conditions } = await getUserQueryConfig()
  const allConditions = [`${field} = @${field}`, ...additionalConditions]
  
  if (conditions) {
    allConditions.push(conditions.replace('AND ', ''))
  }
  
  return allConditions.join(' AND ')
}
