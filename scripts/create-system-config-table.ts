/**
 * 创建系统配置表
 * 用于存储可配置的业务规则，避免硬编码
 * 
 * 运行方式：npm run create-config-table
 */

import * as sql from 'mssql';
import { getDbConnection, closeDbConnection } from '../lib/db-config';

async function createSystemConfigTable() {
  let pool: sql.ConnectionPool | null = null;
  
  try {
    console.log('🚀 开始创建系统配置表...\n');
    
    pool = await getDbConnection();
    
    // 检查表是否已存在
    const tableCheck = await pool.request().query(`
      SELECT COUNT(*) as count
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME = 'System_Config'
    `);
    
    if ((tableCheck.recordset[0] as any).count > 0) {
      console.log('⚠️  System_Config 表已存在，将删除并重建...');
      await pool.request().query('DROP TABLE System_Config');
    }
    
    // 创建配置表
    await pool.request().query(`
      CREATE TABLE System_Config (
        ConfigKey NVARCHAR(100) PRIMARY KEY,
        ConfigValue NVARCHAR(MAX) NOT NULL,
        ConfigType NVARCHAR(50) NOT NULL,  -- String/Number/Boolean/JSON
        Category NVARCHAR(50) NOT NULL,     -- Warranty/Report/Workflow/General
        Description NVARCHAR(500),
        IsEditable BIT DEFAULT 1,
        CreatedAt DATETIME DEFAULT GETUTCDATE(),
        UpdatedAt DATETIME DEFAULT GETUTCDATE()
      )
    `);
    
    console.log('✅ System_Config 表创建成功\n');
    
    // 插入默认配置
    console.log('📝 插入默认配置...\n');
    
    const defaultConfigs = [
      // 保修相关配置
      {
        key: 'warranty.default_period_months',
        value: '12',
        type: 'Number',
        category: 'Warranty',
        description: '默认保修期（月）',
        editable: true
      },
      {
        key: 'warranty.auto_check_enabled',
        value: 'true',
        type: 'Boolean',
        category: 'Warranty',
        description: '是否自动检查保修状态',
        editable: true
      },
      
      // 维修报告配置
      {
        key: 'report.template',
        value: JSON.stringify({
          header: '维修报告',
          sections: ['基本信息', '故障描述', '维修结果', '客户确认'],
          footer: '请客户签字确认'
        }),
        type: 'JSON',
        category: 'Report',
        description: '维修报告模板',
        editable: true
      },
      {
        key: 'report.require_signature',
        value: 'true',
        type: 'Boolean',
        category: 'Report',
        description: '是否要求客户签字',
        editable: true
      },
      
      // 工作流配置
      {
        key: 'workflow.in_warranty_auto_approve',
        value: 'false',
        type: 'Boolean',
        category: 'Workflow',
        description: '保内维修是否自动批准',
        editable: true
      },
      {
        key: 'workflow.out_warranty_require_confirm',
        value: 'true',
        type: 'Boolean',
        category: 'Workflow',
        description: '过保维修是否需要客户确认',
        editable: true
      },
      {
        key: 'workflow.payment_required_for_out_warranty',
        value: 'true',
        type: 'Boolean',
        category: 'Workflow',
        description: '过保维修是否需要收款',
        editable: true
      },
      
      // Excel导出配置
      {
        key: 'export.split_by_serial_number',
        value: 'true',
        type: 'Boolean',
        category: 'Export',
        description: '导出时是否按序列号分行',
        editable: true
      },
      {
        key: 'export.include_deleted',
        value: 'false',
        type: 'Boolean',
        category: 'Export',
        description: '导出时是否包含已删除工单',
        editable: true
      },
      
      // 通知配置
      {
        key: 'notification.enabled',
        value: 'false',
        type: 'Boolean',
        category: 'Notification',
        description: '是否启用通知功能',
        editable: true
      },
      {
        key: 'notification.email_enabled',
        value: 'false',
        type: 'Boolean',
        category: 'Notification',
        description: '是否启用邮件通知',
        editable: true
      },
      
      // 系统设置
      {
        key: 'system.company_name',
        value: '公司名称',
        type: 'String',
        category: 'General',
        description: '公司名称',
        editable: true
      },
      {
        key: 'system.support_phone',
        value: '',
        type: 'String',
        category: 'General',
        description: '技术支持电话',
        editable: true
      },
      {
        key: 'system.support_email',
        value: '',
        type: 'String',
        category: 'General',
        description: '技术支持邮箱',
        editable: true
      },
    ];
    
    for (const config of defaultConfigs) {
      await pool.request()
        .input('key', sql.NVarChar, config.key)
        .input('value', sql.NVarChar, config.value)
        .input('type', sql.NVarChar, config.type)
        .input('category', sql.NVarChar, config.category)
        .input('description', sql.NVarChar, config.description)
        .input('editable', sql.Bit, config.editable ? 1 : 0)
        .query(`
          INSERT INTO System_Config (ConfigKey, ConfigValue, ConfigType, Category, Description, IsEditable)
          VALUES (@key, @value, @type, @category, @description, @editable)
        `);
      
      console.log(`✅ 已添加配置: ${config.key}`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ 系统配置表创建完成！');
    console.log(`📝 已插入 ${defaultConfigs.length} 条默认配置`);
    console.log('='.repeat(60));
    
    console.log('\n💡 使用说明：');
    console.log('1. 通过 /api/config 接口读取配置');
    console.log('2. 通过管理员界面修改配置（需要开发）');
    console.log('3. 所有业务规则从配置表读取，不再硬编码');
    
  } catch (error: any) {
    console.error('❌ 创建配置表失败:', error.message);
    console.error(error);
  } finally {
    if (pool) {
      await closeDbConnection();
    }
  }
}

createSystemConfigTable().catch(console.error);
