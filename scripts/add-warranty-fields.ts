/**
 * 数据库迁移脚本：添加保修相关字段
 * 支持保修判断、维修报告、回寄流程等功能
 * 
 * 运行方式：npm run add-warranty-fields
 * 或：tsx scripts/add-warranty-fields.ts
 */

import * as sql from 'mssql';
import { getDbConnection, closeDbConnection } from '../lib/db-config';

interface FieldDefinition {
  name: string;
  type: string;
  nullable: boolean;
  description: string;
  defaultValue?: string;
}

const warrantyFields: FieldDefinition[] = [
  // 保修相关字段
  { name: 'ManufactureDate', type: 'DATETIME', nullable: true, description: '出厂日期（仓库管理员填写）' },
  { name: 'WarrantyStatus', type: 'NVARCHAR(50)', nullable: true, description: '保修状态（InWarranty=保内, OutOfWarranty=过保, Unknown=未知）' },
  { name: 'WarrantyPeriodMonths', type: 'INT', nullable: true, description: '保修期（月）', defaultValue: '12' },
  { name: 'IsWarrantyChecked', type: 'BIT', nullable: true, description: '是否已检查保修状态', defaultValue: '0' },
  
  // 维修报告相关
  { name: 'RepairReportGenerated', type: 'BIT', nullable: true, description: '是否已生成维修报告', defaultValue: '0' },
  { name: 'RepairReportDate', type: 'DATETIME', nullable: true, description: '维修报告生成日期' },
  { name: 'RepairReportContent', type: 'NVARCHAR(MAX)', nullable: true, description: '维修报告内容' },
  { name: 'RepairReportFile', type: 'NVARCHAR(500)', nullable: true, description: '维修报告文件路径' },
  
  // 现场人员确认相关
  { name: 'CustomerConfirmation', type: 'NVARCHAR(50)', nullable: true, description: '客户确认（Agreed=同意维修, Rejected=拒绝维修, Pending=待确认）' },
  { name: 'CustomerConfirmDate', type: 'DATETIME', nullable: true, description: '客户确认日期' },
  { name: 'CustomerSignature', type: 'NVARCHAR(500)', nullable: true, description: '客户签字图片路径' },
  { name: 'NeedReturnShip', type: 'BIT', nullable: true, description: '是否需要回寄' },
  
  // 收费确认相关
  { name: 'IsPaymentReceived', type: 'BIT', nullable: true, description: '是否已收款', defaultValue: '0' },
  { name: 'PaymentDate', type: 'DATETIME', nullable: true, description: '收款日期' },
  { name: 'PaymentAmount', type: 'DECIMAL(18,2)', nullable: true, description: '实际收款金额' },
  
  // 维修结果相关
  { name: 'RepairResult', type: 'NVARCHAR(50)', nullable: true, description: '维修结果（Repaired=已修复, NeedReplacement=需更换, Unrepairable=无法维修）' },
  { name: 'RepairNotes', type: 'NVARCHAR(MAX)', nullable: true, description: '维修备注' },
  { name: 'RepairCompletedDate', type: 'DATETIME', nullable: true, description: '维修完成日期' },
  
  // 报废/入库相关
  { name: 'ScrapReason', type: 'NVARCHAR(500)', nullable: true, description: '报废原因' },
  { name: 'ScrapDate', type: 'DATETIME', nullable: true, description: '报废日期' },
  { name: 'StorageLocation', type: 'NVARCHAR(200)', nullable: true, description: '入库位置（等待报废）' },
];

async function columnExists(pool: sql.ConnectionPool, tableName: string, columnName: string): Promise<boolean> {
  try {
    const result = await pool.request()
      .input('tableName', sql.NVarChar, tableName)
      .input('columnName', sql.NVarChar, columnName)
      .query(`
        SELECT COUNT(*) as count
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = @tableName AND COLUMN_NAME = @columnName
      `);
    return (result.recordset[0] as any).count > 0;
  } catch (error) {
    console.error(`检查字段 ${columnName} 失败:`, error);
    return false;
  }
}

async function addColumn(
  pool: sql.ConnectionPool,
  tableName: string,
  field: FieldDefinition
): Promise<boolean> {
  try {
    const nullable = field.nullable ? 'NULL' : 'NOT NULL';
    const defaultClause = field.defaultValue ? `DEFAULT ${field.defaultValue}` : '';
    
    const alterSql = `
      ALTER TABLE [${tableName}]
      ADD [${field.name}] ${field.type} ${nullable} ${defaultClause}
    `;
    
    await pool.request().query(alterSql);
    console.log(`✅ 已添加字段: ${field.name} (${field.description})`);
    return true;
  } catch (error: any) {
    console.error(`❌ 添加字段 ${field.name} 失败:`, error.message);
    return false;
  }
}

async function main() {
  const tableName = 'Repair_Tickets';
  let pool: sql.ConnectionPool | null = null;
  
  try {
    console.log('🚀 开始添加保修相关字段...\n');
    
    pool = await getDbConnection();
    
    // 检查表是否存在
    const tableCheck = await pool.request()
      .input('tableName', sql.NVarChar, tableName)
      .query(`
        SELECT COUNT(*) as count
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME = @tableName
      `);
    
    if ((tableCheck.recordset[0] as any).count === 0) {
      console.error(`❌ 表 ${tableName} 不存在！请先创建表。`);
      return;
    }
    
    console.log(`✅ 表 ${tableName} 存在\n`);
    
    let addedCount = 0;
    let skippedCount = 0;
    
    for (const field of warrantyFields) {
      const exists = await columnExists(pool, tableName, field.name);
      
      if (exists) {
        console.log(`⏭️  字段已存在: ${field.name}`);
        skippedCount++;
      } else {
        const success = await addColumn(pool, tableName, field);
        if (success) {
          addedCount++;
        }
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 保修字段添加完成！');
    console.log(`✅ 新增字段: ${addedCount}`);
    console.log(`⏭️  已存在字段: ${skippedCount}`);
    console.log(`📝 总字段数: ${warrantyFields.length}`);
    console.log('='.repeat(60));
    
    console.log('\n💡 业务流程说明：');
    console.log('1. 仓库管理员填写出厂日期（ManufactureDate）');
    console.log('2. 系统自动判断保修状态（WarrantyStatus）');
    console.log('3. 保内：直接维修 → 商务确认 → 仓库寄出');
    console.log('4. 过保：生成维修报告 → 现场人员确认 → 收费维修或拒修');
    console.log('5. 拒修：选择是否回寄（NeedReturnShip）');
    
  } catch (error: any) {
    console.error('❌ 添加字段失败:', error.message);
    console.error(error);
  } finally {
    if (pool) {
      await closeDbConnection();
    }
  }
}

main().catch(console.error);
