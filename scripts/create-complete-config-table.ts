import { getDbConnection } from '../lib/db-config';

/**
 * 创建完整的系统配置表
 * 支持角色、状态、权限、路由等所有配置
 */
async function createCompleteConfigTable() {
  try {
    const pool = await getDbConnection();
    console.log('开始创建完整系统配置表...');

    // 检查表是否已存在
    const tableCheck = await pool.request().query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = 'System_Config'
    `);

    if (tableCheck.recordset.length > 0) {
      console.log('✅ System_Config 表已存在，清空并重新创建...');
      await pool.request().query('DROP TABLE System_Config');
    }

    // 创建配置表
    await pool.request().query(`
      CREATE TABLE System_Config (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        ConfigKey NVARCHAR(100) NOT NULL UNIQUE,
        ConfigValue NVARCHAR(MAX) NOT NULL,
        ConfigType NVARCHAR(50) NOT NULL DEFAULT 'string',
        Category NVARCHAR(50) NOT NULL DEFAULT 'general',
        Description NVARCHAR(500) NULL,
        IsEditable BIT DEFAULT 1,
        CreatedAt DATETIME2 DEFAULT GETDATE(),
        UpdatedAt DATETIME2 DEFAULT GETDATE(),
        CreatedBy NVARCHAR(100) NULL,
        UpdatedBy NVARCHAR(100) NULL
      )
    `);
    console.log('✅ 成功创建 System_Config 表');

    // 创建索引
    await pool.request().query(`
      CREATE INDEX IX_System_Config_Category ON System_Config(Category);
      CREATE INDEX IX_System_Config_Type ON System_Config(ConfigType);
    `);
    console.log('✅ 成功创建索引');

    // 插入完整配置数据
    const configs = [
      // ==================== 用户角色配置 ====================
      {
        key: 'system.roles.admin',
        value: JSON.stringify({
          id: 'admin',
          name: '系统管理员',
          description: '系统管理员，拥有所有权限',
          permissions: ['all'],
          routes: ['/admin', '/admin/users', '/admin/settings'],
          color: '#dc2626',
          icon: 'shield'
        }),
        type: 'json',
        category: 'roles',
        description: '系统管理员角色配置'
      },
      {
        key: 'system.roles.technician',
        value: JSON.stringify({
          id: 'technician',
          name: '维修工程师',
          description: '维修工程师，负责设备维修',
          permissions: ['repair.view', 'repair.edit', 'repair.complete', 'repair.report'],
          routes: ['/'],
          color: '#059669',
          icon: 'wrench'
        }),
        type: 'json',
        category: 'roles',
        description: '维修工程师角色配置'
      },
      {
        key: 'system.roles.reporter',
        value: JSON.stringify({
          id: 'reporter',
          name: '现场报告人员',
          description: '现场报告人员，负责上报故障',
          permissions: ['repair.create', 'repair.view_own', 'repair.cancel_request'],
          routes: ['/'],
          color: '#2563eb',
          icon: 'file-text'
        }),
        type: 'json',
        category: 'roles',
        description: '现场报告人员角色配置'
      },
      {
        key: 'system.roles.business',
        value: JSON.stringify({
          id: 'business',
          name: '商务人员',
          description: '商务人员，负责客户沟通和商务处理',
          permissions: ['repair.view', 'repair.approve_cancel', 'repair.manage_business'],
          routes: ['/business'],
          color: '#7c3aed',
          icon: 'briefcase'
        }),
        type: 'json',
        category: 'roles',
        description: '商务人员角色配置'
      },
      {
        key: 'system.roles.warehouse',
        value: JSON.stringify({
          id: 'warehouse',
          name: '仓库管理员',
          description: '仓库管理员，负责设备收发和库存管理',
          permissions: ['repair.view', 'warehouse.receive', 'warehouse.ship', 'warehouse.manage'],
          routes: ['/warehouse'],
          color: '#ea580c',
          icon: 'package'
        }),
        type: 'json',
        category: 'roles',
        description: '仓库管理员角色配置'
      },

      // ==================== 工单状态配置 ====================
      {
        key: 'system.status.created',
        value: JSON.stringify({
          id: 'created',
          name: '已创建',
          description: '工单已创建，等待处理',
          color: '#6b7280',
          icon: 'clock',
          category: 'pending',
          nextStatuses: ['pending', 'cancelled'],
          rolesCanView: ['admin', 'technician', 'reporter', 'business', 'warehouse'],
          rolesCanEdit: ['admin', 'reporter']
        }),
        type: 'json',
        category: 'status',
        description: '已创建状态配置'
      },
      {
        key: 'system.status.pending',
        value: JSON.stringify({
          id: 'pending',
          name: '待处理',
          description: '工单待处理',
          color: '#f59e0b',
          icon: 'clock',
          category: 'pending',
          nextStatuses: ['in_repair', 'cancelled'],
          rolesCanView: ['admin', 'technician', 'reporter', 'business', 'warehouse'],
          rolesCanEdit: ['admin', 'technician']
        }),
        type: 'json',
        category: 'status',
        description: '待处理状态配置'
      },
      {
        key: 'system.status.in_repair',
        value: JSON.stringify({
          id: 'in_repair',
          name: '维修中',
          description: '设备正在维修',
          color: '#3b82f6',
          icon: 'wrench',
          category: 'processing',
          nextStatuses: ['completed', 'unrepairable', 'cancelled'],
          rolesCanView: ['admin', 'technician', 'reporter', 'business', 'warehouse'],
          rolesCanEdit: ['admin', 'technician']
        }),
        type: 'json',
        category: 'status',
        description: '维修中状态配置'
      },
      {
        key: 'system.status.completed',
        value: JSON.stringify({
          id: 'completed',
          name: '已完成',
          description: '维修已完成',
          color: '#10b981',
          icon: 'check-circle',
          category: 'completed',
          nextStatuses: [],
          rolesCanView: ['admin', 'technician', 'reporter', 'business', 'warehouse'],
          rolesCanEdit: ['admin']
        }),
        type: 'json',
        category: 'status',
        description: '已完成状态配置'
      },
      {
        key: 'system.status.cancelled',
        value: JSON.stringify({
          id: 'cancelled',
          name: '已取消',
          description: '工单已取消',
          color: '#6b7280',
          icon: 'x-circle',
          category: 'terminal',
          nextStatuses: [],
          rolesCanView: ['admin', 'technician', 'reporter', 'business', 'warehouse'],
          rolesCanEdit: ['admin']
        }),
        type: 'json',
        category: 'status',
        description: '已取消状态配置'
      },

      // ==================== 系统配置 ====================
      {
        key: 'system.company.name',
        value: '深圳市爱克信智能股份有限公司',
        type: 'string',
        category: 'company',
        description: '公司名称'
      },
      {
        key: 'system.company.phone',
        value: '13530978726',
        type: 'string',
        category: 'company',
        description: '公司联系电话'
      },
      {
        key: 'system.company.email',
        value: 'support@axiom.com',
        type: 'string',
        category: 'company',
        description: '公司邮箱'
      },
      {
        key: 'system.company.address',
        value: '深圳市宝安区石岩街道办民生三路料坑嘉一达工业园6栋2楼',
        type: 'string',
        category: 'company',
        description: '公司地址'
      },

      // ==================== 业务配置 ====================
      {
        key: 'business.warranty.default_period_months',
        value: '12',
        type: 'number',
        category: 'warranty',
        description: '默认保修期（月）'
      },
      {
        key: 'business.warranty.auto_check',
        value: 'true',
        type: 'boolean',
        category: 'warranty',
        description: '是否自动检查保修状态'
      },
      {
        key: 'business.report.require_signature',
        value: 'true',
        type: 'boolean',
        category: 'report',
        description: '维修报告是否需要客户签字'
      },
      {
        key: 'business.export.split_by_serial',
        value: 'true',
        type: 'boolean',
        category: 'export',
        description: 'Excel导出是否按序列号分行'
      },

      // ==================== 路由配置 ====================
      {
        key: 'routes.default.admin',
        value: '/admin/users',
        type: 'string',
        category: 'routes',
        description: '管理员默认路由'
      },
      {
        key: 'routes.default.business',
        value: '/business/dashboard',
        type: 'string',
        category: 'routes',
        description: '商务人员默认路由'
      },
      {
        key: 'routes.default.warehouse',
        value: '/warehouse/dashboard',
        type: 'string',
        category: 'routes',
        description: '仓库管理员默认路由'
      },
      {
        key: 'routes.default.technician',
        value: '/',
        type: 'string',
        category: 'routes',
        description: '维修工程师默认路由'
      },
      {
        key: 'routes.default.reporter',
        value: '/',
        type: 'string',
        category: 'routes',
        description: '现场报告人员默认路由'
      }
    ];

    // 批量插入配置
    for (const config of configs) {
      await pool.request()
        .input('key', config.key)
        .input('value', config.value)
        .input('type', config.type)
        .input('category', config.category)
        .input('description', config.description)
        .query(`
          INSERT INTO System_Config (ConfigKey, ConfigValue, ConfigType, Category, Description)
          VALUES (@key, @value, @type, @category, @description)
        `);
    }

    console.log(`✅ 成功插入 ${configs.length} 条配置记录`);

    // 创建配置视图
    await pool.request().query(`
      CREATE VIEW V_System_Config AS
      SELECT 
        ConfigKey,
        ConfigValue,
        ConfigType,
        Category,
        Description,
        IsEditable,
        CreatedAt,
        UpdatedAt
      FROM System_Config
    `);
    console.log('✅ 成功创建配置视图');

    console.log('\n🎉 完整系统配置表创建成功！');
    console.log('\n📋 配置分类统计：');
    
    const categoryStats = await pool.request().query(`
      SELECT Category, COUNT(*) as Count 
      FROM System_Config 
      GROUP BY Category 
      ORDER BY Category
    `);
    
    categoryStats.recordset.forEach((row: any) => {
      console.log(`  ${row.Category}: ${row.Count} 项配置`);
    });

    console.log('\n💡 使用说明：');
    console.log('1. 通过 /api/config 接口读取所有配置');
    console.log('2. 通过 /api/config/:category 接口读取分类配置');
    console.log('3. 通过 /api/config/key/:key 接口读取单个配置');
    console.log('4. 所有硬编码都应替换为配置读取');
    console.log('5. 管理员可以通过界面修改可编辑配置');

  } catch (error: any) {
    console.error('❌ 创建完整配置表失败:', error.message);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  createCompleteConfigTable()
    .then(() => {
      console.log('✅ 脚本执行完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ 脚本执行失败:', error);
      process.exit(1);
    });
}

export default createCompleteConfigTable;
