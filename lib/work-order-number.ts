/**
 * 工单编号生成工具
 * 
 * 功能：
 * - 生成唯一的工单编号（格式：wx00001, wx00002, ...）
 * - 线程安全（使用数据库存储过程确保并发安全）
 * - 自动递增
 * 
 * 使用前提：
 * - 必须先运行 `npm run reset-tickets` 创建序列表和存储过程
 */

import sql from 'mssql';
import { getDbConnection } from './db-config';

/**
 * 生成下一个工单编号
 * 
 * 使用数据库存储过程生成唯一的工单编号，确保并发安全
 * 
 * @returns Promise<string> 工单编号，格式：wx00001, wx00002, ...
 * @throws Error 如果数据库操作失败或序列表未初始化
 * 
 * @example
 * ```typescript
 * const workOrderNumber = await getNextWorkOrderNumber();
 * console.log(workOrderNumber); // 输出：wx00001
 * ```
 */
export async function getNextWorkOrderNumber(): Promise<string> {
  let pool: sql.ConnectionPool | null = null;

  try {
    pool = await getDbConnection();

    // 检查存储过程是否存在
    const procExistsResult = await pool.request().query(`
      SELECT OBJECT_ID('dbo.sp_GetNextWorkOrderNumber', 'P') as procId
    `);
    const procExists = procExistsResult.recordset[0]?.procId !== null;

    if (!procExists) {
      throw new Error(
        '工单编号生成存储过程不存在。' +
        '请先运行 `npm run reset-tickets` 创建序列表和存储过程。'
      );
    }

    // 调用存储过程生成工单编号
    const result = await pool.request()
      .output('workOrderNumber', sql.NVarChar(20))
      .execute('sp_GetNextWorkOrderNumber');

    const workOrderNumber = result.output.workOrderNumber;

    if (!workOrderNumber) {
      throw new Error('生成工单编号失败：存储过程返回空值');
    }

    return workOrderNumber;

  } catch (error: any) {
    console.error('[getNextWorkOrderNumber] 错误:', error);
    throw new Error(`生成工单编号失败: ${error.message}`);
  } finally {
    // 不关闭连接池，让连接池管理器处理
    // if (pool) {
    //   await pool.close();
    // }
  }
}

/**
 * 获取当前工单编号序列值（不递增）
 * 
 * 用于查看当前序列的状态
 * 
 * @returns Promise<{ currentValue: number; prefix: string; updatedAt: Date }>
 * @throws Error 如果序列表不存在
 * 
 * @example
 * ```typescript
 * const sequence = await getCurrentSequenceValue();
 * console.log(sequence);
 * // 输出：{ currentValue: 42, prefix: 'wx', updatedAt: 2026-02-26T... }
 * ```
 */
export async function getCurrentSequenceValue(): Promise<{
  currentValue: number;
  prefix: string;
  updatedAt: Date;
}> {
  let pool: sql.ConnectionPool | null = null;

  try {
    pool = await getDbConnection();

    // 检查序列表是否存在
    const tableExistsResult = await pool.request().query(`
      SELECT OBJECT_ID('dbo.Ticket_Sequence', 'U') as tableId
    `);
    const tableExists = tableExistsResult.recordset[0]?.tableId !== null;

    if (!tableExists) {
      throw new Error(
        '工单序列表不存在。' +
        '请先运行 `npm run reset-tickets` 创建序列表。'
      );
    }

    // 查询当前序列值
    const result = await pool.request().query(`
      SELECT 
        [CurrentValue] as currentValue,
        [Prefix] as prefix,
        [UpdatedAt] as updatedAt
      FROM [dbo].[Ticket_Sequence]
      WHERE [SequenceType] = 'WorkOrder'
    `);

    const sequence = result.recordset[0];

    if (!sequence) {
      throw new Error('工单序列未初始化');
    }

    return {
      currentValue: sequence.currentValue,
      prefix: sequence.prefix,
      updatedAt: new Date(sequence.updatedAt),
    };

  } catch (error: any) {
    console.error('[getCurrentSequenceValue] 错误:', error);
    throw new Error(`获取序列值失败: ${error.message}`);
  }
}

/**
 * 预览下一个工单编号（不实际生成）
 * 
 * 用于在创建工单前预览即将分配的编号
 * 
 * @returns Promise<string> 下一个工单编号，格式：wx00001
 * 
 * @example
 * ```typescript
 * const nextNumber = await previewNextWorkOrderNumber();
 * console.log(nextNumber); // 输出：wx00043
 * ```
 */
export async function previewNextWorkOrderNumber(): Promise<string> {
  const sequence = await getCurrentSequenceValue();
  const nextValue = sequence.currentValue + 1;
  const paddedValue = nextValue.toString().padStart(5, '0');
  return `${sequence.prefix}${paddedValue}`;
}
