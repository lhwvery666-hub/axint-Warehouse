/**
 * 数据库迁移脚本：添加工作流相关字段到 Repair_Tickets 表
 * 
 * 包含以下字段：
 * - ManufactureDate (出厂日期)
 * - WarrantyStatus (保修状态)
 * - WarehouseConfirmedAt (仓库确认时间)
 * - WarehouseConfirmedBy (仓库确认人)
 * - TechnicianCompletedAt (维修完成时间)
 * - TechnicianCompletedBy (维修完成人)
 * - BusinessReviewedAt (商务审核时间)
 * - BusinessReviewedBy (商务审核人)
 * - ShippingType (发货方式)
 * - WarehouseShippedAt (仓库发货时间)
 * - WarehouseShippedBy (仓库发货人)
 * - ReporterConfirmedAt (现场确认时间)
 * - SignedReportPhoto (签字凭证照片路径)
 * - SignedPhotoViewedBy (签字凭证查看人)
 * - SignedPhotoViewedAt (签字凭证查看时间)
 * - SignedPhotoModifyRequest (签字凭证修改请求)
 * - IsPaymentReceived (是否已收款)
 * - CourierCompany (快递公司)
 * - CourierNumber (快递单号)
 * - DeletedAt (删除时间)
 * 
 * 运行方式：npm run add-workflow-fields
 */

import * as sql from 'mssql';
import { getDbConnection } from '../lib/db-config';

interface FieldDefinition {
  name: string;
  type: string;
  nullable: boolean;
  description: string;
}

const workflowFields: FieldDefinition[] = [
  // 出厂日期和保修相关
  { name: 'ManufactureDate', type: 'DATETIME', nullable: true, description: '出厂日期（仓库管理员填写）' },
  { name: 'WarrantyStatus', type: 'NVARCHAR(50)', nullable: true, description: '保修状态（InWarranty/OutOfWarranty/Unknown）' },
  
  // 仓库确认相关
  { name: 'WarehouseConfirmedAt', type: 'DATETIME', nullable: true, description: '仓库确认时间' },
  { name: 'WarehouseConfirmedBy', type: 'NVARCHAR(100)', nullable: true, description: '仓库确认人' },
  
  // 维修完成相关
  { name: 'TechnicianCompletedAt', type: 'DATETIME', nullable: true, description: '维修人员完成维修时间' },
  { name: 'TechnicianCompletedBy', type: 'NVARCHAR(100)', nullable: true, description: '维修人员完成人' },
  
  // 商务审核相关
  { name: 'BusinessReviewedAt', type: 'DATETIME', nullable: true, description: '商务审核时间' },
  { name: 'BusinessReviewedBy', type: 'NVARCHAR(100)', nullable: true, description: '商务审核人' },
  
  // 仓库发货相关
  { name: 'ShippingType', type: 'NVARCHAR(50)', nullable: true, description: '发货方式（return=发回客户, stock=入库）' },
  { name: 'WarehouseShippedAt', type: 'DATETIME', nullable: true, description: '仓库发货时间' },
  { name: 'WarehouseShippedBy', type: 'NVARCHAR(100)', nullable: true, description: '仓库发货人' },
  
  // 现场确认相关
  { name: 'ReporterConfirmedAt', type: 'DATETIME', nullable: true, description: '现场确认时间（现场人员签字回传时间）' },
  
  // 签字凭证相关
  { name: 'SignedReportPhoto', type: 'NVARCHAR(500)', nullable: true, description: '签字凭证照片路径' },
  { name: 'SignedPhotoViewedBy', type: 'NVARCHAR(100)', nullable: true, description: '签字凭证查看人' },
  { name: 'SignedPhotoViewedAt', type: 'DATETIME', nullable: true, description: '签字凭证查看时间' },
  { name: 'SignedPhotoModifyRequest', type: 'NVARCHAR(MAX)', nullable: true, description: '签字凭证修改请求（JSON格式）' },
  
  // 付款相关
  { name: 'IsPaymentReceived', type: 'BIT', nullable: true, description: '是否已收款' },
  
  // 快递相关（如果不存在）
  { name: 'CourierCompany', type: 'NVARCHAR(200)', nullable: true, description: '快递公司' },
  { name: 'CourierNumber', type: 'NVARCHAR(200)', nullable: true, description: '快递单号' },
  
  // 删除标记
  { name: 'DeletedAt', type: 'DATETIME', nullable: true, description: '删除时间' },
];

/**
 * 检查字段是否存在
 */
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
    console.error(`❌ 检查字段 ${columnName} 失败:`, error);
    return false;
  }
}

/**
 * 添加字段到表
 */
async function addColumn(
  pool: sql.ConnectionPool,
  tableName: string,
  field: FieldDefinition
): Promise<boolean> {
  try {
    const nullable = field.nullable ? 'NULL' : 'NOT NULL';
    const defaultValue = field.type === 'BIT' ? 'DEFAULT 0' : '';
    
    const alterSql = `
      ALTER TABLE [${tableName}]
      ADD [${field.name}] ${field.type} ${nullable} ${defaultValue}
    `;
    
    await pool.request().query(alterSql);
    console.log(`✅ 已添加字段: ${field.name} (${field.description})`);
    return true;
  } catch (error: any) {
    console.error(`❌ 添加字段 ${field.name} 失败:`, error.message);
    return false;
  }
}

/**
 * 主函数
 */
async function main() {
  const tableName = 'Repair_Tickets';
  let pool: sql.ConnectionPool | null = null;
  
  try {
    console.log('🚀 开始添加工作流字段到 Repair_Tickets 表...\n');
    
    // 获取数据库连接
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
      process.exit(1);
    }
    
    console.log(`✅ 表 ${tableName} 存在\n`);
    
    // 检查并添加字段
    let addedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    
    for (const field of workflowFields) {
      const exists = await columnExists(pool, tableName, field.name);
      
      if (exists) {
        console.log(`⏭️  字段已存在: ${field.name} (${field.description})`);
        skippedCount++;
      } else {
        const success = await addColumn(pool, tableName, field);
        if (success) {
          addedCount++;
        } else {
          failedCount++;
        }
      }
    }
    
    // 汇总
    console.log('\n' + '='.repeat(70));
    console.log('📊 工作流字段迁移完成！');
    console.log(`✅ 新增字段: ${addedCount}`);
    console.log(`⏭️  已存在字段: ${skippedCount}`);
    console.log(`❌ 失败字段: ${failedCount}`);
    console.log(`📝 总字段数: ${workflowFields.length}`);
    console.log('='.repeat(70));
    
    if (failedCount > 0) {
      console.log('\n⚠️  部分字段添加失败，请检查上面的错误信息。');
      process.exit(1);
    }
    
  } catch (error: any) {
    console.error('\n❌ 迁移失败:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    // 不要关闭连接池，让 Node.js 自然退出
    console.log('\n✅ 脚本执行完成');
    process.exit(0);
  }
}

// 运行脚本
main().catch((error) => {
  console.error('❌ 脚本执行失败:', error);
  process.exit(1);
});
