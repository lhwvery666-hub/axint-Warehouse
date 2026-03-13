/**
 * 恢复被删除的表结构
 * 
 * 运行方式: npx tsx scripts/restore-table-structures.ts
 */

import { getDbConnection } from '../lib/db-config'

async function restoreTableStructures() {
  try {
    console.log('正在连接数据库...')
    const pool = await getDbConnection()
    console.log('数据库连接成功！\n')

    // 1. 创建 Users 表
    console.log('正在创建 Users 表...')
    try {
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Users')
        BEGIN
          CREATE TABLE Users (
            UserID INT IDENTITY(1,1) PRIMARY KEY,
            Username NVARCHAR(100) NOT NULL UNIQUE,
            Password NVARCHAR(255) NOT NULL,
            Role NVARCHAR(50) NOT NULL DEFAULT 'User',
            RealName NVARCHAR(100) NULL,
            PhoneNumber NVARCHAR(20) NULL,
            IsDeleted BIT DEFAULT 0,
            CreatedAt DATETIME2 DEFAULT GETDATE(),
            UpdatedAt DATETIME2 DEFAULT GETDATE()
          )
          PRINT 'Users 表创建成功'
        END
        ELSE
        BEGIN
          PRINT 'Users 表已存在'
        END
      `)
      console.log('✅ Users 表创建成功')
    } catch (error: any) {
      console.error('❌ Users 表创建失败:', error.message)
    }

    // 2. 创建 Device_Inventory 表
    console.log('\n正在创建 Device_Inventory 表...')
    try {
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Device_Inventory')
        BEGIN
          CREATE TABLE Device_Inventory (
            InventoryID INT IDENTITY(1,1) PRIMARY KEY,
            SerialNumber NVARCHAR(100) NOT NULL UNIQUE,
            DeviceName NVARCHAR(200) NULL,
            ModelName NVARCHAR(200) NULL,
            Category NVARCHAR(100) NULL,
            SubCategory NVARCHAR(100) NULL,
            MaterialCode NVARCHAR(100) NULL,
            Specification NVARCHAR(500) NULL,
            ManufactureDate DATETIME2 NULL,
            WarrantyStartDate DATETIME2 NULL,
            WarrantyEndDate DATETIME2 NULL,
            WarrantyPeriodMonths INT NULL,
            Status NVARCHAR(50) DEFAULT 'In_Stock',
            Location NVARCHAR(200) NULL,
            Supplier NVARCHAR(200) NULL,
            PurchaseDate DATETIME2 NULL,
            PurchasePrice DECIMAL(18,2) NULL,
            Notes NVARCHAR(MAX) NULL,
            CreatedAt DATETIME2 DEFAULT GETDATE(),
            UpdatedAt DATETIME2 DEFAULT GETDATE()
          )
          PRINT 'Device_Inventory 表创建成功'
        END
        ELSE
        BEGIN
          PRINT 'Device_Inventory 表已存在'
        END
      `)
      console.log('✅ Device_Inventory 表创建成功')
    } catch (error: any) {
      console.error('❌ Device_Inventory 表创建失败:', error.message)
    }

    // 3. 创建 Product_Catalog 表
    console.log('\n正在创建 Product_Catalog 表...')
    try {
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Product_Catalog')
        BEGIN
          CREATE TABLE Product_Catalog (
            ProductID INT IDENTITY(1,1) PRIMARY KEY,
            Category NVARCHAR(100) NOT NULL,
            SubCategory NVARCHAR(100) NULL,
            ModelName NVARCHAR(200) NOT NULL,
            ModelCode NVARCHAR(100) NULL,
            Specification NVARCHAR(500) NULL,
            Description NVARCHAR(MAX) NULL,
            Manufacturer NVARCHAR(200) NULL,
            DefaultWarrantyMonths INT DEFAULT 12,
            IsActive BIT DEFAULT 1,
            CreatedAt DATETIME2 DEFAULT GETDATE(),
            UpdatedAt DATETIME2 DEFAULT GETDATE()
          )
          PRINT 'Product_Catalog 表创建成功'
        END
        ELSE
        BEGIN
          PRINT 'Product_Catalog 表已存在'
        END
      `)
      console.log('✅ Product_Catalog 表创建成功')
    } catch (error: any) {
      console.error('❌ Product_Catalog 表创建失败:', error.message)
    }

    // 4. 创建 Repair_Ticket_History 表
    console.log('\n正在创建 Repair_Ticket_History 表...')
    try {
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Repair_Ticket_History')
        BEGIN
          CREATE TABLE Repair_Ticket_History (
            HistoryID INT IDENTITY(1,1) PRIMARY KEY,
            TicketID NVARCHAR(50) NOT NULL,
            ActionType NVARCHAR(50) NOT NULL,
            OldStatus NVARCHAR(50) NULL,
            NewStatus NVARCHAR(50) NULL,
            ActionBy NVARCHAR(100) NULL,
            ActionNote NVARCHAR(MAX) NULL,
            DelayTo DATETIME2 NULL,
            DelayReason NVARCHAR(500) NULL,
            CreatedAt DATETIME2 DEFAULT GETDATE()
          )
          PRINT 'Repair_Ticket_History 表创建成功'
          
          -- 创建索引
          CREATE INDEX IX_Repair_Ticket_History_TicketID ON Repair_Ticket_History(TicketID)
          CREATE INDEX IX_Repair_Ticket_History_ActionType ON Repair_Ticket_History(ActionType)
        END
        ELSE
        BEGIN
          PRINT 'Repair_Ticket_History 表已存在'
        END
      `)
      console.log('✅ Repair_Ticket_History 表创建成功')
    } catch (error: any) {
      console.error('❌ Repair_Ticket_History 表创建失败:', error.message)
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ 表结构恢复完成！')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    
    console.log('\n📋 恢复的表：')
    console.log('  ✅ Users - 用户表')
    console.log('  ✅ Device_Inventory - 设备库存表')
    console.log('  ✅ Product_Catalog - 产品目录表')
    console.log('  ✅ Repair_Ticket_History - 维修历史表')
    
    console.log('\n⚠️  注意：')
    console.log('  - 表结构已恢复，但数据为空')
    console.log('  - 需要重新导入数据或创建测试数据')
    
    console.log('\n📝 下一步操作：')
    console.log('  1. 创建测试用户: npm run create-test-users')
    console.log('  2. 导入设备数据: npm run import-excel (如果有Excel文件)')
    console.log('  3. 或手动添加数据')

  } catch (error: any) {
    console.error('❌ 恢复失败:', error)
    console.error('错误详情:', error.message)
    process.exit(1)
  }
}

restoreTableStructures()
  .then(() => {
    console.log('\n脚本执行完成')
    process.exit(0)
  })
  .catch((error) => {
    console.error('脚本执行失败:', error)
    process.exit(1)
  })
