/**
 * 数据库迁移脚本：升级 Repair_Tickets 表结构
 * 根据最终业务表单全量对齐数据库结构
 * 
 * 运行方式：tsx scripts/upgrade-repair-tickets-schema.ts
 */

import * as sql from 'mssql';
import { getDbConnection, closeDbConnection } from '../lib/db-config';

// 需要添加的字段定义
interface FieldDefinition {
  name: string;
  type: string;
  nullable: boolean;
  description: string;
  category: string;
}

const fieldsToAdd: FieldDefinition[] = [
  // [现场人员填报区] (创建时填)
  { name: 'SubmitDate', type: 'DATETIME', nullable: true, description: '提交日期', category: '现场人员' },
  { name: 'ReportTime', type: 'DATETIME2(7)', nullable: true, description: '报修时间', category: '现场人员' },
  { name: 'TrackingNumber_In', type: 'NVARCHAR(100)', nullable: true, description: '发出快递单号', category: '现场人员' },
  { name: 'SenderAddress', type: 'NVARCHAR(500)', nullable: true, description: '寄件人地址', category: '现场人员' },
  { name: 'ContactInfo', type: 'NVARCHAR(200)', nullable: true, description: '联系人及电话', category: '现场人员' },
  { name: 'ProjectName', type: 'NVARCHAR(200)', nullable: true, description: '项目/客户名称', category: '现场人员' },
  { name: 'Category', type: 'NVARCHAR(100)', nullable: true, description: '产品名称/大类', category: '现场人员' },
  { name: 'ModelName', type: 'NVARCHAR(200)', nullable: true, description: '型号', category: '现场人员' },
  { name: 'Quantity', type: 'INT', nullable: true, description: '数量', category: '现场人员' },
  { name: 'ProductSN', type: 'NVARCHAR(200)', nullable: true, description: '产品序列号', category: '现场人员' },
  { name: 'FaultDescription', type: 'NVARCHAR(MAX)', nullable: true, description: '故障描述', category: '现场人员' },
  
  // [维修人员填写区] (维修阶段填)
  { name: 'MaterialCode', type: 'NVARCHAR(100)', nullable: true, description: '物料代码', category: '维修人员' },
  { name: 'DeviceName', type: 'NVARCHAR(200)', nullable: true, description: '物料名称', category: '维修人员' },
  { name: 'FullSpec', type: 'NVARCHAR(500)', nullable: true, description: '规格型号', category: '维修人员' },
  { name: 'FaultPoint', type: 'NVARCHAR(500)', nullable: true, description: '故障点', category: '维修人员' },
  { name: 'RepairCost', type: 'DECIMAL(18,2)', nullable: true, description: '收费金额', category: '维修人员' },
  { name: 'IsOutsourced', type: 'BIT', nullable: true, description: '是否需返厂', category: '维修人员' },
  
  // [管理员填写区] (商务/财务阶段填)
  { name: 'FactoryRepairDate', type: 'DATETIME', nullable: true, description: '返厂维修日期', category: '管理员' },
  { name: 'FactoryTrackingNum', type: 'NVARCHAR(100)', nullable: true, description: '返厂维修快递单号', category: '管理员' },
  { name: 'SupplierName', type: 'NVARCHAR(200)', nullable: true, description: '供应商名称', category: '管理员' },
  { name: 'IsChargeable', type: 'BIT', nullable: true, description: '是否收费', category: '管理员' },
  { name: 'ClientName', type: 'NVARCHAR(200)', nullable: true, description: '客户名称', category: '管理员' },
  { name: 'IsInvoiced', type: 'BIT', nullable: true, description: '是否开票', category: '管理员' },
  { name: 'FactoryReceivedDate', type: 'DATETIME', nullable: true, description: '收到原厂寄回日期', category: '管理员' },
  
  // [仓库管理员填写区] (发货阶段填)
  { name: 'ReceivedDate', type: 'DATETIME', nullable: true, description: '收到日期', category: '仓库管理员' },
  { name: 'FactoryShipDate', type: 'DATETIME', nullable: true, description: '出厂日期', category: '仓库管理员' },
  { name: 'ReturnDate', type: 'DATETIME', nullable: true, description: '返还客户日期', category: '仓库管理员' },
  { name: 'ReturnQuantity', type: 'INT', nullable: true, description: '返还客户数量', category: '仓库管理员' },
  { name: 'ReturnTrackingNum', type: 'NVARCHAR(100)', nullable: true, description: '返还客户快递单号', category: '仓库管理员' },
  
  // [取消申请相关字段]
  { name: 'CancelRequestStatus', type: 'NVARCHAR(50)', nullable: true, description: '取消申请状态（Pending/Approved/Rejected）', category: '系统' },
  { name: 'CancelRequestReason', type: 'NVARCHAR(500)', nullable: true, description: '取消申请原因', category: '现场人员' },
  { name: 'CancelRequestDate', type: 'DATETIME', nullable: true, description: '取消申请日期', category: '系统' },
  { name: 'CancelApprovedBy', type: 'NVARCHAR(100)', nullable: true, description: '审批人', category: '系统' },
  { name: 'CancelApprovedDate', type: 'DATETIME', nullable: true, description: '审批日期', category: '系统' },

  // [工单号字段] —— 同一次报修中多台设备共享的业务工单号
  { name: 'WorkOrderNumber', type: 'NVARCHAR(100)', nullable: true, description: '工单号（同一报修共享的业务编号）', category: '系统' },
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
    console.error(`检查字段 ${columnName} 失败:`, error);
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
 * 更新状态字段的约束（如果需要）
 */
async function updateStatusField(pool: sql.ConnectionPool, tableName: string): Promise<void> {
  try {
    // 检查 Status 字段是否存在
    const statusExists = await columnExists(pool, tableName, 'Status');
    if (!statusExists) {
      console.log('⚠️  Status 字段不存在，将创建...');
      await pool.request().query(`
        ALTER TABLE [${tableName}]
        ADD [Status] NVARCHAR(50) NULL DEFAULT 'Created'
      `);
      console.log('✅ Status 字段已创建');
    } else {
      console.log('✅ Status 字段已存在');
    }
    
    // 注意：SQL Server 不支持直接修改 CHECK 约束，需要先删除再创建
    // 这里我们只确保字段存在，约束由应用层控制
    console.log('ℹ️  状态值由应用层控制，支持以下状态：');
    console.log('   - Created (待维修)');
    console.log('   - In_Repair (维修中)');
    console.log('   - Admin_Review (待商务处理)');
    console.log('   - Pending_Shipment (待发货)');
    console.log('   - Completed (已完成)');
    console.log('   - Scrapped (已报废)');
    console.log('   - Return_Unrepaired (拒修退回)');
    console.log('   - Cancelled (已取消)');
  } catch (error: any) {
    console.error('❌ 更新 Status 字段失败:', error.message);
  }
}

/**
 * 主函数
 */
async function main() {
  const tableName = 'Repair_Tickets';
  let pool: sql.ConnectionPool | null = null;
  
  try {
    console.log('🚀 开始升级 Repair_Tickets 表结构...\n');
    
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
      return;
    }
    
    console.log(`✅ 表 ${tableName} 存在\n`);
    
    // 检查并添加字段
    let addedCount = 0;
    let skippedCount = 0;
    
    for (const field of fieldsToAdd) {
      const exists = await columnExists(pool, tableName, field.name);
      
      if (exists) {
        console.log(`⏭️  字段已存在: ${field.name} (${field.description})`);
        skippedCount++;
      } else {
        const success = await addColumn(pool, tableName, field);
        if (success) {
          addedCount++;
        }
      }
    }
    
    // 更新状态字段
    console.log('\n📋 更新状态字段...');
    await updateStatusField(pool, tableName);
    
    // 汇总
    console.log('\n' + '='.repeat(50));
    console.log('📊 升级完成！');
    console.log(`✅ 新增字段: ${addedCount}`);
    console.log(`⏭️  已存在字段: ${skippedCount}`);
    console.log(`📝 总字段数: ${fieldsToAdd.length}`);
    console.log('='.repeat(50));
    
  } catch (error: any) {
    console.error('❌ 升级失败:', error.message);
    console.error(error);
  } finally {
    if (pool) {
      await closeDbConnection();
    }
  }
}

// 运行脚本
main().catch(console.error);
